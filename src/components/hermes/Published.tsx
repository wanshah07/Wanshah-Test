/* Apa yang sudah keluar, dan pautan kepada setiap satu.
 *
 * Teks caption TIDAK di sini dan tidak boleh ada. Ia dalam senarai
 * never-publishable dalam CLAUDE.md, dan senarai itu terpakai walaupun
 * caption itu sudah awam di Meta. Baris ini menghala keluar. */
import { hermes } from '@/lib/hermes';
import { Panel } from './primitives';
import { LinkChip } from './ui';

export default function Published() {
  const rows = hermes.posts.filter((p) => p.status === 'posted');
  return (
    <Panel
      title="Post yang sudah diterbitkan"
      hint={`${rows.length} nota, setiap satu dengan instrumen rasmi yang dipetik.
        Teks penuh dibaca di platform tempat ia diterbitkan.`}
    >
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada apa-apa keluar.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((p) => (
            <li key={p.date} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              {p.thumb && (
                <img src={p.thumb} alt="" aria-hidden="true" loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-md border border-border object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <b className="tabular-nums text-foreground">{p.date}</b>
                  {p.posted_at && ` · keluar ${p.posted_at}`}
                </p>
                <p className="mt-0.5 text-sm leading-snug">{p.angle}</p>
                {p.citation && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {p.citation}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.links.length
                    ? p.links.map((l) => <LinkChip key={l.channel} {...l} />)
                    : <span className="text-xs text-warn">tiada pautan direkod</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
