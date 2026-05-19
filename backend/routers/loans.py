from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from datetime import datetime
from database import get_db
from auth import get_current_user, require_admin
from services import log_activity, notify
import models
import schemas

router = APIRouter(prefix="/loans", tags=["loans"])


def _enrich_overdue(loan: models.LoanRequest) -> schemas.LoanOut:
    """Compute is_overdue + days_overdue for a loan."""
    data = schemas.LoanOut.model_validate(loan, from_attributes=True)
    if loan.status == "active" and loan.due_date:
        now = datetime.utcnow()
        if now > loan.due_date:
            delta = now - loan.due_date
            data.is_overdue = True
            data.days_overdue = max(1, delta.days + (1 if delta.seconds > 0 else 0))
    return data


@router.get("", response_model=List[schemas.LoanOut])
def get_loans(
    status: Optional[str] = Query(None),
    student_id: Optional[int] = Query(None),
    overdue: Optional[bool] = Query(None, description="סינון: רק השאלות באיחור"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    )

    if current_user.role == "student":
        query = query.filter(models.LoanRequest.student_id == current_user.id)
    elif student_id:
        query = query.filter(models.LoanRequest.student_id == student_id)

    if status:
        statuses = status.split(",")
        query = query.filter(models.LoanRequest.status.in_(statuses))

    loans = query.order_by(models.LoanRequest.requested_at.desc()).all()
    enriched = [_enrich_overdue(l) for l in loans]

    if overdue is True:
        enriched = [l for l in enriched if l.is_overdue]
    elif overdue is False:
        enriched = [l for l in enriched if not l.is_overdue]

    return enriched


@router.post("", response_model=schemas.LoanOut)
def create_loan_request(
    loan: schemas.LoanRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="רק סטודנטים יכולים ליצור בקשות השאלה")

    kit = db.query(models.Kit).filter(models.Kit.id == loan.kit_id, models.Kit.active == True).first()
    if not kit:
        raise HTTPException(status_code=404, detail="ערכה לא נמצאה")

    # Check year eligibility
    if current_user.year:
        if current_user.year < kit.min_year or current_user.year > kit.max_year:
            raise HTTPException(
                status_code=400,
                detail=f"ערכה זו זמינה לשנים {kit.min_year}-{kit.max_year} בלבד"
            )

    # Check for existing active request for same kit
    existing = db.query(models.LoanRequest).filter(
        models.LoanRequest.student_id == current_user.id,
        models.LoanRequest.kit_id == loan.kit_id,
        models.LoanRequest.status.in_(["pending", "approved", "active"])
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="יש לך כבר בקשה פעילה עבור ערכה זו")

    db_loan = models.LoanRequest(
        student_id=current_user.id,
        kit_id=loan.kit_id,
        notes=loan.notes,
        preferred_date=loan.preferred_date,
        status="pending"
    )
    db.add(db_loan)
    db.flush()

    # Activity log + notify all admins
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.requested",
        entity_type="loan",
        entity_id=db_loan.id,
        description=f"{current_user.name} ביקש את הערכה '{kit.name}'",
    )
    admins = db.query(models.User).filter(models.User.role == "admin", models.User.active == True).all()
    for admin in admins:
        notify(
            db,
            user_id=admin.id,
            type_="new_request",
            title="בקשת השאלה חדשה",
            body=f"{current_user.name} ביקש את '{kit.name}'",
            link="/manager/loans",
        )

    db.commit()
    db.refresh(db_loan)

    return db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.LoanRequest.id == db_loan.id).first()


@router.put("/{loan_id}/approve", response_model=schemas.LoanOut)
def approve_loan(
    loan_id: int,
    approval: schemas.LoanApprove,
    force: bool = Query(False, description="אישור גם אם אין מספיק מלאי"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    loan = db.query(models.LoanRequest).filter(models.LoanRequest.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="בקשת השאלה לא נמצאה")
    if loan.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לאשר רק בקשות ממתינות")

    # בדיקת זמינות בטווח התאריכים המבוקש
    if not force:
        from routers.kits import calculate_kit_availability
        available = calculate_kit_availability(
            loan.kit_id, db,
            at_date=approval.loan_date,
            until_date=approval.due_date,
            exclude_loan_id=loan.id,  # אם זו אישור מחדש שלה
        )
        if available < 1:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "אין מספיק ערכות זמינות בטווח התאריכים המבוקש",
                    "available": available,
                    "code": "insufficient_stock",
                    "hint": "ניתן לאשר בכל זאת על-ידי שימוש בפרמטר force=true"
                }
            )

    loan.status = "active"
    loan.loan_date = approval.loan_date
    loan.due_date = approval.due_date
    loan.manager_notes = approval.manager_notes
    loan.approved_by = current_user.id

    kit_name = loan.kit.name if loan.kit else "ערכה"
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.approved",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} אישר השאלה של '{kit_name}' לסטודנט",
    )
    notify(
        db,
        user_id=loan.student_id,
        type_="loan_approved",
        title="בקשת ההשאלה אושרה ✓",
        body=f"הבקשה שלך ל-'{kit_name}' אושרה",
        link="/student/loans",
    )

    db.commit()
    db.refresh(loan)

    return db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.LoanRequest.id == loan_id).first()


@router.put("/{loan_id}/reject", response_model=schemas.LoanOut)
def reject_loan(
    loan_id: int,
    rejection: schemas.LoanReject,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    loan = db.query(models.LoanRequest).filter(models.LoanRequest.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="בקשת השאלה לא נמצאה")
    if loan.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לדחות רק בקשות ממתינות")

    loan.status = "rejected"
    loan.manager_notes = rejection.manager_notes
    loan.approved_by = current_user.id

    kit_name = loan.kit.name if loan.kit else "ערכה"
    reason = rejection.manager_notes or ""
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.rejected",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} דחה בקשה של '{kit_name}'" + (f" — {reason}" if reason else ""),
    )
    notify(
        db,
        user_id=loan.student_id,
        type_="loan_rejected",
        title="בקשת ההשאלה נדחתה",
        body=f"הבקשה ל-'{kit_name}'" + (f": {reason}" if reason else ""),
        link="/student/loans",
    )

    db.commit()
    db.refresh(loan)

    return db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.LoanRequest.id == loan_id).first()


@router.put("/{loan_id}/return", response_model=schemas.LoanOut)
def return_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    loan = db.query(models.LoanRequest).filter(models.LoanRequest.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="בקשת השאלה לא נמצאה")
    if loan.status != "active":
        raise HTTPException(status_code=400, detail="ניתן להחזיר רק השאלות פעילות")

    loan.status = "returned"
    loan.return_date = datetime.utcnow()

    kit_name = loan.kit.name if loan.kit else "ערכה"
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.returned",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} סימן החזרה של '{kit_name}'",
    )
    notify(
        db,
        user_id=loan.student_id,
        type_="loan_returned",
        title="ההשאלה הוחזרה",
        body=f"השאלת '{kit_name}' סומנה כהוחזרה",
        link="/student/loans",
    )

    db.commit()
    db.refresh(loan)

    return db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.LoanRequest.id == loan_id).first()


@router.put("/{loan_id}/cancel", response_model=schemas.LoanOut)
def cancel_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    loan = db.query(models.LoanRequest).filter(models.LoanRequest.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="בקשת השאלה לא נמצאה")
    if current_user.role == "student" and loan.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="אין לך הרשאה לבטל בקשה זו")
    if loan.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לבטל רק בקשות ממתינות")

    loan.status = "cancelled"

    kit_name = loan.kit.name if loan.kit else "ערכה"
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.cancelled",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} ביטל בקשה של '{kit_name}'",
    )

    db.commit()
    db.refresh(loan)

    return db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.LoanRequest.id == loan_id).first()
