import raw from '@/data/hermes.json';

/** Shape of the snapshot written by `scripts/sync-hermes.py`. */
export type Slot = {
  day: number; brand: string; pillar: string; title: string;
  format: 'carousel' | 'text_image' | 'text_only';
};

export type Channel = {
  key: string; label: string; connected: boolean; enabled: boolean;
  limit: number; target: number; zapier: string;
};

export type Draft = {
  date: string; day_index: number; brand: string; pillar: string;
  angle: string; format: string; status: string; credits_spent: number;
  gates: Record<string, string>;
  channels: Record<string, number>;
  verify_markers: string[];
  posted_at: string | null;
};

/* The JSON import infers `format` as plain `string` and `today_draft` as a
   loose object; Omit those keys before intersecting so the declared unions
   above win instead of being widened back out. */
export type Fact = {
  section: string; key: string; status: 'disahkan' | 'belum_disahkan';
  source: string; checked: string;
};

export type Source = {
  key: string; label: string; status: string; configured: boolean;
};

export type Hermes = Omit<typeof raw,
  'slots' | 'channels' | 'today_draft' | 'facts' | 'sources'> & {
  slots: Slot[]; channels: Channel[]; today_draft: Draft | null;
  facts: Fact[]; sources: Source[];
};

export const hermes = raw as unknown as Hermes;

/** Colour slot per post format. Fixed assignment — never cycled, so a
 *  format keeps its colour no matter how the calendar is reordered. */
export const FORMAT_COLOR: Record<Slot['format'], string> = {
  carousel: 'var(--viz-1)',
  text_image: 'var(--viz-2)',
  text_only: 'var(--viz-3)',
};

export const FORMAT_LABEL: Record<Slot['format'], string> = {
  carousel: 'Carousel',
  text_image: 'Teks + imej',
  text_only: 'Teks sahaja',
};

/** A gate is either clear or it is not. `blocked` is not a failure of the
 *  agent — it is the agent refusing to guess, which is the point. */
export type GateState = 'pass' | 'blocked' | 'skipped';

export function gateState(v: string): GateState {
  if (v.startsWith('pass')) return 'pass';
  if (v.startsWith('blocked')) return 'blocked';
  return 'skipped';
}

export const GATE_LABEL: Record<string, string> = {
  claims: 'Dakwaan kosmetik',
  halal: 'Dakwaan halal',
  credibility: 'Kredibiliti perunding',
  tone: 'Nada manusia',
  facts: 'Fakta',
};
