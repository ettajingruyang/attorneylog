// ─── 团队工时日志 · 生产服务器 ───────────────────────────
// 用法：先 npm run build，再 npm start
// 提供：dist/ 静态文件（SPA 回退到 index.html）+ /api/ 数据接口
// 环境变量：PORT（默认 7100）、HOST（默认 0.0.0.0）、DATA_DIR（默认 ./data）

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorklogApi } from './worklog-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 7100;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'worklog-data.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const api = createWorklogApi(DATA_FILE);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await api.handle(req, res, url);
      return;
    }
    // 静态文件 + SPA 回退
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST)) { res.statusCode = 403; res.end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(e) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`团队工时日志服务已启动: http://${HOST}:${PORT}/`);
  console.log(`数据目录: ${DATA_DIR}`);
  console.log('首次使用请在浏览器中打开，完成团队初始化向导。');
});
