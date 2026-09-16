import type { ReactNode } from 'react';
import { useWorklog } from '@/store/worklog';
import { PRESENCE_META, type PresenceStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Home, Plane, Sun, Users } from 'lucide-react';

const PRESENCE_ICONS: Record<PresenceStatus, (props: { className?: string }) => ReactNode> = {
  office: (p) => <Building2 {...p} />,
  remote: (p) => <Home {...p} />,
  trip: (p) => <Plane {...p} />,
  leave: (p) => <Sun {...p} />,
};

/**
 * 乐高风工位场景：小桌子 + 坐在桌后的小人 + 笔记本电脑。
 * 打卡状态决定场景装饰（办公室=窗户+绿植 / 远程=小房子 / 出差=行李箱+航线 / 休假=太阳），未打卡=打瞌睡。
 */
function DeskScene({ color, status }: { color: string; status: PresenceStatus | null }) {
  const meta = status ? PRESENCE_META[status] : null;
  const tint = meta ? meta.color + '24' : 'transparent';
  const sleeping = status == null;

  return (
    <svg viewBox="0 0 120 100" className="w-full" role="img" aria-hidden>
      {/* 房间 */}
      <rect x="2" y="2" width="116" height="96" rx="14" fill={tint} stroke="var(--c-line)" strokeWidth="0.5" />
      <line x1="8" y1="86" x2="112" y2="86" stroke="var(--c-line)" strokeWidth="1" strokeDasharray="3 4" />

      {/* ── 状态装饰 ── */}
      {status === 'office' && (
        <g>
          <rect x="12" y="14" width="28" height="24" rx="3" fill="#BFD9EA" />
          <line x1="26" y1="15" x2="26" y2="37" stroke="#FFFFFF" strokeWidth="2.5" />
          <line x1="13" y1="26" x2="39" y2="26" stroke="#FFFFFF" strokeWidth="2.5" />
          <rect x="90" y="58" width="13" height="11" rx="2" fill="#B5651D" />
          <circle cx="96.5" cy="52" r="4" fill="#9DB89A" />
          <circle cx="92" cy="55" r="3" fill="#7FA05E" />
          <circle cx="101" cy="55" r="3" fill="#7FA05E" />
        </g>
      )}
      {status === 'remote' && (
        <g>
          <polygon points="26,14 10,28 42,28" fill="#C98A8B" />
          <rect x="14" y="28" width="24" height="10" rx="2" fill="#E7D8C3" />
          <rect x="23" y="31" width="6" height="7" rx="1" fill="#B5651D" />
          <rect x="36" y="18" width="4" height="8" rx="1" fill="#B5651D" />
        </g>
      )}
      {status === 'trip' && (
        <g>
          <rect x="90" y="62" width="24" height="17" rx="4" fill="#854F0B" />
          <path d="M96 62 v-4 a6 6 0 0 1 12 0 v4" fill="none" stroke="#854F0B" strokeWidth="2.5" />
          <line x1="90" y1="68" x2="114" y2="68" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" />
          <path d="M12 20 Q26 8 44 18" fill="none" stroke="var(--c-muted)" strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M44 18 l-6 -1 l3 5 z" fill="var(--c-muted)" />
        </g>
      )}
      {status === 'leave' && (
        <g>
          <circle cx="24" cy="22" r="8" fill="#E8B84B" />
          <g stroke="#E8B84B" strokeWidth="2" strokeLinecap="round">
            <line x1="24" y1="8" x2="24" y2="11" />
            <line x1="24" y1="33" x2="24" y2="36" />
            <line x1="10" y1="22" x2="13" y2="22" />
            <line x1="35" y1="22" x2="38" y2="22" />
          </g>
          <circle cx="95" cy="26" r="5" fill="#FFFFFF" opacity="0.85" />
          <circle cx="103" cy="28" r="4" fill="#FFFFFF" opacity="0.85" />
          <ellipse cx="88" cy="84" rx="10" ry="3" fill="#F3E9D2" opacity="0.7" />
        </g>
      )}
      {sleeping && (
        <g fill="var(--c-muted)" fontFamily="Georgia, serif" fontStyle="italic">
          <text x="92" y="24" fontSize="10" opacity="0.7">z</text>
          <text x="99" y="16" fontSize="13" opacity="0.55">Z</text>
        </g>
      )}

      {/* ── 小人（乐高风：圆柱头 + 卡扣 + 桶身），打卡了会轻轻晃 ── */}
      <g className={sleeping ? '' : 'buddy-bob'} style={{ transformOrigin: '60px 82px' }}>
        {/* 头顶卡扣 */}
        <rect x="56" y="28" width="8" height="6" rx="2.5" fill="#E0AC4C" />
        {/* 头 */}
        <rect x="49" y="33" width="22" height="18" rx="7" fill="#F2C063" />
        {/* 脸 */}
        {sleeping ? (
          <g stroke="#3A352C" strokeWidth="1.5" strokeLinecap="round">
            <line x1="54.5" y1="42" x2="57.5" y2="42" />
            <line x1="62.5" y1="42" x2="65.5" y2="42" />
          </g>
        ) : (
          <g fill="#3A352C">
            <circle cx="55.5" cy="41.5" r="1.7" />
            <circle cx="64.5" cy="41.5" r="1.7" />
          </g>
        )}
        <path d={sleeping ? 'M56 46.5 Q60 44.5 64 46.5' : 'M55 46 Q60 50 65 46'} stroke="#3A352C" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* 桶身（成员色） */}
        <rect x="47" y="52" width="26" height="18" rx="6" fill={color} />
        {/* 肩扣 */}
        <circle cx="52" cy="57" r="1.2" fill="#FFFFFF" opacity="0.5" />
        <circle cx="68" cy="57" r="1.2" fill="#FFFFFF" opacity="0.5" />
        {/* 手（搭在桌上） */}
        <circle cx="44" cy="66" r="4" fill={color} />
        <circle cx="76" cy="66" r="4" fill={color} />
      </g>

      {/* ── 笔记本电脑（在桌上，挡住小人下半身） ── */}
      <rect x="63" y="53" width="16" height="11" rx="2" fill="#3A3A3E" />
      <rect x="65" y="55" width="12" height="7" rx="1" fill="#9FD0DE" />
      <rect x="60" y="63.5" width="22" height="2.5" rx="1.25" fill="#55555C" />

      {/* ── 小桌子（木色，最前景） ── */}
      <rect x="32" y="64" width="56" height="7" rx="3.5" fill="#B98A5E" />
      <rect x="36" y="71" width="5" height="14" rx="2" fill="#9A6F49" />
      <rect x="79" y="71" width="5" height="14" rx="2" fill="#9A6F49" />
    </svg>
  );
}

/** 首页团队打卡看板：每人一个乐高小工位，显示 办公室/远程/出差/休假 */
export default function TeamBoard({ date }: { date: string }) {
  const w = useWorklog();
  const mine = w.presence.find((p) => p.memberId === w.currentMemberId && p.date === date);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          团队今天
        </CardTitle>
        <p className="text-xs text-muted-foreground">大家都在哪儿工作</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {w.members.map((m) => {
            const p = w.presence.find((x) => x.memberId === m.id && x.date === date);
            const meta = p ? PRESENCE_META[p.status] : null;
            const isMe = m.id === w.currentMemberId;
            return (
              <div key={m.id} className={`flex w-[112px] flex-col items-center gap-1 rounded-xl p-1.5 ${isMe ? 'ring-1 ring-gold' : ''}`}>
                <DeskScene color={m.color} status={p?.status ?? null} />
                <span className="max-w-full truncate text-[11px] font-medium">{m.name}</span>
                <span
                  className="flex items-center gap-1 rounded-full px-1.5 py-px text-[10px]"
                  style={{ color: meta ? meta.color : 'var(--c-muted)' }}
                  title={meta ? `${m.name} · ${meta.label}` : `${m.name} · 未打卡`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta ? meta.color : 'var(--c-muted)' }} />
                  {meta ? meta.label : '未打卡'}
                </span>
              </div>
            );
          })}
          {w.members.length === 0 && (
            <p className="w-full py-2 text-center text-xs text-muted-foreground">还没有成员</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="mr-1 text-xs text-muted-foreground">我的状态</span>
          {(Object.keys(PRESENCE_META) as PresenceStatus[]).map((s) => {
            const meta = PRESENCE_META[s];
            const Icon = PRESENCE_ICONS[s];
            const on = mine?.status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => w.setPresence(s, date)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                  on ? 'border-transparent text-white' : 'border-line text-dim hover:text-ink2'
                }`}
                style={on ? { background: meta.color } : undefined}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
