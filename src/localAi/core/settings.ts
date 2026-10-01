import type { Settings } from "./types";
import { DEFAULT_SETTINGS, INPUT_LIMIT_KEYS } from "./types";

const KEY = "kiss-ai-settings";

export function normalizeSettings(value: unknown): Settings {
  const s = (value ?? {}) as Partial<Settings> & { autoUnloadModels?: boolean };
  return {
    ...Object.fromEntries(INPUT_LIMIT_KEYS.map((key) => [key,
      Number.isSafeInteger(s[key]) && s[key]! > 0 ? s[key] : DEFAULT_SETTINGS[key],
    ])) as Pick<Settings, typeof INPUT_LIMIT_KEYS[number]>,
    mirror: isMirror(s.mirror) ? s.mirror : DEFAULT_SETTINGS.mirror,
    autoUnloadMinutes:
      Number.isSafeInteger(s.autoUnloadMinutes) && s.autoUnloadMinutes! >= 0
        ? s.autoUnloadMinutes!
        : s.autoUnloadModels === false
          ? 0
          : 10,
    exclusiveResourceMode: typeof s.exclusiveResourceMode === "boolean"
      ? s.exclusiveResourceMode
      : DEFAULT_SETTINGS.exclusiveResourceMode,
    residentMemoryBudgetMB: Number.isSafeInteger(s.residentMemoryBudgetMB) && s.residentMemoryBudgetMB! >= 0 ? s.residentMemoryBudgetMB! : 0,
  };
}

function isMirror(v: unknown): v is Settings["mirror"] {
  return v === "hf-mirror" || v === "huggingface" || v === "modelscope";
}

function extLocal() {
  const g = globalThis as {
    chrome?: {
      runtime?: {
        id?: string;
        sendMessage: (message: unknown) => Promise<Record<string, unknown>>;
      };
      storage?: {
        local?: {
          get: (key: string) => Promise<Record<string, unknown>>;
          set: (obj: Record<string, unknown>) => Promise<void>;
        };
      };
    };
  };
  if (g.chrome?.storage?.local) return g.chrome.storage.local;
  const runtime = g.chrome?.runtime;
  if (!runtime?.id) return null;
  // Offscreen 只开放 runtime API，持久化通过项目现有的后台消息协议。
  return {
    get: (_key: string) => runtime.sendMessage({ action: "local_ai_settings", args: { action: "get" } }),
    set: (data: Record<string, unknown>) => runtime.sendMessage({ action: "local_ai_settings", args: { action: "set", value: data[KEY] } }).then(() => undefined),
  };
}

export async function loadSettings(): Promise<Settings> {
  const ext = extLocal();
  if (ext) {
    try {
      const data = await ext.get(KEY);
      const s = data[KEY] as Partial<Settings> | undefined;
      if (s) return normalizeSettings(s);
    } catch {
      // 存储读取失败时用默认值
    }
  }
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return normalizeSettings(s);
    }
  } catch {
    // 忽略解析错误
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const ext = extLocal();
  if (ext) {
    try {
      await ext.set({ [KEY]: settings });
      return;
    } catch (error) {
      throw new Error(`设置保存失败: ${String(error)}`);
    }
  }
  try {
    if (!globalThis.localStorage) throw new Error("存储不可用");
    globalThis.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (error) {
    throw new Error(`设置保存失败: ${String(error)}`);
  }
}
