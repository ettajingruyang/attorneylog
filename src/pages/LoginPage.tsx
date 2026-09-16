import { useEffect, useState } from 'react';
import { useWorklog } from '@/store/worklog';
import { apiFetch } from '@/lib/platform';
import SetupPage from '@/pages/SetupPage';
import MoonMark from '@/components/MoonMark';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck } from 'lucide-react';

interface PublicMember {
  id: string;
  name: string;
  role: string;
  color: string;
  hasPassword: boolean;
}

export default function LoginPage() {
  const w = useWorklog();
  const [members, setMembers] = useState<PublicMember[] | null>(null);
  const [teamName, setTeamName] = useState('');
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [demoPassword, setDemoPassword] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [selected, setSelected] = useState<PublicMember | null>(null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch('members')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        setMembers(j.members ?? []);
        setTeamName(j.teamName ?? '');
        setInitialized(!!j.initialized);
        if (j.demoHint?.password) setDemoPassword(j.demoHint.password);
      })
      .catch(() => setLoadErr('无法连接服务器，请确认工作台服务已启动后刷新页面'));
  }, []);

  // 数据文件为空：首次使用，进入初始化向导
  if (!loadErr && initialized === false) return <SetupPage />;

  const submit = async () => {
    if (!selected || password.length < 6) {
      setErr('请输入密码（至少 6 位）');
      return;
    }
    setBusy(true);
    setErr('');
    const e = await w.login(selected.id, password);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <Card className="w-full max-w-md border-line bg-surface shadow-lg">
        <CardHeader className="pb-2 text-center">
          <MoonMark className="mx-auto mb-1 h-9" />
          <p className="font-display text-3xl font-bold text-ink">{teamName || '团队工作台'}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-dim">Team Worklog</p>
          <CardTitle className="pt-3 text-base font-medium text-ink2">选择你的名字，输入密码登录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {demoPassword && (
            <p className="rounded-lg bg-wash px-3 py-2 text-center text-xs text-goldink">
              演示环境：任选一位成员，密码 <span className="font-semibold">{demoPassword}</span>，数据定期重置
            </p>
          )}
          {loadErr && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadErr}</p>}
          {members && members.length === 0 && !loadErr && (
            <p className="text-sm text-muted-foreground">还没有成员，请联系管理员添加。</p>
          )}
          {members && members.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setSelected(m); setErr(''); }}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    selected?.id === m.id
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line hover:border-gold hover:bg-hov'
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: m.color }}
                  >
                    {m.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-medium ${selected?.id === m.id ? '' : 'text-ink'}`}>{m.name}</span>
                    <span className={`block truncate text-xs ${selected?.id === m.id ? 'text-gold' : 'text-muted-foreground'}`}>{m.role}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-2">
              <Label className="text-sm">
                {selected.hasPassword ? `${selected.name} 的密码` : '首次登录：设置你的密码（至少 6 位，以后用它登录）'}
              </Label>
              <Input
                type="password"
                placeholder="至少 6 位"
                value={password}
                autoFocus
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}

          <Button className="w-full" disabled={!selected || busy} onClick={submit}>
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            {busy ? '登录中…' : '进入工作台'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">忘记密码请联系管理员在「团队」页重置</p>
        </CardContent>
      </Card>
    </div>
  );
}
