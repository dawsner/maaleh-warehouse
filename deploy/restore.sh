#!/bin/bash
# שחזור בסיס נתונים מגיבוי.
# שימוש:  ./restore.sh /path/to/warehouse-YYYY-MM-DD_HH-MM-SS.db.gz

set -e

PROJECT_DIR="${PROJECT_DIR:-/Users/shacharsrebrenik/Desktop/warehouse-system}"
DB_PATH="${DB_PATH:-$PROJECT_DIR/backend/warehouse.db}"
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file.db.gz>"
    echo ""
    echo "Available backups:"
    ls -1t "$PROJECT_DIR/backups"/warehouse-*.db.gz 2>/dev/null | head -10
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

# Safety: backup current DB before overwriting
SAFETY_BACKUP="$DB_PATH.before-restore-$(date '+%Y-%m-%d_%H-%M-%S').bak"
cp "$DB_PATH" "$SAFETY_BACKUP"
echo "Current DB saved to: $SAFETY_BACKUP"

# Restore
gunzip -c "$BACKUP_FILE" > "$DB_PATH"
echo "Restored from: $BACKUP_FILE"
echo ""
echo "Restart the backend service to load new data."
