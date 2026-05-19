#!/bin/bash
# הרץ את זה על השרת אחרי שהעלית את הקבצים
set -e

DOMAIN="YOUR_DOMAIN.com"
APP_DIR="/var/www/warehouse"

echo "=== מתקין תלויות Backend ==="
cd $APP_DIR/backend
pip3 install -r requirements.txt

echo "=== מאתחל מסד נתונים ==="
python3 seed.py

echo "=== מגדיר Supervisor ==="
cp /var/www/warehouse/deploy/warehouse.conf /etc/supervisor/conf.d/
supervisorctl reread
supervisorctl update
supervisorctl start warehouse

echo "=== מגדיר Nginx ==="
# ב-Cloudways תיקיית ה-vhost היא בד"כ:
cp /var/www/warehouse/deploy/nginx.conf /etc/nginx/conf.d/warehouse.conf
nginx -t && systemctl reload nginx

echo "=== הכל מוכן! ==="
echo "הגדר DNS: A record של $DOMAIN → $(curl -s ifconfig.me)"
