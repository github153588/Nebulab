'use client';

import Image from 'next/image';
import { useEffect, useRef, useCallback, useState } from 'react';

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

const PRODUCT_LAYERS = [
  {
    name: 'The Mask',
    eyebrow: 'Layer 01',
    description:
      '[Description of the outer shell, constellation pattern, moon logo, side buttons, ports, and protective base structure.]',
  },
  {
    name: 'EEG Sensor',
    eyebrow: 'Layer 02',
    description:
      '[Description of how the sensor layer tracks sleep stages in real time through the headband strip and internal chipset.]',
  },
  {
    name: 'Vibration',
    eyebrow: 'Layer 03',
    description:
      '[Description of the haptic/audio core, including speaker drivers and the battery pack that powers gentle wake cues.]',
  },
  {
    name: 'Comfort',
    eyebrow: 'Layer 04',
    description:
      '[Description of the foam eye cushions and elastic strap system that keeps the fit soft, stable, and light.]',
  },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - clamp(value), 3);
}

/**
 * Pre-render a star sprite onto an offscreen canvas.
 * Produces a soft Airy-disc core + 4-point diffraction spikes.
 * White on transparent — tinted at draw-time via globalCompositeOperation.
 */
function createStarSprite(radius: number, hasSpikes: boolean): OffscreenCanvas | HTMLCanvasElement {
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
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
      grad.addColorStop(0.15, 'rgba(255, 255, 255, 0.25)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

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
  outerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  outerGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.06)');
  outerGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.015)');
  outerGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  sctx.beginPath();
  sctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  sctx.fillStyle = outerGrad;
  sctx.fill();

  // ── Core (bright saturated center with Airy-like falloff) ──
  const coreR = radius * 1.2;
  const coreGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  coreGrad.addColorStop(0.15, 'rgba(255, 255, 255, 0.9)');
  coreGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
  coreGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
  coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  sctx.beginPath();
  sctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  sctx.fillStyle = coreGrad;
  sctx.fill();

  return spriteCanvas;
}

// Sprite cache keyed by "size_hasSpikes"
const spriteCache = new Map<string, OffscreenCanvas | HTMLCanvasElement>();

function getStarSprite(radius: number, hasSpikes: boolean) {
  // Quantize radius to nearest 0.5 to limit cache entries
  const qr = Math.round(radius * 2) / 2;
  const key = `${qr}_${hasSpikes ? 1 : 0}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = createStarSprite(qr, hasSpikes);
    spriteCache.set(key, sprite);
  }
  return sprite;
}

export default function ExplodedViewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollSectionRef = useRef<HTMLElement>(null);
  const mouseTargetRef = useRef({ x: 0.5, y: 0.5 });
  const mouseSmoothedRef = useRef({ x: 0.5, y: 0.5 });
  const starsRef = useRef<Star[]>([]);
  const nebulaRef = useRef<NebulaCloud[]>([]);
  const dustRef = useRef<DustLane[]>([]);
  const rafRef = useRef<number>(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeLayer, setActiveLayer] = useState(0);

  const STAR_DENSITY = 0.0022;
  const MAX_STARS = 5200;
  const MIN_STARS = 1800;
  const PARALLAX_STRENGTH = 14;
  const MOUSE_LERP = 0.025;

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
      const size = 0.18 + magnitude * 0.98 + z * 0.2;
      const brightness = Math.min(0.95, 0.16 + magnitude * 0.74 + depthBoost * 0.24);
      const halo = Math.pow(magnitude, 2.5);

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
      const colorMix = 0.96 + Math.random() * 0.16;
      const r = clampColor(255 + (color.r - 255) * colorMix);
      const g = clampColor(255 + (color.g - 255) * colorMix);
      const b = clampColor(255 + (color.b - 255) * colorMix);

      stars.push({
        ox, oy, z, size, brightness, halo,
        twinkleSpeed, twinklePhase, twinkleDepth,
        spikeAngle: Math.random() * Math.PI * 0.5, // random 0-90° rotation
        hasSpikes: magnitude > 0.78 && Math.random() < 0.12,
        r, g, b,
      });
    }
    starsRef.current = stars;
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

      for (const star of starsRef.current) {
        const px = star.ox - mx * PARALLAX_STRENGTH * star.z;
        const py = star.oy - my * PARALLAX_STRENGTH * star.z;

        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
        const alpha = star.brightness * (1 - star.twinkleDepth * 0.5 + star.twinkleDepth * twinkle);

        const drawX = ((px % (w + 80)) + (w + 80)) % (w + 80) - 40;
        const drawY = ((py % (h + 80)) + (h + 80)) % (h + 80) - 40;

        if (star.size < 0.58 && star.halo < 0.035) {
          ctx.save();
          ctx.globalAlpha = Math.max(0.14, Math.min(0.82, alpha));
          ctx.fillStyle = `rgb(${star.r}, ${star.g}, ${star.b})`;
          ctx.fillRect(drawX, drawY, 1, 1);
          ctx.restore();
          continue;
        }

        // Real astrophoto stars are mostly sharp points; keep bloom rare and tight.
        const renderRadius = Math.max(0.65, star.size * (0.82 + star.halo * 0.7));
        const sprite = getStarSprite(renderRadius, star.hasSpikes);

        const spriteW = sprite.width;
        const spriteH = sprite.height;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        ctx.translate(drawX, drawY);
        ctx.rotate(star.spikeAngle);

        if (star.halo > 0.16 || star.size > 0.92) {
          const auraRadius = renderRadius * (1.75 + star.halo * 0.6);
          const auraGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, auraRadius);
          auraGrad.addColorStop(0, `rgba(${star.r}, ${star.g}, ${star.b}, 0.28)`);
          auraGrad.addColorStop(0.48, `rgba(${star.r}, ${star.g}, ${star.b}, 0.1)`);
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

  useEffect(() => {
    const updateProgress = () => {
      const section = scrollSectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const scrollable = Math.max(1, rect.height - window.innerHeight);
      const progress = clamp(-rect.top / scrollable);

      setScrollProgress(progress);
      setActiveLayer(Math.min(PRODUCT_LAYERS.length - 1, Math.floor(progress * PRODUCT_LAYERS.length)));
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, []);

  const layerProgress = (index: number) => {
    const segmentStart = index * 0.22;
    return easeOutCubic((scrollProgress - segmentStart) / 0.18);
  };

  const maskProgress = layerProgress(0);
  const sensorProgress = layerProgress(1);
  const vibrationProgress = layerProgress(2);
  const comfortProgress = layerProgress(3);

  return (
    <>
      <canvas ref={canvasRef} className="starfield-canvas" aria-hidden="true" />

      <main className="page-container">
        <section ref={scrollSectionRef} className="exploded-scroll" id="hero">
          <div className="exploded-sticky">
            <div className="hero-copy" id="waitlist">
              <p className="hero-kicker">Somnia EEG Sleep Mask</p>
              <h1 className="hero-title">A sleep lab, softened into a mask.</h1>
              <p className="hero-subtitle">
                Scroll through the quiet architecture inside the mask, from moonlit shell to sensing, haptics, and comfort.
              </p>
            </div>

            <div className="exploded-layout">
              <div className="product-stage" aria-label="Exploded Somnia EEG sleep mask product">
                <div className="moonlight" aria-hidden="true" />

                <div
                  className="exploded-layer shell-layer"
                  style={{
                    transform: `translate3d(${-12 * maskProgress}px, ${-36 * maskProgress}px, 0) rotate(${-2 * maskProgress}deg) scale(${1 + 0.015 * maskProgress})`,
                    opacity: 0.88 + 0.12 * maskProgress,
                  }}
                >
                  <Image
                    src="/somnia-mask-hero.png"
                    alt="Somnia EEG sleep mask outer shell with constellation pattern"
                    width={1148}
                    height={485}
                    priority
                    className="product-mask"
                  />
                </div>

                <div
                  className="exploded-layer eeg-layer"
                  style={{
                    transform: `translate3d(${16 * sensorProgress}px, ${-138 * sensorProgress}px, 0) rotate(${5 * sensorProgress}deg) scale(${0.94 + 0.06 * sensorProgress})`,
                    opacity: 0.12 + 0.88 * sensorProgress,
                  }}
                  aria-hidden="true"
                >
                  <span className="sensor-strip" />
                  <span className="sensor-pcb">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>

                <div
                  className="exploded-layer vibration-layer"
                  style={{
                    transform: `translate3d(${64 * vibrationProgress}px, ${78 * vibrationProgress}px, 0) rotate(${-4 * vibrationProgress}deg) scale(${0.92 + 0.08 * vibrationProgress})`,
                    opacity: 0.08 + 0.92 * vibrationProgress,
                  }}
                  aria-hidden="true"
                >
                  <span className="driver driver-left" />
                  <span className="battery-pack" />
                  <span className="driver driver-right" />
                </div>

                <div
                  className="exploded-layer comfort-layer"
                  style={{
                    transform: `translate3d(${-76 * comfortProgress}px, ${148 * comfortProgress}px, 0) rotate(${3 * comfortProgress}deg) scale(${0.9 + 0.1 * comfortProgress})`,
                    opacity: 0.06 + 0.94 * comfortProgress,
                  }}
                  aria-hidden="true"
                >
                  <span className="foam-cushion foam-left" />
                  <span className="foam-cushion foam-right" />
                  <span className="comfort-strap" />
                </div>
              </div>

              <aside className="layer-copy" aria-live="polite">
                <div className="layer-stepper" aria-label="Exploded view progress">
                  {PRODUCT_LAYERS.map((layer, index) => (
                    <span
                      key={layer.name}
                      className={index === activeLayer ? 'stepper-dot is-active' : 'stepper-dot'}
                    />
                  ))}
                </div>

                {PRODUCT_LAYERS.map((layer, index) => (
                  <div
                    key={layer.name}
                    className={index === activeLayer ? 'layer-panel is-active' : 'layer-panel'}
                  >
                    <p className="layer-eyebrow">{layer.eyebrow}</p>
                    <h2>{layer.name}</h2>
                    <p>{layer.description}</p>
                  </div>
                ))}
              </aside>
            </div>
          </div>
        </section>

        <section className="normal-scroll-section">
          <div>
            <p className="hero-kicker">Nightly intelligence</p>
            <h2>Every layer works while you sleep.</h2>
            <p>
              The exploded view releases into the rest of the page here, leaving room for product details, specs, waitlist capture, and clinical validation content.
            </p>
            <a href="#waitlist" className="hero-cta" id="cta-waitlist">
              Join the Waitlist
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
