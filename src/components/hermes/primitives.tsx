import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Panel({
  title, hint, children, className,
}: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground',
        'p-5 shadow-sm', className,
      )}
    >
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** A number that is the answer to a question, not a decoration.
 *  Proportional figures — these do not sit in an aligned column. */
export function Stat({
  value, unit, label, note, tone = 'default',
}: {
  value: string | number; unit?: string; label: string; note?: string;
  tone?: 'default' | 'good' | 'warning' | 'critical';
}) {
  const toneVar = {
    default: 'var(--foreground)', good: 'var(--viz-good)',
    warning: 'var(--viz-warning)', critical: 'var(--viz-critical)',
  }[tone];
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-semibold leading-none"
              style={{ color: toneVar }}>{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      <p className="mt-1.5 text-xs font-medium">{label}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

