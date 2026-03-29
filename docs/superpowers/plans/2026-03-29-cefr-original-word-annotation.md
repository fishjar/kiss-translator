# CEFR Original Word Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为整页双语翻译增加“英文原文生词上方中文释义”能力，并补齐首装引导、轻量 CEFR 测级流程与 popup/设置页入口，同时不影响现有双语翻译功能。

**Architecture:** 复用现有整页翻译主链路，把 CEFR 视为翻译成功后的原文增强层。共享状态与 `#/cefr` 深链能力先落成可测试 helper，再分别接入设置页、popup、background 安装引导和 translator 生命周期；真正的单词标注逻辑放在 `src/libs/cefr.js`，由 `translator.js` 负责调用与清理。

**Tech Stack:** React 18, MUI 5, webextension-polyfill, react-router HashRouter, Jest + jsdom via `react-app-rewired test`

---

## 文件结构与职责

- `docs/superpowers/specs/2026-03-29-cefr-original-word-annotation-design.md`
  当前已批准的设计规格，执行前后都以它为准做核对。
- `src/config/setting.js`
  扩展 `cefrSetting` 默认结构，并提供 CEFR 设置归一化函数，避免老用户的浅合并存储丢字段。
- `src/hooks/Setting.js`
  在 options/popup/content 侧回填缺失的 CEFR 嵌套字段。
- `src/libs/storage.js`
  让 background 读取设置时也走同一套 CEFR 归一化。
- `src/libs/optionsPage.js`
  新建共享 helper，统一处理 `options.html#/cefr` URL 构建、打开逻辑和 install 场景判断。
- `src/background.js`
  在首次安装时打开 CEFR 页面；升级时不打扰用户。
- `src/config/i18n.js`
  为 CEFR 页面、popup 卡片和导航补齐文案 key。
- `src/views/Options/cefrQuiz.js`
  新建轻量测级题库与得分映射逻辑，保持题量精简。
- `src/views/Options/CEFRSetting.js`
  从原型升级为 onboarding / 已配置 / 跳过未设置三态页面。
- `src/views/Options/Navigator.js`
  把 CEFR 菜单项改成 i18n 文案。
- `src/views/Popup/CEFRPromptCard.js`
  新建 popup CEFR 提醒卡片，隔离状态展示逻辑。
- `src/views/Popup/PopupCont.js`
  接入 CEFR 提醒卡片。
- `src/views/Popup/index.js`
  用共享 helper 打开普通设置页和 CEFR 深链页。
- `src/libs/cefr.js`
  继续负责词典缓存，同时改为以“原文 DOM 标注/清理 helper”为中心。
- `src/libs/translator.js`
  调用 CEFR 原文标注 helper，并把清理接到已有翻译生命周期里。
- `src/config/setting.test.js`
  新建 CEFR 设置归一化测试。
- `src/libs/optionsPage.test.js`
  新建 options 深链与 install 判断测试。
- `src/views/Options/cefrQuiz.test.js`
  新建轻量测级逻辑测试。
- `src/views/Options/CEFRSetting.test.js`
  新建设置页 onboarding / 已配置状态测试。
- `src/views/Popup/CEFRPromptCard.test.js`
  新建 popup 提醒卡片状态测试。
- `src/libs/cefr.test.js`
  改造成 DOM 标注/清理测试，不再围绕译文字符串标注。

### Task 1: 建立隔离工作区并确认基线

**Files:**
- Modify: `.gitignore`（仅在选择 `.worktrees/` 且当前未被 ignore 时）
- Test: `src/libs/cefr.test.js`

- [ ] **Step 1: 先按 worktree 技能要求向用户确认目录**

在执行本计划前先发这条消息：

```text
No worktree directory found. Where should I create worktrees?

1. .worktrees/ (project-local, hidden)
2. ~/.config/superpowers/worktrees/kiss-translator/ (global location)

Which would you prefer?
```

- [ ] **Step 2: 如果用户选 `.worktrees/`，先确保目录被忽略**

Run:

```bash
if ! git check-ignore -q .worktrees; then
  printf '\n.worktrees/\n' >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore local worktrees"
fi
```

Expected: `.worktrees/` 被 git ignore，且只有在新增 ignore 规则时才产生这次提交。

- [ ] **Step 3: 创建执行用 worktree**

如果用户选项目内 worktree，运行：

```bash
git worktree add .worktrees/cefr-original-word-annotation -b codex/cefr-original-word-annotation
cd .worktrees/cefr-original-word-annotation
```

如果用户选全局 worktree，运行：

```bash
mkdir -p ~/.config/superpowers/worktrees/kiss-translator
git worktree add ~/.config/superpowers/worktrees/kiss-translator/cefr-original-word-annotation -b codex/cefr-original-word-annotation
cd ~/.config/superpowers/worktrees/kiss-translator/cefr-original-word-annotation
```

Expected: 新分支 `codex/cefr-original-word-annotation` 创建成功，工作目录干净。

- [ ] **Step 4: 安装依赖**

Run:

```bash
pnpm install
```

Expected: 依赖安装完成，无 lockfile 改动。

- [ ] **Step 5: 跑最小测试基线**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/libs/cefr.test.js
```

Expected: 当前基线测试通过；如果失败，先把失败内容记录给用户，再决定是否继续实现。

- [ ] **Step 6: 提交 worktree 基线确认**

如果 Step 2 产生了 `.gitignore` 变更，则该提交已经完成；否则本任务不需要额外提交。

### Task 2: 共享 CEFR 状态模型与 `#/cefr` 深链 helper

**Files:**
- Create: `src/config/setting.test.js`
- Create: `src/libs/optionsPage.js`
- Create: `src/libs/optionsPage.test.js`
- Modify: `src/config/setting.js`
- Modify: `src/hooks/Setting.js`
- Modify: `src/libs/storage.js`

- [ ] **Step 1: 先写失败测试，锁定 CEFR 设置归一化和 install 深链判断**

在 `src/config/setting.test.js` 写入：

```js
import {
  DEFAULT_CEFR_SETTING,
  normalizeCEFRSetting,
} from "./setting";

describe("normalizeCEFRSetting", () => {
  test("fills missing CEFR nested fields for old installs", () => {
    expect(normalizeCEFRSetting({ enabled: true, level: 3 })).toEqual({
      ...DEFAULT_CEFR_SETTING,
      enabled: true,
      level: 3,
    });
  });

  test("preserves completed assessment metadata", () => {
    expect(
      normalizeCEFRSetting({
        enabled: true,
        level: 4,
        assessmentCompleted: true,
        levelSource: "quiz",
        lastPromptFrom: "popup",
      })
    ).toEqual({
      enabled: true,
      level: 4,
      assessmentCompleted: true,
      levelSource: "quiz",
      lastPromptFrom: "popup",
    });
  });
});
```

在 `src/libs/optionsPage.test.js` 写入：

```js
import {
  CEFR_OPTIONS_HASH,
  buildOptionsHashUrl,
  shouldOpenCEFROnInstall,
} from "./optionsPage";

describe("buildOptionsHashUrl", () => {
  test("appends the CEFR hash to options.html", () => {
    const runtime = { getURL: jest.fn(() => "chrome-extension://id/options.html") };
    expect(buildOptionsHashUrl(runtime, CEFR_OPTIONS_HASH)).toBe(
      "chrome-extension://id/options.html#/cefr"
    );
  });
});

describe("shouldOpenCEFROnInstall", () => {
  test("opens on first install when assessment is incomplete", () => {
    expect(
      shouldOpenCEFROnInstall(
        { reason: "install" },
        { enabled: false, level: 0, assessmentCompleted: false }
      )
    ).toBe(true);
  });

  test("does not open on update", () => {
    expect(
      shouldOpenCEFROnInstall(
        { reason: "update" },
        { enabled: false, level: 0, assessmentCompleted: false }
      )
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试并确认它们先失败**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/libs/optionsPage.test.js
```

Expected: 失败，报 `normalizeCEFRSetting` / `buildOptionsHashUrl` / `shouldOpenCEFROnInstall` 未定义。

- [ ] **Step 3: 实现 CEFR 设置归一化与深链 helper**

在 `src/config/setting.js` 增加并导出：

```js
export const DEFAULT_CEFR_SETTING = {
  enabled: false,
  level: 0,
  assessmentCompleted: false,
  levelSource: "unset",
  lastPromptFrom: "",
};

export const normalizeCEFRSetting = (cefrSetting = {}) => ({
  ...DEFAULT_CEFR_SETTING,
  ...(cefrSetting || {}),
});

export const normalizeSetting = (setting = {}) => ({
  ...DEFAULT_SETTING,
  ...setting,
  cefrSetting: normalizeCEFRSetting(setting?.cefrSetting),
});
```

在 `src/libs/optionsPage.js` 新建：

```js
import { browser } from "./browser";
import { normalizeCEFRSetting } from "../config";

export const CEFR_OPTIONS_HASH = "#/cefr";

export function buildOptionsHashUrl(runtime = browser?.runtime, hash = "") {
  const baseUrl = runtime?.getURL?.("options.html") || "options.html";
  return hash ? `${baseUrl}${hash}` : baseUrl;
}

export function shouldOpenCEFROnInstall(details, cefrSetting) {
  const normalized = normalizeCEFRSetting(cefrSetting);
  return details?.reason === "install" && !normalized.assessmentCompleted;
}

export async function openOptionsHash(hash = "", browserApi = browser) {
  const url = buildOptionsHashUrl(browserApi?.runtime, hash);

  if (browserApi?.tabs?.create) {
    return browserApi.tabs.create({ url });
  }

  if (typeof window !== "undefined") {
    return window.open(url, "_blank");
  }

  return browserApi?.runtime?.openOptionsPage?.();
}
```

在 `src/libs/storage.js` 和 `src/hooks/Setting.js` 接入归一化：

```js
// src/libs/storage.js
export const getSettingWithDefault = async () =>
  normalizeSetting((await getSetting()) || {});
```

```js
// src/hooks/Setting.js
useEffect(() => {
  if (!setting) return;

  const normalizedCEFR = normalizeCEFRSetting(setting.cefrSetting);
  const needsBackfill = Object.keys(DEFAULT_CEFR_SETTING).some(
    (key) => normalizedCEFR[key] !== setting?.cefrSetting?.[key]
  );

  if (needsBackfill) {
    update((currentSetting) => ({
      ...currentSetting,
      cefrSetting: normalizedCEFR,
    }));
  }
}, [setting?.cefrSetting, update]);
```

- [ ] **Step 4: 重新运行测试确认通过**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/libs/optionsPage.test.js
```

Expected: `2` 个测试文件全部通过。

- [ ] **Step 5: 提交共享状态与深链 helper**

Run:

```bash
git add src/config/setting.js src/config/setting.test.js src/hooks/Setting.js src/libs/storage.js src/libs/optionsPage.js src/libs/optionsPage.test.js
git commit -m "feat: add CEFR setting normalization and options deeplink helpers"
```

### Task 3: 轻量 CEFR 测级 UI、popup 入口与 i18n

**Files:**
- Create: `src/views/Options/cefrQuiz.js`
- Create: `src/views/Options/cefrQuiz.test.js`
- Create: `src/views/Options/CEFRSetting.test.js`
- Create: `src/views/Popup/CEFRPromptCard.js`
- Create: `src/views/Popup/CEFRPromptCard.test.js`
- Modify: `src/config/i18n.js`
- Modify: `src/views/Options/CEFRSetting.js`
- Modify: `src/views/Options/Navigator.js`
- Modify: `src/views/Popup/PopupCont.js`
- Modify: `src/views/Popup/index.js`

- [ ] **Step 1: 先写失败测试，锁定“轻量测级”与 popup 卡片状态**

在 `src/views/Options/cefrQuiz.test.js` 写入：

```js
import {
  CEFR_QUIZ_QUESTIONS,
  getCEFRLevelLabel,
  resolveQuickCEFRLevel,
} from "./cefrQuiz";

describe("quick CEFR quiz", () => {
  test("keeps the first-run assessment short", () => {
    expect(CEFR_QUIZ_QUESTIONS).toHaveLength(5);
  });

  test("maps the highest solved band to the stored level", () => {
    expect(
      resolveQuickCEFRLevel([
        { level: 1, isCorrect: true },
        { level: 2, isCorrect: true },
        { level: 3, isCorrect: true },
        { level: 4, isCorrect: false },
        { level: 5, isCorrect: false },
      ])
    ).toBe(3);
  });

  test("returns C2 when all short questions are correct", () => {
    expect(
      resolveQuickCEFRLevel(CEFR_QUIZ_QUESTIONS.map(({ level }) => ({
        level,
        isCorrect: true,
      })))
    ).toBe(6);
  });

  test("formats CEFR labels for popup and settings", () => {
    expect(getCEFRLevelLabel(4)).toBe("B2");
  });
});
```

在 `src/views/Popup/CEFRPromptCard.test.js` 写入：

```js
import { render, screen } from "@testing-library/react";
import CEFRPromptCard from "./CEFRPromptCard";

const i18n = (key) =>
  ({
    cefr_take_quiz: "去做 CEFR 测试",
    cefr_current_level: "当前等级",
    cefr_retake_quiz: "重新测试",
  }[key] || key);

describe("CEFRPromptCard", () => {
  test("shows a CTA when assessment is incomplete", () => {
    render(
      <CEFRPromptCard
        cefrSetting={{ enabled: false, level: 0, assessmentCompleted: false }}
        i18n={i18n}
        onOpenCEFR={jest.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "去做 CEFR 测试" })
    ).toBeInTheDocument();
  });

  test("shows the current level when assessment is complete", () => {
    render(
      <CEFRPromptCard
        cefrSetting={{ enabled: true, level: 3, assessmentCompleted: true }}
        i18n={i18n}
        onOpenCEFR={jest.fn()}
      />
    );

    expect(screen.getByText(/当前等级/)).toBeInTheDocument();
    expect(screen.getByText(/B1/)).toBeInTheDocument();
  });
});
```

在 `src/views/Options/CEFRSetting.test.js` 写入：

```js
import { render, screen } from "@testing-library/react";
import CEFRSetting from "./CEFRSetting";

const updateSetting = jest.fn();
let mockCefrSetting = {
  enabled: false,
  level: 0,
  assessmentCompleted: false,
  levelSource: "unset",
  lastPromptFrom: "",
};

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      cefrSetting: mockCefrSetting,
    },
    updateSetting,
  }),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) =>
    ({
      cefr_onboarding_title: "开始你的 CEFR 测级",
      cefr_quiz_short_hint: "测试较短，可快速完成",
      cefr_take_quiz: "去做 CEFR 测试",
      cefr_current_level: "当前等级",
    }[key] || key),
}));

describe("CEFRSetting", () => {
  beforeEach(() => {
    mockCefrSetting = {
      enabled: false,
      level: 0,
      assessmentCompleted: false,
      levelSource: "unset",
      lastPromptFrom: "",
    };
  });

  test("shows onboarding guidance before assessment is completed", () => {
    render(<CEFRSetting />);

    expect(screen.getByText("开始你的 CEFR 测级")).toBeInTheDocument();
    expect(screen.getByText("测试较短，可快速完成")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "去做 CEFR 测试" })
    ).toBeInTheDocument();
  });

  test("shows the current level after assessment is complete", () => {
    mockCefrSetting = {
      enabled: true,
      level: 4,
      assessmentCompleted: true,
      levelSource: "quiz",
      lastPromptFrom: "settings",
    };

    render(<CEFRSetting />);

    expect(screen.getByText("当前等级")).toBeInTheDocument();
    expect(screen.getByText(/B2/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试并确认先失败**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/views/Options/cefrQuiz.test.js src/views/Options/CEFRSetting.test.js src/views/Popup/CEFRPromptCard.test.js
```

Expected: 失败，提示 `cefrQuiz` / `CEFRPromptCard` 尚不存在。

- [ ] **Step 3: 实现轻量题库、设置页三态 UI、popup 提醒卡片和文案**

在 `src/views/Options/cefrQuiz.js` 新建：

```js
export const CEFR_QUIZ_QUESTIONS = [
  {
    id: "q1",
    level: 1,
    prompt: "Choose the correct sentence: 'I ____ to the store yesterday.'",
    options: ["go", "went", "gone", "going"],
    answer: "went",
  },
  {
    id: "q2",
    level: 2,
    prompt: "Choose the correct word: 'She has lived here ____ 2020.'",
    options: ["for", "since", "during", "from"],
    answer: "since",
  },
  {
    id: "q3",
    level: 3,
    prompt: "Choose the best fit: 'If I ____ more time, I would travel more.'",
    options: ["have", "had", "will have", "having"],
    answer: "had",
  },
  {
    id: "q4",
    level: 4,
    prompt: "Choose the best fit: 'The proposal was rejected because it was too ____.'",
    options: ["vague", "noisy", "weekly", "gentle"],
    answer: "vague",
  },
  {
    id: "q5",
    level: 5,
    prompt: "Choose the best fit: 'Her explanation was remarkably ____ and easy to follow.'",
    options: ["lucid", "fragile", "casual", "literal"],
    answer: "lucid",
  },
];

export const CEFR_LEVEL_LABELS = {
  0: "Unknown",
  1: "A1",
  2: "A2",
  3: "B1",
  4: "B2",
  5: "C1",
  6: "C2",
};

export function resolveQuickCEFRLevel(results = []) {
  if (results.length === 0) return 1;

  const allCorrect = results.length > 0 && results.every(({ isCorrect }) => isCorrect);
  if (allCorrect) return 6;

  const highestSolved = results.reduce(
    (max, { level, isCorrect }) => (isCorrect ? Math.max(max, level) : max),
    1
  );

  return highestSolved;
}

export function getCEFRLevelLabel(level) {
  return CEFR_LEVEL_LABELS[level] || CEFR_LEVEL_LABELS[0];
}
```

在 `src/views/Popup/CEFRPromptCard.js` 新建：

```js
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { normalizeCEFRSetting } from "../../config";
import { getCEFRLevelLabel } from "../Options/cefrQuiz";

export default function CEFRPromptCard({ cefrSetting, i18n, onOpenCEFR }) {
  const normalized = normalizeCEFRSetting(cefrSetting);

  if (!normalized.assessmentCompleted) {
    return (
      <Alert
        severity="info"
        action={
          <Button color="inherit" size="small" onClick={onOpenCEFR}>
            {i18n("cefr_take_quiz")}
          </Button>
        }
      >
        {i18n("cefr_onboarding_short")}
      </Alert>
    );
  }

  return (
    <Alert
      severity="success"
      action={
        <Button color="inherit" size="small" onClick={onOpenCEFR}>
          {i18n("cefr_retake_quiz")}
        </Button>
      }
    >
      <Stack direction="row" spacing={1}>
        <span>{i18n("cefr_current_level")}</span>
        <strong>{getCEFRLevelLabel(normalized.level)}</strong>
      </Stack>
    </Alert>
  );
}
```

把 `src/views/Options/CEFRSetting.js` 改成三态页面，核心保存逻辑使用：

```js
const finishQuiz = (results) => {
  const level = resolveQuickCEFRLevel(results);

  updateSetting((prev) => ({
    ...prev,
    cefrSetting: {
      ...normalizeCEFRSetting(prev.cefrSetting),
      enabled: true,
      level,
      assessmentCompleted: true,
      levelSource: "quiz",
      lastPromptFrom: "settings",
    },
  }));
};

const handleManualLevelChange = (event) => {
  updateSetting((prev) => ({
    ...prev,
    cefrSetting: {
      ...normalizeCEFRSetting(prev.cefrSetting),
      enabled: true,
      level: Number(event.target.value),
      assessmentCompleted: true,
      levelSource: "manual",
      lastPromptFrom: "settings",
    },
  }));
};
```

把 `src/views/Popup/index.js` 的打开设置逻辑改成：

```js
import { CEFR_OPTIONS_HASH, openOptionsHash } from "../../libs/optionsPage";

const handleOpenSetting = useCallback((hash = "") => {
  openOptionsHash(hash);
}, []);

const handleOpenCEFR = useCallback(() => {
  openOptionsHash(CEFR_OPTIONS_HASH);
}, []);
```

把 `src/views/Popup/PopupCont.js` 顶部接入：

```js
import CEFRPromptCard from "./CEFRPromptCard";

<CEFRPromptCard
  cefrSetting={setting.cefrSetting}
  i18n={i18n}
  onOpenCEFR={() => handleOpenSetting("#/cefr")}
/>
```

并在 `src/config/i18n.js` 为以下 key 补齐多语言值：

```js
cefr_vocab
cefr_onboarding_title
cefr_onboarding_short
cefr_onboarding_body
cefr_take_quiz
cefr_skip_for_now
cefr_current_level
cefr_retake_quiz
cefr_enable_annotations
cefr_quiz_short_hint
```

同时把 `src/views/Options/Navigator.js` 里的 `"CEFR Vocab"` 改为 `i18n("cefr_vocab")`。

- [ ] **Step 4: 运行 UI 相关测试确认通过**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/views/Options/cefrQuiz.test.js src/views/Options/CEFRSetting.test.js src/views/Popup/CEFRPromptCard.test.js
```

Expected: 这 `3` 个测试文件通过，说明“短测级”约束、设置页 onboarding 状态和 popup 状态展示都稳定。

- [ ] **Step 5: 提交轻量测级 UI 与 popup 入口**

Run:

```bash
git add src/config/i18n.js src/views/Options/cefrQuiz.js src/views/Options/cefrQuiz.test.js src/views/Options/CEFRSetting.js src/views/Options/CEFRSetting.test.js src/views/Options/Navigator.js src/views/Popup/CEFRPromptCard.js src/views/Popup/CEFRPromptCard.test.js src/views/Popup/PopupCont.js src/views/Popup/index.js
git commit -m "feat: add lightweight CEFR onboarding UI"
```

### Task 4: 实现原文 DOM 标注与清理核心

**Files:**
- Modify: `src/libs/cefr.js`
- Modify: `src/libs/cefr.test.js`

- [ ] **Step 1: 先写失败测试，锁定“只标英文原文”“只标高于等级的词”“可清理”**

把 `src/libs/cefr.test.js` 改为：

```js
import {
  annotateNodeGroupWithCEFR,
  removeCEFRAnnotations,
  shouldAnnotateOriginalNodes,
} from "./cefr";

describe("shouldAnnotateOriginalNodes", () => {
  test("requires visible English source text and a completed CEFR assessment", () => {
    expect(
      shouldAnnotateOriginalNodes({
        sourceLang: "en",
        hideOrigin: false,
        cefrSetting: {
          enabled: true,
          level: 3,
          assessmentCompleted: true,
        },
      })
    ).toBe(true);

    expect(
      shouldAnnotateOriginalNodes({
        sourceLang: "zh-CN",
        hideOrigin: false,
        cefrSetting: {
          enabled: true,
          level: 3,
          assessmentCompleted: true,
        },
      })
    ).toBe(false);
  });
});

describe("annotateNodeGroupWithCEFR", () => {
  test("wraps only words above the user level", async () => {
    document.body.innerHTML = '<p id="root">The ubiquitous robot helps.</p>';
    const root = document.getElementById("root");

    await annotateNodeGroupWithCEFR({
      nodes: [...root.childNodes],
      sourceLang: "en",
      hideOrigin: false,
      cefrSetting: {
        enabled: true,
        level: 3,
        assessmentCompleted: true,
      },
      lookupWordLevel: async (word) =>
        word.toLowerCase() === "ubiquitous"
          ? { level: "C1", levelScore: 5, zh: "普遍的" }
          : null,
    });

    expect(root.querySelector(".kiss-cefr-word")).not.toBeNull();
    expect(root.querySelector(".kiss-cefr-gloss")).toHaveTextContent("普遍的");
    expect(root.textContent).toContain("ubiquitous");
  });

  test("skips annotation when original content is hidden", async () => {
    document.body.innerHTML = '<p id="root">The ubiquitous robot helps.</p>';
    const root = document.getElementById("root");

    const changed = await annotateNodeGroupWithCEFR({
      nodes: [...root.childNodes],
      sourceLang: "en",
      hideOrigin: true,
      cefrSetting: {
        enabled: true,
        level: 3,
        assessmentCompleted: true,
      },
      lookupWordLevel: async () => ({
        level: "C1",
        levelScore: 5,
        zh: "普遍的",
      }),
    });

    expect(changed).toBe(false);
    expect(root.querySelector(".kiss-cefr-word")).toBeNull();
  });
});

describe("removeCEFRAnnotations", () => {
  test("restores plain text and is safe to call twice", async () => {
    document.body.innerHTML = '<p id="root">The ubiquitous robot helps.</p>';
    const root = document.getElementById("root");

    await annotateNodeGroupWithCEFR({
      nodes: [...root.childNodes],
      sourceLang: "en",
      hideOrigin: false,
      cefrSetting: {
        enabled: true,
        level: 3,
        assessmentCompleted: true,
      },
      lookupWordLevel: async (word) =>
        word.toLowerCase() === "ubiquitous"
          ? { level: "C1", levelScore: 5, zh: "普遍的" }
          : null,
    });

    removeCEFRAnnotations(root);
    removeCEFRAnnotations(root);

    expect(root.querySelector(".kiss-cefr-word")).toBeNull();
    expect(root.textContent).toBe("The ubiquitous robot helps.");
  });
});
```

- [ ] **Step 2: 运行测试并确认先失败**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/libs/cefr.test.js
```

Expected: 失败，因为新 DOM helper 还不存在，旧测试实现也不再匹配。

- [ ] **Step 3: 把 `src/libs/cefr.js` 改成面向原文 DOM 的 helper**

把核心实现改成如下结构：

```js
/* global chrome */
import { normalizeCEFRSetting } from "../config";

let cefrDict = null;
let dictPromise = null;

export const CEFR_LEVEL_SCORES = {
  UNKNOWN: 0,
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

export const CEFR_WORD_CLASS = "kiss-cefr-word";
export const CEFR_GLOSS_CLASS = "kiss-cefr-gloss";
export const CEFR_ATTR = "data-kiss-cefr";
export const CEFR_WORD_REGEX = /\b[a-zA-Z]+\b/g;

export function isEnglishLang(lang = "") {
  return typeof lang === "string" && lang.toLowerCase().startsWith("en");
}

export function shouldAnnotateOriginalNodes({
  sourceLang = "",
  cefrSetting,
  hideOrigin = false,
}) {
  const normalized = normalizeCEFRSetting(cefrSetting);
  return (
    normalized.enabled &&
    normalized.assessmentCompleted &&
    !hideOrigin &&
    isEnglishLang(sourceLang) &&
    Number.isFinite(Number(normalized.level))
  );
}

export async function annotateNodeGroupWithCEFR({
  nodes,
  sourceLang = "",
  cefrSetting,
  hideOrigin = false,
  lookupWordLevel = getWordLevelInfo,
}) {
  if (
    !shouldAnnotateOriginalNodes({
      sourceLang,
      cefrSetting,
      hideOrigin,
    })
  ) {
    return false;
  }

  const userLevel = Number(normalizeCEFRSetting(cefrSetting).level);
  let changed = false;

  for (const rootNode of nodes) {
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest(`[${CEFR_ATTR}="1"]`)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const textNode of textNodes) {
      changed = (await annotateTextNode(textNode, userLevel, lookupWordLevel)) || changed;
    }
  }

  return changed;
}

async function annotateTextNode(textNode, userLevel, lookupWordLevel) {
  const text = textNode.textContent || "";
  const matches = [...text.matchAll(CEFR_WORD_REGEX)];
  if (matches.length === 0) return false;

  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let changed = false;

  for (const match of matches) {
    const word = match[0];
    const start = match.index || 0;
    const entry = await lookupWordLevel(word);

    if (!entry || entry.levelScore <= userLevel) {
      continue;
    }

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    const wordEl = document.createElement("span");
    wordEl.className = CEFR_WORD_CLASS;
    wordEl.setAttribute(CEFR_ATTR, "1");
    wordEl.dataset.word = word;
    wordEl.textContent = word;

    const glossEl = document.createElement("span");
    glossEl.className = CEFR_GLOSS_CLASS;
    glossEl.setAttribute("aria-hidden", "true");
    glossEl.textContent = entry.zh;
    wordEl.appendChild(glossEl);

    fragment.appendChild(wordEl);
    lastIndex = start + word.length;
    changed = true;
  }

  if (!changed) return false;

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(fragment, textNode);
  return true;
}

export function removeCEFRAnnotations(rootNode) {
  if (!rootNode?.querySelectorAll) return;

  rootNode.querySelectorAll(`[${CEFR_ATTR}="1"]`).forEach((wrapper) => {
    const rawWord = wrapper.dataset.word || wrapper.firstChild?.nodeValue || "";
    wrapper.replaceWith(document.createTextNode(rawWord));
  });

  rootNode.normalize?.();
}
```

- [ ] **Step 4: 重新运行测试确认通过**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/libs/cefr.test.js
```

Expected: DOM 标注、隐藏跳过与清理测试全部通过。

- [ ] **Step 5: 提交 CEFR DOM 标注核心**

Run:

```bash
git add src/libs/cefr.js src/libs/cefr.test.js
git commit -m "feat: add CEFR original-word annotation helpers"
```

### Task 5: 接入 background 首装引导与 translator 生命周期

**Files:**
- Modify: `src/background.js`
- Modify: `src/libs/translator.js`

- [ ] **Step 1: 先补一个失败测试，锁定隐藏原文时不标注**

在 `src/libs/cefr.test.js` 中追加这条回归测试：

```js
test("removeCEFRAnnotations keeps sibling translation wrappers untouched", () => {
  document.body.innerHTML = `
    <div id="root">
      <span class="kiss-cefr-word" data-kiss-cefr="1" data-word="ubiquitous">
        ubiquitous
        <span class="kiss-cefr-gloss" aria-hidden="true">普遍的</span>
      </span>
      <kiss-translator class="kiss-translator-wrapper">普遍存在的</kiss-translator>
    </div>
  `;

  const root = document.getElementById("root");
  removeCEFRAnnotations(root);

  expect(root.querySelector(".kiss-translator-wrapper")).not.toBeNull();
  expect(root.textContent).toContain("普遍存在的");
});
```

- [ ] **Step 2: 运行测试确认先失败**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/libs/cefr.test.js
```

Expected: 先失败，提醒 `removeCEFRAnnotations` 需要只清理 CEFR 包装而不动译文 wrapper。

- [ ] **Step 3: 在 background 中接入首次安装自动打开 `#/cefr`**

在 `src/background.js` 中接入共享 helper：

```js
import {
  CEFR_OPTIONS_HASH,
  openOptionsHash,
  shouldOpenCEFROnInstall,
} from "./libs/optionsPage";
```

并改 `onInstalled`：

```js
browser.runtime.onInstalled.addListener(async (details) => {
  await tryInitDefaultData();

  if (process.env.REACT_APP_CLIENT === CLIENT_THUNDERBIRD) {
    registerMsgDisplayScript();
  }

  const setting = await getSettingWithDefault();
  const { contextMenuType, csplist, orilist, subrulesList, cefrSetting } = setting;

  addContextMenus(contextMenuType);
  updateCspRules({ csplist, orilist });
  trySyncAllSubRules({ subrulesList });

  if (shouldOpenCEFROnInstall(details, cefrSetting)) {
    await openOptionsHash(CEFR_OPTIONS_HASH);
  }
});
```

- [ ] **Step 4: 在 translator 中接入原文标注与统一清理**

把 `src/libs/translator.js` 中的 CEFR import 改为：

```js
import {
  annotateNodeGroupWithCEFR,
  removeCEFRAnnotations,
} from "./cefr";
```

在 `#translateNodeGroup(...)` 中，删掉旧的 `maybeAnnotateTranslatedText(...)` 译文字符串处理，并在译文 wrapper 成功插入后接入：

```js
      this.#translationNodes.set(wrapper, {
        nodes,
        isHide: hideOrigin,
        hostNode,
      });

      if (hideOrigin) {
        this.#removeNodes(nodes);
      } else {
        await annotateNodeGroupWithCEFR({
          nodes,
          sourceLang: deLang || this.#rule.fromLang,
          hideOrigin,
          cefrSetting: this.#setting.cefrSetting,
        });
      }
```

在 `#removeTranslationElement(el)` 中先清 CEFR，再做原有的恢复/移除：

```js
  #removeTranslationElement(el) {
    const parentElement = el.parentElement;
    this.#processedNodes.delete(parentElement);

    const { nodes, isHide } = this.#translationNodes.get(el) || {};

    if (isHide) {
      this.#restoreOriginal(el, nodes);
    }

    removeCEFRAnnotations(parentElement);

    this.#translationNodes.delete(el);
    el.remove();

    if (this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_AFTERTRANS) {
      this.#removeHighlights(parentElement);
    }
    this.#removeBrTags(parentElement);
  }
```

同时删掉旧的 `translatedText = await maybeAnnotateTranslatedText(...)` 那段逻辑。

- [ ] **Step 5: 重新运行回归测试，确认清理不影响译文 wrapper**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/libs/cefr.test.js
```

Expected: CEFR 清理只还原原文包装，不会误删译文 wrapper。

- [ ] **Step 6: 提交 install 引导与 translator 接入**

Run:

```bash
git add src/background.js src/libs/translator.js src/libs/cefr.test.js
git commit -m "feat: wire CEFR onboarding and original-word annotations"
```

### Task 6: 全量验证与收尾

**Files:**
- Modify: `docs/superpowers/plans/2026-03-29-cefr-original-word-annotation.md`（仅勾选执行记录时）

- [ ] **Step 1: 跑本次变更的所有定向测试**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/libs/optionsPage.test.js src/views/Options/cefrQuiz.test.js src/views/Options/CEFRSetting.test.js src/views/Popup/CEFRPromptCard.test.js src/libs/cefr.test.js
```

Expected: 本次新增/改造的测试全部通过。

- [ ] **Step 2: 跑一次 Web 构建确认 React/扩展代码能编译**

Run:

```bash
pnpm build:web
```

Expected: `build:web` 完成，无编译错误。

- [ ] **Step 3: 检查差异是否只包含本次任务**

Run:

```bash
git status --short
git log --oneline --decorate -5
```

Expected: worktree 中只包含本计划相关文件改动，没有把原始工作区里的脏文件意外带进来。

- [ ] **Step 4: 若工作树干净则结束执行，否则在修复后补最后一次提交**

Run:

```bash
git status --short
```

Expected: 输出为空；如果这里仍有变更，先补对应修复并正常提交，不要为了“验证完成”额外制造空提交。
