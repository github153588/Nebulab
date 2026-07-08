'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import SiteNav from './SiteNav';
import ScrollScrubVideo from './ScrollScrubVideo';
import ImageSlideshow from './ImageSlideshow';
import AdvisoryBoardSection from './AdvisoryBoardSection';
import WaitlistSection from './WaitlistSection';

// Spectral color classes (approximated real star temperatures)
const STAR_COLORS = [
  { r: 155, g: 176, b: 255 }, // O/B — blue-white  (hot)
  { r: 170, g: 191, b: 255 }, // B — blue-white
  { r: 202, g: 215, b: 255 }, // A — white-blue
  { r: 248, g: 247, b: 255 }, // F — white
  { r: 255, g: 244, b: 234 }, // G — warm white (Sun-like)
  { r: 255, g: 232, b: 153 }, // G/K — golden yellow
  { r: 255, g: 210, b: 161 }, // K — orange-white
  { r: 255, g: 204, b: 111 }, // K — amber
  { r: 255, g: 183, b: 108 }, // M — soft orange
  { r: 255, g: 128, b: 82 },  // M — red-orange
];

const NEBULA_COLORS = [
  { r: 48, g: 164, b: 255 },  // ionized blue
  { r: 80, g: 218, b: 235 },  // cyan oxygen glow
  { r: 218, g: 93, b: 172 },  // magenta hydrogen glow
  { r: 255, g: 151, b: 94 },  // peach gas
  { r: 255, g: 94, b: 72 },   // red-orange dust
  { r: 255, g: 210, b: 126 }, // muted golden core
];

const HERO_HEADLINE = 'Your best days start the night before.';
const HERO_HEADLINE_PREFIX = 'Your best days start ';
const HERO_HEADLINE_EMPHASIS = 'the night before.';

function clampColor(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

interface Star {
  ox: number;
  oy: number;
  z: number;
  size: number;
  brightness: number;
  halo: number;
  twinkleSpeed: number;
  twinklePhase: number;
  twinkleDepth: number;
  spikeAngle: number;  // random rotation for diffraction spikes
  hasSpikes: boolean;
  r: number;
  g: number;
  b: number;
  colorIdx: number;
}

interface NebulaCloud {
  x: number;
  y: number;
  radius: number;
  stretchX: number;
  stretchY: number;
  rotation: number;
  alpha: number;
  color: {
    r: number;
    g: number;
    b: number;
  };
}

interface DustLane {
  x: number;
  y: number;
  radius: number;
  stretchX: number;
  stretchY: number;
  rotation: number;
  alpha: number;
}

/**
 * Pre-render a star sprite onto an offscreen canvas.
 * Produces a soft Airy-disc core + 4-point diffraction spikes.
 * White on transparent — tinted at draw-time via globalCompositeOperation.
 */
function createStarSprite(radius: number, hasSpikes: boolean, colorIdx: number): OffscreenCanvas | HTMLCanvasElement {
  const pad = hasSpikes ? radius * 6 : radius * 4;
  const size = Math.ceil(pad * 2);
  const cx = size / 2;
  const cy = size / 2;

  let spriteCanvas: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== 'undefined') {
    spriteCanvas = new OffscreenCanvas(size, size);
  } else {
    spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = size;
    spriteCanvas.height = size;
  }
  const sctx = spriteCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!sctx) return spriteCanvas;

  const color = STAR_COLORS[colorIdx] || { r: 255, g: 255, b: 255 };
  const mix = 1.3;
  const r = clampColor(255 + (color.r - 255) * mix);
  const g = clampColor(255 + (color.g - 255) * mix);
  const b = clampColor(255 + (color.b - 255) * mix);

  // ── Diffraction spikes (drawn first, under the core) ──
  if (hasSpikes) {
    const spikeLen = radius * 5;
    const spikeWidth = Math.max(0.4, radius * 0.18);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2; // 0°, 90°, 180°, 270°
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      const grad = sctx.createLinearGradient(
        cx, cy,
        cx + dx * spikeLen, cy + dy * spikeLen,
      );
      grad.addColorStop(0, `rgba(255, 255, 255, 0.8)`);
      grad.addColorStop(0.15, `rgba(${r}, ${g}, ${b}, 0.4)`);
      grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      sctx.save();
      sctx.translate(cx, cy);
      sctx.rotate(angle);
      sctx.beginPath();
      sctx.moveTo(0, -spikeWidth);
      sctx.lineTo(spikeLen, 0);
      sctx.lineTo(0, spikeWidth);
      sctx.closePath();
      sctx.restore();

      sctx.save();
      sctx.strokeStyle = grad;
      sctx.lineWidth = spikeWidth;
      sctx.lineCap = 'round';
      sctx.beginPath();
      sctx.moveTo(cx, cy);
      sctx.lineTo(cx + dx * spikeLen, cy + dy * spikeLen);
      sctx.stroke();
      sctx.restore();
    }
  }

  // ── Outer glow (soft halo) ──
  const outerR = radius * 3.5;
  const outerGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
  outerGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
  outerGrad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.1)`);
  outerGrad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.03)`);
  outerGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  sctx.beginPath();
  sctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  sctx.fillStyle = outerGrad;
  sctx.fill();

  // ── Core (bright saturated center with Airy-like falloff) ──
  const coreR = radius * 1.2;
  const coreGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  coreGrad.addColorStop(0.15, `rgba(255, 255, 255, 0.8)`);
  coreGrad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.6)`);
  coreGrad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.2)`);
  coreGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  sctx.beginPath();
  sctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  sctx.fillStyle = coreGrad;
  sctx.fill();

  return spriteCanvas;
}

// Sprite cache keyed by "size_hasSpikes_colorIdx"
const spriteCache = new Map<string, OffscreenCanvas | HTMLCanvasElement>();

function getStarSprite(radius: number, hasSpikes: boolean, colorIdx: number) {
  // Quantize radius to nearest 0.5 to limit cache entries
  const qr = Math.round(radius * 2) / 2;
  const key = `${qr}_${hasSpikes ? 1 : 0}_${colorIdx}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = createStarSprite(qr, hasSpikes, colorIdx);
    spriteCache.set(key, sprite);
  }
  return sprite;
}

export default function StarfieldPage() {
  const [isReady, setIsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const mouseTargetRef = useRef({ x: 0.5, y: 0.5 });
  const mouseSmoothedRef = useRef({ x: 0.5, y: 0.5 });
  const starsRef = useRef<Star[]>([]);
  const nebulaRef = useRef<NebulaCloud[]>([]);
  const dustRef = useRef<DustLane[]>([]);
  const rafRef = useRef<number>(0);

  const STAR_DENSITY = 0.0027;
  const MAX_STARS = 6400;
  const MIN_STARS = 2200;
  const PARALLAX_STRENGTH = 14;
  const MOUSE_LERP = 0.025;

  const handleJoinWaitlist = () => {
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const initNebula = useCallback((width: number, height: number) => {
    const scale = Math.max(width, height);
    const clouds: NebulaCloud[] = [
      {
        x: width * 0.5,
        y: height * 0.36,
        radius: scale * 0.42,
        stretchX: 1.8,
        stretchY: 0.54,
        rotation: -0.08,
        alpha: 0.13,
        color: NEBULA_COLORS[0],
      },
      {
        x: width * 0.62,
        y: height * 0.42,
        radius: scale * 0.34,
        stretchX: 1.35,
        stretchY: 0.5,
        rotation: 0.2,
        alpha: 0.08,
        color: NEBULA_COLORS[1],
      },
      {
        x: width * 0.47,
        y: height * 0.58,
        radius: scale * 0.36,
        stretchX: 1.2,
        stretchY: 0.78,
        rotation: 0.28,
        alpha: 0.14,
        color: NEBULA_COLORS[2],
      },
      {
        x: width * 0.56,
        y: height * 0.64,
        radius: scale * 0.34,
        stretchX: 1.05,
        stretchY: 0.78,
        rotation: -0.2,
        alpha: 0.13,
        color: NEBULA_COLORS[3],
      },
      {
        x: width * 0.66,
        y: height * 0.68,
        radius: scale * 0.3,
        stretchX: 0.92,
        stretchY: 0.72,
        rotation: -0.36,
        alpha: 0.12,
        color: NEBULA_COLORS[4],
      },
      {
        x: width * 0.5,
        y: height * 0.66,
        radius: scale * 0.2,
        stretchX: 0.9,
        stretchY: 0.72,
        rotation: 0.08,
        alpha: 0.09,
        color: NEBULA_COLORS[5],
      },
      {
        x: width * 0.36,
        y: height * 0.44,
        radius: scale * 0.28,
        stretchX: 1.5,
        stretchY: 0.42,
        rotation: -0.38,
        alpha: 0.07,
        color: NEBULA_COLORS[0],
      },
      {
        x: width * 0.74,
        y: height * 0.72,
        radius: scale * 0.24,
        stretchX: 1.15,
        stretchY: 0.58,
        rotation: -0.46,
        alpha: 0.075,
        color: NEBULA_COLORS[4],
      },
    ];

    const dust: DustLane[] = [
      {
        x: width * 0.5,
        y: height * 0.55,
        radius: scale * 0.2,
        stretchX: 2.05,
        stretchY: 0.22,
        rotation: -0.22,
        alpha: 0.24,
      },
      {
        x: width * 0.58,
        y: height * 0.65,
        radius: scale * 0.18,
        stretchX: 0.42,
        stretchY: 1.65,
        rotation: -0.22,
        alpha: 0.2,
      },
      {
        x: width * 0.42,
        y: height * 0.72,
        radius: scale * 0.17,
        stretchX: 1.6,
        stretchY: 0.28,
        rotation: 0.34,
        alpha: 0.16,
      },
      {
        x: width * 0.68,
        y: height * 0.48,
        radius: scale * 0.2,
        stretchX: 0.68,
        stretchY: 1.2,
        rotation: 0.48,
        alpha: 0.18,
      },
    ];

    nebulaRef.current = clouds;
    dustRef.current = dust;
  }, []);

  const initStars = useCallback((width: number, height: number) => {
    const stars: Star[] = [];
    const starCount = Math.min(MAX_STARS, Math.max(MIN_STARS, Math.round(width * height * STAR_DENSITY)));

    for (let i = 0; i < starCount; i++) {
      const zRaw = Math.random();
      const z = Math.pow(zRaw, 3.2);

      const inMilkyBand = Math.random() < 0.36;
      const bandCenter = height * (0.42 + Math.sin(width * 0.0007) * 0.04);
      const bandSpread = height * (0.12 + Math.random() * 0.06);

      const ox = Math.random() * (width + 80) - 40;
      const oy = inMilkyBand
        ? bandCenter + (Math.random() - 0.5) * bandSpread + (Math.random() - 0.5) * bandSpread
        : Math.random() * (height + 80) - 40;

      const magnitude = Math.pow(Math.random(), 9);
      const depthBoost = 0.08 + z * 0.92;
      const size = 0.2 + magnitude * 1.08 + z * 0.24;
      const brightness = Math.min(1, 0.24 + magnitude * 0.82 + depthBoost * 0.3);
      const halo = Math.pow(magnitude, 2.15);

      const twinkleSpeed = 0.12 + Math.random() * 0.38;
      const twinklePhase = Math.random() * Math.PI * 2;
      const twinkleDepth = 0.015 + Math.random() * 0.055;

      const colorWeights = [0.04, 0.05, 0.06, 0.09, 0.16, 0.16, 0.16, 0.13, 0.1, 0.05];
      let roll = Math.random();
      let colorIdx = 0;
      for (let c = 0; c < colorWeights.length; c++) {
        roll -= colorWeights[c];
        if (roll <= 0) { colorIdx = c; break; }
      }
      const color = STAR_COLORS[colorIdx];
      const colorMix = 1.3 + Math.random() * 0.4; // Force deep saturation
      const r = clampColor(255 + (color.r - 255) * colorMix);
      const g = clampColor(255 + (color.g - 255) * colorMix);
      const b = clampColor(255 + (color.b - 255) * colorMix);

      stars.push({
        ox, oy, z, size, brightness, halo,
        twinkleSpeed, twinklePhase, twinkleDepth,
        spikeAngle: Math.random() * Math.PI * 0.5, // random 0-90° rotation
        hasSpikes: magnitude > 0.78 && Math.random() < 0.12,
        r, g, b, colorIdx
      });
    }
    starsRef.current = stars;
  }, []);

  // Lock scrolling just long enough for fonts to be in, so text doesn't
  // reflow/FOUC under the loader — hard-capped by a short timeout raced
  // against it, so this can never actually get stuck waiting on a resource.
  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setIsReady(true);
    };

    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const capped = new Promise<void>((resolve) => setTimeout(resolve, 1800));

    Promise.race([fontsReady, capped]).then(markReady);

    return () => {
      cancelled = true;
    };
  }, []);

  // Only ever play the hero video while its section is actually on screen —
  // pause it the moment it scrolls out of view instead of burning CPU/battery
  // decoding a video nobody is looking at.
  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;

    // Not in React's video prop types yet, but a real, widely-supported HTML
    // attribute — keeps this behind fonts/images/JS in the browser's fetch
    // queue so it doesn't compete for bandwidth with everything else on load.
    video.setAttribute('fetchpriority', 'low');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(video);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spriteCache.clear(); // re-create sprites for new DPR
      initNebula(window.innerWidth, window.innerHeight);
      initStars(window.innerWidth, window.innerHeight);
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseTargetRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener('mousemove', handleMouseMove);

    let time = 0;

    const animate = () => {
      time += 0.016;
      const w = window.innerWidth;
      const h = window.innerHeight;

      const sm = mouseSmoothedRef.current;
      const tgt = mouseTargetRef.current;
      sm.x += (tgt.x - sm.x) * MOUSE_LERP;
      sm.y += (tgt.y - sm.y) * MOUSE_LERP;

      ctx.clearRect(0, 0, w, h);

      const mx = (sm.x - 0.5) * 2;
      const my = (sm.y - 0.5) * 2;

      const skyGrad = ctx.createRadialGradient(
        w * 0.52, h * 0.42, 0,
        w * 0.52, h * 0.42, Math.max(w, h) * 0.85,
      );
      skyGrad.addColorStop(0, 'rgba(11, 14, 26, 0.2)');
      skyGrad.addColorStop(0.55, 'rgba(4, 5, 12, 0.16)');
      skyGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const cloud of nebulaRef.current) {
        const cloudX = cloud.x - mx * PARALLAX_STRENGTH * 0.16;
        const cloudY = cloud.y - my * PARALLAX_STRENGTH * 0.1;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, cloud.radius);

        grad.addColorStop(0, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, ${cloud.alpha})`);
        grad.addColorStop(0.34, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, ${cloud.alpha * 0.68})`);
        grad.addColorStop(0.72, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, ${cloud.alpha * 0.22})`);
        grad.addColorStop(1, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, 0)`);

        ctx.save();
        ctx.translate(cloudX, cloudY);
        ctx.rotate(cloud.rotation);
        ctx.scale(cloud.stretchX, cloud.stretchY);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, cloud.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      ctx.save();
      for (const dust of dustRef.current) {
        const dustX = dust.x - mx * PARALLAX_STRENGTH * 0.1;
        const dustY = dust.y - my * PARALLAX_STRENGTH * 0.07;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, dust.radius);

        grad.addColorStop(0, `rgba(0, 0, 0, ${dust.alpha})`);
        grad.addColorStop(0.46, `rgba(0, 0, 0, ${dust.alpha * 0.74})`);
        grad.addColorStop(0.78, `rgba(0, 0, 0, ${dust.alpha * 0.28})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.save();
        ctx.translate(dustX, dustY);
        ctx.rotate(dust.rotation);
        ctx.scale(dust.stretchX, dust.stretchY);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, dust.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; // Makes overlapping colors pop and saturates strongly
      for (const star of starsRef.current) {
        const px = star.ox - mx * PARALLAX_STRENGTH * star.z;
        const py = star.oy - my * PARALLAX_STRENGTH * star.z;

        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
        const alpha = star.brightness * (1 - star.twinkleDepth * 0.5 + star.twinkleDepth * twinkle);

        const drawX = ((px % (w + 80)) + (w + 80)) % (w + 80) - 40;
        const drawY = ((py % (h + 80)) + (h + 80)) % (h + 80) - 40;

        if (star.size < 0.58 && star.halo < 0.035) {
          ctx.save();
          ctx.globalAlpha = Math.max(0.26, Math.min(1, alpha * 1.26));
          ctx.fillStyle = `rgb(${star.r}, ${star.g}, ${star.b})`;
          ctx.fillRect(drawX, drawY, 1, 1);
          ctx.restore();
          continue;
        }

        // Real astrophoto stars are mostly sharp points; keep bloom rare and tight.
        const renderRadius = Math.max(0.65, star.size * (0.82 + star.halo * 0.7));
        const sprite = getStarSprite(renderRadius, star.hasSpikes, star.colorIdx);

        const spriteW = sprite.width;
        const spriteH = sprite.height;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 1.24));

        ctx.translate(drawX, drawY);
        ctx.rotate(star.spikeAngle);

        if (star.halo > 0.16 || star.size > 0.92) {
          const auraRadius = renderRadius * (2.05 + star.halo * 0.78);
          const auraGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, auraRadius);
          auraGrad.addColorStop(0, `rgba(${star.r}, ${star.g}, ${star.b}, 0.36)`);
          auraGrad.addColorStop(0.48, `rgba(${star.r}, ${star.g}, ${star.b}, 0.14)`);
          auraGrad.addColorStop(1, `rgba(${star.r}, ${star.g}, ${star.b}, 0)`);
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw white sprite
        ctx.drawImage(
          sprite as HTMLCanvasElement,
          -spriteW / 2, -spriteH / 2,
          spriteW, spriteH,
        );

        if (star.halo > 0.035) {
          const coreRadius = Math.max(0.38, star.size * 0.34);
          const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 1.9);
          coreGrad.addColorStop(0, `rgba(${star.r}, ${star.g}, ${star.b}, 0.72)`);
          coreGrad.addColorStop(0.65, `rgba(${star.r}, ${star.g}, ${star.b}, 0.24)`);
          coreGrad.addColorStop(1, `rgba(${star.r}, ${star.g}, ${star.b}, 0)`);
          ctx.fillStyle = coreGrad;
          ctx.beginPath();
          ctx.arc(0, 0, coreRadius * 1.9, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
      ctx.restore(); // Restore from 'lighter' globalCompositeOperation
      // Very subtle ambient glow near cursor
      const vignetteGrad = ctx.createRadialGradient(
        sm.x * w, sm.y * h, 0,
        sm.x * w, sm.y * h, w * 0.4,
      );
      vignetteGrad.addColorStop(0, 'rgba(100, 110, 180, 0.01)');
      vignetteGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initNebula, initStars]);

  return (
    <>
      <div className={`page-loader${isReady ? ' is-ready' : ''}`} aria-hidden={isReady}>
        <Image src="/nebulab-logo.png" alt="" width={1317} height={232} className="page-loader-mark" priority />
      </div>

      <canvas ref={canvasRef} className="starfield-canvas" aria-hidden="true" />

      <SiteNav />

      <main className="page-container home-starfield">
        <section className="home-starfield-hero" id="hero">
          <div className="home-mask-glow" aria-hidden="true" />
          <div className="home-mask-shell" aria-hidden="true">
            <video
              ref={heroVideoRef}
              className="home-mask-image"
              muted
              playsInline
              preload="metadata"
            >
              <source src="/luna-mask-hero-video.mp4" type="video/mp4" />
            </video>
          </div>

          <div className="hero-copy">
            <p className="hero-eyebrow">Sleep, reimagined from the inside.</p>
            <h1 className="hero-title" aria-label={HERO_HEADLINE}>
              {HERO_HEADLINE_PREFIX}
              <span className="hero-title-emphasis">{HERO_HEADLINE_EMPHASIS}</span>
            </h1>
            <button className="hero-cta" type="button" onClick={handleJoinWaitlist}>
              Join Waitlist
            </button>
          </div>
        </section>

        <ImageSlideshow />
        <ScrollScrubVideo />
        <AdvisoryBoardSection />
        <WaitlistSection />

        <footer className="site-footer">
          &copy; 2026 NebuLab &middot; Built at Stanford
        </footer>
      </main>
    </>
  );
}
