import { hermes, FORMAT_COLOR, FORMAT_LABEL, type Slot } from '@/lib/hermes';
import { Panel } from './primitives';

/**
 * The weekly schedule, laid out as one row of seven so the week reads as a
 * week. Replaced the 14-day rotation on 2026-08-31: each weekday now owns a
 * domain and its own OneDrive folder, so the day is the whole answer to
 * "what gets written and what gets read".
 *
 * Colour encodes format, and every cell also names its format in text. That
 * text is load-bearing rather than decorative — the palette alone does not
 * clear the 3:1 contrast bar on the light card.
 *
 * A day whose source folder is missing or empty carries its warning here,
 * because a schedule that looks complete while two of its days have nothing
 * to write from is the kind of thing that stays unnoticed until a thin post
 * goes out.
 */
export default function RotationStrip() {
  const { slots, cycle } = hermes;
  const formats = ['carousel', 'text_image'] as const;
  const gaps = slots.filter((s) => s.amaran);

  return (
    <Panel
      title="Jadual mingguan"
      hint={`Harian kecuali Ahad · hari ini ${cycle.hari}${
        cycle.rehat ? ' — rehat' : ` · ${cycle.domain}`}`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {slots.map((s: Slot) => (
          <div
            key={s.dow}
            className="relative rounded-lg border p-2.5"
            style={{
              borderColor: s.today ? 'var(--foreground)' : 'var(--border)',
              borderWidth: s.today ? 2 : 1,
              opacity: s.rehat ? 0.6 : 1,
            }}
            title={s.amaran || `${s.hari} — ${s.domain || 'rehat'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground">
                {s.hari}
              </span>
              {!s.rehat && (
                <span aria-hidden className="size-2 rounded-full"
                      style={{ background: FORMAT_COLOR[s.format] ?? 'var(--viz-3)' }} />
              )}
            </div>

            <p className="mt-1.5 text-[11px] font-medium leading-tight">
              {s.rehat ? 'Rehat' : s.domain}
            </p>

            {!s.rehat && (
              <>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {FORMAT_LABEL[s.format] ?? s.format}
                </p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground"
                   title={s.folder}>
                  {s.folder}
                </p>
              </>
            )}

            {s.amaran && (
              <span
                aria-label="folder sumber belum sedia"
                className="absolute right-1.5 top-1.5 size-1.5 rounded-full"
                style={{ background: 'var(--viz-warning)' }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        {formats.map((f) => (
          <div key={f} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full"
                  style={{ background: FORMAT_COLOR[f] }} />
            <span className="text-xs">{FORMAT_LABEL[f]}</span>
          </div>
        ))}
      </div>

      {gaps.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {gaps.map((s) => (
            <p key={s.dow} className="text-[11px] leading-snug text-muted-foreground">
              <strong>{s.hari}</strong> — {s.amaran}
            </p>
          ))}
        </div>
      )}
    </Panel>
  );
}
