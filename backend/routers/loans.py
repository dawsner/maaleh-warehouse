import uuid
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


def _loan_target_name(loan: models.LoanRequest) -> str:
    """שם תצוגה ל-loan — לערכה או לפריט בודד."""
    if loan.kit:
        return loan.kit.name
    if loan.equipment:
        qty = loan.quantity or 1
        return f"{loan.equipment.name}{f' x{qty}' if qty > 1 else ''}"
    return "פריט"


def _loans_query_with_relations(db: Session):
    return db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment),
        joinedload(models.LoanRequest.equipment),
    )


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
    query = _loans_query_with_relations(db)

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


def _create_single_loan(
    db: Session,
    student: models.User,
    item: schemas.LoanBatchItem,
    notes: Optional[str],
    preferred_date: Optional[datetime],
    batch_id: Optional[str],
) -> models.LoanRequest:
    """יוצר LoanRequest בודד — או על ערכה או על פריט. מעלה HTTPException על שגיאה."""
    if (item.kit_id is None) == (item.equipment_id is None):
        raise HTTPException(status_code=400, detail="כל פריט בהזמנה חייב להיות או ערכה או פריט בודד (לא שניהם ולא אף אחד)")

    kit_target = None
    equipment_target = None

    if item.kit_id is not None:
        kit_target = db.query(models.Kit).filter(models.Kit.id == item.kit_id, models.Kit.active == True).first()
        if not kit_target:
            raise HTTPException(status_code=404, detail=f"ערכה {item.kit_id} לא נמצאה")
        if student.year:
            if student.year < kit_target.min_year or student.year > kit_target.max_year:
                raise HTTPException(
                    status_code=400,
                    detail=f"הערכה '{kit_target.name}' זמינה לשנים {kit_target.min_year}-{kit_target.max_year} בלבד"
                )
    else:
        equipment_target = db.query(models.Equipment).filter(
            models.Equipment.id == item.equipment_id,
            models.Equipment.active == True
        ).first()
        if not equipment_target:
            raise HTTPException(status_code=404, detail=f"פריט {item.equipment_id} לא נמצא")

    qty = max(1, int(item.quantity or 1))

    db_loan = models.LoanRequest(
        student_id=student.id,
        kit_id=item.kit_id,
        equipment_id=item.equipment_id,
        quantity=qty,
        batch_id=batch_id,
        notes=notes,
        preferred_date=preferred_date,
        status="pending"
    )
    db.add(db_loan)
    db.flush()

    target_name = kit_target.name if kit_target else f"{equipment_target.name} x{qty}" if qty > 1 else equipment_target.name
    log_activity(
        db,
        user_id=student.id,
        action="loan.requested",
        entity_type="loan",
        entity_id=db_loan.id,
        description=f"{student.name} ביקש את '{target_name}'",
    )
    return db_loan


@router.post("", response_model=schemas.LoanOut)
def create_loan_request(
    loan: schemas.LoanRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """תאימות אחורה — יצירת בקשה לפריט יחיד (ערכה או ציוד)."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="רק סטודנטים יכולים ליצור בקשות השאלה")

    item = schemas.LoanBatchItem(
        kit_id=loan.kit_id,
        equipment_id=loan.equipment_id,
        quantity=loan.quantity,
    )
    db_loan = _create_single_loan(db, current_user, item, loan.notes, loan.preferred_date, batch_id=None)

    # Notify admins
    target_name = db_loan.kit.name if db_loan.kit else (db_loan.equipment.name if db_loan.equipment else "פריט")
    admins = db.query(models.User).filter(models.User.role == "admin", models.User.active == True).all()
    for admin in admins:
        notify(
            db,
            user_id=admin.id,
            type_="new_request",
            title="בקשת השאלה חדשה",
            body=f"{current_user.name} ביקש את '{target_name}'",
            link="/manager/loans",
        )

    db.commit()
    db.refresh(db_loan)

    return _loans_query_with_relations(db).filter(models.LoanRequest.id == db_loan.id).first()


@router.post("/batch", response_model=List[schemas.LoanOut])
def create_loan_batch(
    batch: schemas.LoanBatchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """יצירת מספר בקשות יחד מעגלת קניות — ערכות+פריטים בודדים בבקשה אחת."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="רק סטודנטים יכולים ליצור בקשות השאלה")
    if not batch.items:
        raise HTTPException(status_code=400, detail="ההזמנה ריקה")

    batch_id = uuid.uuid4().hex[:12]
    created_loans = []
    target_names = []

    for item in batch.items:
        db_loan = _create_single_loan(
            db, current_user, item,
            notes=batch.notes,
            preferred_date=batch.preferred_date,
            batch_id=batch_id,
        )
        created_loans.append(db_loan)
        if db_loan.kit:
            target_names.append(db_loan.kit.name)
        elif db_loan.equipment:
            qty = db_loan.quantity or 1
            target_names.append(f"{db_loan.equipment.name}{f' x{qty}' if qty > 1 else ''}")

    # התראה אחת מסכמת למנהלים
    summary = " · ".join(target_names) if len(target_names) <= 4 else f"{len(target_names)} פריטים"
    admins = db.query(models.User).filter(models.User.role == "admin", models.User.active == True).all()
    for admin in admins:
        notify(
            db,
            user_id=admin.id,
            type_="new_request",
            title=f"בקשת השאלה חדשה ({len(created_loans)} פריטים)",
            body=f"{current_user.name}: {summary}",
            link="/manager/loans",
        )

    db.commit()

    ids = [l.id for l in created_loans]
    return _loans_query_with_relations(db).filter(models.LoanRequest.id.in_(ids)).all()


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

    # בדיקת זמינות בטווח התאריכים המבוקש (רק לערכות; לפריט בודד נדלג בינתיים)
    if not force and loan.kit_id:
        from routers.kits import calculate_kit_availability
        available = calculate_kit_availability(
            loan.kit_id, db,
            at_date=approval.loan_date,
            until_date=approval.due_date,
            exclude_loan_id=loan.id,
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

    target_name = _loan_target_name(loan)
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.approved",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} אישר השאלה של '{target_name}' לסטודנט",
    )
    notify(
        db,
        user_id=loan.student_id,
        type_="loan_approved",
        title="בקשת ההשאלה אושרה ✓",
        body=f"הבקשה שלך ל-'{target_name}' אושרה",
        link="/student/loans",
    )

    db.commit()
    db.refresh(loan)

    return _loans_query_with_relations(db).filter(models.LoanRequest.id == loan_id).first()


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

    target_name = _loan_target_name(loan)
    reason = rejection.manager_notes or ""
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.rejected",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} דחה בקשה של '{target_name}'" + (f" — {reason}" if reason else ""),
    )
    notify(
        db,
        user_id=loan.student_id,
        type_="loan_rejected",
        title="בקשת ההשאלה נדחתה",
        body=f"הבקשה ל-'{target_name}'" + (f": {reason}" if reason else ""),
        link="/student/loans",
    )

    db.commit()
    db.refresh(loan)

    return _loans_query_with_relations(db).filter(models.LoanRequest.id == loan_id).first()


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

    target_name = _loan_target_name(loan)
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.returned",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} סימן החזרה של '{target_name}'",
    )
    notify(
        db,
        user_id=loan.student_id,
        type_="loan_returned",
        title="ההשאלה הוחזרה",
        body=f"השאלת '{target_name}' סומנה כהוחזרה",
        link="/student/loans",
    )

    db.commit()
    db.refresh(loan)

    return _loans_query_with_relations(db).filter(models.LoanRequest.id == loan_id).first()


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

    target_name = _loan_target_name(loan)
    log_activity(
        db,
        user_id=current_user.id,
        action="loan.cancelled",
        entity_type="loan",
        entity_id=loan.id,
        description=f"{current_user.name} ביטל בקשה של '{target_name}'",
    )

    db.commit()
    db.refresh(loan)

    return _loans_query_with_relations(db).filter(models.LoanRequest.id == loan_id).first()
