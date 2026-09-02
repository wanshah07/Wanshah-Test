import { hermes, gateState, GATE_LABEL } from '@/lib/hermes';
import { Panel } from './primitives';

const STATUS = {
  ready_for_approval: { tone: 'var(--viz-good)', label: 'Sedia untuk kelulusan' },
  needs_verification: { tone: 'var(--viz-warning)', label: 'Perlu pengesahan' },
  posted: { tone: 'var(--viz-good)', label: 'Sudah dipos' },
  rejected: { tone: 'var(--viz-critical)', label: 'Ditolak' },
} as const;

const GATE_TONE = {
  pass: { tone: 'var(--viz-good)', glyph: '✓', word: 'Lulus' },
  blocked: { tone: 'var(--viz-warning)', glyph: '!', word: 'Tersekat' },
  skipped: { tone: 'var(--viz-muted)', glyph: '–', word: 'Tak berkenaan' },
} as const;

/* `day_index` datang dari kalendar 14-slot lama dan tiada lagi dalam
   meta.json sejak jadual bertukar kepada hari tetap pada 2026-08-31.
   Templat rentetan mencetaknya sebagai "hari undefined" pada skrin dan
   terus melukis, jadi tiada apa yang mengadu — ia hanya kelihatan rosak.
   Nama hari kini dikira daripada tarikh, yang sentiasa ada. */
const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

/** Nama hari daripada tarikh ISO, dibaca sebagai UTC supaya zon waktu
 *  pelayar tidak menggesernya sehari. */
function namaHari(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : HARI[d.getUTCDay()];
}

export default function TodayDraft() {
  const d = hermes.today_draft;

  if (!d) {
    return (
      <Panel title="Draf hari ini" hint={hermes.cycle.today}>
        <p className="text-sm text-muted-foreground">
          Belum ada draf untuk hari ini. Routine berjadual pukul{' '}
          {hermes.schedule.local}, atau jalankan <code
            className="rounded bg-muted px-1 py-0.5">/hermes</code> secara manual.
        </p>
      </Panel>
    );
  }

  const st = STATUS[d.status as keyof typeof STATUS]
    ?? { tone: 'var(--viz-muted)', label: d.status };
  const channels = hermes.channels.filter((c) => d.channels[c.key] !== undefined);

  return (
    <Panel title="Draf hari ini" hint={[d.date, namaHari(d.date), d.pillar]
      .filter(Boolean).join(' · ')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border
                         border-border px-2.5 py-1 text-xs font-medium">
          <span aria-hidden className="size-2 rounded-full" style={{ background: st.tone }} />
          {st.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {d.credits_spent} kredit
        </span>
      </div>

      <p className="mt-3 text-sm font-medium">{d.angle}</p>

      {/* Character counts against each platform's real limit. A variant
          over its limit is a defect, not a near-miss, so the bar is shown
          against the ceiling rather than as a bare number. */}
      <div className="mt-4 space-y-2">
        {channels.map((c) => {
          const n = d.channels[c.key];
          const over = n > c.limit;
          const shown = Math.min(c.limit, Math.max(c.target * 1.6, n));
          return (
            <div key={c.key} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full"
                   style={{ background: 'var(--viz-grid)' }}>
                <div className="h-full rounded-full"
                     style={{
                       width: `${Math.min((n / shown) * 100, 100)}%`,
                       background: over ? 'var(--viz-critical)' : 'var(--viz-seq-500)',
                     }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums
                               text-muted-foreground">
                {n} / {c.limit}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-xs font-semibold">Gerbang pematuhan</h3>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {Object.entries(d.gates).map(([k, v]) => {
            const g = GATE_TONE[gateState(v)];
            return (
              <div key={k} className="flex items-start gap-2">
                <span aria-hidden
                      className="mt-px flex size-4 shrink-0 items-center justify-center
                                 rounded-full text-[10px] font-bold text-white"
                      style={{ background: g.tone }}>{g.glyph}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium">
                    {GATE_LABEL[k] ?? k}{' '}
                    <span className="font-normal text-muted-foreground">— {g.word}</span>
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{v}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {d.verify_markers.length > 0 && (
        <div className="mt-4 rounded-lg border border-border p-3.5"
             style={{ borderLeftWidth: 3, borderLeftColor: 'var(--viz-warning)' }}>
          <p className="text-xs font-semibold">
            {d.verify_markers.length} angka menunggu pengesahan
          </p>
          <ul className="mt-1.5 space-y-1">
            {d.verify_markers.map((m) => (
              <li key={m} className="text-xs text-muted-foreground">— {m}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Draf ditahan sehingga angka ini diisi dari sumber rasmi. Hermes
            tidak meneka nombor peraturan.
          </p>
        </div>
      )}
    </Panel>
  );
}
