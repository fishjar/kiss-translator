import {
  createSubtitleIndexAligner,
  reanchorIfUntrusted,
} from "./subtitleIndexAlign";

const wordEvents = (words) =>
  words.map((text, i) => ({ text, start: i * 1000, end: i * 1000 + 1000 }));

const seqWords = (n) => Array.from({ length: n }, (_, i) => `w${i}`);

describe("createSubtitleIndexAligner", () => {
  test("returns null when claimed range already matches o (fast path)", () => {
    const { realign } = createSubtitleIndexAligner(wordEvents(seqWords(50)));

    expect(realign(10, 14, "w10 w11 w12 w13 w14")).toBeNull();
  });

  test("corrects positive and negative drift", () => {
    const { realign } = createSubtitleIndexAligner(wordEvents(seqWords(50)));

    expect(realign(15, 19, "w10 w11 w12 w13 w14")).toEqual({
      startIdx: 10,
      endIdx: 14,
    });
    expect(realign(3, 7, "w15 w16 w17 w18 w19")).toEqual({
      startIdx: 15,
      endIdx: 19,
    });
  });

  test("corrects drift +20 inside window, returns null beyond window", () => {
    const { realign } = createSubtitleIndexAligner(wordEvents(seqWords(50)));

    expect(realign(30, 34, "w10 w11 w12 w13 w14")).toEqual({
      startIdx: 10,
      endIdx: 14,
    });
    expect(realign(45, 49, "w5 w6 w7 w8 w9")).toBeNull();
  });

  test("returns null for short o or empty events", () => {
    const { realign } = createSubtitleIndexAligner(wordEvents(seqWords(10)));
    const empty = createSubtitleIndexAligner([]);

    expect(realign(0, 0, "w0")).toBeNull();
    expect(realign(0, 1, "")).toBeNull();
    expect(empty.realign(0, 1, "w0 w1")).toBeNull();
  });

  test("normalizes case, punctuation, apostrophes, hyphens and numbers", () => {
    const punct = createSubtitleIndexAligner(
      wordEvents(["foo", "bar", "hello", "world", "baz", "qux"])
    );
    expect(punct.realign(0, 1, "Hello, WORLD!")).toEqual({
      startIdx: 2,
      endIdx: 3,
    });

    const apos = createSubtitleIndexAligner(
      wordEvents(["a", "b", "don't", "stop", "me", "now", "c", "d"])
    );
    expect(apos.realign(0, 2, "Don’t stop me")).toEqual({
      startIdx: 2,
      endIdx: 4,
    });

    const hyphen = createSubtitleIndexAligner(
      wordEvents(["it", "is", "well", "known", "that", "x"])
    );
    expect(hyphen.realign(0, 1, "well-known")).toEqual({
      startIdx: 2,
      endIdx: 3,
    });

    const nums = createSubtitleIndexAligner(
      wordEvents(["numbers", "are", "22,", "25,", "26,", "and", "29,", "ok"])
    );
    expect(nums.realign(0, 4, "22, 25, 26, and 29.")).toEqual({
      startIdx: 2,
      endIdx: 6,
    });
  });

  test("prefers the twin phrase nearest to claim, null when equidistant", () => {
    const phrase = ["the", "quick", "brown", "fox", "jumps"];
    const near = seqWords(50);
    near.splice(5, 5, ...phrase);
    near.splice(34, 5, ...phrase);
    const nearAligner = createSubtitleIndexAligner(wordEvents(near));
    expect(nearAligner.realign(7, 11, "the quick brown fox jumps")).toEqual({
      startIdx: 5,
      endIdx: 9,
    });

    const mid = seqWords(50);
    mid.splice(5, 5, ...phrase);
    mid.splice(35, 5, ...phrase);
    const midAligner = createSubtitleIndexAligner(wordEvents(mid));
    expect(midAligner.realign(20, 24, "the quick brown fox jumps")).toBeNull();
  });

  test("handles first word rewritten by model via offset probes", () => {
    const { realign } = createSubtitleIndexAligner(wordEvents(seqWords(30)));

    expect(realign(12, 16, "zzz w11 w12 w13 w14")).toEqual({
      startIdx: 10,
      endIdx: 14,
    });
    expect(realign(12, 16, "zzz w11 w12 w13 yyy")).toBeNull();
  });

  test("returns null when o spills past the table end (context leak)", () => {
    const { realign } = createSubtitleIndexAligner(wordEvents(seqWords(20)));

    expect(realign(15, 19, "w15 w16 w17 w18 w19 aaa bbb ccc")).toBeNull();
  });

  test("tail anchor refines endPos and endIdx never drops below startIdx", () => {
    const { realign } = createSubtitleIndexAligner(wordEvents(seqWords(30)));

    // o 中部多插一词：尾锚在 ±4 内命中，endIdx 收敛到 15 而非 16。
    expect(realign(13, 19, "w10 w11 w12 zzz w13 w14 w15")).toEqual({
      startIdx: 10,
      endIdx: 15,
    });
    // o 末尾少一词：唯一 offset-0 候选走兜底，endIdx 近似到 14。
    expect(realign(12, 17, "w10 w11 w12 w13 w15")).toEqual({
      startIdx: 10,
      endIdx: 14,
    });

    // 重复模式使尾锚落在起点之前：该尾锚被拒绝，唯一 offset-0 候选走词数兜底。
    const loop = createSubtitleIndexAligner(
      wordEvents(["b", "c", "d", "a", "b", "c", "x"])
    );
    expect(loop.realign(1, 4, "a b c d")).toEqual({ startIdx: 3, endIdx: 6 });
  });

  test("rejects two-word o when multiple candidates exist in window", () => {
    const words = seqWords(30);
    words.splice(8, 2, "in", "the");
    words.splice(20, 2, "in", "the");
    const { realign } = createSubtitleIndexAligner(wordEvents(words));

    expect(realign(12, 13, "in the")).toBeNull();
  });

  test("prefers exact-prefix candidate over a closer offset probe", () => {
    const words = seqWords(40);
    words.splice(18, 4, "b", "c", "d", "e");
    words.splice(25, 5, "a", "b", "c", "d", "e");
    const { realign } = createSubtitleIndexAligner(wordEvents(words));

    // offset-1 巧合（起点 17）离声称位置更近，但 offset-0 真句（起点 25）优先。
    expect(realign(19, 23, "a b c d e")).toEqual({ startIdx: 25, endIdx: 29 });
  });

  test("supports multi-word events at event granularity", () => {
    const events = [
      { text: "hello world how", start: 0, end: 3000 },
      { text: "are you", start: 3000, end: 5000 },
      { text: "doing today my friend", start: 5000, end: 9000 },
    ];
    const { realign } = createSubtitleIndexAligner(events);

    expect(realign(1, 2, "are you doing today my friend")).toBeNull();
    expect(realign(0, 1, "are you doing today my friend")).toEqual({
      startIdx: 1,
      endIdx: 2,
    });
  });

  test("forward-fills positions across symbol-only events", () => {
    const { realign } = createSubtitleIndexAligner(
      wordEvents(["hello", "♪♪", "world", "again", "fine"])
    );

    expect(realign(1, 2, "world again")).toEqual({ startIdx: 2, endIdx: 3 });
  });

  test("returns null for unsegmented CJK o", () => {
    const { realign } = createSubtitleIndexAligner(
      wordEvents(["你好", "世界", "朋友"])
    );

    expect(realign(0, 1, "你好世界")).toBeNull();
  });

  test("is deterministic across calls and instances", () => {
    const events = wordEvents(seqWords(50));
    const a = createSubtitleIndexAligner(events);
    const b = createSubtitleIndexAligner(events);
    const args = [15, 19, "w10 w11 w12 w13 w14"];

    const first = a.realign(...args);
    expect(a.realign(...args)).toEqual(first);
    expect(b.realign(...args)).toEqual(first);
  });
});

describe("reanchorIfUntrusted", () => {
  const words = (n, from = 0) =>
    Array.from({ length: n }, (_, i) => `w${from + i}`);
  const textOf = (from, len) => words(len, from).join(" ");
  const seg = (s, e, text) => ({ text, _si: s, _ei: e });
  // 持续压缩响应：每段 10 词只声称 7 个 id，比值 0.7，模拟长枚举计数崩坏。
  const compressed = (count) =>
    Array.from({ length: count }, (_, k) =>
      seg(7 * k, 7 * k + 6, textOf(k * 10, 10))
    );

  test("returns null for healthy responses and for tiny volume", () => {
    const events = wordEvents(words(400));
    const healthy = Array.from({ length: 40 }, (_, k) =>
      seg(k * 10, k * 10 + 9, textOf(k * 10, 10))
    );

    expect(reanchorIfUntrusted(healthy, events)).toBeNull();
    expect(reanchorIfUntrusted(healthy.slice(0, 8), events)).toBeNull();
  });

  test("returns null for episodic bounded drift (phase-1 territory)", () => {
    const events = wordEvents(words(200));
    const segs = Array.from({ length: 20 }, (_, k) =>
      seg(k * 10, k * 10 + 9, textOf(k * 10, 10))
    );
    segs[5] = seg(45, 54, textOf(50, 10));
    segs[6] = seg(65, 74, textOf(60, 10));

    expect(reanchorIfUntrusted(segs, events)).toBeNull();
  });

  test("re-anchors a sustained compressed response", () => {
    const events = wordEvents(words(400));
    const out = reanchorIfUntrusted(compressed(40), events);

    expect(out).toHaveLength(40);
    out.forEach((sub, k) => {
      expect(sub.start).toBe(k * 10 * 1000);
      expect(sub.end).toBe((k * 10 + 9) * 1000 + 1000);
      expect(sub._si).toBe(7 * k);
      expect(sub._aei).toBe(k * 10 + 9);
      expect(sub._reanchored).toBe(true);
    });
  });

  test("catches a degraded tail hidden by a healthy prefix", () => {
    const events = wordEvents(words(300));
    // 整体比值 0.85 恰好擦过整响应阈值，靠滑动窗口补位识别。
    const segs = Array.from({ length: 30 }, (_, k) =>
      k < 15
        ? seg(k * 10, k * 10 + 9, textOf(k * 10, 10))
        : seg(150 + 7 * (k - 15), 156 + 7 * (k - 15), textOf(k * 10, 10))
    );
    const out = reanchorIfUntrusted(segs, events);

    expect(out).not.toBeNull();
    expect(out[29].start).toBe(290 * 1000);
    expect(out[29]._reanchored).toBe(true);
  });

  test("returns null for unspaced CJK responses", () => {
    const events = wordEvents(words(200));
    const segs = Array.from({ length: 150 }, (_, k) =>
      seg(k, k, "这是一段没有空格的中文字幕文本")
    );

    expect(reanchorIfUntrusted(segs, events)).toBeNull();
  });

  test("a hallucinated segment misses without derailing the chain", () => {
    const events = wordEvents(words(200));
    const segs = compressed(20);
    segs[10] = seg(70, 76, "zzz yyy xxx qqq ppp");
    const out = reanchorIfUntrusted(segs, events);

    expect(out).not.toBeNull();
    expect(out[10]._reanchored).toBeUndefined();
    expect(out[11].start).toBe(110 * 1000);
    expect(out[11]._reanchored).toBe(true);
  });

  test("abandons after five consecutive misses and rejects the pass", () => {
    const events = wordEvents(words(300));
    const segs = compressed(30);
    for (let k = 10; k < 15; k++) {
      segs[k] = seg(7 * k, 7 * k + 6, `bad${k} bogus${k} nope${k} nah${k}`);
    }

    expect(reanchorIfUntrusted(segs, events)).toBeNull();
  });

  test("drops duplicate re-emissions overlapping the previous span", () => {
    const events = wordEvents(words(200));
    const segs = compressed(16);
    segs.splice(6, 0, seg(40, 46, textOf(52, 8)));
    const out = reanchorIfUntrusted(segs, events);

    expect(out).toHaveLength(16);
    expect(out[6].start).toBe(60 * 1000);
  });

  test("keeps a literally repeated back-to-back sentence", () => {
    const w = words(200);
    // 说话人原样重复上一句：词 60-69 与 50-59 完全相同。
    for (let i = 0; i < 10; i++) w[60 + i] = `w${50 + i}`;
    const events = wordEvents(w);
    const segs = compressed(20);
    segs[6] = seg(42, 48, textOf(50, 10));
    const out = reanchorIfUntrusted(segs, events);

    expect(out).toHaveLength(20);
    expect(out[5].start).toBe(50 * 1000);
    expect(out[6].start).toBe(60 * 1000);
    expect(out[6]._reanchored).toBe(true);
  });

  test("keeps a context-leak tail segment raw", () => {
    const events = wordEvents(words(160));
    const segs = compressed(16);
    segs.push(seg(112, 118, "aaa bbb ccc ddd eee"));
    const out = reanchorIfUntrusted(segs, events);

    expect(out).not.toBeNull();
    expect(out[16]._reanchored).toBeUndefined();
  });

  test("anchors drifted short interjections near the cursor", () => {
    const w = words(220);
    w[40] = "okay";
    const events = wordEvents(w);
    const txt = (a, len) => w.slice(a, a + len).join(" ");
    const segs = [];
    for (let k = 0; k < 4; k++) segs.push(seg(7 * k, 7 * k + 6, txt(k * 10, 10)));
    // 声称漂移到词 28（28s），真实位置在词 40（40s）。
    segs.push(seg(28, 28, "Okay."));
    for (let k = 4; k < 20; k++)
      segs.push(seg(7 * k, 7 * k + 6, txt(k * 10 + 1, 10)));
    const out = reanchorIfUntrusted(segs, events);

    const short = out.find((s) => s.text === "Okay.");
    expect(short.start).toBe(40 * 1000);
    expect(short._aei).toBe(40);
    expect(short._reanchored).toBe(true);
    expect(short._alo).toBe(0);
    expect(short._ahi).toBe(220 * 1000);
    expect(out[5].start).toBe(41 * 1000);
  });

  test("drops hallucinated shorts instead of emitting them raw", () => {
    const events = wordEvents(words(200));
    const segs = compressed(20);
    for (let k = 0; k < 6; k++) segs.splice(10, 0, seg(70, 70, "zzz"));
    const out = reanchorIfUntrusted(segs, events);

    expect(out).toHaveLength(20);
    expect(out.every((s) => s._reanchored)).toBe(true);
    // 连续被丢弃的短段不烧 miss 预算，后续句子照常锚定。
    expect(out[10].start).toBe(100 * 1000);
  });

  test("acceptance ignores dropped shorts in a chatty response", () => {
    const events = wordEvents(words(200));
    const segs = compressed(20);
    // 10 个幻觉短段：按旧分母 20/30 会低于验收线整体回退。
    for (let k = 0; k < 10; k++) segs.splice(2 * k, 0, seg(7 * k, 7 * k, "zzz"));
    const out = reanchorIfUntrusted(segs, events);

    expect(out).toHaveLength(20);
    expect(out.every((s) => s._reanchored)).toBe(true);
  });

  test("gate spacing guard uses word mass, not segment count", () => {
    const events = wordEvents(words(200));
    // 30/42 的段是单词感叹段：按段数统计分隔度不足 0.6，按词量 120/150 达标。
    const segs = compressed(12);
    for (let k = 0; k < 30; k++) segs.push(seg(84 + k, 84 + k, "zzz"));
    const out = reanchorIfUntrusted(segs, events);

    expect(out).toHaveLength(12);
    expect(out.every((s) => s._reanchored)).toBe(true);
  });

  test("prefers the sentence when a short re-emission shares its start", () => {
    const w = words(200);
    w[40] = "okay";
    const events = wordEvents(w);
    const txt = (a, len) => w.slice(a, a + len).join(" ");
    const segs = [];
    for (let k = 0; k < 4; k++) segs.push(seg(7 * k, 7 * k + 6, txt(k * 10, 10)));
    segs.push(seg(28, 28, "Okay."));
    segs.push(seg(29, 36, txt(40, 10)));
    for (let k = 5; k < 20; k++)
      segs.push(seg(7 * k, 7 * k + 6, txt(k * 10, 10)));
    const out = reanchorIfUntrusted(segs, events);

    expect(out).toHaveLength(20);
    expect(out.filter((s) => s.text === "Okay.")).toHaveLength(0);
    expect(out.find((s) => s.text === txt(40, 10)).start).toBe(40 * 1000);
  });

  test("drops ambiguous, distant or weak-probe shorts", () => {
    const build = (mutate, shortText = "Okay.") => {
      const w = words(200);
      mutate(w);
      const txt = (a, len) => w.slice(a, a + len).join(" ");
      const segs = [];
      for (let k = 0; k < 4; k++)
        segs.push(seg(7 * k, 7 * k + 6, txt(k * 10, 10)));
      segs.push(seg(28, 28, shortText));
      for (let k = 4; k < 20; k++)
        segs.push(seg(7 * k, 7 * k + 6, txt(k * 10, 10)));
      return reanchorIfUntrusted(segs, wordEvents(w));
    };

    // 游标两侧等距双候选：歧义丢弃。
    const ambiguous = build((w) => {
      w[38] = "okay";
      w[42] = "okay";
    });
    expect(ambiguous.filter((s) => s.text === "Okay.")).toHaveLength(0);

    // 唯一候选但离游标超出单词段可信距离：丢弃。
    const distant = build((w) => {
      w[55] = "okay";
    });
    expect(distant.filter((s) => s.text === "Okay.")).toHaveLength(0);

    // 一字母 token 探针过弱：即使近旁存在也丢弃。
    const weak = build((w) => {
      w[41] = "a";
    }, "A.");
    expect(weak.filter((s) => s.text === "A.")).toHaveLength(0);
    expect(weak).toHaveLength(20);
  });

  test("is deterministic", () => {
    const events = wordEvents(words(400));
    const segs = compressed(40);

    expect(reanchorIfUntrusted(segs, events)).toEqual(
      reanchorIfUntrusted(segs, events)
    );
  });
});
