import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, INPUT_LIMIT_KEYS } from "../types";
import { normalizeSettings } from "../settings";
import { checkFileSize, cropAudio, cropTtsText, imageDimensions, prepareImage } from "../inputLimits";

afterEach(() => vi.unstubAllGlobals());

describe("input limits", () => {
  it("migrates missing and invalid limits while preserving valid values", () => {
    expect(normalizeSettings({})).toMatchObject(DEFAULT_SETTINGS);
    for (const key of INPUT_LIMIT_KEYS) {
      for (const value of [0, -1, 1.5, NaN, "20"]) {
        expect(normalizeSettings({ [key]: value })[key]).toBe(DEFAULT_SETTINGS[key]);
      }
      expect(normalizeSettings({ [key]: 2 })[key]).toBe(2);
    }
  });

  it("checks the exact file-size boundary in bytes", () => {
    for (const kind of ["image", "audio"] as const) {
      const limit = (kind === "image" ? 10 : 50) * 1024 ** 2;
      expect(() => checkFileSize(limit, kind, DEFAULT_SETTINGS)).not.toThrow();
      expect(() => checkFileSize(limit + 1, kind, DEFAULT_SETTINGS)).toThrow("INPUT_LIMIT_EXCEEDED");
    }
  });

  it("fits landscape, portrait and tiny images without upscaling", () => {
    expect(imageDimensions(3000, 2000, 1536)).toEqual({ width: 1536, height: 1024 });
    expect(imageDimensions(2000, 3000, 1536)).toEqual({ width: 1024, height: 1536 });
    expect(imageDimensions(20, 10, 1536)).toEqual({ width: 20, height: 10 });
    expect(imageDimensions(1, 100000, 1536)).toEqual({ width: 1, height: 1536 });
  });

  it("keeps the beginning of PCM and leaves the original untouched", () => {
    const audio = new Float32Array(61 * 16000);
    audio[0] = 0.5; audio[60000] = 0.25;
    const r = cropAudio(audio, { ...DEFAULT_SETTINGS, maxAsrMinutes: 1 });
    expect(r.audio.length).toBe(60 * 16000);
    expect(r.audio[0]).toBe(0.5);
    expect(r.audio[60000]).toBe(0.25);
    expect(audio.length).toBe(61 * 16000);
    expect(r.adjustment).toMatchObject({ kind: "audio", original: 61, processed: 60 });
    expect(cropAudio(r.audio, { ...DEFAULT_SETTINGS, maxAsrMinutes: 1 }).adjustment).toBeUndefined();
  });

  it("counts Unicode code points without splitting surrogate pairs", () => {
    const settings = { ...DEFAULT_SETTINGS, maxTtsCharacters: 3 };
    expect(cropTtsText("中😀ab", settings)).toMatchObject({ text: "中😀a",
      adjustment: { original: 4, processed: 3 } });
    expect(cropTtsText("中😀a", settings)).toEqual({ text: "中😀a", adjustment: undefined });
  });

  it("resizes to PNG and releases bitmap and canvas resources", async () => {
    const close = vi.fn(), drawImage = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3000, height: 2000, close })));
    const output = new Blob(["png"], { type: "image/png" });
    let canvas: any;
    vi.stubGlobal("OffscreenCanvas", class {
      width: number; height: number;
      constructor(w: number, h: number) { this.width = w; this.height = h; canvas = this; }
      getContext() { return { drawImage }; }
      convertToBlob = vi.fn(async (opts) => { expect(opts.type).toBe("image/png"); return output; });
    });
    const result = await prepareImage(new Blob(["source"]), DEFAULT_SETTINGS, new AbortController().signal);
    expect(result.blob).toBe(output);
    expect(result.original).toEqual({ width: 3000, height: 2000 });
    expect(result.size).toEqual({ width: 1536, height: 1024 });
    expect(close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("rejects oversized images before decoding", async () => {
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    const blob = new Blob(); Object.defineProperty(blob, "size", { value: 10 * 1024 ** 2 + 1 });
    await expect(prepareImage(blob, DEFAULT_SETTINGS, new AbortController().signal)).rejects.toThrow("INPUT_LIMIT_EXCEEDED");
    expect(decode).not.toHaveBeenCalled();
  });

  it("closes a decoded bitmap when cancelled while decoding", async () => {
    const controller = new AbortController(), close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      controller.abort("REQUEST_CANCELLED: cancelled");
      return { width: 10, height: 10, close };
    }));
    await expect(prepareImage(new Blob(), DEFAULT_SETTINGS, controller.signal)).rejects.toThrow("REQUEST_CANCELLED");
    expect(close).toHaveBeenCalledOnce();
  });
});
