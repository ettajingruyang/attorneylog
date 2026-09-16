import { useState } from 'react';
import { useWorklog } from '@/store/worklog';
import { hoursText, monthKey, today } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Users } from 'lucide-react';

const COLORS = ['#722F37', '#B5651D', '#C9A84C', '#A53A2A', '#6B7F5E', '#0D4C3C', '#2F4F4F', '#4A6B8A', '#5B3A5B', '#4E5452', '#8C7B6C'];

export default function TeamPage() {
  const w = useWorklog();
  const thisMonth = monthKey(today());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-dim">Team</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-ink">团队</h1>
          <p className="text-sm text-muted-foreground mt-2">
            每条工时和待办都归属到具体成员。未来律师加入后直接建成员即可，月度复盘支持按成员筛选。
          </p>
        </div>
        <NewMemberDialog />
      </div>

      {w.members.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
          <Users className="h-8 w-8" /><p className="text-sm">还没有成员</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {w.members.map((m) => {
            const mine = w.entries.filter((e) => e.memberId === m.id && monthKey(e.date) === thisMonth);
            const total = mine.reduce((a, e) => a + e.minutes, 0);
            const bill = mine.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);
            const isCurrent = m.id === w.currentMemberId;
            return (
              <Card key={m.id} className={isCurrent ? 'ring-1 ring-gold' : ''}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Avatar>
                    <AvatarFallback style={{ background: m.color, color: '#fff' }}>{m.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-1.5">
                      {m.name}
                      {m.isAdmin && <Badge variant="outline" className="border-gold text-goldink">管理员</Badge>}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {m.role} · {m.joinedAt} 加入 · {m.hasPassword ? '已设密码' : '未设密码（首次登录时设置）'}
                    </p>
                  </div>
                  {isCurrent && <Badge className="bg-ink hover:bg-ink">当前使用者</Badge>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border py-2">
                      <p className="text-sm font-bold tabular-nums">{hoursText(total)}</p>
                      <p className="text-xs text-muted-foreground">本月工时</p>
                    </div>
                    <div className="rounded-lg border py-2">
                      <p className="text-sm font-bold tabular-nums">{hoursText(bill)}</p>
                      <p className="text-xs text-muted-foreground">计费</p>
                    </div>
                    <div className="rounded-lg border py-2">
                      <p className="text-sm font-bold tabular-nums">{total > 0 ? Math.round((bill / total) * 100) : 0}%</p>
                      <p className="text-xs text-muted-foreground">计费率</p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => w.setCurrentMember(m.id)}>
                        查看 TA 的工作台
                      </Button>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive"
                        title="重置密码（TA 下次登录时重新设置）"
                        onClick={() => {
                          if (window.confirm(`确定重置 ${m.name} 的密码？TA 下次登录时需重新设置。`)) {
                            w.resetPassword(m.id).then((e) => { if (e) window.alert(e); });
                          }
                        }}>
                        重置密码
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">数据说明</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>· 多人协作已启用：每位成员用「名字 + 密码」登录，只能看到自己的待办、工时和随记；管理员可查看全部、分配待办、管理案件与成员。</p>
          <p>· 数据集中保存在你自己服务器的 data/worklog-data.json（写入前自动留 .bak 备份），关闭网页、换浏览器、换设备都不会丢。</p>
          <p>· 成员忘记密码：点对应卡片上的「重置密码」，TA 下次登录时重新设置。</p>
        </CardContent>
      </Card>
    </div>
  );
}

function NewMemberDialog() {
  const w = useWorklog();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('律师');
  const [color, setColor] = useState(COLORS[1]);

  const submit = () => {
    if (!name.trim()) return;
    w.addMember(name.trim(), role.trim() || '律师', color);
    setOpen(false);
    setName(''); setRole('律师'); setColor(COLORS[1]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus className="mr-1.5 h-4 w-4" />添加成员</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>添加团队成员</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>姓名 *</Label>
            <Input placeholder="例如：张律师" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>角色</Label>
            <Input placeholder="律师 / 律师助理 / 实习生" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>标识色</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition ${color === c ? 'ring-2 ring-foreground ring-offset-2' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button disabled={!name.trim()} onClick={submit}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
