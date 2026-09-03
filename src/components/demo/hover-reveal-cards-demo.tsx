import { useState } from 'react';

import HoverRevealCards, { type CardItem } from '@/components/ui/cards';

// Unsplash URLs, cleaned: the upstream strings carried a second "?" and a
// duplicate q/w pair, so the trailing parameters were being read as part of
// the previous value rather than as their own.
const demoItems: CardItem[] = [
  {
    id: 1,
    title: 'Echoes',
    subtitle: 'Grand Canyon',
    imageUrl:
      'https://images.unsplash.com/photo-1723633345813-4fa3642d13f6?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 2,
    title: 'Highest Mountain',
    subtitle: 'Yosemite',
    imageUrl:
      'https://plus.unsplash.com/premium_photo-1673283379754-27635807eaf8?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 3,
    title: 'Deep Desert',
    subtitle: 'Sahara',
    imageUrl:
      'https://images.unsplash.com/photo-1592782480535-847fa6dbff97?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 4,
    title: 'Breath-taking',
    subtitle: 'Landscape',
    imageUrl:
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1600&auto=format&fit=crop',
  },
];

// Same four, as links. An href turns each card into an anchor, so middle-click
// and "copy link address" work the way people expect them to.
const linkItems: CardItem[] = demoItems.map((item) => ({
  ...item,
  href: `https://unsplash.com/s/photos/${encodeURIComponent(item.subtitle)}`,
  target: '_blank',
}));

const HoverRevealCardsDemo = () => {
  const [picked, setPicked] = useState<CardItem | null>(null);

  return (
    <div className="flex w-full flex-col items-center gap-10 bg-background p-4 py-10">
      <section className="flex w-full flex-col items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Buttons — onSelect fires on click, Enter and Space
        </h2>
        <HoverRevealCards items={demoItems} onSelect={setPicked} />
        <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
          {picked ? `Picked: ${picked.title} (${picked.subtitle})` : 'Nothing picked yet.'}
        </p>
      </section>

      <section className="flex w-full flex-col items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Links — each card carries an href
        </h2>
        <HoverRevealCards items={linkItems} />
      </section>
    </div>
  );
};

export default HoverRevealCardsDemo;
