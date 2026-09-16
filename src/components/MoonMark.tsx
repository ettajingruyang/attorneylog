/** 登录/初始化页的小月亮印记（颜色随主题走） */
export default function MoonMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 44" className={className} role="img" aria-hidden>
      <path d="M42 6 A15 15 0 1 0 42 38 A12 12 0 1 1 42 6 Z" fill="var(--c-accent)" opacity="0.92" />
      <circle cx="20" cy="12" r="2" fill="var(--c-accent)" opacity="0.5" />
      <circle cx="62" cy="30" r="1.5" fill="var(--c-accent)" opacity="0.4" />
      <circle cx="56" cy="8" r="1" fill="var(--c-accent)" opacity="0.35" />
      <circle cx="16" cy="34" r="1.2" fill="var(--c-accent)" opacity="0.3" />
    </svg>
  );
}
