// 免打包专业术语 CLI 脚本的进程级测试
// 通过子进程运行真实的 babel-node CLI（src/scripts/test-term-replace.js），
// 验证：成功（默认内置 4 类冲突全部通过、退出码 0）、
// 失败（断言失败输出、退出码 1）、
// 非法输入（非法正则提示、退出码 1）、以及 --verbose 结构化 detail。
import { spawn } from "child_process";
import path from "path";
import { getDiagnosticSampleTerms } from "../libs/termTestUtils";
import { parseTerms } from "../libs/terms";

const PROJECT_ROOT = path.join(__dirname, "../..");
const BABEL_NODE = path.join(
  PROJECT_ROOT,
  "node_modules/@babel/node/bin/babel-node.js"
);
const CLI_SCRIPT = path.join(__dirname, "test-term-replace.js");

/** 以子进程运行 CLI，返回 { code, stdout, stderr }。 */
function runCli(args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BABEL_NODE, CLI_SCRIPT, ...args], {
      cwd: PROJECT_ROOT,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("test-term-replace CLI", () => {
  test("exits 0 and covers all four conflict matrix classes with built-in terms", async () => {
    const { code, stdout, stderr } = await runCli([]);

    expect(stderr).toBe("");
    expect(code).toBe(0);
    // 默认内置固定用例覆盖冲突矩阵 4 类。
    expect(stdout).toContain("类型 1");
    expect(stdout).toContain("类型 2");
    expect(stdout).toContain("类型 3");
    expect(stdout).toContain("类型 4");
    // 逐用例输出：自然文本 / 修复后 / 修复前 / 断言 ✅。
    expect(stdout).toContain("自然文本");
    expect(stdout).toContain("修复后");
    expect(stdout).toContain("修复前");
    expect(stdout).toContain("✅ 断言通过");
    expect(stdout).not.toContain("❌ 断言失败");
    expect(stdout).toContain("状态: ✅ 全部通过");
  }, 60000);

  test("exits 0 with custom terms passed via --terms", async () => {
    const { code, stdout } = await runCli(["--terms", "API,接口;APIKey"]);

    expect(code).toBe(0);
    // 自定义术语只生成该对（类型 2）用例：长词保持原文、短词单独替换。
    expect(stdout).toContain("长短词冲突（类型 2）");
    expect(stdout).toContain("API ↔ APIKey");
    expect(stdout).toContain("✅ 断言通过");
  }, 60000);

  test("exits 1 and emits structured failure details when assertions fail", async () => {
    const { code, stdout } = await runCli([
      "--terms",
      "API\\.\\d+,版本", // 正则术语插入自然模板后不能自匹配 → 断言失败
    ]);

    expect(code).toBe(1);
    expect(stdout).toContain("❌ 断言失败");
    expect(stdout).toContain("[single-term-not-found]");
    expect(stdout).toContain("术语 API\\.\\d+ 未被命中");
    expect(stdout).toContain("状态: ❌ 存在失败");
  }, 60000);

  test("--verbose prints full structured detail for failing issues", async () => {
    const { code, stdout } = await runCli([
      "--terms",
      "API\\.\\d+,版本",
      "--verbose",
    ]);

    expect(code).toBe(1);
    // verbose 输出 issue detail 的 JSON（含 spans/修复前后文本等完整上下文）。
    expect(stdout).toContain("── detail ──");
    expect(stdout).toContain('"spans"');
    expect(stdout).toContain('"fixedOutput"');
    expect(stdout).toContain('"naiveOutput"');
    expect(stdout).toContain('"text"');
  }, 60000);

  test("exits 1 and reports invalid regex terms", async () => {
    const { code, stdout } = await runCli(["--terms", "bad[re,x"]);

    expect(code).toBe(1);
    expect(stdout).toContain("[INVALID]");
    expect(stdout).toContain("非法正则术语");
    expect(stdout).toContain("bad[re");
    // 全部术语非法时没有可执行的用例，明确失败。
    expect(stdout).toContain("没有有效术语");
  }, 60000);

  // hasErrors 三方行为契约（计划 v4 节明文化）：
  // 预览层（Playground/CLI）在存在致命诊断时不出"通过"摘要、不生成用例，
  // 但必须列出仍可应用的合法术语；生产 Translator 不受影响照常应用合法术语。
  // 判定统一复用 terms.js 导出的 FATAL_DIAGNOSTIC_TYPES，不得各自硬编码清单。
  test.each([
    ["Dr\\.who;Dr.who,神经病患者", "conflicting-pattern", "冲突映射"],
    ["Dr.who;,abc;入门,", "empty-source-term", "空源术语"],
    ["a*,x", "empty-matching-pattern", "空字符串"],
  ])(
    "rejects illegal input %s with a specific diagnostic",
    async (terms, expectedType, expectedText) => {
      const { code, stdout } = await runCli(["--terms", terms]);

      expect(code).toBe(1);
      // 诊断带段号 + 原始内容 + 具体原因，且不生成成功摘要。
      expect(stdout).toContain("[FAIL]");
      expect(stdout).toContain(expectedText);
      expect(stdout).toContain("输入存在非法段，未生成测试用例");
      expect(stdout).not.toContain("✅ 全部通过");
      expect(stdout).not.toContain("✅ 断言通过");
    },
    60000
  );

  test("尾巴逗号 Dr.who, 按保留原文处理：非致命、退出码 0", async () => {
    // extra-comma 不再视为致命诊断：`key,` 作为保留原文术语可执行。
    const { code, stdout } = await runCli(["--terms", "Dr.who,;API,接口"]);

    expect(code).toBe(0);
    // 不因尾巴逗号而拒绝整个输入、不报"输入存在非法段"。
    expect(stdout).not.toContain("输入存在非法段");
    expect(stdout).not.toContain("[FAIL]");
    // 合法术语与保留规则仍生成用例并全部通过。
    expect(stdout).toContain("✅ 全部通过");
  }, 60000);

  test("uses the same built-in fixture as getDiagnosticSampleTerms()", async () => {
    const { code, stdout } = await runCli([]);

    expect(code).toBe(0);
    // CLI 默认用例与 Playground/自动化测试共用同一 fixture（8 个术语）。
    const sample = parseTerms(getDiagnosticSampleTerms());
    for (const term of sample.terms) {
      expect(stdout).toContain(term.key);
    }
  }, 60000);
});
