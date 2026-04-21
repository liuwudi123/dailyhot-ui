@echo off
setlocal
CHCP 65001 > nul

echo.
echo 🚀 正在启动全栈情报局每日看板...
echo ----------------------------------

:: 启动后端 API
echo 1. 正在启动后端 API (端口 6688)...
start "DailyHot API" cmd /k "cd api && npm run dev"

:: 等待一小会
timeout /t 2 /nobreak > nul

:: 启动前端 UI
echo 2. 正在启动前端 看板 (端口 6699)...
start "DailyHot UI" cmd /k "npm run dev"

echo.
echo ✅ 服务已在独立窗口启动！
echo    - 前端地址: http://localhost:6699
echo    - API 地址: http://localhost:6688
echo.
echo 你可以关闭这个控制台窗口了。
pause > nul
