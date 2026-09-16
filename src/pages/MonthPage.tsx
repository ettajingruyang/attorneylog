import { useMemo, useState } from 'react';
import { useWorklog, matterPaid, matterTotalFee } from '@/store/worklog';
import { CONTRACT_STATUS_META, type Matter, type TimeEntry } from '@/types';
import { addDays, addMonths, daysOfMonth, hoursText, monthCN, monthKey, parseDate, today, yuanText } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Banknote, CalendarDays, ChevronLeft, ChevronRight, Clock3, PieChart as PieIcon, Wallet } from 'lucide-react';

const NB_COLOR = '#94a3b8';

function mondayOf(d: string): string {
  const dow = (parseDate(d).getDay() + 6) % 7; // 周一 = 0
  return addDays(d, -dow);
}

export default function MonthPage() {
  const w = useWorklog();
  const [mode, setMode] = useState<'week' | 'month'>('month');
  const [ym, setYm] = useState(monthKey(today()));
  const [weekAnchor, setWeekAnchor] = useState(today());
  const [memberId, setMemberId] = useState('all');

  // 复盘区间：月度 = 整月；周度 = 周一至周日
  const [from, to] = useMemo<[string, string]>(() => {
    if (mode === 'month') {
      const days = daysOfMonth(ym);
      return [days[0], days[days.length - 1]];
    }
    const mon = mondayOf(weekAnchor);
    return [mon, addDays(mon, 6)];
  }, [mode, ym, weekAnchor]);

  const entries = useMemo(
    () => w.entries.filter((e) => e.date >= from && e.date <= to && (memberId === 'all' || e.memberId === memberId)),
    [w.entries, from, to, memberId],
  );

  const totalMin = entries.reduce((a, e) => a + e.minutes, 0);
  const billMin = entries.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);
  // 在手待收：所有进行中客户案件的（总额 - 已收）之和
  const feeRows = w.matters
    .filter((m) => m.status === 'active' && !m.internal)
    .map((m) => ({ m, total: matterTotalFee(m) ?? 0, paid: matterPaid(m) }))
    .map((r) => ({ ...r, pending: Math.max(0, r.total - r.paid) }));
  const pendingTotal = feeRows.reduce((a, r) => a + r.pending, 0);
  const billRate = totalMin > 0 ? Math.round((billMin / totalMin) * 100) : 0;

  // 每案件聚合：区间工时 + 全部累计工时（固定费用 ÷ 累计工时 = 折合时薪）
  const matterRows = useMemo(() => {
    return w.matters
      .map((m) => {
        const mine = entries.filter((e) => e.matterId === m.id);
        const total = mine.reduce((a, e) => a + e.minutes, 0);
        const allTime = w.entries.filter((e) => e.matterId === m.id).reduce((a, e) => a + e.minutes, 0);
        const effRate = allTime > 0 && m.fixedFee > 0 ? m.fixedFee / (allTime / 60) : null; // 折合时薪
        const ratio = effRate != null && w.targetRate > 0 ? effRate / w.targetRate : null;
        return { m, total, allTime, effRate, ratio };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [w.matters, w.entries, w.targetRate, entries]);

  // 非计费去向：内部项目按项目名聚合，其余按事务分类聚合
  const nbRows = useMemo(() => {
    const map = new Map<string, number>();
    entries.filter((e) => !e.billable).forEach((e) => {
      const m = e.matterId ? w.matters.find((x) => x.id === e.matterId) : null;
      const key = m ? m.name : e.category;
      map.set(key, (map.get(key) ?? 0) + e.minutes);
    });
    return [...map.entries()].map(([name, min]) => ({ name, min })).sort((a, b) => b.min - a.min);
  }, [entries, w.matters]);

  // 时间分布 donut：全部项目 + 非计费事务
  const segments = useMemo(() => {
    const segs = matterRows.map((r) => ({ label: r.m.name, min: r.total, color: r.m.color }));
    const nbMin = entries.filter((e) => !e.matterId).reduce((a, e) => a + e.minutes, 0);
    if (nbMin > 0) segs.push({ label: '非计费事务', min: nbMin, color: NB_COLOR });
    return segs;
  }, [matterRows, entries]);

  // 性价比表只统计客户案件（内部项目不参与）
  const clientRows = useMemo(() => matterRows.filter((r) => !r.m.internal), [matterRows]);

  const heatmapDays = mode === 'month' ? daysOfMonth(ym) : Array.from({ length: 7 }, (_, i) => addDays(from, i));

  const prev = () => (mode === 'month' ? setYm(addMonths(ym, -1)) : setWeekAnchor(addDays(weekAnchor, -7)));
  const next = () => (mode === 'month' ? setYm(addMonths(ym, 1)) : setWeekAnchor(addDays(weekAnchor, 7)));
  const backToNow = () => {
    setYm(monthKey(today()));
    setWeekAnchor(today());
  };

  const rangeText = mode === 'month' ? monthCN(ym) : `${from} ~ ${to}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-dim">Board</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-ink">看板 · {rangeText}</h1>
          <p className="text-sm text-muted-foreground mt-2">时间花在哪里、钱收回来多少、每个案件的投入产出比如何</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 周 / 月切换 */}
          <div className="flex overflow-hidden rounded-md border">
            {(['week', 'month'] as const).map((md) => (
              <button
                key={md}
                onClick={() => setMode(md)}
                className={`px-3 py-1.5 text-sm transition ${
                  mode === md ? 'bg-ink text-paper' : 'text-ink2 hover:bg-hov'
                }`}
              >
                {md === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部成员</SelectItem>
              {w.members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={backToNow}>{mode === 'month' ? '本月' : '本周'}</Button>
          <Button variant="outline" size="icon" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<Clock3 className="h-4 w-4" />} label="总工时" value={hoursText(totalMin)} />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="计费工时" value={hoursText(billMin)} accent />
        <Kpi icon={<CalendarDays className="h-4 w-4" />} label="非计费工时" value={hoursText(totalMin - billMin)} />
        <Kpi icon={<PieIcon className="h-4 w-4" />} label="计费率" value={`${billRate}%`} />
        <Kpi icon={<Banknote className="h-4 w-4" />} label="在手待收" value={pendingTotal > 0 ? yuanText(pendingTotal) : '—'} accent />
      </div>

      {/* 收款进度看板 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4" />收款进度看板</CardTitle>
        </CardHeader>
        <CardContent>
          {feeRows.filter((r) => r.total > 0 || r.paid > 0).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              还没有设置合同总额或收款记录；到「案件」页编辑案件填写总额、登记收款
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {feeRows
                .filter((r) => r.total > 0 || r.paid > 0)
                .sort((a, b) => b.pending - a.pending)
                .map((r) => (
                  <FeeBoardCard key={r.m.id} m={r.m} total={r.total} paid={r.paid} pending={r.pending} />
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 时间分布 donut */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">时间分布</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {totalMin === 0 ? <p className="py-10 text-sm text-muted-foreground">该区间暂无记录</p> : (
              <>
                <Donut segments={segments} totalMin={totalMin} />
                <div className="w-full space-y-1.5">
                  {segments.map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1 truncate">{s.label}</span>
                      <span className="text-muted-foreground tabular-nums">{hoursText(s.min)}</span>
                      <span className="w-12 text-right font-medium tabular-nums">{Math.round((s.min / totalMin) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 日历热力图 */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-base">每日投入热力图</CardTitle></CardHeader>
          <CardContent>
            <Heatmap days={heatmapDays} entries={entries} />
          </CardContent>
        </Card>
      </div>

      {/* 案件投入产出表 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">案件性价比分析（固定费用 ÷ 累计工时 = 折合时薪）</CardTitle>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              目标时薪
              <input
                type="number" min={0} step={100}
                className="w-24 rounded-md border bg-transparent px-2 py-1 text-sm tabular-nums"
                value={w.targetRate}
                onChange={(e) => w.setTargetRate(Number(e.target.value) || 0)}
              />
              ¥/h
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {clientRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">该区间没有客户案件的工时记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件</TableHead>
                  <TableHead className="text-right">区间工时</TableHead>
                  <TableHead className="text-right">时间占比</TableHead>
                  <TableHead className="text-right">固定费用</TableHead>
                  <TableHead className="text-right">累计工时</TableHead>
                  <TableHead className="text-right">折合时薪</TableHead>
                  <TableHead className="text-right">性价比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientRows.map((r) => (
                  <TableRow key={r.m.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.m.color }} />
                        <div>
                          <p className="font-medium">{r.m.name}</p>
                          <p className="text-xs text-muted-foreground">{r.m.client}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{hoursText(r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{totalMin > 0 ? Math.round((r.total / totalMin) * 100) : 0}%</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{r.m.fixedFee > 0 ? yuanText(r.m.fixedFee) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{hoursText(r.allTime)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.effRate != null ? `¥${Math.round(r.effRate)}/h` : '—'}</TableCell>
                    <TableCell className="text-right"><GradeBadge ratio={r.ratio} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            折合时薪 = 案件固定费用 ÷ 累计投入总工时。投入越多、费用越低，折合时薪越低。性价比按折合时薪对比目标时薪评定：≥100% 为高，≥60% 为中，其余为低。
          </p>
        </CardContent>
      </Card>

      {/* 非计费去向 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">非计费时间去向</CardTitle></CardHeader>
        <CardContent className="space-y-2.5">
          {nbRows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">该区间没有非计费记录</p>}
          {nbRows.map((r) => {
            const nbTotal = nbRows.reduce((a, x) => a + x.min, 0);
            const pct = nbTotal > 0 ? (r.min / nbTotal) * 100 : 0;
            return (
              <div key={r.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm">{r.name}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full rounded bg-[#44403A]" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums">{hoursText(r.min)} · {Math.round(pct)}%</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 小组件 ───────────────────────────────────────────────

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-sm p-2 ${accent ? 'bg-wash text-goldink' : 'bg-muted text-muted-foreground'}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function GradeBadge({ ratio }: { ratio: number | null }) {
  if (ratio == null) return <Badge variant="outline">—</Badge>;
  if (ratio >= 0.8) return <Badge className="bg-[#0D4C3C] hover:bg-[#0D4C3C]">高</Badge>;
  if (ratio >= 0.5) return <Badge className="bg-gold text-ink hover:bg-gold">中</Badge>;
  return <Badge variant="destructive">低</Badge>;
}

function Donut({ segments, totalMin }: { segments: { label: string; min: number; color: string }[]; totalMin: number }) {
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 180 180" className="h-44 w-44">
      <circle cx="90" cy="90" r={R} fill="none" stroke="#EFEAE2" strokeWidth="26" />
      {segments.map((s) => {
        const frac = s.min / totalMin;
        const dash = frac * C;
        const el = (
          <circle key={s.label} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth="26"
            strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
            transform="rotate(-90 90 90)" />
        );
        offset += dash;
        return el;
      })}
      <text x="90" y="86" textAnchor="middle" className="fill-foreground text-lg font-bold">{hoursText(totalMin)}</text>
      <text x="90" y="106" textAnchor="middle" className="fill-muted-foreground" fontSize="11">区间总工时</text>
    </svg>
  );
}

function Heatmap({ days, entries }: { days: string[]; entries: TimeEntry[] }) {
  const byDay = new Map<string, number>();
  entries.forEach((e) => byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.minutes));
  const max = Math.max(60, ...byDay.values());
  const leadBlanks = (parseDate(days[0]).getDay() + 6) % 7; // 周一开头

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadBlanks }).map((_, i) => <span key={`b${i}`} />)}
        {days.map((d) => {
          const min = byDay.get(d) ?? 0;
          const a = min === 0 ? 0 : 0.25 + 0.75 * (min / max);
          const isFuture = d > today();
          return (
            <div key={d} title={`${d.slice(5)} · ${hoursText(min)}`}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border text-xs tabular-nums ${isFuture ? 'opacity-30' : ''}`}
              style={{ background: min > 0 ? `rgba(28,25,23,${a})` : undefined, color: a > 0.55 ? '#fff' : undefined }}>
              <span>{Number(d.slice(8))}</span>
              {min > 0 && <span className="text-[10px] opacity-80">{hoursText(min)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 收款看板卡片 ─────────────────────────────────────────

function FeeBoardCard({ m, total, paid, pending }: { m: Matter; total: number; paid: number; pending: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const st = m.contractStatus ? CONTRACT_STATUS_META[m.contractStatus] : null;
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="h-1" style={{ background: m.color }} />
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{m.name}</p>
            <p className="text-xs text-muted-foreground">{m.client}</p>
          </div>
          {st && (
            <span className="shrink-0 rounded-full px-2 py-px text-[10px] font-medium"
              style={{ background: st.color + '22', color: st.color }}>{st.label}</span>
          )}
        </div>
        <Progress value={pct} />
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
          <span>已收 <span className="font-semibold">{yuanText(paid)}</span></span>
          {total > 0 && <span className="text-muted-foreground">总额 {yuanText(total)}</span>}
          {total > 0 && pending > 0 && <span className="font-semibold text-destructive">待收 {yuanText(pending)}</span>}
          {total > 0 && pending === 0 && <span className="font-semibold" style={{ color: '#3B6D11' }}>已结清</span>}
        </div>
      </div>
    </div>
  );
}
