import { useMemo, useState } from 'react';
import { useWorklog } from '@/store/worklog';
import { addDays, hoursText, monthKey, today } from '@/lib/dates';
import type { BillingInfo, Timesheet, TimesheetRow } from '@/lib/exporters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, FileSpreadsheet, FileText, FileType2 } from 'lucide-react';

type Dimension = 'person' | 'project';

function fmtMinutes(min: number): number {
  return Number((min / 60).toFixed(2));
}

function yuan(v: number): string {
  return `¥${Math.round(v).toLocaleString('zh-CN')}`;
}

export default function ExportPage() {
  const w = useWorklog();
  const t = today();

  const [dimension, setDimension] = useState<Dimension>('person');
  const [memberId, setMemberId] = useState(w.session?.memberId ?? w.currentMemberId);
  const [matterId, setMatterId] = useState(w.matters[0]?.id ?? '');
  const [from, setFrom] = useState(`${monthKey(t)}-01`);
  const [to, setTo] = useState(t);
  const [busy, setBusy] = useState(false);

  const canProject = w.isAdmin;
  const dim: Dimension = canProject ? dimension : 'person';
  const effMemberId = w.isAdmin ? memberId : (w.session?.memberId ?? w.currentMemberId);

  const sheet: Timesheet | null = useMemo(() => {
    if (!from || !to || from > to) return null;
    const inRange = w.entries.filter((e) => e.date >= from && e.date <= to);
    const memberName = (id: string) => w.members.find((m) => m.id === id)?.name ?? '（未知成员）';
    const matterName = (e: (typeof w.entries)[number]) =>
      e.matterId
        ? (w.matters.find((m) => m.id === e.matterId)?.name ?? '（已删除案件）')
        : e.category || '其他事务';
    const now = new Date();
    const generatedAt = `${t} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (dim === 'person') {
      const member = w.members.find((m) => m.id === effMemberId);
      const mine = inRange.filter((e) => e.memberId === effMemberId);
      const rows: TimesheetRow[] = mine
        .map((e) => ({
          date: e.date,
          memberName: member?.name ?? '我',
          matterName: matterName(e),
          description: e.description,
          billable: e.billable,
          hours: fmtMinutes(e.minutes),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      // 按案件/事项小计，客户案件带出该成员在案件上的费率与折算金额
      const byKey = new Map<string, { name: string; minutes: number; rate?: number | null }>();
      for (const e of mine) {
        const name = matterName(e);
        const matter = e.matterId ? w.matters.find((m) => m.id === e.matterId) : undefined;
        const rate = matter && !matter.internal ? ((matter.rates ?? {})[effMemberId] ?? null) : undefined;
        const cur = byKey.get(name) ?? { name, minutes: 0, rate };
        cur.minutes += e.minutes;
        byKey.set(name, cur);
      }
      const groups = [...byKey.values()]
        .map((g) => {
          const hrs = fmtMinutes(g.minutes);
          return g.rate !== undefined
            ? { name: g.name, hours: hrs, rate: g.rate, amount: g.rate != null ? hrs * g.rate : null }
            : { name: g.name, hours: hrs };
        })
        .sort((a, b) => b.hours - a.hours);
      const total = mine.reduce((a, e) => a + e.minutes, 0);
      const billable = mine.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);
      return {
        title: `小时单 · ${member?.name ?? '我'}`,
        scope: `${from} ~ ${to}`,
        generatedAt,
        rows,
        totalHours: fmtMinutes(total),
        billableHours: fmtMinutes(billable),
        groupLabel: '按案件 / 事项汇总',
        groups,
      };
    }

    const matter = w.matters.find((m) => m.id === matterId);
    if (!matter) return null;
    const onMatter = inRange.filter((e) => e.matterId === matterId);
    const rows: TimesheetRow[] = onMatter
      .map((e) => ({
        date: e.date,
        memberName: memberName(e.memberId),
        matterName: matter.name,
        description: e.description,
        billable: e.billable,
        hours: fmtMinutes(e.minutes),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const byMember = new Map<string, number>();
    for (const e of onMatter) byMember.set(e.memberId, (byMember.get(e.memberId) ?? 0) + e.minutes);
    const groups = [...byMember.entries()]
      .map(([id, min]) => ({ name: memberName(id), hours: fmtMinutes(min) }))
      .sort((a, b) => b.hours - a.hours);
    const total = onMatter.reduce((a, e) => a + e.minutes, 0);

    // 客户案件 → 生成账单头（人员 × 费率 × 金额；固定费用附 Cap 行）
    let billing: BillingInfo | undefined;
    if (!matter.internal) {
      const people = [...byMember.entries()]
        .map(([id, min]) => {
          const hrs = fmtMinutes(min);
          const rate = (matter.rates ?? {})[id] ?? null;
          return { name: memberName(id), hours: hrs, rate, amount: rate != null ? hrs * rate : null };
        })
        .sort((a, b) => b.hours - a.hours);
      const allRated = people.length > 0 && people.every((p) => p.amount != null);
      billing = {
        client: matter.client,
        code: matter.code,
        feeType: matter.feeType ?? 'fixed',
        fixedFee: matter.fixedFee ?? 0,
        people,
        totalHours: fmtMinutes(total),
        totalAmount: allRated ? people.reduce((a, p) => a + (p.amount ?? 0), 0) : null,
      };
    }

    return {
      title: `小时单 · ${matter.name}（全所）`,
      scope: `${from} ~ ${to}`,
      generatedAt,
      rows,
      totalHours: fmtMinutes(total),
      billableHours: fmtMinutes(total),
      groupLabel: '按人员汇总',
      groups,
      billing,
    };
  }, [w.entries, w.members, w.matters, dim, effMemberId, matterId, from, to, t]);

  const quick = (kind: 'month' | 'lastMonth' | '30d' | 'all') => {
    if (kind === 'month') {
      setFrom(`${monthKey(t)}-01`);
      setTo(t);
    } else if (kind === 'lastMonth') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      setFrom(`${ym}-01`);
      setTo(`${ym}-${String(lastDay).padStart(2, '0')}`);
    } else if (kind === '30d') {
      setFrom(addDays(t, -29));
      setTo(t);
    } else {
      const dates = w.entries.map((e) => e.date).sort();
      setFrom(dates[0] ?? t);
      setTo(t);
    }
  };

  const doExport = async (kind: 'excel' | 'word' | 'md') => {
    if (!sheet || sheet.rows.length === 0) return;
    setBusy(true);
    try {
      const ex = await import('@/lib/exporters');
      if (kind === 'excel') ex.exportExcel(sheet);
      else if (kind === 'word') await ex.exportWord(sheet);
      else ex.exportMarkdown(sheet);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-dim">Export</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-ink">导出小时单</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          按人或按项目选择时间段，导出 Excel / Word / Markdown；客户案件的按项目导出含费用汇总，可直接作账单附件。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="h-4 w-4" /> 导出设置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 维度 */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-16 text-sm text-ink2">维度</span>
            <div className="flex gap-2">
              <Button
                variant={dim === 'person' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDimension('person')}
                className={dim === 'person' ? 'bg-ink text-paper hover:bg-ink/90' : ''}
              >
                按个人
              </Button>
              {canProject && (
                <Button
                  variant={dim === 'project' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDimension('project')}
                  className={dim === 'project' ? 'bg-ink text-paper hover:bg-ink/90' : ''}
                >
                  按项目（全所）
                </Button>
              )}
            </div>

            {dim === 'person' ? (
              w.isAdmin ? (
                <Select value={effMemberId} onValueChange={setMemberId}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="选择成员" />
                  </SelectTrigger>
                  <SelectContent>
                    {w.members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}（{m.role}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-ink2">
                  {w.members.find((m) => m.id === effMemberId)?.name ?? '我'}（本人）
                </span>
              )
            ) : (
              <Select value={matterId} onValueChange={setMatterId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {w.matters.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.internal ? '（非计费）' : m.feeType === 'hourly' ? '（小时计费）' : ''}
                      {m.status === 'archived' ? '（已归档）' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 时间段 */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-16 text-sm text-ink2">时间段</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-dim">至</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <div className="flex gap-1.5">
              {([
                ['month', '本月'],
                ['lastMonth', '上月'],
                ['30d', '最近30天'],
                ['all', '全部'],
              ] as const).map(([k, label]) => (
                <Button key={k} variant="ghost" size="sm" className="text-xs text-goldink" onClick={() => quick(k)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* 导出按钮 */}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <span className="w-16 text-sm text-ink2">格式</span>
            <Button
              size="sm"
              disabled={busy || !sheet || sheet.rows.length === 0}
              onClick={() => doExport('excel')}
              className="gap-1.5 bg-[#2F4F4F] text-white hover:bg-[#2F4F4F]/90"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
            <Button
              size="sm"
              disabled={busy || !sheet || sheet.rows.length === 0}
              onClick={() => doExport('word')}
              className="gap-1.5 bg-[#4A6B8A] text-white hover:bg-[#4A6B8A]/90"
            >
              <FileText className="h-3.5 w-3.5" /> Word
            </Button>
            <Button
              size="sm"
              disabled={busy || !sheet || sheet.rows.length === 0}
              onClick={() => doExport('md')}
              variant="outline"
              className="gap-1.5"
            >
              <FileType2 className="h-3.5 w-3.5" /> Markdown
            </Button>
            {sheet && sheet.rows.length === 0 && (
              <span className="text-xs text-[#A53A2A]">该时间段内没有工时记录</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 预览 */}
      {sheet && sheet.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-base">
              <span>{sheet.title}</span>
              <span className="text-xs font-normal text-muted-foreground">{sheet.scope}</span>
              <span className="text-xs font-normal text-goldink">
                共 {sheet.rows.length} 条 · {hoursText(sheet.totalHours * 60)}
                {dim === 'person' && `（计费 ${hoursText(sheet.billableHours * 60)}）`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 账单头预览 */}
            {sheet.billing && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.15em] text-dim">
                  费用汇总 · {sheet.billing.client} · {sheet.billing.code}
                </p>
                <table className="w-full max-w-xl text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-dim">
                      <th className="py-1.5 pr-4 font-medium">人员</th>
                      <th className="py-1.5 pr-4 text-right font-medium">小时</th>
                      <th className="py-1.5 pr-4 text-right font-medium">费率</th>
                      <th className="py-1.5 text-right font-medium">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.billing.people.map((p) => (
                      <tr key={p.name} className="border-b border-hov">
                        <td className="py-1.5 pr-4">{p.name}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{p.hours.toFixed(2)}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {p.rate != null ? `${yuan(p.rate)}/h` : <span className="text-[#A53A2A]">未设费率</span>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{p.amount != null ? yuan(p.amount) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-line font-semibold">
                      <td className="py-1.5 pr-4">合计（按小时费率）</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{sheet.billing.totalHours.toFixed(2)}</td>
                      <td />
                      <td className="py-1.5 text-right tabular-nums">
                        {sheet.billing.totalAmount != null ? yuan(sheet.billing.totalAmount) : '—'}
                      </td>
                    </tr>
                    {sheet.billing.feeType === 'fixed' && (
                      <tr className="font-semibold text-goldink">
                        <td className="py-1.5 pr-4">固定费用（Cap）</td>
                        <td />
                        <td />
                        <td className="py-1.5 text-right tabular-nums">
                          {sheet.billing.fixedFee > 0 ? yuan(sheet.billing.fixedFee) : '未填写'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {sheet.billing.feeType === 'fixed' &&
                  sheet.billing.totalAmount != null &&
                  sheet.billing.fixedFee > 0 &&
                  sheet.billing.totalAmount > sheet.billing.fixedFee && (
                    <p className="mt-1.5 text-xs text-goldink">按小时费率合计已超出固定费用，实际按 Cap 收取。</p>
                  )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-dim">
                    <th className="py-2 pr-4 font-medium">日期</th>
                    <th className="py-2 pr-4 font-medium">人员</th>
                    <th className="py-2 pr-4 font-medium">案件 / 事项</th>
                    <th className="py-2 pr-4 font-medium">工作内容</th>
                    <th className="py-2 pr-4 font-medium">计费</th>
                    <th className="py-2 text-right font-medium">小时</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b border-hov">
                      <td className="py-1.5 pr-4 tabular-nums text-ink2">{r.date}</td>
                      <td className="py-1.5 pr-4">{r.memberName}</td>
                      <td className="py-1.5 pr-4">{r.matterName}</td>
                      <td className="max-w-64 truncate py-1.5 pr-4 text-ink2">{r.description}</td>
                      <td className="py-1.5 pr-4">{r.billable ? '计费' : '非计费'}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.hours.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sheet.rows.length > 10 && (
                <p className="mt-2 text-xs text-dim">仅预览前 10 条，导出文件包含全部 {sheet.rows.length} 条。</p>
              )}
            </div>

            {sheet.groups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sheet.groups.slice(0, 8).map((g) => (
                  <span
                    key={g.name}
                    className="rounded-sm bg-hov px-2.5 py-1 text-xs text-ink2"
                  >
                    {g.name} · <span className="font-semibold tabular-nums">{g.hours.toFixed(1)}h</span>
                    {g.amount != null && <span className="ml-1 text-goldink">{yuan(g.amount)}</span>}
                  </span>
                ))}
                {sheet.groups.length > 8 && (
                  <span className="px-1 py-1 text-xs text-dim">等 {sheet.groups.length} 项</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
