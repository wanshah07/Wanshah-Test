/* Nota regulatori — apa yang ws.regulab sudah terbitkan.
 *
 * APA YANG SEKSYEN INI TIDAK BUAT: ia tidak menyalin caption.
 *
 * Caption ada dalam senarai "never publishable" dalam CLAUDE.md, dan
 * senarai itu terpakai walaupun caption itu SUDAH awam di Instagram dan
 * Facebook. Sebabnya bukan kerahsiaan, ia kedudukan: repo ini tidak
 * menjadi salinan kedua kandungan itu, dan bundle awam kekal sebagai
 * keadaan operasi sahaja.
 *
 * Jadi setiap entri membawa tarikh, domain, sudut, dan instrumen yang
 * dipetik — kesemuanya sudah ada dalam bundle hari ini — dan MENGHALA
 * KELUAR ke post sebenar. Pembaca yang mahu teks penuh membacanya di
 * tempat ia diterbitkan, di mana ia juga dikira sebagai engagement.
 */
import { hermes } from '@/lib/hermes';

const DOMAIN: Record<string, string> = {
  kosmetik: 'Kosmetik',
  makanan: 'Makanan',
  halal_my: 'Halal Malaysia',
  halal_id: 'Halal Indonesia',
  farmaseutikal: 'Farmaseutikal',
  fatwa: 'Fatwa',
  kajian_kes: 'Kajian kes',
};

export default function NotaRegulatori() {
  const posts = hermes.posts.filter((p) => p.status === 'posted');

  return (
    <section id="nota" className="border-t border-gray-800/50 px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight">
          Nota regulatori
        </h2>
        <p className="mt-3 max-w-2xl text-sm" style={{ color: '#9ca3af' }}>
          Setiap nota bermula daripada satu instrumen rasmi, bukan daripada
          ringkasan. Instrumen itu dinamakan di bawah setiap satu.
        </p>

        {posts.length === 0 ? (
          <p className="mt-10 text-sm" style={{ color: '#9ca3af' }}>
            Belum ada nota yang diterbitkan.
          </p>
        ) : (
          <ul className="mt-10 grid gap-4 md:grid-cols-2">
            {posts.map((p) => (
              <li
                key={p.date}
                className="flex gap-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4"
              >
                {p.thumb && (
                  <img
                    src={p.thumb}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-20 w-20 shrink-0 rounded-md border border-gray-800 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <time
                      dateTime={p.date}
                      className="text-xs tabular-nums"
                      style={{ color: '#9ca3af' }}
                    >
                      {p.date}
                    </time>
                    {DOMAIN[p.domain] && (
                      <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                        style={{ color: '#9ca3af' }}>
                        {DOMAIN[p.domain]}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-1.5 text-sm leading-snug text-white">
                    {p.angle}
                  </h3>

                  {p.citation && (
                    <p className="mt-1.5 text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
                      {p.citation}
                    </p>
                  )}

                  {p.links.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {p.links.map((l) => (
                        <a
                          key={l.channel}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-gray-700 px-2 py-1 text-xs text-white/70 transition-colors hover:border-gray-500 hover:text-white"
                        >
                          Baca di {l.channel}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-xs" style={{ color: '#9ca3af' }}>
          Nota baharu keluar setiap malam, 9:45 waktu Malaysia.
        </p>
      </div>
    </section>
  );
}
