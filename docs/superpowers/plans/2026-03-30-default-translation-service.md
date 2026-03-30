# Default Translation Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为插件增加“默认翻译服务”配置，让用户可把常用服务设为默认值，并可显式一键同步到整页、输入框、划词、字幕这几个入口，同时不破坏老用户当前配置。

**Architecture:** 把“默认服务”拆成两层：一层是纯配置归一化与应用 helper，负责旧设置回填、合法性校验以及把 `apiSlug` 写入各入口；另一层是 API 设置页 UI，负责展示默认服务下拉框和“一键应用到当前翻译入口”按钮。入口配置继续保持独立，不与默认服务做动态绑定。

**Tech Stack:** React 18, MUI 5, Jest + jsdom via `react-app-rewired test`, local storage/settings hooks, webextension options UI

---

## 文件结构与职责

- `docs/superpowers/specs/2026-03-30-default-translation-service-design.md`
  当前已批准的默认服务规格，计划执行时以它为准。
- `src/config/setting.js`
  新增 `defaultApiSlug` 默认值与归一化逻辑，确保老设置自动补齐。
- `src/libs/storage.js`
  让 `getSettingWithDefault()` 在默认服务缺失或非法时把归一化后的值持久化。
- `src/libs/defaultApi.js`
  新建纯函数 helper，集中处理“把某个 apiSlug 应用到 settings/rules”。
- `src/libs/defaultApi.test.js`
  新建 helper 单测，锁定各入口同步行为与全局规则补齐行为。
- `src/config/setting.test.js`
  扩展设置归一化测试，覆盖 `defaultApiSlug` 回填与非法值回退。
- `src/libs/storage.test.js`
  扩展持久化归一化测试，确保老设置会被写回带 `defaultApiSlug` 的新结构。
- `src/views/Options/Apis.js`
  新增默认服务设置区、默认服务切换逻辑、“一键应用到当前翻译入口”按钮，以及新建 API 后的默认服务确认提示。
- `src/views/Options/Apis.test.js`
  新建 UI 测试，覆盖默认服务切换与显式同步行为。
- `src/config/i18n.js`
  新增默认服务相关文案。

### Task 1: 用失败测试锁定默认服务归一化与应用 helper

**Files:**
- Create: `src/libs/defaultApi.js`
- Create: `src/libs/defaultApi.test.js`
- Modify: `src/config/setting.js`
- Modify: `src/config/setting.test.js`
- Modify: `src/libs/storage.js`
- Modify: `src/libs/storage.test.js`

- [ ] **Step 1: 先为设置归一化写失败测试**

在 `src/config/setting.test.js` 追加：

```js
import { DEFAULT_API_TYPE } from "./api";
import { normalizeSetting } from "./setting";

describe("normalizeSetting defaultApiSlug", () => {
  test("backfills missing defaultApiSlug for legacy settings", () => {
    expect(normalizeSetting({ darkMode: "light" })).toMatchObject({
      darkMode: "light",
      defaultApiSlug: DEFAULT_API_TYPE,
    });
  });

  test("keeps an existing enabled defaultApiSlug", () => {
    expect(
      normalizeSetting({
        defaultApiSlug: "OpenAI",
      })
    ).toMatchObject({
      defaultApiSlug: "OpenAI",
    });
  });

  test("falls back when defaultApiSlug points to a disabled api", () => {
    expect(
      normalizeSetting({
        defaultApiSlug: "OpenAI",
        transApis: [{ apiSlug: "OpenAI", isDisabled: true }],
      }).defaultApiSlug
    ).toBe(DEFAULT_API_TYPE);
  });
});
```

- [ ] **Step 2: 为应用 helper 写失败测试**

创建 `src/libs/defaultApi.test.js`：

```js
import { applyDefaultApiToRules, applyDefaultApiToSetting } from "./defaultApi";

describe("applyDefaultApiToSetting", () => {
  test("updates input, tranbox, and subtitle api fields only", () => {
    expect(
      applyDefaultApiToSetting(
        {
          inputRule: { apiSlug: "Microsoft", toLang: "en" },
          tranboxSetting: { apiSlugs: ["Microsoft"], toLang: "zh-CN" },
          subtitleSetting: { apiSlug: "Microsoft", toLang: "zh-CN" },
        },
        "OpenAI"
      )
    ).toMatchObject({
      inputRule: { apiSlug: "OpenAI", toLang: "en" },
      tranboxSetting: { apiSlugs: ["OpenAI"], toLang: "zh-CN" },
      subtitleSetting: { apiSlug: "OpenAI", toLang: "zh-CN" },
    });
  });
});

describe("applyDefaultApiToRules", () => {
  test("updates the global rule when it exists", () => {
    expect(
      applyDefaultApiToRules(
        [{ pattern: "*", apiSlug: "Microsoft" }, { pattern: "example.com" }],
        "OpenAI"
      )[0]
    ).toMatchObject({ pattern: "*", apiSlug: "OpenAI" });
  });

  test("creates the global rule when it is missing", () => {
    expect(applyDefaultApiToRules([{ pattern: "example.com" }], "OpenAI")).toEqual(
      expect.arrayContaining([expect.objectContaining({ pattern: "*", apiSlug: "OpenAI" })])
    );
  });
});
```

- [ ] **Step 3: 为 storage 持久化回填写失败测试**

在 `src/libs/storage.test.js` 追加：

```js
test("persists backfilled defaultApiSlug for legacy settings", async () => {
  window.localStorage.setItem(
    STOKEY_SETTING,
    JSON.stringify({
      darkMode: "light",
      cefrSetting: { enabled: true, level: 2 },
    })
  );

  const setting = await getSettingWithDefault();

  expect(setting.defaultApiSlug).toBe("Microsoft");

  const persisted = JSON.parse(window.localStorage.getItem(STOKEY_SETTING));
  expect(persisted.defaultApiSlug).toBe("Microsoft");
});
```

- [ ] **Step 4: 运行测试并确认先失败**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/libs/storage.test.js src/libs/defaultApi.test.js
```

Expected: FAIL，报新增 helper 或 `defaultApiSlug` 相关断言未满足。

- [ ] **Step 5: 实现最小归一化与 helper**

在 `src/config/setting.js` 中加入：

```js
import { DEFAULT_API_TYPE, DEFAULT_API_LIST } from "./api";

export const getEnabledApiSlugSet = (transApis = DEFAULT_API_LIST) =>
  new Set(
    (Array.isArray(transApis) ? transApis : DEFAULT_API_LIST)
      .filter((api) => api && api.apiSlug && !api.isDisabled)
      .map((api) => api.apiSlug)
  );

export const normalizeDefaultApiSlug = (
  defaultApiSlug,
  transApis = DEFAULT_API_LIST
) => {
  if (typeof defaultApiSlug !== "string" || !defaultApiSlug) {
    return DEFAULT_API_TYPE;
  }
  return getEnabledApiSlugSet(transApis).has(defaultApiSlug)
    ? defaultApiSlug
    : DEFAULT_API_TYPE;
};
```

并把 `DEFAULT_SETTING` 与 `normalizeSetting()` 改成：

```js
export const DEFAULT_SETTING = {
  // ...
  defaultApiSlug: DEFAULT_API_TYPE,
  transApis: DEFAULT_API_LIST,
  // ...
};

export const normalizeSetting = (setting) => {
  const baseSetting = isObject(setting) ? setting : {};
  const transApis = Array.isArray(baseSetting.transApis)
    ? baseSetting.transApis
    : DEFAULT_API_LIST;

  return {
    ...DEFAULT_SETTING,
    ...baseSetting,
    transApis,
    defaultApiSlug: normalizeDefaultApiSlug(
      baseSetting.defaultApiSlug,
      transApis
    ),
    cefrSetting: normalizeCEFRSetting(baseSetting.cefrSetting),
  };
};
```

创建 `src/libs/defaultApi.js`：

```js
import {
  DEFAULT_INPUT_RULE,
  DEFAULT_SUBTITLE_SETTING,
  DEFAULT_TRANBOX_SETTING,
  DEFAULT_RULES,
  GLOBLA_RULE,
} from "../config";

export const applyDefaultApiToSetting = (setting, apiSlug) => ({
  ...setting,
  inputRule: { ...DEFAULT_INPUT_RULE, ...(setting?.inputRule || {}), apiSlug },
  tranboxSetting: {
    ...DEFAULT_TRANBOX_SETTING,
    ...(setting?.tranboxSetting || {}),
    apiSlugs: [apiSlug],
  },
  subtitleSetting: {
    ...DEFAULT_SUBTITLE_SETTING,
    ...(setting?.subtitleSetting || {}),
    apiSlug,
  },
});

export const applyDefaultApiToRules = (rules, apiSlug) => {
  const list = Array.isArray(rules) ? rules : DEFAULT_RULES;
  const hasGlobal = list.some((rule) => rule.pattern === "*");
  if (!hasGlobal) {
    return [{ ...GLOBLA_RULE, apiSlug }, ...list];
  }
  return list.map((rule) =>
    rule.pattern === "*" ? { ...rule, apiSlug } : rule
  );
};
```

在 `src/libs/storage.js` 中把“是否需要写回归一化设置”的判断扩成整份 setting 对比：

```js
const originalSetting = JSON.stringify(setting);
const nextSetting = JSON.stringify(normalizedSetting);

if (setting && typeof setting === "object" && originalSetting !== nextSetting) {
  await setSetting(normalizedSetting);
}
```

- [ ] **Step 6: 再跑测试确认转绿**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/libs/storage.test.js src/libs/defaultApi.test.js
```

Expected: PASS。

- [ ] **Step 7: 提交纯配置层改动**

Run:

```bash
git add src/config/setting.js src/config/setting.test.js src/libs/storage.js src/libs/storage.test.js src/libs/defaultApi.js src/libs/defaultApi.test.js
git commit -m "feat: add configurable default translation service helpers"
```

### Task 2: 为 API 设置页接入默认服务选择与显式同步

**Files:**
- Create: `src/views/Options/Apis.test.js`
- Modify: `src/views/Options/Apis.js`
- Modify: `src/config/i18n.js`

- [ ] **Step 1: 先写 API 设置页失败测试**

创建 `src/views/Options/Apis.test.js`：

```js
import { act } from "react";
import { createRoot } from "react-dom/client";
import Apis from "./Apis";

const mockUpdateSetting = jest.fn();
const mockSuccess = jest.fn();
const mockSaveRules = jest.fn();

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) =>
    ({
      default_translate_service: "Default service",
      default_translate_service_help:
        "Changing this does not overwrite current entries automatically.",
      apply_default_service_to_entries: "Apply to current translation entries",
    }[key] || key),
}));

jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({ success: mockSuccess }),
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      defaultApiSlug: "Microsoft",
    },
      updateSetting: mockUpdateSetting,
    }),
}));

jest.mock("../../hooks/Rules", () => ({
  useRules: () => ({
    list: [{ pattern: "*", apiSlug: "Microsoft" }],
    save: mockSaveRules,
  }),
}));
```

并补两个测试：

```js
test("changing the default service only updates defaultApiSlug", () => {
  // 触发下拉框改成 OpenAI
  expect(mockUpdateSetting).toHaveBeenCalledWith(
    expect.objectContaining({ defaultApiSlug: "OpenAI" })
  );
});

test("apply button syncs the selected api into rules and entry settings", () => {
  // 点击按钮
  expect(mockUpdateSetting).toHaveBeenCalledWith(expect.any(Function));
  expect(mockSaveRules).toHaveBeenCalledWith(expect.any(Function));
  expect(mockSuccess).toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试并确认先失败**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/views/Options/Apis.test.js
```

Expected: FAIL，因为页面还没有默认服务 UI，也没有同步逻辑。

- [ ] **Step 3: 实现默认服务 UI 和一键同步**
- [ ] **Step 3: 实现默认服务 UI、新建 API 询问与一键同步**

在 `src/views/Options/Apis.js` 中：

```js
import { useSetting } from "../../hooks/Setting";
import { useRules } from "../../hooks/Rules";
import { applyDefaultApiToRules, applyDefaultApiToSetting } from "../../libs/defaultApi";
```

在组件顶部读取：

```js
const alert = useAlert();
const { setting, updateSetting } = useSetting();
const { list, save } = useRules();
const defaultApiSlug = setting?.defaultApiSlug;
const { enabledApis, userApis, builtinApis, addApi, deleteApi, copyApi } = useApiList();
```

新增事件：

```js
const handleDefaultApiChange = (event) => {
  updateSetting({ defaultApiSlug: event.target.value });
};

const handlePromptNewApiAsDefault = async (newApi) => {
  const shouldSetAsDefault = await confirm({
    title: i18n("default_translate_service_new_api_title"),
    message: (
      <>
        <div>{i18n("default_translate_service_new_api_intro")}</div>
        <div>{newApi.apiName}</div>
        <div>{i18n("default_translate_service_new_api_note")}</div>
      </>
    ),
    confirmText: i18n("set_as_default_service"),
    cancelText: i18n("cancel"),
  });

  if (shouldSetAsDefault) {
    updateSetting({ defaultApiSlug: newApi.apiSlug });
    alert.success(i18n("default_translate_service_set_to_new_api"));
  }
};

const handleApplyDefaultApi = () => {
  const apiSlug = defaultApiSlug;
  if (!enabledApis.some((api) => api.apiSlug === apiSlug)) {
    return;
  }

  updateSetting((prev) => applyDefaultApiToSetting(prev, apiSlug));
  save((prev) => applyDefaultApiToRules(prev || list, apiSlug));
  alert.success(i18n("default_translate_service_applied"));
};
```

并在 `Alert` 与“添加 API”按钮之间插入一个 `Box + Grid` 区域：

```jsx
<Box>
  <Grid container spacing={2} columns={12}>
    <Grid item xs={12} md={6} lg={4}>
      <TextField
        select
        fullWidth
        size="small"
        name="defaultApiSlug"
        label={i18n("default_translate_service")}
        value={defaultApiSlug}
        onChange={handleDefaultApiChange}
        helperText={i18n("default_translate_service_help")}
      >
        {enabledApis.map((api) => (
          <MenuItem key={api.apiSlug} value={api.apiSlug}>
            {api.apiName}
          </MenuItem>
        ))}
      </TextField>
    </Grid>
    <Grid item xs={12} md={6} lg={4}>
      <Button variant="outlined" onClick={handleApplyDefaultApi}>
        {i18n("apply_default_service_to_entries")}
      </Button>
    </Grid>
  </Grid>
</Box>
```

在 `src/config/i18n.js` 中新增：

```js
default_translate_service: {
  zh: "默认服务",
  en: "Default service",
},
default_translate_service_help: {
  zh: "修改这里不会自动覆盖当前入口配置；点击下方按钮才会同步到整页、输入框、划词和字幕。",
  en: "Changing this does not overwrite current entries automatically. Use the button below to sync page, input, selection, and subtitle entries.",
},
apply_default_service_to_entries: {
  zh: "应用到当前翻译入口",
  en: "Apply to current translation entries",
},
default_translate_service_applied: {
  zh: "默认服务已应用到当前翻译入口",
  en: "Default service applied to current translation entries",
},
default_translate_service_new_api_title: {
  zh: "设为默认服务？",
  en: "Set as default service?",
},
default_translate_service_new_api_intro: {
  zh: "已创建新的 API：",
  en: "New API created:",
},
default_translate_service_new_api_note: {
  zh: "这只会更新默认服务，不会自动覆盖当前翻译入口配置。",
  en: "This only updates the default service and does not overwrite current translation entries.",
},
set_as_default_service: {
  zh: "设为默认服务",
  en: "Set as default service",
},
default_translate_service_set_to_new_api: {
  zh: "新建 API 已设为默认服务",
  en: "New API set as default service",
},
```

- [ ] **Step 4: 运行 UI 测试并确认转绿**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/views/Options/Apis.test.js
```

Expected: PASS。

- [ ] **Step 5: 提交 UI 层改动**

Run:

```bash
git add src/views/Options/Apis.js src/views/Options/Apis.test.js src/config/i18n.js
git commit -m "feat: add default translation service settings UI"
```

### Task 3: 做整体验证并确认不影响现有 CEFR 相关能力

**Files:**
- Modify: `docs/superpowers/plans/2026-03-30-default-translation-service.md`（仅勾选执行状态时）

- [ ] **Step 1: 跑默认服务相关测试集合**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/libs/storage.test.js src/libs/defaultApi.test.js src/views/Options/Apis.test.js
```

Expected: PASS。

- [ ] **Step 2: 跑受影响的 CEFR 回归测试**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/views/Options/CEFRSetting.test.js src/views/Popup/CEFRPromptCard.test.js src/views/Popup/index.test.js src/libs/cefr.test.js
```

Expected: PASS；`src/views/Popup/index.test.js` 允许出现一次预期的 `unsupported tab` info 日志。

- [ ] **Step 3: 构建 Chrome 包**

Run:

```bash
pnpm build:chrome
```

Expected: 构建成功，无默认服务相关报错。

- [ ] **Step 4: 汇总结果并准备交付**

记录：

```text
- 默认服务下拉框是否可把 OpenAI 设为默认值
- “应用到当前翻译入口”是否同时更新整页、输入框、划词、字幕
- 老用户升级后是否不自动覆盖旧入口配置
- 现有 CEFR 功能测试与构建是否保持通过
```
