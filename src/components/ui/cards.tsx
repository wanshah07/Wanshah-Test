import React from 'react';
import { cn } from '@/lib/utils'; // Assuming shadcn's utility for class names

/**
 * @typedef CardItem
 * @property {string | number} id - Unique identifier for the card.
 * @property {string} title - The main title text of the card.
 * @property {string} subtitle - The subtitle or category text.
 * @property {string} imageUrl - The URL for the card's background image.
 * @property {string} [href] - Where the card navigates. Renders it as a link.
 * @property {string} [target] - Link target, e.g. "_blank".
 */
export interface CardItem {
  id: string | number;
  title: string;
  subtitle: string;
  imageUrl: string;
  href?: string;
  target?: React.HTMLAttributeAnchorTarget;
}

/**
 * @typedef HoverRevealCardsProps
 * @property {CardItem[]} items - An array of card item objects to display.
 * @property {(item: CardItem) => void} [onSelect] - Called when a card is
 *   activated. Renders cards as buttons. Ignored on items that carry an href.
 * @property {string} [className] - Optional additional class names for the container.
 * @property {string} [cardClassName] - Optional additional class names for individual cards.
 */
export interface HoverRevealCardsProps {
  items: CardItem[];
  onSelect?: (item: CardItem) => void;
  className?: string;
  cardClassName?: string;
}

/**
 * A grid of cards with a hover-reveal effect: hovering or focusing one card
 * brings it forward and de-emphasises the rest.
 *
 * Each card renders as whatever it actually does:
 *   - `href` on the item        -> an anchor, so middle-click, ctrl-click and
 *                                  "copy link address" all behave
 *   - `onSelect` on the grid    -> a button, so Enter and Space activate it
 *   - neither                   -> a plain focusable div, no pointer cursor
 *
 * Anchors and buttons are focusable and keyboard-operable for free, which a
 * div with a click handler is not. The list markup is a real ul/li so the
 * interactive element keeps its own role.
 */
const HoverRevealCards: React.FC<HoverRevealCardsProps> = ({
  items,
  onSelect,
  className,
  cardClassName,
}) => {
  return (
    // The `group` class on the container enables styling children on parent hover.
    <ul
      className={cn(
        'group grid w-full max-w-6xl list-none grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-4',
        className
      )}
    >
      {items.map((item) => {
        const interactive = Boolean(item.href) || Boolean(onSelect);

        const cardClasses = cn(
          'relative block h-80 w-full overflow-hidden rounded-xl bg-cover bg-center text-left shadow-lg transition-all duration-500 ease-in-out',
          interactive && 'cursor-pointer',
          // On parent hover, apply these styles to all children. focus-within
          // matches so a keyboard user gets the same de-emphasis a mouse user
          // does; without it the focused card grows but nothing recedes.
          'group-hover:scale-[0.97] group-hover:opacity-60 group-hover:blur-[2px]',
          'group-focus-within:scale-[0.97] group-focus-within:opacity-60 group-focus-within:blur-[2px]',
          // On child hover/focus, override parent hover styles to highlight the current item.
          // The `!` is used to ensure these styles take precedence.
          'hover:!scale-105 hover:!opacity-100 hover:!blur-none focus-visible:!scale-105 focus-visible:!opacity-100 focus-visible:!blur-none',
          // Accessibility: Add focus ring using theme variables.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
          // The scale and blur are decorative, so follow the OS setting.
          'motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-hover:blur-none',
          'motion-reduce:group-focus-within:scale-100 motion-reduce:group-focus-within:blur-none',
          cardClassName
        );

        const style = { backgroundImage: `url(${item.imageUrl})` };
        const label = `${item.title}, ${item.subtitle}`;

        const inner = (
          <>
            {/* Gradient overlay for text contrast, a standard UI practice for text on images. */}
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

            {/* Card Content */}
            <span className="absolute bottom-0 left-0 block p-6 text-white">
              <span className="block text-sm font-light uppercase tracking-widest opacity-80">
                {item.subtitle}
              </span>
              {/* Upstream had `text-2l`, which is not a Tailwind class and emitted
                  no rule, so the title rendered at the inherited size. */}
              <span className="mt-1 block text-2xl font-semibold">{item.title}</span>
            </span>
          </>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <a
                href={item.href}
                target={item.target}
                // Opening a new tab without this hands the new page a window
                // reference back to this one.
                rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
                aria-label={label}
                className={cardClasses}
                style={style}
              >
                {inner}
              </a>
            ) : onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-label={label}
                className={cardClasses}
                style={style}
              >
                {inner}
              </button>
            ) : (
              <div
                tabIndex={0} // Focusable so the reveal is reachable by keyboard.
                aria-label={label}
                className={cardClasses}
                style={style}
              >
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default HoverRevealCards;
