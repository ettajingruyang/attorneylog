// ─── Cherry Studio MiniApp 适配层 ─────────────────────────────
// 在 Cherry 客户端小程序沙箱里：localStorage 被禁、fetch 被禁、下载被禁，
// 必须改用 window.cherry 提供的 storage / network.fetch / file.export。
// 在普通浏览器里：行为与之前完全一致。
//
// 启动时必须先 await initPlatform() 再渲染（见 main.tsx），
// 之后 kvGet/kvSet 都是同步接口，业务代码无需感知差异。

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const cherry: any;

export const isCherry: boolean =
  typeof window !== 'undefined' && typeof (window as any).cherry !== 'undefined';

// Cherry 沙箱里页面 origin 是 opaque，相对路径的 api/ 会指向包内文件，
// 所以小程序里需通过 VITE_API_BASE 指定线上 API 的绝对地址（构建时注入）。
// 浏览器里保持相对路径（兼容根路径和任意子路径部署）。
const CHERRY_API_BASE = String(import.meta.env.VITE_API_BASE ?? '');

// ─── 键值存储（同步读 + 后台持久化） ──────────────────────────

const mem = new Map<string, string>();

/** 启动时把 cherry.storage 全部读进内存；浏览器模式无需任何操作 */
export async function initPlatform(): Promise<void> {
  if (!isCherry) return;
  const { keys } = await cherry.storage.keys();
  await Promise.all(
    (keys as string[]).map(async (k) => {
      const { value } = await cherry.storage.get(k);
      if (value != null) mem.set(k, value);
    }),
  );
}

export function kvGet(key: string): string | null {
  if (isCherry) return mem.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function kvSet(key: string, value: string): void {
  if (isCherry) {
    mem.set(key, value);
    cherry.storage.set(key, value).catch(() => {});
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function kvRemove(key: string): void {
  if (isCherry) {
    mem.delete(key);
    cherry.storage.delete(key).catch(() => {});
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ─── 网络（小程序里走 cherry.network.fetch，且没有 CORS 问题） ──

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

interface ApiInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** 与 fetch 返回同样的 Response，业务代码无感知。path 形如 'worklog-data' / 'login' */
export async function apiFetch(path: string, init: ApiInit = {}): Promise<Response> {
  if (!isCherry) {
    return fetch(`api/${path}`, { ...init, cache: init.method ? undefined : 'no-store' });
  }
  const r = await cherry.network.fetch({
    url: `${CHERRY_API_BASE}api/${path}`,
    method: init.method ?? 'GET',
    headers: init.headers,
    body: init.body ? bytesToB64(new TextEncoder().encode(init.body)) : undefined,
  });
  const bytes = b64ToBytes(r.body ?? '');
  return new Response(bytes.buffer as ArrayBuffer, { status: r.status, headers: r.headers });
}

// ─── 导出文件（小程序里 <a download> 被禁，走 file.save + file.export） ──

export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (!isCherry) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const b64 = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
  const tmp = `export-${Date.now()}`;
  await cherry.file.save(tmp, b64);
  try {
    await cherry.file.export(tmp, { suggestedName: filename });
  } finally {
    cherry.file.delete(tmp).catch(() => {});
  }
}
