import {
  PANEL_BITMAP_CURSORS,
  PANEL_KEYWORD_CURSORS,
  panelCursor,
  resolvePanelCursors,
} from "./cursors";

// navigator 属性补丁：userAgentData 在 jsdom 中不存在（仅 Chromium 系
// 提供），platform/userAgent 按用例覆盖，用后一律还原，不污染其他用例。
function patchNavigator(props) {
  const originals = new Map();
  for (const [key, value] of Object.entries(props)) {
    originals.set(key, {
      had: Object.prototype.hasOwnProperty.call(navigator, key),
      descriptor: Object.getOwnPropertyDescriptor(navigator, key),
    });
    Object.defineProperty(window.navigator, key, {
      configurable: true,
      value,
    });
  }
  return () => {
    for (const [key, record] of originals) {
      if (record.had) {
        Object.defineProperty(window.navigator, key, record.descriptor);
      } else {
        delete window.navigator[key];
      }
    }
  };
}

describe("resolvePanelCursors platform gating", () => {
  // 分支一：Windows UA-CH（Chromium 系）→ 位图表。
  test("returns the bitmap table for Windows UA-CH (Chromium)", () => {
    const restore = patchNavigator({ userAgentData: { platform: "Windows" } });
    try {
      expect(resolvePanelCursors()).toBe(PANEL_BITMAP_CURSORS);
      expect(panelCursor("nw")).toBe(PANEL_BITMAP_CURSORS.nw);
    } finally {
      restore();
    }
  });

  // 分支二：macOS UA-CH → 关键字表（macOS/Linux 一律不启用位图）。
  test("returns the keyword table for macOS UA-CH", () => {
    const restore = patchNavigator({ userAgentData: { platform: "macOS" } });
    try {
      expect(resolvePanelCursors()).toBe(PANEL_KEYWORD_CURSORS);
      expect(panelCursor("nw")).toBe("nw-resize");
    } finally {
      restore();
    }
  });

  // 分支三：Windows 上的 Firefox（无 UA-CH，platform=Win32，UA 含 Firefox
  // 不含 Chrome）→ 关键字表（回退判据的 UA 条件排除 Firefox）。
  test("returns the keyword table for Firefox on Windows (no UA-CH, UA without Chrome)", () => {
    const restore = patchNavigator({
      platform: "Win32",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    });
    try {
      expect(resolvePanelCursors()).toBe(PANEL_KEYWORD_CURSORS);
      expect(panelCursor("s")).toBe("ns-resize");
    } finally {
      restore();
    }
  });

  // 分支四：老 Chromium 回退（无 UA-CH，platform=Win32，UA 含 Chrome，
  // Edge 的 UA 同样含 Chrome 一并覆盖）→ 位图表。
  test("returns the bitmap table for legacy Chromium on Windows (no UA-CH, UA with Chrome)", () => {
    const restore = patchNavigator({
      platform: "Win32",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    try {
      expect(resolvePanelCursors()).toBe(PANEL_BITMAP_CURSORS);
      expect(panelCursor("move")).toBe(PANEL_BITMAP_CURSORS.move);
    } finally {
      restore();
    }
  });

  // 非 Windows 默认环境（jsdom 现状：无 userAgentData，platform/UA 不满足
  // 回退判据）不变式：一律关键字表（改动前后都应通过）。
  test("returns the keyword table in the default jsdom environment", () => {
    expect(resolvePanelCursors()).toBe(PANEL_KEYWORD_CURSORS);
    expect(panelCursor("move")).toBe("move");
  });

  // PR 审查 E2（2026-10-24）：字面量锁定——九键位图值互异（防止 base64
  // 在键间串位仍绿）且每键携带自己的回退关键字；关键字表与回退映射一致。
  test("locks the 9-key bitmap table against cross-key payload swaps", () => {
    const keys = [
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
      "nw",
      "move",
    ];
    const payloads = new Set();
    for (const key of keys) {
      const value = PANEL_BITMAP_CURSORS[key];
      expect(value).toMatch(/^url\(data:image\/png;base64,[A-Za-z0-9+/]+=*\) 16 16, /);
      const fallback = value.slice(value.lastIndexOf(", ") + 2);
      expect(fallback).toBe(PANEL_KEYWORD_CURSORS[key]);
      payloads.add(value.slice(0, value.lastIndexOf(",")));
    }
    expect(payloads.size).toBe(keys.length);
  });
});
