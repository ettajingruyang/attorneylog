import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NON_BILLABLE_CATEGORIES, type Todo, type TodoCategory, type TodoCategoryDef, type TodoTag, type TodoTagDef } from '@/types';
import { useWorklog, effectiveCategory, guessCategoryForMatter } from '@/store/worklog';
import { addDays, ddlWeekText, formatCN, hoursText, today } from '@/lib/dates';
import TeamBoard from '@/components/TeamBoard';
import KpiBar from '@/components/KpiBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, NotebookPen, Pencil, Plus, Settings2, StickyNote, Trash2 } from 'lucide-react';

const QUICK_MINUTES = [15, 30, 45, 60, 90, 120, 180];
const HIGHLIGHTS = ['#FDE68A', '#FBCFE8', '#BBF7D0', '#BFDBFE', '#E9D5FF'];
/** 板块/标签的可选色板 */
const CHIP_PALETTE = ['#8FA8C8', '#D9A86C', '#9DB89A', '#9C8FBF', '#C98A8B', '#B48EAD', '#4A6B8A', '#B5651D', '#A53A2A', '#0D4C3C', '#C0565F', '#CE8A4E'];

export default function TodayPage() {
  const w = useWorklog();
  const [date, setDate] = useState(today());
  const member = w.members.find((m) => m.id === w.currentMemberId);

  const dayTodos = useMemo(
    () => w.todos.filter(
      (t) => t.date === date && (t.memberId === w.currentMemberId || t.participants?.includes(w.currentMemberId)),
    ),
    [w.todos, date, w.currentMemberId],
  );
  const dayEntries = useMemo(
    () => w.entries.filter((e) => e.date === date && e.memberId === w.currentMemberId),
    [w.entries, date, w.currentMemberId],
  );

  const matterOf = (id: string | null) => w.matters.find((m) => m.id === id);

  return (
    <div className="space-y-6">
      {/* 日期栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-dim">Daily Log</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-ink">{formatCN(date)}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            当前记录人：{member?.name ?? '—'}（{member?.role ?? '—'}）· 没做完的待办每天自动后移，直到完成为止
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setDate(today())}>回到今天</Button>
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* KPI 速览（可自定义） */}
      <KpiBar date={date} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodoCard date={date} todos={dayTodos} />
        </div>
        <div className="space-y-6">
          <TeamBoard date={date} />
          <Scratchpad date={date} />
        </div>
      </div>

      {/* 当日工时明细 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">当日工时明细（{dayEntries.length} 条）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dayEntries.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              完成左侧待办并勾选，工时就会自动出现在这里
            </p>
          )}
          {[...dayEntries].reverse().map((e) => {
            const m = matterOf(e.matterId);
            return (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m ? m.color : '#94a3b8' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.description}</p>
                  <p className="text-xs text-muted-foreground">{m ? `${m.name} · ${m.client}` : e.category}</p>
                </div>
                <Badge variant={e.billable ? 'default' : 'secondary'}>{e.billable ? '计费' : '非计费'}</Badge>
                <span className="w-14 text-right text-sm font-semibold tabular-nums">{hoursText(e.minutes)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => w.deleteEntry(e.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 标签选择器（重要 / 紧急 / 可选，可多选） ──────────────────

function TagChips({ value, onChange }: { value: TodoTag[]; onChange: (v: TodoTag[]) => void }) {
  const w = useWorklog();
  return (
    <div className="flex gap-1.5">
      {w.todoTags.map((tag) => {
        const on = value.includes(tag.id);
        return (
          <button
            key={tag.id} type="button"
            onClick={() => onChange(on ? value.filter((t) => t !== tag.id) : [...value, tag.id])}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
              on ? 'border-transparent text-white' : 'border-line text-dim hover:text-ink2'
            }`}
            style={on ? { background: tag.color } : undefined}
          >
            {tag.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 板块选择器（法律 / 事务性 / 生活，单选） ──────────────

function CatChips({ value, onChange }: { value: TodoCategory; onChange: (v: TodoCategory) => void }) {
  const w = useWorklog();
  return (
    <div className="flex flex-wrap gap-1.5">
      {w.todoCategories.map((c) => {
        const on = value === c.id;
        return (
          <button
            key={c.id} type="button"
            onClick={() => onChange(c.id)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
              on ? 'border-transparent text-white' : 'border-line text-dim hover:text-ink2'
            }`}
            style={on ? { background: c.color } : undefined}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 今日待办（打勾 = 记工时） ──────────────────────────────

function TodoCard({ date, todos }: { date: string; todos: Todo[] }) {
  const w = useWorklog();
  const [text, setText] = useState('');
  const [matterId, setMatterId] = useState('none');
  const [assigneeId, setAssigneeId] = useState('self');
  const [tags, setTags] = useState<TodoTag[]>([]);
  const [ddl, setDdl] = useState('');
  const [todoCat, setTodoCat] = useState<TodoCategory>(() => w.todoCategories.find((c) => c.id === 'legal')?.id ?? w.todoCategories[0]?.id ?? '');
  const [addParticipants, setAddParticipants] = useState<string[]>([]);
  const [completing, setCompleting] = useState<Todo | null>(null);
  const [hoursInput, setHoursInput] = useState('1');
  const [billable, setBillable] = useState(true);
  const [category, setCategory] = useState<string>(NON_BILLABLE_CATEGORIES[0]);
  // 随记展开：写了随记的待办默认保持展开（可手动收起）；没写的按需展开
  const [noteOpenIds, setNoteOpenIds] = useState<string[]>([]);
  const [noteClosedIds, setNoteClosedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [editText, setEditText] = useState('');
  const [editMatterId, setEditMatterId] = useState('none');
  const [editOwnerId, setEditOwnerId] = useState('');
  const [editParticipants, setEditParticipants] = useState<string[]>([]);
  const [editTags, setEditTags] = useState<TodoTag[]>([]);
  const [editDdl, setEditDdl] = useState('');
  const [editCat, setEditCat] = useState<TodoCategory>(() => w.todoCategories.find((c) => c.id === 'legal')?.id ?? w.todoCategories[0]?.id ?? '');
  const [rescheduling, setRescheduling] = useState<Todo | null>(null);
  const [reschedDate, setReschedDate] = useState(addDays(today(), 1));
  const [chipsOpen, setChipsOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragReadyId, setDragReadyId] = useState<string | null>(null); // 只有按住把手才可拖拽，避免误拖文本
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // ── FLIP 滑动动效：待办位置变化时（完成沉底、拖拽、上下移）平滑滑过去 ──
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const tops = new Map<string, number>();
    rowRefs.current.forEach((el, id) => {
      if (el) tops.set(id, el.getBoundingClientRect().top);
    });
    rowRefs.current.forEach((el, id) => {
      if (!el) return;
      const prev = prevTops.current.get(id);
      const now = tops.get(id);
      if (prev !== undefined && now !== undefined && Math.abs(prev - now) > 1) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${prev - now}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.28s ease';
          el.style.transform = '';
        });
      }
    });
    prevTops.current = tops;
  });

  // 案件可见性：管理员看全部；普通成员只能选「全员案件」或自己被拉进的案件
  const activeMatters = w.matters.filter((m) => {
    if (m.status !== 'active') return false;
    if (w.isAdmin) return true;
    const ids = m.memberIds ?? [];
    return ids.length === 0 || ids.includes(w.currentMemberId);
  });
  const clientMatters = activeMatters.filter((m) => !m.internal);
  const internalMatters = activeMatters.filter((m) => m.internal);
  // 编辑中的待办若关联了当前成员不可选的案件，临时并入下拉列表，避免丢值
  const editingMatter = editing?.matterId ? w.matters.find((m) => m.id === editing.matterId) : undefined;
  const clientForEdit = editingMatter && !editingMatter.internal && !clientMatters.some((m) => m.id === editingMatter.id)
    ? [...clientMatters, editingMatter]
    : clientMatters;
  const internalForEdit = editingMatter?.internal && !internalMatters.some((m) => m.id === editingMatter.id)
    ? [...internalMatters, editingMatter]
    : internalMatters;

  const addOwner = assigneeId !== 'self' ? assigneeId : w.currentMemberId;

  const submit = () => {
    if (!text.trim()) return;
    const target = w.isAdmin && assigneeId !== 'self' ? assigneeId : undefined;
    w.addTodo({
      date,
      text: text.trim(),
      matterId: matterId === 'none' ? null : matterId,
      assigneeId: target,
      participantIds: addParticipants,
      tags,
      ddl: ddl || null,
      category: todoCat,
    });
    setText('');
    setMatterId('none');
    setAssigneeId('self');
    setTags([]);
    setDdl('');
    setTodoCat('legal');
    setAddParticipants([]);
  };

  const openComplete = (t: Todo) => {
    setCompleting(t);
    setHoursInput('1');
    setBillable(t.matterId != null && w.matters.find((m) => m.id === t.matterId)?.internal !== true);
    setCategory(NON_BILLABLE_CATEGORIES[0]);
  };

  const openEdit = (t: Todo) => {
    setEditing(t);
    setEditText(t.text);
    setEditMatterId(t.matterId ?? 'none');
    setEditOwnerId(t.memberId);
    setEditParticipants(t.participants ?? []);
    setEditTags(t.tags ?? []);
    setEditDdl(t.ddl ?? '');
    setEditCat(effectiveCategory(t, w.matters, w.todoCategories));
  };

  const saveEdit = () => {
    if (!editing || !editText.trim()) return;
    w.editTodo(editing.id, {
      text: editText,
      matterId: editMatterId === 'none' ? null : editMatterId,
      memberId: editOwnerId || editing.memberId,
      participants: editParticipants,
      tags: editTags,
      ddl: editDdl || null,
      category: editCat,
    });
    setEditing(null);
  };

  const openReschedule = (t: Todo) => {
    setRescheduling(t);
    setReschedDate(addDays(t.date > today() ? t.date : today(), 1));
  };

  const toggleNote = (t: Todo) => {
    if (t.note) {
      setNoteClosedIds((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]));
    } else {
      setNoteOpenIds((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]));
    }
  };
  const isNoteOpen = (t: Todo) => (t.note ? !noteClosedIds.includes(t.id) : noteOpenIds.includes(t.id));

  // 完成弹窗里以「小时」为单位手动输入，支持 0.2 / 1.8 等小数
  const parsedHours = parseFloat(hoursInput);
  const validHours = Number.isFinite(parsedHours) && parsedHours > 0;
  const parsedMinutes = validHours ? Math.max(1, Math.round(parsedHours * 60)) : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">今日待办</CardTitle>
        <p className="text-xs text-muted-foreground">做完直接打勾，顺手填用时，工时就自动记好了；按住左侧小把手可拖拽排序，新待办会按 DDL 和重要/紧急自动排到前面</p>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="添加待办事项…" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <Select value={matterId} onValueChange={(v) => {
            setMatterId(v);
            // 选了案件就自动建议板块：客户案件→法律，内部项目→事务性（仍可手动改）
            setTodoCat(guessCategoryForMatter(v === 'none' ? null : w.matters.find((m) => m.id === v), w.todoCategories));
          }}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="关联项目" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不关联项目</SelectItem>
              {clientMatters.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              {internalMatters.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}（非计费）</SelectItem>)}
            </SelectContent>
          </Select>
          {w.isAdmin && w.members.length > 1 && (
            <Select value={assigneeId} onValueChange={(v) => {
              setAssigneeId(v);
              const owner = v === 'self' ? w.currentMemberId : v;
              setAddParticipants((cur) => cur.filter((p) => p !== owner));
            }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="分配给" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="self">我自己</SelectItem>
                {w.members.filter((m) => m.id !== w.currentMemberId).map((m) => (
                  <SelectItem key={m.id} value={m.id}>分配给 {m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={submit} className="h-10 w-full gap-1 sm:w-10 sm:px-0">
            <Plus className="h-4 w-4" /><span className="sm:hidden">添加待办</span>
          </Button>
        </div>

        {/* 板块 + 标签 + DDL + 协作成员（可多选） */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">板块</span>
            <CatChips value={todoCat} onChange={setTodoCat} />
            {w.isAdmin && (
              <button type="button" title="自定义板块和标签"
                className="rounded p-1 text-dim transition hover:bg-hov hover:text-ink"
                onClick={() => setChipsOpen(true)}>
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">标签</span>
            <TagChips value={tags} onChange={setTags} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">DDL</span>
            <Input
              type="date"
              min={today()}
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              className="h-7 w-36 text-xs"
            />
            {ddl && (
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setDdl('')}>
                清除
              </button>
            )}
          </div>
          {w.members.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">协作</span>
              <div className="flex flex-wrap gap-1.5">
                {w.members.filter((m) => m.id !== addOwner).map((m) => {
                  const on = addParticipants.includes(m.id);
                  return (
                    <button key={m.id} type="button"
                      onClick={() => setAddParticipants(on ? addParticipants.filter((x) => x !== m.id) : [...addParticipants, m.id])}
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                        on ? 'border-[#4A6B8A] bg-[#4A6B8A] text-white' : 'border-line text-dim hover:border-[#4A6B8A] hover:text-ink2'
                      }`}>
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: m.color }}>{m.name.slice(0, 1)}</span>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {w.isAdmin && assigneeId !== 'self' && (
          <p className="text-xs text-goldink">这条待办会出现在 {w.members.find((m) => m.id === assigneeId)?.name} 的今日待办里，并标注来自你</p>
        )}

        <div className="space-y-4">
          {todos.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">今天还没有待办，添加一条开始吧</p>}
          {w.todoCategories.flatMap((c) => {
            const list = todos.filter((t2) => effectiveCategory(t2, w.matters, w.todoCategories) === c.id);
            if (list.length === 0) return [];
            const header = (
              <div key={`cat-${c.id}`} className="flex items-baseline gap-2 px-1 pt-1">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="text-xs font-bold text-ink2">{c.label}</span>
                {c.hint && <span className="text-[10px] text-muted-foreground">{c.hint}</span>}
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {list.filter((x) => x.done).length}/{list.length}
                </span>
              </div>
            );
            const rows = list.map((t, i) => {
            const m = w.matters.find((x) => x.id === t.matterId);
            const noteOpen = isNoteOpen(t);
            return (
              <div
                key={t.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(t.id, el);
                  else rowRefs.current.delete(t.id);
                }}
                draggable={dragReadyId === t.id}
                onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setDragId(null); setDragReadyId(null); setDropTargetId(null); }}
                onDragOver={(e) => {
                  if (dragId && dragId !== t.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetId(t.id);
                  }
                }}
                onDragLeave={() => setDropTargetId((cur) => (cur === t.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== t.id) w.reorderTodo(dragId, t.id);
                  setDragId(null);
                  setDropTargetId(null);
                }}
                className={`rounded-lg border transition-colors duration-300 ${t.done ? 'bg-muted/50 opacity-75' : ''} ${dropTargetId === t.id ? 'ring-2 ring-gold' : ''} ${dragId === t.id ? 'opacity-50' : ''}`}
                style={{
                  borderLeft: `4px solid ${m ? m.color : '#B8B2A6'}`,
                  background: t.done ? undefined : `${m ? m.color : '#B8B2A6'}1F`,
                }}
              >
                <div className="px-3 py-2.5">
                  {/* 第一行：拖拽 + 勾选 + 完整待办文字（自动换行，绝不截断） */}
                  <div className="flex items-start gap-2.5">
                    <GripVertical
                      className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
                      aria-label="按住拖拽排序"
                      onMouseDown={() => setDragReadyId(t.id)}
                      onMouseUp={() => setDragReadyId(null)}
                    />
                    <Checkbox
                      className="mt-1"
                      checked={t.done}
                      onCheckedChange={(checked) => {
                        if (checked) openComplete(t);
                        else w.uncompleteTodo(t.id);
                      }}
                    />
                    <p className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed ${t.done ? 'text-muted-foreground line-through' : 'font-medium'}`}>{t.text}</p>
                    {t.ddl && (() => {
                      const td = today();
                      const tmr = addDays(td, 1);
                      const overdue = !t.done && t.ddl < td;
                      const isToday = t.ddl === td;
                      const isTmr = t.ddl === tmr;
                      const label = ddlWeekText(t.ddl);
                      const style = overdue || isToday
                        ? 'bg-[#C4564E] text-white'
                        : isTmr
                          ? 'bg-[#CE8A4E] text-white'
                          : 'bg-hov text-ink2';
                      return (
                        <span className={`mt-0.5 flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${style} ${t.done ? 'opacity-60' : ''}`}
                          title={`截止时间 ${t.ddl}`}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          {overdue ? `已逾期·${label}` : label}
                        </span>
                      );
                    })()}
                    {t.done && t.actualMinutes != null && (
                      <Badge variant="outline" className="mt-0.5 shrink-0 tabular-nums">{hoursText(t.actualMinutes)}{t.billable ? ' · 计费' : ''}</Badge>
                    )}
                  </div>
                  {/* 第二行：标签 / 项目 / 人员信息 + 操作按钮 */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[52px]">
                    {t.tags?.filter((tag) => w.todoTags.some((d) => d.id === tag)).map((tag) => (
                      <span key={tag} className="rounded-sm px-1 py-px text-[10px] font-medium text-white" style={{ background: w.todoTags.find((d) => d.id === tag)?.color }}>
                        {w.todoTags.find((d) => d.id === tag)?.label ?? tag}
                      </span>
                    ))}
                    {m && <p className="text-xs" style={{ color: m.color }}>{m.name}</p>}
                    {t.memberId !== w.currentMemberId && (
                      <span className="text-[10px] text-muted-foreground">
                        负责人：{w.members.find((x) => x.id === t.memberId)?.name ?? '?'}
                      </span>
                    )}
                    {t.participants && t.participants.length > 0 && (
                      <span className="text-[10px] text-[#4A6B8A]">
                        协作：{t.participants.map((p) => w.members.find((x) => x.id === p)?.name ?? '?').join('、')}
                      </span>
                    )}
                    {t.assignedBy && t.assignedBy !== t.memberId && (
                      <span className="text-[10px] text-goldink">
                        来自 {w.members.find((x) => x.id === t.assignedBy)?.name ?? '管理员'}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-25"
                        title="上移" disabled={i === 0} onClick={() => w.moveTodo(t.id, -1)}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-25"
                        title="下移" disabled={i === list.length - 1} onClick={() => w.moveTodo(t.id, 1)}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        title="复制 / 转移到指定日期"
                        onClick={() => openReschedule(t)}>
                        <CalendarClock className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className={`h-6 w-6 ${noteOpen || t.note ? 'text-goldink' : 'text-muted-foreground'}`}
                        title="备注 / 要点"
                        onClick={() => toggleNote(t)}>
                        <StickyNote className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        title="编辑待办"
                        onClick={() => openEdit(t)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => w.deleteTodo(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </span>
                  </div>
                </div>
                {noteOpen && (
                  <div className="border-t px-3 py-2">
                    <Textarea
                      rows={2}
                      placeholder="这条待办的要点、注意事项、客户要求…"
                      defaultValue={t.note ?? ''}
                      onBlur={(e) => w.updateTodoNote(t.id, e.target.value)}
                      autoFocus={!t.note}
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            );
            });
            return [header, ...rows];
          })}
          {dragId && todos.length > 1 && (
            <div
              className="rounded-lg border border-dashed border-gold py-2 text-center text-xs text-muted-foreground"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) w.reorderTodo(dragId, null);
                setDragId(null);
                setDropTargetId(null);
              }}
            >
              拖到这里放到最后
            </div>
          )}
        </div>
      </CardContent>

      {/* 完成登记弹窗 */}
      <Dialog open={completing != null} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>登记实际用时</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">{completing?.text}</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-sm">用时（小时）</Label>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                className="w-28 tabular-nums"
                placeholder="如 0.5 / 1.8"
                value={hoursInput}
                onChange={(e) => setHoursInput(e.target.value)}
                autoFocus
              />
              <span className="text-xs text-muted-foreground">支持小数：0.2、0.5、1.8 都可以</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">快捷：</span>
              {QUICK_MINUTES.map((m) => {
                const h = m / 60;
                return (
                  <Button key={m} size="sm" variant={validHours && Math.abs(parsedHours - h) < 1e-9 ? 'default' : 'outline'}
                    onClick={() => setHoursInput(String(h))}>
                    {m >= 60 ? `${h}小时` : `${m}分钟`}
                  </Button>
                );
              })}
            </div>
          </div>
          {completing?.matterId ? (
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={billable} onCheckedChange={setBillable} disabled={w.matters.find((m) => m.id === completing.matterId)?.internal} />
              <Label>
                {w.matters.find((m) => m.id === completing.matterId)?.internal
                  ? '内部项目，自动记为非计费'
                  : '计入计费工时'}
              </Label>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <Label className="shrink-0">非计费分类</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NON_BILLABLE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>取消</Button>
            <Button disabled={!validHours} onClick={() => {
              if (completing && validHours) {
                w.completeTodo(completing.id, parsedMinutes, billable && completing.matterId != null, category);
                setCompleting(null);
              }
            }}>
              完成并记录 {validHours ? hoursText(parsedMinutes) : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 复制 / 转移到指定日期 */}
      <Dialog open={rescheduling != null} onOpenChange={(o) => !o && setRescheduling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>复制 / 转移到指定日期</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">{rescheduling?.text}</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-sm">目标日期</Label>
              <Input
                type="date"
                min={today()}
                className="w-44"
                value={reschedDate}
                onChange={(e) => setReschedDate(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">快捷：</span>
              {([
                ['明天', addDays(today(), 1)],
                ['后天', addDays(today(), 2)],
                ['下周一', addDays(today(), ((8 - new Date().getDay()) % 7) || 7)],
              ] as const).map(([label, d]) => (
                <Button key={label} size="sm" variant={reschedDate === d ? 'default' : 'outline'} onClick={() => setReschedDate(d)}>
                  {label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              复制 = 原待办保留，目标日期多出一条相同的；转移 = 直接把这条挪到目标日期。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduling(null)}>取消</Button>
            <Button
              variant="outline"
              disabled={!reschedDate}
              onClick={() => {
                if (rescheduling && reschedDate) {
                  w.copyTodoToDate(rescheduling.id, reschedDate);
                  setRescheduling(null);
                }
              }}
            >
              复制到该日期
            </Button>
            {rescheduling && !rescheduling.done && (
              <Button
                disabled={!reschedDate}
                onClick={() => {
                  if (rescheduling && reschedDate) {
                    w.moveTodoToDate(rescheduling.id, reschedDate);
                    setRescheduling(null);
                  }
                }}
              >
                转移到该日期
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑待办弹窗 */}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑待办</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">待办内容</Label>
              <Input value={editText} onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">板块</Label>
              <CatChips value={editCat} onChange={setEditCat} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">标签</Label>
              <TagChips value={editTags} onChange={setEditTags} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">截止时间（DDL，可不填）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  min={today()}
                  value={editDdl}
                  onChange={(e) => setEditDdl(e.target.value)}
                  className="w-44"
                />
                {editDdl && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditDdl('')}>
                    清除
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">关联项目</Label>
              <Select value={editMatterId} onValueChange={setEditMatterId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="关联项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联项目</SelectItem>
                  {clientForEdit.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  {internalForEdit.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}（非计费）</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">负责人</Label>
              <Select value={editOwnerId} onValueChange={(v) => {
                setEditOwnerId(v);
                setEditParticipants((cur) => cur.filter((p) => p !== v));
              }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {w.members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {w.members.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-sm">共同参与（可多选，TA 们也会看到这条待办）</Label>
                <div className="flex flex-wrap gap-2">
                  {w.members.filter((m) => m.id !== editOwnerId).map((m) => {
                    const on = editParticipants.includes(m.id);
                    return (
                      <button key={m.id} type="button"
                        onClick={() => setEditParticipants(on ? editParticipants.filter((x) => x !== m.id) : [...editParticipants, m.id])}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                          on ? 'border-ink bg-ink text-paper' : 'border-line text-ink2 hover:border-gold'
                        }`}>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: m.color }}>{m.name.slice(0, 1)}</span>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {editing?.done && (
              <p className="text-xs text-muted-foreground">这条已完成，保存后对应的工时记录会同步更新。</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button disabled={!editText.trim()} onClick={saveEdit}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 板块 / 标签 自定义 */}
      <ManageChipsDialog open={chipsOpen} onOpenChange={setChipsOpen} />
    </Card>
  );
}

// ─── 板块 / 标签自定义（管理员） ───────────────────────────

function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHIP_PALETTE.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full transition ${value === c ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
          style={{ background: c }} />
      ))}
    </div>
  );
}

function ManageChipsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWorklog();
  const [cats, setCats] = useState<TodoCategoryDef[]>(w.todoCategories);
  const [tags, setTags] = useState<TodoTagDef[]>(w.todoTags);
  const uid = () => Math.random().toString(36).slice(2, 10);

  useEffect(() => {
    if (open) { setCats(w.todoCategories); setTags(w.todoTags); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    w.saveTodoCategories(cats.map((c) => ({ ...c, label: c.label.trim() })).filter((c) => c.label));
    w.saveTodoTags(tags.map((t) => ({ ...t, label: t.label.trim() })).filter((t) => t.label));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>自定义板块与标签</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          全团队共享。删除板块后，原有待办会自动归入首个板块；标签改名不影响已有待办。
        </p>

        <div className="space-y-3">
          <Label className="text-sm font-semibold">待办板块</Label>
          {cats.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2">
              <div className="flex-1 space-y-1.5">
                <Input className="h-8 text-sm" placeholder="板块名称" value={c.label}
                  onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input className="h-7 text-xs text-muted-foreground" placeholder="备注（选填）" value={c.hint ?? ''}
                  onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)))} />
                <ColorDots value={c.color} onChange={(color) => setCats(cats.map((x, j) => (j === i ? { ...x, color } : x)))} />
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={cats.length <= 1}
                onClick={() => setCats(cats.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full"
            onClick={() => setCats([...cats, { id: uid(), label: '', hint: '', color: CHIP_PALETTE[cats.length % CHIP_PALETTE.length] }])}>
            <Plus className="mr-1 h-3.5 w-3.5" />添加板块
          </Button>
        </div>

        <div className="space-y-3 border-t pt-3">
          <Label className="text-sm font-semibold">待办标签</Label>
          {tags.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border p-2">
              <Input className="h-8 flex-1 text-sm" placeholder="标签名称（如：重要 / 紧急）" value={t.label}
                onChange={(e) => setTags(tags.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <ColorDots value={t.color} onChange={(color) => setTags(tags.map((x, j) => (j === i ? { ...x, color } : x)))} />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setTags(tags.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full"
            onClick={() => setTags([...tags, { id: uid(), label: '', color: CHIP_PALETTE[(tags.length + 4) % CHIP_PALETTE.length] }])}>
            <Plus className="mr-1 h-3.5 w-3.5" />添加标签
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 随记本 ────────────────────────────────────────────────

function Scratchpad({ date }: { date: string }) {
  const w = useWorklog();
  const editorRef = useRef<HTMLDivElement>(null);
  const dayNotes = useMemo(
    () => w.notes.filter((n) => n.date === date && n.memberId === w.currentMemberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [w.notes, date, w.currentMemberId],
  );

  const highlight = (color: string) => {
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('hiliteColor', false, color);
  };

  // 真正去掉选区里的高亮：hiliteColor 'transparent' 在 Chromium 里清不掉已有高亮，
  // 所以抽离选区内容 → 剥掉背景色样式 → 原样塞回
  const clearHighlight = () => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    if (sel.isCollapsed) {
      // 没选中文字：清掉光标所在那一层（及外层）的背景色
      let node: Node | null = sel.anchorNode;
      while (node && node !== el) {
        if (node instanceof HTMLElement && node.style.backgroundColor) {
          node.style.backgroundColor = '';
          if (!node.getAttribute('style')) node.removeAttribute('style');
        }
        node = node.parentNode;
      }
      return;
    }
    const range = sel.getRangeAt(0);
    const tmp = document.createElement('div');
    tmp.appendChild(range.extractContents());
    tmp.querySelectorAll<HTMLElement>('[style]').forEach((n) => {
      n.style.backgroundColor = '';
      if (!n.getAttribute('style')) n.removeAttribute('style');
    });
    // 去掉已经没有任何样式的空壳 span
    tmp.querySelectorAll('span:not([style]):not([class])').forEach((s) => {
      s.replaceWith(...Array.from(s.childNodes));
    });
    const out = document.createDocumentFragment();
    while (tmp.firstChild) out.appendChild(tmp.firstChild);
    range.insertNode(out);
    sel.removeAllRanges();
  };

  const save = () => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText.trim();
    if (!text) return;
    w.addNote(date, el.innerHTML);
    el.innerHTML = '';
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><NotebookPen className="h-4 w-4" />随记本</CardTitle>
        <p className="text-xs text-muted-foreground">电话记录、客户指示、临时想法——写完顺手存一条</p>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {/* 编辑器 */}
        <div className="rounded-lg border">
          <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
            <span className="mr-1 text-xs text-muted-foreground">高亮：</span>
            {HIGHLIGHTS.map((c) => (
              <button key={c} type="button" className="h-5 w-5 rounded border border-black/10"
                style={{ background: c }} onMouseDown={(e) => { e.preventDefault(); highlight(c); }} />
            ))}
            <button type="button" className="h-5 rounded border border-black/10 px-1.5 text-[10px] text-muted-foreground"
              title="选中高亮文字后点这里去掉高亮"
              onMouseDown={(e) => { e.preventDefault(); clearHighlight(); }}>清除</button>
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[90px] px-3 py-2 text-sm outline-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-['写点什么…例如_14:30_接到某某电话，要求周五前出意见']"
          />
        </div>
        <Button variant="outline" className="w-full" onClick={save}>存入随记</Button>

        {/* 当日随记列表 */}
        <div className="space-y-2">
          {dayNotes.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">今天还没有随记</p>}
          {dayNotes.map((n) => (
            <div key={n.id} className="group relative rounded-lg border bg-surface px-3 py-2.5">
              <div className="pr-6 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: n.html }} />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-6 w-6 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                  onClick={() => w.deleteNote(n.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
