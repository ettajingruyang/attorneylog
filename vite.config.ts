import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
// @ts-expect-error 共享的纯 JS 接口模块
import { createWorklogApi } from "./server/worklog-api.mjs"

// ─── 多人版数据接口：开发模式下数据写到项目内 ./data/ 目录 ──
// （该目录已在 .gitignore 中，不会误提交团队数据）
const api = createWorklogApi(path.resolve(__dirname, "data", "worklog-data.json"))

function worklogDataApi(): Plugin {
  const middleware = (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    if (!url.pathname.startsWith("/api/")) { next(); return }
    api.handle(req, res, url).catch((e: unknown) => {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(e) }))
    })
  }
  return {
    name: "worklog-data-api",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), worklogDataApi()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
