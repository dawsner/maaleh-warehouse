# מחסן מעלה — מערכת ניהול השאלות

מערכת ניהול השאלות פנימית לבית הספר לקולנוע מעלה. סטודנטים מבקשים השאלות של ערכות
ציוד, מנהל המחסן מאשר/דוחה, ומקבל תמונה מלאה על מצב הציוד והפעילות.

## תוכן עניינים

1. [טכנולוגיות](#טכנולוגיות)
2. [התקנה לפיתוח](#התקנה-לפיתוח)
3. [הפעלה לפיתוח](#הפעלה-לפיתוח)
4. [פריסה ל-production](#פריסה-ל-production)
5. [תחזוקה שוטפת](#תחזוקה-שוטפת)
6. [פתרון בעיות](#פתרון-בעיות)

---

## טכנולוגיות

**Backend** — Python 3.9+ · FastAPI · SQLAlchemy · SQLite · JWT auth (HS256)

**Frontend** — React 18 · Vite · Tailwind CSS · React Router · Axios

**פריסה** — Nginx · uvicorn · systemd (אופציונלי)

---

## התקנה לפיתוח

### 1. דרישות

- Python 3.9 ומעלה
- Node.js 18 ומעלה
- npm

### 2. Clone והגדרה

```bash
cd ~/Desktop/warehouse-system

# Backend
cd backend
pip3 install -r requirements.txt --break-system-packages
cp .env.example .env
# ערוך את .env והגדר JWT_SECRET_KEY (ראה הוראות בקובץ)

# Seed הראשוני (אופציונלי — יוצר משתמשים וערכות לדוגמה)
python3 seed.py

cd ../frontend
npm install
```

### 3. הגדרות סביבה (.env)

הקובץ `backend/.env` חייב להכיל:

```env
ENV=development                       # development / production
JWT_SECRET_KEY=...                    # מחרוזת אקראית 64 תווים
ACCESS_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=http://localhost:5173
LOGIN_RATE_LIMIT=5                    # ניסיונות login לדקה לכל IP
```

ייצור JWT secret אקראי:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## הפעלה לפיתוח

מהשורש של הפרויקט:

```bash
./start.sh
```

זה מפעיל:

- Backend על `http://localhost:8000` (Swagger ב-`/docs`)
- Frontend על `http://localhost:5173`

**משתמשי דמו** (מהסיד):

| תפקיד | אימייל | סיסמה |
|------|--------|--------|
| מנהל | `admin@maaleh.ac.il` | `admin123` |
| סטודנט | `sara@maaleh.ac.il` | `student123` |

---

## פריסה ל-production

### 1. שרת

מומלץ: Ubuntu 22.04 LTS, 2GB RAM, 20GB דיסק. ספקים: DigitalOcean, AWS Lightsail, Hetzner.

### 2. התקנה על השרת

```bash
# התקנת התלויות
sudo apt update
sudo apt install -y python3 python3-pip nodejs npm nginx sqlite3 certbot python3-certbot-nginx

# Clone הפרויקט
cd /opt
sudo git clone <repo-url> warehouse-system
cd warehouse-system

# Backend
cd backend
sudo pip3 install -r requirements.txt
sudo cp .env.example .env
sudo nano .env   # ערוך עם הערכים ל-production:
                 #   ENV=production
                 #   JWT_SECRET_KEY=<64 תווים אקראיים>
                 #   ALLOWED_ORIGINS=https://warehouse.maale.co.il

# Frontend - בנייה
cd ../frontend
sudo nano .env.production   # VITE_API_URL=https://warehouse.maale.co.il
npm install
npm run build
```

### 3. systemd service ל-backend

```bash
sudo cat > /etc/systemd/system/maaleh-warehouse.service <<EOF
[Unit]
Description=Maaleh Warehouse API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/warehouse-system/backend
EnvironmentFile=/opt/warehouse-system/backend/.env
ExecStart=/usr/local/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now maaleh-warehouse
sudo systemctl status maaleh-warehouse
```

### 4. Nginx + SSL

קונפיג ה-Nginx מצוי ב-`deploy/nginx.conf`. העתק אותו:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/maaleh-warehouse
sudo ln -s /etc/nginx/sites-available/maaleh-warehouse /etc/nginx/sites-enabled/
sudo nano /etc/nginx/sites-available/maaleh-warehouse  # התאם את שם הדומיין
sudo nginx -t
sudo systemctl reload nginx

# SSL חינמי מ-Let's Encrypt
sudo certbot --nginx -d warehouse.maale.co.il
```

### 5. גיבוי אוטומטי

הוסף למשימות cron של root או של המשתמש שמריץ את האפליקציה:

```bash
sudo crontab -e
```

הוסף שורה:

```cron
# גיבוי יומי בשעה 03:00
0 3 * * * /opt/warehouse-system/deploy/backup.sh >> /var/log/maaleh-backup.log 2>&1
```

הסקריפט שומר עד 30 גיבויים אחרונים ב-`backups/`. ראה גם `deploy/restore.sh` לשחזור.

---

## תחזוקה שוטפת

### עדכון קוד מ-git

```bash
cd /opt/warehouse-system
git pull

# אם השתנו תלויות
cd backend && sudo pip3 install -r requirements.txt
cd ../frontend && npm install && npm run build

# הפעלה מחדש של ה-backend
sudo systemctl restart maaleh-warehouse
```

### יצירת משתמש מנהל חדש

```bash
cd /opt/warehouse-system/backend
python3 << 'EOF'
from database import SessionLocal
from auth import get_password_hash
import models

db = SessionLocal()
user = models.User(
    name="שם המנהל",
    email="manager@maaleh.ac.il",
    password_hash=get_password_hash("change-me-on-first-login"),
    role="admin",
    active=True,
)
db.add(user)
db.commit()
print(f"Created user #{user.id}")
EOF
```

### שחזור מגיבוי

```bash
sudo systemctl stop maaleh-warehouse
sudo ./deploy/restore.sh /opt/warehouse-system/backups/warehouse-2026-05-15_03-00-01.db.gz
sudo systemctl start maaleh-warehouse
```

---

## פתרון בעיות

**"JWT_SECRET_KEY is required in production"** — חסר/ריק ב-`.env`. צור secret חדש.

**שגיאת CORS בדפדפן** — `ALLOWED_ORIGINS` ב-`.env` לא כולל את הדומיין של ה-frontend.

**429 Too Many Requests בכניסה** — חסם rate limiter (5 ניסיונות לדקה לכל IP). חכה דקה.

**הכניסה לא נשמרת בין הפעלות בפיתוח** — בלי `JWT_SECRET_KEY` ב-`.env` ה-secret מתחלף בכל restart. הגדר ערך קבוע.

**הסכמה השתנתה אחרי עדכון** — הקוד מריץ migrations אוטומטיות בעלייה (`main.py:_run_migrations`). אם משהו נתקע, בדוק `journalctl -u maaleh-warehouse -n 50`.

---

## רישיון

קוד פנימי, כל הזכויות שמורות לבית הספר לקולנוע מעלה ע"ש אורי אליצור.
