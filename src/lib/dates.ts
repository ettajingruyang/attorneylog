// ─── 日期工具（全部使用本地时区） ──────────────────────────

export function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return fmt(new Date());
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysOfMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayCN(s: string): string {
  return WEEK_CN[parseDate(s).getDay()];
}

/** 以周一为一周开始，返回该日期所在周的周一 */
function mondayOf(s: string): string {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmt(d);
}

/** DDL 用「今天 / 明天 / 本周三 / 下周三 / 下下周三 / N周后」表达，不直接列日期 */
export function ddlWeekText(s: string): string {
  const td = today();
  if (s === td) return '今天截止';
  if (s === addDays(td, 1)) return '明天截止';
  const wk = `周${weekdayCN(s)}`;
  const mon0 = mondayOf(td);
  const mon1 = mondayOf(s);
  // 相差几周
  const weeks = Math.round((parseDate(mon1).getTime() - parseDate(mon0).getTime()) / (7 * 86400000));
  if (weeks === 0) return `本${wk}`;
  if (weeks === 1) return `下${wk}`;
  if (weeks === 2) return `下下${wk}`;
  if (weeks > 2) return `${weeks}周后·${wk}`;
  if (weeks === -1) return `上${wk}`;
  return wk;
}

export function formatCN(s: string): string {
  const [y, m, d] = s.split('-');
  return `${Number(y)}年${Number(m)}月${Number(d)}日 周${weekdayCN(s)}`;
}

export function monthCN(ym: string): string {
  const [y, m] = ym.split('-');
  return `${Number(y)}年${Number(m)}月`;
}

export function hoursText(minutes: number): string {
  const h = minutes / 60;
  return `${Number(h.toFixed(1))}h`;
}

export function yuanText(v: number): string {
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`;
  return `¥${Math.round(v).toLocaleString()}`;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
