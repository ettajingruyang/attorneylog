import { useState } from 'react';
import { useWorklog } from '@/store/worklog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Rocket } from 'lucide-react';
import MoonMark from '@/components/MoonMark';

/**
 * 首次初始化向导：数据文件为空时展示。
 * 创建团队名 + 第一位管理员（密码 6 位以上），完成后自动进入工作台。
 */
export default function SetupPage() {
  const w = useWorklog();
  const [teamName, setTeamName] = useState('');
  const [teamSubtitle, setTeamSubtitle] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('合伙人');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    if (!teamName.trim()) { setErr('请填写团队名称'); return; }
    if (!adminName.trim()) { setErr('请填写你的姓名'); return; }
    if (password.length < 6) { setErr('密码至少 6 位'); return; }
    if (password !== password2) { setErr('两次输入的密码不一致'); return; }
    setBusy(true);
    const e = await w.setup({
      teamName: teamName.trim(),
      teamSubtitle: teamSubtitle.trim(),
      adminName: adminName.trim(),
      adminRole: adminRole.trim() || '合伙人',
      password,
    });
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <Card className="w-full max-w-md border-line bg-surface shadow-lg">
        <CardHeader className="pb-2 text-center">
          <MoonMark className="mx-auto mb-1 h-9" />
          <p className="font-display text-3xl font-bold text-ink">欢迎使用</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-dim">Team Worklog</p>
          <CardTitle className="pt-3 text-base font-medium text-ink2">
            第一次使用，先创建你的团队
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>团队名称 *</Label>
            <Input
              placeholder="例如：XX 律师团队"
              value={teamName}
              autoFocus
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>副标题（选填）</Label>
            <Input
              placeholder="显示在团队名下方，例如：Attorney's Journal"
              value={teamSubtitle}
              onChange={(e) => setTeamSubtitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>你的姓名 *</Label>
              <Input
                placeholder="例如：张律师"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Input value={adminRole} onChange={(e) => setAdminRole(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>管理员密码 *</Label>
            <Input
              type="password"
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>确认密码 *</Label>
            <Input
              type="password"
              placeholder="再输入一次"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full" disabled={busy} onClick={submit}>
            <Rocket className="mr-1.5 h-4 w-4" />
            {busy ? '创建中…' : '创建团队并进入'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            你将成为团队管理员：可查看全员数据、分配待办、管理案件与成员。
            其他成员由管理员在「团队」页添加，首次登录时自行设置密码。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
