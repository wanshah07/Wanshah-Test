import { LayoutGroup, motion } from 'motion/react';

import { TextRotate } from '@/components/ui/text-rotate';

// font-overusedGrotesk in the upstream demo is not a font this project defines,
// so Tailwind emitted nothing for it and the text fell back to the body font.
// Dropped rather than left in as a dead class.
function Preview() {
  return (
    <div className="flex h-full w-full flex-col items-start overflow-hidden bg-background p-8 pt-20 text-base font-light leading-tight text-foreground sm:p-16 sm:pt-16 sm:text-xl md:p-20 md:text-2xl">
      <LayoutGroup>
        <TextRotate
          texts={[
            'A typeface family is an accomplishment on the order of a novel, a feature film screenplay, a computer language design and implementation, a major musical composition, a monumental sculpture, or other artistic or technical endeavors that consume a year or more of intensive creative effort.',
            'Typography is two-dimensional architecture, based on experience and imagination, and guided by rules and readability. And this is the purpose of typography: The arrangement of design elements within a given structure should allow the reader to easily focus on the message, without slowing down the speed of his reading.',
          ]}
          staggerFrom="first"
          staggerDuration={0.01}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          rotationInterval={4000}
          splitBy="words"
        />
        <motion.div className="my-6 h-2 w-2 rounded-full bg-[#ff5941] sm:h-3 sm:w-3" layout />
        <TextRotate
          texts={['Charles Bigelow', 'Hermann Zapf']}
          staggerFrom="first"
          staggerDuration={0.025}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          rotationInterval={4000}
          splitBy="characters"
        />
      </LayoutGroup>
    </div>
  );
}

export { Preview };
