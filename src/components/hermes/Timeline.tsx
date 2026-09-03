/* Satu aliran kronologi. Rel membawa satu maklumat yang jadual tidak
   boleh: jurang. Tiga hari tanpa apa-apa kelihatan seperti tiga hari
   tanpa apa-apa. */
import { useState } from 'react';
import { hermes, type Post } from '@/lib/hermes';
import { Panel } from './primitives';
import { Badge, DOT, LinkChip, Segmented, STATUS } from './ui';
import { cn } from '@/lib/utils';

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

export function TimelineList({ rows }: { rows: Post[] }) {
  const now = today();
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">Tiada apa-apa dalam julat ini.</p>;
  }
  return (
    <ol className="relative">
      <span aria-hidden="true"
        className="absolute left-[6px] top-2 bottom-2 w-px bg-border" />
      {rows.map((p) => {
        const st = STATUS[p.status] ?? { t: p.status, tone: 'mute' as const, h: '' };
        const isToday = p.date === now;
        return (
          <li key={p.date} className="relative pb-4 pl-7 last:pb-0">
            <span className={cn('absolute left-0 top-1.5 h-3 w-3 rounded-full',
              'border-2 border-card', DOT[st.tone],
              isToday && 'ring-2 ring-primary/40')} />
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-[13px] tabular-nums">{p.date}</b>
              <Badge tone={st.tone}>{st.t}</Badge>
              {isToday && <Badge tone="brand">hari ini</Badge>}
            </div>
            <p className="mt-1 text-sm leading-snug">{p.angle || '—'}</p>
            {p.citation && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {p.citation}
              </p>
            )}
            {p.posted_at && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Keluar {p.posted_at}
              </p>
            )}
            {p.links.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {p.links.map((l) => <LinkChip key={l.channel} {...l} />)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function Timeline() {
  const [lane, setLane] = useState<'semua' | 'approved' | 'posted'>('semua');
  const rows = hermes.posts.filter((p) => lane === 'semua' || p.status === lane);
  return (
    <Panel
      title="Setiap larian, terbaharu dahulu"
      hint="Hermes menulis satu draf setiap malam 9:45 waktu Malaysia, melalui lima
        gerbang pematuhan, kemudian berhenti. Penerbitan sentiasa langkah manusia."
    >
      <div className="mb-4">
        <Segmented value={lane} onChange={setLane} options={[
          ['semua', 'Semua'], ['approved', 'Diluluskan'], ['posted', 'Diterbitkan'],
        ]} />
      </div>
      <TimelineList rows={rows} />
    </Panel>
  );
}
