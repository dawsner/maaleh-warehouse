"""ייצוא רשימות ל-CSV וקבלות PDF (דרך HTML מודפס)."""
import csv
import io
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session, joinedload
from database import get_db
from auth import require_admin, get_current_user
import models

router = APIRouter(prefix="/exports", tags=["exports"])


def _stream_csv(rows, fieldnames, filename):
    """החזרת CSV עם UTF-8 BOM (כדי שאקסל יראה עברית כראוי)."""
    buffer = io.StringIO()
    buffer.write("﻿")  # BOM
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/equipment.csv")
def export_equipment(
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """ייצוא רשימת ציוד."""
    query = db.query(models.Equipment).filter(models.Equipment.active == True)
    if category:
        query = query.filter(models.Equipment.category == category)
    items = query.order_by(models.Equipment.category, models.Equipment.name).all()

    fieldnames = ["מזהה", "שם", "קטגוריה", "יצרן", "דגם", "כמות",
                  "מחיר", "מיקום", "מספר תג", "מבוטח", "הערות"]
    rows = [{
        "מזהה": eq.id,
        "שם": eq.name,
        "קטגוריה": eq.category,
        "יצרן": eq.manufacturer or "",
        "דגם": eq.model_name or "",
        "כמות": eq.quantity,
        "מחיר": eq.price or 0,
        "מיקום": eq.location or "",
        "מספר תג": eq.tag_id or "",
        "מבוטח": "כן" if eq.insured else "לא",
        "הערות": eq.notes or "",
    } for eq in items]

    filename = f"equipment-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return _stream_csv(rows, fieldnames, filename)


@router.get("/loans.csv")
def export_loans(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """ייצוא רשימת השאלות."""
    query = db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit),
    )
    if status:
        query = query.filter(models.LoanRequest.status.in_(status.split(",")))

    loans = query.order_by(models.LoanRequest.requested_at.desc()).all()

    fieldnames = ["מזהה", "סטודנט", "אימייל", "שנה", "ת\"ז סטודנט",
                  "ערכה", "סטטוס", "תאריך בקשה", "תאריך השאלה",
                  "יעד החזרה", "תאריך החזרה בפועל", "באיחור",
                  "הערות סטודנט", "הערות מנהל"]

    def fmt(dt):
        return dt.strftime("%Y-%m-%d %H:%M") if dt else ""

    def year_he(y):
        return {1:"א",2:"ב",3:"ג",4:"ד"}.get(y, "") if y else ""

    status_he = {
        "pending":"ממתין","active":"פעיל","returned":"הוחזר",
        "rejected":"נדחה","cancelled":"בוטל"
    }

    now = datetime.utcnow()
    rows = []
    for l in loans:
        is_overdue = (
            l.status == "active" and l.due_date and now > l.due_date
        )
        rows.append({
            "מזהה": l.id,
            "סטודנט": l.student.name if l.student else "",
            "אימייל": l.student.email if l.student else "",
            "שנה": year_he(l.student.year) if l.student else "",
            "ת\"ז סטודנט": l.student.student_id if l.student else "",
            "ערכה": l.kit.name if l.kit else "",
            "סטטוס": status_he.get(l.status, l.status),
            "תאריך בקשה": fmt(l.requested_at),
            "תאריך השאלה": fmt(l.loan_date),
            "יעד החזרה": fmt(l.due_date),
            "תאריך החזרה בפועל": fmt(l.return_date),
            "באיחור": "כן" if is_overdue else "",
            "הערות סטודנט": l.notes or "",
            "הערות מנהל": l.manager_notes or "",
        })

    filename = f"loans-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return _stream_csv(rows, fieldnames, filename)


@router.get("/students.csv")
def export_students(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """ייצוא רשימת סטודנטים."""
    students = db.query(models.User).filter(
        models.User.role == "student"
    ).order_by(models.User.name).all()

    fieldnames = ["מזהה", "שם", "אימייל", "שנה", "ת\"ז סטודנט", "טלפון",
                  "סטטוס", "תאריך הצטרפות"]

    def year_he(y):
        return {1:"א",2:"ב",3:"ג",4:"ד"}.get(y, "") if y else ""

    rows = [{
        "מזהה": s.id,
        "שם": s.name,
        "אימייל": s.email,
        "שנה": year_he(s.year),
        "ת\"ז סטודנט": s.student_id or "",
        "טלפון": s.phone or "",
        "סטטוס": "פעיל" if s.active else "לא פעיל",
        "תאריך הצטרפות": s.created_at.strftime("%Y-%m-%d") if s.created_at else "",
    } for s in students]

    filename = f"students-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return _stream_csv(rows, fieldnames, filename)


@router.get("/loan/{loan_id}/receipt", response_class=HTMLResponse)
def loan_receipt(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    קבלת השאלה — HTML מעוצב להדפסה / שמירה כ-PDF.
    המשתמש פותח בדפדפן, לוחץ Ctrl+P ובוחר "שמור כ-PDF".
    אדמין רואה כל בקשה. סטודנט רואה רק את שלו.
    """
    loan = db.query(models.LoanRequest).options(
        joinedload(models.LoanRequest.student),
        joinedload(models.LoanRequest.kit).joinedload(models.Kit.items).joinedload(models.KitItem.equipment),
        joinedload(models.LoanRequest.approved_by_user),
    ).filter(models.LoanRequest.id == loan_id).first()

    if not loan:
        raise HTTPException(status_code=404, detail="בקשת השאלה לא נמצאה")
    if current_user.role == "student" and loan.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="אין הרשאה")

    def fmt(dt):
        return dt.strftime("%d/%m/%Y") if dt else "—"

    year_he = {1:"א'", 2:"ב'", 3:"ג'", 4:"ד'"}.get(loan.student.year, "—") if loan.student else "—"
    status_he = {
        "pending":"ממתין לאישור","active":"פעיל","returned":"הוחזר",
        "rejected":"נדחה","cancelled":"בוטל"
    }.get(loan.status, loan.status)

    items_html = ""
    if loan.kit and loan.kit.items:
        items_html = "\n".join(
            f'<tr><td>{i.equipment.name if i.equipment else "—"}</td>'
            f'<td>{i.equipment.manufacturer if i.equipment else ""}</td>'
            f'<td>{i.equipment.tag_id if i.equipment and i.equipment.tag_id else "—"}</td>'
            f'<td>{i.quantity_needed}</td></tr>'
            for i in loan.kit.items
        )

    html = f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>טופס השאלה #{loan.id} — מעלה</title>
<style>
  @page {{ size: A4; margin: 1.5cm; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Heebo', 'Arial Hebrew', Arial, sans-serif;
    margin: 0; padding: 24px;
    color: #1a1a1a; line-height: 1.5;
    max-width: 800px; margin: 0 auto;
  }}
  .header {{
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 3px solid #C8102E; padding-bottom: 16px; margin-bottom: 24px;
  }}
  .header h1 {{ margin: 0; font-size: 24px; color: #C8102E; }}
  .header .subtitle {{ font-size: 13px; color: #666; margin-top: 4px; }}
  .meta {{ font-size: 12px; color: #888; text-align: left; }}
  .info-grid {{
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 16px; margin-bottom: 24px;
    background: #f8f8f8; padding: 16px; border-radius: 8px;
  }}
  .info-grid .label {{ font-size: 11px; color: #666; text-transform: uppercase; }}
  .info-grid .value {{ font-size: 14px; font-weight: 600; color: #1a1a1a; }}
  .status-pill {{
    display: inline-block; padding: 4px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 700;
    background: #fde2e5; color: #871020;
  }}
  h2 {{ font-size: 16px; margin: 24px 0 12px; color: #1a1a1a; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th {{ background: #f0f0f0; text-align: right; padding: 10px; font-weight: 600; border-bottom: 2px solid #ddd; }}
  td {{ padding: 10px; border-bottom: 1px solid #eee; }}
  .notes-box {{
    background: #fff8e1; border-right: 4px solid #f59e0b;
    padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 13px;
  }}
  .signature {{
    margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px;
  }}
  .signature .box {{ border-top: 1px solid #888; padding-top: 8px; font-size: 12px; color: #555; text-align: center; }}
  .footer {{
    margin-top: 40px; padding-top: 16px;
    border-top: 1px solid #ddd; font-size: 11px; color: #888; text-align: center;
  }}
  .print-button {{
    position: fixed; top: 16px; left: 16px; z-index: 100;
    background: #C8102E; color: white; border: none;
    padding: 10px 20px; border-radius: 8px; font-weight: 700;
    cursor: pointer; font-size: 14px;
  }}
  @media print {{ .print-button {{ display: none; }} }}
</style>
</head>
<body>
  <button class="print-button" onclick="window.print()">🖨️ הדפס / שמור כ-PDF</button>

  <div class="header">
    <div>
      <h1>טופס השאלה #{loan.id}</h1>
      <div class="subtitle">מעלה — בית הספר לקולנוע</div>
    </div>
    <div class="meta">
      תאריך הפקה: {datetime.now().strftime('%d/%m/%Y %H:%M')}
    </div>
  </div>

  <div class="info-grid">
    <div>
      <div class="label">סטודנט</div>
      <div class="value">{loan.student.name if loan.student else '—'}</div>
    </div>
    <div>
      <div class="label">שנה</div>
      <div class="value">שנה {year_he}</div>
    </div>
    <div>
      <div class="label">אימייל</div>
      <div class="value">{loan.student.email if loan.student else '—'}</div>
    </div>
    <div>
      <div class="label">טלפון</div>
      <div class="value">{loan.student.phone if loan.student and loan.student.phone else '—'}</div>
    </div>
    <div>
      <div class="label">סטטוס</div>
      <div class="value"><span class="status-pill">{status_he}</span></div>
    </div>
    <div>
      <div class="label">ערכה</div>
      <div class="value">{loan.kit.name if loan.kit else '—'}</div>
    </div>
    <div>
      <div class="label">תאריך השאלה</div>
      <div class="value">{fmt(loan.loan_date)}</div>
    </div>
    <div>
      <div class="label">תאריך החזרה צפוי</div>
      <div class="value">{fmt(loan.due_date)}</div>
    </div>
  </div>

  <h2>פריטים בערכה</h2>
  <table>
    <thead>
      <tr>
        <th>פריט</th>
        <th>יצרן</th>
        <th>מספר תג</th>
        <th>כמות</th>
      </tr>
    </thead>
    <tbody>
      {items_html or '<tr><td colspan="4" style="text-align:center; color:#888;">אין פריטים</td></tr>'}
    </tbody>
  </table>

  {('<div class="notes-box"><strong>הערות סטודנט:</strong> ' + loan.notes + '</div>') if loan.notes else ''}
  {('<div class="notes-box"><strong>הערות מנהל:</strong> ' + loan.manager_notes + '</div>') if loan.manager_notes else ''}

  <div class="signature">
    <div class="box">חתימת סטודנט</div>
    <div class="box">חתימת אחראי מחסן</div>
  </div>

  <div class="footer">
    בית הספר לקולנוע מעלה ע"ש אורי אליצור · שבטי ישראל 20, ירושלים · טל' 02-6277366
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)
