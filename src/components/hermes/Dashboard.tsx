import { hermes } from '@/lib/hermes';
import CreditMeter from './CreditMeter';
import RotationStrip from './RotationStrip';
import TodayDraft from './TodayDraft';
import PostGallery from './PostGallery';
import Channels from './Channels';
import Sources from './Sources';

export default function Dashboard() {
  const { brand, schedule, cycle, generated_at } = hermes;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Hermes
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{brand.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Draf setiap malam {schedule.local} ({schedule.timezone}). Hermes
            menulis, menyemak pematuhan, dan berhenti — penerbitan sentiasa
            langkah manusia.
          </p>
        </header>

        <div className="space-y-5">
          <TodayDraft />
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <CreditMeter />
            <Channels />
          </div>
          {/* The rotation strip is seven labelled cells per row; at half
              width the labels collapse, so it keeps the full measure. */}
          <RotationStrip />
          <PostGallery />
          <Sources />
        </div>

        <footer className="mt-10 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Petikan keadaan dijana {new Date(generated_at).toLocaleString('ms-MY')} ·
            kitaran bermula {cycle.start} · jalankan{' '}
            <code className="rounded bg-muted px-1 py-0.5">
              python3 scripts/sync-hermes.py ../malaysian-regulatory-affairs
            </code>{' '}
            untuk menyegarkan.
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Teks caption tidak pernah masuk ke dalam bundle ini — hanya keadaan
            operasi. Lihat README sebelum merge ke <code
              className="rounded bg-muted px-1 py-0.5">main</code>.
          </p>
        </footer>
      </div>
    </div>
  );
}
