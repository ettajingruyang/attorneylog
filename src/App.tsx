import { useState } from 'react';
import { WorklogProvider, useWorklog } from '@/store/worklog';
import TodayPage from '@/pages/TodayPage';
import MattersPage from '@/pages/MattersPage';
import MonthPage from '@/pages/MonthPage';
import TeamPage from '@/pages/TeamPage';
import ExportPage from '@/pages/ExportPage';
import LoginPage from '@/pages/LoginPage';
import ThemePicker from '@/components/ThemePicker';
import { LogOut } from 'lucide-react';

type Page = 'today' | 'matters' | 'month' | 'team' | 'export';

const NAV: { key: Page; label: string; en: string; adminOnly?: boolean }[] = [
  { key: 'today', label: '今日', en: 'DAILY LOG' },
  { key: 'matters', label: '案件', en: 'MATTERS' }, // 成员可看（只读）；新建/编辑/归档仍管理员专属
  { key: 'month', label: '看板', en: 'BOARD' },
  { key: 'export', label: '导出小时单', en: 'EXPORT' },
  { key: 'team', label: '团队', en: 'TEAM', adminOnly: true },
];

function Shell() {
  const [page, setPage] = useState<Page>('today');
  const w = useWorklog();

  if (!w.session) return <LoginPage />;

  const member = w.members.find((m) => m.id === w.currentMemberId);
  const nav = NAV.filter((n) => !n.adminOnly || w.isAdmin);
  const viewingOther = w.isAdmin && w.currentMemberId !== w.session.memberId;

  return (
    <div className="flex min-h-screen bg-app">
      {/* 侧边导航（平板/桌面 ≥768px 显示） */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-6 py-6">
          <p className="font-display text-2xl font-bold leading-tight text-ink">{w.teamName || '团队工作台'}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">{w.teamSubtitle || "Team's Worklog"}</p>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className={`flex w-full items-baseline justify-between rounded-full px-3.5 py-2.5 text-left transition-all ${
                page === n.key
                  ? 'bg-ink text-paper'
                  : 'text-ink2 hover:bg-hov hover:text-ink'
              }`}
            >
              <span className="text-sm font-medium">{n.label}</span>
              <span className={`text-[10px] tracking-[0.15em] ${page === n.key ? 'text-gold' : 'text-dim'}`}>
                {n.en}
              </span>
            </button>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: member?.color ?? '#4E5452' }}>
              {member?.name.slice(0, 1) ?? '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {member?.name ?? '未设置'}
                {w.isAdmin && <span className="ml-1 text-[10px] text-goldink">管理员</span>}
              </p>
              <p className="text-xs text-dim">{member?.role ?? ''}</p>
            </div>
            <ThemePicker className="h-8 w-8 shrink-0 text-dim hover:bg-hov hover:text-ink" />
            <button
              title="退出登录"
              onClick={() => w.logout()}
              className="rounded p-1 text-dim transition hover:bg-hov hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 右侧：手机顶栏 + 主内容 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 手机顶栏（<768px）：品牌 + 页面导航 + 当前成员 */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface md:hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            <div>
              <p className="font-display text-lg font-bold leading-tight text-ink">{w.teamName || '团队工作台'}</p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-dim">{w.teamSubtitle || "Team's Worklog"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: member?.color ?? '#4E5452' }}>
                {member?.name.slice(0, 1) ?? '?'}
              </span>
              <span className="text-sm font-semibold text-ink">
                {member?.name ?? ''}
                {w.isAdmin && <span className="ml-1 text-[10px] text-goldink">管理员</span>}
              </span>
              <ThemePicker className="h-8 w-8 shrink-0 text-dim hover:bg-hov hover:text-ink" />
              <button
                title="退出登录"
                onClick={() => w.logout()}
                className="rounded p-1.5 text-dim transition hover:bg-hov hover:text-ink"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav.map((n) => (
              <button
                key={n.key}
                onClick={() => setPage(n.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                  page === n.key
                    ? 'bg-ink text-paper'
                    : 'bg-hov text-ink2 hover:text-ink'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </header>

        {/* 主内容 */}
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8 lg:px-12">
          <div className="mx-auto max-w-6xl">
          {viewingOther && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-gold bg-wash px-4 py-2 text-sm text-goldink">
              <span>正在查看 {member?.name} 的工作台（管理员视角）</span>
              <button className="underline underline-offset-2 hover:text-ink" onClick={() => w.setCurrentMember(w.session!.memberId)}>
                回到我自己
              </button>
            </div>
          )}
          {page === 'today' && <TodayPage />}
          {page === 'matters' && <MattersPage />}
          {page === 'month' && <MonthPage />}
          {page === 'export' && <ExportPage />}
          {page === 'team' && w.isAdmin && <TeamPage />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WorklogProvider>
      <Shell />
    </WorklogProvider>
  );
}
