---
name: review-kiss-translator
description: Perform thorough, high-signal, read-only code and Pull Request reviews for fishjar/kiss-translator. Use when asked to review a PR, inspect local diffs, audit branch changes before merging, or evaluate whether a change achieves its goal without over-engineering or violating repository invariants.
---

# Review KISS Translator Code & PRs

本 Skill 为 `fishjar/kiss-translator` 的代码与 Pull Request 审查提供统一标准与只读执行流程，旨在精准识别真实风险（安全、跨端兼容、契约破坏、异步竞态、过度修改），同时抑制低价值挑刺噪音。

## 1. 安全边界与反噪音铁律

- **默认只读**：未获用户明确授权前，**禁止**修改工作区代码、暂存/提交 commit、切换破坏当前未提交改动的分支，或调用 `gh pr review` 发布公开评论。
- **证据优先，禁止臆测**：每条缺陷必须给出精确的 `文件路径:行号` 与触发场景；涉及 diff 之外的调用方、存储结构或协议时，必须先读取源码确认再下结论。
- **压制低价值噪音**：
  - 不纠结 Prettier 已自动管理的格式细节、主观命名偏好，或要求顺手重构与本次目标无关的历史代码。
  - 若改动克制或当前方案已合理，**直接明确肯定**，禁止为凑字数强行挑刺。
  - `[Nit]` 类微调默认克制，整份报告最多不超过 2 条；无实质收益不写。
- **语言规范**：默认使用**中文**输出审查报告；仅当审查英文外部 PR 且用户需要对外回复时，在报告末尾补充英文评论草稿。

---

## 2. 执行流程（SOP）

1. **收集变更上下文**：
   - 审查 GitHub PR：
     ```sh
     gh pr view <number> --json title,body,baseRefName,headRefName,files,commits,state
     gh pr diff <number>
     ```
   - 审查本地改动 / 分支：
     ```sh
     git status --short --branch
     git diff --stat
     git diff
     # 若对比目标分支：git diff dev...HEAD
     ```
   - 优先阅读 PR 描述与关联 Issue，明确改动的**宣称目标**。
2. **定位受影响子系统与契约**：
   - 结合 `docs/architecture.md` 判断改动涉及的子系统（扩展多进程、插件宿主、Local AI、文件翻译、YouTube 字幕/ASR、规则与同步等）。
   - 按需读取相关契约文档（如 `docs/contracts/prompt-template-contract.md`、`docs/contracts/image-parse-results.md`）以及被调用方/上层入口源码，切忌只看孤立 diff 片段。
3. **对照高危雷区逐项深审**（见第 3 节）。
4. **可选只读验证**：
   - 若当前本地工作区就是待审分支，可按需运行受影响模块的只读单测（如 `CI=true pnpm test --watch=false <path>`、`pnpm test:local-ai`、`pnpm test:icons-gen` 等），不得改动文件。
   - 若无法运行某些检查（如真实浏览器测试、Firefox 构建），在报告中诚实标注为“未验证盲区”。
5. **按第 5 节标准模板输出审查报告**。

---

## 3. KISS Translator 专属高危雷区清单

### 3.1 工程与 PR 合规红线
- PR 目标分支是否为 `dev`（严禁直接合入或推送 `master`）？
- 是否违规手动修改了 `.env` 或 `public/manifest*.json` 中的版本号（应统一由 `pnpm version:*` / `pnpm sync-version` 管理）？
- 修改图标映射后，是否同步运行 `pnpm gen:icons` 更新 `src/components/icons/index.js`、`src/components/icons/lucide/index.js` 与 `public/icons-license.txt`？
- 是否混入 `build/`、`.local-ai-build/`、`tmp/`、本地调试日志或 `.patch` 文件？
- 是否引入在 `CI=true` 下会导致 CRA 生产构建失败的 ESLint 警告（未使用变量、React Hooks 依赖告警等）？

### 3.2 多端运行与隔离边界
- 改动是否只验证了 Chrome/Edge，却破坏了 Firefox、Thunderbird、油猴脚本（`src/userscript.js` / `src/libs/gm.js`）或 Web 端？
- `src/content.js`、页面注入脚本（`src/injector-subtitle.js` / `src/injector-shadowroot.js`）或 `src/fileBridge.js` 是否越权接触/透传后台凭证，或破坏消息来源校验？
- 涉及 `src/localAi/` 时，是否守住 Webpack 宿主（`src/localAi/runtime/runtimeManager.webpack.js`）与 Vite 子构建（`vite.config.local-ai.ts`）的隔离边界？

### 3.3 安全与隐私边界
- 外部接口插件相关改动是否守住网络白名单（`src/providers/packageNetwork.js`、`src/providers/originRules.js`）、Worker 隔离（`src/providers/scriptWorker.js`）及“授权仅存本机不同步”原则？
- 动态 HTML、译文、字幕、EPUB 或 PDF 渲染是否经过 `dompurify` / `src/libs/trustedTypes.js` 净化，避免 XSS？
- 新增日志或错误导出是否可能泄露 API Key / Token（参照 `src/libs/diagnostics/privacy.js`）？

### 3.4 协议与向后兼容
- 提示词与模板改动是否遵守 `docs/contracts/prompt-template-contract.md`（显式占位符、空模板对回退、不隐式追加内容）？
- 图片/PDF 视觉解析改动是否遵守 `docs/contracts/image-parse-results.md`（`image-json` 协议、`includesLayout` / `includesTranslation` 边界）？
- 设置项、缓存键或同步数据结构变更是否向后兼容旧版本用户数据，不会导致升级后配置丢失或崩溃？

### 3.5 异步竞态、状态与资源释放
- 网页翻译、流式响应、YouTube 字幕切换、文件/图片分阶段处理中，是否正确处理取消（`AbortSignal`）、迟到响应覆盖新状态、重复触发等问题？
- MutationObserver / IntersectionObserver、DOM 事件监听、定时器、Web Worker 或大型缓存对象是否按生命周期清理，避免内存泄漏？

### 3.6 改动克制性、注释与测试覆盖
- 是否存在过度修改（无关重构、顺手改相邻代码、为一次性逻辑引入过度抽象、多余的配置项）？
- 新增或修改的非显而易见逻辑是否包含合理的代码注释（说明设计意图、边界条件或约束原因，避免仅复述字面含义的冗余注释）？
- 改动核心逻辑或修 Bug 时，是否补充/更新了对应单测（Jest / Vitest / `node --test`）？测试是否真正覆盖根因路径，而非仅测 Mock？

---

## 4. 严重级别定义

| 级别 | 定义 | 典型示例 |
| :--- | :--- | :--- |
| **P0 阻断** | 必现崩溃、数据丢失、安全漏洞、破坏核心协议或违反仓库红线 | XSS、凭证泄露、插件白名单绕过、旧配置升级损坏、误改 manifest 版本号、`CI=true` 构建失败 |
| **P1 重要** | 特定场景下逻辑错误、跨端回归、异步竞态覆盖、内存/资源泄漏 | 迟到响应覆盖新状态、Firefox/油猴回归、未取消的异步任务、关键边界未处理 |
| **P2 建议** | 可维护性问题、重复逻辑、缺失关键单元测试 | 核心逻辑改动缺回归测试、可明显简化的实现 |
| **Nit 微调** | 非阻断的小优化（默认克制，全文最多 2 条） | 明显误导性的注释或标识符 |

---

## 5. Review 报告标准输出模板

每次完成审查后，必须按以下结构输出报告：

```markdown
## 审查结论

- **结论**：`建议合入 (Approve)` / `需修改后再合入 (Request Changes)` / `补充讨论 (Comment)`
- **一句话总结**：<概括本次改动的核心评价与是否可合入的主要依据>

---

## 1. 改动分析与方案评估

### 主要目的
- <用 2~3 句话提炼本次 PR / Diff 的核心目标与试图解决的问题，标注关联 Issue（如有）>

### 是否达到效果
- **达成度**：`完全达成` / `部分达成（有遗漏）` / `未达成`
- **分析**：<对照核心路径与边界条件，说明实现是否真正解决宣称的问题；如有遗漏的场景、异常分支或受影响的其他运行端，明确指出>

### 是否存在过度修改（Scope & Simplicity）
- **评估**：`改动克制` / `存在轻度无关改动` / `存在过度设计或越界修改`
- **分析**：<检查是否包含无关重构、顺手改相邻代码、过度抽象、多余配置项或无关文件混入；若改动干净克制，直接肯定>

### 是否有更好的方案
- **评估**：`当前方案合理` / `存在更优方案`
- **分析**：<从架构一致性、复杂度、性能与维护成本评估是否存在更简单/更稳妥的替代方案；若有，给出简明对比与权衡；若当前方案已合理，明确说明无需推倒重来>

---

## 2. 具体问题清单（按严重级别排序）

> 若无问题，写“未发现阻断或重要缺陷”。

### [P0 阻断] <问题简述>
- **位置**：`path/to/file.js:L120-L135`
- **问题与触发条件**：<结合真实代码路径说明触发方式与后果>
- **最小修复建议**：<聚焦、可落地的改法>

### [P1 重要] <问题简述>
- **位置**：`path/to/file.js:L45`
- **问题与触发条件**：<逻辑边界、跨端兼容、异步竞态或资源泄漏>
- **最小修复建议**：<建议改法>

### [P2 建议] <问题简述>
- **位置**：`path/to/file.js:L80`
- **说明与建议**：<可维护性或测试缺口>

### [Nit 微调]（可选，全文最多 2 条）
- `path/to/file.js:L12`：<简短说明>

---

## 3. 核查与验证摘要

- **已核查的仓库红线**：分支目标（`dev`）、版本号规范、图标生成、工作区清洁度、安全/契约边界、多端影响。
- **测试覆盖评估**：<说明新增/修改的测试是否覆盖根因路径，或指出缺失的关键测试用例>
- **本次未验证盲区**：<诚实列出受限于环境未运行的项，例如：未运行真实浏览器验证 / 未构建 Firefox 等>
```

> 若审查对象为英文外部 PR 且用户需要对外回复，可在报告末尾追加 `## 4. 英文 PR 评审评论草稿`，仅保留礼貌、聚焦 P0/P1 的核心意见。
