'use client';

import NextImage from 'next/image';
import { useEffect, useRef, useState } from 'react';

const FRAME_COUNT = 180;
const FRAME_PATH = '/frames/frame_';
const SCRUB_DISTANCE = 2600;
const TOUCH_SCRUB_DISTANCE = 1800;
const MAX_WHEEL_DELTA = 180;
const MAX_TOUCH_DELTA = 140;

const HOTSPOTS = [
  {
    id: 'outer-shell',
    label: 'Outer shell',
    title: 'Featherweight shell',
    description: 'A slim, contoured exterior blocks light while staying side-sleeper friendly.',
    x: 50,
    y: 12,
  },
  {
    id: 'comfort-layer',
    label: 'Comfort layer',
    title: 'Pressure-free comfort',
    description: 'Soft cushioning distributes contact around the eyes keeping the mask stable without face pressure.',
    x: 51,
    y: 29,
  },
  {
    id: 'eeg-array',
    label: 'EEG array',
    title: 'Forehead EEG sensor',
    description: 'The sensor strip reads subtle brain waves and feeds real-time context throughout the night.',
    x: 50,
    y: 44,
  },
  {
    id: 'control-core',
    label: 'Control core',
    title: 'Adaptive sleep processor',
    description: 'Compact AI control keeps sensing and responses quiet, timed, and automatic.',
    x: 50,
    y: 59,
  },
  {
    id: 'haptics',
    label: 'Haptic modules',
    title: 'Gentle vibration modules',
    description: 'Low-profile haptic drivers deliver soft, precisely timed cues for deeper sleeps and lighter wakeups.',
    x: 78,
    y: 78,
  },
  {
    id: 'power',
    label: 'Power system',
    title: 'Slim overnight battery',
    description: 'Lightweight rechargeable battery powers sensing and haptics all night.',
    x: 50,
    y: 73,
  },
] as const;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getFramePath(index: number) {
  return `${FRAME_PATH}${String(index).padStart(4, '0')}.webp`;
}

export default function ScrollScrubVideo() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const progressRef = useRef(0);
  const isLockedRef = useRef(false);
  const touchYRef = useRef<number | null>(null);
  const frameRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const explodeRafRef = useRef<number | null>(null);
  const explodeToEndRef = useRef<() => void>(() => {});
  const [isInteractive, setIsInteractive] = useState(false);
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);
  const [displayedHotspot, setDisplayedHotspot] = useState<(typeof HOTSPOTS)[number] | null>(null);
  const [isPanelVisible, setIsPanelVisible] = useState(false);

  const focusedHotspot = HOTSPOTS.find((hotspot) => hotspot.id === hoveredHotspot) ?? null;

  if (focusedHotspot && focusedHotspot !== displayedHotspot) {
    setDisplayedHotspot(focusedHotspot);
  }

  if (!focusedHotspot && isPanelVisible) {
    setIsPanelVisible(false);
  }

  // Showing is deferred by a frame so the panel's very first appearance
  // still has a "before" state in the DOM to transition from, instead of
  // mounting straight into its visible state (which would skip the fade-in).
  useEffect(() => {
    if (!focusedHotspot || isPanelVisible) return;
    const raf = requestAnimationFrame(() => setIsPanelVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [focusedHotspot, isPanelVisible]);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!section || !canvas || !context) return;

    let isDisposed = false;
    let loadedFrames = 0;
    const loadedFrameIndexes = new Set<number>();

    const getFrameFromProgress = () => {
      return Math.min(
        FRAME_COUNT,
        Math.max(1, Math.round(progressRef.current * (FRAME_COUNT - 1)) + 1),
      );
    };

    const getSectionTop = () => section.getBoundingClientRect().top + window.scrollY;

    const pinToSectionTop = (smooth = false) => {
      // The page has a global `scroll-behavior: smooth`, which is exactly what
      // we want for the gentle lock-engage nudge — so leave it alone here.
      // The instant path still has to force it off, since every scrub tick
      // needs to move in lockstep with the input, not ease into position.
      if (smooth) {
        window.scrollTo({ top: getSectionTop(), behavior: 'smooth' });
        return;
      }

      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;

      root.style.scrollBehavior = 'auto';
      window.scrollTo({ top: getSectionTop(), behavior: 'auto' });
      root.style.scrollBehavior = previousScrollBehavior;
    };

    const drawFrame = (frameIndex: number) => {
      let image = imagesRef.current[frameIndex - 1];
      if (!image?.complete || image.naturalWidth === 0) {
        for (let offset = 1; offset < FRAME_COUNT; offset++) {
          const previousImage = imagesRef.current[frameIndex - 1 - offset];
          const nextImage = imagesRef.current[frameIndex - 1 + offset];
          const candidate = previousImage?.complete && previousImage.naturalWidth > 0
            ? previousImage
            : nextImage?.complete && nextImage.naturalWidth > 0
              ? nextImage
              : undefined;

          if (candidate) {
            image = candidate;
            break;
          }
        }
      }

      if (!image?.complete || image.naturalWidth === 0) return;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const scale = Math.min(canvasWidth / image.naturalWidth, canvasHeight / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (canvasWidth - width) / 2;
      const y = (canvasHeight - height) / 2;

      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.drawImage(image, x, y, width, height);
      canvas.dataset.currentFrame = String(frameIndex);
      canvas.dataset.framesLoaded = String(loadedFrames);
      canvas.dataset.ready = 'true';
    };

    const syncInteractiveState = () => {
      setIsInteractive(progressRef.current >= 0.995);
    };

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      frameRef.current = getFrameFromProgress();
      drawFrame(frameRef.current);
      syncInteractiveState();
    };

    const render = () => {
      rafRef.current = null;
      const nextFrame = getFrameFromProgress();

      if (nextFrame !== frameRef.current) {
        frameRef.current = nextFrame;
      }

      drawFrame(frameRef.current);
      syncInteractiveState();
    };

    const scheduleRender = () => {
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(render);
      }
    };

    const updateProgress = (delta: number, distance: number) => {
      const nextProgress = clamp(progressRef.current + delta / distance);
      const didChange = nextProgress !== progressRef.current;

      progressRef.current = nextProgress;
      if (didChange) scheduleRender();
      syncInteractiveState();
    };

    const lockSection = (startingProgress: number) => {
      progressRef.current = clamp(startingProgress);
      isLockedRef.current = true;
      pinToSectionTop(true);
      scheduleRender();
    };

    const unlockSection = () => {
      isLockedRef.current = false;
    };

    // How far off perfect top-alignment the section is allowed to be for the
    // lock to still engage. Keeping this small means the "snap into place"
    // correction below is a short, gentle nudge instead of a large teleport —
    // it used to trigger up to a full viewport away, which is what produced
    // the jarring "click into place" feeling.
    const LOCK_ENGAGE_TOLERANCE = 220;

    const shouldLockFromPageScroll = (delta: number) => {
      const rect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const enteringFromAbove =
        delta > 0 &&
        rect.top >= 0 &&
        rect.top <= LOCK_ENGAGE_TOLERANCE;
      const enteringFromBelow =
        delta < 0 &&
        rect.bottom <= viewportHeight &&
        rect.bottom >= viewportHeight - LOCK_ENGAGE_TOLERANCE;

      return enteringFromAbove || enteringFromBelow;
    };

    const normalizeWheelDelta = (event: WheelEvent) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
      return event.deltaY;
    };

    const limitDelta = (delta: number, maxDelta: number) => {
      return Math.max(-maxDelta, Math.min(maxDelta, delta));
    };

    const handleWheel = (event: WheelEvent) => {
      const delta = limitDelta(normalizeWheelDelta(event), MAX_WHEEL_DELTA);
      if (delta === 0) return;

      if (!isLockedRef.current && shouldLockFromPageScroll(delta)) {
        event.preventDefault();
        lockSection(delta > 0 ? 0 : 1);
        return;
      }

      if (!isLockedRef.current) return;

      const progress = progressRef.current;
      const shouldRelease =
        (delta > 0 && progress >= 1) ||
        (delta < 0 && progress <= 0);

      if (shouldRelease) {
        unlockSection();
        return;
      }

      event.preventDefault();
      pinToSectionTop();
      updateProgress(delta, SCRUB_DISTANCE);
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY;
      const previousY = touchYRef.current;
      if (currentY == null || previousY == null) return;

      const delta = limitDelta(previousY - currentY, MAX_TOUCH_DELTA);
      touchYRef.current = currentY;
      if (delta === 0) return;

      if (!isLockedRef.current && shouldLockFromPageScroll(delta)) {
        event.preventDefault();
        lockSection(delta > 0 ? 0 : 1);
        return;
      }

      if (!isLockedRef.current) return;

      const progress = progressRef.current;
      const shouldRelease =
        (delta > 0 && progress >= 1) ||
        (delta < 0 && progress <= 0);

      if (shouldRelease) {
        unlockSection();
        return;
      }

      event.preventDefault();
      pinToSectionTop();
      updateProgress(delta, TOUCH_SCRUB_DISTANCE);
    };

    const handleScroll = () => {
      if (isLockedRef.current) {
        pinToSectionTop();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const keyDeltas: Record<string, number> = {
        ArrowDown: 160,
        PageDown: 420,
        ' ': 420,
        ArrowUp: -160,
        PageUp: -420,
      };
      const delta = keyDeltas[event.key];
      if (!delta) return;

      if (!isLockedRef.current && shouldLockFromPageScroll(delta)) {
        event.preventDefault();
        lockSection(delta > 0 ? 0 : 1);
        return;
      }

      if (!isLockedRef.current) return;

      const progress = progressRef.current;
      const shouldRelease =
        (delta > 0 && progress >= 1) ||
        (delta < 0 && progress <= 0);

      if (shouldRelease) {
        unlockSection();
        return;
      }

      event.preventDefault();
      pinToSectionTop();
      updateProgress(delta, SCRUB_DISTANCE);
    };

    const handleImageLoad = (index: number) => {
      if (loadedFrameIndexes.has(index)) return;

      loadedFrameIndexes.add(index);
      loadedFrames += 1;
      canvas.dataset.framesLoaded = String(loadedFrames);

      if (!isDisposed && (loadedFrames === 1 || index + 1 === frameRef.current)) {
        drawFrame(frameRef.current);
      }
    };

    imagesRef.current = Array.from({ length: FRAME_COUNT }, (_, index) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.onload = () => handleImageLoad(index);
      return image;
    });

    // The 180-frame sequence is ~5MB — don't compete with the rest of the
    // page's initial load for bandwidth. Only start fetching once the section
    // is within reach, so a visitor who never scrolls this far never pays for it.
    let framesStarted = false;
    const startLoadingFrames = () => {
      if (framesStarted) return;
      framesStarted = true;

      imagesRef.current.forEach((image, index) => {
        image.src = getFramePath(index + 1);
        if (image.complete && image.naturalWidth > 0) {
          queueMicrotask(() => handleImageLoad(index));
        }
      });
    };

    const frameLoadObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          startLoadingFrames();
          frameLoadObserver.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    frameLoadObserver.observe(section);

    explodeToEndRef.current = () => {
      const startProgress = progressRef.current;
      const startTime = performance.now();
      const duration = 900;

      if (explodeRafRef.current != null) {
        cancelAnimationFrame(explodeRafRef.current);
      }

      isLockedRef.current = true;
      pinToSectionTop();

      const animateToEnd = (timestamp: number) => {
        if (isDisposed) return;

        const elapsed = timestamp - startTime;
        const progress = clamp(elapsed / duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        progressRef.current = startProgress + (1 - startProgress) * easedProgress;
        frameRef.current = getFrameFromProgress();
        drawFrame(frameRef.current);
        syncInteractiveState();

        if (progress < 1) {
          explodeRafRef.current = requestAnimationFrame(animateToEnd);
          return;
        }

        explodeRafRef.current = null;
        progressRef.current = 1;
        frameRef.current = FRAME_COUNT;
        drawFrame(FRAME_COUNT);
        setIsInteractive(true);
      };

      explodeRafRef.current = requestAnimationFrame(animateToEnd);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isDisposed = true;
      frameLoadObserver.disconnect();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (explodeRafRef.current != null) {
        cancelAnimationFrame(explodeRafRef.current);
      }

      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
      explodeToEndRef.current = () => {};
    };
  }, []);

  const handleLearnMore = () => {
    explodeToEndRef.current();
  };

  return (
    <>
      <section
        ref={sectionRef}
        id="mask-scroll-animation"
        className="mask-exploded-section"
        aria-label="Scroll-controlled Luna mask exploded view animation"
      >
        <div className="mask-exploded-visual">
          <div className="mask-exploded-stage">
            <NextImage
              className="mask-exploded-fallback"
              src={getFramePath(FRAME_COUNT)}
              alt=""
              fill
              sizes="(max-width: 760px) 86vw, 42vw"
              priority={false}
              aria-hidden="true"
            />
            <canvas
              ref={canvasRef}
              className="mask-exploded-canvas"
              aria-label="Luna mask rotating and expanding into internal components"
            />
            <div
              className={`mask-hotspot-layer${isInteractive ? ' is-active' : ''}`}
              aria-hidden={!isInteractive}
            >
              {HOTSPOTS.map((hotspot) => (
                <button
                  key={hotspot.id}
                  className={`mask-hotspot${focusedHotspot?.id === hotspot.id ? ' is-focused' : ''}`}
                  type="button"
                  style={{
                    left: `${hotspot.x}%`,
                    top: `${hotspot.y}%`,
                  }}
                  aria-label={hotspot.title}
                  tabIndex={isInteractive ? 0 : -1}
                  onMouseEnter={() => setHoveredHotspot(hotspot.id)}
                  onMouseLeave={() => setHoveredHotspot(null)}
                  onFocus={() => setHoveredHotspot(hotspot.id)}
                  onBlur={() => setHoveredHotspot(null)}
                >
                  <span className="mask-hotspot-label">{hotspot.label}</span>
                </button>
              ))}
            </div>

            {displayedHotspot && (
              <div
                className={`hotspot-float-panel${isPanelVisible ? ' is-active' : ''}`}
                style={{
                  left: `${displayedHotspot.x}%`,
                  top: `${displayedHotspot.y}%`,
                }}
                aria-live="polite"
                aria-hidden={!focusedHotspot}
              >
                <h3>{displayedHotspot.title}</h3>
                <p>{displayedHotspot.description}</p>
              </div>
            )}
          </div>
        </div>
        <div className="mask-exploded-copy">
          <p className="scrub-eyebrow">Inside the mask</p>
          <h2 className="scrub-heading">Every layer engineered to optimize sleep.</h2>
          <p className="scrub-body">
            Scroll to explore the architecture beneath the surface — from precision EEG sensors to whisper-quiet haptic drivers, each component is designed to work in concert while you rest.
          </p>
          <button className="scrub-cta" type="button" onClick={handleLearnMore}>
            Learn More
          </button>
        </div>
      </section>
      <section className="mask-exploded-release-space" aria-hidden="true" />
    </>
  );
}
