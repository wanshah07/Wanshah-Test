import { useState } from 'react';

import { InteractiveTravelCard } from '@/components/ui/3d-card';

// The upstream demo hot-linked its photo from cdn.21st.dev. This repo is public
// and deployed, so it should not depend on another company's CDN or serve their
// files. Inline SVG stands in; imageUrl takes any URL you pass it.
const terraces =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420">
       <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#8fb8d8"/><stop offset="100%" stop-color="#dbe7cf"/>
       </linearGradient></defs>
       <rect width="320" height="420" fill="url(#sky)"/>
       <path d="M0 250 Q 80 210 160 240 T 320 225 V420 H0Z" fill="#5f7f4e"/>
       <path d="M0 290 Q 90 255 180 285 T 320 268 V420 H0Z" fill="#4a6b3d" opacity=".9"/>
       <path d="M0 335 Q 100 300 200 330 T 320 315 V420 H0Z" fill="#3a5730"/>
       <path d="M0 380 Q 110 350 220 378 T 320 366 V420 H0Z" fill="#2c4325"/>
       <circle cx="248" cy="86" r="30" fill="#fdf3d0" opacity=".85"/>
     </svg>`
  );

export default function InteractiveTravelCardDemo() {
  const [clicks, setClicks] = useState(0);

  return (
    // The container uses theme variables and provides perspective for the 3D effect.
    // Without perspective on an ancestor the tilt runs but renders flat.
    <div className="flex min-h-[30rem] w-full flex-col items-center justify-center gap-4 bg-background p-8">
      <div style={{ perspective: '1000px' }}>
        <InteractiveTravelCard
          title="Sapa Valley"
          subtitle="Vietnam"
          imageUrl={terraces}
          actionText="Book your trip"
          href="https://en.wikipedia.org/wiki/Sa_Pa"
          // The upstream demo called alert() here. A readout shows the prop
          // firing without hijacking the page.
          onActionClick={() => setClicks((n) => n + 1)}
        />
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {clicks === 0
          ? 'onActionClick has not fired yet.'
          : `onActionClick fired ${clicks} ${clicks === 1 ? 'time' : 'times'}.`}
      </p>
    </div>
  );
}
