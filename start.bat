@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] 没有找到 Node.js，正在打开下载页面……
  echo     安装完 Node.js 后，重新双击本文件即可。
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

if not exist dist\index.html (
  echo [i] 首次运行：正在构建前端（需要几分钟，保持联网）……
  call npm ci
  call npm run build
  if errorlevel 1 (
    echo [!] 构建失败：把上面的报错整段复制给你的 AI 助手，它会帮你解决。
    pause
    exit /b 1
  )
)

echo.
echo ==============================================
echo   AttorneyLog 已启动
echo   本机访问：http://localhost:7100
echo   团队同事访问：http://这台电脑的IP:7100
echo   （同一 Wi-Fi 下，浏览器直接打开即可）
echo   关闭本窗口 = 停止服务
echo ==============================================
start "" "http://localhost:7100"
node server/index.mjs
