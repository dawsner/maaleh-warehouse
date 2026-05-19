#!/bin/bash

echo "=== מפעיל מחסן מעלה ==="
echo ""

# Start backend in background
echo "🚀 מפעיל שרת Backend (port 8000)..."
cd /Users/shacharsrebrenik/Desktop/warehouse-system/backend
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "   Backend PID: $BACKEND_PID"
sleep 2

# Start frontend
echo ""
echo "⚛️  מפעיל Frontend (port 5173)..."
cd /Users/shacharsrebrenik/Desktop/warehouse-system/frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ המערכת פועלת!"
echo ""
echo "   Frontend: http://localhost:5173"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "לעצירת המערכת לחץ Ctrl+C"

# Wait and handle Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'המערכת הופסקה'; exit" INT
wait
