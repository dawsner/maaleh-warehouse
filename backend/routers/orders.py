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
RESERVES_ISSUED_STATUSES = {"checked_out", "returned"}


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


def _equipment_available_in_range(
    equipment_id: int,
    quantity_needed: int,
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    exclude_order_item_id: Optional[int] = None,
) -> int:
    """כמה יחידות מציוד X זמינות בטווח [start, end] (או עכשיו אם start=None).
    סופר תפיסות גם דרך OrderItem ישיר וגם דרך KitItem בערכות מאושרות.
    """
    eq = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not eq or not eq.active:
        return 0
    now = datetime.utcnow()
    start = start or now
    end = end or start

    def _blocked_for_item(it: models.OrderItem) -> int:
        """כמה יחידות נתפסות לפי הסטטוס. לפי המודל החדש:
        - pending/ready: requested בלבד (לא יצא עדיין)
        - checked_out/returned: כמה יצא בפועל פחות מה שחזר
        """
        st = it.order.status
        if st in RESERVES_FULL_STATUSES:
            return it.quantity or 1
        if st in RESERVES_ISSUED_STATUSES:
            return max(0, (it.quantity_issued or 0) - (it.quantity_returned or 0))
        return 0

    blocking = 0
    relevant_statuses = list(RESERVES_FULL_STATUSES | RESERVES_ISSUED_STATUSES)
    # 1) OrderItems שתופסים את הציוד הזה ישירות (לא דרך ערכה)
    items = db.query(models.OrderItem).join(models.Order).filter(
        models.OrderItem.equipment_id == equipment_id,
        models.Order.status.in_(relevant_statuses),
    ).all()
    for it in items:
        if exclude_order_item_id and it.id == exclude_order_item_id:
            continue
        b = _blocked_for_item(it)
        if not b:
            continue
        order = it.order
        o_start = order.loan_date or order.requested_at or now
        o_end = order.due_date or o_start
        if start <= o_end and end >= o_start:
            blocking += b

    # 2) OrderItems שהם ערכות, ובערכה יש את הציוד הזה
    kit_items = db.query(models.OrderItem).join(models.Order).filter(
        models.OrderItem.kit_id != None,
        models.Order.status.in_(relevant_statuses),
    ).options(joinedload(models.OrderItem.kit).joinedload(models.Kit.items)).all()
    for it in kit_items:
        if not it.kit:
            continue
        contains = next((ki for ki in it.kit.items if ki.equipment_id == equipment_id), None)
        if not contains:
            continue
        b = _blocked_for_item(it)
        if not b:
            continue
        order = it.order
        o_start = order.loan_date or order.requested_at or now
        o_end = order.due_date or o_start
        if start <= o_end and end >= o_start:
            blocking += (contains.quantity_needed or 1) * b

    return max(0, (eq.quantity or 0) - blocking)


def _kit_available_in_range(
    kit_id: int,
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    exclude_order_item_id: Optional[int] = None,
) -> int:
    """כמה ערכות זמינות בטווח — ה-min על פני הפריטים."""
    kit = db.query(models.Kit).filter(models.Kit.id == kit_id).first()
    if not kit or not kit.active or not kit.items:
        return 0
    min_av = None
    for ki in kit.items:
        if not ki.equipment or not ki.equipment.active:
            return 0
        eq_av = _equipment_available_in_range(
            ki.equipment_id, ki.quantity_needed or 1, db, start, end, exclude_order_item_id
        )
        slots = eq_av // (ki.quantity_needed or 1)
        if min_av is None or slots < min_av:
            min_av = slots
    return max(0, min_av if min_av is not None else 0)


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
@router.get("/availability/check")
def check_availability(
    start: datetime = Query(..., description="מתאריך"),
    end: datetime = Query(..., description="עד תאריך"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """בודק זמינות לכל הציוד וכל הערכות בטווח התאריכים הנתון.
    מחזיר {equipment: {id: available}, kits: {id: available}}.
    משמש את ה-UI להציג רק פריטים זמינים בטווח."""
    equipment_av = {}
    for eq in db.query(models.Equipment).filter(models.Equipment.active == True).all():
        avail = _equipment_available_in_range(eq.id, 1, db, start=start, end=end)
        equipment_av[eq.id] = {"available": avail, "total": eq.quantity}
    kits_av = {}
    for k in db.query(models.Kit).filter(models.Kit.active == True).all():
        kits_av[k.id] = {"available": _kit_available_in_range(k.id, db, start=start, end=end)}
    return {"equipment": equipment_av, "kits": kits_av, "start": start, "end": end}


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

    # מתחילים ב-'draft' — לא נראה למחסן עד שסטודנט שולח (submit)
    order = models.Order(
        student_id=current_user.id,
        status="draft",
        notes=payload.notes,
        preferred_date=payload.preferred_date,
        loan_date=payload.loan_date,
        due_date=payload.due_date,
        production_name=payload.production_name,
        crew=_serialize_crew(payload.crew),
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

    # ברירת מחדל: quantity_issued = quantity (מה שביקש, יוצא)
    for it in o.items:
        if not it.quantity_issued:
            it.quantity_issued = it.quantity or 1

    o.status = "ready"
    o.approved_by = current_user.id
    o.last_modified_at = datetime.utcnow()

    log_activity(
        db, user_id=current_user.id, action="order.ready",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} סימן את ההזמנה #{o.id} כמוכנה לאיסוף",
    )
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
    # אם quantity_issued לא נקבע — שווה למבוקש
    for it in o.items:
        if not it.quantity_issued:
            it.quantity_issued = it.quantity or 1

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

    # אם כבר קיים פריט זהה ב-active (לא הוחזר) — מגדיל כמות (לציוד בלבד)
    if item.equipment_id is not None:
        existing = next(
            (it for it in o.items
             if it.equipment_id == item.equipment_id and it.returned_at is None),
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
            db.commit()
            return _enrich(_orders_query(db).filter(models.Order.id == order_id).first())

    oi = models.OrderItem(
        order_id=o.id,
        kit_id=item.kit_id,
        equipment_id=item.equipment_id,
        quantity=qty,
        added_by=current_user.id,
    )
    db.add(oi)
    o.last_modified_at = datetime.utcnow()
    label = kit.name if kit else (f"{eq.name}" + (f" x{qty}" if qty > 1 else ""))
    log_activity(
        db, user_id=current_user.id, action="order.item_added",
        entity_type="order", entity_id=o.id,
        description=f"{current_user.name} הוסיף '{label}' להזמנה #{o.id}",
    )
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
        it.quantity = max(1, int(payload.quantity))

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
    for it in o.items:
        if not it.quantity_issued:
            it.quantity_issued = it.quantity or 1

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
