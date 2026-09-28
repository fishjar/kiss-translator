import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const KEY = "kiss-ai-settings";

function isMirror(v: unknown): v is Settings["mirror"] {
  return v === "hf-mirror" || v === "huggingface" || v === "modelscope";
}

function extLocal() {
  const g = globalThis as {
    chrome?: {
      storage?: {
        local?: {
          get: (key: string) => Promise<Record<string, unknown>>;
          set: (obj: Record<string, unknown>) => Promise<void>;
        };
      };
    };
  };
  return g.chrome?.storage?.local ?? null;
}

export async function loadSettings(): Promise<Settings> {
  const ext = extLocal();
  if (ext) {
    try {
      const data = await ext.get(KEY);
      const s = data[KEY] as Partial<Settings> | undefined;
      if (s && isMirror(s.mirror)) return { ...DEFAULT_SETTINGS, ...s };
    } catch {
      // 存储读取失败时用默认值
    }
  }
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      if (isMirror(s.mirror)) return { ...DEFAULT_SETTINGS, ...s };
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
    } catch {
      // 回落到 localStorage
    }
  }
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 存储不可用时忽略
  }
}
