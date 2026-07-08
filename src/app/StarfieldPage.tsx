'use client';

import { useEffect, useRef, useCallback } from 'react';
import SiteNav from './SiteNav';
import SplashScreen from './SplashScreen';
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
  css: string;        // precomputed fill style for the 1px fast path
  baseAlpha: number;  // twinkle-at-rest alpha, used for statically baked stars
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
 * Produces a soft Airy-disc core + 4-point diffraction spikes, plus the
 * halo aura and saturated core glow that used to be rebuilt as radial
 * gradients on every animation frame — baking them here means the per-frame
 * cost of a bright star is a single drawImage.
 */
function createStarSprite(
  radius: number,
  hasSpikes: boolean,
  colorIdx: number,
  auraHalo: number,
  coreGlowRadius: number,
): OffscreenCanvas | HTMLCanvasElement {
  const auraRadius = auraHalo >= 0 ? radius * (2.05 + auraHalo * 0.78) : 0;
  const pad = Math.max(hasSpikes ? radius * 6 : radius * 4, auraRadius + 2, coreGlowRadius * 1.9 + 2);
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

  // ── Halo aura (widest, drawn under everything) ──
  if (auraHalo >= 0) {
    const auraGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, auraRadius);
    auraGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.36)`);
    auraGrad.addColorStop(0.48, `rgba(${r}, ${g}, ${b}, 0.14)`);
    auraGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    sctx.beginPath();
    sctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
    sctx.fillStyle = auraGrad;
    sctx.fill();
  }

  // ── Diffraction spikes (drawn under the core) ──
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

  // ── Saturated core glow (topmost, tints the white center) ──
  if (coreGlowRadius > 0) {
    const glowR = coreGlowRadius * 1.9;
    const glowGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.72)`);
    glowGrad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.24)`);
    glowGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    sctx.beginPath();
    sctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    sctx.fillStyle = glowGrad;
    sctx.fill();
  }

  return spriteCanvas;
}

// Sprite cache keyed by quantized radius/spikes/color/aura/core-glow
const spriteCache = new Map<string, OffscreenCanvas | HTMLCanvasElement>();

function getStarSprite(star: Star, renderRadius: number) {
  // Quantize the continuous inputs to limit cache entries
  const qr = Math.round(renderRadius * 2) / 2;
  const hasAura = star.halo > 0.16 || star.size > 0.92;
  const qAura = hasAura ? Math.round(star.halo * 10) / 10 : -1;
  const coreGlow = star.halo > 0.035 ? Math.max(0.38, star.size * 0.34) : 0;
  const qCoreGlow = Math.round(coreGlow * 4) / 4;

  const key = `${qr}_${star.hasSpikes ? 1 : 0}_${star.colorIdx}_${qAura}_${qCoreGlow}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = createStarSprite(qr, star.hasSpikes, star.colorIdx, qAura, qCoreGlow);
    spriteCache.set(key, sprite);
  }
  return sprite;
}

export default function StarfieldPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroSectionRef = useRef<HTMLElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const mouseTargetRef = useRef({ x: 0.5, y: 0.5 });
  const mouseSmoothedRef = useRef({ x: 0.5, y: 0.5 });
  const starsRef = useRef<Star[]>([]);
  const nebulaRef = useRef<NebulaCloud[]>([]);
  const dustRef = useRef<DustLane[]>([]);
  const rafRef = useRef<number>(0);

  const STAR_DENSITY = 0.0027;
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

  const initStars = useCallback((width: number, height: number, isMobile: boolean) => {
    const stars: Star[] = [];
    // Phones get far fewer stars: the old floor of 2200 forced a small screen
    // to draw more stars than its area warranted, and nobody can tell the
    // difference past a few hundred on a 6" display.
    const maxStars = isMobile ? 1200 : 6400;
    const minStars = isMobile ? 500 : 2200;
    const starCount = Math.min(maxStars, Math.max(minStars, Math.round(width * height * STAR_DENSITY)));

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
        r, g, b, colorIdx,
        css: `rgb(${r}, ${g}, ${b})`,
        baseAlpha: brightness * (1 - twinkleDepth * 0.5),
      });
    }
    starsRef.current = stars;
  }, []);

  // Only ever play the hero video while its section is actually on screen —
  // pause it the moment it scrolls out of view instead of burning CPU/battery
  // decoding a video nobody is looking at.
  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;

    // React only sets `muted` as a DOM property during hydration — it never
    // lands in the server-rendered HTML, so mobile autoplay policies can see
    // an "unmuted" video and refuse to start it. Set it explicitly before any
    // play() attempt.
    video.muted = true;
    video.defaultMuted = true;

    let isVisible = false;

    const tryPlay = () => {
      if (isVisible && video.paused) video.play().catch(() => {});
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          tryPlay();
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(video);

    // iOS blocks even muted autoplay in Low Power Mode until the user
    // interacts with the page; without these retries the hero stays a blank
    // rectangle on those phones.
    video.addEventListener('canplay', tryPlay);
    window.addEventListener('touchend', tryPlay, { passive: true });
    window.addEventListener('pointerdown', tryPlay, { passive: true });

    return () => {
      observer.disconnect();
      video.removeEventListener('canplay', tryPlay);
      window.removeEventListener('touchend', tryPlay);
      window.removeEventListener('pointerdown', tryPlay);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isMobile = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const TWINKLER_COUNT = 80;

    let dpr = 1;
    let viewW = 0;
    let viewH = 0;
    let bgLayer: HTMLCanvasElement | null = null;
    let starLayer: HTMLCanvasElement | null = null;
    let twinklers: Star[] = [];

    const makeLayer = () => {
      const layer = document.createElement('canvas');
      layer.width = Math.max(1, Math.round(viewW * dpr));
      layer.height = Math.max(1, Math.round(viewH * dpr));
      return layer;
    };

    // The sky gradient, nebula clouds and dust lanes barely move (mouse
    // parallax shifts them ~2px at most), so render them once per resize and
    // blit a single image per frame instead of rebuilding a dozen full-screen
    // radial gradients every 16ms.
    const buildBgLayer = () => {
      bgLayer = makeLayer();
      const bctx = bgLayer.getContext('2d');
      if (!bctx) {
        bgLayer = null;
        return;
      }
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = viewW;
      const h = viewH;

      const skyGrad = bctx.createRadialGradient(
        w * 0.52, h * 0.42, 0,
        w * 0.52, h * 0.42, Math.max(w, h) * 0.85,
      );
      skyGrad.addColorStop(0, 'rgba(11, 14, 26, 0.2)');
      skyGrad.addColorStop(0.55, 'rgba(4, 5, 12, 0.16)');
      skyGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
      bctx.fillStyle = skyGrad;
      bctx.fillRect(0, 0, w, h);

      bctx.globalCompositeOperation = 'screen';
      for (const cloud of nebulaRef.current) {
        const grad = bctx.createRadialGradient(0, 0, 0, 0, 0, cloud.radius);
        grad.addColorStop(0, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, ${cloud.alpha})`);
        grad.addColorStop(0.34, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, ${cloud.alpha * 0.68})`);
        grad.addColorStop(0.72, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, ${cloud.alpha * 0.22})`);
        grad.addColorStop(1, `rgba(${cloud.color.r}, ${cloud.color.g}, ${cloud.color.b}, 0)`);

        bctx.save();
        bctx.translate(cloud.x, cloud.y);
        bctx.rotate(cloud.rotation);
        bctx.scale(cloud.stretchX, cloud.stretchY);
        bctx.fillStyle = grad;
        bctx.beginPath();
        bctx.arc(0, 0, cloud.radius, 0, Math.PI * 2);
        bctx.fill();
        bctx.restore();
      }
      bctx.globalCompositeOperation = 'source-over';

      for (const dust of dustRef.current) {
        const grad = bctx.createRadialGradient(0, 0, 0, 0, 0, dust.radius);
        grad.addColorStop(0, `rgba(0, 0, 0, ${dust.alpha})`);
        grad.addColorStop(0.46, `rgba(0, 0, 0, ${dust.alpha * 0.74})`);
        grad.addColorStop(0.78, `rgba(0, 0, 0, ${dust.alpha * 0.28})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        bctx.save();
        bctx.translate(dust.x, dust.y);
        bctx.rotate(dust.rotation);
        bctx.scale(dust.stretchX, dust.stretchY);
        bctx.fillStyle = grad;
        bctx.beginPath();
        bctx.arc(0, 0, dust.radius, 0, Math.PI * 2);
        bctx.fill();
        bctx.restore();
      }
    };

    const drawStar = (
      target: CanvasRenderingContext2D,
      star: Star,
      x: number,
      y: number,
      alpha: number,
    ) => {
      if (star.size < 0.58 && star.halo < 0.035) {
        target.globalAlpha = Math.max(0.26, Math.min(1, alpha * 1.26));
        target.fillStyle = star.css;
        target.fillRect(x, y, 1, 1);
        return;
      }

      // Real astrophoto stars are mostly sharp points; keep bloom rare and tight.
      const renderRadius = Math.max(0.65, star.size * (0.82 + star.halo * 0.7));
      const sprite = getStarSprite(star, renderRadius);
      target.globalAlpha = Math.max(0, Math.min(1, alpha * 1.24));

      if (star.hasSpikes) {
        target.save();
        target.translate(x, y);
        target.rotate(star.spikeAngle);
        target.drawImage(sprite as HTMLCanvasElement, -sprite.width / 2, -sprite.height / 2);
        target.restore();
      } else {
        target.drawImage(sprite as HTMLCanvasElement, x - sprite.width / 2, y - sprite.height / 2);
      }
    };

    // Touch devices have no mouse parallax, so star positions never change —
    // twinkle is the only motion. Bake every star except the handful with the
    // most visible twinkle into a static layer and animate only those few.
    const buildStarLayer = () => {
      const stars = starsRef.current;
      const ranked = [...stars].sort(
        (a, b) => b.brightness * b.twinkleDepth - a.brightness * a.twinkleDepth,
      );
      twinklers = ranked.slice(0, TWINKLER_COUNT);
      const twinkSet = new Set(twinklers);

      starLayer = makeLayer();
      const sctx = starLayer.getContext('2d');
      if (!sctx) {
        starLayer = null;
        return;
      }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.globalCompositeOperation = 'lighter';
      for (const star of stars) {
        if (twinkSet.has(star)) continue;
        drawStar(sctx, star, star.ox, star.oy, star.baseAlpha);
      }
    };

    const drawScene = (time: number) => {
      const w = viewW;
      const h = viewH;
      ctx.clearRect(0, 0, w, h);

      const sm = mouseSmoothedRef.current;
      const mx = (sm.x - 0.5) * 2;
      const my = (sm.y - 0.5) * 2;

      if (bgLayer) {
        ctx.drawImage(bgLayer, -mx * PARALLAX_STRENGTH * 0.13, -my * PARALLAX_STRENGTH * 0.09, w, h);
      }

      ctx.globalCompositeOperation = 'lighter'; // Makes overlapping colors pop and saturates strongly

      if (isMobile) {
        if (starLayer) ctx.drawImage(starLayer, 0, 0, w, h);
        for (const star of twinklers) {
          const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
          const alpha = star.brightness * (1 - star.twinkleDepth * 0.5 + star.twinkleDepth * twinkle);
          drawStar(ctx, star, star.ox, star.oy, alpha);
        }
      } else {
        for (const star of starsRef.current) {
          const px = star.ox - mx * PARALLAX_STRENGTH * star.z;
          const py = star.oy - my * PARALLAX_STRENGTH * star.z;

          const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
          const alpha = star.brightness * (1 - star.twinkleDepth * 0.5 + star.twinkleDepth * twinkle);

          const drawX = ((px % (w + 80)) + (w + 80)) % (w + 80) - 40;
          const drawY = ((py % (h + 80)) + (h + 80)) % (h + 80) - 40;

          drawStar(ctx, star, drawX, drawY, alpha);
        }
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    let lastTime = 0;

    const resize = () => {
      // The canvas is CSS-sized (100vw/100vh, which tracks the *large*
      // viewport), so mobile URL-bar show/hide fires resize events without
      // changing the canvas box — skip those instead of regenerating and
      // visibly reshuffling the whole sky mid-scroll.
      const nextW = canvas.clientWidth || window.innerWidth;
      const nextH = canvas.clientHeight || window.innerHeight;
      const nextDpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      if (nextW === viewW && nextH === viewH && nextDpr === dpr) return;

      viewW = nextW;
      viewH = nextH;
      dpr = nextDpr;
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spriteCache.clear();
      initNebula(viewW, viewH);
      initStars(viewW, viewH, isMobile);
      buildBgLayer();
      if (isMobile) buildStarLayer();
      drawScene(lastTime / 1000);
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseTargetRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    if (!isMobile) window.addEventListener('mousemove', handleMouseMove);

    let running = false;
    // Phones render the starfield at 30fps — plenty for a slow twinkle, and
    // it halves the canvas work competing with scrolling.
    const frameBudget = isMobile ? 1000 / 30 - 2 : 0;
    let lastDraw = -Infinity;

    const animate = (ts: number) => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(animate);
      if (ts - lastDraw < frameBudget) return;
      lastDraw = ts;
      lastTime = ts;

      if (!isMobile) {
        const sm = mouseSmoothedRef.current;
        const tgt = mouseTargetRef.current;
        sm.x += (tgt.x - sm.x) * MOUSE_LERP;
        sm.y += (tgt.y - sm.y) * MOUSE_LERP;
      }

      drawScene(ts / 1000);
    };

    const startLoop = () => {
      if (running || prefersReducedMotion) return;
      running = true;
      rafRef.current = requestAnimationFrame(animate);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };

    // The starfield only shows through the hero (top) and waitlist (bottom)
    // sections — everything between them sits on solid black, fully covering
    // the canvas. While neither is on screen a frozen frame is
    // indistinguishable, so stop the loop entirely instead of repainting a
    // full-viewport canvas per frame through the whole middle of the page.
    const visibleSections = new Set<Element>();
    let visibilityObserver: IntersectionObserver | null = null;
    const starfieldSections = [heroSectionRef.current, document.getElementById('waitlist')]
      .filter((el): el is HTMLElement => el !== null);
    if (!prefersReducedMotion && starfieldSections.length > 0) {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visibleSections.add(entry.target);
            else visibleSections.delete(entry.target);
          }
          if (visibleSections.size > 0) startLoop();
          else stopLoop();
        },
        { rootMargin: '25% 0px' },
      );
      starfieldSections.forEach((el) => visibilityObserver?.observe(el));
    }

    startLoop();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      visibilityObserver?.disconnect();
      stopLoop();
    };
  }, [initNebula, initStars]);

  return (
    <>
      <SplashScreen />
      <canvas ref={canvasRef} className="starfield-canvas" aria-hidden="true" />

      <SiteNav />

      <main className="page-container home-starfield">
        <section className="home-starfield-hero" id="hero" ref={heroSectionRef}>
          <div className="home-mask-glow" aria-hidden="true" />
          <div className="home-mask-shell" aria-hidden="true">
            <video
              ref={heroVideoRef}
              className="home-mask-image"
              autoPlay
              muted
              playsInline
              preload="auto"
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
