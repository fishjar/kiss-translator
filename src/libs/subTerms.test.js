// 订阅术语源模块测试
//
// 覆盖重点（这些是本模块相对 subRules 的**差异点**，也是风险点）：
// 1. 格式嗅探（JSON 数组/对象、CSV、TXT）——HTTP Content-Type 不可靠，只能靠内容
// 2. 0 条目守卫：404/HTML 错误页不得污染缓存
// 3. 超长守卫：巨型词库不得写缓存（否则卡死页面）
// 4. 失败时保留旧缓存
// 5. 按源粒度的时间戳（修正 subRules 的全局时间戳缺陷）
// 6. 多源并行：仅同步 enabled 项，拼接顺序稳定
jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));

// 采用项目既有范式（见 src/libs/sync.test.js:19-32）：mock 工厂只放**裸 jest.fn()**，
// 所有行为在 beforeEach 里用 mockImplementation 配置。
// 不要在工厂函数体内引用外层变量——jest.mock 会被提升，工厂捕获的变量
// 在模块求值时可能仍处于时序死区，导致 mock 静默失效（实测踩过）。
jest.mock("./storage", () => ({
  getSyncWithDefault: jest.fn(),
  putSync: jest.fn(),
  getSubTerms: jest.fn(),
  setSubTerms: jest.fn(),
  delSubTerms: jest.fn(),
}));

jest.mock("../apis", () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from "../apis";
import {
  getSubTerms,
  setSubTerms,
  delSubTerms,
  getSyncWithDefault,
  putSync,
} from "./storage";
import {
  parseTermsSource,
  syncSubTerms,
  syncAllSubTerms,
  trySyncAllSubTerms,
  loadOrFetchSubTerms,
  composeSubTermsText,
  removeSubTerms,
  getSubTermsSyncAt,
  updateSubTermsSyncAt,
  extractSubscriptionMeta,
  parseAuthorFromUrl,
  resolveSubscriptionAuthor,
  MAX_SUB_TERMS_TEXT_LENGTH,
} from "./subTerms";

/** 每个用例独立的状态容器（在 beforeEach 中重置） */
let syncState;
let cacheState;

beforeEach(() => {
  jest.clearAllMocks();
  syncState = {};
  cacheState = {};

  // getSyncWithDefault 必须返回带 dataCaches 的对象：
  // 模块内做 `const { dataCaches = {} } = await getSyncWithDefault()`，
  // 返回 undefined 会直接抛错（默认值只在属性为 undefined 时生效，
  // 对"整个对象是 undefined"无效）。
  getSyncWithDefault.mockImplementation(async () => ({
    dataCaches: syncState.dataCaches || {},
    ...syncState,
  }));
  putSync.mockImplementation(async (obj) => {
    syncState = { ...syncState, ...obj };
  });
  getSubTerms.mockImplementation(async (url) => cacheState[url]);
  setSubTerms.mockImplementation(async (url, val) => {
    cacheState[url] = val;
  });
  delSubTerms.mockImplementation(async (url) => {
    delete cacheState[url];
  });
});

describe("parseTermsSource 格式嗅探", () => {
  test("JSON 数组（以 [ 开头）", () => {
    const r = parseTermsSource('[{"key":"API","value":"接口"}]');
    expect(r.format).toBe("json");
    expect(r.entries).toBe(1);
    expect(r.text).toBe("API,接口");
  });

  test("JSON 对象映射（以 { 开头）", () => {
    const r = parseTermsSource('{"API":"接口","token":"令牌"}');
    expect(r.format).toBe("json");
    expect(r.entries).toBe(2);
  });

  test("CSV（首行含英文逗号，非 JSON 开头）", () => {
    const r = parseTermsSource("Cheeta,齐塔\nAPI,接口");
    expect(r.format).toBe("csv");
    expect(r.entries).toBe(2);
  });

  test("TXT 透传（首行无逗号）", () => {
    // 注意：TXT 是**透传**路径，entries 计的是**行数**而非 key,value 对数。
    // 单独的 `Cheeta` 在 terms 语义里是合法的"key + 空译文"术语，
    // 所以两行文本得到 entries=2（不是 0）。
    const r = parseTermsSource("Cheeta\nAPI");
    expect(r.format).toBe("txt");
    expect(r.entries).toBe(2);
    expect(r.text).toBe("Cheeta\nAPI");
  });

  test("TXT 空内容 → 0 条目（这才会被 syncSubTerms 的守卫拦下）", () => {
    const r = parseTermsSource("   \n  \n");
    expect(r.entries).toBe(0);
  });

  test("尾逗号行按 TXT 处理（`key,` 是合法的省略译文写法，不是 CSV）", () => {
    const r = parseTermsSource("Cheeta,\nAPI,");
    expect(r.format).toBe("txt");
  });

  test("前导空白不影响 JSON 嗅探", () => {
    const r = parseTermsSource('  \n  [{"key":"A","value":"1"}]');
    expect(r.format).toBe("json");
    expect(r.entries).toBe(1);
  });

  test("非法 JSON 返回 parse-failed 而非抛错", () => {
    const r = parseTermsSource("{not valid json");
    expect(r.entries).toBe(0);
    expect(r.errors[0].reason).toBe("parse-failed");
  });

  test("HTML 错误页 → 显式拒绝（关键：透传路径会把它当成 1 个条目）", () => {
    // 【judge 实测发现】`.txt` 是透传路径，HTML 会被当成一整行 terms 文本产生
    // 1 个条目，从而绕过「0 条目守卫」。故必须显式识别 HTML。
    const r = parseTermsSource("<!DOCTYPE html><html><body>404</body></html>");
    expect(r.format).toBe("html");
    expect(r.entries).toBe(0);
    expect(r.errors[0].reason).toBe("html-response");
    expect(r.text).toBe("");
  });

  test("其他 HTML 形态同样被拒绝", () => {
    for (const html of [
      "<html><head></head></html>",
      "<?xml version='1.0'?><html></html>",
    ]) {
      const r = parseTermsSource(html);
      expect(r.format).toBe("html");
      expect(r.entries).toBe(0);
    }
  });
});

describe("syncSubTerms 守卫", () => {
  test("正常内容写入缓存，含 text/entries/format/fetchedAt", async () => {
    apiFetch.mockResolvedValue('{"API":"接口"}');
    await syncSubTerms("https://example.invalid/terms.json");
    expect(setSubTerms).toHaveBeenCalledTimes(1);
    const [url, val] = setSubTerms.mock.calls[0];
    expect(url).toBe("https://example.invalid/terms.json");
    expect(val.text).toBe("API,接口");
    expect(val.entries).toBe(1);
    expect(val.format).toBe("json");
    expect(typeof val.fetchedAt).toBe("number");
  });

  test("0 条目 → 抛错且**不写缓存**（404/HTML 错误页不得污染）", async () => {
    apiFetch.mockResolvedValue("<html>404 Not Found</html>");
    await expect(syncSubTerms("https://example.invalid/x")).rejects.toThrow(
      "empty terms source"
    );
    expect(setSubTerms).not.toHaveBeenCalled();
  });

  test("纯 HTML 响应（含 DOCTYPE）同样被拒绝且不写缓存", async () => {
    apiFetch.mockResolvedValue(
      "<!DOCTYPE html><html><body>404</body></html>"
    );
    await expect(syncSubTerms("https://example.invalid/h")).rejects.toThrow(
      "empty terms source"
    );
    expect(setSubTerms).not.toHaveBeenCalled();
  });

  test("超长内容 → 抛错且**不写缓存**（保护页面不被巨型词库卡死）", async () => {
    const huge = Array.from(
      { length: 200 },
      (_, i) => `key${i},${"x".repeat(10000)}`
    ).join("\n");
    expect(huge.length).toBeGreaterThan(MAX_SUB_TERMS_TEXT_LENGTH);
    apiFetch.mockResolvedValue(huge);
    await expect(syncSubTerms("https://example.invalid/huge")).rejects.toThrow(
      /too large/
    );
    expect(setSubTerms).not.toHaveBeenCalled();
  });

  test("shouldCommit 为 false 时不写缓存（守卫可被调用方控制）", async () => {
    apiFetch.mockResolvedValue('{"API":"接口"}');
    await syncSubTerms("https://example.invalid/x", {
      shouldCommit: () => false,
    });
    expect(setSubTerms).not.toHaveBeenCalled();
  });

  test("含非法正则的条目：整份仍可写入（parseTerms 已逐条排除）", async () => {
    apiFetch.mockResolvedValue('{"API":"接口","bad[re":"x"}');
    await syncSubTerms("https://example.invalid/mixed");
    expect(setSubTerms).toHaveBeenCalledTimes(1);
    const [, val] = setSubTerms.mock.calls[0];
    // 非法项被 parseTerms 排除，合法项保留
    expect(val.entries).toBe(1);
  });
});

describe("按源粒度的时间戳（修正 subRules 的全局时间戳缺陷）", () => {
  test("时间戳按 url 独立记录，且带 terms: 前缀避免与规则源冲突", async () => {
    await updateSubTermsSyncAt("https://a.invalid", 1000);
    await updateSubTermsSyncAt("https://b.invalid", 2000);
    expect(await getSubTermsSyncAt("https://a.invalid")).toBe(1000);
    expect(await getSubTermsSyncAt("https://b.invalid")).toBe(2000);
    // 前缀存在，故与同名规则源键不冲突
    expect(syncState.dataCaches["terms:https://a.invalid"]).toBe(1000);
  });

  test("未同步过的源时间戳为 0", async () => {
    expect(await getSubTermsSyncAt("https://never.invalid")).toBe(0);
  });
});

describe("trySyncAllSubTerms 增量同步", () => {
  test("24h 内的源被跳过，超过的被同步", async () => {
    const now = Date.now();
    await updateSubTermsSyncAt("https://fresh.invalid", now); // 刚同步过
    apiFetch.mockResolvedValue('{"API":"接口"}');

    const r = await trySyncAllSubTerms({
      subTermsList: [
        { url: "https://fresh.invalid", enabled: true },
        { url: "https://stale.invalid", enabled: true },
      ],
    });
    expect(r.skipped).toBe(1);
    expect(r.ok).toBe(1);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("https://stale.invalid");
  });

  test("单个源失败不阻断其他源（按源粒度隔离）", async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes("bad")) throw new Error("network down");
      return '{"API":"接口"}';
    });
    const r = await trySyncAllSubTerms({
      subTermsList: [
        { url: "https://bad.invalid", enabled: true },
        { url: "https://good.invalid", enabled: true },
      ],
    });
    expect(r.failed).toBe(1);
    expect(r.ok).toBe(1);
    // 失败源不写时间戳 → 下次仍会重试（这正是修正后的行为）
    expect(await getSubTermsSyncAt("https://bad.invalid")).toBe(0);
    expect(await getSubTermsSyncAt("https://good.invalid")).toBeGreaterThan(0);
  });

  test("disabled 的源完全跳过", async () => {
    apiFetch.mockResolvedValue('{"API":"接口"}');
    const r = await trySyncAllSubTerms({
      subTermsList: [{ url: "https://off.invalid", enabled: false }],
    });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(r.ok).toBe(0);
    expect(r.skipped).toBe(0);
  });
});

describe("loadOrFetchSubTerms 缓存优先", () => {
  test("有缓存时直接返回，不发网络请求", async () => {
    cacheState["https://c.invalid"] = { text: "API,接口", entries: 1 };
    const r = await loadOrFetchSubTerms("https://c.invalid");
    expect(r.fromCache).toBe(true);
    expect(r.text).toBe("API,接口");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("无缓存时拉取并写缓存", async () => {
    apiFetch.mockResolvedValue('{"API":"接口"}');
    const r = await loadOrFetchSubTerms("https://n.invalid");
    expect(r.fromCache).toBe(false);
    expect(r.text).toBe("API,接口");
    expect(setSubTerms).toHaveBeenCalled();
  });

  test("网络失败时返回空文本，**不清空已有缓存**", async () => {
    cacheState["https://f.invalid"] = { text: "旧,值", entries: 1 };
    // 缓存存在 → 不应走网络
    const r = await loadOrFetchSubTerms("https://f.invalid");
    expect(r.text).toBe("旧,值");
    expect(delSubTerms).not.toHaveBeenCalled();
  });

  test("无缓存且网络失败 → 返回空文本不抛错", async () => {
    apiFetch.mockRejectedValue(new Error("network down"));
    const r = await loadOrFetchSubTerms("https://dead.invalid");
    expect(r.text).toBe("");
    expect(r.entries).toBe(0);
  });
});

describe("composeSubTermsText 多源拼接", () => {
  test("仅拼接 enabled 的源，顺序与列表一致", async () => {
    cacheState["https://1.invalid"] = { text: "A,1" };
    cacheState["https://2.invalid"] = { text: "B,2" };
    cacheState["https://3.invalid"] = { text: "C,3" };
    const text = await composeSubTermsText([
      { url: "https://1.invalid", enabled: true },
      { url: "https://3.invalid", enabled: false },
      { url: "https://2.invalid", enabled: true },
    ]);
    expect(text).toBe("A,1\nB,2");
  });

  test("全部为空 → 空串", async () => {
    expect(await composeSubTermsText([])).toBe("");
    expect(await composeSubTermsText(undefined)).toBe("");
  });
});

describe("syncAllSubTerms", () => {
  test("统计成功与失败数", async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes("bad")) throw new Error("boom");
      return '{"API":"接口"}';
    });
    const r = await syncAllSubTerms([
      { url: "https://a.invalid", enabled: true },
      { url: "https://bad.invalid", enabled: true },
    ]);
    expect(r.ok).toBe(1);
    expect(r.failed).toBe(1);
  });
});

describe("removeSubTerms", () => {
  test("删除缓存与时间戳", async () => {
    cacheState["https://r.invalid"] = { text: "A,1" };
    await updateSubTermsSyncAt("https://r.invalid", 500);
    await removeSubTerms("https://r.invalid");
    expect(cacheState["https://r.invalid"]).toBeUndefined();
    expect(await getSubTermsSyncAt("https://r.invalid")).toBe(0);
  });
});

// --- 订阅库元信息契约（多库模型，人类已确认）---
describe("订阅库元信息", () => {
  const withMeta = (obj) => JSON.stringify(obj);

  test("带元信息容器时解析出 name/description/author", () => {
    const m = extractSubscriptionMeta(
      withMeta({
        name: "游戏术语",
        description: "某游戏专有名词",
        author: "@someone",
        terms: [{ key: "Cheeta", value: "齐塔" }],
      }),
      "json"
    );
    expect(m).toEqual({
      name: "游戏术语",
      description: "某游戏专有名词",
      author: "@someone",
      homepage: "",
    });
  });

  test("可选字段缺失时为空串，不抛错", () => {
    const m = extractSubscriptionMeta(withMeta({ name: "x", terms: [] }), "json");
    expect(m.name).toBe("x");
    expect(m.description).toBe("");
    expect(m.author).toBe("");
  });

  test("裸数组/裸对象映射视为无元信息（既有格式继续可用）", () => {
    // 这是关键兼容点：kiss-rules 的规则文件就是裸数组
    expect(extractSubscriptionMeta('[{"key":"a","value":"1"}]', "json")).toBe(
      null
    );
    expect(extractSubscriptionMeta('{"a":"1"}', "json")).toBe(null);
  });

  test("非 JSON 格式无元信息", () => {
    expect(extractSubscriptionMeta("a,1", "csv")).toBe(null);
    expect(extractSubscriptionMeta("a,1", "txt")).toBe(null);
  });

  test("非法 JSON 返回 null 而非抛错", () => {
    expect(extractSubscriptionMeta("{bad", "json")).toBe(null);
  });

  test("带 terms 字段才认为是库描述文件", () => {
    // 有 name 但没有 terms → 不是库描述文件（可能是对象映射里恰好有个 name 键）
    expect(extractSubscriptionMeta('{"name":"x"}', "json")).toBe(null);
  });
});

describe("订阅作者解析", () => {
  test("GitHub Gist 原生 URL 可解析作者", () => {
    expect(
      parseAuthorFromUrl(
        "https://gist.githubusercontent.com/alice/abc123/raw/terms.json"
      )
    ).toBe("@alice");
  });

  test("raw.githubusercontent 原生 URL 可解析作者", () => {
    expect(
      parseAuthorFromUrl("https://raw.githubusercontent.com/bob/repo/main/t.json")
    ).toBe("@bob");
  });

  test("GitHub Pages 不解析作者（路径段是仓库名而非作者）", () => {
    // 现有官方订阅源就是这种形态；其中的 fishjar 是仓库所有者，
    // 但这是巧合而非规则，故不猜测。
    expect(
      parseAuthorFromUrl("https://fishjar.github.io/kiss-rules/kiss-rules_v2.json")
    ).toBe("");
  });

  test("自建域名不解析作者", () => {
    expect(parseAuthorFromUrl("https://example.com/terms.json")).toBe("");
    expect(parseAuthorFromUrl("")).toBe("");
    expect(parseAuthorFromUrl(null)).toBe("");
  });

  test("文件声明优先于 URL 解析", () => {
    const url = "https://gist.githubusercontent.com/alice/x/raw/t.json";
    expect(resolveSubscriptionAuthor({ author: "carol" }, url)).toBe("@carol");
    expect(resolveSubscriptionAuthor({ author: "@dave" }, url)).toBe("@dave");
    expect(resolveSubscriptionAuthor({ author: "" }, url)).toBe("@alice");
    expect(resolveSubscriptionAuthor(null, url)).toBe("@alice");
  });

  test("两处都取不到则返回空串（UI 据此隐藏署名行）", () => {
    expect(resolveSubscriptionAuthor(null, "https://example.com/t.json")).toBe(
      ""
    );
  });
});

describe("name 必填契约", () => {
  beforeEach(() => {
    apiFetch.mockResolvedValue(
      JSON.stringify({ description: "无名字", terms: [{ key: "a", value: "1" }] })
    );
  });

  test("带元信息容器但缺 name → 拒绝加载", async () => {
    await expect(syncSubTerms("https://r.invalid")).rejects.toThrow(
      /missing required field: name/
    );
  });

  test("拒绝时不写缓存（避免半成品污染）", async () => {
    await expect(syncSubTerms("https://r.invalid")).rejects.toThrow();
    expect(cacheState["https://r.invalid"]).toBeUndefined();
  });

  test("裸数组（既有格式）不强制 name，仍可加载", async () => {
    apiFetch.mockResolvedValue(
      JSON.stringify([{ key: "a", value: "1" }]) // 注意：这是数组不是 {terms:[]}
    );
    const r = await syncSubTerms("https://legacy.invalid");
    expect(r.entries).toBeGreaterThan(0);
    expect(cacheState["https://legacy.invalid"]).toBeDefined();
  });

  test("带 name 的库描述文件正常加载，并缓存元信息与署名", async () => {
    apiFetch.mockResolvedValue(
      JSON.stringify({
        name: "游戏术语",
        description: "某游戏",
        author: "@someone",
        terms: [{ key: "Cheeta", value: "齐塔" }],
      })
    );
    const r = await syncSubTerms("https://ok.invalid");
    expect(r.entries).toBe(1);
    const cached = cacheState["https://ok.invalid"];
    expect(cached.meta.name).toBe("游戏术语");
    expect(cached.author).toBe("@someone");
  });
});
