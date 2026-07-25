@echo off
rem ============================================================
rem  Rooftop Party 2026 — Opening Ceremony launcher
rem  Opens opening.html in KIOSK mode: true fullscreen with NO
rem  "Press Esc to exit" message and no accidental Esc exits.
rem  To close the show afterwards: Alt+F4 (or Alt+Tab away).
rem ============================================================
setlocal
set "PAGE=%~dp0opening.html"

where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --kiosk --new-window "%PAGE%"
  goto :eof
)

where msedge >nul 2>nul
if %errorlevel%==0 (
  start "" msedge --kiosk "%PAGE%" --edge-kiosk-type=fullscreen
  goto :eof
)

rem Fallback: default browser, normal window (page still offers
rem fullscreen on the first tap).
start "" "%PAGE%"
