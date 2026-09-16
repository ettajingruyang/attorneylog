import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { initPlatform } from './lib/platform'
import { initTheme } from './lib/theme'

// Cherry 小程序里 localStorage 不可用，先把 cherry.storage 读进内存再渲染
initPlatform().finally(() => {
  // 主题要在渲染前写好 data-theme，避免闪烁
  initTheme()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
})
