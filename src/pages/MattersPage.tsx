import { useState } from 'react';
import { useWorklog, matterPaid, matterTotalFee } from '@/store/worklog';
import { CONTRACT_STATUS_META, type ContractStatus, type Matter, type MatterFeeType } from '@/types';
import { hoursText, monthKey, today, yuanText } from '@/lib/dates';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Archive, ArchiveRestore, Banknote, FolderOpen, Pencil, Plus, Trash2, Users } from 'lucide-react';

const COLORS = ['#C98A8B', '#D9A86C', '#D6C28B', '#9DB89A', '#7FB5B5', '#8FA8C8', '#9C8FBF', '#B48EAD', '#C9ADA7', '#A3B18A', '#5F8D8B', '#C08497', '#A68A78'];

export default function MattersPage() {
  const w = useWorklog();
  const [showArchived, setShowArchived] = useState(false);
  const thisMonth = monthKey(today());

  const matters = w.matters.filter((m) => (showArchived ? m.status === 'archived' : m.status === 'active'));
  const clientMatters = matters.filter((m) => !m.internal);
  const internalMatters = matters.filter((m) => m.internal);

  const stats = (matterId: string) => {
    const all = w.entries.filter((e) => e.matterId === matterId);
    const bill = all.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);
    const nonBill = all.filter((e) => !e.billable).reduce((a, e) => a + e.minutes, 0);
    const month = all.filter((e) => monthKey(e.date) === thisMonth).reduce((a, e) => a + e.minutes, 0);
    return { bill, nonBill, month };
  };

  const rateSummary = (m: Matter) => {
    const rs = Object.values(m.rates ?? {}).filter((v) => v > 0);
    if (rs.length === 0) return '未设费率';
    if (Math.min(...rs) === Math.max(...rs)) return `¥${Math.min(...rs)}/h`;
    return `¥${Math.min(...rs)}–${Math.max(...rs)}/h`;
  };

  const renderCard = (m: Matter) => {
          const s = stats(m.id);
          const totalH = (s.bill + s.nonBill) / 60;
          const effRate = totalH > 0 && m.fixedFee > 0 ? m.fixedFee / totalH : null; // 折合时薪
          const budgetPct = m.budgetHours ? Math.min(100, Math.round((totalH / m.budgetHours) * 100)) : null;
          const teamNames = (m.memberIds ?? [])
            .map((id) => w.members.find((x) => x.id === id)?.name)
            .filter(Boolean) as string[];
          return (
            <Card key={m.id} className="overflow-hidden">
              <div className="h-1.5" style={{ background: m.color }} />
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold leading-tight">{m.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{m.client}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline" className="font-mono text-xs">{m.code}</Badge>
                    {!m.internal && m.contractStatus && (
                      <span className="rounded-full px-2 py-px text-[10px] font-medium"
                        style={{ background: CONTRACT_STATUS_META[m.contractStatus].color + '22', color: CONTRACT_STATUS_META[m.contractStatus].color }}>
                        {CONTRACT_STATUS_META[m.contractStatus].label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="累计工时" value={hoursText(s.bill + s.nonBill)} />
                  <Stat label="本月投入" value={hoursText(s.month)} />
                  <Stat label="折合时薪" value={effRate != null ? `¥${Math.round(effRate)}` : '—'} />
                </div>

                {!m.internal && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      {m.feeType === 'hourly' ? '小时计费' : '固定费用（Cap）'}
                    </span>
                    <span className="font-bold tabular-nums">
                      {m.feeType === 'hourly' ? rateSummary(m) : m.fixedFee > 0 ? yuanText(m.fixedFee) : '—'}
                    </span>
                  </div>
                )}

                {!m.internal && <FeeProgress matter={m} />}

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {teamNames.length > 0 ? teamNames.join('、') : '全员可记录'}
                  </span>
                </div>

                {m.budgetHours != null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>预算消耗 {totalH.toFixed(1)}h / {m.budgetHours}h</span>
                      <span className={budgetPct! >= 90 ? 'font-semibold text-destructive' : ''}>{budgetPct}%</span>
                    </div>
                    <Progress value={budgetPct!} className={budgetPct! >= 90 ? '[&>div]:bg-destructive' : ''} />
                  </div>
                )}

                {w.isAdmin && (
                  <div className="flex gap-2">
                    <EditMatterDialog matter={m} />
                    <Button
                      variant="ghost" size="sm" className="flex-1 text-muted-foreground"
                      onClick={() => w.setMatterStatus(m.id, m.status === 'active' ? 'archived' : 'active')}
                    >
                      {m.status === 'active'
                        ? <><Archive className="mr-1.5 h-3.5 w-3.5" />归档案件</>
                        : <><ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />恢复案件</>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-dim">Matters</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-ink">案件管理</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {w.isAdmin
              ? '客户案件支持固定费用或小时计费；可指定参与成员与各自小时费率'
              : '团队案件一览（新建、编辑和归档由管理员操作）'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '查看进行中' : '查看已归档'}
          </Button>
          {w.isAdmin && <NewMatterDialog />}
        </div>
      </div>

      {matters.length === 0 && (
        <Card><CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
          <FolderOpen className="h-8 w-8" />
          <p className="text-sm">{showArchived ? '没有已归档的案件' : '还没有案件，点击右上角「新建案件」开始'}</p>
        </CardContent></Card>
      )}

      {clientMatters.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.25em] text-dim">客户案件 · 计费</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{clientMatters.map(renderCard)}</div>
        </section>
      )}

      {internalMatters.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.25em] text-dim">内部项目 · 非计费</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{internalMatters.map(renderCard)}</div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border py-2">
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── 计费模式 + 参与成员/费率（新建与编辑共用） ─────────────────

interface FeeTeamProps {
  internal: boolean;
  feeType: MatterFeeType;
  setFeeType: (v: MatterFeeType) => void;
  fee: string;
  setFee: (v: string) => void;
  memberIds: string[];
  toggleMember: (id: string) => void;
  rates: Record<string, string>;
  setRate: (id: string, v: string) => void;
}

function FeeTeamFields(p: FeeTeamProps) {
  const w = useWorklog();
  return (
    <>
      {!p.internal && (
        <div className="space-y-2">
          <Label>计费模式</Label>
          <div className="flex gap-2">
            {([['fixed', '固定费用（Cap）'], ['hourly', '按小时计费']] as const).map(([v, label]) => (
              <button
                key={v} type="button" onClick={() => p.setFeeType(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${
                  p.feeType === v ? 'border-ink bg-ink text-paper' : 'hover:bg-hov'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {p.feeType === 'fixed' && (
            <div className="space-y-1.5">
              <Label>固定费用（¥，即封顶金额）</Label>
              <Input type="number" min={0} placeholder="例如 150000" value={p.fee} onChange={(e) => p.setFee(e.target.value)} />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>参与成员与小时费率{!p.internal && p.feeType === 'fixed' ? '（固定费用也按费率折算参考金额）' : ''}</Label>
        <p className="text-xs text-muted-foreground">不勾选任何人 = 全员都可在这个案件下记录</p>
        <div className="space-y-1.5 rounded-md border p-2.5">
          {w.members.map((m) => {
            const on = p.memberIds.includes(m.id);
            return (
              <div key={m.id} className="flex items-center gap-2.5">
                <button
                  type="button" onClick={() => p.toggleMember(m.id)}
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border text-[11px] transition ${
                    on ? 'border-ink bg-ink text-white' : 'border-[#D6CFC0] hover:border-ink'
                  }`}
                >
                  {on ? '✓' : ''}
                </button>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: m.color }}>
                  {m.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}<span className="ml-1 text-xs text-muted-foreground">{m.role}</span></span>
                {on && !p.internal && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">¥</span>
                    <Input
                      type="number" min={0} placeholder="费率/h"
                      value={p.rates[m.id] ?? ''}
                      onChange={(e) => p.setRate(m.id, e.target.value)}
                      className="h-7 w-24 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">/h</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function useFeeTeam(matter?: Matter) {
  const [feeType, setFeeType] = useState<MatterFeeType>(matter?.feeType ?? 'fixed');
  const [fee, setFee] = useState(matter && matter.fixedFee > 0 ? String(matter.fixedFee) : '');
  const [memberIds, setMemberIds] = useState<string[]>(matter?.memberIds ?? []);
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(matter?.rates ?? {})) out[k] = v > 0 ? String(v) : '';
    return out;
  });

  const reset = (m?: Matter) => {
    setFeeType(m?.feeType ?? 'fixed');
    setFee(m && m.fixedFee > 0 ? String(m.fixedFee) : '');
    setMemberIds(m?.memberIds ?? []);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(m?.rates ?? {})) out[k] = v > 0 ? String(v) : '';
    setRates(out);
  };

  const toggleMember = (id: string) =>
    setMemberIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const setRate = (id: string, v: string) => setRates((cur) => ({ ...cur, [id]: v }));

  const payload = () => {
    const rateOut: Record<string, number> = {};
    for (const id of memberIds) {
      const v = Number(rates[id]);
      if (v > 0) rateOut[id] = v;
    }
    return {
      feeType,
      fixedFee: feeType === 'fixed' ? Math.max(0, Number(fee) || 0) : 0,
      memberIds,
      rates: rateOut,
    };
  };

  return { feeType, setFeeType, fee, setFee, memberIds, toggleMember, rates, setRate, reset, payload };
}

function NewMatterDialog() {
  const w = useWorklog();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [code, setCode] = useState('');
  const [budget, setBudget] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [internal, setInternal] = useState(false);
  const ft = useFeeTeam();
  const [contractStatus, setContractStatus] = useState<ContractStatus>('signed');
  const [totalFee, setTotalFee] = useState('');

  const valid = name.trim() && client.trim();

  const submit = () => {
    if (!valid) return;
    w.addMatter({
      name: name.trim(),
      client: client.trim(),
      code: code.trim() || `CASE-${Date.now().toString(36).toUpperCase()}`,
      ...ft.payload(),
      budgetHours: budget ? Math.max(1, Number(budget) || 0) : null,
      internal,
      color,
      contractStatus: internal ? undefined : contractStatus,
      totalFee: internal || !totalFee ? null : Math.max(0, Number(totalFee) || 0),
    });
    setOpen(false);
    setName(''); setClient(''); setCode(''); setBudget(''); setColor(COLORS[0]); setInternal(false);
    ft.reset();
    setContractStatus('signed');
    setTotalFee('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-1.5 h-4 w-4" />新建案件</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>新建案件</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>案件名称 *</Label>
            <Input placeholder="例如：星辰科技并购项目" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>客户 *</Label>
              <Input placeholder="客户名称" value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>案件编号</Label>
              <Input placeholder="留空自动生成" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </div>

          <FeeTeamFields
            internal={internal}
            feeType={ft.feeType} setFeeType={ft.setFeeType}
            fee={ft.fee} setFee={ft.setFee}
            memberIds={ft.memberIds} toggleMember={ft.toggleMember}
            rates={ft.rates} setRate={ft.setRate}
          />

          {!internal && (
            <ContractFields contractStatus={contractStatus} setContractStatus={setContractStatus}
              totalFee={totalFee} setTotalFee={setTotalFee} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>预算工时（h，可选）</Label>
              <Input type="number" min={0} placeholder="不限" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>标识色</Label>
              <div className="flex flex-wrap gap-2 pt-1.5">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full transition ${color === c ? 'ring-2 ring-foreground ring-offset-2' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={internal} onCheckedChange={setInternal} />
            <Label>内部 / 非计费项目（工时不计费）</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button disabled={!valid} onClick={submit}>创建案件</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMatterDialog({ matter }: { matter: Matter }) {
  const w = useWorklog();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(matter.name);
  const [client, setClient] = useState(matter.client);
  const [budget, setBudget] = useState(matter.budgetHours != null ? String(matter.budgetHours) : '');
  const [color, setColor] = useState(matter.color);
  const [internal, setInternal] = useState(matter.internal);
  const ft = useFeeTeam(matter);
  const [contractStatus, setContractStatus] = useState<ContractStatus>(matter.contractStatus ?? 'signed');
  const [totalFee, setTotalFee] = useState(matter.totalFee != null ? String(matter.totalFee) : '');

  const openDialog = () => {
    setName(matter.name); setClient(matter.client);
    setBudget(matter.budgetHours != null ? String(matter.budgetHours) : '');
    setColor(matter.color);
    setInternal(matter.internal);
    ft.reset(matter);
    setContractStatus(matter.contractStatus ?? 'signed');
    setTotalFee(matter.totalFee != null ? String(matter.totalFee) : '');
    setOpen(true);
  };

  const submit = () => {
    if (!name.trim()) return;
    w.updateMatter(matter.id, {
      name: name.trim(),
      client: client.trim(),
      ...ft.payload(),
      budgetHours: budget ? Math.max(1, Number(budget) || 0) : null,
      internal,
      color,
      contractStatus: internal ? undefined : contractStatus,
      totalFee: internal || !totalFee ? null : Math.max(0, Number(totalFee) || 0),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={openDialog}><Pencil className="mr-1.5 h-3.5 w-3.5" />编辑</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>编辑案件</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>案件名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>客户</Label>
              <Input value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
          </div>

          <FeeTeamFields
            internal={internal}
            feeType={ft.feeType} setFeeType={ft.setFeeType}
            fee={ft.fee} setFee={ft.setFee}
            memberIds={ft.memberIds} toggleMember={ft.toggleMember}
            rates={ft.rates} setRate={ft.setRate}
          />

          {!internal && (
            <ContractFields contractStatus={contractStatus} setContractStatus={setContractStatus}
              totalFee={totalFee} setTotalFee={setTotalFee} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>预算工时（h，可选）</Label>
              <Input type="number" min={0} placeholder="不限" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>标识色</Label>
              <div className="flex flex-wrap gap-2 pt-1.5">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full transition ${color === c ? 'ring-2 ring-foreground ring-offset-2' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={internal} onCheckedChange={setInternal} />
            <Label>内部 / 非计费项目（工时不计费）</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button disabled={!name.trim()} onClick={submit}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 收款进度（客户案件卡片） ──────────────────────────────

function FeeProgress({ matter }: { matter: Matter }) {
  const w = useWorklog();
  const [open, setOpen] = useState(false);
  const total = matterTotalFee(matter);
  const paid = matterPaid(matter);
  const pct = total && total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : null;
  const pending = total != null ? Math.max(0, total - paid) : null;

  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Banknote className="h-3.5 w-3.5" />收款进度
        </span>
        {w.isAdmin && (
          <button type="button" className="text-xs text-goldink hover:underline"
            onClick={() => setOpen(true)}>
            收款记录 / 登记
          </button>
        )}
      </div>
      {total != null && total > 0 ? (
        <>
          <Progress value={pct ?? 0} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
            <span>已收 <span className="font-semibold">{yuanText(paid)}</span></span>
            <span className="text-muted-foreground">总额 {yuanText(total)}</span>
            {pending != null && pending > 0 && <span className="font-semibold text-destructive">待收 {yuanText(pending)}</span>}
            {pending === 0 && <span className="font-semibold" style={{ color: '#3B6D11' }}>已结清</span>}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {paid > 0 ? `已收款 ${yuanText(paid)}（未设置合同总额）` : '未设置合同总额，编辑案件可填写'}
        </p>
      )}
      <PaymentsDialog matter={matter} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function PaymentsDialog({ matter, open, onOpenChange }: { matter: Matter; open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWorklog();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const submit = () => {
    const v = Number(amount);
    if (!v || v <= 0) return;
    w.addPayment(matter.id, { date, amount: Math.round(v), note: note.trim() || undefined });
    setAmount(''); setNote('');
  };

  const payments = [...(matter.payments ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const paid = matterPaid(matter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>收款记录 · {matter.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            合同总额 <span className="font-semibold tabular-nums">{matterTotalFee(matter) != null ? yuanText(matterTotalFee(matter)!) : '—'}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            已收 <span className="font-semibold tabular-nums">{yuanText(paid)}</span>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">历史收款</p>
            {payments.length === 0 && <p className="text-xs text-muted-foreground">还没有收款记录</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{p.date}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.note || '—'}</span>
                <span className="font-semibold tabular-nums">{yuanText(p.amount)}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => w.deletePayment(matter.id, p.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">登记收款</p>
            <div className="flex flex-wrap gap-2">
              <Input type="number" min={0} placeholder="金额 ¥" className="w-28 tabular-nums" value={amount}
                onChange={(e) => setAmount(e.target.value)} />
              <Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input placeholder="备注（如：首付款 / 第二期）" className="min-w-40 flex-1" value={note}
                onChange={(e) => setNote(e.target.value)} />
              <Button disabled={!Number(amount)} onClick={submit}>登记</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 合作状态 + 合同总额（新建与编辑共用） ──────────────────

function ContractFields(p: {
  contractStatus: ContractStatus;
  setContractStatus: (v: ContractStatus) => void;
  totalFee: string;
  setTotalFee: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>合作状态</Label>
      <div className="flex gap-2">
        {(['prospect', 'signed', 'closed'] as const).map((v) => {
          const meta = CONTRACT_STATUS_META[v];
          const on = p.contractStatus === v;
          return (
            <button key={v} type="button" onClick={() => p.setContractStatus(v)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${
                on ? 'border-transparent text-white' : 'hover:bg-hov'
              }`}
              style={on ? { background: meta.color } : undefined}>
              {meta.label}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Label>合同总金额（¥，收费进度用）</Label>
        <Input type="number" min={0} placeholder="留空则固定费用案件取固定费用" value={p.totalFee}
          onChange={(e) => p.setTotalFee(e.target.value)} />
      </div>
    </div>
  );
}
