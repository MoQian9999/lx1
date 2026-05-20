@echo off
REM ============================================================
REM 桌游集合 - Windows 启动脚本
REM 提示用户输入端口号，检测端口占用，启动服务器
REM ============================================================

echo ========================================
echo   桌游集合 - 局域网联机桌游平台
echo ========================================
echo.

:INPUT_PORT
set /p PORT_INPUT="请输入要使用的端口号（直接回车则默认使用 3000）："

REM 如果直接回车，使用默认端口 3000
if "%PORT_INPUT%"=="" set PORT=3000
if not "%PORT_INPUT%"=="" set PORT=%PORT_INPUT%

REM 检测端口是否被占用
netstat -an | findstr ":%PORT% " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo 端口 %PORT% 已被占用，请更换一个端口
    echo.
    goto INPUT_PORT
)

echo.
echo 正在启动服务器...
echo.

REM 安装依赖（如果需要）
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
    echo.
)

REM 启动服务器
node server.js %PORT%
pause
