import { useEffect, useState } from 'react';
import { useWorklog } from '@/store/worklog';
import { addDays, hoursText, monthKey } from '@/lib/dates';
import { kvGet, kvSet } from '@/lib/platform';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ReactNode } from 'react';
import { Briefcase, CalendarClock, CalendarDays, CalendarRange, CircleCheck, Clock3, GripVertical, LayoutGrid, Percent, Users, Wallet } from 'lucide-react';

type W = ReturnType<typeof useWorklog>;

interface KpiDef {
  id: string;
  label: string;
  desc: string;
  icon: (p: { className?: string }) => ReactNode;
  accent?: boolean;
  compute: (w: W, date: string) => string;
}

/** 可选的速览卡片：计算都以当前视角成员 + 所选日期为准 */
const KPI_DEFS: KpiDef[] = [
  {
    id: 'todayTotal', label: '当日总工时', desc: '所选日期的全部记录工时', icon: (p) => <Clock3 {...p} />,
    compute: (w, date) => hoursText(w.entries.filter((e) => e.date === date && e.memberId === w.currentMemberId).reduce((a, e) => a + e.minutes, 0)),
  },
  {
    id: 'todayBillable', label: '计费工时', desc: '当日可向客户计费的工时', icon: (p) => <Wallet {...p} />, accent: true,
    compute: (w, date) => hoursText(w.entries.filter((e) => e.date === date && e.memberId === w.currentMemberId && e.billable).reduce((a, e) => a + e.minutes, 0)),
  },
  {
    id: 'todayNonBill', label: '非计费工时', desc: '当日内部事务/学习等工时', icon: (p) => <CalendarClock {...p} />,
    compute: (w, date) => hoursText(w.entries.filter((e) => e.date === date && e.memberId === w.currentMemberId && !e.billable).reduce((a, e) => a + e.minutes, 0)),
  },
  {
    id: 'todoDone', label: '待办完成', desc: '当日待办完成数 / 总数', icon: (p) => <CircleCheck {...p} />,
    compute: (w, date) => {
      const list = w.todos.filter((t) => t.date === date && (t.memberId === w.currentMemberId || t.participants?.includes(w.currentMemberId)));
      return `${list.filter((t) => t.done).length}/${list.length}`;
    },
  },
  {
    id: 'weekTotal', label: '本周工时', desc: '周一至今累计工时', icon: (p) => <CalendarDays {...p} />,
    compute: (w, date) => {
      const dow = new Date(date + 'T00:00:00').getDay();
      const start = addDays(date, -(dow === 0 ? 6 : dow - 1));
      return hoursText(w.entries.filter((e) => e.memberId === w.currentMemberId && e.date >= start && e.date <= date).reduce((a, e) => a + e.minutes, 0));
    },
  },
  {
    id: 'monthTotal', label: '本月工时', desc: '当月累计总工时', icon: (p) => <CalendarRange {...p} />,
    compute: (w, date) => hoursText(w.entries.filter((e) => e.memberId === w.currentMemberId && monthKey(e.date) === monthKey(date)).reduce((a, e) => a + e.minutes, 0)),
  },
  {
    id: 'monthBillRatio', label: '本月计费率', desc: '当月计费工时占比', icon: (p) => <Percent {...p} />,
    compute: (w, date) => {
      const list = w.entries.filter((e) => e.memberId === w.currentMemberId && monthKey(e.date) === monthKey(date));
      const total = list.reduce((a, e) => a + e.minutes, 0);
      const bill = list.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);
      return total > 0 ? `${Math.round((bill / total) * 100)}%` : '—';
    },
  },
  {
    id: 'presenceToday', label: '今日打卡', desc: '当天已打卡成员数', icon: (p) => <Users {...p} />,
    compute: (w, date) => `${w.presence.filter((p) => p.date === date).length}/${w.members.length}`,
  },
  {
    id: 'activeMatters', label: '进行中案件', desc: '激活状态的案件总数', icon: (p) => <Briefcase {...p} />,
    compute: (w) => `${w.matters.filter((m) => m.status === 'active').length}`,
  },
];

/** KPI 布局配置：顺序 = 显示顺序；本设备个人偏好（不同步服务器） */
interface KpiCfg { id: string; on: boolean }

const KPI_KEY = 'worklog-kpi-v1';

function loadCfg(): KpiCfg[] {
  const def: KpiCfg[] = KPI_DEFS.map((d, i) => ({ id: d.id, on: i < 4 }));
  try {
    const raw = kvGet(KPI_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as KpiCfg[];
      const valid = saved.filter((c) => c && KPI_DEFS.some((d) => d.id === c.id));
      const rest = def.filter((d) => !valid.some((v) => v.id === d.id)).map((d) => ({ ...d, on: false }));
      return [...valid, ...rest];
    }
  } catch { /* ignore */ }
  return def;
}

function KpiCard({ def, w, date }: { def: KpiDef; w: W; date: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-full p-2 ${def.accent ? 'bg-wash text-goldink' : 'bg-muted text-muted-foreground'}`}>
          <def.icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{def.label}</p>
          <p className="text-lg font-bold tabular-nums">{def.compute(w, date)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** 首页速览：可拖拽排序、自由开关想看的统计卡片 */
export default function KpiBar({ date }: { date: string }) {
  const w = useWorklog();
  const [cfg, setCfg] = useState<KpiCfg[]>(loadCfg);
  const [editOpen, setEditOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    kvSet(KPI_KEY, JSON.stringify(cfg));
  }, [cfg]);

  const visible = cfg.filter((c) => c.on).map((c) => KPI_DEFS.find((d) => d.id === c.id)!).filter(Boolean);

  const move = (from: number, to: number) => {
    setCfg((cur) => {
      const next = [...cur];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">今日速览 · 按你的习惯自由调整</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-dim hover:text-ink" onClick={() => setEditOpen(true)}>
          <LayoutGrid className="h-3.5 w-3.5" />自定义
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {visible.map((def) => (
          <KpiCard key={def.id} def={def} w={w} date={date} />
        ))}
        {visible.length === 0 && (
          <button type="button"
            className="col-span-2 rounded-xl border border-dashed py-6 text-sm text-muted-foreground transition hover:text-foreground md:col-span-4"
            onClick={() => setEditOpen(true)}>
            还没有速览卡片，点这里挑几个你关心的
          </button>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>自定义速览卡片</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            勾选想看的统计，拖住把手调整顺序。只影响你自己这台设备。
          </p>
          <div className="space-y-1.5">
            {cfg.map((c, i) => {
              const def = KPI_DEFS.find((d) => d.id === c.id);
              if (!def) return null;
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={() => setDragIdx(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIdx != null && dragIdx !== i) {
                      move(dragIdx, i);
                      setDragIdx(i);
                    }
                  }}
                  className={`flex cursor-grab items-center gap-2.5 rounded-lg border p-2 transition ${dragIdx === i ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
                  <Checkbox checked={c.on}
                    onCheckedChange={(v) => setCfg((cur) => cur.map((x, j) => (j === i ? { ...x, on: !!v } : x)))} />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <def.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{def.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{def.desc}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setEditOpen(false)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
