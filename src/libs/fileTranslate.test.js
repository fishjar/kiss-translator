import { translateFileText, translateTxt } from "./fileTranslate";
import { apiTranslate } from "../apis";

jest.mock("../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("webextension-polyfill", () => ({}));

const setting = {
  transApis: [
    {
      apiSlug: "primary",
      apiType: "Microsoft",
      apiName: "Primary",
      sourceType: "network",
      capabilities: ["translation"],
    },
    {
      apiSlug: "backup",
      apiType: "Microsoft",
      apiName: "Backup",
      sourceType: "network",
      capabilities: ["translation"],
    },
  ],
  prompts: [],
  subtitleSetting: {},
};
const scene = {
  apiSlugs: ["primary", "backup"],
  fromLang: "auto",
  toLang: "zh-CN",
};

beforeEach(() => apiTranslate.mockReset());

test("preserves TXT line endings, blank lines and order while falling back", async () => {
  apiTranslate.mockImplementation(async ({ text, apiSetting }) => {
    if (apiSetting.apiSlug === "primary") throw new Error("offline");
    return { trText: `译:${text}` };
  });
  const result = await translateTxt("first\r\n\r\nsecond\n", scene, setting);
  expect(result.text).toBe("译:first\r\n\r\n译:second\n");
  expect(result.comparisons).toEqual([
    { source: "first", target: "译:first" },
    { source: "second", target: "译:second" },
  ]);
  expect(
    apiTranslate.mock.calls.map(([args]) => args.apiSetting.apiSlug)
  ).toEqual(["primary", "backup", "primary", "backup"]);
});

test("cancellation stops before requesting the next line", async () => {
  const abort = new AbortController();
  apiTranslate.mockImplementation(async () => ({ trText: "translated" }));
  await expect(
    translateTxt("one\ntwo", scene, setting, abort.signal, () => abort.abort())
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(apiTranslate).toHaveBeenCalledTimes(1);
});

test("installed local translation is used first and a failed local run falls back", async () => {
  apiTranslate.mockResolvedValue({ trText: "network output" });
  const localScene = { ...scene, apiSlugs: ["local", "backup"] };
  const localSetting = {
    ...setting,
    transApis: [
      {
        apiSlug: "local",
        apiType: "LocalAI",
        sourceType: "local",
        modelRef: "model-a",
        capabilities: ["translation"],
      },
      ...setting.transApis,
    ],
  };
  const local = {
    installedModels: new Set(["model-a"]),
    translate: jest.fn().mockRejectedValue(new Error("device lost")),
  };
  await expect(
    translateFileText("source", localScene, localSetting, undefined, local)
  ).resolves.toBe("network output");
  expect(local.translate).toHaveBeenCalledWith(
    "model-a",
    "source",
    "zh-CN",
    undefined
  );
  expect(apiTranslate).toHaveBeenCalledTimes(1);
});

describe("Markdown file translation", () => {
  const {
    maskInlineElements,
    unmaskInlineElements,
    splitMarkdownBlocks,
    renderMarkdownBlocksToHtml,
    translateMarkdown,
  } = require("./fileTranslate");

  test("masks and unmasks inline code, math, and links preserving URLs", () => {
    const raw =
      "Use `npm install` and $x = y^2$ with [Guide](https://example.com) and ![Logo](https://img.png)";
    const { masked, masks } = maskInlineElements(raw);
    expect(masked).not.toContain("`npm install`");
    expect(masked).not.toContain("$x = y^2$");
    expect(masked).not.toContain("https://example.com");
    expect(masked).toContain("[Guide]");
    expect(masks.length).toBe(4);

    const simulatedTranslated = masked
      .replace("Use", "使用")
      .replace("Guide", "指南")
      .replace("with", "配合");
    const restored = unmaskInlineElements(simulatedTranslated, masks);
    expect(restored).toBe(
      "使用 `npm install` and $x = y^2$ 配合 [指南](https://example.com) and ![Logo](https://img.png)"
    );
  });

  test("splits markdown into blocks and protects code fences and math blocks", () => {
    const md = `# Title\n\n\`\`\`javascript\nconsole.log("hello");\n\`\`\`\n\n$$E=mc^2$$\n\n- List item 1\n- List item 2\n\n> Quote block`;
    const blocks = splitMarkdownBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "blank",
      "code",
      "blank",
      "math",
      "blank",
      "list_item",
      "list_item",
      "blank",
      "blockquote",
    ]);
    const codeBlock = blocks.find((b) => b.type === "code");
    expect(codeBlock.translatable).toBe(false);
    expect(codeBlock.raw).toContain('console.log("hello");');
  });

  test("translates markdown preserving code blocks and generating bilingual and target versions", async () => {
    apiTranslate.mockImplementation(async ({ text }) => ({
      trText: `中:${text}`,
    }));
    const md = `# Introduction\n\nThis is a paragraph with \`code\`.\n\n\`\`\`python\nprint(1)\n\`\`\`\n\n- First point`;
    const result = await translateMarkdown(md, scene, setting);

    // 纯译文 Markdown：代码块原样保留，文本被翻译，行内代码被保护还原
    expect(result.translatedMd).toContain("# 中:Introduction");
    expect(result.translatedMd).toContain(
      "中:This is a paragraph with `code`."
    );
    expect(result.translatedMd).toContain("```python\nprint(1)\n```");
    expect(result.translatedMd).toContain("- 中:First point");

    // 双语对照 Markdown：包含原文和译文
    expect(result.bilingualMd).toContain("# Introduction");
    expect(result.bilingualMd).toContain("# 中:Introduction");
    expect(result.bilingualMd).toContain("This is a paragraph with `code`.");
    expect(result.bilingualMd).toContain("中:This is a paragraph with `code`.");

    // HTML 渲染包含预期结构
    expect(result.translatedHtml).toContain('<h1 class="kt-md-heading"');
    expect(result.translatedHtml).toContain("中:Introduction</h1>");
    expect(result.bilingualHtml).toContain('class="kt-md-bilingual-block"');
    expect(result.bilingualHtml).toContain('class="kt-md-source"');
    expect(result.bilingualHtml).toContain('class="kt-md-target');
  });

  test("translates markdown table cells and preserves table alignments", async () => {
    apiTranslate.mockImplementation(async ({ text }) => ({
      trText: `译:${text}`,
    }));
    const tableMd = `| Name | Age |\n| :--- | ---: |\n| Alice | 20 |\n| Bob | 25 |`;
    const { translateMarkdown } = require("./fileTranslate");
    const result = await translateMarkdown(tableMd, scene, setting);

    expect(result.translatedMd).toContain("| 译:Name | 译:Age |");
    expect(result.translatedMd).toContain("| :--- | ---: |");
    expect(result.translatedMd).toContain("| 译:Alice | 译:20 |");
    expect(result.translatedHtml).toContain("<table");
    expect(result.translatedHtml).toContain("译:Alice");
  });

  test("markdown translation abort signal cancels gracefully", async () => {
    const abort = new AbortController();
    apiTranslate.mockImplementation(async () => ({ trText: "ok" }));
    const { translateMarkdown } = require("./fileTranslate");
    await expect(
      translateMarkdown(
        "# H1\n\n# H2\n\n# H3",
        scene,
        setting,
        abort.signal,
        () => abort.abort()
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("keeps results blank before translation starts and only completed blocks are rendered on screen", () => {
    const md = "# Heading 1\n\nParagraph text\n\n> Blockquote";
    const blocks = splitMarkdownBlocks(md);

    // 未开始翻译时：没有任何块完成翻译，译文与双语模式均保持完全空白
    expect(renderMarkdownBlocksToHtml(blocks, { mode: "target" })).toBe("");
    expect(renderMarkdownBlocksToHtml(blocks, { mode: "bilingual" })).toBe("");

    // 原文模式（左栏）正常渲染完整原文
    expect(renderMarkdownBlocksToHtml(blocks, { mode: "source" })).toContain(
      "Heading 1"
    );

    // 模拟仅第一块（标题）完成翻译
    blocks[0].targetText = "标题 1";
    const partialTargetHtml = renderMarkdownBlocksToHtml(blocks, {
      mode: "target",
    });
    // 已完成的标题上屏
    expect(partialTargetHtml).toContain("标题 1");
    // 未完成翻译的段落与引用绝不上屏
    expect(partialTargetHtml).not.toContain("Paragraph text");
    expect(partialTargetHtml).not.toContain("Blockquote");

    // 双语模式下同样仅上屏已完成的段落
    const partialBilingualHtml = renderMarkdownBlocksToHtml(blocks, {
      mode: "bilingual",
    });
    expect(partialBilingualHtml).toContain("Heading 1");
    expect(partialBilingualHtml).toContain("标题 1");
    expect(partialBilingualHtml).not.toContain("Paragraph text");
  });

  test("concurrently schedules multiple markdown blocks to enable batching and streams blocks snapshot", async () => {
    let maxConcurrentCalls = 0;
    let currentConcurrentCalls = 0;
    const progressBlocksList = [];

    apiTranslate.mockImplementation(async ({ text }) => {
      currentConcurrentCalls++;
      if (currentConcurrentCalls > maxConcurrentCalls) {
        maxConcurrentCalls = currentConcurrentCalls;
      }
      // 模拟微延迟，以检测是否有并发调用重叠进入
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrentCalls--;
      return { trText: `译:${text}` };
    });

    const md = "# H1\n\n# H2\n\n# H3\n\n# H4\n\n# H5";
    const result = await translateMarkdown(
      md,
      scene,
      setting,
      undefined,
      (done, total, item, currentBlocks) => {
        progressBlocksList.push({
          done,
          total,
          hasBlocks: Boolean(currentBlocks),
        });
      }
    );

    // 验证并发调度：多个块同时进入翻译（maxConcurrentCalls > 1），触发 BatchQueue 打包
    expect(maxConcurrentCalls).toBeGreaterThan(1);
    expect(result.translatedMd).toContain("# 译:H1");
    expect(result.translatedMd).toContain("# 译:H5");

    // 验证流式回传参数正确带回了 blocks 快照
    expect(progressBlocksList.length).toBe(5);
    expect(progressBlocksList.every((p) => p.hasBlocks)).toBe(true);
  });

  test("generateStandaloneHtml produces valid HTML with style and body content", () => {
    const { generateStandaloneHtml } = require("./fileTranslate");
    const html = generateStandaloneHtml("<p>Hello</p>", "Doc Title");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Doc Title</title>");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("kt-md-source");
  });

  test("translateEntireTxt translates the full txt file in a single request", async () => {
    const { translateEntireTxt } = require("./fileTranslate");
    apiTranslate.mockResolvedValueOnce({ trText: "整篇译文内容" });
    const result = await translateEntireTxt("Full source text", scene, setting);
    expect(result.text).toBe("整篇译文内容");
    expect(result.isEntire).toBe(true);
    expect(apiTranslate).toHaveBeenCalledTimes(1);
  });

  test("translateEntireMarkdown masks code blocks and translates entire markdown", async () => {
    const { translateEntireMarkdown } = require("./fileTranslate");
    apiTranslate.mockImplementation(async ({ text }) => {
      expect(text).toContain("__KTCODEBLOCK_");
      expect(text).not.toContain("console.log('secret')");
      return { trText: text.replace("Hello", "你好") };
    });

    const md = "Hello world\n\n```js\nconsole.log('secret');\n```";
    const result = await translateEntireMarkdown(md, scene, setting);
    expect(result.isEntire).toBe(true);
    expect(result.translatedMd).toContain("你好 world");
    expect(result.translatedMd).toContain("console.log('secret');");
  });
});
