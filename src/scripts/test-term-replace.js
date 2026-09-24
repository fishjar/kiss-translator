// 免打包专业术语 CLI 验证脚本
// 纯 Node（babel-node），复用 terms.js / termTestUtils.js 真实生产逻辑，
// 零 DOM、零 React、零网络，毫秒级完成。
//
// 用法：
//   pnpm test:terms                          # 默认内置固定用例
//   pnpm test:terms --terms "API,接口;APIKey" # 自定义术语
//   pnpm test:terms --verbose                 # 输出完整 detail
//   pnpm test:terms --terms "bad[re"          # 非法正则测试
//
// 退出码：0（至少一个真实断言通过且无失败）/ 1（失败或全部跳过）

import {
  parseTerms,
  buildTermsMatcher,
  FATAL_DIAGNOSTIC_TYPES,
  formatDiagnosticMessage,
} from "../libs/terms";
import {
  generateTermTestText,
  assertTermReplacements,
  getDiagnosticSampleTerms,
} from "../libs/termTestUtils";

// ─── 内置固定用例（覆盖冲突矩阵 4 类场景）────────────────────────────────
// 与 Playground / 自动化测试共用 getDiagnosticSampleTerms() 同一份 fixture，
// 避免 CLI 与 UI 的样例语义分叉。
//  类型 1：API(有) ↔ APIKey(有)   类型 2：UI(有) ↔ UIView(无)
//  类型 3：GPT(无) ↔ GPTs(有)     类型 4：React(无) ↔ ReactNative(无)
const BUILTIN_TERMS = getDiagnosticSampleTerms();

// ─── 参数解析 ────────────────────────────────────────────────────────────
function parseArguments(argv) {
  const result = { terms: null, verbose: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    const value =
      inlineValue === undefined && argv[index + 1]?.startsWith("--") === false
        ? argv[++index]
        : (inlineValue ?? true);
    if (rawName === "terms") {
      result.terms = String(value);
    } else if (rawName === "verbose") {
      result.verbose = true;
    }
  }
  return result;
}

// ─── 格式化输出 ──────────────────────────────────────────────────────────
function formatAssertion(ok) {
  return ok ? "\u2705" : "\u274C"; // ✅ / ❌
}

function truncate(text, maxLen = 80) {
  if (typeof text !== "string") return String(text);
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
}

// ─── 主逻辑 ──────────────────────────────────────────────────────────────
async function run() {
  const args = parseArguments(process.argv.slice(2));
  const termsString = args.terms || BUILTIN_TERMS;
  const verbose = args.verbose;

  // 1. 解析术语（显式完整诊断：CLI 需要 conflicting-pattern 的失败契约）
  const parsed = parseTerms(termsString, { fullDiagnostics: true });

  if (parsed.invalid.length > 0) {
    for (const { key, error } of parsed.invalid) {
      console.log(`[INVALID] 非法正则术语: "${key}" — ${error.message}`);
    }
  }

  // 存在致命非法段（多余逗号/空源术语/冲突映射/非法正则/空匹配正则等）时给出段号与原因
  // 判定复用 terms.js 导出的 FATAL_DIAGNOSTIC_TYPES，避免硬编码清单与解析器漂移。
  if (parsed.hasErrors) {
    for (const d of parsed.diagnostics) {
      if (FATAL_DIAGNOSTIC_TYPES.has(d.type)) {
        // 终端格式化函数负责可读文本（诊断核心只输出稳定 type + 结构化 detail）
        console.log(`[FAIL] ${formatDiagnosticMessage(d)}`);
      }
    }
    // 与 Playground 非法态一致：非法段只跳过自身，仍可应用的合法术语在真实链路中照常生效
    if (parsed.terms.length > 0) {
      console.log(
        `[INFO] 仍可应用的合法术语: ${parsed.terms.map((t) => `「${t.key}」`).join(", ")}`
      );
    }
    console.log("[FAIL] 输入存在非法段，未生成测试用例");
  }

  if (parsed.terms.length === 0) {
    console.log("[FAIL] 没有有效术语，无法生成测试用例");
  }

  if (parsed.hasErrors || parsed.terms.length === 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `[INFO] 解析到 ${parsed.terms.length} 个有效术语` +
      (parsed.invalid.length > 0
        ? `，${parsed.invalid.length} 个非法正则已跳过`
        : "")
  );
  console.log(
    `[INFO] 术语（按长度降序）: ${parsed.terms.map((t) => t.key + (t.value ? "→" + t.value : "")).join(", ")}`
  );
  console.log("");

  // 2. 生成测试用例
  const cases = generateTermTestText(parsed);
  console.log(`[INFO] 生成了 ${cases.length} 个测试用例\n`);

  const matcher = buildTermsMatcher(parsed);
  let totalPass = 0;
  let totalFail = 0;
  let totalSkip = 0;
  const totalCases = cases.length;

  for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index];

    // 结构化断言
    const assertion = assertTermReplacements(parsed, testCase, { matcher });

    const directionLabel =
      testCase.type === "conflict" && testCase.direction
        ? `（${testCase.direction === "short-first" ? "短词→长词" : "长词→短词"}）`
        : "";
    const header =
      testCase.type === "conflict"
        ? `用例 ${index + 1}：长短词冲突（类型 ${testCase.conflictType}）` +
          directionLabel +
          (testCase.short && testCase.long
            ? ` — ${testCase.short.key} ↔ ${testCase.long.key}`
            : "")
        : `用例 ${index + 1}：单术语 — ${testCase.term?.key || "?"}`;

    console.log(`─── ${header} ───`);
    if (assertion.skipped) {
      totalSkip++;
      const reason = assertion.evidence[0];
      console.log(`📄 自然文本: （未生成）`);
      console.log(
        `   ⚠️ [SKIP] ${reason?.message || "无法自动生成可靠匹配样例"}`
      );
      if (verbose && reason) {
        console.log(`   ── detail ──`);
        console.log(JSON.stringify(reason.detail, null, 2));
      }
    } else {
      console.log(`📄 自然文本: ${truncate(testCase.text)}`);
      console.log(`✅ 修复后:   ${truncate(assertion.fixed?.output)}`);
      console.log(`❌ 修复前:   ${truncate(assertion.naive?.output)}`);
    }

    if (!assertion.skipped && assertion.ok) {
      totalPass++;
      console.log(`   ${formatAssertion(true)} 断言通过`);
    } else if (!assertion.skipped) {
      totalFail++;
      console.log(`   ${formatAssertion(false)} 断言失败`);

      for (const issue of assertion.issues) {
        console.log(`     ❌ [${issue.type}] ${issue.message}`);
      }

      if (verbose) {
        for (const issue of assertion.issues) {
          console.log(`   ── detail ──`);
          console.log(JSON.stringify(issue.detail, null, 2));
        }
      }
    }

    // 修复前/后对比证据（仅 verbose 模式）
    if (verbose && !assertion.skipped && assertion.evidence.length > 0) {
      for (const ev of assertion.evidence) {
        console.log(`   ℹ️ [evidence] ${ev.message}`);
        console.log(JSON.stringify(ev.detail, null, 2));
      }
    }

    console.log("");
  }

  // 3. 汇总
  const status =
    totalFail > 0
      ? "❌ 存在失败"
      : totalPass === 0
        ? "⚠️ 未执行有效断言"
        : totalSkip > 0
          ? "⚠️ 通过（存在跳过）"
          : "✅ 全部通过";
  console.log(`═══════════════════════════════════════`);
  console.log(`总计: ${totalCases} 个用例`);
  console.log(`通过: ${totalPass}`);
  console.log(`失败: ${totalFail}`);
  console.log(`跳过: ${totalSkip}`);
  console.log(`状态: ${status}`);
  console.log(`═══════════════════════════════════════`);

  if (totalFail > 0 || totalPass === 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[FATAL] 脚本执行异常:", error);
  process.exitCode = 1;
});
