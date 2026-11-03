import { cropAndCompressImage, readImageAsBlob } from "./imageReader";
import { sendBgMsg } from "../msg";

jest.mock("../msg", () => ({
  sendBgMsg: jest.fn(),
}));

describe("imageReader", () => {
  beforeEach(() => {
    // Mock HTMLCanvasElement.prototype.getContext and toBlob
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: jest.fn(),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    }));

    HTMLCanvasElement.prototype.toBlob = jest.fn(function (cb, type) {
      cb(new Blob(["mock-bytes"], { type: type || "image/png" }));
    });
  });

  test("cropAndCompressImage scales down when image exceeds maxEdge", async () => {
    const mockImage = {
      naturalWidth: 4000,
      naturalHeight: 2000,
      width: 4000,
      height: 2000,
    };

    const result = await cropAndCompressImage(mockImage, { maxEdge: 2048 });
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1024);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  test("cropAndCompressImage preserves smaller dimensions within maxEdge", async () => {
    const mockImage = {
      naturalWidth: 800,
      naturalHeight: 600,
      width: 800,
      height: 600,
    };

    const result = await cropAndCompressImage(mockImage, { maxEdge: 2048 });
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  test("cropAndCompressImage correctly crops rectangle with coordinates and dpr", async () => {
    const mockSource = {
      width: 1920,
      height: 1080,
    };

    const result = await cropAndCompressImage(mockSource, {
      x: 100,
      y: 50,
      width: 400,
      height: 300,
      dpr: 2,
      maxEdge: 2048,
    });

    // 400 * 2 = 800, 300 * 2 = 600
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  test("readImageAsBlob throws error when img is missing or invalid", async () => {
    await expect(readImageAsBlob(null)).rejects.toThrow("无效的图片元素");
  });

  test("download reads preserve natural size while recognition still scales down", async () => {
    const img = { naturalWidth: 4096, naturalHeight: 3072 };
    expect(await readImageAsBlob(img)).toMatchObject({
      width: 2048,
      height: 1536,
    });
    expect(await readImageAsBlob(img, { maxEdge: Infinity })).toMatchObject({
      width: 4096,
      height: 3072,
    });
  });

  test("readImageAsBlob successfully extracts blob from valid img", async () => {
    const mockImg = {
      naturalWidth: 500,
      naturalHeight: 300,
      width: 500,
      height: 300,
      currentSrc: "https://example.com/photo.png",
    };

    const result = await readImageAsBlob(mockImg);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.width).toBe(500);
  });

  test("readImageAsBlob falls back to MSG_FETCH base64 string when canvas is tainted and direct fetch fails", async () => {
    // 模拟 Canvas 被跨域污染：直接绘制外部图片元素时抛出 SecurityError，绘制已转换为 Blob 的 ImageBitmap 时正常
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: jest.fn((source) => {
        if (source === mockImg) {
          throw new Error("SecurityError: Tainted canvas");
        }
      }),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    }));

    // 模拟直接 fetch 报跨域错误
    const originalFetch = global.fetch;
    global.fetch = jest.fn((url) => {
      if (typeof url === "string" && url.startsWith("https://")) {
        return Promise.reject(new Error("CORS blocked"));
      }
      // 对于 data:URL 的内部 fetch
      return Promise.resolve({
        ok: true,
        blob: () =>
          Promise.resolve(new Blob(["mock-bytes"], { type: "image/png" })),
      });
    });

    sendBgMsg.mockResolvedValueOnce(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    );

    const mockImg = {
      naturalWidth: 100,
      naturalHeight: 100,
      width: 100,
      height: 100,
      currentSrc: "https://cross-origin.com/tainted.png",
    };

    const originalCreateImageBitmap = global.createImageBitmap;
    global.createImageBitmap = jest.fn(async () => ({
      width: 100,
      height: 100,
      close: jest.fn(),
    }));

    try {
      const result = await readImageAsBlob(mockImg);
      expect(result.blob).toBeInstanceOf(Blob);
      expect(sendBgMsg).toHaveBeenCalledWith(
        "kiss_fetch",
        expect.objectContaining({
          input: "https://cross-origin.com/tainted.png",
        })
      );
    } finally {
      global.fetch = originalFetch;
      global.createImageBitmap = originalCreateImageBitmap;
    }
  });

  describe.each([
    ["data URL", "data:image/png;base64,AA==", false],
    ["blob URL", "blob:https://example.com/image", false],
    ["direct fetch", "https://example.com/image.png", false],
    ["background proxy", "https://example.com/image.png", true],
  ])("bitmap lifecycle via %s", (_label, src, useProxy) => {
    let originalFetch;
    let originalCreateImageBitmap;
    let bitmap;
    let img;
    let blob;

    beforeEach(() => {
      originalFetch = global.fetch;
      originalCreateImageBitmap = global.createImageBitmap;
      blob = new Blob(["image"], { type: "image/png" });
      img = { naturalWidth: 100, naturalHeight: 100, currentSrc: src };
      bitmap = { width: 100, height: 100, close: jest.fn() };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: async () => blob,
      });
      if (useProxy) {
        global.fetch.mockRejectedValue(new Error("CORS blocked"));
      }
      global.createImageBitmap = jest.fn().mockResolvedValue(bitmap);
      sendBgMsg.mockReset();
      sendBgMsg.mockResolvedValue(blob);
      HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
        drawImage: jest.fn((source) => {
          if (source === img) throw new Error("Tainted canvas");
        }),
      }));
    });

    afterEach(() => {
      global.fetch = originalFetch;
      global.createImageBitmap = originalCreateImageBitmap;
      sendBgMsg.mockReset();
    });

    test("preserves download dimensions through the bitmap fallback", async () => {
      bitmap.width = 4096;
      bitmap.height = 3072;
      expect(await readImageAsBlob(img, { maxEdge: Infinity })).toMatchObject({
        width: 4096,
        height: 3072,
      });
      expect(bitmap.close).toHaveBeenCalledTimes(1);
    });

    test.each([true, false])(
      "closes once after asynchronous export settles (success=%s)",
      async (success) => {
        let finishExport;
        let notifyExportStarted;
        const exportStarted = new Promise((resolve) => {
          notifyExportStarted = resolve;
        });
        HTMLCanvasElement.prototype.toBlob = jest.fn((callback) => {
          finishExport = callback;
          notifyExportStarted();
        });
        // Prevent a failed direct export from creating a second bitmap via proxy.
        if (!useProxy)
          sendBgMsg.mockRejectedValue(new Error("Proxy unavailable"));

        const pending = readImageAsBlob(img);
        const assertion = success
          ? expect(pending).resolves.toEqual({ blob, width: 100, height: 100 })
          : expect(pending).rejects.toThrow("当前图片读取受限，请使用截图翻译");
        await exportStarted;
        expect(bitmap.close).not.toHaveBeenCalled();

        finishExport(success ? blob : null);
        await assertion;
        expect(bitmap.close).toHaveBeenCalledTimes(1);
        expect(global.createImageBitmap).toHaveBeenCalledTimes(1);
      }
    );

    test("preserves decode failure handling and direct-fetch fallback", async () => {
      global.createImageBitmap.mockRejectedValueOnce(
        new Error("Decode failed")
      );

      if (!useProxy && src.startsWith("https:")) {
        await expect(readImageAsBlob(img)).resolves.toEqual({
          blob: expect.any(Blob),
          width: 100,
          height: 100,
        });
        expect(sendBgMsg).toHaveBeenCalledTimes(1);
        expect(global.createImageBitmap).toHaveBeenCalledTimes(2);
        expect(bitmap.close).toHaveBeenCalledTimes(1);
      } else {
        await expect(readImageAsBlob(img)).rejects.toThrow(
          "当前图片读取受限，请使用截图翻译"
        );
        expect(bitmap.close).not.toHaveBeenCalled();
        expect(global.createImageBitmap).toHaveBeenCalledTimes(1);
        expect(sendBgMsg).toHaveBeenCalledTimes(useProxy ? 1 : 0);
      }
    });
  });
});
