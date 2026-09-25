"""Orders router — הארכיטקטורה החדשה למודל ההזמנה.
הזמנה = יחידה אחת שמכילה מספר פריטים (ערכות ו/או ציוד בודד).
ניתן לעריכה חיה ע"י סטודנט ומנהל עד שהמנהל סוגר אותה במפורש.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from datetime import datetime
from database import get_db
from auth import get_current_user, require_admin
from services import log_activity, notify
import models
import schemas

router = APIRouter(prefix="/orders", tags=["orders"])


# --- סטטוסים — מחזור החיים החדש ---
# draft        — סטודנט עורך, לא הוגש למחסן
# pending      — נשלח למחסן, בטיפול ('בטיפול')
# ready        — מוכן לאיסוף, מחכה לסטודנט
# checked_out  — סטודנט חתם ולקח את הציוד
# returned     — מחסן סימן שהציוד הוחזר (חלקי או מלא)
# closed       — סגור סופית
# cancelled / rejected — מסלולי הפסקה
ALL_STATUSES = {"draft", "pending", "ready", "checked_out", "returned", "closed", "cancelled", "rejected"}
EDITABLE_STATUSES = {"draft", "pending", "ready", "checked_out", "returned"}  # אפשר לערוך פריטים/הערות
FINAL_STATUSES = {"closed", "cancelled", "rejected"}
# חוסם מלאי בטווח התאריכים (reservations): pending+ready=full requested, checked_out+returned=issued-returned
RESERVES_FULL_STATUSES = {"pending", "ready"}
RESERVES_ISSUED_STATUSES = {"checked_out"}  # 'returned' הוסר — quantity_returned לבדו מספיק


def _parse_crew(raw):
    if not raw:
        return None
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None


def _serialize_crew(crew_list):
    if crew_list is None:
        return None
    if isinstance(crew_list, str):
        return crew_list
    return json.dumps([m.model_dump() if hasattr(m, 'model_dump') else m for m in crew_list], ensure_ascii=False)


def _overlaps(order: models.Order, start: datetime, end: datetime, now: datetime) -> bool:
    o_start = order.loan_date or order.requested_at or now
    o_end = order.due_date or o_start
    return start <= o_end and end >= o_start


def _blocked_units(it: models.OrderItem) -> int:
    """כמה יחידות שורת הזמנה תופסת לפי הסטטוס.
    - pending/ready: הכמות המבוקשת (שריון רך לתאריכים)
    - checked_out: quantity_issued (או המבוקש אם עוד לא סומן — falsy תופס None וגם 0) פחות מה שחזר
    """
    st = it.order.status
    if st in RESERVES_FULL_STATUSES:
        return it.quantity or 1
    if st in RESERVES_ISSUED_STATUSES:
        returned = it.quantity_returned or 0
        base = it.quantity_issued if it.quantity_issued else (it.quantity or 1)
        return max(0, base - returned)
    return 0


def _kit_reserved_units(equipment_id: int, db: Session) -> int:
    """כמה יחידות מהפריט שמורות לערכות פעילות (כל ערכה = ערכה פיזית אחת)."""
    rows = db.query(models.KitItem).join(models.Kit, models.KitItem.kit_id == models.Kit.id).filter(
        models.KitItem.equipment_id == equipment_id,
        models.Kit.active == True,
    ).all()
    return sum((ki.quantity_needed or 1) for ki in rows)


def _equipment_pools(
    equipment_id: int,
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    exclude_order_item_id: Optional[int] = None,
) -> dict:
    """חלוקת המלאי של פריט לשני מאגרים:
    - מאגר ערכות  = היחידות ששייכות לערכות (ניתנות להשאלה רק דרך הערכה)
    - מאגר בודד   = כל השאר (total - kit_reserved) — ניתן להשאלה ישירה
    מחזיר גם את החסימות לפי מקור (דרך ערכה / ישיר) וסטטוס.
    """
    eq = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    empty = {"total": 0, "in_kits": 0, "reserved": 0, "checked_out": 0,
             "available": 0, "kit_side_available": 0}
    if not eq or not eq.active:
        return empty
    now = datetime.utcnow()
    start = start or now
    end = end or start
    total = eq.quantity or 0
    in_kits = min(total, _kit_reserved_units(equipment_id, db))

    relevant = list(RESERVES_FULL_STATUSES | RESERVES_ISSUED_STATUSES)
    direct_block = 0
    kit_block = 0
    reserved = 0
    checked_out = 0

    # שורות ציוד (כולל שורות שנפרסו מערכה — from_kit_id)
    lines = db.query(models.OrderItem).join(models.Order).filter(
        models.OrderItem.equipment_id == equipment_id,
        models.Order.status.in_(relevant),
    ).all()
    for it in lines:
        if exclude_order_item_id and it.id == exclude_order_item_id:
            continue
        if not _overlaps(it.order, start, end, now):
            continue
        u = _blocked_units(it)
        if not u:
            continue
        if it.from_kit_id:
            kit_block += u
        else:
            direct_block += u
        if it.order.status in RESERVES_FULL_STATUSES:
            reserved += u
        else:
            checked_out += u

    # תאימות אחורה: שורות ערכה ישנות (kit_id) שלא נפרסו
    legacy = db.query(models.OrderItem).join(models.Order).filter(
        models.OrderItem.kit_id != None,
        models.Order.status.in_(relevant),
    ).options(joinedload(models.OrderItem.kit).joinedload(models.Kit.items)).all()
    for it in legacy:
        if not it.kit or (exclude_order_item_id and it.id == exclude_order_item_id):
            continue
        contains = next((ki for ki in it.kit.items if ki.equipment_id == equipment_id), None)
        if not contains or not _overlaps(it.order, start, end, now):
            continue
        u = (contains.quantity_needed or 1) * _blocked_units(it)
        kit_block += u
        if it.order.status in RESERVES_FULL_STATUSES:
            reserved += u
        else:
            checked_out += u

    standalone_pool = total - in_kits
    # חריגה של הזמנות ישירות מעבר למאגר הבודד (נתונים ישנים) נאכלת ממאגר הערכות
    direct_overflow = max(0, direct_block - standalone_pool)
    return {
        "total": total,
        "in_kits": in_kits,
        "reserved": reserved,
        "checked_out": checked_out,
        "available": max(0, standalone_pool - direct_block),
        "kit_side_available": max(0, in_kits - kit_block - direct_overflow),
    }


def _equipment_available_in_range(
    equipment_id: int,
    quantity_needed: int,
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    exclude_order_item_id: Optional[int] = None,
) -> int:
    """כמה יחידות מהפריט זמינות להזמנה *כפריט בודד* (לא דרך ערכה) בטווח."""
    return _equipment_pools(equipment_id, db, start, end, exclude_order_item_id)["available"]


def _kit_available_in_range(
    kit_id: int,
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    exclude_order_item_id: Optional[int] = None,
) -> int:
    """כמה עותקים של הערכה זמינים בטווח (בפועל 0 או 1 — כל ערכה היא ערכה פיזית אחת).
    = min על פני החלקים של (מאגר הערכות הפנוי // כמות נדרשת), ולא יותר מ-1."""
    kit = db.query(models.Kit).filter(models.Kit.id == kit_id).first()
    if not kit or not kit.active or not kit.items:
        return 0
    now = datetime.utcnow()
    start = start or now
    end = end or start
    # האם הערכה עצמה כבר מוזמנת בטווח?
    booked = db.query(models.OrderItem).join(models.Order).filter(
        models.OrderItem.from_kit_id == kit_id,
        models.Order.status.in_(list(RESERVES_FULL_STATUSES | RESERVES_ISSUED_STATUSES)),
    ).all()
    booked_orders = {it.order_id for it in booked
                     if it.id != exclude_order_item_id
                     and _overlaps(it.order, start, end, now) and _blocked_units(it)}
    if booked_orders:
        return 0
    min_av = 1
    for ki in kit.items:
        if not ki.equipment_id:
            continue  # פריט טקסט חופשי — לא נספר במלאי
        if not ki.equipment or not ki.equipment.active:
            return 0
        pools = _equipment_pools(ki.equipment_id, db, start, end, exclude_order_item_id)
        min_av = min(min_av, pools["kit_side_available"] // (ki.quantity_needed or 1))
    return max(0, min_av)


def _can_edit(order: models.Order, user: models.User) -> bool:
    """האם המשתמש יכול לערוך את ההזמנה?"""
    if order.status in FINAL_STATUSES:
        return False
    if user.role == "admin":
        return True
    # סטודנט: רק ההזמנות שלו, ורק כל עוד לא סופי
    return order.student_id == user.id


def _orders_query(db: Session):
    return db.query(models.Order).options(
        joinedload(models.Order.student),
        joinedload(models.Order.items).joinedload(models.OrderItem.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment),
        joinedload(models.Order.items).joinedload(models.OrderItem.equipment),
    )


def _notify_late_change(db: Session, order: models.Order, changed_by: models.User, action_desc: str):
    """שולח התראה למנהלי מחסן כשסטודנט/מרצה משנה הזמנה שכבר במצב מתקדם.
    ready / checked_out — הציוד כבר מוקצה/יצא, שינוי מצריך שימת לב.
    לא שולח שינויי מנהל עצמו."""
    if order.status not in ("ready", "checked_out"):
        return
    if changed_by.role == "admin":
        return
    admins = db.query(models.User).filter(
        models.User.role == "admin", models.User.active == True
    ).all()
    for admin in admins:
        try:
            notify(
                db, user_id=admin.id, type_="order_late_change",
                title=f"⚠️ שינוי בהזמנה #{order.id} (סטטוס: {order.status})",
                body=f"{changed_by.name} {action_desc}",
                link=f"/manager/orders/{order.id}",
            )
        except Exception as e:
            print(f"[notify] warning: {e}")


def _enrich(order: models.Order) -> schemas.OrderOut:
    """הוספת שדות מחושבים (item_count, returned_count, is_overdue, days_overdue)."""
    data = schemas.OrderOut.model_validate(order, from_attributes=True)
    data.item_count = len(order.items)
    data.returned_count = sum(1 for it in order.items if it.returned_at is not None)
    # crew מאוחסן כ-TEXT JSON — פירוק לרשימה
    parsed_crew = _parse_crew(order.crew)
    if parsed_crew is not None:
        try:
            data.crew = [schemas.CrewMember(**c) if isinstance(c, dict) else c for c in parsed_crew]
        except Exception:
            data.crew = None
    if order.status == "active" and order.due_date:
        now = datetime.utcnow()
        if now > order.due_date:
            delta = now - order.due_date
            data.is_overdue = True
            data.days_overdue = max(1, delta.days + (1 if delta.seconds > 0 else 0))
    return data


def _item_label(item: models.OrderItem) -> str:
    if item.kit:
        return item.kit.name
    if item.equipment:
        return f"{item.equipment.name}" + (f" x{item.quantity}" if (item.quantity or 1) > 1 else "")
    return "פריט"


def _validate_item_payload(db: Session, item: schemas.OrderItemCreate):
    """בודק שהפריט תקין — או kit_id או equipment_id, וקיים במערכת."""
    has_kit = item.kit_id is not None
    has_eq = item.equipment_id is not None
    if has_kit == has_eq:
        raise HTTPException(status_code=400, detail="כל פריט חייב להיות או ערכה או פריט בודד (לא שניהם)")
    if has_kit:
        kit = db.query(models.Kit).filter(models.Kit.id == item.kit_id, models.Kit.active == True).first()
        if not kit:
            raise HTTPException(status_code=404, detail=f"ערכה {item.kit_id} לא נמצאה")
        return kit, None
    eq = db.query(models.Equipment).filter(models.Equipment.id == item.equipment_id, models.Equipment.active == True).first()
    if not eq:
        raise HTTPException(status_code=404, detail=f"פריט {item.equipment_id} לא נמצא")
    return None, eq


# ----------------------------------------------------------------------------
# GET /orders
# ----------------------------------------------------------------------------
def _equipment_breakdown_in_range(
    equipment_id: int,
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict:
    """פירוט מלאי לפריט: total / in_kits / reserved / checked_out / available.
    available = מה שניתן להזמין כפריט בודד (לא כולל יחידות ששייכות לערכות)."""
    p = _equipment_pools(equipment_id, db, start, end)
    return {k: p[k] for k in ("total", "in_kits", "reserved", "checked_out", "available")}


@router.get("/availability/check")
def check_availability(
    start: datetime = Query(..., description="מתאריך"),
    end: datetime = Query(..., description="עד תאריך"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """בודק זמינות + פירוט מלאי לכל הציוד וכל הערכות בטווח התאריכים.
    מחזיר {equipment: {id: {total, reserved, checked_out, available}}, kits: {id: {available}}}.
    """
    equipment_av = {}
    for eq in db.query(models.Equipment).filter(models.Equipment.active == True).all():
        equipment_av[eq.id] = _equipment_breakdown_in_range(eq.id, db, start=start, end=end)
    kits_av = {}
    for k in db.query(models.Kit).filter(models.Kit.active == True).all():
        kits_av[k.id] = {"available": _kit_available_in_range(k.id, db, start=start, end=end)}
    return {"equipment": equipment_av, "kits": kits_av, "start": start, "end": end}


@router.get("/inventory/now")
def inventory_now(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """פירוט מלאי לפי הזמן הנוכחי — לתצוגה בעמוד ניהול ציוד.
    מחזיר {equipment: {id: {total, reserved, checked_out, available}}}."""
    now = datetime.utcnow()
    equipment_av = {}
    for eq in db.query(models.Equipment).filter(models.Equipment.active == True).all():
        equipment_av[eq.id] = _equipment_breakdown_in_range(eq.id, db, start=now, end=now)
    return {"equipment": equipment_av, "now": now}


@router.get("", response_model=List[schemas.OrderOut])
def list_orders(
    status: Optional[str] = Query(None, description="סינון לפי סטטוס (פסיקים מותרים)"),
    student_id: Optional[int] = Query(None),
    open_only: Optional[bool] = Query(None, description="רק הזמנות שעוד פתוחות"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    q = _orders_query(db)
    if current_user.role == "student":
        q = q.filter(models.Order.student_id == current_user.id)
    elif student_id:
        q = q.filter(models.Order.student_id == student_id)
    if status:
        q = q.filter(models.Order.status.in_(status.split(",")))
    if open_only:
        q = q.filter(models.Order.status.in_(list(EDITABLE_STATUSES)))
    orders = q.order_by(models.Order.requested_at.desc()).all()
    return [_enrich(o) for o in orders]


# ----------------------------------------------------------------------------
# GET /orders/{id}
# ----------------------------------------------------------------------------
@router.get("/{order_id}", response_model=schemas.OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = _orders_query(db).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if current_user.role == "student" and o.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="אין הרשאה")
    return _enrich(o)


# ----------------------------------------------------------------------------
# POST /orders — יצירת הזמנה חדשה (סטודנט)
# ----------------------------------------------------------------------------
@router.post("", response_model=schemas.OrderOut)
def create_order(
    payload: schemas.OrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ("student", "lecturer"):
        raise HTTPException(status_code=403, detail="רק סטודנט או מרצה יכולים ליצור הזמנה")
    if current_user.status == "blocked":
        raise HTTPException(status_code=403, detail="המשתמש חסום — לא ניתן ליצור הזמנות חדשות")
    if current_user.status == "graduate":
        raise HTTPException(status_code=403, detail="משתמש בסטטוס 'בוגר' — אין הזמנות חדשות")

    # auto-fill: אם לא צויין צוות, מאכלסים את "במאי" בשם המגיש (סטודנט/מרצה)
    initial_crew = payload.crew
    if not initial_crew:
        initial_crew = [schemas.CrewMember(role="במאי", name=current_user.name)]
    elif not any((c.role == "במאי" if hasattr(c, 'role') else c.get('role') == "במאי") for c in initial_crew):
        # אם יש צוות אבל בלי במאי — מוסיפים
        initial_crew = list(initial_crew) + [schemas.CrewMember(role="במאי", name=current_user.name)]

    # מתחילים ב-'draft' — לא נראה למחסן עד שסטודנט שולח (submit)
    order = models.Order(
        student_id=current_user.id,
        status="draft",
        notes=payload.notes,
        preferred_date=payload.preferred_date,
        loan_date=payload.loan_date,
        due_date=payload.due_date,
        production_name=payload.production_name,
        crew=_serialize_crew(initial_crew),
    )
    db.add(order)
    db.flush()

    for it_payload in payload.items:
        _validate_item_payload(db, it_payload)
        qty = max(1, int(it_payload.quantity or 1))
        oi = models.OrderItem(
            order_id=order.id,
            kit_id=it_payload.kit_id,
            equipment_id=it_payload.equipment_id,
            quantity=qty,
            added_by=current_user.id,
        )
        db.add(oi)

    log_activity(
        db, user_id=current_user.id,
        action="order.created", entity_type="order", entity_id=order.id,
        description=f"{current_user.name} פתח טיוטת הזמנה",
    )
    # אין הודעה למנהל בשלב draft — הוא יקבל הודעה רק כשסטודנט שולח (submit)

    db.commit()
    db.refresh(order)
    return _enrich(_orders_query(db).filter(models.Order.id == order.id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/submit — סטודנט שולח את הטיוטה למחסן (draft → pending)
# ----------------------------------------------------------------------------
@router.put("/{order_id}/submit", response_model=schemas.OrderOut)
def submit_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if current_user.role == "student" and o.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="אין הרשאה")
    if o.status != "draft":
        raise HTTPException(status_code=400, detail=f"לא ניתן לשלוח — הסטטוס הנוכחי הוא '{o.status}'")
    if not o.items:
        raise HTTPException(status_code=400, detail="לא ניתן לשלוח הזמנה ריקה")

    # בדיקה חוזרת בשליחה — טיוטות לא שומרות מלאי, אז ייתכן שמישהו תפס בינתיים
    if o.loan_date and o.due_date:
        problems = []
        for kit_id in {it.from_kit_id for it in o.items if it.from_kit_id}:
            if _kit_available_in_range(kit_id, db, start=o.loan_date, end=o.due_date) < 1:
                k = db.query(models.Kit).get(kit_id)
                problems.append(f"הערכה '{k.name if k else kit_id}'")
        for it in o.items:
            if it.from_kit_id or not it.equipment or it.returned_at:
                continue
            if it.equipment.is_key_product or _kit_reserved_units(it.equipment_id, db) > 0:
                av = _equipment_available_in_range(it.equipment_id, it.quantity or 1, db,
                                                   start=o.loan_date, end=o.due_date)
                if av < (it.quantity or 1):
                    problems.append(f"'{it.equipment.name}' (זמין {av}, הוזמן {it.quantity})")
        if problems:
            raise HTTPException(status_code=409,
                                detail="לא ניתן לשלוח — נתפס בינתיים: " + ", ".join(problems))

    o.status = "pending"
    o.last_modified_at = datetime.utcnow()

    log_activity(
        db, user_id=current_user.id, action="order.submitted",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} שלח את ההזמנה #{o.id} למחסן ({len(o.items)} פריטים)",
    )
    # התראות למנהלים
    item_names = []
    for it in o.items:
        if it.kit: item_names.append(it.kit.name)
        elif it.equipment:
            q = it.quantity or 1
            item_names.append(f"{it.equipment.name}" + (f" x{q}" if q > 1 else ""))
    summary = " · ".join(item_names[:4]) + (f" + {len(item_names)-4} נוספים" if len(item_names) > 4 else "")
    for admin in db.query(models.User).filter(models.User.role == "admin", models.User.active == True).all():
        notify(
            db, user_id=admin.id, type_="new_order",
            title=f"בקשה חדשה — {len(o.items)} פריטים",
            body=f"{o.student.name if o.student else ''}: {summary}",
            link=f"/manager/orders/{o.id}",
        )

    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/mark_ready — מנהל מסמן שהציוד מוכן (pending → ready)
# ----------------------------------------------------------------------------
@router.put("/{order_id}/mark_ready", response_model=schemas.OrderOut)
def mark_order_ready(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if o.status != "pending":
        raise HTTPException(status_code=400, detail=f"לא ניתן לסמן מוכן — הסטטוס הנוכחי הוא '{o.status}'")

    # אין auto-fill — המנהל יקבע quantity_issued ידנית
    o.status = "ready"
    o.approved_by = current_user.id
    o.last_modified_at = datetime.utcnow()

    log_activity(
        db, user_id=current_user.id, action="order.ready",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} סימן את ההזמנה #{o.id} כמוכנה לאיסוף",
    )

    # 'mark_ready' לא ממלא יותר quantity_issued אוטומטית — המנהל יקבע ידנית
    notify(
        db, user_id=o.student_id, type_="order_ready",
        title="🎒 ההזמנה מוכנה לאיסוף",
        body=f"הזמנה #{o.id} ({len(o.items)} פריטים) ממתינה לך במחסן",
        link=f"/student/orders/{o.id}",
    )
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/check_out — סטודנט חתם וקיבל את הציוד (ready → checked_out)
# ----------------------------------------------------------------------------
@router.put("/{order_id}/check_out", response_model=schemas.OrderOut)
def check_out_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if current_user.role == "student" and o.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="אין הרשאה")
    if o.status != "ready":
        raise HTTPException(status_code=400, detail=f"לא ניתן לחתום — הסטטוס הנוכחי הוא '{o.status}'")

    o.status = "checked_out"
    o.last_modified_at = datetime.utcnow()
    # אין auto-fill — אם המנהל לא קבע quantity_issued, יישאר ריק עד שיקבע

    log_activity(
        db, user_id=current_user.id, action="order.checked_out",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} חתם וקיבל את ההזמנה #{o.id}",
    )
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/mark_returned — מחסן מסמן שהציוד חזר (checked_out → returned)
# ----------------------------------------------------------------------------
@router.put("/{order_id}/mark_returned", response_model=schemas.OrderOut)
def mark_order_returned(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if o.status not in {"checked_out", "ready"}:
        raise HTTPException(status_code=400, detail=f"לא ניתן לסמן חזרה מסטטוס '{o.status}'")

    # ברירת מחדל: quantity_returned = quantity_issued (הכל חזר)
    for it in o.items:
        if not it.quantity_returned:
            it.quantity_returned = it.quantity_issued or it.quantity or 0
        if not it.returned_at:
            it.returned_at = datetime.utcnow()

    o.status = "returned"
    o.last_modified_at = datetime.utcnow()

    log_activity(
        db, user_id=current_user.id, action="order.returned",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} סימן שההזמנה #{o.id} חזרה",
    )
    notify(
        db, user_id=o.student_id, type_="order_returned",
        title="ההזמנה סומנה כחוזרה",
        body=f"הזמנה #{o.id} סומנה כחוזרה למחסן",
        link=f"/student/orders/{o.id}",
    )
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id} — עדכון פרטי הזמנה (הערות/תאריכים)
# ----------------------------------------------------------------------------
@router.put("/{order_id}", response_model=schemas.OrderOut)
def update_order(
    order_id: int,
    payload: schemas.OrderUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if not _can_edit(o, current_user):
        raise HTTPException(status_code=403, detail="לא ניתן לעריכה — הזמנה סגורה או שאין הרשאה")

    if payload.notes is not None:
        o.notes = payload.notes
    if payload.preferred_date is not None:
        o.preferred_date = payload.preferred_date
    if payload.loan_date is not None:
        o.loan_date = payload.loan_date
    if payload.due_date is not None:
        o.due_date = payload.due_date
    if payload.production_name is not None:
        o.production_name = payload.production_name
    if payload.crew is not None:
        o.crew = _serialize_crew(payload.crew)

    if current_user.role == "admin":
        if payload.manager_notes is not None:
            o.manager_notes = payload.manager_notes

    o.last_modified_at = datetime.utcnow()
    log_activity(
        db, user_id=current_user.id, action="order.updated",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} עדכן את ההזמנה #{o.id}",
    )
    db.commit()
    db.refresh(o)
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# POST /orders/{id}/items — הוספת פריט
# ----------------------------------------------------------------------------
@router.post("/{order_id}/items", response_model=schemas.OrderOut)
def add_item(
    order_id: int,
    item: schemas.OrderItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if not _can_edit(o, current_user):
        raise HTTPException(status_code=403, detail="לא ניתן להוסיף — ההזמנה סגורה")

    kit, eq = _validate_item_payload(db, item)
    qty = max(1, int(item.quantity or 1))

    # --- אכיפת מלאי לפריט בודד ---
    # חל על מוצר מפתח, וגם על כל פריט ששייך לערכה: יחידות של ערכה לא יוצאות לבד,
    # רק העודף (total - יחידות בערכות) זמין להזמנה ישירה.
    if eq and o.loan_date and o.due_date:
        in_kits = _kit_reserved_units(eq.id, db)
        if eq.is_key_product or in_kits > 0:
            existing = next((it for it in o.items if it.equipment_id == eq.id
                             and not it.from_kit_id and it.returned_at is None), None)
            available = _equipment_available_in_range(
                eq.id, qty, db, start=o.loan_date, end=o.due_date,
                exclude_order_item_id=existing.id if existing else None,
            )
            wanted_total = (existing.quantity if existing else 0) + qty
            if available < wanted_total:
                dates = f"{o.loan_date.strftime('%d/%m')} - {o.due_date.strftime('%d/%m')}"
                if in_kits > 0:
                    msg = (f"'{eq.name}' שייך לערכה — ניתן להשאיל אותו לבד רק {available} "
                           f"יחידות בתאריכים {dates}. להשאלת היתר יש להזמין את הערכה.")
                else:
                    msg = (f"'{eq.name}' — מוצר מפתח. זמין רק {available} בתאריכים {dates}. "
                           f"לא ניתן להזמין {wanted_total}.")
                raise HTTPException(status_code=409, detail=msg)

    # --- אכיפת זמינות ערכה (כל ערכה היא ערכה פיזית אחת) ---
    if kit and o.loan_date and o.due_date:
        kit_av = _kit_available_in_range(kit.id, db, start=o.loan_date, end=o.due_date)
        already = any(it.from_kit_id == kit.id for it in o.items)
        if already or kit_av < qty:
            raise HTTPException(
                status_code=409,
                detail=f"הערכה '{kit.name}' לא זמינה בתאריכים {o.loan_date.strftime('%d/%m')} - {o.due_date.strftime('%d/%m')}"
                       + (" (כבר נמצאת בהזמנה)" if already else "."),
            )

    # --- ערכה: הרחבה לפריטים בודדים (במקום שורת "ערכה" אחת) ---
    # לפי בקשת לקוח — הזמנת ערכה פורשת אוטומטית את כל הפריטים בה כשורות נפרדות
    if kit:
        added_items = []
        for kit_item in (kit.items or []):
            if not kit_item.equipment_id:
                continue
            needed = (kit_item.quantity_needed or 1) * qty
            # אם הציוד הזה כבר קיים בהזמנה — נגדיל כמות
            existing = next(
                (it for it in o.items
                 if it.equipment_id == kit_item.equipment_id and it.from_kit_id == kit.id
                 and it.returned_at is None),
                None
            )
            if existing:
                existing.quantity = (existing.quantity or 0) + needed
            else:
                db.add(models.OrderItem(
                    order_id=o.id,
                    equipment_id=kit_item.equipment_id,
                    from_kit_id=kit.id,
                    quantity=needed,
                    added_by=current_user.id,
                ))
                added_items.append(kit_item.equipment.name if kit_item.equipment else "פריט")

        o.last_modified_at = datetime.utcnow()
        log_activity(
            db, user_id=current_user.id, action="order.kit_expanded",
            entity_type="order", entity_id=o.id,
            description=f"{current_user.name} הוסיף ערכה '{kit.name}' (הורחבה ל-{len(kit.items or [])} פריטים)",
        )
        # התראה למחסן אם ההזמנה מעבר לpending (שינוי מאוחר)
        _notify_late_change(db, o, current_user, f"הוסיף פריטי ערכה '{kit.name}'")
        db.commit()
        return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())

    # --- ציוד בודד ---
    # אם כבר קיים פריט זהה ב-active (לא הוחזר) — מגדיל כמות
    if item.equipment_id is not None:
        existing = next(
            (it for it in o.items
             if it.equipment_id == item.equipment_id and not it.from_kit_id
             and it.returned_at is None),
            None
        )
        if existing:
            existing.quantity += qty
            o.last_modified_at = datetime.utcnow()
            log_activity(
                db, user_id=current_user.id, action="order.item_quantity_increased",
                entity_type="order", entity_id=o.id,
                description=f"{current_user.name} הגדיל כמות של '{eq.name}' (+{qty})",
            )
            _notify_late_change(db, o, current_user, f"עדכן כמות של '{eq.name}'")
            db.commit()
            return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())

    oi = models.OrderItem(
        order_id=o.id,
        equipment_id=item.equipment_id,
        quantity=qty,
        added_by=current_user.id,
    )
    db.add(oi)
    o.last_modified_at = datetime.utcnow()
    log_activity(
        db, user_id=current_user.id, action="order.item_added",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} הוסיף '{eq.name}' x{qty} להזמנה #{o.id}",
    )
    _notify_late_change(db, o, current_user, f"הוסיף '{eq.name}'")
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/items/{item_id} — עדכון פריט (כמות / סימון החזרה)
# ----------------------------------------------------------------------------
@router.put("/{order_id}/items/{item_id}", response_model=schemas.OrderOut)
def update_item(
    order_id: int,
    item_id: int,
    payload: schemas.OrderItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    it = next((x for x in o.items if x.id == item_id), None)
    if not it:
        raise HTTPException(status_code=404, detail="פריט לא נמצא בהזמנה")

    # סימון "הוחזר" — רק מנהל יכול
    if payload.mark_returned is True:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="רק מנהל יכול לסמן החזרה")
        it.returned_at = datetime.utcnow()
        it.quantity_returned = it.quantity_issued or it.quantity or 1
        o.last_modified_at = datetime.utcnow()
        log_activity(
            db, user_id=current_user.id, action="order.item_returned",
            entity_type="order", entity_id=o.id,
            description=f"{current_user.name} סימן '{_item_label(it)}' כהוחזר",
        )
        db.commit()
        return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())

    if not _can_edit(o, current_user):
        raise HTTPException(status_code=403, detail="לא ניתן לעריכה — ההזמנה סגורה")

    if payload.quantity is not None:
        old_qty = it.quantity
        new_qty = max(1, int(payload.quantity))
        # שורה שנפרסה מערכה — הכמות נקבעת לפי הערכה (אפשר להוריד, לא להעלות)
        if it.from_kit_id and new_qty > old_qty and current_user.role != "admin":
            raise HTTPException(status_code=409,
                                detail=f"'{_item_label(it)}' הגיע מערכה — לא ניתן להגדיל כמות. הזמן את הפריט בנפרד.")
        # פריט בודד: מוצר מפתח או פריט ששייך לערכה — לא לחרוג מהזמין לבד
        if (not it.from_kit_id and it.equipment and new_qty > old_qty and o.loan_date and o.due_date
                and (it.equipment.is_key_product or _kit_reserved_units(it.equipment_id, db) > 0)):
            available = _equipment_available_in_range(
                it.equipment_id, new_qty, db,
                start=o.loan_date, end=o.due_date,
                exclude_order_item_id=it.id,  # לא לספור את הפריט הזה עצמו כחוסם
            )
            if available < new_qty:
                raise HTTPException(
                    status_code=409,
                    detail=f"'{it.equipment.name}' — זמין לבד רק {available} בתאריכים אלה. לא ניתן להעלות ל-{new_qty}."
                )
        it.quantity = new_qty
        if old_qty != it.quantity:
            _notify_late_change(db, o, current_user,
                                f"שינה כמות של '{_item_label(it)}' מ-{old_qty} ל-{it.quantity}")

    # quantity_issued / quantity_returned — מנהל בלבד
    if current_user.role == "admin":
        if payload.quantity_issued is not None:
            it.quantity_issued = max(0, int(payload.quantity_issued))
        if payload.quantity_returned is not None:
            new_returned = max(0, int(payload.quantity_returned))
            # מגביל ש-quantity_returned <= quantity_issued
            it.quantity_returned = min(new_returned, it.quantity_issued or 0)
            if it.quantity_returned > 0 and not it.returned_at:
                it.returned_at = datetime.utcnow()
        if payload.returned_at is not None:
            it.returned_at = payload.returned_at

    o.last_modified_at = datetime.utcnow()
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# DELETE /orders/{id}/items/{item_id} — הסרת פריט
# ----------------------------------------------------------------------------
@router.delete("/{order_id}/items/{item_id}", response_model=schemas.OrderOut)
def remove_item(
    order_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if not _can_edit(o, current_user):
        raise HTTPException(status_code=403, detail="לא ניתן להסיר — ההזמנה סגורה")

    it = next((x for x in o.items if x.id == item_id), None)
    if not it:
        raise HTTPException(status_code=404, detail="פריט לא נמצא")

    label = _item_label(it)
    db.delete(it)
    o.last_modified_at = datetime.utcnow()
    log_activity(
        db, user_id=current_user.id, action="order.item_removed",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} הסיר '{label}' מההזמנה #{o.id}",
    )
    _notify_late_change(db, o, current_user, f"הסיר '{label}' מההזמנה")
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/approve — אישור מנהל
# ----------------------------------------------------------------------------
@router.put("/{order_id}/approve", response_model=schemas.OrderOut)
def approve_order(
    order_id: int,
    payload: schemas.OrderApprove,
    force: bool = Query(False, description="לאשר גם אם אין מספיק מלאי"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if o.status not in {"pending"}:
        raise HTTPException(status_code=400, detail="ניתן לאשר רק הזמנה ממתינה")
    if not o.items:
        raise HTTPException(status_code=400, detail="לא ניתן לאשר הזמנה ריקה")

    # בדיקת זמינות פר-פריט בטווח התאריכים המבוקש (מונע over-allocation)
    if not force:
        shortage = []
        for it in o.items:
            if it.equipment_id:
                avail = _equipment_available_in_range(
                    it.equipment_id, it.quantity or 1, db,
                    start=payload.loan_date, end=payload.due_date,
                    exclude_order_item_id=it.id,  # ההזמנה הזו עוד pending אז לא תופסת
                )
                if avail < (it.quantity or 1):
                    shortage.append(f"{it.equipment.name}: דרוש {it.quantity}, זמין {avail}")
            elif it.kit_id:
                avail = _kit_available_in_range(
                    it.kit_id, db,
                    start=payload.loan_date, end=payload.due_date,
                )
                if avail < (it.quantity or 1):
                    shortage.append(f"{it.kit.name}: דרוש {it.quantity}, זמין {avail}")
        if shortage:
            raise HTTPException(status_code=409, detail={
                "code": "insufficient_stock",
                "message": "אין מספיק מלאי בטווח התאריכים",
                "items": shortage,
                "hint": "ניתן לאשר בכל זאת עם force=true"
            })

    # /approve הופך לכיסוי תאימות אחורה — מסמן 'ready' (מוכן לאיסוף)
    o.status = "ready"
    o.loan_date = payload.loan_date
    o.due_date = payload.due_date
    o.manager_notes = payload.manager_notes
    o.approved_by = current_user.id
    o.last_modified_at = datetime.utcnow()
    # אין auto-fill ל-quantity_issued — המנהל קובע ידנית

    log_activity(
        db, user_id=current_user.id, action="order.approved",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} אישר וסימן את ההזמנה #{o.id} כמוכנה",
    )
    notify(
        db, user_id=o.student_id, type_="order_approved",
        title="ההזמנה אושרה ומוכנה לאיסוף ✓",
        body=f"הזמנה #{o.id} ({len(o.items)} פריטים) אושרה ומוכנה לאיסוף",
        link=f"/student/orders/{o.id}",
    )
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/reject
# ----------------------------------------------------------------------------
@router.put("/{order_id}/reject", response_model=schemas.OrderOut)
def reject_order(
    order_id: int,
    payload: schemas.OrderReject,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if o.status not in {"pending"}:
        raise HTTPException(status_code=400, detail="ניתן לדחות רק הזמנה ממתינה")

    o.status = "rejected"
    o.manager_notes = payload.manager_notes
    o.approved_by = current_user.id
    o.last_modified_at = datetime.utcnow()

    reason = payload.manager_notes or ""
    log_activity(
        db, user_id=current_user.id, action="order.rejected",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} דחה את ההזמנה #{o.id}" + (f" — {reason}" if reason else ""),
    )
    notify(
        db, user_id=o.student_id, type_="order_rejected",
        title="ההזמנה נדחתה",
        body=f"הזמנה #{o.id}" + (f": {reason}" if reason else ""),
        link=f"/student/orders/{o.id}",
    )
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/close — סגירה סופית ע"י מנהל
# ----------------------------------------------------------------------------
@router.put("/{order_id}/close", response_model=schemas.OrderOut)
def close_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if o.status in FINAL_STATUSES:
        raise HTTPException(status_code=400, detail="ההזמנה כבר נסגרה")

    o.status = "closed"
    o.closed_at = datetime.utcnow()
    o.closed_by = current_user.id
    o.last_modified_at = datetime.utcnow()
    log_activity(
        db, user_id=current_user.id, action="order.closed",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} סגר את ההזמנה #{o.id}",
    )
    notify(
        db, user_id=o.student_id, type_="order_closed",
        title="ההזמנה נסגרה",
        body=f"הזמנה #{o.id} סומנה כסגורה",
        link=f"/student/orders/{o.id}",
    )
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())


# ----------------------------------------------------------------------------
# PUT /orders/{id}/cancel — ביטול ע"י סטודנט (לפני אישור)
# ----------------------------------------------------------------------------
@router.put("/{order_id}/cancel", response_model=schemas.OrderOut)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    o = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if current_user.role == "student" and o.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="אין הרשאה")
    if o.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לבטל רק הזמנה ממתינה")

    o.status = "cancelled"
    o.last_modified_at = datetime.utcnow()
    log_activity(
        db, user_id=current_user.id, action="order.cancelled",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} ביטל את ההזמנה #{o.id}",
    )
    db.commit()
    return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())
