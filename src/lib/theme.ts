// ─── 主题系统：4 套色系，用户自选，选择存在本设备 ─────────
// 素白（苹果系浅色）/ 奶油（理想系暖调浅色）/ 月夜（Kimi 系深蓝）/ 石墨（苹果系深色）

export interface ThemeDef {
  id: string;
  label: string;
  desc: string;
  dark: boolean;
  swatch: [string, string, string]; // [背景, 主文字, 强调色]
}

export const THEMES: ThemeDef[] = [
  { id: 'snow', label: '素白', desc: '浅色 · 苹果系', dark: false, swatch: ['#F5F5F7', '#1D1D1F', '#0071E3'] },
  { id: 'cream', label: '奶油', desc: '浅色 · 暖橙', dark: false, swatch: ['#FAF5EC', '#2B2520', '#E07B4F'] },
  { id: 'moon', label: '月夜', desc: '深色 · 蓝夜', dark: true, swatch: ['#171B34', '#E9ECF9', '#E5C07B'] },
  { id: 'graphite', label: '石墨', desc: '深色 · 苹果黑', dark: true, swatch: ['#161617', '#F2F2F4', '#5E9EFF'] },
];

const KEY = 'worklog-theme';

// 旧版主题 id → 新主题
const LEGACY: Record<string, string> = { paper: 'cream', mist: 'snow', night: 'moon', deep: 'graphite' };

export function currentTheme(): string {
  try {
    let saved = localStorage.getItem(KEY);
    if (saved && LEGACY[saved]) {
      saved = LEGACY[saved];
      localStorage.setItem(KEY, saved);
    }
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch { /* ignore */ }
  return 'snow';
}

export function applyTheme(id: string) {
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

/** 渲染前调用（避免主题闪烁）：把保存的主题直接写到 <html data-theme> */
export function initTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme());
}
