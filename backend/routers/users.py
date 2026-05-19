from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from database import get_db
from auth import get_current_user, require_admin, get_password_hash
import models
import schemas

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    total_equipment = db.query(models.Equipment).filter(models.Equipment.active == True).count()
    active_kits = db.query(models.Kit).filter(models.Kit.active == True).count()
    open_loans = db.query(models.LoanRequest).filter(
        models.LoanRequest.status.in_(["pending", "active"])
    ).count()
    pending_requests = db.query(models.LoanRequest).filter(
        models.LoanRequest.status == "pending"
    ).count()
    now = datetime.utcnow()
    overdue_loans = db.query(models.LoanRequest).filter(
        models.LoanRequest.status == "active",
        models.LoanRequest.due_date != None,
        models.LoanRequest.due_date < now
    ).count()

    return {
        "total_equipment": total_equipment,
        "active_kits": active_kits,
        "open_loans": open_loans,
        "pending_requests": pending_requests,
        "overdue_loans": overdue_loans
    }


@router.get("", response_model=List[schemas.UserOut])
def get_users(
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    query = db.query(models.User)
    if role:
        query = query.filter(models.User.role == role)
    return query.order_by(models.User.name).all()


@router.post("", response_model=schemas.UserOut)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="אימייל זה כבר קיים במערכת")

    hashed_password = get_password_hash(user.password)
    user_data = user.model_dump(exclude={"password"})
    db_user = models.User(**user_data, password_hash=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    user: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    update_data = user.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))

    for key, value in update_data.items():
        setattr(db_user, key, value)

    db.commit()
    db.refresh(db_user)
    return db_user


@router.get("/{user_id}/loans")
def get_user_loans(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    active_loans = db.query(models.LoanRequest).filter(
        models.LoanRequest.student_id == user_id,
        models.LoanRequest.status.in_(["active", "pending"])
    ).count()
    return {"active_loans": active_loans}
