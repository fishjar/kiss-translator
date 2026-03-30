# Modern Options Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置页默认语言切到中文，并把设置页升级成更现代的控制台风格，在不改变主要信息架构和功能逻辑的前提下明显提升视觉品质。

**Architecture:** 先用测试锁定“默认语言改为中文”和“设置页壳层能稳定渲染”两个底线，再把现代化体验拆成三层推进：专属 options 主题、页面壳层与导航、共享内容容器和高频页面接入。这样 popup 与其他页面不被误伤，设置页内的高频页面也能共享统一的视觉语言。

**Tech Stack:** React 18, React Router 6, MUI 5, Jest + jsdom via `react-app-rewired test`

---

## 文件结构与职责

- `docs/superpowers/specs/2026-03-30-modern-options-experience-design.md`
  已批准的设计规格，执行时以它为准。
- `src/config/setting.js`
  将默认 `uiLang` 改为 `zh`。
- `src/config/setting.test.js`
  锁定默认语言改动不会覆盖已有 `uiLang`。
- `src/views/Options/Layout.js`
  重做设置页壳层与主体布局。
- `src/views/Options/Layout.test.js`
  新建壳层 smoke test。
- `src/views/Options/Header.js`
  升级顶部头部视觉。
- `src/views/Options/Navigator.js`
  升级左侧导航为更现代的分组面板样式。
- `src/views/Options/OptionsPageShell.js`
  新建页面级展示容器，统一标题区和说明文案。
- `src/views/Options/OptionsSectionCard.js`
  新建内容分组卡片，统一表单分组视觉。
- `src/views/Options/Setting.js`
  作为样板页重组内容分区。
- `src/views/Options/Apis.js`
  接入新的页面容器和内容卡片。
- `src/views/Options/CEFRSetting.js`
  接入新的页面容器和内容卡片。
- `src/views/Options/About.js`
  让 markdown 内容适配新的面板风格。
- `src/views/Options/index.js`
  只给 settings 页面注入专属 theme 和全局样式。
- `src/views/Options/theme.js`
  新建 options 专属主题 token、组件 overrides、背景样式。

### Task 1: 用失败测试锁定默认中文与设置页壳层基线

**Files:**
- Create: `src/views/Options/Layout.test.js`
- Modify: `src/config/setting.test.js`
- Modify: `src/config/setting.js`

- [ ] **Step 1: 先给默认语言写失败测试**

在 `src/config/setting.test.js` 追加：

```js
test("defaults uiLang to zh for new settings", () => {
  expect(normalizeSetting({}).uiLang).toBe("zh");
});

test("preserves an existing uiLang choice", () => {
  expect(normalizeSetting({ uiLang: "en" }).uiLang).toBe("en");
});
```

- [ ] **Step 2: 为设置页壳层写失败 smoke test**

创建 `src/views/Options/Layout.test.js`：

```js
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "./Layout";

jest.mock("@mui/material/useMediaQuery", () => jest.fn(() => true));
jest.mock("./Header", () => () => <div>Header</div>);
jest.mock("./Navigator", () => () => <div>Navigator</div>);

function Screen() {
  return <div>Screen</div>;
}
```

并补测试：

```js
test("renders the options shell with navigation and page content", () => {
  // render Layout inside MemoryRouter
  // assert Header, Navigator, Screen are all present
});
```

- [ ] **Step 3: 运行测试并确认先失败**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/views/Options/Layout.test.js
```

Expected: FAIL，因为 `uiLang` 还是 `en`，且 `Layout.test.js` 尚未存在或壳层未按测试结构渲染。

- [ ] **Step 4: 实现最小基线改动**

在 `src/config/setting.js` 中把：

```js
uiLang: "en"
```

改为：

```js
uiLang: "zh"
```

并新建 `src/views/Options/Layout.test.js` 的完整渲染测试实现。

- [ ] **Step 5: 再跑测试确认转绿**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/views/Options/Layout.test.js
```

Expected: PASS。

### Task 2: 建立 options 专属主题与现代化壳层

**Files:**
- Create: `src/views/Options/theme.js`
- Modify: `src/views/Options/index.js`
- Modify: `src/views/Options/Layout.js`
- Modify: `src/views/Options/Header.js`
- Modify: `src/views/Options/Navigator.js`

- [ ] **Step 1: 先为 options 主题接线写失败验证**

在 `src/views/Options/Layout.test.js` 再补一个断言，锁定主容器 class 或文本结构，比如：

```js
expect(container.querySelector("main")).toBeTruthy();
expect(container.textContent).toContain("Screen");
```

如果为壳层新增 `data-testid="options-shell"`，则在测试中显式断言它存在：

```js
expect(container.querySelector('[data-testid="options-shell"]')).toBeTruthy();
```

- [ ] **Step 2: 运行测试确认基线仍然受控**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/views/Options/Layout.test.js
```

Expected: PASS，确认我们接下来只是在这个壳层上增强，而不是推倒重来。

- [ ] **Step 3: 新建 options 专属主题文件**

创建 `src/views/Options/theme.js`，导出：

```js
export const optionsThemeOptions = { ... };
export const optionsGlobalStyles = (theme) => ({ ... });
```

主题要求：

- 暖色背景与更柔和的表面层级
- 更大的圆角
- 更克制的阴影
- `MuiPaper`、`MuiButton`、`MuiOutlinedInput`、`MuiDrawer`、`MuiListItemButton` 的统一 override
- 自定义中文优先的字体栈

- [ ] **Step 4: 只在设置页注入专属主题**

在 `src/views/Options/index.js` 中把：

```jsx
<ThemeProvider>
```

改为：

```jsx
<ThemeProvider options={optionsThemeOptions} styles={optionsGlobalStyles}>
```

并从 `./theme` 导入对应配置。

- [ ] **Step 5: 重做 Layout、Header、Navigator**

在 `src/views/Options/Layout.js` 中：

- 增加背景层和最大宽度控制
- 给壳层加 `data-testid="options-shell"`
- 让导航与正文形成更清楚的双栏关系

在 `src/views/Options/Header.js` 中：

- 弱化旧 `AppBar` 工具栏感
- 加入更现代的品牌标题和说明

在 `src/views/Options/Navigator.js` 中：

- 按“基础 / 翻译模式 / 学习 / 工具”分组
- 当前项做更轻的选中态
- 桌面端像固定面板，移动端仍是抽屉

- [ ] **Step 6: 跑壳层测试**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/views/Options/Layout.test.js
```

Expected: PASS。

### Task 3: 用共享容器整理高频页面并做整体验证

**Files:**
- Create: `src/views/Options/OptionsPageShell.js`
- Create: `src/views/Options/OptionsSectionCard.js`
- Modify: `src/views/Options/Setting.js`
- Modify: `src/views/Options/Apis.js`
- Modify: `src/views/Options/CEFRSetting.js`
- Modify: `src/views/Options/About.js`

- [ ] **Step 1: 先抽共享展示层组件**

创建 `src/views/Options/OptionsPageShell.js`，提供：

```jsx
export default function OptionsPageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}) {
  // title block + actions + content stack
}
```

创建 `src/views/Options/OptionsSectionCard.js`，提供：

```jsx
export default function OptionsSectionCard({
  title,
  description,
  children,
}) {
  // Paper + Stack wrapper
}
```

- [ ] **Step 2: 先整理基础设置页**

在 `src/views/Options/Setting.js` 中按以下顺序改版：

- 顶部 `OptionsPageShell`
- 第一组：界面与基础行为
- 第二组：翻译策略与检测
- 第三组：安全、缓存与高级项
- 导入/导出放到标题区 actions

保持所有原有字段和写入逻辑不变。

- [ ] **Step 3: 让 API、CEFR、About 页对齐新节奏**

在 `src/views/Options/Apis.js` 中：

- 用 `OptionsPageShell` 包住页面
- 把默认服务区域、添加 API 操作、用户 API 列表、内置 API 列表拆成卡片组

在 `src/views/Options/CEFRSetting.js` 中：

- 用 `OptionsPageShell` 包住页面
- 把 onboarding、quiz、已配置状态放进更统一的卡片节奏

在 `src/views/Options/About.js` 中：

- 用 `OptionsPageShell` 包住页面
- 给 markdown 内容一个更舒服的阅读面板

- [ ] **Step 4: 跑受影响测试集合**

Run:

```bash
CI=true pnpm test -- --watch=false --runInBand --runTestsByPath src/config/setting.test.js src/views/Options/Layout.test.js src/views/Options/Apis.test.js src/views/Options/CEFRSetting.test.js
```

Expected: PASS。

- [ ] **Step 5: 构建 Chrome 包**

Run:

```bash
pnpm build:chrome
```

Expected: 构建成功，无 options 页面相关错误。

- [ ] **Step 6: 手工结果检查清单**

确认：

```text
- 新用户默认语言是中文
- 设置页桌面端壳层、导航、正文卡片层次明显提升
- 移动端导航抽屉仍可用
- 基础设置、API、CEFR、About 四页视觉语言统一
- 深色模式仍能切换
```
