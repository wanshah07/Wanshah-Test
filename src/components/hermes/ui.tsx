/* Primitif yang dikongsi cangkerang Command Centre.
 *
 * primitives.tsx yang sedia ada TIDAK diganti — Panel dan Stat di sana
 * masih dipakai oleh setiap panel lama, dan menulis semula panel yang
 * berfungsi untuk mendapatkan nama kelas yang berbeza ialah cara paling
 * pasti memecahkan sesuatu tanpa mendapat apa-apa.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'good' | 'warn' | 'crit' | 'brand' | 'mute';

/* Ditulis PENUH, tidak pernah disambung. Tailwind mengimbas teks fail
   ini; `bg-${tone}` tidak dijumpai dan kelas itu tidak wujud dalam CSS
   akhir, jadi elemen dilukis lutsinar tanpa satu pun ralat. */
export const TONE: Record<Tone, string> = {
  good: 'border-good/40 text-good bg-good/10',
  warn: 'border-warn/40 text-warn bg-warn/10',
  crit: 'border-crit/40 text-crit bg-crit/10',
  brand: 'border-primary/40 text-primary bg-brand-soft',
  mute: 'border-border text-muted-foreground bg-transparent',
};
export const DOT: Record<Tone, string> = {
  good: 'bg-good', warn: 'bg-warn', crit: 'bg-crit',
  brand: 'bg-primary', mute: 'bg-muted-foreground/50',
};

export function Badge({ tone = 'mute', children, className }:
  { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border',
      'px-1.5 py-0.5 text-[11px] font-medium leading-none', TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Tile({ label, value, tone = 'mute', pill, foot }: {
  label: string; value: ReactNode; tone?: Tone; pill?: string; foot?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[.08em] text-muted-foreground">
            {label}
          </p>
          {/* Tarikh ialah angka, tetapi bukan angka yang muat pada 3xl —
              "2026-09-03" dipotong menjadi "2026-09…" dan jubin itu
              berhenti menjawab soalannya. */}
          <p className={cn('mt-1 leading-none tabular-nums font-semibold',
            typeof value === 'string' && value.length > 7
              ? 'text-2xl' : 'text-3xl')}>
            {value}
          </p>
        </div>
        {pill && <Badge tone={tone}>{pill}</Badge>}
      </div>
      {foot && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{foot}</p>}
    </div>
  );
}

export function LinkChip({ channel, url }: { channel: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded border border-border px-1.5
      py-0.5 text-[11px] font-medium text-primary transition-colors
      hover:border-primary hover:bg-brand-soft">
      {channel} &#8599;
    </a>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex shrink-0 rounded-md border border-border p-0.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={cn('rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === v ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* Satu status, satu nada, satu label. Nada tidak pernah membawa makna
   sendiri — setiap lencana membawa perkataannya juga. */
export const STATUS: Record<string, { t: string; tone: Tone; h: string }> = {
  needs_verification: { t: 'Perlu semakan', tone: 'warn',
    h: 'Membawa angka yang belum disahkan' },
  pending_photo: { t: 'Menunggu foto', tone: 'warn',
    h: 'Sudah ditulis, tetapi satu kad perlukan foto yang belum ada' },
  ready_for_approval: { t: 'Menunggu kelulusan', tone: 'brand',
    h: 'Lulus setiap gerbang, menunggu Wan' },
  approved: { t: 'Diluluskan', tone: 'good',
    h: 'Keluar pada tarikhnya sendiri, 9:45 malam MYT' },
  posted: { t: 'Diterbitkan', tone: 'mute', h: 'Sudah hidup di platform' },
  rejected: { t: 'Ditolak', tone: 'crit', h: 'Disimpan sebagai rekod' },
  dibuang: { t: 'Digugurkan', tone: 'mute', h: 'Dibuang, dengan sebabnya difailkan' },
};
