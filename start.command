#!/bin/bash
# AttorneyLog 一键启动（macOS）：双击本文件即可
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[!] 没有找到 Node.js，正在打开下载页面……"
  echo "    安装完 Node.js 后，重新双击本文件即可。"
  open "https://nodejs.org/"
  exit 1
fi

if [ ! -f dist/index.html ]; then
  echo "[i] 首次运行：正在构建前端（需要几分钟，保持联网）……"
  npm ci && npm run build || {
    echo "[!] 构建失败：把上面的报错整段复制给你的 AI 助手，它会帮你解决。"
    exit 1
  }
fi

echo ""
echo "=============================================="
echo "  AttorneyLog 已启动"
echo "  本机访问：http://localhost:7100"
echo "  团队同事访问：http://这台电脑的IP:7100"
echo "  （同一 Wi-Fi 下，浏览器直接打开即可）"
echo "  关闭本窗口 = 停止服务"
echo "=============================================="
open "http://localhost:7100"
node server/index.mjs
