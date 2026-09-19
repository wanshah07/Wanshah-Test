import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { encode } from 'qss';
import React from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

/* LinkPreview (Aceternity) — port Vite.
 *
 * Sumber asal ialah komponen Next.js. Projek ini Vite + React 19, jadi tiga
 * perkara ditukar, bukan sekadar dibiarkan:
 *
 *   - `next/image` menjadi <img>. `next/image` membawa pengoptimum imej
 *     pelayan Next — tiada pelayan di sini, tapak ini statik. Dua prop yang
 *     hanya `next/image` faham, `quality` dan `layout`, dibuang daripada jenis
 *     prop: tiada apa yang membacanya lagi, dan prop yang tidak berbuat apa-apa
 *     ialah janji palsu kepada orang yang memanggil komponen ini kemudian.
 *   - `next/link` menjadi <a>. Tiada router dalam projek ini.
 *   - `"use client"` dibuang; ia tidak bermakna di luar React Server Components.
 *
 * Mod bukan-statik meminta tangkapan skrin daripada api.microlink.io — pihak
 * ketiga, dari pelayar pelawat, dengan URL itu dihantar kepadanya dan had kadar
 * pada peringkat percuma. Untuk pautan yang perlu dipercayai (dan untuk apa-apa
 * yang tidak sepatutnya dihantar ke pelayan orang lain), guna `isStatic` dengan
 * `imageSrc` anda sendiri.
 *
 * `handleMouseMove` asal mengambil `event: any` dan membaca `event.target`,
 * iaitu elemen anak yang paling dalam — bukan pemicu. Ia kini bertaip dan
 * membaca `currentTarget`, jadi ofset diukur pada pemicu itu sendiri.
 */

type LinkPreviewProps = {
  children: React.ReactNode;
  url: string;
  className?: string;
  width?: number;
  height?: number;
} & ({ isStatic: true; imageSrc: string } | { isStatic?: false; imageSrc?: never });

export const LinkPreview = ({
  children,
  url,
  className,
  width = 200,
  height = 125,
  isStatic = false,
  imageSrc = '',
}: LinkPreviewProps) => {
  let src: string;
  if (!isStatic) {
    const params = encode({
      url,
      screenshot: true,
      meta: false,
      embed: 'screenshot.url',
      colorScheme: 'dark',
      'viewport.isMobile': true,
      'viewport.deviceScaleFactor': 1,
      'viewport.width': width * 3,
      'viewport.height': height * 3,
    });
    src = `https://api.microlink.io/?${params}`;
  } else {
    src = imageSrc;
  }

  const [isOpen, setOpen] = React.useState(false);

  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const springConfig = { stiffness: 100, damping: 15 };
  const x = useMotionValue(0);

  const translateX = useSpring(x, springConfig);

  const handleMouseMove = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const targetRect = event.currentTarget.getBoundingClientRect();
    const eventOffsetX = event.clientX - targetRect.left;
    const offsetFromCenter = (eventOffsetX - targetRect.width / 2) / 2; // Reduce the effect to make it subtle
    x.set(offsetFromCenter);
  };

  return (
    <>
      {isMounted ? (
        <div className="hidden">
          {/* Prefetch, so the card does not open onto a blank frame. */}
          <img src={src} width={width} height={height} alt="" aria-hidden="true" />
        </div>
      ) : null}

      <HoverCardPrimitive.Root
        openDelay={50}
        closeDelay={100}
        onOpenChange={(open) => {
          setOpen(open);
        }}
      >
        <HoverCardPrimitive.Trigger
          onMouseMove={handleMouseMove}
          className={cn('text-black dark:text-white', className)}
          href={url}
        >
          {children}
        </HoverCardPrimitive.Trigger>

        <HoverCardPrimitive.Content
          className="[transform-origin:var(--radix-hover-card-content-transform-origin)]"
          side="top"
          align="center"
          sideOffset={10}
        >
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    type: 'spring',
                    stiffness: 260,
                    damping: 20,
                  },
                }}
                exit={{ opacity: 0, y: 20, scale: 0.6 }}
                className="shadow-xl rounded-xl"
                style={{
                  x: translateX,
                }}
              >
                <a
                  href={url}
                  className="block p-1 bg-white border-2 border-transparent shadow rounded-xl hover:border-neutral-200 dark:hover:border-neutral-800"
                  style={{ fontSize: 0 }}
                >
                  <img
                    src={isStatic ? imageSrc : src}
                    width={width}
                    height={height}
                    className="rounded-lg object-cover"
                    alt="preview image"
                  />
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Root>
    </>
  );
};
