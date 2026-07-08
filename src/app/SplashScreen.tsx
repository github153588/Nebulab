'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const HOLD_MS = 2200;
const FADE_MS = 800;

// Module-level so returning to the homepage via client-side navigation
// doesn't replay the intro; a fresh page load starts over.
let hasPlayed = false;

export default function SplashScreen() {
  const [isFading, setIsFading] = useState(false);
  const [isDone, setIsDone] = useState(() => hasPlayed);

  useEffect(() => {
    if (hasPlayed) return;

    // While the splash holds, `splash-hold` freezes page scroll and keeps the
    // hero entrance animations paused at their first frame — otherwise they
    // would finish invisibly behind the overlay. Removing the class as the
    // fade starts lets the hero rise in while the splash dissolves.
    document.body.classList.add('splash-hold');
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
      document.body.classList.remove('splash-hold');
    }, HOLD_MS);
    const doneTimer = setTimeout(() => {
      hasPlayed = true;
      setIsDone(true);
    }, HOLD_MS + FADE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
      document.body.classList.remove('splash-hold');
    };
  }, []);

  if (isDone) return null;

  return (
    <div className={`splash-screen${isFading ? ' is-fading' : ''}`} aria-hidden="true">
      <Image
        src="/nebulab-logo.png"
        alt=""
        width={1317}
        height={232}
        className="splash-logo"
        priority
      />
    </div>
  );
}
