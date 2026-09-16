import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ContractStatus, Matter, Member, Presence, PresenceStatus, ScratchNote, TimeEntry, Todo, TodoCategory, TodoCategoryDef, TodoTagDef, Tombstone } from '@/types';
import { DEFAULT_TODO_CATEGORIES, DEFAULT_TODO_TAGS } from '@/types';
import { apiFetch, kvGet, kvRemove, kvSet } from '@/lib/platform';
import { addDays, today, uid } from '@/lib/dates';

// ─── 状态与动作 ────────────────────────────────────────────

interface State {
  teamName: string; // 团队名（侧栏/登录页品牌位）
  teamSubtitle: string; // 副标题
  members: Member[];
  matters: Matter[];
  entries: TimeEntry[];
  todos: Todo[];
  notes: ScratchNote[];
  presence: Presence[]; // 团队打卡看板（每人每天一条，全员可见）
  tombstones: Tombstone[]; // 已删除记录的墓碑（多设备按条合并时防“删了又复活”）
  todoCategories: TodoCategoryDef[]; // 待办板块（团队自定义，管理员管理）
  todoTags: TodoTagDef[]; // 待办标签（团队自定义，管理员管理）
  currentMemberId: string;
  targetRate: number; // 目标时薪（¥/h），用于固定费用案件折算性价比
}

export interface WorklogActions {
  // 会话
  setup: (opts: { teamName: string; teamSubtitle: string; adminName: string; adminRole: string; password: string }) => Promise<string | null>; // 首次初始化；返回错误信息；null = 成功
  login: (memberId: string, password: string) => Promise<string | null>; // 返回错误信息；null = 登录成功
  logout: () => void;
  // 团队配置
  updateTeamProfile: (teamName: string, teamSubtitle: string) => void;
  // 案件
  addMatter: (m: Omit<Matter, 'id' | 'createdAt' | 'status'>) => void;
  updateMatter: (id: string, patch: Partial<Omit<Matter, 'id' | 'createdAt'>>) => void;
  setMatterStatus: (id: string, status: Matter['status']) => void;
  addPayment: (matterId: string, p: { date: string; amount: number; note?: string }) => void;
  deletePayment: (matterId: string, paymentId: string) => void;
  setTargetRate: (rate: number) => void;
  // 工时
  addEntry: (e: Omit<TimeEntry, 'id'>) => void;
  deleteEntry: (id: string) => void;
  // 待办
  addTodo: (t: { date: string; text: string; matterId: string | null; assigneeId?: string; participantIds?: string[]; tags?: Todo['tags']; ddl?: string | null; category?: TodoCategory }) => void;
  editTodo: (id: string, patch: { text?: string; matterId?: string | null; memberId?: string; participants?: string[]; tags?: Todo['tags']; ddl?: string | null; category?: TodoCategory }) => void;
  moveTodo: (id: string, dir: -1 | 1) => void;
  reorderTodo: (id: string, beforeId: string | null) => void;
  copyTodoToDate: (id: string, date: string) => void; // 复制一条到指定日期
  moveTodoToDate: (id: string, date: string) => void; // 转移到指定日期（仅未完成）
  deleteTodo: (id: string) => void;
  completeTodo: (id: string, minutes: number, billable: boolean, category?: string) => void;
  uncompleteTodo: (id: string) => void;
  updateTodoNote: (id: string, note: string) => void;
  rolloverTodos: () => void;
  // 随记本
  addNote: (date: string, html: string) => void;
  updateNote: (id: string, html: string) => void;
  deleteNote: (id: string) => void;
  // 板块与标签（管理员）
  saveTodoCategories: (cats: TodoCategoryDef[]) => void;
  saveTodoTags: (tags: TodoTagDef[]) => void;
  // 团队
  addMember: (name: string, role: string, color: string) => void;
  setCurrentMember: (id: string) => void;
  setPresence: (status: PresenceStatus, date: string) => void; // 给当前视角成员打卡
  resetPassword: (memberId: string) => Promise<string | null>; // 管理员重置成员密码；返回错误信息或 null
}

interface Worklog extends State, WorklogActions {
  session: Session | null;
  isAdmin: boolean;
}

const Ctx = createContext<Worklog | null>(null);
const LS_KEY = 'team-worklog-v1';
const META_KEY = LS_KEY + '-savedAt';
const SESSION_KEY = 'team-worklog-session-v1';

// ─── 会话（登录令牌） ──────────────────────────────────────

export interface Session {
  token: string;
  memberId: string;
  name: string;
  role: string;
  color: string;
  isAdmin: boolean;
}

function loadSession(): Session | null {
  try {
    const raw = kvGet(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

// ─── 服务器同步（本地键值缓存之外，再写一份到服务器硬盘） ──

function localSavedAt(): number {
  try {
    return Number(kvGet(META_KEY)) || 0;
  } catch {
    return 0;
  }
}

class Unauthorized extends Error {}

async function fetchServerState(token: string): Promise<{ state: State | null; savedAt: number } | null> {
  try {
    const r = await apiFetch('worklog-data', { headers: { 'x-token': token } });
    if (r.status === 401) throw new Unauthorized();
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.state) return { state: migrate(j.state as State), savedAt: Number(j.savedAt) || 0 };
    return { state: null, savedAt: 0 };
  } catch (e) {
    if (e instanceof Unauthorized) throw e;
    return null; // 服务器不可用（如离线），退回本地缓存
  }
}

function postServerState(state: State, savedAt: number, token: string | null) {
  try {
    apiFetch('worklog-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-token': token } : {}) },
      body: JSON.stringify({ savedAt, state }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ─── 待办分类板块 ──────────────────────────────────────────

/** 根据关联案件推断默认板块：客户案件→法律；内部项目/无案件→事务性；id 不存在时退回第一个板块 */
export function guessCategoryForMatter(m: Matter | undefined | null, categories: TodoCategoryDef[]): TodoCategory {
  const fallback = categories[0]?.id ?? '';
  const internalId = categories.find((c) => c.id === 'biz')?.id ?? fallback;
  const clientId = categories.find((c) => c.id === 'legal')?.id ?? fallback;
  if (!m) return internalId;
  if (m.internal) return internalId;
  return clientId;
}

/** 待办的实际分类：数据里的板块被删掉时按关联案件重新推断 */
export function effectiveCategory(t: Pick<Todo, 'category' | 'matterId'>, matters: Matter[], categories: TodoCategoryDef[]): TodoCategory {
  if (t.category && categories.some((c) => c.id === t.category)) return t.category;
  return guessCategoryForMatter(t.matterId ? matters.find((m) => m.id === t.matterId) : null, categories);
}

/** 内部项目（非客户案件）工时记为非计费；外部客户案件记为计费 */
export function isBillableMatter(m: Matter | undefined | null): boolean {
  if (!m) return false;
  return !m.internal;
}

/** 案件合同总额：优先 totalFee，固定费用案件回退 fixedFee */
export function matterTotalFee(m: Matter | undefined | null): number | null {
  if (!m || m.internal) return null;
  if (typeof m.totalFee === 'number' && m.totalFee > 0) return m.totalFee;
  if (m.feeType !== 'hourly' && m.fixedFee > 0) return m.fixedFee;
  return null;
}

/** 已收金额 */
export function matterPaid(m: Matter | undefined | null): number {
  return (m?.payments ?? []).reduce((a, p) => a + (p.amount || 0), 0);
}

// ─── 待办优先级：标签 + DDL 决定自动排序位置 ─────────────────
// rank 越小越靠前；同 rank 内 DDL 早的靠前，无 DDL 排最后
// 标签按 id 或显示名匹配「重要」「紧急」（自定义标签改名/删除后自动降级为普通标签）
function priorityRank(t: Pick<Todo, 'tags' | 'ddl'>, tagDefs: TodoTagDef[]): [number, string] {
  const now = today();
  const tomorrow = addDays(now, 1);
  const label = (id: string) => tagDefs.find((d) => d.id === id)?.label ?? id;
  const ids = t.tags ?? [];
  const imp = ids.some((id) => id === '重要' || label(id) === '重要');
  const urg = ids.some((id) => id === '紧急' || label(id) === '紧急');
  const ddl = t.ddl ?? null;
  const ddlToday = ddl != null && ddl <= now; // 今天到期或已逾期
  const ddlSoon = ddl != null && ddl <= tomorrow; // 明天到期
  let rank: number;
  if (imp && (urg || ddlSoon)) rank = 0; // 重要 + 紧急/临期
  else if (urg || ddlToday) rank = 1; // 紧急，或已到/逾期
  else if (imp) rank = 2; // 仅重要
  else if (ddl != null) rank = 3; // 有 DDL 但不急
  else rank = 4; // 普通
  return [rank, ddl ?? '9999'];
}

/** 把待办按优先级插入到同组（同日、同负责人、同分类板块）中的合适位置，而不是一律追加到末尾 */
function insertByPriority(todos: Todo[], item: Todo, matters: Matter[], categories: TodoCategoryDef[], tagDefs: TodoTagDef[]): Todo[] {
  const key = priorityRank(item, tagDefs);
  const itemCat = effectiveCategory(item, matters, categories);
  const inGroup = (x: Todo) => x.date === item.date && x.memberId === item.memberId && effectiveCategory(x, matters, categories) === itemCat;
  let at = -1;
  for (let i = 0; i < todos.length; i++) {
    const x = todos[i];
    if (!inGroup(x)) continue;
    const kx = priorityRank(x, tagDefs);
    if (kx[0] > key[0] || (kx[0] === key[0] && kx[1] > key[1])) {
      at = i;
      break;
    }
  }
  if (at < 0) {
    let last = -1;
    todos.forEach((x, i) => {
      if (inGroup(x)) last = i;
    });
    at = last < 0 ? todos.length : last + 1;
  }
  const out = [...todos];
  out.splice(at, 0, item);
  return out;
}

// ─── 空状态（未初始化/未登录时的骨架） ─────────────────────

/** 生成一条删除墓碑 */
function tomb(c: Tombstone['c'], id: string): Tombstone {
  return { c, id, at: Date.now() };
}

function emptyState(): State {
  return {
    teamName: '团队工作台',
    teamSubtitle: "Team's Worklog",
    members: [],
    matters: [],
    entries: [],
    todos: [],
    notes: [],
    presence: [],
    tombstones: [],
    todoCategories: DEFAULT_TODO_CATEGORIES,
    todoTags: DEFAULT_TODO_TAGS,
    currentMemberId: '',
    targetRate: 0,
  };
}

// ─── 数据迁移（向前兼容旧版本数据文件） ────────────────────

function migrate(s: State): State {
  let out: State = { ...emptyState(), ...s };
  // 1) 小时费率 → 固定费用模型（历史版本）
  if (out.matters.some((m) => 'hourlyRate' in m)) {
    out = {
      ...out,
      matters: out.matters.map((m) => {
        const { hourlyRate: _drop, ...rest } = m as Matter & { hourlyRate?: number };
        return { ...rest, fixedFee: rest.fixedFee ?? 0 };
      }),
    };
  }
  // 2) 内部项目标记缺省为 false
  if (out.matters.some((m) => m.internal === undefined)) {
    out = { ...out, matters: out.matters.map((m) => ({ ...m, internal: m.internal ?? false })) };
  }
  if (typeof out.targetRate !== 'number') out = { ...out, targetRate: 0 };
  if (!Array.isArray(out.notes)) out = { ...out, notes: [] };
  if (!Array.isArray(out.presence)) out = { ...out, presence: [] };
  if (!Array.isArray(out.tombstones)) out = { ...out, tombstones: [] };
  {
    // 墓碑保留 90 天，足够覆盖任何“旧标签页苏醒”的时间窗
    const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
    out = { ...out, tombstones: out.tombstones.filter((t) => t && t.id && (t.at ?? 0) > cutoff) };
  }
  // 自定义板块/标签：缺省时补默认值；过滤掉结构不合法的条目
  if (!Array.isArray(out.todoCategories) || out.todoCategories.length === 0) out = { ...out, todoCategories: DEFAULT_TODO_CATEGORIES };
  else out = { ...out, todoCategories: out.todoCategories.filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string') };
  if (!Array.isArray(out.todoTags)) out = { ...out, todoTags: DEFAULT_TODO_TAGS };
  else out = { ...out, todoTags: out.todoTags.filter((t) => t && typeof t.id === 'string' && typeof t.label === 'string') };
  // 0) 旧版「AI 与自媒体」板块已下线：归入事务性工作
  if (out.todos.some((t) => (t.category as unknown as string) === 'ai')) {
    out = {
      ...out,
      todos: out.todos.map((t) => ((t.category as unknown as string) === 'ai' ? { ...t, category: 'biz' as TodoCategory } : t)),
    };
  }
  // 0.1) 板块定义里若残留已下线的 'ai' 默认板块，移除之（防止旧浏览器缓存复现）
  if (Array.isArray(out.todoCategories) && out.todoCategories.some((c) => c.id === 'ai')) {
    out = { ...out, todoCategories: out.todoCategories.filter((c) => c.id !== 'ai') };
  }
  // 3) 管理员标记：未标记时第一位成员视为管理员
  if (out.members.some((m) => m.isAdmin === undefined)) {
    out = {
      ...out,
      members: out.members.map((m, i) => ({ ...m, isAdmin: m.isAdmin ?? i === 0 })),
    };
  }
  // 3.5) 收费进程字段：合作状态缺省（归档→已结项，其余客户案件→已签约）；总额缺省取固定费用
  if (out.matters.some((m) => !m.internal && m.contractStatus === undefined)) {
    out = {
      ...out,
      matters: out.matters.map((m) =>
        m.internal || m.contractStatus !== undefined
          ? m
          : { ...m, contractStatus: (m.status === 'archived' ? 'closed' : 'signed') as ContractStatus },
      ),
    };
  }
  if (out.matters.some((m) => !m.internal && m.totalFee === undefined)) {
    out = {
      ...out,
      matters: out.matters.map((m) => (!m.internal && m.totalFee === undefined ? { ...m, totalFee: m.fixedFee > 0 ? m.fixedFee : null } : m)),
    };
  }
  // 4) 计费模式 / 费率 / 参与成员字段（老数据默认固定费用、无费率、全员可见）
  if (out.matters.some((m) => m.feeType === undefined || m.rates === undefined || m.memberIds === undefined)) {
    out = {
      ...out,
      matters: out.matters.map((m) => ({
        ...m,
        feeType: m.feeType ?? 'fixed',
        rates: m.rates ?? {},
        memberIds: m.memberIds ?? [],
      })),
    };
  }
  return out;
}

// ─── Provider ─────────────────────────────────────────────

function load(): State {
  try {
    const raw = kvGet(LS_KEY);
    if (raw) return migrate(JSON.parse(raw) as State);
  } catch {
    /* ignore */
  }
  return emptyState();
}

export function WorklogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);
  const [session, setSession] = useState<Session | null>(loadSession);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false); // 与服务器对账完成前，不往回写，避免覆盖较新数据

  // 每次改动：存浏览器 + 防抖同步到服务器硬盘文件（worklog-data.json）
  // 注意：与服务器对账完成（hydrated）之前不写任何地方——
  // 否则会给本地旧数据盖上新时间戳，导致对账时误判本地更新、覆盖服务器新数据
  useEffect(() => {
    if (!hydrated.current) return;
    const savedAt = Date.now();
    kvSet(LS_KEY, JSON.stringify(state));
    kvSet(META_KEY, String(savedAt));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => postServerState(stateRef.current, savedAt, sessionRef.current?.token ?? null),
      600,
    );
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state]);

  // 登录后/启动时：与服务器对账——谁的数据新用谁；文件为空则把浏览器数据推上去
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    hydrated.current = false;
    fetchServerState(session.token)
      .then((srv) => {
        if (cancelled) return;
        if (srv?.state && srv.savedAt >= localSavedAt()) {
          setState(srv.state);
        } else if (srv) {
          // 本地更新（或文件为空）：把浏览器里的数据写入文件
          postServerState(stateRef.current, Date.now(), session.token);
        }
      })
      .catch((e) => {
        if (e instanceof Unauthorized) {
          // 令牌失效（被重置密码等）：退回登录页
          kvRemove(SESSION_KEY);
          if (!cancelled) setSession(null);
        }
      })
      .finally(() => {
        hydrated.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // 启动时 + 之后每分钟检查：昨天及以前未完成的待办自动顺延到今天（一直后移直到完成）
  useEffect(() => {
    const roll = () => {
      const t = today();
      setState((s) => {
        const stale = s.todos.filter((td) => !td.done && td.date < t);
        if (stale.length === 0) return s;
        return {
          ...s,
          todos: s.todos.map((td) =>
            !td.done && td.date < t ? { ...td, date: t, originDate: td.originDate ?? td.date, updatedAt: Date.now() } : td,
          ),
        };
      });
    };
    roll();
    const timer = setInterval(roll, 60_000);
    return () => clearInterval(timer);
  }, []);

  const actions = useMemo<WorklogActions>(() => ({
    setup: async (opts) => {
      try {
        const r = await apiFetch('setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return j.error ?? '初始化失败，请稍后再试';
        const sess: Session = {
          token: j.token,
          memberId: j.member.id,
          name: j.member.name,
          role: j.member.role,
          color: j.member.color,
          isAdmin: !!j.member.isAdmin,
        };
        kvSet(SESSION_KEY, JSON.stringify(sess));
        setState((s) => ({ ...s, teamName: opts.teamName, teamSubtitle: opts.teamSubtitle, currentMemberId: sess.memberId }));
        setSession(sess);
        return null;
      } catch {
        return '无法连接服务器，请检查网络';
      }
    },
    login: async (memberId, password) => {
      try {
        const r = await apiFetch('login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, password }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return j.error ?? '登录失败，请稍后再试';
        const sess: Session = {
          token: j.token,
          memberId: j.member.id,
          name: j.member.name,
          role: j.member.role,
          color: j.member.color,
          isAdmin: !!j.member.isAdmin,
        };
        kvSet(SESSION_KEY, JSON.stringify(sess));
        setSession(sess);
        // 普通成员登录后固定以自己的身份记录；管理员保持当前视角
        if (!sess.isAdmin) setState((s) => ({ ...s, currentMemberId: sess.memberId }));
        return null;
      } catch {
        return '无法连接服务器，请检查网络';
      }
    },
    logout: () => {
      const sess = sessionRef.current;
      if (sess) {
        apiFetch('logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: sess.token }),
        }).catch(() => {});
      }
      kvRemove(SESSION_KEY);
      setSession(null);
    },
    updateTeamProfile: (teamName, teamSubtitle) =>
      setState((s) => ({ ...s, teamName: teamName.trim() || s.teamName, teamSubtitle })),
    addMatter: (m) =>
      setState((s) => ({
        ...s,
        matters: [...s.matters, { ...m, id: uid(), createdAt: today(), status: 'active' }],
      })),
    updateMatter: (id, patch) =>
      setState((s) => ({ ...s, matters: s.matters.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
    setMatterStatus: (id, status) =>
      setState((s) => ({ ...s, matters: s.matters.map((m) => (m.id === id ? { ...m, status } : m)) })),
    addPayment: (matterId, p) =>
      setState((s) => ({
        ...s,
        matters: s.matters.map((m) =>
          m.id === matterId
            ? { ...m, payments: [...(m.payments ?? []), { id: uid(), date: p.date, amount: p.amount, note: p.note } ] }
            : m,
        ),
      })),
    deletePayment: (matterId, paymentId) =>
      setState((s) => ({
        ...s,
        matters: s.matters.map((m) =>
          m.id === matterId ? { ...m, payments: (m.payments ?? []).filter((p) => p.id !== paymentId) } : m,
        ),
      })),
    setTargetRate: (rate) => setState((s) => ({ ...s, targetRate: Math.max(0, rate) })),
    addEntry: (e) => setState((s) => ({ ...s, entries: [...s.entries, { ...e, id: uid() }] })),
    deleteEntry: (id) =>
      setState((s) => ({ ...s, tombstones: [...s.tombstones, tomb('entries', id)], entries: s.entries.filter((e) => e.id !== id) })),
    addTodo: ({ date, text, matterId, assigneeId, participantIds, tags, ddl, category }) =>
      setState((s) => {
        const owner = assigneeId ?? s.currentMemberId;
        const assigned = owner !== s.currentMemberId;
        const item: Todo = {
          id: uid(), date, memberId: owner, text, matterId, done: false, updatedAt: Date.now(),
          actualMinutes: null, billable: matterId != null, entryId: null, originDate: date,
          assignedBy: assigned ? s.currentMemberId : null,
          participants: (participantIds ?? []).filter((p) => p !== owner),
          tags: tags ?? [],
          ddl: ddl ?? null,
          category: category ?? guessCategoryForMatter(matterId ? s.matters.find((m) => m.id === matterId) : null, s.todoCategories),
        };
        // 按优先级插入到对应分类板块，而不是一律排在最后
        return { ...s, todos: insertByPriority(s.todos, item, s.matters, s.todoCategories, s.todoTags) };
      }),
    editTodo: (id, patch) =>
      setState((s) => {
        const td = s.todos.find((x) => x.id === id);
        if (!td) return s;
        const nextText = patch.text !== undefined && patch.text.trim() ? patch.text.trim() : td.text;
        const matterChanged = patch.matterId !== undefined && patch.matterId !== td.matterId;
        const nextMatterId = patch.matterId !== undefined ? patch.matterId : td.matterId;
        const nextBillable = matterChanged
          ? nextMatterId
            ? isBillableMatter(s.matters.find((m) => m.id === nextMatterId))
            : false
          : td.billable;
        const nextOwner = patch.memberId ?? td.memberId;
        const nextParticipants = (patch.participants ?? td.participants ?? []).filter((p) => p !== nextOwner);
        const nextTags = patch.tags ?? td.tags ?? [];
        const nextDdl = patch.ddl !== undefined ? patch.ddl : (td.ddl ?? null);
        const nextCategory = patch.category ?? td.category;
        const patched = s.todos.map((x) =>
          x.id === id
            ? { ...x, text: nextText, matterId: nextMatterId, billable: nextBillable, memberId: nextOwner, participants: nextParticipants, tags: nextTags, ddl: nextDdl, category: nextCategory, updatedAt: Date.now() }
            : x,
        );
        // 标签、DDL 或分类变了：按优先级重新归位到对应板块
        let todos = patched;
        if (patch.tags !== undefined || patch.ddl !== undefined || patch.category !== undefined) {
          const item = patched.find((x) => x.id === id)!;
          todos = insertByPriority(patched.filter((x) => x.id !== id), item, s.matters, s.todoCategories, s.todoTags);
        }
        return {
          ...s,
          todos,
          // 已完成的待办：同步更新它生成的那条工时记录（工时的记录人保持为实际完成人，不随负责人变化）
          entries: td.entryId
            ? s.entries.map((e) =>
                e.id === td.entryId
                  ? {
                      ...e,
                      description: nextText,
                      matterId: nextMatterId,
                      billable: nextBillable,
                      category: nextMatterId ? '案件工作' : e.category,
                      updatedAt: Date.now(),
                    }
                  : e,
              )
            : s.entries,
        };
      }),
    moveTodo: (id, dir) =>
      setState((s) => {
        const idx = s.todos.findIndex((t) => t.id === id);
        if (idx < 0) return s;
        const td = s.todos[idx];
        const tdCat = effectiveCategory(td, s.matters, s.todoCategories);
        // 同一天、同一记录人、同一分类板块的待办在全局数组中的位置，组内交换即实现自由排序
        const groupIdx = s.todos
          .map((t, i) => ({ t, i }))
          .filter(({ t }) => t.date === td.date && t.memberId === td.memberId && effectiveCategory(t, s.matters, s.todoCategories) === tdCat)
          .map(({ i }) => i);
        const target = groupIdx[groupIdx.indexOf(idx) + dir];
        if (target === undefined) return s;
        const todos = [...s.todos];
        const t = Date.now();
        todos[idx] = { ...todos[idx], updatedAt: t };
        todos[target] = { ...todos[target], updatedAt: t };
        return { ...s, todos };
      }),
    reorderTodo: (id, beforeId) =>
      setState((s) => {
        const from = s.todos.find((t) => t.id === id);
        if (!from || from.id === beforeId) return s;
        const without = s.todos.filter((t) => t.id !== id);
        const todos = [...without];
        if (beforeId === null) {
          // 插到同组（同一天、同一记录人、同一分类板块）末尾
          const fromCat = effectiveCategory(from, s.matters, s.todoCategories);
          const lastIdx = without.reduce(
            (acc, t, i) => (t.date === from.date && t.memberId === from.memberId && effectiveCategory(t, s.matters, s.todoCategories) === fromCat ? i : acc),
            -1,
          );
          todos.splice(lastIdx < 0 ? without.length : lastIdx + 1, 0, { ...from, updatedAt: Date.now() });
        } else {
          const to = without.findIndex((t) => t.id === beforeId);
          if (to < 0) return s;
          todos.splice(to, 0, { ...from, updatedAt: Date.now() });
        }
        return { ...s, todos };
      }),
    copyTodoToDate: (id, date) =>
      setState((s) => {
        const td = s.todos.find((x) => x.id === id);
        if (!td) return s;
        const copy: Todo = {
          ...td,
          id: uid(),
          updatedAt: Date.now(),
          date,
          done: false,
          actualMinutes: null,
          entryId: null,
          originDate: date,
          assignedBy: null,
          participants: td.participants ? [...td.participants] : [],
          tags: td.tags ? [...td.tags] : [],
        };
        return { ...s, todos: [...s.todos, copy] };
      }),
    moveTodoToDate: (id, date) =>
      setState((s) => ({
        ...s,
        todos: s.todos.map((x) => (x.id === id && !x.done ? { ...x, date, updatedAt: Date.now() } : x)),
      })),
    deleteTodo: (id) =>
      setState((s) => {
        const td = s.todos.find((x) => x.id === id);
        return {
          ...s,
          tombstones: [...s.tombstones, tomb('todos', id), ...(td?.entryId ? [tomb('entries', td.entryId)] : [])],
          todos: s.todos.filter((x) => x.id !== id),
          entries: td?.entryId ? s.entries.filter((e) => e.id !== td.entryId) : s.entries,
        };
      }),
    completeTodo: (id, minutes, billable, category) =>
      setState((s) => {
        const td = s.todos.find((x) => x.id === id);
        if (!td) return s;
        const entry: TimeEntry = {
          id: uid(), date: td.date, memberId: s.currentMemberId, matterId: td.matterId,
          category: td.matterId ? '案件工作' : (category ?? '其他事务'),
          description: td.text, minutes, billable, updatedAt: Date.now(),
        };
        const doneItem = { ...td, done: true, actualMinutes: minutes, billable, entryId: entry.id, updatedAt: Date.now() };
        // 完成的待办沉到所属板块（同日、同负责人、同分类）的最底部，不再占注意力
        const cat = effectiveCategory(doneItem, s.matters, s.todoCategories);
        const others = s.todos.filter((x) => x.id !== id);
        const lastIdx = others.reduce(
          (acc, x, i) => (x.date === doneItem.date && x.memberId === doneItem.memberId && effectiveCategory(x, s.matters, s.todoCategories) === cat ? i : acc),
          -1,
        );
        const todos = [...others];
        todos.splice(lastIdx < 0 ? others.length : lastIdx + 1, 0, doneItem);
        return {
          ...s,
          entries: [...s.entries, entry],
          todos,
        };
      }),
    uncompleteTodo: (id) =>
      setState((s) => {
        const td = s.todos.find((x) => x.id === id);
        if (!td) return s;
        return {
          ...s,
          entries: td.entryId ? s.entries.filter((e) => e.id !== td.entryId) : s.entries,
          todos: s.todos.map((x) => (x.id === id ? { ...x, done: false, actualMinutes: null, entryId: null, updatedAt: Date.now() } : x)),
        };
      }),
    updateTodoNote: (id, note) =>
      setState((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, note, updatedAt: Date.now() } : t)) })),
    rolloverTodos: () =>
      setState((s) => {
        const t = today();
        const stale = s.todos.filter((td) => !td.done && td.date < t);
        if (stale.length === 0) return s;
        return {
          ...s,
          todos: s.todos.map((td) =>
            !td.done && td.date < t
              ? { ...td, date: t, originDate: td.originDate ?? td.date, updatedAt: Date.now() }
              : td,
          ),
        };
      }),
    addNote: (date, html) =>
      setState((s) => ({
        ...s,
        notes: [...s.notes, { id: uid(), date, memberId: s.currentMemberId, html, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
      })),
    updateNote: (id, html) =>
      setState((s) => ({
        ...s,
        notes: s.notes.map((n) => (n.id === id ? { ...n, html, updatedAt: new Date().toISOString() } : n)),
      })),
    deleteNote: (id) =>
      setState((s) => ({ ...s, tombstones: [...s.tombstones, tomb('notes', id)], notes: s.notes.filter((n) => n.id !== id) })),
    addMember: (name, role, color) =>
      setState((s) => ({
        ...s,
        members: [...s.members, { id: uid(), name, role, color, joinedAt: today() }],
      })),
    setCurrentMember: (id) => setState((s) => ({ ...s, currentMemberId: id })),
    saveTodoCategories: (cats) =>
      setState((s) => ({ ...s, todoCategories: cats.filter((c) => c.id && c.label.trim()) })),
    saveTodoTags: (tags) =>
      setState((s) => ({ ...s, todoTags: tags.filter((t) => t.id && t.label.trim()) })),
    setPresence: (status, date) =>
      setState((s) => ({
        ...s,
        presence: [
          ...s.presence.filter((p) => !(p.memberId === s.currentMemberId && p.date === date)),
          { memberId: s.currentMemberId, date, status, updatedAt: new Date().toISOString() },
        ],
      })),
    resetPassword: async (memberId) => {
      const sess = sessionRef.current;
      if (!sess) return '未登录';
      try {
        const r = await apiFetch('reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': sess.token },
          body: JSON.stringify({ memberId }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return j.error ?? '重置失败';
        setState((s) => ({
          ...s,
          members: s.members.map((m) => (m.id === memberId ? { ...m, hasPassword: false } : m)),
        }));
        return null;
      } catch {
        return '无法连接服务器';
      }
    },
  }), []);

  const value = useMemo<Worklog>(
    () => ({ ...state, ...actions, session, isAdmin: session?.isAdmin ?? false }),
    [state, actions, session],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorklog(): Worklog {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorklog must be used within WorklogProvider');
  return v;
}
