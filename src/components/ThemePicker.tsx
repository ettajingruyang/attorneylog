import { useState } from 'react';
import { THEMES, applyTheme, currentTheme } from '@/lib/theme';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, Moon, Palette, Sun } from 'lucide-react';

/** 主题切换器：4 套色系（两浅两深），选择保存在本设备 */
export default function ThemePicker({ className }: { className?: string }) {
  const [cur, setCur] = useState(currentTheme());

  const pick = (id: string) => {
    applyTheme(id);
    setCur(id);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={className} title="主题外观">
          {THEMES.find((t) => t.id === cur)?.dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Palette className="h-3.5 w-3.5" />主题外观（本设备生效）
        </p>
        <div className="space-y-1">
          {THEMES.map((t) => {
            const on = cur === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${
                  on ? 'border-gold bg-wash' : 'border-transparent hover:bg-hov'
                }`}
              >
                <span className="flex overflow-hidden rounded-md border border-black/10">
                  {t.swatch.map((c) => (
                    <span key={c} className="h-5 w-3.5" style={{ background: c }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.desc}</span>
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-goldink" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
