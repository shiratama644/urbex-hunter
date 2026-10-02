/**
 * Material 3 Expressive — Motion physics tokens
 * Canonical springs from MDC-Android tokens.xml (same as MotionScheme.expressive()) → web via linear() + Framer.
 * Spatial = position/size/shape/rotation (overshoot), Effects = color/opacity (no overshoot).
 * Damping ratio 0.9 for spatial, 1.0 for effects. See: m3.material.io/styles/motion + m3-expressive-web.
 */
import type { Transition } from "framer-motion";

// Framer spring — Framer uses stiffness/damping/mass (not ratio). Convert ratio→damping: c = 2 ζ √(k m)
function dampingFromRatio(stiffness: number, ratio: number, mass = 1) {
  return 2 * ratio * Math.sqrt(stiffness * mass);
}

export const M3_SPRINGS = {
  // canonical (from lobsterbs/m3-expressive-web — values audited from MDC-Android motion/res/values/tokens.xml)
  fast: {
    spatial: { stiffness: 1400, damping: dampingFromRatio(1400, 0.9), mass: 1, dampingRatio: 0.9 },
    effects: { stiffness: 3800, damping: dampingFromRatio(3800, 1.0), mass: 1, dampingRatio: 1.0 },
  },
  default: {
    spatial: { stiffness: 700, damping: dampingFromRatio(700, 0.9), mass: 1, dampingRatio: 0.9 },
    effects: { stiffness: 1600, damping: dampingFromRatio(1600, 1.0), mass: 1, dampingRatio: 1.0 },
  },
  slow: {
    spatial: { stiffness: 300, damping: dampingFromRatio(300, 0.9), mass: 1, dampingRatio: 0.9 },
    effects: { stiffness: 800, damping: dampingFromRatio(800, 1.0), mass: 1, dampingRatio: 1.0 },
  },
  // expressive extras for hero moments — more playful overshoot than canonical 0.9
  // sabaoon.dev / springs.studio presets
  expressive: { stiffness: 350, damping: 15, mass: 0.8, dampingRatio: 0.45 }, // ~20% overshoot, 445ms — FAB / sheet entrance
  responsive: { stiffness: 500, damping: 25, mass: 0.6, dampingRatio: 0.72 }, // snappy, ~3% overshoot, 275ms — chips / quick feedback
  gentle: { stiffness: 200, damping: 20, mass: 1.0, dampingRatio: 0.71 }, // large layout
} as const;

export const M3_DURATIONS = {
  fastSpatial: 165,
  fastEffects: 165,
  defaultSpatial: 230,
  defaultEffects: 250,
  slowSpatial: 350,
  slowEffects: 355,
  expressive: 445,
  responsive: 275,
} as const;

/**
 * Framer spring transitions — prefer these over durations.
 * Use `spatial` for translate/scale/shape, `effects` for color/opacity.
 */
export const m3Spring = {
  fastSpatial: {
    type: "spring",
    stiffness: M3_SPRINGS.fast.spatial.stiffness,
    damping: M3_SPRINGS.fast.spatial.damping,
    mass: 1,
  } as Transition,
  fastEffects: {
    type: "spring",
    stiffness: M3_SPRINGS.fast.effects.stiffness,
    damping: M3_SPRINGS.fast.effects.damping,
    mass: 1,
  } as Transition,
  defaultSpatial: {
    type: "spring",
    stiffness: M3_SPRINGS.default.spatial.stiffness,
    damping: M3_SPRINGS.default.spatial.damping,
    mass: 1,
  } as Transition,
  defaultEffects: {
    type: "spring",
    stiffness: M3_SPRINGS.default.effects.stiffness,
    damping: M3_SPRINGS.default.effects.damping,
    mass: 1,
  } as Transition,
  slowSpatial: {
    type: "spring",
    stiffness: M3_SPRINGS.slow.spatial.stiffness,
    damping: M3_SPRINGS.slow.spatial.damping,
    mass: 1,
  } as Transition,
  slowEffects: {
    type: "spring",
    stiffness: M3_SPRINGS.slow.effects.stiffness,
    damping: M3_SPRINGS.slow.effects.damping,
    mass: 1,
  } as Transition,
  // expressive variants — spatial only (effects never overshoot per vaam #24)
  expressive: {
    type: "spring",
    stiffness: M3_SPRINGS.expressive.stiffness,
    damping: M3_SPRINGS.expressive.damping,
    mass: M3_SPRINGS.expressive.mass,
  } as Transition,
  responsive: {
    type: "spring",
    stiffness: M3_SPRINGS.responsive.stiffness,
    damping: M3_SPRINGS.responsive.damping,
    mass: M3_SPRINGS.responsive.mass,
  } as Transition,
  gentle: {
    type: "spring",
    stiffness: M3_SPRINGS.gentle.stiffness,
    damping: M3_SPRINGS.gentle.damping,
    mass: M3_SPRINGS.gentle.mass,
  } as Transition,
} as const;

/** Stagger helper — M3E docs recommend 40ms per child with ^0.85 falloff (springs.studio) */
export function m3Stagger(index: number, baseMs = 40) {
  return (baseMs * index ** 0.85) / 1000; // seconds for Framer `delay`
}

/** Respect prefers-reduced-motion — returns instantaneous transition when reduced */
export function withReducedMotion(transition: Transition, prefersReduced: boolean): Transition {
  if (prefersReduced) return { duration: 0.01 } as Transition;
  return transition;
}
