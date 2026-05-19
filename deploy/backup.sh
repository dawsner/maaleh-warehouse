#!/bin/bash
# גיבוי אוטומטי של בסיס הנתונים.
# שמירה של עד 30 גיבויים אחרונים. ישנים מזה - נמחקים.

set -e

# --- Configuration ---------------------------------------------------------
PROJECT_DIR="${PROJECT_DIR:-/Users/shacharsrebrenik/Desktop/warehouse-system}"
DB_PATH="${DB_PATH:-$PROJECT_DIR/backend/warehouse.db}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
KEEP_COUNT="${KEEP_COUNT:-30}"

# --- Run -------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
    echo "[$(date '+%F %T')] ERROR: DB not found at $DB_PATH" >&2
    exit 1
fi

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
BACKUP_FILE="$BACKUP_DIR/warehouse-$TIMESTAMP.db"

# Use sqlite3 .backup for safe online backup if available, else simple cp
if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
    cp "$DB_PATH" "$BACKUP_FILE"
fi

# Gzip to save space
gzip "$BACKUP_FILE"

echo "[$(date '+%F %T')] Backup created: ${BACKUP_FILE}.gz"

# Cleanup — keep only last $KEEP_COUNT
ls -1t "$BACKUP_DIR"/warehouse-*.db.gz 2>/dev/null | tail -n +"$((KEEP_COUNT + 1))" | xargs -I {} rm -f {} 2>/dev/null || true

REMAINING=$(ls -1 "$BACKUP_DIR"/warehouse-*.db.gz 2>/dev/null | wc -l | tr -d ' ')
echo "[$(date '+%F %T')] Kept last $REMAINING backup(s)"
