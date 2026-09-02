/* Cangkerang Command Centre untuk dashboard AWAM.
 * ==================================================================
 * Wan, 2026-09-02: dashboard awam patut kelihatan dan berfungsi macam
 * Bilik Kawalan peribadi.
 *
 * APA YANG TIDAK DIBAWA MASUK, DAN KENAPA
 * Bilik Kawalan itu peribadi. Separuh daripadanya ada dalam senarai
 * never-publishable dalam CLAUDE.md: teks caption penuh, draf yang belum
 * diluluskan, keputusan kelulusan, bank idea, brief Compose. Halaman
 * Channels di sana mencetak connection_id Zapier dan ID Page dalam teks
 * penghalangnya. Tiada satu pun daripadanya boleh berada pada URL awam,
 * jadi tiada satu pun daripadanya ada di sini.
 *
 * Yang dibawa masuk ialah CANGKERANGNYA — sidebar berkumpulan, palet
 * Cmd/Ctrl-K, jubin ringkasan, suis tema, laci telefon, garis masa rel —
 * dan halaman yang datanya SUDAH awam dalam bundle hari ini.
 *
 * Panel lama tidak ditulis semula. TodayDraft, CreditMeter, Channels,
 * RotationStrip, Sources dan PostGallery masuk ke dalam halaman baharu
 * seperti adanya. Menulis semula panel yang berfungsi untuk mendapatkan
 * nama kelas berbeza ialah cara paling pasti memecahkan sesuatu tanpa
 * mendapat apa-apa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hermes } from '@/lib/hermes';
import { cn } from '@/lib/utils';
import { Panel } from './primitives';
import { Badge, Tile, DOT, STATUS } from './ui';
import TodayDraft from './TodayDraft';
import CreditMeter from './CreditMeter';
import Channels from './Channels';
import RotationStrip from './RotationStrip';
import Sources from './Sources';
import PostGallery from './PostGallery';
import Timeline, { TimelineList } from './Timeline';
import Published from './Published';

/* ---------------------------------------------------------------- tema */
const THEME_KEY = 'ws.regulab.theme';
type Theme = 'light' | 'dark' | 'system';

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch { return 'system'; }
}

/* index.css hanya mentakrifkan `.dark`, tiada blok prefers-color-scheme.
   Tanpa langkah ini tapak sentiasa terang walaupun OS gelap. */
function applyTheme(t: Theme) {
  const dark = t === 'dark'
    || (t === 'system'
        && typeof matchMedia === 'function'
        && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/* --------------------------------------------------------------- laluan */
type PageId = 'overview' | 'timeline' | 'published' | 'media'
  | 'schedule' | 'channels' | 'sources';

const PAGES: { id: PageId; t: string; group: string; blurb: string }[] = [
  { id: 'overview', t: 'Ikhtisar', group: 'Keadaan',
    blurb: 'Apa yang menunggu, apa yang beratur, dan apa yang keluar malam ini.' },
  { id: 'timeline', t: 'Garis masa', group: 'Keadaan',
    blurb: 'Setiap larian, terbaharu dahulu.' },
  { id: 'published', t: 'Diterbitkan', group: 'Keadaan',
    blurb: 'Apa yang sudah keluar, bila, dan pautan kepada setiap satu.' },
  { id: 'media', t: 'Kad', group: 'Kandungan',
    blurb: 'Setiap kad yang dirender, sifar kredit setiap satu.' },
  { id: 'schedule', t: 'Jadual mingguan', group: 'Kandungan',
    blurb: 'Satu domain sehari, dan folder yang dibaca setiap hari.' },
  { id: 'channels', t: 'Saluran', group: 'Penghantaran',
    blurb: 'Ke mana post pergi, dan had caption setiap platform.' },
  { id: 'sources', t: 'Sumber', group: 'Penghantaran',
    blurb: 'Dokumen rasmi di sebalik setiap nombor.' },
];
const GROUPS = ['Keadaan', 'Kandungan', 'Penghantaran'];

const PAGE_KEY = 'ws.regulab.page';

function routeOf(): PageId {
  let want = (location.hash || '').replace(/^#\/?/, '');
  if (!want) { try { want = sessionStorage.getItem(PAGE_KEY) ?? ''; } catch { /* tab peribadi */ } }
  return PAGES.some((p) => p.id === want) ? (want as PageId) : 'overview';
}

const todayMY = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

function counts() {
  const c: Record<string, number> = {};
  hermes.posts.forEach((p) => { c[p.status] = (c[p.status] ?? 0) + 1; });
  return c;
}

/* ------------------------------------------------------------- ikhtisar */
function Overview({ go }: { go: (p: PageId) => void }) {
  const c = counts();
  const b = hermes.budget;
  const live = hermes.channels.filter((x) => x.connected).length;
  const next = hermes.posts
    .filter((p) => p.status === 'approved' && p.date >= todayMY())
    .sort((a, z) => (a.date < z.date ? -1 : 1))[0];
  const total = hermes.posts.length || 1;
  const lanes = Object.keys(STATUS).filter((k) => c[k]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Menunggu kelulusan" value={c.ready_for_approval ?? 0}
          tone={c.ready_for_approval ? 'warn' : 'good'}
          pill={c.ready_for_approval ? 'perlu tindakan' : 'bersih'}
          foot="Draf yang lulus setiap gerbang dan berhenti di situ." />
        <Tile label="Seterusnya keluar" value={next ? next.date : '—'}
          tone={next ? 'good' : 'mute'} pill={next ? 'diluluskan' : 'tiada'}
          foot={next
            ? 'Keluar 9:45 malam MYT ke Instagram, Facebook Page dan Threads.'
            : 'Tiada draf diluluskan yang bertarikh ke hadapan.'} />
        <Tile label="Saluran hidup" value={`${live} / ${hermes.channels.length}`}
          tone={live === hermes.channels.length ? 'good' : 'warn'}
          pill={live === hermes.channels.length ? 'sihat' : 'periksa'}
          foot="Instagram dan Facebook Page melalui Zapier, Threads melalui Buffer." />
        <Tile label="Kredit imej" value={b.monthly_credits - b.spent_this_month}
          tone="mute" pill={b.plan}
          foot={`${b.spent_this_month} daripada ${b.monthly_credits} dibelanja bulan ini.
            Kad dirender sebagai rajah dan tidak memakan kredit.`} />
      </div>

      <Panel title="Setiap draf yang Hermes pernah tulis"
        hint="Satu jalur, satu lorong setiap satu.">
        <div className="flex h-2 overflow-hidden rounded-full bg-border">
          {lanes.map((k) => (
            <span key={k} className={cn('block', DOT[STATUS[k].tone])}
              style={{ width: `${(c[k] / total) * 100}%` }} />
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Object.keys(STATUS).filter((k) => c[k]).map((k) => (
            <button key={k} type="button" onClick={() => go('timeline')}
              className="flex items-start gap-2.5 rounded-lg border border-border
              p-3 text-left transition-colors hover:bg-secondary">
              <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                DOT[STATUS[k].tone])} />
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <b className="text-[13px]">{STATUS[k].t}</b>
                  <span className="text-[13px] tabular-nums text-muted-foreground">
                    {c[k]}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {STATUS[k].h}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <TodayDraft />

      <Panel title="Tujuh larian terakhir"
        hint="Aliran penuh ada pada Garis masa.">
        <TimelineList rows={hermes.posts.slice(0, 7)} />
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- palet */
type Cmd = { k: string; label: string; hint: string; run: () => void };

function Palette({ open, onClose, go, onTheme }: {
  open: boolean; onClose: () => void; go: (p: PageId) => void; onTheme: () => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    const t = setTimeout(() => box.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  const items = useMemo<Cmd[]>(() => {
    const out: Cmd[] = PAGES.map((p) => ({
      k: `p:${p.id}`, label: p.t, hint: p.group, run: () => go(p.id),
    }));
    hermes.posts.forEach((p) => out.push({
      k: `d:${p.date}`,
      label: `${p.date} · ${(p.angle || '').slice(0, 58)}`,
      hint: STATUS[p.status]?.t ?? p.status,
      run: () => go('timeline'),
    }));
    out.push({ k: 'a:theme', label: 'Tukar terang / gelap', hint: 'Paparan',
      run: onTheme });
    return out;
  }, [go, onTheme]);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items.slice(0, 9);
    return items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(n))
      .slice(0, 12);
  }, [q, items]);

  if (!open) return null;
  const pick = (i?: Cmd) => { onClose(); i?.run(); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Cari halaman atau draf"
      className="fixed inset-0 z-[65] flex items-start justify-center bg-foreground/25
      p-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border
        bg-popover shadow-xl">
        <input ref={box} value={q} placeholder="Lompat ke halaman atau tarikh draf…"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); pick(hits[sel]); }
          }}
          className="h-12 w-full border-b border-border bg-transparent px-4 text-sm
          outline-none placeholder:text-muted-foreground/70" />
        <ul className="max-h-[52vh] overflow-y-auto p-1.5">
          {!hits.length && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              Tiada yang sepadan.
            </li>
          )}
          {hits.map((i, k) => (
            <li key={i.k}>
              <button type="button" onMouseEnter={() => setSel(k)} onClick={() => pick(i)}
                className={cn('flex w-full items-center justify-between gap-3 rounded-md',
                  'px-3 py-2 text-left text-[13px]', k === sel && 'bg-secondary')}>
                <span className="min-w-0 truncate">{i.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{i.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sidebar */
function Sidebar({ here, go, onClose }: {
  here: PageId; go: (p: PageId) => void; onClose?: () => void;
}) {
  const c = counts();
  const n: Record<PageId, number | ''> = {
    overview: '', timeline: hermes.posts.length,
    published: c.posted ?? 0, media: hermes.posts.filter((p) => p.thumb).length,
    schedule: hermes.slots.length, channels: hermes.channels.length,
    sources: hermes.sources.length,
  };
  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto bg-sidebar p-3">
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary
          font-mono text-[11px] font-semibold text-primary-foreground">ws</span>
        <span className="min-w-0">
          <b className="block truncate text-[13.5px] leading-tight">{hermes.brand.name}</b>
          <span className="text-[11px] text-muted-foreground">Command Centre</span>
        </span>
      </div>
      {GROUPS.map((g) => (
        <div key={g}>
          <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase
            tracking-[.11em] text-muted-foreground">{g}</p>
          {PAGES.filter((p) => p.group === g).map((p) => (
            <a key={p.id} href={`#/${p.id}`}
              onClick={() => { go(p.id); onClose?.(); }}
              className={cn('flex items-center justify-between gap-2 rounded-md px-2',
                'py-1.5 text-[13px] transition-colors',
                p.id === here ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-secondary')}>
              <span className="truncate">{p.t}</span>
              {n[p.id] !== '' && (
                <span className={cn('shrink-0 text-[11px] tabular-nums',
                  p.id === here ? 'opacity-80' : 'text-muted-foreground')}>
                  {n[p.id]}
                </span>
              )}
            </a>
          ))}
        </div>
      ))}
      <div className="mt-auto space-y-1 pt-4">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[.11em]
          text-muted-foreground">Saluran</p>
        {hermes.channels.map((ch) => (
          <div key={ch.key} className="flex items-center justify-between gap-2 px-2
            py-1 text-xs">
            <span className="truncate text-muted-foreground">{ch.label}</span>
            <span className={cn('shrink-0 font-medium',
              ch.connected ? 'text-good' : 'text-crit')}>
              {ch.connected ? 'hidup' : 'mati'}
            </span>
          </div>
        ))}
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------------- akar */
export default function Shell() {
  const [here, setHere] = useState<PageId>(routeOf);
  const [nav, setNav] = useState(false);
  const [pal, setPal] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : t === 'light' ? 'system' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch { /* tab peribadi */ }
      return next;
    });
  }, []);

  const go = useCallback((p: PageId) => {
    setHere(p);
    try { sessionStorage.setItem(PAGE_KEY, p); } catch { /* tab peribadi */ }
    if (location.hash !== `#/${p}`) location.hash = `#/${p}`;
    scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const fn = () => setHere(routeOf());
    addEventListener('hashchange', fn);
    return () => removeEventListener('hashchange', fn);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPal((v) => !v);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  const page = PAGES.find((p) => p.id === here) ?? PAGES[0];
  const body = {
    overview: <Overview go={go} />,
    timeline: <Timeline />,
    published: <Published />,
    media: <PostGallery />,
    schedule: <div className="space-y-5"><RotationStrip /><CreditMeter /></div>,
    channels: <Channels />,
    sources: <Sources />,
  }[here];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r
          border-sidebar-border lg:block">
          <Sidebar here={here} go={go} />
        </aside>

        {nav && (
          <div className="fixed inset-0 z-50 lg:hidden"
            onClick={(e) => { if (e.target === e.currentTarget) setNav(false); }}>
            <div className="absolute inset-0 bg-foreground/30" />
            <div className="absolute inset-y-0 left-0 w-[264px] border-r
              border-sidebar-border shadow-xl">
              <Sidebar here={here} go={go} onClose={() => setNav(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-border
            bg-background/85 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <button type="button" aria-label="Buka navigasi"
                onClick={() => setNav(true)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md
                hover:bg-secondary lg:hidden">&#9776;</button>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[.11em]
                  text-muted-foreground">{hermes.brand.name} · Hermes</p>
                <h1 className="truncate text-xl font-semibold tracking-tight
                  sm:text-2xl">{page.t}</h1>
              </div>
              <button type="button" onClick={() => setPal(true)}
                className="hidden h-8 items-center gap-2 rounded-md border border-border
                px-2.5 text-xs text-muted-foreground hover:bg-secondary sm:flex">
                Cari
                <kbd className="rounded border border-border bg-muted px-1 font-mono
                  text-[10px]">&#8984;K</kbd>
              </button>
              <button type="button" onClick={cycleTheme}
                aria-label={`Tema: ${theme}. Tukar.`} title={`Tema: ${theme}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md
                hover:bg-secondary">&#9681;</button>
            </div>
            <p className="max-w-[80ch] px-4 pb-3 text-xs leading-relaxed
              text-muted-foreground sm:px-6">{page.blurb}</p>
          </header>

          <div className="px-4 py-5 sm:px-6">{body}</div>

          <footer className="border-t border-border px-4 py-5 text-xs leading-relaxed
            text-muted-foreground sm:px-6">
            Petikan keadaan dijana {new Date(hermes.generated_at).toLocaleString('ms-MY')}.
            Teks caption tidak pernah masuk ke dalam bundle ini, hanya keadaan operasi.
            Nota penuh dibaca di platform tempat ia diterbitkan.
            {' '}<a href="./" className="underline underline-offset-2
              hover:text-foreground">Kembali ke laman utama</a>.
          </footer>
        </main>
      </div>

      <Palette open={pal} onClose={() => setPal(false)} go={go} onTheme={cycleTheme} />
    </div>
  );
}

export { Badge };
