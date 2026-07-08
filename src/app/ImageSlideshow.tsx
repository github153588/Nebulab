'use client';

import Image from 'next/image';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const SLIDES = [
  {
    id: 'wake-better',
    image: '/slideshow-wake-better.png',
    title: 'Wake Better',
    description: 'The right start changes everything. NebuLab detects your sleep stage in real time and wakes you at the perfect moment, so you open your eyes clear, not groggy.',
  },
  {
    id: 'sleep-deeper',
    image: '/slideshow-sleep-deeper.png',
    title: 'Sleep Deeper',
    description: "Recovery happens while you sleep. NebuLab's closed-loop feedback extends your restorative stages, so you wake up with the energy to match your day.",
  },
  {
    id: 'see-further',
    image: '/slideshow-see-further.png',
    title: 'See Further',
    description: "Your nights hold patterns your days never show. We're building toward biomarker research that links your nightly rhythms to long-term health signals.",
  },
] as const;

const SWIPE_THRESHOLD = 40;
const TAP_TOLERANCE = 10;
// How many pixels of movement before we decide whether this gesture is a
// horizontal swipe or a vertical scroll. Below this we don't yet know.
const INTENT_THRESHOLD = 6;

export default function ImageSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isHorizontalRef = useRef<boolean | null>(null);

  const goTo = (index: number) => {
    setActiveIndex(((index % SLIDES.length) + SLIDES.length) % SLIDES.length);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    isHorizontalRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (start == null) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    // Decide intent once the gesture has moved enough to tell direction —
    // and keep claiming the gesture on every subsequent move, so a touch
    // device doesn't hand it off to native vertical scrolling mid-swipe.
    if (isHorizontalRef.current === null) {
      if (Math.abs(deltaX) < INTENT_THRESHOLD && Math.abs(deltaY) < INTENT_THRESHOLD) return;
      isHorizontalRef.current = Math.abs(deltaX) > Math.abs(deltaY);
    }

    if (isHorizontalRef.current) {
      event.preventDefault();
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const wasHorizontal = isHorizontalRef.current;
    dragStartRef.current = null;
    isHorizontalRef.current = null;
    if (start == null) return;

    if (wasHorizontal === false) {
      // A predominantly vertical drag is a scroll gesture, not a swipe — ignore it.
      return;
    }

    const deltaX = event.clientX - start.x;
    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      goTo(activeIndex + (deltaX < 0 ? 1 : -1));
    } else if (Math.abs(deltaX) <= TAP_TOLERANCE) {
      goTo(activeIndex + 1);
    }
  };

  const handlePointerCancel = () => {
    dragStartRef.current = null;
    isHorizontalRef.current = null;
  };

  const activeSlide = SLIDES[activeIndex];

  return (
    <section className="slideshow-section" aria-label="NebuLab product highlights">
      <h2 className="slideshow-heading">
        Every Night, <span className="slideshow-heading-emphasis">Elevated</span>
      </h2>

      <div className="slideshow-media">
        <div
          className="slideshow-image-button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          role="button"
          tabIndex={0}
          aria-label="Show next slide. Swipe or click to navigate."
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') goTo(activeIndex + 1);
            if (event.key === 'ArrowLeft') goTo(activeIndex - 1);
          }}
        >
          {SLIDES.map((slide, index) => (
            <Image
              key={slide.id}
              src={slide.image}
              alt={slide.title}
              fill
              sizes="100vw"
              priority={index === 0}
              draggable={false}
              className={`slideshow-image${index === activeIndex ? ' is-active' : ''}`}
            />
          ))}
        </div>

        <div className="slideshow-scrim" aria-hidden="true" />

        <div className="slideshow-overlay">
          <div className="slideshow-dots" role="tablist" aria-label="Slides">
            {SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={`slideshow-dot${index === activeIndex ? ' is-active' : ''}`}
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`Show slide: ${slide.title}`}
                onClick={() => goTo(index)}
              />
            ))}
          </div>

          <h3 className="slideshow-title" aria-live="polite">{activeSlide.title}</h3>
          <p className="slideshow-description" aria-live="polite">{activeSlide.description}</p>
        </div>
      </div>
    </section>
  );
}
