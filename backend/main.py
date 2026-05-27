import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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

    if 'loan_requests' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('loan_requests')}
        with engine.begin() as conn:
            if 'equipment_id' not in cols:
                conn.execute(text("ALTER TABLE loan_requests ADD COLUMN equipment_id INTEGER REFERENCES equipment(id)"))
                print("[migration] Added loan_requests.equipment_id")
            if 'quantity' not in cols:
                conn.execute(text("ALTER TABLE loan_requests ADD COLUMN quantity INTEGER DEFAULT 1"))
                print("[migration] Added loan_requests.quantity")
            if 'batch_id' not in cols:
                conn.execute(text("ALTER TABLE loan_requests ADD COLUMN batch_id VARCHAR"))
                print("[migration] Added loan_requests.batch_id")


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


@app.get("/health")
def health():
    return {"status": "ok"}


# ---- Serve built React frontend (single-service deploy) ---------------------
# כשמריצים backend+frontend כשירות יחיד (Railway/Render/VPS), FastAPI מגיש את
# קבצי React שנבנו (frontend/dist). אם התקיה לא קיימת — פשוט נדלג בלי לקרוס.
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
_FRONTEND_DIST = os.path.abspath(_FRONTEND_DIST)

if os.path.isdir(_FRONTEND_DIST):
    # Static assets (JS, CSS, images) under /assets/*
    _assets_dir = os.path.join(_FRONTEND_DIST, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/")
    def _serve_root():
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))

    # SPA fallback — כל route שלא תפס API מוחזר ל-index.html (React Router).
    # חשוב: זה רץ אחרי כל ה-include_router, אז API קודם.
    @app.get("/{full_path:path}")
    def _spa_fallback(full_path: str):
        # אם זה קובץ שקיים פיזית ב-dist (favicon, robots.txt וכו') — תגיש אותו
        candidate = os.path.join(_FRONTEND_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        # אחרת — index.html כדי ש-React Router יטפל
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    def _root_no_frontend():
        return {"message": "מחסן מעלה - מערכת ניהול השאלות", "version": "1.0.0",
                "note": "frontend/dist not found — run `npm run build` in frontend/"}
