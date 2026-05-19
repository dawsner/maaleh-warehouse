import os
import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from database import get_db
from auth import verify_password, create_access_token, get_current_user
import models
import schemas

router = APIRouter(prefix="/auth", tags=["auth"])

# ----- In-memory rate limiter (per-IP) ---------------------------------
# מתאים לשרת יחיד עם מספר workers נמוך. למספר שרתים יש לעבור ל-Redis.
_RATE_LIMIT = int(os.environ.get("LOGIN_RATE_LIMIT", "5"))   # ניסיונות
_RATE_WINDOW = 60                                            # שניות
_login_attempts: dict = defaultdict(deque)
_lock = Lock()


def _check_login_rate_limit(ip: str) -> None:
    now = time.time()
    cutoff = now - _RATE_WINDOW
    with _lock:
        q = _login_attempts[ip]
        # remove old entries
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= _RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"יותר מדי ניסיונות התחברות. נסה שוב בעוד דקה."
            )
        q.append(now)


def _record_failed_login(ip: str) -> None:
    """אחרי הצלחה נוודא שלא ננעלים בהתחברות לגיטימית."""
    with _lock:
        # אפשרי לדלל את התור אחרי הצלחה, אבל מספיק שעוצרים את הקצב
        pass


@router.post("/login", response_model=schemas.Token)
def login(
    request: schemas.LoginRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    # Rate limit per IP
    ip = http_request.client.host if http_request.client else "unknown"
    # X-Forwarded-For הוא הכותרת שמגיעה מ-nginx, בודק את הראשון
    fwd = http_request.headers.get("x-forwarded-for")
    if fwd:
        ip = fwd.split(",")[0].strip()
    _check_login_rate_limit(ip)

    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="אימייל או סיסמה שגויים"
        )
    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="החשבון אינו פעיל"
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "year": user.year,
            "student_id": user.student_id,
            "phone": user.phone,
        }
    }


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "year": current_user.year,
        "student_id": current_user.student_id,
        "phone": current_user.phone,
    }
