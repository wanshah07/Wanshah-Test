import { hermes } from '@/lib/hermes';
import { Panel } from './primitives';

/**
 * What is holding drafts back. Hermes never invents a regulatory number,
 * so an unverified fact is not a cosmetic warning — it is the thing
 * keeping a post unpublished, and it belongs on the dashboard next to the
 * draft it blocks.
 */
export default function Sources() {
  const facts = hermes.facts ?? [];
  const sources = hermes.sources ?? [];
  const verified = facts.filter((f) => f.status === 'disahkan').length;

  return (
    <Panel
      title="Fakta & sumber"
      hint={`${verified} daripada ${facts.length} angka disahkan · config/facts.yml`}
    >
      {/* One bar, one scale: how much of what Hermes may cite is confirmed. */}
      <div className="flex h-2 w-full overflow-hidden rounded-full"
           style={{ background: 'var(--viz-grid)' }}
           role="img"
           aria-label={`${verified} daripada ${facts.length} angka disahkan`}>
        <div style={{ width: `${(verified / Math.max(facts.length, 1)) * 100}%`,
                      background: 'var(--viz-good)' }} />
      </div>

      <ul className="mt-4 divide-y divide-border">
        {facts.map((f) => {
          const ok = f.status === 'disahkan';
          return (
            <li key={`${f.section}.${f.key}`}
                className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {f.key.replace(/_/g, ' ')}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {f.section} · {f.source || 'tiada sumber'}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px]">
                <span aria-hidden className="size-2 rounded-full"
                      style={{ background: ok ? 'var(--viz-good)' : 'var(--viz-warning)' }} />
                {ok ? 'Disahkan' : 'Belum'}
              </span>
            </li>
          );
        })}
      </ul>

      {sources.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-xs font-semibold">Bahan mentah</h3>
          <ul className="mt-2 space-y-1.5">
            {sources.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3">
                <span className="text-xs">{s.label}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px]">
                  <span aria-hidden className="size-2 rounded-full"
                        style={{ background: s.status === 'bersambung'
                          ? 'var(--viz-good)' : 'var(--viz-muted)' }} />
                  {s.status === 'bersambung' ? 'Bersambung'
                    : s.configured ? 'Menunggu OAuth' : 'Perlu folder ID'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {verified < facts.length && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Angka <strong className="text-foreground">belum disahkan</strong> masih
          digunakan dalam draf, tetapi draf itu kekal tertahan sehingga anda
          semak terhadap dokumen rasmi dan tukar statusnya. Tiada nombor
          peraturan diterbitkan tanpa pengesahan anda.
        </p>
      )}
    </Panel>
  );
}
