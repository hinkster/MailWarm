export type RampCurve = "LINEAR" | "EXPONENTIAL" | "AGGRESSIVE";

/**
 * Returns the target send volume for a given day of the warming schedule.
 * @param curve    - warming curve type
 * @param day      - current day (1-indexed)
 * @param target   - final target daily volume
 * @param totalDays - total warming period in days (default 30)
 */
export function calculateDayVolume(
  curve: RampCurve,
  day: number,
  target: number,
  totalDays = 30
): number {
  const progress = Math.min(day / totalDays, 1);

  let volume: number;
  switch (curve) {
    case "LINEAR":
      volume = Math.ceil(target * progress);
      break;
    case "EXPONENTIAL":
      // Slow start, fast finish — good for new domains
      volume = Math.ceil(target * Math.pow(progress, 2));
      break;
    case "AGGRESSIVE":
      // Fast start — only for domains with some existing reputation
      volume = Math.ceil(target * Math.sqrt(progress));
      break;
  }

  // Safety floor: always send at least 10 on day 1
  return Math.max(volume, day === 1 ? 10 : 1);
}

/**
 * Generates a full 30-day schedule as an array of { day, volume } tuples.
 */
export function generateWarmingCurve(
  curve: RampCurve,
  target: number,
  totalDays = 30
): Array<{ day: number; volume: number }> {
  return Array.from({ length: totalDays }, (_, i) => ({
    day: i + 1,
    volume: calculateDayVolume(curve, i + 1, target, totalDays),
  }));
}

// Recommended targets by use case
export const WARMUP_PRESETS = {
  cold_domain: { curve: "EXPONENTIAL" as RampCurve, target: 1000, days: 30 },
  existing_domain: { curve: "LINEAR" as RampCurve, target: 5000, days: 21 },
  high_volume: { curve: "AGGRESSIVE" as RampCurve, target: 10000, days: 45 },
} as const;
