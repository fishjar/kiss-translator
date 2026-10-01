import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "../settings";
import { DEFAULT_SETTINGS } from "../types";

afterEach(() => vi.unstubAllGlobals());

describe("extension settings storage", () => {
  it("uses the background bridge in Offscreen and keeps the saved budget", async () => {
    let persisted: any = { "kiss-ai-settings": { autoUnloadModels: false, residentMemoryBudgetMB: 4096 } };
    const sendMessage = vi.fn(async ({ action, args }) => {
      expect(action).toBe("local_ai_settings");
      if (args.action === "get") return persisted;
      persisted = { "kiss-ai-settings": args.value };
      return {};
    });
    vi.stubGlobal("chrome", { runtime: { id: "extension", sendMessage } });
    expect(await loadSettings()).toMatchObject({ autoUnloadMinutes: 0, residentMemoryBudgetMB: 4096 });
    await saveSettings({ ...DEFAULT_SETTINGS, residentMemoryBudgetMB: 2048 });
    expect(await loadSettings()).toMatchObject({ residentMemoryBudgetMB: 2048 });
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("does not report a failed background write as successful", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension", sendMessage: vi.fn(async () => { throw Error("storage failed"); }) } });
    await expect(saveSettings(DEFAULT_SETTINGS)).rejects.toThrow("storage failed");
  });
});
