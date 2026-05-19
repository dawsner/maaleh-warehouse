"""
Seed script for Ma'aleh warehouse management system.
Run with: python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, SessionLocal, Base
import models
from auth import get_password_hash
from datetime import datetime, timedelta

# Create all tables
Base.metadata.create_all(bind=engine)

db = SessionLocal()


def clear_existing():
    db.query(models.LoanRequest).delete()
    db.query(models.KitItem).delete()
    db.query(models.Kit).delete()
    db.query(models.Equipment).delete()
    db.query(models.User).delete()
    db.commit()
    print("מחיקת נתונים קיימים...")


def create_users():
    users = [
        models.User(
            name="מנהל מחסן",
            email="admin@maaleh.ac.il",
            password_hash=get_password_hash("admin123"),
            role="admin",
            phone="050-1234567"
        ),
        models.User(
            name="שרה כהן",
            email="sara@maaleh.ac.il",
            password_hash=get_password_hash("student123"),
            role="student",
            year=1,
            student_id="20231001",
            phone="050-2345678"
        ),
        models.User(
            name="יוסי לוי",
            email="yossi@maaleh.ac.il",
            password_hash=get_password_hash("student123"),
            role="student",
            year=2,
            student_id="20221002",
            phone="050-3456789"
        ),
        models.User(
            name="מיכל אברהם",
            email="michal@maaleh.ac.il",
            password_hash=get_password_hash("student123"),
            role="student",
            year=3,
            student_id="20211003",
            phone="050-4567890"
        ),
        models.User(
            name="דוד בן דוד",
            email="david@maaleh.ac.il",
            password_hash=get_password_hash("student123"),
            role="student",
            year=4,
            student_id="20201004",
            phone="050-5678901"
        ),
    ]
    for user in users:
        db.add(user)
    db.commit()
    print(f"נוצרו {len(users)} משתמשים")
    return {u.email: u for u in users}


def create_equipment():
    items = [
        # Cameras
        models.Equipment(name="מצלמה Canon EOS 1200D", category="מצלמות", quantity=5, insured=True, price=1200, location="מחסן", manufacturer="Canon"),
        models.Equipment(name="מצלמה CANON XA10", category="מצלמות", quantity=3, insured=True, price=8424, location="מחסן", manufacturer="Canon"),
        models.Equipment(name="מצלמה Sony HXR-NX100", category="מצלמות", quantity=4, insured=True, price=8775, location="מחסן", manufacturer="Sony"),
        models.Equipment(name="מצלמה Sony PXW-FS7", category="מצלמות", quantity=2, insured=True, price=40000, location="מחסן", manufacturer="Sony"),
        models.Equipment(name="מצלמה SONY PXW-Z90", category="מצלמות", quantity=3, insured=True, price=12495, location="מחסן", manufacturer="Sony"),
        models.Equipment(name="מצלמה Canon EOS 60D", category="מצלמות", quantity=4, insured=True, price=4000, location="מחסן", manufacturer="Canon"),
        models.Equipment(name="מצלמה Canon EOS C100 Mark II", category="מצלמות", quantity=2, insured=True, price=4100, location="מחסן", manufacturer="Canon"),
        models.Equipment(name="מצלמה Canon EOS C300", category="מצלמות", quantity=3, insured=True, price=5300, location="מחסן", manufacturer="Canon"),
        models.Equipment(name="מצלמה JVC 4K GY-LS300", category="מצלמות", quantity=3, insured=True, price=16000, location="מחסן", manufacturer="JVC"),
        models.Equipment(name="מצלמת סטילס Samsung EV-NX2000", category="מצלמות", quantity=5, insured=True, price=1500, location="מחסן", manufacturer="Samsung"),
        models.Equipment(name="מצלמת Panasonic AG-UX90EJ", category="מצלמות", quantity=3, insured=True, price=7500, location="מחסן", manufacturer="Panasonic"),
        # Lenses
        models.Equipment(name="עדשה Canon EF-S 17-55mm f/2.8", category="עדשות", quantity=4, insured=True, price=3000, manufacturer="Canon"),
        models.Equipment(name="עדשה Sigma 17-50mm f/2.8", category="עדשות", quantity=5, insured=True, price=1500, manufacturer="Sigma"),
        models.Equipment(name="עדשה Canon EF 24-105mm f/4L", category="עדשות", quantity=1, insured=True, price=6000, manufacturer="Canon"),
        models.Equipment(name="עדשה FUJINON MK18-55mm T2.9", category="עדשות", quantity=1, insured=True, price=15678, notes="עדשות גמר", manufacturer="Fujinon"),
        models.Equipment(name="עדשה FUJINON MK50-135mm T2.9", category="עדשות", quantity=1, insured=True, price=16848, notes="עדשות גמר", manufacturer="Fujinon"),
        models.Equipment(name="עדשה 20-50 Samsung", category="עדשות", quantity=5, insured=True, price=1500, manufacturer="Samsung"),
        # Tripods
        models.Equipment(name="חצובת מצלמה Manfrotto 501HDV", category="חצובות", quantity=5, insured=True, price=3000, location="מחסן", manufacturer="Manfrotto"),
        models.Equipment(name="חצובת מצלמה Manfrotto 504HD", category="חצובות", quantity=4, insured=True, price=2898, location="מחסן", manufacturer="Manfrotto"),
        models.Equipment(name="חצובה Vinten Vision 10", category="חצובות", quantity=2, insured=True, price=12000, location="מחסן", manufacturer="Vinten"),
        models.Equipment(name="חצובה Vinten Vision 5", category="חצובות", quantity=2, insured=True, price=5000, location="מחסן", manufacturer="Vinten"),
        models.Equipment(name="חצובה E-IMAGE gh-03", category="חצובות", quantity=5, insured=True, price=1000, location="מחסן"),
        # Sound
        models.Equipment(name="מיקרופון SENNHEISER MKH 416 P48", category="סאונד", quantity=8, insured=True, price=4000, location="מחסן", manufacturer="Sennheiser"),
        models.Equipment(name="מיקרופון RODE NTG-2", category="סאונד", quantity=3, insured=True, price=1083, location="מחסן", manufacturer="Rode"),
        models.Equipment(name="מיקרופון RODE VideoMic", category="סאונד", quantity=4, insured=True, price=1200, location="מחסן", manufacturer="Rode"),
        models.Equipment(name="מיקרופון RODE NTG-1", category="סאונד", quantity=4, insured=True, price=1100, location="מחסן", manufacturer="Rode"),
        models.Equipment(name="מקליט ZOOM H6", category="מקליטים", quantity=4, insured=True, price=1500, location="מחסן", manufacturer="ZOOM"),
        models.Equipment(name="מקלט Sennheiser G3", category="וויירלס", quantity=15, insured=True, price=4000, location="מחסן", manufacturer="Sennheiser", notes="ערכות 1-23"),
        models.Equipment(name="מקלט Sennheiser G4", category="וויירלס", quantity=4, insured=True, price=3510, location="מחסן", manufacturer="Sennheiser", notes="ערכות גמר 28-31"),
        models.Equipment(name="מקלט Rode Wireless GO II", category="וויירלס", quantity=3, insured=True, price=1462, location="מחסן", manufacturer="RODE"),
        models.Equipment(name="מקלט Saramonic UwMic10", category="וויירלס", quantity=3, insured=True, price=1500, location="מחסן", manufacturer="Saramonic"),
        models.Equipment(name="חגורה + כיס למכתוף DVTEC", category="אביזרים", quantity=1, insured=True, price=0, location="מחסן", manufacturer="DVTEC"),
        # Lighting
        models.Equipment(name="באלסט לקינו KINO FLO", category="תאורה", quantity=5, insured=True, price=1000, location="מחסן", manufacturer="KINO FLO"),
        models.Equipment(name="פנס Forza 300B", category="תאורה", quantity=1, insured=True, price=0, location="מחסן", manufacturer="Nanlite"),
        models.Equipment(name="LISHUAI Flaglite FL150", category="תאורה", quantity=1, insured=True, price=0, location="מחסן", manufacturer="LISHUAI"),
        # Monitors
        models.Equipment(name='מוניטור Swit 17" S-1173H', category="מוניטורים", quantity=2, insured=True, price=4433, location="מחסן", manufacturer="Swit"),
        models.Equipment(name='מוניטור TVlogic VFM-056W 5.6"', category="מוניטורים", quantity=2, insured=True, price=5905, manufacturer="TVlogic"),
        models.Equipment(name="מוניטור Shogun 7", category="מוניטורים", quantity=1, insured=True, price=4500, location="מחסן", manufacturer="Atomos"),
    ]
    for item in items:
        db.add(item)
    db.commit()
    print(f"נוצרו {len(items)} פריטי ציוד")

    # Return as dict by name
    result = {}
    for item in items:
        db.refresh(item)
        result[item.name] = item
    return result


def create_kits(equipment_map):
    def get_eq(name):
        eq = equipment_map.get(name)
        if not eq:
            print(f"  אזהרה: ציוד לא נמצא: {name}")
        return eq

    kits_data = [
        {
            "kit": models.Kit(
                name="ערכה בסיסית - Canon 1200D",
                description="ערכת מצלמה בסיסית למתחילים - מצלמת Canon DSLR עם חצובה",
                category="מצלמה",
                min_year=1, max_year=2
            ),
            "items": [
                ("מצלמה Canon EOS 1200D", 1),
                ("חצובת מצלמה Manfrotto 501HDV", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת DSLR - Canon 60D",
                description="ערכת DSLR מתקדמת עם עדשה סיגמה",
                category="מצלמה",
                min_year=1, max_year=3
            ),
            "items": [
                ("מצלמה Canon EOS 60D", 1),
                ("עדשה Sigma 17-50mm f/2.8", 1),
                ("חצובת מצלמה Manfrotto 501HDV", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת סטילס Samsung",
                description="ערכת צילום סטילס למתחילים",
                category="מצלמה",
                min_year=1, max_year=2
            ),
            "items": [
                ("מצלמת סטילס Samsung EV-NX2000", 1),
                ("עדשה 20-50 Samsung", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת TV - Canon XA10",
                description="ערכת מצלמת שידור בסיסית",
                category="מצלמה",
                min_year=2, max_year=4
            ),
            "items": [
                ("מצלמה CANON XA10", 1),
                ("חצובת מצלמה Manfrotto 504HD", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת OR - Sony Z90",
                description="ערכת מצלמת שידור Sony Z90",
                category="מצלמה",
                min_year=2, max_year=4
            ),
            "items": [
                ("מצלמה SONY PXW-Z90", 1),
                ("חצובת מצלמה Manfrotto 504HD", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת סינמה - Canon C100 MkII",
                description="ערכת קולנוע Canon Cinema",
                category="מצלמה",
                min_year=3, max_year=4
            ),
            "items": [
                ("מצלמה Canon EOS C100 Mark II", 1),
                ("עדשה Canon EF-S 17-55mm f/2.8", 1),
                ("חצובה Vinten Vision 5", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת סינמה - Canon C300",
                description="ערכת קולנוע Canon C300",
                category="מצלמה",
                min_year=3, max_year=4
            ),
            "items": [
                ("מצלמה Canon EOS C300", 1),
                ("עדשה Canon EF-S 17-55mm f/2.8", 1),
                ("חצובה Vinten Vision 10", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת JVC 4K",
                description="ערכת 4K מתקדמת",
                category="מצלמה",
                min_year=3, max_year=4
            ),
            "items": [
                ("מצלמה JVC 4K GY-LS300", 1),
                ("עדשה Sigma 17-50mm f/2.8", 1),
                ("חצובת מצלמה Manfrotto 504HD", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת Sony FS7",
                description="ערכת קולנוע Sony FS7 - לשנה ד בלבד",
                category="מצלמה",
                min_year=4, max_year=4
            ),
            "items": [
                ("מצלמה Sony PXW-FS7", 1),
                ("חצובה Vinten Vision 10", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת עדשות גמר",
                description="עדשות קולנוע מקצועיות - לשנה ד בלבד",
                category="עדשות",
                min_year=4, max_year=4
            ),
            "items": [
                ("עדשה FUJINON MK18-55mm T2.9", 1),
                ("עדשה FUJINON MK50-135mm T2.9", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת סאונד 1",
                description="ערכת סאונד מקצועית עם מיקרופון Sennheiser 416",
                category="סאונד",
                min_year=2, max_year=4
            ),
            "items": [
                ("מיקרופון SENNHEISER MKH 416 P48", 1),
                ("מקלט Sennheiser G3", 1),
                ("מקליט ZOOM H6", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת וויירלס - Rode GO II",
                description="ערכת וויירלס Rode - מיקרופון אלחוטי",
                category="סאונד",
                min_year=2, max_year=4
            ),
            "items": [
                ("מקלט Rode Wireless GO II", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת וויירלס גמר - Sennheiser G4",
                description="ערכת וויירלס מקצועית Sennheiser G4 - לשנה ד בלבד",
                category="סאונד",
                min_year=4, max_year=4
            ),
            "items": [
                ("מקלט Sennheiser G4", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת NX100",
                description="ערכת מצלמת שידור Sony NX100",
                category="מצלמה",
                min_year=2, max_year=3
            ),
            "items": [
                ("מצלמה Sony HXR-NX100", 1),
                ("חצובת מצלמה Manfrotto 504HD", 1),
            ]
        },
        {
            "kit": models.Kit(
                name="ערכת Panasonic",
                description="ערכת מצלמת שידור Panasonic",
                category="מצלמה",
                min_year=2, max_year=3
            ),
            "items": [
                ("מצלמת Panasonic AG-UX90EJ", 1),
                ("חצובת מצלמה Manfrotto 504HD", 1),
            ]
        },
    ]

    kit_objects = []
    for kit_data in kits_data:
        kit = kit_data["kit"]
        db.add(kit)
        db.flush()

        for eq_name, qty in kit_data["items"]:
            eq = get_eq(eq_name)
            if eq:
                db.add(models.KitItem(
                    kit_id=kit.id,
                    equipment_id=eq.id,
                    quantity_needed=qty
                ))
        kit_objects.append(kit)

    db.commit()
    print(f"נוצרו {len(kit_objects)} ערכות")
    return kit_objects


def create_sample_loans(users_map, kits):
    admin = users_map["admin@maaleh.ac.il"]
    sara = users_map["sara@maaleh.ac.il"]
    yossi = users_map["yossi@maaleh.ac.il"]
    michal = users_map["michal@maaleh.ac.il"]
    david = users_map["david@maaleh.ac.il"]

    now = datetime.utcnow()

    # Map kits by name
    kit_map = {k.name: k for k in kits}

    # Find kits for specific roles
    kit_basic = kit_map.get("ערכה בסיסית - Canon 1200D")
    kit_dslr = kit_map.get("ערכת DSLR - Canon 60D")
    kit_sound = kit_map.get("ערכת סאונד 1")
    kit_fs7 = kit_map.get("ערכת Sony FS7")
    kit_nx100 = kit_map.get("ערכת NX100")
    kit_wireless = kit_map.get("ערכת וויירלס - Rode GO II")
    kit_c300 = kit_map.get("ערכת סינמה - Canon C300")

    loans = []

    # 2 active loans
    if kit_dslr:
        loans.append(models.LoanRequest(
            student_id=yossi.id,
            kit_id=kit_dslr.id,
            status="active",
            requested_at=now - timedelta(days=5),
            loan_date=now - timedelta(days=3),
            due_date=now + timedelta(days=4),
            notes="לצילום פרויקט",
            manager_notes="אושר - בהצלחה",
            approved_by=admin.id
        ))

    if kit_sound and michal:
        loans.append(models.LoanRequest(
            student_id=michal.id,
            kit_id=kit_sound.id,
            status="active",
            requested_at=now - timedelta(days=7),
            loan_date=now - timedelta(days=5),
            due_date=now + timedelta(days=2),
            notes="לצילומי גמר",
            manager_notes="אושר",
            approved_by=admin.id
        ))

    # 3 pending requests
    if kit_basic and sara:
        loans.append(models.LoanRequest(
            student_id=sara.id,
            kit_id=kit_basic.id,
            status="pending",
            requested_at=now - timedelta(hours=2),
            notes="לתרגיל ראשון בסמסטר",
            preferred_date=now + timedelta(days=2)
        ))

    if kit_nx100 and yossi:
        loans.append(models.LoanRequest(
            student_id=yossi.id,
            kit_id=kit_nx100.id,
            status="pending",
            requested_at=now - timedelta(hours=5),
            notes="לפרויקט עצמאי",
            preferred_date=now + timedelta(days=3)
        ))

    if kit_wireless and michal:
        loans.append(models.LoanRequest(
            student_id=michal.id,
            kit_id=kit_wireless.id,
            status="pending",
            requested_at=now - timedelta(hours=1),
            notes="לצילום ראיון",
            preferred_date=now + timedelta(days=1)
        ))

    # 2 returned loans
    if kit_basic and sara:
        loans.append(models.LoanRequest(
            student_id=sara.id,
            kit_id=kit_basic.id,
            status="returned",
            requested_at=now - timedelta(days=20),
            loan_date=now - timedelta(days=18),
            due_date=now - timedelta(days=11),
            return_date=now - timedelta(days=12),
            notes="תרגיל ראשון",
            manager_notes="הוחזר במצב טוב",
            approved_by=admin.id
        ))

    if kit_fs7 and david:
        loans.append(models.LoanRequest(
            student_id=david.id,
            kit_id=kit_fs7.id,
            status="returned",
            requested_at=now - timedelta(days=30),
            loan_date=now - timedelta(days=28),
            due_date=now - timedelta(days=21),
            return_date=now - timedelta(days=22),
            notes="סרט גמר",
            manager_notes="הוחזר תקין",
            approved_by=admin.id
        ))

    for loan in loans:
        db.add(loan)

    db.commit()
    print(f"נוצרו {len(loans)} השאלות לדוגמה")


def main():
    print("=== מחסן מעלה - סיד נתונים ===")
    clear_existing()
    users_map = create_users()
    equipment_map = create_equipment()
    kits = create_kits(equipment_map)
    create_sample_loans(users_map, kits)
    print("\n=== הסיד הושלם בהצלחה! ===")
    print("\nפרטי כניסה:")
    print("  מנהל: admin@maaleh.ac.il / admin123")
    print("  סטודנטים: sara@maaleh.ac.il, yossi@maaleh.ac.il, michal@maaleh.ac.il, david@maaleh.ac.il")
    print("  סיסמת סטודנטים: student123")
    db.close()


if __name__ == "__main__":
    main()
