@echo off
start "Central de Campanha" /b node "%~dp0server.js"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173"
