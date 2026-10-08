/**
 * Shared Illustrator-style stroke weight presets + steppers.
 * Kept free of DOM / window so unit tests can import it under Node.
 */

/** Illustrator Stroke Weight presets (pt). */
export const ILLUSTRATOR_STROKE_WEIGHT_PRESETS = Object.freeze([
  0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
]);

/**
 * Stepper sequence: 0 → 0.25 → 0.5 → 0.75 → 1 → 2 → 3 → 4 → 5 …
 */
export function stepStrokeWeight(value, dir) {
  const n = Math.max(0, Number(value) || 0);
  const quarters = [0, 0.25, 0.5, 0.75, 1];
  if (dir > 0) {
    for (const s of quarters) {
      if (n < s - 1e-9) return s;
    }
    return Math.floor(n + 1e-9) + 1;
  }
  if (n > 1 + 1e-9) {
    const floored = Math.floor(n + 1e-9);
    return Math.abs(n - floored) < 1e-9 ? floored - 1 : floored;
  }
  for (let i = quarters.length - 1; i >= 0; i--) {
    if (n > quarters[i] + 1e-9) return quarters[i];
  }
  return 0;
}

export function formatStrokeWeight(n) {
  const v = Math.max(0, Number(n) || 0);
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}
