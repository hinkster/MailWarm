import { describe, it, expect } from "vitest";
import {
  calculateDayVolume,
  generateWarmingCurve,
  WARMUP_PRESETS,
} from "./warming-curves";

describe("calculateDayVolume", () => {
  describe("LINEAR", () => {
    it("scales proportionally with progress", () => {
      expect(calculateDayVolume("LINEAR", 15, 1000)).toBe(500);
      expect(calculateDayVolume("LINEAR", 30, 1000)).toBe(1000);
    });

    it("enforces a floor of 10 on day 1", () => {
      // Day 1 of 30 with target 1000: ceil(1000 * 1/30) = 34, max(34, 10) = 34
      expect(calculateDayVolume("LINEAR", 1, 1000)).toBeGreaterThanOrEqual(10);
      // Small target where formula gives < 10
      expect(calculateDayVolume("LINEAR", 1, 100, 30)).toBeGreaterThanOrEqual(10);
    });

    it("returns at least 1 on non-day-1 days", () => {
      for (let day = 2; day <= 30; day++) {
        expect(calculateDayVolume("LINEAR", day, 1000)).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("EXPONENTIAL", () => {
    it("reaches target on the final day", () => {
      expect(calculateDayVolume("EXPONENTIAL", 30, 1000)).toBe(1000);
    });

    it("starts slower than LINEAR on the same day", () => {
      // Both at day 15/30 (50% progress): LINEAR = 500, EXPONENTIAL = ceil(1000 * 0.25) = 250
      const linear = calculateDayVolume("LINEAR", 15, 1000);
      const expo = calculateDayVolume("EXPONENTIAL", 15, 1000);
      expect(expo).toBeLessThan(linear);
    });

    it("enforces a floor of 10 on day 1 for small targets", () => {
      expect(calculateDayVolume("EXPONENTIAL", 1, 100)).toBe(10);
    });
  });

  describe("AGGRESSIVE", () => {
    it("reaches target on the final day", () => {
      expect(calculateDayVolume("AGGRESSIVE", 30, 1000)).toBe(1000);
    });

    it("starts faster than EXPONENTIAL on the same day", () => {
      // At day 5/30: AGGRESSIVE = ceil(1000 * sqrt(1/6)) ≈ 409, EXPONENTIAL = ceil(1000 * (1/6)^2) ≈ 28
      const aggressive = calculateDayVolume("AGGRESSIVE", 5, 1000);
      const expo = calculateDayVolume("EXPONENTIAL", 5, 1000);
      expect(aggressive).toBeGreaterThan(expo);
    });
  });

  it("caps progress at 1 when day exceeds totalDays", () => {
    expect(calculateDayVolume("LINEAR", 100, 500, 30)).toBe(500);
    expect(calculateDayVolume("EXPONENTIAL", 100, 500, 30)).toBe(500);
    expect(calculateDayVolume("AGGRESSIVE", 100, 500, 30)).toBe(500);
  });

  it("respects a custom totalDays param", () => {
    // At day 7/14 (50%), LINEAR target 1000 → 500
    expect(calculateDayVolume("LINEAR", 7, 1000, 14)).toBe(500);
  });
});

describe("generateWarmingCurve", () => {
  it("returns 30 entries by default", () => {
    const curve = generateWarmingCurve("LINEAR", 1000);
    expect(curve).toHaveLength(30);
  });

  it("entries are 1-indexed and sequential", () => {
    const curve = generateWarmingCurve("LINEAR", 1000);
    curve.forEach((entry, i) => {
      expect(entry.day).toBe(i + 1);
    });
  });

  it("last entry volume equals the target", () => {
    expect(generateWarmingCurve("LINEAR", 5000).at(-1)!.volume).toBe(5000);
    expect(generateWarmingCurve("EXPONENTIAL", 2500).at(-1)!.volume).toBe(2500);
    expect(generateWarmingCurve("AGGRESSIVE", 10000).at(-1)!.volume).toBe(10000);
  });

  it("volume is non-decreasing for LINEAR", () => {
    const curve = generateWarmingCurve("LINEAR", 1000);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].volume).toBeGreaterThanOrEqual(curve[i - 1].volume);
    }
  });

  it("respects a custom totalDays", () => {
    const curve = generateWarmingCurve("LINEAR", 1000, 14);
    expect(curve).toHaveLength(14);
    expect(curve.at(-1)!.volume).toBe(1000);
  });

  it("all volumes are positive integers", () => {
    for (const curve of ["LINEAR", "EXPONENTIAL", "AGGRESSIVE"] as const) {
      generateWarmingCurve(curve, 1000).forEach(({ volume }) => {
        expect(volume).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(volume)).toBe(true);
      });
    }
  });
});

describe("WARMUP_PRESETS", () => {
  it("cold_domain uses EXPONENTIAL (slow ramp for new domains)", () => {
    expect(WARMUP_PRESETS.cold_domain.curve).toBe("EXPONENTIAL");
    expect(WARMUP_PRESETS.cold_domain.days).toBe(30);
  });

  it("existing_domain uses LINEAR over 21 days", () => {
    expect(WARMUP_PRESETS.existing_domain.curve).toBe("LINEAR");
    expect(WARMUP_PRESETS.existing_domain.days).toBe(21);
  });

  it("high_volume uses AGGRESSIVE over 45 days", () => {
    expect(WARMUP_PRESETS.high_volume.curve).toBe("AGGRESSIVE");
    expect(WARMUP_PRESETS.high_volume.days).toBe(45);
    expect(WARMUP_PRESETS.high_volume.target).toBe(10000);
  });

  it("targets increase across presets", () => {
    expect(WARMUP_PRESETS.cold_domain.target).toBeLessThan(
      WARMUP_PRESETS.existing_domain.target
    );
    expect(WARMUP_PRESETS.existing_domain.target).toBeLessThan(
      WARMUP_PRESETS.high_volume.target
    );
  });
});
