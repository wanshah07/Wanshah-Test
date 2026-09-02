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

const HoverRevealCardsDemo = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <HoverRevealCards items={demoItems} />
    </div>
  );
};

export default HoverRevealCardsDemo;
