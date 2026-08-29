import { hermes, FORMAT_COLOR, FORMAT_LABEL, type Slot } from '@/lib/hermes';
import { Panel } from './primitives';

/**
 * The 14-day rotation, laid out as it actually repeats — two rows of
 * seven, so the fortnight's shape is visible rather than implied by a
 * scrolling list.
 *
 * Colour encodes format, and every cell also names its format in text.
 * That text is load-bearing: the text-only slot colour measures 2.82:1
 * against the light card, under the 3:1 bar, so the label is what makes
 * the cell readable rather than a nicety.
 */
export default function RotationStrip() {
  const { slots, cycle } = hermes;
  const rows = [slots.slice(0, 7), slots.slice(7, 14)];
  const formats = ['carousel', 'text_image', 'text_only'] as const;

  return (
    <Panel
      title="Putaran 14 hari"
      hint={`Kitaran bermula ${cycle.start} · hari ini ialah hari ${cycle.today_index}`}
    >
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-7 gap-2">
            {row.map((s: Slot) => {
              const isToday = s.day === cycle.today_index;
              return (
                <div
                  key={s.day}
                  className="relative rounded-lg border p-2.5 transition-colors"
                  style={{
                    borderColor: isToday ? 'var(--foreground)' : 'var(--border)',
                    borderWidth: isToday ? 2 : 1,
                  }}
                  title={`Hari ${s.day} — ${s.title}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {s.day}
                    </span>
                    <span aria-hidden className="size-2 rounded-full"
                          style={{ background: FORMAT_COLOR[s.format] }} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-tight">
                    {s.title}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {FORMAT_LABEL[s.format]}
                  </p>
                  {isToday && (
                    <span className="absolute -top-2 left-2 rounded bg-foreground px-1.5
                                     py-0.5 text-[9px] font-semibold text-background">
                      HARI INI
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
        {formats.map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full"
                  style={{ background: FORMAT_COLOR[f] }} />
            {FORMAT_LABEL[f]}
            <span className="text-[10px]">
              ({slots.filter((s: Slot) => s.format === f).length})
            </span>
          </span>
        ))}
      </div>
    </Panel>
  );
}
