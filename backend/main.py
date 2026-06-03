import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text, inspect
from database import engine, Base
import models
from routers import auth, equipment, kits, loans, orders, users, activity, notifications, reports, exports

# Create all tables
Base.metadata.create_all(bind=engine)


def _run_migrations():
    """תוספות עמודות בטוחות לטבלאות קיימות (SQLite ALTER TABLE).
    מריץ רק אם העמודה לא קיימת. שינוי לא הרסני."""
    inspector = inspect(engine)
    if 'equipment' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('equipment')}
        with engine.begin() as conn:
            if 'image_url' not in cols:
                conn.execute(text("ALTER TABLE equipment ADD COLUMN image_url VARCHAR"))
                print("[migration] Added equipment.image_url")
            if 'min_year' not in cols:
                conn.execute(text("ALTER TABLE equipment ADD COLUMN min_year INTEGER DEFAULT 1"))
                print("[migration] Added equipment.min_year")
            if 'max_year' not in cols:
                conn.execute(text("ALTER TABLE equipment ADD COLUMN max_year INTEGER DEFAULT 4"))
                print("[migration] Added equipment.max_year")

    if 'orders' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('orders')}
        with engine.begin() as conn:
            if 'production_name' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN production_name VARCHAR"))
                print("[migration] Added orders.production_name")
            if 'crew' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN crew TEXT"))
                print("[migration] Added orders.crew")

    if 'loan_requests' in inspector.get_table_names():
        cols_info = inspector.get_columns('loan_requests')
        cols = {c['name'] for c in cols_info}
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

        # SQLite לא תומך ב-ALTER COLUMN. אם kit_id עוד מוגדר NOT NULL — בונים מחדש את הטבלה.
        kit_col = next((c for c in cols_info if c['name'] == 'kit_id'), None)
        if kit_col and not kit_col.get('nullable', True):
            print("[migration] Rebuilding loan_requests to make kit_id nullable...")
            with engine.begin() as conn:
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                conn.execute(text("""
                    CREATE TABLE loan_requests_new (
                        id INTEGER PRIMARY KEY,
                        student_id INTEGER NOT NULL REFERENCES users(id),
                        kit_id INTEGER REFERENCES kits(id),
                        equipment_id INTEGER REFERENCES equipment(id),
                        quantity INTEGER DEFAULT 1,
                        batch_id VARCHAR,
                        status VARCHAR DEFAULT 'pending',
                        requested_at DATETIME,
                        loan_date DATETIME,
                        due_date DATETIME,
                        return_date DATETIME,
                        notes TEXT,
                        manager_notes TEXT,
                        approved_by INTEGER REFERENCES users(id),
                        preferred_date DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO loan_requests_new
                    (id, student_id, kit_id, equipment_id, quantity, batch_id,
                     status, requested_at, loan_date, due_date, return_date,
                     notes, manager_notes, approved_by, preferred_date)
                    SELECT id, student_id, kit_id, equipment_id, quantity, batch_id,
                           status, requested_at, loan_date, due_date, return_date,
                           notes, manager_notes, approved_by, preferred_date
                    FROM loan_requests
                """))
                conn.execute(text("DROP TABLE loan_requests"))
                conn.execute(text("ALTER TABLE loan_requests_new RENAME TO loan_requests"))
                conn.execute(text("PRAGMA foreign_keys=ON"))
            print("[migration] loan_requests rebuilt — kit_id now nullable")


try:
    _run_migrations()
except Exception as _e:
    # Migrations are best-effort; never block app startup
    print(f"[migration] warning: {_e}")


def _migrate_loans_to_orders():
    """מיגרציה חד-פעמית של נתוני loan_requests הישנים למודל החדש (orders + order_items).
    רץ רק אם orders ריק ויש נתונים ב-loan_requests.
    מקבץ לפי batch_id (אם קיים) — כל batch_id → הזמנה אחת."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(models.Order).count() > 0:
            return  # כבר מיגרציה רצה
        loans = db.query(models.LoanRequest).all()
        if not loans:
            return

        groups: dict = {}
        singletons: list = []
        for ln in loans:
            if ln.batch_id:
                groups.setdefault(ln.batch_id, []).append(ln)
            else:
                singletons.append(ln)

        # מיפוי סטטוס LoanRequest → Order
        status_map = {
            "pending": "pending",
            "approved": "active",
            "active": "active",
            "returned": "closed",
            "rejected": "rejected",
            "cancelled": "cancelled",
        }

        def _build_order(ln_list):
            primary = ln_list[0]
            order_status = status_map.get(primary.status, "pending")
            order = models.Order(
                student_id=primary.student_id,
                status=order_status,
                requested_at=primary.requested_at,
                preferred_date=primary.preferred_date,
                loan_date=primary.loan_date,
                due_date=primary.due_date,
                closed_at=primary.return_date if order_status == "closed" else None,
                notes=primary.notes,
                manager_notes=primary.manager_notes,
                approved_by=primary.approved_by,
                last_modified_at=primary.requested_at or datetime.utcnow(),
            )
            db.add(order)
            db.flush()
            for ln in ln_list:
                oi = models.OrderItem(
                    order_id=order.id,
                    kit_id=ln.kit_id,
                    equipment_id=ln.equipment_id,
                    quantity=ln.quantity or 1,
                    returned_at=ln.return_date,
                    added_by=ln.student_id,
                    added_at=ln.requested_at or datetime.utcnow(),
                )
                db.add(oi)
            return order

        for batch_loans in groups.values():
            _build_order(batch_loans)
        for ln in singletons:
            _build_order([ln])

        db.commit()
        print(f"[migration] migrated {len(loans)} loan_requests into {len(groups) + len(singletons)} orders")
    except Exception as e:
        print(f"[migration] migrate-loans error: {e}")
        db.rollback()
    finally:
        db.close()


try:
    _migrate_loans_to_orders()
except Exception as _e:
    print(f"[migration] loans→orders warning: {_e}")


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
app.include_router(orders.router)
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

    # Headers שמונעים cache ל-index.html. הקבצים ב-assets/ עם hash בשם, אז הם בטוחים לקאש.
    _NO_CACHE_HEADERS = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    @app.get("/")
    def _serve_root():
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"), headers=_NO_CACHE_HEADERS)

    # SPA fallback — כל route שלא תפס API מוחזר ל-index.html (React Router).
    # חשוב: זה רץ אחרי כל ה-include_router, אז API קודם.
    @app.get("/{full_path:path}")
    def _spa_fallback(full_path: str):
        # אם זה קובץ שקיים פיזית ב-dist (favicon, robots.txt וכו') — תגיש אותו
        candidate = os.path.join(_FRONTEND_DIST, full_path)
        if os.path.isfile(candidate):
            # ל-index.html ובאפיון .html כללי לא מקאשים. השאר בקאש קצר.
            if candidate.endswith(".html"):
                return FileResponse(candidate, headers=_NO_CACHE_HEADERS)
            return FileResponse(candidate)
        # אחרת — index.html כדי ש-React Router יטפל
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"), headers=_NO_CACHE_HEADERS)
else:
    @app.get("/")
    def _root_no_frontend():
        return {"message": "מחסן מעלה - מערכת ניהול השאלות", "version": "1.0.0",
                "note": "frontend/dist not found — run `npm run build` in frontend/"}
