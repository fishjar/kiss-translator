import { describe, expect, it } from "vitest";
import { formatBytes, formatEta, formatSpeed } from "../progress";

describe("formatBytes", () => {
  it("常见量级", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
    expect(formatBytes(2560 * 1024 * 1024)).toBe("2.50 GB");
  });

  it("非法值返回 -", () => {
    expect(formatBytes(-1)).toBe("-");
    expect(formatBytes(Infinity)).toBe("-");
  });
});

describe("formatSpeed", () => {
  it("0/非法 → -", () => {
    expect(formatSpeed(0)).toBe("-");
    expect(formatSpeed(NaN)).toBe("-");
  });
  it("正常值带 /s", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1.00 MB/s");
  });
});

describe("formatEta", () => {
  it("null/非法 → -", () => {
    expect(formatEta(null)).toBe("-");
    expect(formatEta(undefined)).toBe("-");
    expect(formatEta(0)).toBe("-");
    expect(formatEta(Infinity)).toBe("-");
  });
  it("分级", () => {
    expect(formatEta(5)).toBe("5s");
    expect(formatEta(61)).toBe("1m 1s");
    expect(formatEta(3661)).toBe("1h 1m");
  });
});
