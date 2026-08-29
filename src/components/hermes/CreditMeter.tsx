import { hermes } from '@/lib/hermes';
import { Panel, Stat } from './primitives';

/**
 * The one panel that changes a decision: whether the plan can pay for
 * what the calendar promises.
 *
 * Three quantities on one 300-credit scale — spent so far, what the rest
 * of the month is planned to cost, and the headroom left over. A stacked
 * bar rather than three separate gauges, because the question is how they
 * add up against a single ceiling.
 */
export default function CreditMeter() {
  const b = hermes.budget;
  const v = hermes.video;
  const cap = b.monthly_credits;
  const planned = Math.max(b.projected_monthly - b.spent_this_month, 0);
  const pct = (n: number) => `${(n / cap) * 100}%`;

  return (
    <Panel
      title="Kredit BudgetPixel"
      hint={b.visual_default === 'rajah'
        ? `Pelan ${b.plan} · ${cap} kredit sebulan · visual lalai ialah rajah dirender (0 kredit)`
        : `Pelan ${b.plan} · ${cap} kredit sebulan · ${b.cost_per_image} kredit sekeping imej (${b.model})`}
    >
      <div className="grid grid-cols-3 gap-4">
        <Stat value={b.spent_this_month} unit={`/ ${cap}`} label="Dibelanja bulan ini"
              note={`${b.images_this_month} imej dijana`} />
        <Stat value={b.projected_monthly} unit="kredit" label="Unjuran kalendar"
              tone={b.projected_monthly === 0 ? 'good' : 'default'}
              note={b.visual_default === 'rajah'
                ? `${b.image_days_per_cycle} hari visual, semuanya rajah dirender`
                : `${b.image_days_per_cycle} hari imej setiap ${hermes.cycle.length_days}`} />
        <Stat value={b.headroom} unit="kredit" label="Ruang lebih"
              tone={b.headroom > 0 ? 'good' : 'critical'}
              note={b.projected_monthly === 0
                ? 'kalendar tidak guna kredit langsung'
                : b.headroom > 0 ? 'kalendar muat' : 'kalendar melebihi had'} />
      </div>

      {/* Stacked meter. 2px gaps between segments so adjacent fills never
          touch; rounded ends only at the outer edges of the run. */}
      <div className="mt-5">
        <div className="flex h-3 w-full overflow-hidden rounded-full"
             style={{ background: 'var(--viz-grid)' }}
             role="img"
             aria-label={`${b.spent_this_month} kredit dibelanja, ${planned} kredit dirancang, daripada had ${cap}`}>
          {b.spent_this_month > 0 && (
            <div style={{ width: pct(b.spent_this_month), background: 'var(--viz-seq-500)',
                          marginRight: 2, borderRadius: '9999px 0 0 9999px' }} />
          )}
          <div style={{ width: pct(planned), background: 'var(--viz-seq-250)',
                        marginRight: 2,
                        borderRadius: b.spent_this_month > 0 ? 0 : '9999px 0 0 9999px' }} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full"
                  style={{ background: 'var(--viz-seq-500)' }} />
            Dibelanja {b.spent_this_month}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full"
                  style={{ background: 'var(--viz-seq-250)' }} />
            Dirancang {planned}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full"
                  style={{ background: 'var(--viz-grid)' }} />
            Baki {cap - b.spent_this_month - planned}
          </span>
        </div>
      </div>

      {/* Video is the part of the original brief the plan cannot pay for.
          The arithmetic is shown rather than asserted. */}
      <div className="mt-5 rounded-lg border border-border p-3.5"
           style={{ borderLeftWidth: 3, borderLeftColor: 'var(--viz-warning)' }}>
        <p className="text-xs font-semibold">
          Video dimatikan {v.enabled ? '(dihidupkan)' : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Klip termurah — 480p, 5 saat — berharga{' '}
          <strong className="text-foreground">{v.cheapest_clip_credits} kredit</strong>.
          Itu {v.months_per_clip === 1 ? 'tepat satu bulan' : `${v.months_per_clip} bulan`}{' '}
          peruntukan, untuk satu klip. Naik taraf pelan dahulu, kemudian tukar{' '}
          <code className="rounded bg-muted px-1 py-0.5">video.enabled</code> dalam{' '}
          <code className="rounded bg-muted px-1 py-0.5">budget.yml</code>.
        </p>
      </div>
    </Panel>
  );
}
