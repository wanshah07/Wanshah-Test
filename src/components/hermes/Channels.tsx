import { hermes } from '@/lib/hermes';
import { Panel } from './primitives';

/**
 * Connection state is the difference between a draft and a published
 * post, so it gets its own panel rather than a footnote. Nothing here is
 * something Hermes can fix on its own — every row needs an OAuth click
 * that only the account holder can make.
 */
export default function Channels() {
  const cs = hermes.channels;
  const live = cs.filter((c) => c.connected).length;

  return (
    <Panel
      title="Saluran"
      hint={`${live} daripada ${cs.length} bersambung · setiap satu perlu OAuth di pelayar`}
    >
      <ul className="divide-y divide-border">
        {cs.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-xs text-muted-foreground">
                had {c.limit.toLocaleString('ms-MY')} aksara
                {c.zapier && ` · Zapier: ${c.zapier}`}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
              <span aria-hidden className="size-2 rounded-full"
                    style={{ background: c.connected ? 'var(--viz-good)' : 'var(--viz-muted)' }} />
              {c.connected ? 'Bersambung' : 'Belum'}
            </span>
          </li>
        ))}
      </ul>

      {live === 0 && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Tiada saluran bersambung, jadi mod <code
            className="rounded bg-muted px-1 py-0.5">post</code> hanya
          menyenaraikan apa yang perlu disalin secara manual. Instagram perlu
          akaun Business atau Creator yang dipautkan ke satu Facebook Page —
          akaun peribadi tidak boleh dipos melalui API oleh sesiapa pun.
        </p>
      )}
    </Panel>
  );
}
