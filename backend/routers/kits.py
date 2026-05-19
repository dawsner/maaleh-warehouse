from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from database import get_db
from auth import get_current_user, require_admin
import models
import schemas

router = APIRouter(prefix="/kits", tags=["kits"])


def _loan_blocks_at(loan: models.LoanRequest, at: datetime) -> bool:
    """האם הלוואה תופסת מלאי בנקודה מסוימת בזמן?"""
    if loan.status != "active":
        return False
    # אם יש loan_date והוא בעתיד - לא תופס מלאי עדיין
    if loan.loan_date and loan.loan_date > at:
        return False
    # אם כבר הוחזר ההיא לא תופסת
    if loan.return_date and loan.return_date <= at:
        return False
    # אם עבר due_date והוא לא הוחזר - עדיין תופס (באיחור)
    return True


def _loan_blocks_range(loan: models.LoanRequest, start: datetime, end: datetime) -> bool:
    """האם הלוואה חופפת לטווח [start, end]?"""
    if loan.status != "active":
        return False
    # תקופת ההלוואה היא [loan_date, return_date OR due_date]
    loan_start = loan.loan_date or datetime.utcnow()
    loan_end = loan.return_date or loan.due_date or datetime.max
    # חופף אם start <= loan_end ו-end >= loan_start
    return start <= loan_end and end >= loan_start


def calculate_kit_availability(
    kit_id: int,
    db: Session,
    at_date: Optional[datetime] = None,
    until_date: Optional[datetime] = None,
    exclude_loan_id: Optional[int] = None,
) -> int:
    """מחשב כמה ערכות זמינות בנקודת זמן או בטווח תאריכים.
    - אם at_date=None: עכשיו.
    - אם until_date מוגדר: בודק את הטווח [at_date, until_date] (לא רק נקודה).
    - exclude_loan_id: לא לסופר הלוואה ספציפית (למשל בעת אישור-עצמי שלה).
    """
    kit = db.query(models.Kit).filter(models.Kit.id == kit_id).first()
    if not kit or not kit.active:
        return 0

    at_date = at_date or datetime.utcnow()
    is_range = until_date is not None

    min_available = None
    for item in kit.items:
        equipment = item.equipment
        if not equipment or not equipment.active:
            return 0

        # מצא את כל ההלוואות הפעילות שמכילות את הציוד הזה
        candidate_loans = db.query(models.LoanRequest).join(
            models.Kit, models.LoanRequest.kit_id == models.Kit.id
        ).join(
            models.KitItem, models.KitItem.kit_id == models.Kit.id
        ).filter(
            models.LoanRequest.status == "active",
            models.KitItem.equipment_id == equipment.id,
        )
        if exclude_loan_id is not None:
            candidate_loans = candidate_loans.filter(models.LoanRequest.id != exclude_loan_id)
        candidate_loans = candidate_loans.all()

        # סינון לפי זמן
        blocking_count = 0
        for loan in candidate_loans:
            if is_range:
                if _loan_blocks_range(loan, at_date, until_date):
                    kit_item = next(
                        (ki for ki in loan.kit.items if ki.equipment_id == equipment.id),
                        None
                    ) if loan.kit else None
                    if kit_item:
                        blocking_count += kit_item.quantity_needed
            else:
                if _loan_blocks_at(loan, at_date):
                    kit_item = next(
                        (ki for ki in loan.kit.items if ki.equipment_id == equipment.id),
                        None
                    ) if loan.kit else None
                    if kit_item:
                        blocking_count += kit_item.quantity_needed

        available = equipment.quantity - blocking_count
        slots = available // item.quantity_needed if item.quantity_needed > 0 else 0

        if min_available is None or slots < min_available:
            min_available = slots

    return max(0, min_available) if min_available is not None else 0


@router.get("", response_model=List[schemas.KitOut])
def get_kits(
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Kit).filter(models.Kit.active == True)

    # Students can only see kits within their year range
    if current_user.role == "student" and current_user.year:
        query = query.filter(
            models.Kit.min_year <= current_user.year,
            models.Kit.max_year >= current_user.year
        )
    elif year:
        query = query.filter(
            models.Kit.min_year <= year,
            models.Kit.max_year >= year
        )

    kits = query.options(
        joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).order_by(models.Kit.category, models.Kit.name).all()
    return kits


@router.get("/{kit_id}/availability", response_model=schemas.KitAvailability)
def get_kit_availability(
    kit_id: int,
    at: Optional[datetime] = Query(None, description="בדיקת זמינות בנקודת זמן (ברירת מחדל: עכשיו)"),
    until: Optional[datetime] = Query(None, description="בדיקת זמינות לטווח [at, until]"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    count = calculate_kit_availability(kit_id, db, at_date=at, until_date=until)
    return {"is_available": count > 0, "count_available": count}


@router.get("/availability/bulk")
def get_bulk_availability(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """החזרת זמינות לכל הערכות הפעילות בקריאה אחת.
    מחזיר: { kit_id: { is_available, count_available } }
    """
    kits = db.query(models.Kit).filter(models.Kit.active == True).all()
    result = {}
    for kit in kits:
        count = calculate_kit_availability(kit.id, db)
        result[kit.id] = {"is_available": count > 0, "count_available": count}
    return result


@router.get("/{kit_id}", response_model=schemas.KitOut)
def get_kit(
    kit_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    kit = db.query(models.Kit).options(
        joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.Kit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail="ערכה לא נמצאה")
    return kit


@router.post("", response_model=schemas.KitOut)
def create_kit(
    kit: schemas.KitCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    kit_data = kit.model_dump(exclude={"items"})
    db_kit = models.Kit(**kit_data)
    db.add(db_kit)
    db.flush()

    for item in kit.items:
        db_item = models.KitItem(
            kit_id=db_kit.id,
            equipment_id=item.equipment_id,
            quantity_needed=item.quantity_needed
        )
        db.add(db_item)

    db.commit()
    db.refresh(db_kit)

    kit_with_items = db.query(models.Kit).options(
        joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.Kit.id == db_kit.id).first()
    return kit_with_items


@router.put("/{kit_id}", response_model=schemas.KitOut)
def update_kit(
    kit_id: int,
    kit: schemas.KitUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    db_kit = db.query(models.Kit).filter(models.Kit.id == kit_id).first()
    if not db_kit:
        raise HTTPException(status_code=404, detail="ערכה לא נמצאה")

    update_data = kit.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in update_data.items():
        setattr(db_kit, key, value)

    if kit.items is not None:
        # Remove existing items
        db.query(models.KitItem).filter(models.KitItem.kit_id == kit_id).delete()
        # Add new items
        for item in kit.items:
            db_item = models.KitItem(
                kit_id=kit_id,
                equipment_id=item.equipment_id,
                quantity_needed=item.quantity_needed
            )
            db.add(db_item)

    db.commit()
    db.refresh(db_kit)

    kit_with_items = db.query(models.Kit).options(
        joinedload(models.Kit.items).joinedload(models.KitItem.equipment)
    ).filter(models.Kit.id == db_kit.id).first()
    return kit_with_items


@router.delete("/{kit_id}")
def deactivate_kit(
    kit_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    db_kit = db.query(models.Kit).filter(models.Kit.id == kit_id).first()
    if not db_kit:
        raise HTTPException(status_code=404, detail="ערכה לא נמצאה")

    db_kit.active = False
    db.commit()
    return {"message": "הערכה הושבתה בהצלחה"}
