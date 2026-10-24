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
      expect(panelCursor("ns")).toBe("ns-resize");
      expect(panelCursor("s")).toBe("row-resize");
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

  // PR 审查 E2（2026-10-24）：字面量锁定——各键位图值互异（防止 base64
  // 在键间串位仍绿）且每键携带自己的回退关键字；关键字表与回退映射一致。
  // 注意：ns 为 s 的别名键（同字形、回退 ns-resize），互异性按「完整值
  // （payload+回退）」判定而非裸 payload。
  test("locks the direction bitmap table against cross-key payload swaps", () => {
    const keys = ["n", "ne", "e", "se", "s", "ns", "sw", "w", "nw", "move"];
    const values = new Set();
    for (const key of keys) {
      const value = PANEL_BITMAP_CURSORS[key];
      expect(value).toMatch(
        /^url\(data:image\/png;base64,[A-Za-z0-9+/]+=*\) 16 16, /
      );
      const fallback = value.slice(value.lastIndexOf(", ") + 2);
      expect(fallback).toBe(PANEL_KEYWORD_CURSORS[key]);
      values.add(value);
    }
    expect(values.size).toBe(keys.length);
    // ns 与 s 共用同一字形 base64（别名键），仅回退关键字不同。
    expect(
      PANEL_BITMAP_CURSORS.ns.slice(0, PANEL_BITMAP_CURSORS.ns.lastIndexOf(","))
    ).toBe(
      PANEL_BITMAP_CURSORS.s.slice(0, PANEL_BITMAP_CURSORS.s.lastIndexOf(","))
    );
  });

  // PR 审查 r3（2026-10-24）：互异性检查无法发现「两个方向的 payload 互
  // 相交换」（互换后集合大小不变）。补方向↔内容对应校验：解码每键位图的
  // 白色像素，断言其质心朝向与方向键一致。期望朝向由设计规范推导（字形 =
  // 微尖折角 + 长线 + 短线朝该方向递进，白色笔画质心偏向尖端一侧；move 为
  // 四角向心、居中对称），非实现输出。
  test("anchors each direction bitmap to its pointing direction", () => {
    const zlib = require("zlib");
    const SIZE = 32;

    function whiteCentroid(base64) {
      const buf = Buffer.from(base64, "base64");
      let off = 8;
      const idat = [];
      while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString("ascii", off + 4, off + 8);
        if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
        off += 12 + len;
      }
      const raw = zlib.inflateSync(Buffer.concat(idat));
      const stride = SIZE * 4 + 1;
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (let y = 0; y < SIZE; y += 1) {
        // 生成器仅使用 filter 0（无滤波）行；其他 filter 出现即失败。
        expect(raw[y * stride]).toBe(0);
        for (let x = 0; x < SIZE; x += 1) {
          const i = y * stride + 1 + x * 4;
          if (
            raw[i] === 255 &&
            raw[i + 1] === 255 &&
            raw[i + 2] === 255 &&
            raw[i + 3] === 255
          ) {
            sx += x;
            sy += y;
            count += 1;
          }
        }
      }
      expect(count).toBeGreaterThan(0);
      return { cx: sx / count, cy: sy / count, count };
    }

    function payloadOf(key) {
      const value = PANEL_BITMAP_CURSORS[key];
      return value.slice(
        value.indexOf("base64,") + 7,
        value.indexOf(") 16 16")
      );
    }

    // 期望朝向（规范推导）：单向手柄质心偏向尖端一侧；move 居中。
    const EXPECT = {
      n: { cx: "=", cy: "<" },
      s: { cx: "=", cy: ">" },
      e: { cx: ">", cy: "=" },
      w: { cx: "<", cy: "=" },
      ne: { cx: ">", cy: "<" },
      nw: { cx: "<", cy: "<" },
      se: { cx: ">", cy: ">" },
      sw: { cx: "<", cy: ">" },
      move: { cx: "=", cy: "=" },
    };

    for (const [key, exp] of Object.entries(EXPECT)) {
      const { cx, cy } = whiteCentroid(payloadOf(key));
      // 画面中心为 (15.5, 15.5)；单向质心偏移约 2.5~3.6px，阈值留足余量。
      if (exp.cx === "<") expect(cx).toBeLessThan(14.5);
      if (exp.cx === ">") expect(cx).toBeGreaterThan(16.5);
      if (exp.cy === "<") expect(cy).toBeLessThan(14.5);
      if (exp.cy === ">") expect(cy).toBeGreaterThan(16.5);
      if (exp.cx === "=") expect(Math.abs(cx - 15.5)).toBeLessThan(2);
      if (exp.cy === "=") expect(Math.abs(cy - 15.5)).toBeLessThan(2);
    }
  });
});
