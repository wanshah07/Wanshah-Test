import { hermes, FORMAT_LABEL, type Post } from '@/lib/hermes';
import { Panel } from './primitives';

/* The four lanes Wan asked for, mapped onto the statuses Hermes actually
   writes. The mapping is spelled out rather than assumed, because "baru"
   and "tunggu approve" sound like two things and are one status in the
   pipeline — what separates a held draft from a ready one is whether its
   figures are verified, not how recently it was written. */
const LANES = [
  { key: 'needs_verification', label: 'Perlu semakan',
    hint: 'Ditulis, tetapi ada angka yang belum disahkan',
    tone: 'var(--viz-warning)' },
  { key: 'ready_for_approval', label: 'Tunggu kelulusan',
    hint: 'Siap dan lulus semua gerbang — menunggu anda',
    tone: 'var(--viz-seq-500)' },
  { key: 'approved', label: 'Diluluskan',
    hint: 'Anda sudah setuju; belum keluar ke platform',
    tone: 'var(--viz-1)' },
  { key: 'posted', label: 'Sudah dipos',
    hint: 'Hidup di platform',
    tone: 'var(--viz-good)' },
  { key: 'rejected', label: 'Ditolak',
    hint: 'Disimpan sebagai rekod, tidak akan dipos',
    tone: 'var(--viz-muted)' },
] as const;

function PostCard({ p, tone }: { p: Post; tone: string }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      {p.thumb ? (
        <img
          src={p.thumb}
          alt={`Kad pertama post ${p.date}`}
          loading="lazy"
          width={1080}
          height={1080}
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center
                        bg-muted text-xs text-muted-foreground">
          Tiada kad
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full"
                style={{ background: tone }} />
          <span className="text-xs font-medium tabular-nums">{p.date}</span>
          {p.day_index != null && (
            <span className="text-[11px] text-muted-foreground">
              hari {p.day_index}
            </span>
          )}
        </div>

        <p className="mt-1.5 line-clamp-2 text-xs leading-snug">{p.angle}</p>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {[p.domain, p.pillar].filter(Boolean).join(' · ')}
        </p>

        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {FORMAT_LABEL[p.format as keyof typeof FORMAT_LABEL] ?? p.format}
          {p.cards > 0 && ` · ${p.cards} kad`}
          {p.credits_spent > 0 && ` · ${p.credits_spent} kredit`}
        </p>

        {p.posted_to.length > 0 && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            → {p.posted_to.map((c) => c.replace('_', ' ')).join(', ')}
          </p>
        )}
      </div>
    </article>
  );
}

export default function PostGallery() {
  const posts = hermes.posts;

  if (posts.length === 0) {
    return (
      <Panel title="Senarai post">
        <p className="text-sm text-muted-foreground">
          Belum ada draf ditulis.
        </p>
      </Panel>
    );
  }

  const lanes = LANES
    .map((l) => ({ ...l, items: posts.filter((p) => p.status === l.key) }))
    .filter((l) => l.items.length > 0);

  /* A status Hermes wrote that no lane covers. Showing it beats dropping it
     silently — a post that vanishes from the dashboard because its status
     is unrecognised is exactly the kind of thing nobody notices. */
  const known = new Set(LANES.map((l) => l.key as string));
  const stray = posts.filter((p) => !known.has(p.status));

  return (
    <Panel
      title="Senarai post"
      hint={`${posts.length} draf · thumbnail ialah kad pertama setiap post`}
    >
      <div className="space-y-6">
        {lanes.map((lane) => (
          <div key={lane.key}>
            <div className="flex items-baseline gap-2">
              <h3 className="text-xs font-semibold tracking-tight">{lane.label}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {lane.items.length}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{lane.hint}</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lane.items.map((p) => (
                <PostCard key={p.date} p={p} tone={lane.tone} />
              ))}
            </div>
          </div>
        ))}

        {stray.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold tracking-tight">
              Status tidak dikenali
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stray.map((p) => (
                <PostCard key={p.date} p={p} tone="var(--viz-critical)" />
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="mt-5 border-t border-border pt-3 text-[11px] text-muted-foreground">
        Thumbnail ialah kad pertama sahaja. Repo ini awam dan disajikan di
        GitHub Pages, jadi apa-apa yang masuk ke <code
          className="rounded bg-muted px-1 py-0.5">public/</code> boleh dibaca
        sesiapa — satu kad muka depan memadai untuk senarai ini tanpa
        meletakkan carousel yang belum diluluskan di web terbuka.
      </p>
    </Panel>
  );
}
