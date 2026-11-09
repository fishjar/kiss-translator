// 跨 Tab 结果共享：ASR/OCR/LLM 产出文本后写入，供「朗读」等 Tab 取用。
export type ShareKey = "asr" | "ocr" | "llm";

export interface ShareEntry {
  text: string;
  at: number;
}

const entries: Record<ShareKey, ShareEntry | null> = {
  asr: null,
  ocr: null,
  llm: null,
};

const listeners = new Set<() => void>();

export function setShared(key: ShareKey, text: string): void {
  if (!text.trim()) return;
  entries[key] = { text, at: Date.now() };
  for (const l of listeners) l();
}

export function getShared(key: ShareKey): ShareEntry | null {
  return entries[key];
}

export function onShared(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
