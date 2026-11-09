import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../types";
import { validateInputFile } from "../inputFiles";
import { decodeAudioFile } from "../recorder";
import { runtimeHost } from "../../runtime/runtimeHostAdapter";

vi.mock("../../runtime/runtimeHostAdapter", () => ({ runtimeHost: { request: vi.fn() } }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("file input preflight", () => {
  it("checks host settings before any oversized audio decoding or reading", async () => {
    vi.mocked(runtimeHost.request).mockResolvedValue(DEFAULT_SETTINGS);
    const read = vi.fn(), context = vi.fn();
    vi.stubGlobal("AudioContext", context);
    const file = { size: 50 * 1024 ** 2 + 1, arrayBuffer: read } as unknown as File;
    await expect(decodeAudioFile(file)).rejects.toThrow("INPUT_LIMIT_EXCEEDED");
    expect(read).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
  });
  it("uses current shared settings and forwards cancellation", async () => {
    vi.mocked(runtimeHost.request).mockResolvedValue({ ...DEFAULT_SETTINGS, maxImageFileMB: 1 });
    const signal = new AbortController().signal;
    const file = { size: 1024 ** 2 + 1 } as Blob;
    await expect(validateInputFile(file, "image", signal)).rejects.toThrow("INPUT_LIMIT_EXCEEDED");
    expect(runtimeHost.request).toHaveBeenCalledWith(expect.objectContaining({ service: "runtime", method: "getSettings" }), { signal });
  });
  it("does not claim input is valid if settings cannot be read", async () => {
    vi.mocked(runtimeHost.request).mockRejectedValue(new Error("HOST_CLOSED"));
    await expect(validateInputFile(new Blob(), "image")).rejects.toThrow("HOST_CLOSED");
  });
});
