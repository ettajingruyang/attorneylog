// ─── 团队工时日志 · 多人版数据接口（共享模块） ─────────────
// 同时被 vite 开发中间件和生产服务器 server/index.mjs 使用。
// 数据文件：DATA_DIR/worklog-data.json（含 .bak 备份）；登录令牌：DATA_DIR/worklog-auth.json
//
// 权限模型：
//  - 管理员（isAdmin）：GET 拿到全量数据，POST 可改案件/成员/目标时薪等共享数据
//  - 普通成员：GET 只拿到自己的 todos/entries/notes，POST 只合并自己的部分
//  - 密码哈希（scrypt）永不下发；任何响应都会剥掉 members[].pw
//
// 环境变量：DATA_DIR（数据目录，默认 ./data）

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 登录令牌有效期 30 天
const LOGIN_MAX_FAILS = 5; // 连续失败次数上限
const LOGIN_LOCK_MS = 10 * 60 * 1000; // 触发上限后的锁定时长

// 板块/标签默认定义（与前端 src/types/index.ts 保持一致；id 兼容历史数据）
const DEFAULT_TODO_CATEGORIES = [
  { id: 'legal', label: '法律工作', hint: '案件的具体法律事务', color: '#8FA8C8' },
  { id: 'biz', label: '事务性工作', hint: '沟通协调、投标报价、开票收费等', color: '#D9A86C' },
  { id: 'life', label: '个人生活', hint: '', color: '#9DB89A' },
];
const DEFAULT_TODO_TAGS = [
  { id: '重要', label: '重要', color: '#C0565F' },
  { id: '紧急', label: '紧急', color: '#CE8A4E' },
];

export function createWorklogApi(dataFile) {
  const backupFile = dataFile + '.bak';
  const authFile = path.join(path.dirname(dataFile), 'worklog-auth.json');

  // 登录失败计数（内存态；重启即清零，够用且无持久化负担）
  const loginFails = new Map(); // memberId -> { count, lockedUntil }

  // ── 文件读写 ──
  function readStore() {
    try {
      if (fs.existsSync(dataFile)) {
        const j = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        if (j && j.state) return { savedAt: Number(j.savedAt) || 0, state: j.state };
      }
    } catch { /* fall through */ }
    return { savedAt: 0, state: null };
  }

  function writeStore(savedAt, state) {
    try {
      if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, backupFile);
    } catch { /* ignore */ }
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = dataFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ savedAt, state }));
    fs.renameSync(tmp, dataFile);
  }

  function readAuth() {
    try {
      if (fs.existsSync(authFile)) {
        const j = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
        if (j && j.tokens) return j;
      }
    } catch { /* fall through */ }
    return { tokens: {} };
  }

  function writeAuth(auth) {
    fs.mkdirSync(path.dirname(authFile), { recursive: true });
    const tmp = authFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(auth));
    fs.renameSync(tmp, authFile);
  }

  // ── 密码（scrypt 哈希，明文永不上盘） ──
  function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
    return { salt, hash };
  }

  function verifyPassword(pw, salt, hash) {
    const h = crypto.scryptSync(pw, salt, 32).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
      return false;
    }
  }

  // ── 数据规整 ──
  function normalize(state) {
    if (!state || !Array.isArray(state.members)) return state;
    const members = state.members.map((m, i) => ({
      ...m,
      pw: m.pw ?? null,
      isAdmin: m.isAdmin ?? (i === 0),
    }));
    return {
      ...state,
      members,
      presence: Array.isArray(state.presence) ? state.presence : [],
      todoCategories: Array.isArray(state.todoCategories) && state.todoCategories.length > 0 ? state.todoCategories : DEFAULT_TODO_CATEGORIES,
      todoTags: Array.isArray(state.todoTags) ? state.todoTags : DEFAULT_TODO_TAGS,
      teamName: typeof state.teamName === 'string' && state.teamName ? state.teamName : '团队工作台',
      teamSubtitle: typeof state.teamSubtitle === 'string' ? state.teamSubtitle : "Team's Worklog",
    };
  }

  function stripPw(members) {
    return members.map(({ pw, ...rest }) => ({ ...rest, hasPassword: !!pw }));
  }

  // ── 成员视角：只看自己的记录 ──
  function viewFor(state, member) {
    const s = normalize(state);
    const me = member.id;
    const base = {
      teamName: s.teamName,
      teamSubtitle: s.teamSubtitle,
      members: stripPw(s.members),
      matters: s.matters,
      presence: s.presence ?? [], // 打卡看板：全员可见
      todoCategories: s.todoCategories ?? DEFAULT_TODO_CATEGORIES, // 板块定义：全员可见，管理员可改
      todoTags: s.todoTags ?? DEFAULT_TODO_TAGS,
      targetRate: s.targetRate,
    };
    if (member.isAdmin) {
      return {
        ...base,
        entries: s.entries,
        todos: s.todos,
        notes: s.notes,
        currentMemberId: s.currentMemberId ?? me,
      };
    }
    return {
      ...base,
      entries: (s.entries || []).filter((e) => e.memberId === me),
      todos: (s.todos || []).filter(
        (t) => t.memberId === me || (Array.isArray(t.participants) && t.participants.includes(me)),
      ),
      notes: (s.notes || []).filter((n) => n.memberId === me),
      currentMemberId: me,
    };
  }

  // ── 合并写入：成员只能覆盖自己的切片；管理员整体写入（含分配给同事的待办） ──
  function mergeInto(full, incoming, member) {
    const s = normalize(full);
    if (member.isAdmin) {
      // 防呆护栏：拒绝会导致数据大幅缩水的整体写入
      //（例如某个浏览器拿着过期本地缓存误推）。日常逐条删除不受影响。
      const shrink =
        (Array.isArray(incoming.todos) && incoming.todos.length + 3 < (s.todos?.length ?? 0)) ||
        (Array.isArray(incoming.entries) && incoming.entries.length + 3 < (s.entries?.length ?? 0));
      if (shrink) {
        const err = new Error('rejected: would shrink data');
        err.statusCode = 409;
        throw err;
      }
      const out = {
        ...s,
        entries: Array.isArray(incoming.entries) ? incoming.entries : s.entries,
        todos: Array.isArray(incoming.todos) ? incoming.todos : s.todos,
        notes: Array.isArray(incoming.notes) ? incoming.notes : s.notes,
        presence: Array.isArray(incoming.presence) ? incoming.presence : (s.presence ?? []),
      };
      if (typeof incoming.teamName === 'string' && incoming.teamName.trim()) out.teamName = incoming.teamName.trim();
      if (typeof incoming.teamSubtitle === 'string') out.teamSubtitle = incoming.teamSubtitle;
      if (Array.isArray(incoming.matters)) out.matters = incoming.matters;
      if (Array.isArray(incoming.todoCategories) && incoming.todoCategories.length > 0) out.todoCategories = incoming.todoCategories;
      if (Array.isArray(incoming.todoTags)) out.todoTags = incoming.todoTags;
      if (typeof incoming.targetRate === 'number') out.targetRate = incoming.targetRate;
      if (typeof incoming.currentMemberId === 'string') out.currentMemberId = incoming.currentMemberId;
      if (Array.isArray(incoming.members)) {
        // 合并成员：pw/isAdmin 以服务端为准，客户端无法篡改
        const byId = new Map(s.members.map((m) => [m.id, m]));
        out.members = incoming.members.map((m) => {
          const prev = byId.get(m.id);
          return {
            id: m.id, name: m.name, role: m.role, color: m.color,
            joinedAt: m.joinedAt,
            isAdmin: prev?.isAdmin ?? m.isAdmin ?? false,
            pw: prev?.pw ?? null,
          };
        });
      }
      return out;
    }
    const me = member.id;
    const involvesMe = (x) => x.memberId === me || (Array.isArray(x.participants) && x.participants.includes(me));
    const mergeTodos = () => [
      ...(s.todos || []).filter((x) => !involvesMe(x)),
      ...(incoming.todos || []).filter(involvesMe),
    ];
    const mergeSlice = (key) => [
      ...(s[key] || []).filter((x) => x.memberId !== me),
      ...(incoming[key] || []).filter((x) => x.memberId === me),
    ];
    return {
      ...s,
      entries: mergeSlice('entries'),
      todos: mergeTodos(),
      notes: mergeSlice('notes'),
      presence: mergeSlice('presence'), // 打卡：成员只能覆盖自己的
    };
  }

  // ── 令牌（30 天有效，过期自动吊销） ──
  function issueToken(memberId) {
    const auth = readAuth();
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    // 顺手清理过期令牌
    for (const [t, rec] of Object.entries(auth.tokens)) {
      if (rec.expiresAt && rec.expiresAt < now) delete auth.tokens[t];
    }
    auth.tokens[token] = { memberId, createdAt: now, expiresAt: now + TOKEN_TTL_MS };
    writeAuth(auth);
    return token;
  }

  function memberForToken(token) {
    if (!token) return null;
    const auth = readAuth();
    const rec = auth.tokens[token];
    if (!rec) return null;
    if (rec.expiresAt && rec.expiresAt < Date.now()) return null;
    const { state } = readStore();
    if (!state) return null;
    const s = normalize(state);
    return s.members.find((m) => m.id === rec.memberId) ?? null;
  }

  function revokeMemberTokens(memberId) {
    const auth = readAuth();
    for (const [t, rec] of Object.entries(auth.tokens)) if (rec.memberId === memberId) delete auth.tokens[t];
    writeAuth(auth);
  }

  // ── 登录限速：连续失败 5 次锁定 10 分钟 ──
  function checkLock(memberId) {
    const f = loginFails.get(memberId);
    if (!f) return null;
    if (f.lockedUntil && f.lockedUntil > Date.now()) {
      return Math.ceil((f.lockedUntil - Date.now()) / 60000);
    }
    return null;
  }

  function recordFail(memberId) {
    const f = loginFails.get(memberId) ?? { count: 0, lockedUntil: 0 };
    f.count += 1;
    if (f.count >= LOGIN_MAX_FAILS) {
      f.lockedUntil = Date.now() + LOGIN_LOCK_MS;
      f.count = 0;
    }
    loginFails.set(memberId, f);
  }

  // ── HTTP 辅助 ──
  function sendJson(res, code, body) {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  function validPassword(pw) {
    return typeof pw === 'string' && pw.length >= 6 && pw.length <= 64;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── 路由 ──
  async function handle(req, res, url) {
    const p = url.pathname;

    // 成员列表（公开）：登录页选择成员；顺带返回团队名与初始化状态
    if (p === '/api/members' && req.method === 'GET') {
      const { state } = readStore();
      const s = state ? normalize(state) : null;
      sendJson(res, 200, {
        members: s ? s.members.map((m) => ({ id: m.id, name: m.name, role: m.role, color: m.color, hasPassword: !!m.pw })) : [],
        teamName: s?.teamName ?? '',
        teamSubtitle: s?.teamSubtitle ?? '',
        initialized: !!s,
        // 演示模式：设置了 DEMO_PASSWORD 时，登录页会显示「任选成员 + 该密码」的提示
        demoHint: process.env.DEMO_PASSWORD ? { password: process.env.DEMO_PASSWORD } : null,
      });
      return true;
    }

    // 首次初始化：创建团队 + 管理员（只有数据为空时可用）
    if (p === '/api/setup' && req.method === 'POST') {
      const body = await readBody(req);
      const { state: existing } = readStore();
      if (existing) { sendJson(res, 409, { error: '团队已初始化，如需重置请手动清空数据文件' }); return true; }
      const teamName = String(body.teamName ?? '').trim();
      const teamSubtitle = String(body.teamSubtitle ?? '').trim();
      const adminName = String(body.adminName ?? '').trim();
      const adminRole = String(body.adminRole ?? '').trim() || '合伙人';
      const pw = String(body.password ?? '');
      if (!teamName || teamName.length > 40) { sendJson(res, 400, { error: '团队名需为 1-40 个字符' }); return true; }
      if (!adminName || adminName.length > 30) { sendJson(res, 400, { error: '姓名需为 1-30 个字符' }); return true; }
      if (!validPassword(pw)) { sendJson(res, 400, { error: '密码需为 6-64 个字符' }); return true; }
      const adminId = 'm-' + crypto.randomBytes(6).toString('hex');
      const state = {
        teamName,
        teamSubtitle: teamSubtitle || "Team's Worklog",
        members: [{
          id: adminId, name: adminName, role: adminRole, color: '#4E5452',
          joinedAt: today(), isAdmin: true, pw: hashPassword(pw),
        }],
        matters: [], entries: [], todos: [], notes: [], presence: [],
        currentMemberId: adminId, targetRate: 0,
      };
      writeStore(Date.now(), state);
      const token = issueToken(adminId);
      sendJson(res, 200, {
        token,
        member: { id: adminId, name: adminName, role: adminRole, color: '#4E5452', isAdmin: true },
      });
      return true;
    }

    if (p === '/api/login' && req.method === 'POST') {
      const { memberId, password } = await readBody(req);
      const { state } = readStore();
      if (!state) { sendJson(res, 500, { error: '服务数据未初始化' }); return true; }
      const s = normalize(state);
      const member = s.members.find((m) => m.id === memberId);
      if (!member) { sendJson(res, 404, { error: '成员不存在' }); return true; }
      const locked = checkLock(memberId);
      if (locked) { sendJson(res, 429, { error: `失败次数过多，请 ${locked} 分钟后再试` }); return true; }
      const pwStr = String(password ?? '');
      if (!validPassword(pwStr)) { sendJson(res, 400, { error: '密码需为 6-64 个字符' }); return true; }
      if (member.pw && !verifyPassword(pwStr, member.pw.salt, member.pw.hash)) {
        recordFail(memberId);
        sendJson(res, 401, { error: '密码不正确' });
        return true;
      }
      if (!member.pw) {
        // 首次登录：设置密码
        const next = { ...s, members: s.members.map((m) => (m.id === memberId ? { ...m, pw: hashPassword(pwStr) } : m)) };
        writeStore(Date.now(), next);
      }
      loginFails.delete(memberId);
      const token = issueToken(memberId);
      sendJson(res, 200, {
        token,
        member: { id: member.id, name: member.name, role: member.role, color: member.color, isAdmin: !!member.isAdmin },
        firstLogin: !member.pw,
      });
      return true;
    }

    if (p === '/api/logout' && req.method === 'POST') {
      const { token } = await readBody(req);
      const auth = readAuth();
      delete auth.tokens[token];
      writeAuth(auth);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // 管理员重置成员密码（成员下次登录时重新设置）
    if (p === '/api/reset-password' && req.method === 'POST') {
      const token = req.headers['x-token'];
      const admin = memberForToken(token);
      if (!admin?.isAdmin) { sendJson(res, 403, { error: '仅管理员可重置密码' }); return true; }
      const { memberId } = await readBody(req);
      const { savedAt, state } = readStore();
      if (!state) { sendJson(res, 500, { error: '服务数据未初始化' }); return true; }
      const s = normalize(state);
      if (!s.members.some((m) => m.id === memberId)) { sendJson(res, 404, { error: '成员不存在' }); return true; }
      const next = { ...s, members: s.members.map((m) => (m.id === memberId ? { ...m, pw: null } : m)) };
      writeStore(savedAt, next);
      revokeMemberTokens(memberId);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (p === '/api/worklog-data' && req.method === 'GET') {
      const member = memberForToken(req.headers['x-token']);
      if (!member) { sendJson(res, 401, { error: 'unauthorized' }); return true; }
      const { savedAt, state } = readStore();
      if (!state) { sendJson(res, 200, { state: null, savedAt: 0 }); return true; }
      sendJson(res, 200, { savedAt, state: viewFor(state, member) });
      return true;
    }

    if (p === '/api/worklog-data' && req.method === 'POST') {
      const member = memberForToken(req.headers['x-token']);
      if (!member) { sendJson(res, 401, { error: 'unauthorized' }); return true; }
      const body = await readBody(req);
      if (!body || !body.state) { sendJson(res, 400, { ok: false, error: 'bad payload' }); return true; }
      const { state: full } = readStore();
      try {
        const merged = full ? mergeInto(full, body.state, member) : normalize(body.state);
        writeStore(Date.now(), merged);
      } catch (e) {
        sendJson(res, e.statusCode ?? 500, { ok: false, error: String(e.message ?? e) });
        return true;
      }
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (p.startsWith('/api/')) {
      sendJson(res, 404, { error: 'not found' });
      return true;
    }
    return false;
  }

  return { handle };
}
