"""פונקציות עזר לרישום פעולות והתראות.
לא תלויות באף router — אפשר להזמין מכל מקום."""
from typing import Optional
from sqlalchemy.orm import Session
import models


def log_activity(
    db: Session,
    user_id: Optional[int],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    description: Optional[str] = None,
) -> None:
    """רושם פעולה בלוג הפעילות. לא מבצע commit — קוראים אחראים."""
    entry = models.ActivityLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
    )
    db.add(entry)


def notify(
    db: Session,
    user_id: int,
    type_: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
) -> None:
    """שולח התראה למשתמש. לא מבצע commit — קוראים אחראים."""
    n = models.Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        link=link,
    )
    db.add(n)
