from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, timedelta
from database import get_db
from auth import require_admin
import models

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/overview")
def get_overview(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """דוח אנליטיקס כללי לתצוגה בלוח הבקרה."""

    # Most requested kits
    most_requested = db.query(
        models.Kit.id,
        models.Kit.name,
        func.count(models.LoanRequest.id).label("count"),
    ).join(
        models.LoanRequest, models.LoanRequest.kit_id == models.Kit.id
    ).group_by(models.Kit.id).order_by(func.count(models.LoanRequest.id).desc()).limit(5).all()

    # Most active students
    most_active = db.query(
        models.User.id,
        models.User.name,
        func.count(models.LoanRequest.id).label("count"),
    ).join(
        models.LoanRequest, models.LoanRequest.student_id == models.User.id
    ).filter(models.User.role == "student").group_by(
        models.User.id
    ).order_by(func.count(models.LoanRequest.id).desc()).limit(5).all()

    # Loans by category
    by_category = db.query(
        models.Kit.category,
        func.count(models.LoanRequest.id).label("count"),
    ).join(
        models.LoanRequest, models.LoanRequest.kit_id == models.Kit.id
    ).group_by(models.Kit.category).all()

    # On-time return rate (returned vs returned-late)
    # We treat as late if return_date > due_date
    returned = db.query(models.LoanRequest).filter(
        models.LoanRequest.status == "returned",
        models.LoanRequest.return_date != None,
        models.LoanRequest.due_date != None,
    ).all()
    total_returned = len(returned)
    on_time = sum(1 for l in returned if l.return_date <= l.due_date)
    on_time_rate = (on_time / total_returned * 100) if total_returned else None

    # Loans in last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_count = db.query(models.LoanRequest).filter(
        models.LoanRequest.requested_at >= thirty_days_ago
    ).count()

    return {
        "most_requested_kits": [
            {"id": r[0], "name": r[1], "count": r[2]} for r in most_requested
        ],
        "most_active_students": [
            {"id": r[0], "name": r[1], "count": r[2]} for r in most_active
        ],
        "loans_by_category": [
            {"category": r[0], "count": r[1]} for r in by_category
        ],
        "on_time_return_rate": on_time_rate,  # percent or null
        "total_returned": total_returned,
        "on_time_returned": on_time,
        "loans_last_30_days": recent_count,
    }
