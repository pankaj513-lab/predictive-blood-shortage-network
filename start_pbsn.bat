@echo off
echo Starting PBSN Frontend Dev Server on http://localhost:5173 ...
start "" "http://localhost:5173/index.html"
"C:\Users\panka\AppData\Local\Python\bin\python.exe" "%~dp0dev_server.py" --port 5173
pause
