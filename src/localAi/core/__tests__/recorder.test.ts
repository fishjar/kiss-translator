import { describe, expect, it } from "vitest";
import { resampleTo16k } from "../recorder";

describe("resampleTo16k", () => {
  it("16kHz 输入原样返回", () => {
    const input = new Float32Array([0.1, -0.2, 0.3, 0.4]);
    expect(resampleTo16k(input, 16000)).toBe(input);
  });

  it("48kHz 常量信号重采样后保持常量且长度约为 1/3", () => {
    const input = new Float32Array(4800).fill(0.25);
    const out = resampleTo16k(input, 48000);
    expect(out.length).toBe(1600);
    for (const v of out) expect(v).toBeCloseTo(0.25, 5);
  });

  it("44.1kHz 输出长度为 floor(len * 16000/44100)", () => {
    const input = new Float32Array(4410);
    const out = resampleTo16k(input, 44100);
    expect(out.length).toBe(Math.floor((4410 * 16000) / 44100));
  });

  it("线性信号端点近似正确", () => {
    const n = 4800;
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) input[i] = i / n;
    const out = resampleTo16k(input, 48000);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[out.length - 1]).toBeGreaterThan(0.99);
  });
});
