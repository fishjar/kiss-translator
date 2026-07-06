import { createSubtitleIndexAligner } from "./subtitleIndexAlign";

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
