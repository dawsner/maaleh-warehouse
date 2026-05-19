import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from database import engine, Base
import models
from routers import auth, equipment, kits, loans, users, activity, notifications, reports, exports

# Create all tables
Base.metadata.create_all(bind=engine)


def _run_migrations():
    """תוספות עמודות בטוחות לטבלאות קיימות (SQLite ALTER TABLE).
    מריץ רק אם העמודה לא קיימת. שינוי לא הרסני."""
    inspector = inspect(engine)
    if 'equipment' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('equipment')}
        if 'image_url' not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE equipment ADD COLUMN image_url VARCHAR"))
            print("[migration] Added equipment.image_url")


try:
    _run_migrations()
except Exception as _e:
    # Migrations are best-effort; never block app startup
    print(f"[migration] warning: {_e}")


def _seed_if_empty():
    """אם ה-DB ריק לחלוטין (אין משתמשים) — מריץ את ה-seed.
    שימושי בעיקר ב-deploy ראשון (Render / VPS), כדי שלא תהיה דרישה ידנית."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            print("[seed] DB ריק — מריץ seed ראשוני...")
            import subprocess
            import os
            seed_path = os.path.join(os.path.dirname(__file__), "seed.py")
            if os.path.exists(seed_path):
                result = subprocess.run(
                    ["python3", seed_path],
                    capture_output=True, text=True, cwd=os.path.dirname(__file__)
                )
                if result.returncode == 0:
                    print("[seed] הושלם בהצלחה")
                else:
                    print(f"[seed] שגיאה: {result.stderr}")
    finally:
        db.close()


try:
    _seed_if_empty()
except Exception as _e:
    print(f"[seed] warning: {_e}")

app = FastAPI(
    title="מחסן מעלה - מערכת ניהול השאלות",
    description="מערכת ניהול השאלות לבית ספר לקולנוע מעלה",
    version="1.0.0"
)

# CORS — restricted to configured origins in production
_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
if _allowed_origins_env:
    _allowed_origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
else:
    # Dev defaults
    _allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(equipment.router)
app.include_router(kits.router)
app.include_router(loans.router)
app.include_router(users.router)
app.include_router(activity.router)
app.include_router(notifications.router)
app.include_router(reports.router)
app.include_router(exports.router)


@app.get("/")
def root():
    return {"message": "מחסן מעלה - מערכת ניהול השאלות", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
