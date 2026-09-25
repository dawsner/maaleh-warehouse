import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional, List
from database import get_db
from auth import get_current_user, require_admin
from services import log_activity
import models
import schemas

router = APIRouter(prefix="/equipment", tags=["equipment"])

# Allowed CSV columns (Hebrew and English aliases). Internal -> aliases.
_CSV_FIELDS = {
    "name":                 ["שם", "שם למחסן", "name", "Name"],
    "display_name_student": ["שם לסטודנט", "display_name_student", "student_name"],
    "category":             ["קטגוריה", "קטגוריה ראשית", "category", "Category"],
    "tags":                 ["קטגוריות נוספות", "תגיות", "tags", "Tags"],
    "quantity":             ["כמות", "סה\"כ", "quantity", "Quantity"],
    "manufacturer":         ["יצרן", "manufacturer", "Manufacturer"],
    "model_name":           ["דגם", "model", "Model"],
    "price":                ["מחיר", "price", "Price"],
    "location":             ["מיקום", "location", "Location"],
    "tag_id":               ["מספר תג", "מק\"ט", "מקט", "barcode", "ברקוד", "tag_id", "tag", "Tag"],
    "image_url":            ["תמונה", "image_url", "image", "Image"],
    "insured":              ["מבוטח", "insured", "Insured"],
    "is_key_product":       ["מוצר מפתח", "מפתח", "is_key_product", "key_product"],
    "allowed_years":        ["שנים מותרות", "שנים", "allowed_years"],
    "notes":                ["הערות", "notes", "Notes"],
}

# הקטגוריה חופשית — כל ערך מותר (המערכת תומכת בקטגוריות מותאמות)


def _normalize_row(row: dict) -> dict:
    """ממפה שמות עמודות בעברית/אנגלית לשדות הפנימיים, מטהר ערכים.
    מנקה BOM וריווחים מובלעים בשמות העמודות."""
    # Clean keys: strip BOM and whitespace
    cleaned_row = {
        (k.replace("﻿", "").strip() if isinstance(k, str) else k): v
        for k, v in row.items()
    }
    out = {}
    for internal, aliases in _CSV_FIELDS.items():
        for a in aliases:
            if a in cleaned_row and cleaned_row[a] is not None and str(cleaned_row[a]).strip() != "":
                out[internal] = str(cleaned_row[a]).strip()
                break
    return out


def _to_bool(v) -> bool:
    return str(v).strip().lower() in ("כן","yes","true","1","y","v","✓")


def _validate_row(idx: int, row: dict) -> tuple[dict | None, str | None]:
    """ולידציה של שורה. מחזיר (dict לשמירה, שגיאה אם יש).
    קטגוריה חופשית (אין רשימה קבועה). ניתן להוסיף שדות חדשים דרך _CSV_FIELDS."""
    if not row.get("name"):
        return None, f"שורה {idx}: חסר שם"
    if not row.get("category"):
        return None, f"שורה {idx}: חסרה קטגוריה ({row.get('name')})"

    parsed = {
        "name": row["name"],
        "display_name_student": row.get("display_name_student"),
        "category": row["category"],
        "tags": row.get("tags"),
        "quantity": 1,
        "insured": False,
        "is_key_product": False,
        "price": 0.0,
        "manufacturer": row.get("manufacturer"),
        "model_name": row.get("model_name"),
        "location": row.get("location"),
        "tag_id": row.get("tag_id"),
        "image_url": row.get("image_url"),
        "allowed_years": row.get("allowed_years"),
        "notes": row.get("notes"),
    }
    if "quantity" in row:
        try:
            parsed["quantity"] = int(row["quantity"])
            if parsed["quantity"] < 1:
                return None, f"שורה {idx}: כמות חייבת להיות >= 1 ({row['name']})"
        except ValueError:
            return None, f"שורה {idx}: כמות לא תקינה '{row['quantity']}' ({row['name']})"
    if "price" in row:
        try:
            parsed["price"] = float(str(row["price"]).replace(",", "").replace("₪", "").strip())
        except ValueError:
            return None, f"שורה {idx}: מחיר לא תקין '{row['price']}' ({row['name']})"
    if "insured" in row:
        parsed["insured"] = _to_bool(row["insured"])
    if "is_key_product" in row:
        parsed["is_key_product"] = _to_bool(row["is_key_product"])

    return parsed, None


@router.post("/import")
async def import_equipment(
    file: UploadFile = File(...),
    dry_run: bool = Query(False, description="True = תצוגה מקדימה בלי שמירה"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """
    ייבוא ציוד מקובץ CSV.
    כותרות עמודות נתמכות (עברית/אנגלית): שם/name, קטגוריה/category, כמות/quantity,
    יצרן, דגם, מחיר, מיקום, מספר תג, תמונה, מבוטח, הערות.
    קידוד מומלץ: UTF-8 (עם או בלי BOM).
    """
    if not file.filename or not file.filename.lower().endswith((".csv", ".txt")):
        raise HTTPException(status_code=400, detail="יש להעלות קובץ CSV (סיומת .csv)")

    content = await file.read()
    # Try multiple encodings; CSV from Excel is often UTF-8-SIG or CP1255
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1255", "windows-1255"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise HTTPException(status_code=400, detail="לא ניתן לפענח קידוד הקובץ. שמור כ-UTF-8.")

    reader = csv.DictReader(io.StringIO(text))
    valid_rows = []
    errors = []
    duplicate_tags = []

    # Build set of existing tag_ids to detect duplicates
    existing_tags = {t[0] for t in db.query(models.Equipment.tag_id).filter(models.Equipment.tag_id != None).all() if t[0]}
    seen_tags_in_file = set()

    for idx, raw_row in enumerate(reader, start=2):  # start=2 to account for header row
        normalized = _normalize_row(raw_row)
        if not any(normalized.values()):
            continue  # skip blank rows
        parsed, err = _validate_row(idx, normalized)
        if err:
            errors.append(err)
            continue

        # tag duplicates
        if parsed.get("tag_id"):
            if parsed["tag_id"] in existing_tags:
                duplicate_tags.append(f"שורה {idx}: תג '{parsed['tag_id']}' כבר קיים במערכת ({parsed['name']})")
                continue
            if parsed["tag_id"] in seen_tags_in_file:
                duplicate_tags.append(f"שורה {idx}: תג '{parsed['tag_id']}' מופיע פעמיים בקובץ ({parsed['name']})")
                continue
            seen_tags_in_file.add(parsed["tag_id"])

        valid_rows.append(parsed)

    if dry_run:
        return {
            "preview": True,
            "valid_count": len(valid_rows),
            "error_count": len(errors) + len(duplicate_tags),
            "rows": valid_rows[:50],
            "errors": errors,
            "duplicates": duplicate_tags,
        }

    # Save
    if errors or duplicate_tags:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "יש שגיאות בקובץ — תקן והעלה שוב",
                "errors": errors,
                "duplicates": duplicate_tags,
            }
        )

    for row in valid_rows:
        db.add(models.Equipment(**row))

    log_activity(
        db,
        user_id=current_user.id,
        action="equipment.bulk_import",
        entity_type="equipment",
        description=f"{current_user.name} ייבא {len(valid_rows)} פריטי ציוד מקובץ CSV",
    )
    db.commit()

    return {"imported": len(valid_rows), "errors": []}


@router.get("/import/template.csv")
def import_template(
    current_user: models.User = Depends(require_admin),
):
    """תבנית CSV להורדה — כותרות בעברית ושורות לדוגמה עם כל השדות הנתמכים."""
    from fastapi.responses import Response
    header = "שם,שם לסטודנט,קטגוריה,קטגוריות נוספות,כמות,יצרן,דגם,מק\"ט,מיקום,מחיר,שנים מותרות,מוצר מפתח,מבוטח,הערות"
    examples = [
        # (name, display_name_student, category, tags, quantity, manufacturer, model, tag_id, location, price, allowed_years, is_key, insured, notes)
        'קנון 80c #1,מצלמת קנון,מצלמות,,1,Canon,EOS 80c,CAM-001,מחסן ראשי,5000,"1,2,3,4",כן,כן,ציוד מפתח — הזמנה מוגבלת',
        'מוניטור A,מוניטור במאי,מוניטורים,,1,Atomos,Shogun 7,MON-001,מדף B2,3000,"1,2,3,4,5",כן,,',
        'מוניטור B,מוניטור במאי,מוניטורים,,1,Atomos,Shogun 7,MON-002,מדף B2,3000,"1,2,3,4,5",כן,,',
        'כרטיס זכרון 128GB,,אביזרים,"מצלמות,סאונד",10,SanDisk,SDXC 128GB UHS-I,MEM-001,ארון תגר 4,150,"1,2,3,4,5",,,אחסון בקופסה כחולה',
        'שק חול 5 קילו,,תאורה,אביזרים,20,-,-,-,מחסן ראשי,80,"1,2,3,4,5",,,אין הגבלת הזמנה',
        'סאונדמן ZOOM H6,מקליט,סאונד,,3,Zoom,H6,ZOOM-001,ארון סאונד,1200,"2,3,4",,,לתעודות שנה 2+',
    ]
    content = "﻿" + header + "\n" + "\n".join(examples) + "\n"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="equipment-template.csv"'},
    )


@router.get("/by-tag/{tag_id}", response_model=schemas.EquipmentOut)
def get_by_tag(
    tag_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """חיפוש מהיר לפי tag/ברקוד."""
    item = db.query(models.Equipment).filter(
        models.Equipment.tag_id == tag_id,
        models.Equipment.active == True
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"לא נמצא ציוד עם תג {tag_id}")
    return item


@router.get("/categories", response_model=List[str])
def get_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    categories = db.query(models.Equipment.category).filter(
        models.Equipment.active == True
    ).distinct().all()
    return [c[0] for c in categories]


@router.get("", response_model=List[schemas.EquipmentOut])
def get_equipment(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Equipment).filter(models.Equipment.active == True)
    if search:
        query = query.filter(models.Equipment.name.ilike(f"%{search}%"))
    if category:
        query = query.filter(models.Equipment.category == category)
    return query.order_by(models.Equipment.category, models.Equipment.name).all()


@router.post("", response_model=schemas.EquipmentOut)
def create_equipment(
    equipment: schemas.EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    db_equipment = models.Equipment(**equipment.model_dump())
    db.add(db_equipment)
    db.flush()
    log_activity(
        db,
        user_id=current_user.id,
        action="equipment.created",
        entity_type="equipment",
        entity_id=db_equipment.id,
        description=f"{current_user.name} הוסיף ציוד '{db_equipment.name}'",
    )
    db.commit()
    db.refresh(db_equipment)
    return db_equipment


@router.put("/{equipment_id}", response_model=schemas.EquipmentOut)
def update_equipment(
    equipment_id: int,
    equipment: schemas.EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    db_equipment = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not db_equipment:
        raise HTTPException(status_code=404, detail="ציוד לא נמצא")

    update_data = equipment.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_equipment, key, value)

    db.commit()
    db.refresh(db_equipment)
    return db_equipment


@router.put("/bulk", response_model=dict)
def bulk_update_equipment(
    payload: schemas.EquipmentBulkUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """עדכון גורף של מספר פריטי ציוד — לספירת מלאי או שינויים המוניים."""
    if not payload.equipment_ids:
        raise HTTPException(status_code=400, detail="לא נבחרו פריטים")

    items = db.query(models.Equipment).filter(models.Equipment.id.in_(payload.equipment_ids)).all()
    if not items:
        raise HTTPException(status_code=404, detail="לא נמצאו פריטים")

    update_fields = payload.model_dump(exclude={"equipment_ids"}, exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=400, detail="לא צוין שדה לעדכון")

    for eq in items:
        for key, value in update_fields.items():
            setattr(eq, key, value)

    log_activity(
        db, user_id=current_user.id,
        action="equipment.bulk_updated",
        entity_type="equipment",
        description=f"{current_user.name} עדכן {len(items)} פריטים בבת אחת: {', '.join(update_fields.keys())}",
    )
    db.commit()
    return {"updated": len(items), "fields": list(update_fields.keys())}


@router.delete("/{equipment_id}")
def deactivate_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    db_equipment = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not db_equipment:
        raise HTTPException(status_code=404, detail="ציוד לא נמצא")

    db_equipment.active = False
    log_activity(
        db,
        user_id=current_user.id,
        action="equipment.deactivated",
        entity_type="equipment",
        entity_id=db_equipment.id,
        description=f"{current_user.name} השבית ציוד '{db_equipment.name}'",
    )
    db.commit()
    return {"message": "הציוד הושבת בהצלחה"}
