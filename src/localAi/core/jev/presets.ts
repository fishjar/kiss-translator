import type { DecisionQuestions, DecisionState } from "./types";

export interface JevPreset {
  id: string;
  name: string;
  description: string;
  state: DecisionState;
  questions: DecisionQuestions;
}

/**
 * 移植上游 `laya/presets.py` 并结合 KISS Translator 本地 AI 架构指南 v2 的典型场景预设，
 * 覆盖 `choice` / `score` / `noul` 三种原语及多语言输入。
 */
export const JEV_PRESETS: JevPreset[] = [
  {
    id: "kiss-translation-action",
    name: "网页区域翻译路由 (Choice + Score + Noul)",
    description:
      "综合评估网页 DOM 区块是否应自动翻译、提取方式选择、风险等级及是否需要 OCR",
    state: {
      domain: "news.yahoo.co.jp",
      tag: "ARTICLE",
      role: "main",
      textLength: 680,
      containsCode: false,
      pageLanguage: "ja",
      targetLanguage: "zh-CN",
      sampleText:
        "政府は本日、次世代半導体およびローカルAI技術の普及に向けた新たな支援策を発表しました。",
    },
    questions: {
      action: {
        type: "choice",
        instructions:
          "What should the translation extension do with this webpage region?",
        criteria: {
          translate: "Translate the article content into the target language.",
          skip: "Do not translate (e.g. code block, navigation, or already in target language).",
          ask: "Ask the user for confirmation before translating.",
          llm: "Escalate to a large reasoning LLM for complex formatting.",
        },
      },
      extraction: {
        type: "choice",
        instructions: "Which text extraction method is most appropriate?",
        criteria: {
          dom: "Use DOM text directly.",
          ocr: "Run OCR on the visual region.",
          skip: "No extraction is needed.",
        },
      },
      risk: {
        type: "score",
        instructions: "How risky is auto-translating this element in place?",
        criteria: [
          "safe standard text paragraph",
          "minor layout shift risk",
          "moderate risk (interactive UI controls)",
          "high risk (code editor or sensitive form input)",
        ],
      },
      needs_ocr: {
        type: "noul",
        instructions: "Does this page region require OCR before translation?",
      },
    },
  },
  {
    id: "laya-ticket-triage",
    name: "多语言客服工单分流 (上游 Laya Quickstart)",
    description:
      "上游 NandhaKishorM/laya 官方示例：单次前向传播同时完成部门选择、紧急度评分、流失风险与退款意图判断",
    state: {
      from: "user@acme.com",
      subject: "Duplicate charge on invoice #4411",
      body: "Hi, we were billed twice for March. Please refund the duplicate today or we will cancel our plan.",
    },
    questions: {
      department: {
        type: "choice",
        instructions: "Which department should handle this request?",
        criteria: {
          billing: "invoices, payments, refunds",
          technical: "bugs, outages, system errors",
          sales: "pricing, new contracts",
          other: "everything else",
        },
      },
      urgency: {
        type: "score",
        instructions: "How urgent is this request?",
        criteria: [
          "not urgent",
          "soon",
          "critical deadline or blocking issue",
        ],
      },
      churn_risk: {
        type: "noul",
        instructions: "Does the user threaten to cancel or leave?",
      },
      refund_requested: {
        type: "noul",
        instructions: "Does the user explicitly request a refund?",
      },
    },
  },
  {
    id: "kiss-code-block-skip",
    name: "代码块跳过判定 (Choice + Noul)",
    description: "识别技术文档中的代码片段，避免破坏代码语法高亮与变量名",
    state: {
      domain: "github.com",
      tag: "PRE",
      className: "highlight-source-ts",
      pageLanguage: "en",
      targetLanguage: "zh-CN",
      sampleText:
        "export async function ensureOffscreen(): Promise<void> { const url = chrome.runtime.getURL('offscreen.html'); }",
    },
    questions: {
      decision: {
        type: "choice",
        instructions:
          "Should the browser extension translate this DOM element or skip it?",
        criteria: {
          skip: "Skip translation because it is source code, command line, or technical identifier.",
          translate: "Translate natural language prose for the reader.",
        },
      },
      is_source_code: {
        type: "noul",
        instructions:
          "Is the sampleText primarily programming source code rather than natural language prose?",
      },
    },
  },
  {
    id: "kiss-escalation-decision",
    name: "System-1 / System-2 升级路由 (EscalationDecision)",
    description:
      "判断用户请求可由本地轻量工具直接处理，还是需要升级到大参数推理 LLM",
    state: {
      userPrompt:
        "对比这段日文合同第三条与第五条中的违约责任差异，并给出法律风险修改建议",
      textLength: 1420,
      hasLocalTranslator: true,
      hasLocalLlm: true,
    },
    questions: {
      route: {
        type: "choice",
        instructions:
          "Can this request be handled by a direct translation tool, or does it require a reasoning LLM?",
        criteria: {
          local_tool: "Simple literal translation or dictionary lookup.",
          llm: "Requires multi-step reasoning, legal/contextual comparison, or rewriting advice.",
          ask_user: "Ambiguous request requiring user clarification.",
        },
      },
      complexity: {
        type: "score",
        instructions: "Rate the reasoning complexity required for this task.",
        criteria: [
          "trivial lookup or literal translation",
          "moderate summarization",
          "deep analytical reasoning and domain critique",
        ],
      },
    },
  },
];
