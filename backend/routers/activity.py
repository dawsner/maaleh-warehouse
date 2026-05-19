from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from database import get_db
from auth import require_admin
import models

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("")
def get_activity(
    limit: int = Query(50, ge=1, le=200),
    entity_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """החזרת לוג הפעולות האחרונות (לאדמינים בלבד)."""
    query = db.query(models.ActivityLog).options(joinedload(models.ActivityLog.user))
    if entity_type:
        query = query.filter(models.ActivityLog.entity_type == entity_type)
    logs = query.order_by(models.ActivityLog.created_at.desc()).limit(limit).all()

    return [
        {
            "id": l.id,
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "description": l.description,
            "created_at": l.created_at,
            "user": {"id": l.user.id, "name": l.user.name} if l.user else None,
        }
        for l in logs
    ]
