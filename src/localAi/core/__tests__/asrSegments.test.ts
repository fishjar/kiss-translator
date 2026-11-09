import { describe, expect, it } from "vitest";
import {
  buildWordSegments,
  groupWordsIntoSegments,
  joinWordsText,
} from "../asrSegments";

const w = (text: string, start: number, end: number) => ({
  text,
  timestamp: [start, end] as [number, number],
});

describe("joinWordsText", () => {
  it("CJK 相邻不加空格", () => {
    expect(joinWordsText(["购", "房", "者"])).toBe("购房者");
  });

  it("拉丁词之间加空格", () => {
    expect(joinWordsText(["Hello,", "world"])).toBe("Hello, world");
  });

  it("CJK 与拉丁边界不加空格", () => {
    expect(joinWordsText(["AI", "模", "型", "v2"])).toBe("AI模型v2");
  });
});

describe("groupWordsIntoSegments", () => {
  it("间隙超过阈值切成两段", () => {
    const segs = groupWordsIntoSegments(
      [w("hello", 0, 0.5), w("world", 0.5, 1.0), w("again", 2.0, 2.5)],
      3
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ start: 0, end: 1 });
    expect(segs[1]).toMatchObject({ start: 2, end: 2.5 });
    expect(segs[1]!.words).toHaveLength(1);
  });

  it("间隙低于阈值不分段", () => {
    const segs = groupWordsIntoSegments(
      [w("a", 0, 0.2), w("b", 0.6, 0.8)],
      2
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.words).toHaveLength(2);
  });

  it("重叠词合并到当前段且 end 取最大", () => {
    const segs = groupWordsIntoSegments(
      [w("a", 0, 0.6), w("b", 0.5, 0.9)],
      2
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.end).toBe(0.9);
  });

  it("跳过无时间戳词；空输入返回空", () => {
    expect(groupWordsIntoSegments([], 1)).toEqual([]);
    expect(
      groupWordsIntoSegments([{ text: "x", timestamp: null }], 1)
    ).toEqual([]);
  });

  it("时间戳裁剪到音频时长内", () => {
    const segs = groupWordsIntoSegments([w("x", 2, 5)], 3);
    expect(segs[0]!.end).toBe(3);
    expect(segs[0]!.words[0]!.end).toBe(3);
  });
});

describe("标点感知分段", () => {
  it("日文句末「。」无条件断段（无需停顿）", () => {
    const segs = groupWordsIntoSegments(
      [
        w("早く", 0.26, 0.64),
        w("準備", 0.64, 1.0),
        w("して。", 1.0, 1.46),
        w("今日の", 1.6, 1.9),
        w("ピクニック、", 1.9, 2.5),
        w("公園の", 2.5, 3.0),
        w("取っておいたよ。", 3.1, 4.5),
      ],
      10
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]!.words.map((x) => x.text).join("")).toBe("早く準備して。");
    expect(segs[1]!.words.map((x) => x.text).join("")).toBe(
      "今日のピクニック、公園の取っておいたよ。"
    );
  });

  it("英文句末「.」断段", () => {
    const segs = groupWordsIntoSegments(
      [
        w("Hello", 0, 0.3),
        w("there.", 0.4, 0.8),
        w("How", 0.9, 1.2),
        w("are", 1.3, 1.5),
        w("you", 1.6, 1.8),
        w("today?", 1.9, 2.3),
      ],
      5
    );
    expect(segs.map((s) => s.words.length)).toEqual([2, 4]);
  });

  it("从句标点「、」：短段不断，达到 clauseSplitSeconds 才断", () => {
    const short = groupWordsIntoSegments(
      [w("a、", 0, 0.3), w("b", 0.4, 0.8)],
      2
    );
    expect(short).toHaveLength(1);

    const long = groupWordsIntoSegments(
      [
        w("a", 0, 0.3),
        w("b", 0.4, 0.7),
        w("c", 0.8, 1.1),
        w("d", 1.2, 1.5),
        w("e", 1.6, 1.9),
        w("f", 2.0, 2.3),
        w("g", 2.4, 2.7),
        w("h", 2.8, 3.1),
        w("i、", 3.2, 3.5),
        w("j", 3.6, 3.9),
      ],
      5,
      0.5,
      { clauseSplitSeconds: 3 }
    );
    expect(long).toHaveLength(2);
    expect(long[1]!.words).toHaveLength(1);
  });

  it("无标点且超过 maxSegmentSeconds 强制断段", () => {
    const segs = groupWordsIntoSegments(
      [
        w("a", 0, 0.3),
        w("b", 0.5, 0.8),
        w("c", 1.0, 1.3),
        w("d", 1.5, 1.8),
        w("e", 2.0, 2.3),
        w("f", 2.5, 2.8),
        w("g", 3.0, 3.3),
        w("h", 3.5, 3.8),
        w("i", 4.0, 4.3),
        w("j", 4.5, 4.8),
      ],
      6,
      0.5,
      { maxSegmentSeconds: 4, clauseSplitSeconds: 100 }
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]!.words).toHaveLength(9);
    expect(segs[1]!.words).toHaveLength(1);
  });

  it("独立标点 token：句末断段；句首标点不单独成段", () => {
    const segs = groupWordsIntoSegments(
      [
        w("して", 0, 0.3),
        w("。", 0.3, 0.5),
        w("次の", 0.6, 0.9),
        w("文。", 1.0, 1.4),
      ],
      5
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]!.words.map((x) => x.text).join("")).toBe("して。");

    const leading = groupWordsIntoSegments(
      [w("。", 0, 0.2), w("次の", 0.3, 0.6), w("文。", 0.7, 1.0)],
      5
    );
    expect(leading).toHaveLength(1);
    expect(leading[0]!.words).toHaveLength(3);
  });

  it("静音间隙分段行为保持不变", () => {
    const segs = groupWordsIntoSegments(
      [w("hello", 0, 0.5), w("world", 0.6, 1.0), w("again", 2.0, 2.5)],
      3
    );
    expect(segs).toHaveLength(2);
  });
});

describe("buildWordSegments", () => {
  it("中文词流拼成段且词时间戳保留", () => {
    const segs = buildWordSegments(
      [w("购", 0, 0.2), w("房", 0.2, 0.4), w("者", 0.4, 0.6)],
      1,
      "zh-hans"
    );
    expect(segs[0]!.text).toBe("购房者");
    expect(segs[0]!.start).toBe(0);
    expect(segs[0]!.end).toBe(0.6);
    expect(segs[0]!.language).toBe("zh-hans");
    expect(segs[0]!.words).toEqual([
      { text: "购", start: 0, end: 0.2 },
      { text: "房", start: 0.2, end: 0.4 },
      { text: "者", start: 0.4, end: 0.6 },
    ]);
  });

  it("长静音切出多段，id 顺序编号", () => {
    const segs = buildWordSegments(
      [w("a", 0, 0.3), w("b", 5, 5.3)],
      10,
      "english"
    );
    expect(segs.map((s) => s.id)).toEqual(["seg-0", "seg-1"]);
    expect(segs[0]!.text).toBe("a");
    expect(segs[1]!.text).toBe("b");
  });

  it("空词流返回空", () => {
    expect(buildWordSegments([], 1)).toEqual([]);
  });
});
