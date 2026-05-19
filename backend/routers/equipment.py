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
    "name":         ["שם", "name", "Name"],
    "category":     ["קטגוריה", "category", "Category"],
    "quantity":     ["כמות", "quantity", "Quantity"],
    "manufacturer": ["יצרן", "manufacturer", "Manufacturer"],
    "model_name":   ["דגם", "model", "Model"],
    "price":        ["מחיר", "price", "Price"],
    "location":     ["מיקום", "location", "Location"],
    "tag_id":       ["מספר תג", "tag_id", "tag", "Tag"],
    "image_url":    ["תמונה", "image_url", "image", "Image"],
    "insured":      ["מבוטח", "insured", "Insured"],
    "notes":        ["הערות", "notes", "Notes"],
}

_VALID_CATEGORIES = {"תאורה","סאונד","מצלמות","עדשות","חצובות","אביזרים","מוניטורים","וויירלס","מקליטים"}


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


def _validate_row(idx: int, row: dict) -> tuple[dict | None, str | None]:
    """ולידציה של שורה. מחזיר (dict לשמירה, שגיאה אם יש)."""
    if not row.get("name"):
        return None, f"שורה {idx}: חסר שם"
    if not row.get("category"):
        return None, f"שורה {idx}: חסרה קטגוריה ({row.get('name')})"
    if row["category"] not in _VALID_CATEGORIES:
        return None, f"שורה {idx}: קטגוריה לא תקינה '{row['category']}' ({row.get('name')})"

    parsed = {
        "name": row["name"],
        "category": row["category"],
        "quantity": 1,
        "insured": False,
        "price": 0.0,
        "manufacturer": row.get("manufacturer"),
        "model_name": row.get("model_name"),
        "location": row.get("location"),
        "tag_id": row.get("tag_id"),
        "image_url": row.get("image_url"),
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
        parsed["insured"] = str(row["insured"]).strip().lower() in ("כן","yes","true","1","y","v","✓")

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
    """תבנית CSV ריקה להורדה — עם כותרות בעברית ושורה לדוגמה."""
    from fastapi.responses import Response
    content = "﻿שם,קטגוריה,כמות,יצרן,דגם,מחיר,מיקום,מספר תג,תמונה,מבוטח,הערות\n"
    content += "מצלמה Canon EOS R5,מצלמות,2,Canon,EOS R5,15000,מחסן ראשי,CAM-001,,כן,חדש 2026\n"
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
