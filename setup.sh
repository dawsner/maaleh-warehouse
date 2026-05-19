#!/bin/bash
set -e

echo "=== מתקין מערכת מחסן מעלה ==="
echo ""

# Backend
echo "📦 מתקין תלויות Python..."
cd /Users/shacharsrebrenik/Desktop/warehouse-system/backend
pip install -r requirements.txt

echo ""
echo "🌱 טוען נתוני דוגמה..."
python seed.py

# Frontend
echo ""
echo "⚛️  מתקין תלויות Node.js..."
cd /Users/shacharsrebrenik/Desktop/warehouse-system/frontend
npm install

echo ""
echo "✅ ההתקנה הושלמה!"
echo ""
echo "להפעלת המערכת הרץ: ./start.sh"
echo ""
echo "פרטי כניסה:"
echo "  מנהל: admin@maaleh.ac.il / admin123"
echo "  סטודנט: sara@maaleh.ac.il / student123"
