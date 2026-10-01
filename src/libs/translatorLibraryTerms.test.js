// 术语库注入链路测试（M5 + M8）
//
// 验证「① 自定义 > ② 订阅 > ③ 规则」优先级链在**真实 Translator** 中生效。
// 这些测试锁定的关键风险：
//   - libraryTerms 缺省时行为与改造前完全一致（向后兼容回归锁）
//   - 术语库能被正确合成并产出替换
//   - 跨层覆盖不触发致命诊断
jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./browser", () => ({ isOptions: () => false }));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));
jest.mock("../apis", () => ({
  apiMicrosoftDict: jest.fn(),
  apiTranslate: jest.fn(),
  apiYoudaoDict: jest.fn(),
}));

import { Translator } from "./translator";

// 浏览器 API 桩：Translator 构造会创建 IntersectionObserver / 读取 CSSStyleSheet
// （与 src/libs/translator.test.js:315-374 的做法一致）。
let originalIntersectionObserver;
let originalCSSStyleSheet;

beforeAll(() => {
  originalIntersectionObserver = global.IntersectionObserver;
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  originalCSSStyleSheet = global.CSSStyleSheet;
  global.CSSStyleSheet = class {
    replaceSync() {}
    insertRule() {
      return 0;
    }
  };
});

afterAll(() => {
  global.IntersectionObserver = originalIntersectionObserver;
  global.CSSStyleSheet = originalCSSStyleSheet;
});

const makeTranslator = (rule = {}, libraryTerms) =>
  new Translator({
    rule: { pattern: "*", ...rule },
    setting: {},
    favWords: [],
    ...(libraryTerms ? { libraryTerms } : {}),
  });

/** 通过内部方法取合成结果（避免依赖 DOM 序列化链路） */
const composedOf = (t) => t.composedTermText;
const entriesOf = (t) => t.termEntries;

describe("向后兼容：不传 libraryTerms 时行为不变", () => {
  test("仅有 rule.terms 时正常解析", () => {
    const t = makeTranslator({ terms: "API,接口;APIKey,应用编程接口" });
    expect(entriesOf(t).map((e) => e.key)).toEqual(["APIKey", "API"]);
    expect(composedOf(t)).toBe("API,接口\nAPIKey,应用编程接口");
  });

  test("什么都不传时术语为空且不抛错", () => {
    const t = makeTranslator();
    expect(entriesOf(t)).toEqual([]);
    expect(composedOf(t)).toBe("");
  });

  test("libraryTerms 传空对象等同不传", () => {
    const a = makeTranslator({ terms: "API,接口" }, {});
    const b = makeTranslator({ terms: "API,接口" });
    expect(composedOf(a)).toBe(composedOf(b));
  });

  test("libraryTerms 传非法值（null/数字）安全降级", () => {
    const t = new Translator({
      rule: { pattern: "*", terms: "API,接口" },
      setting: {},
      favWords: [],
      libraryTerms: { custom: null, subscription: 123 },
    });
    expect(composedOf(t)).toBe("API,接口");
  });
});

describe("优先级链：custom > subscription > rule", () => {
  test("custom 覆盖 rule 的同名术语", () => {
    const t = makeTranslator(
      { terms: "Cheeta,猎豹" },
      { custom: "Cheeta,齐塔", subscription: "" }
    );
    const entries = entriesOf(t);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("齐塔");
  });

  test("subscription 覆盖 rule", () => {
    const t = makeTranslator(
      { terms: "API,规则值" },
      { custom: "", subscription: "API,订阅值" }
    );
    expect(entriesOf(t)[0].value).toBe("订阅值");
  });

  test("custom 覆盖 subscription", () => {
    const t = makeTranslator(
      {},
      { custom: "X,自定义", subscription: "X,订阅" }
    );
    expect(entriesOf(t)[0].value).toBe("自定义");
  });

  test("三层同 key 时 custom 最终胜出", () => {
    const t = makeTranslator(
      { terms: "A,规则" },
      { custom: "A,自定义", subscription: "A,订阅" }
    );
    expect(entriesOf(t)).toHaveLength(1);
    expect(entriesOf(t)[0].value).toBe("自定义");
  });

  test("三层不同 key 全部保留（叠加语义）", () => {
    const t = makeTranslator(
      { terms: "R,规则" },
      { custom: "C,自定义", subscription: "S,订阅" }
    );
    expect(entriesOf(t)).toHaveLength(3);
  });
});

describe("跨层覆盖不产生致命诊断（方案 A 的核心收益）", () => {
  test("跨层同名不同译时术语仍可用", () => {
    const t = makeTranslator(
      { terms: "Cheeta,猎豹" },
      { custom: "Cheeta,齐塔", subscription: "" }
    );
    // 若走方案 B（不预去重），parseTerms 会判 conflicting-mapping，
    // 但合法项仍会被保留——这里断言最终只留下一条且是高优先级的
    expect(entriesOf(t)).toHaveLength(1);
    expect(entriesOf(t)[0].value).toBe("齐塔");
  });

  test("同层内冲突仍按引擎语义处理（保留首条）", () => {
    const t = makeTranslator({ terms: "X,一;X,二" });
    expect(entriesOf(t)).toHaveLength(1);
    expect(entriesOf(t)[0].value).toBe("一");
  });
});

describe("热更新：terms 变更时重解析", () => {
  test("updateRule 带 terms 时刷新技术库合成", () => {
    const t = makeTranslator(
      { terms: "A,规则" },
      { custom: "C,自定义", subscription: "" }
    );
    expect(entriesOf(t)).toHaveLength(2);

    t.updateRule({ pattern: "*", terms: "B,新规则" });
    const keys = entriesOf(t).map((e) => e.key).sort();
    expect(keys).toEqual(["B", "C"]);
  });
});

describe("分桶 matcher 已接入 Translator", () => {
  test("大规模术语时使用分桶 matcher", () => {
    const many = Array.from({ length: 200 }, (_, i) => `k${i},值${i}`).join(";");
    const t = makeTranslator(
      {},
      { custom: many, subscription: "" }
    );
    expect(entriesOf(t)).toHaveLength(200);
    // matcher 由 buildTermsMatcherForLibrary 产出；200 > 阈值 64 故应为分桶
    expect(t.termMatcher?.bucketed).toBe(true);
  });

  test("小规模术语使用未分桶 matcher（结构更简单）", () => {
    const t = makeTranslator({}, { custom: "API,接口" });
    expect(t.termMatcher?.bucketed).toBeUndefined();
  });
});
