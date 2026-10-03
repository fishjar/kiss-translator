# PDF 文件翻译实现与验收记录

日期：2026-10-02。对应 `tmp/pdf/浏览器插件 PDF → Markdown 开发指导.md` 和四阶段实施计划。

本文区分代码实现、自动测试、浏览器实际输出和待验收项目。当前不能视为全部发布验收通过；没有提交、推送或发布。

## 使用流程

1. `pnpm start:homepage`，打开 `http://localhost:3000/file-translate.html`。
2. 上传 PDF，立即读取页数和书签，显示目录、PDF 原文、Markdown 三栏。
3. 无扩展也可阅读，明确选择 Fast 后可本地解析。Smart 需要新版扩展和 DOC 模型；缺模型时提示安装，不自动改为 Fast。
4. 解析结束后检查 Markdown，再连接扩展开始翻译。
5. 右侧切换原文、译文、双语或只读源码。正式译文／双语导出要求所有可翻译块成功。
6. 下载 Markdown、独立 HTML，或带 `assets/` 图片的 ZIP。

桌面目录默认 240px，限制 180–360px；中右栏默认各半，最小 320px。分隔线支持拖动、方向键和双击复位。窄屏切换目录抽屉与 PDF／Markdown 标签。偏好位于网页 localStorage 的 `kiss_pdf_reader`。

PDF 原文始终独立保留。目录与“定位原文”联动；普通滚动独立，可显式开启按来源映射的同步。源码视图不同步。

## 阶段一：DOC

代码：`src/localAi/core/docClient.ts`、`docLayout.ts`、`docVision.ts`、`src/localAi/workers/doc-worker.ts`，及现有 catalog、模型管理和 RuntimeManager 的增量接入。

- 新增 `doc-layout` 任务和 `doc` RPC 服务，模型中心 DOC 分类、本地 AI DOC 页。
- 接入既有调度、预算、取消、卸载、空闲回收、状态和 sessionVersion。取消通过销毁 DOC Worker 中止底层运行。
- 固定 `Bei0001/PP-DocLayoutV3-ONNX` revision：`ff677269004f03007705f3e7f1bc8d0f4546d299`，Apache-2.0。
- ONNX 图：5,088,167 字节，SHA-256 `c0721928ff08741bb208ebed539c77170db5234a68cb7e546e6cc9bc172a695b`。
- 外部权重：136,774,480 字节，SHA-256 `34df3e4b79d7bbbf82abce1b4f3cde3d540fa57ad42ec8905c352b97c408d437`。
- 同时登记 config 和 preprocessor config。权重由用户下载至 OPFS，不进入安装包。
- 采用 RGB、OpenCV cubic 800×800、1/255、NCHW；四输出、sigmoid 类别、框解码、投票阅读顺序、掩码裁剪与轮廓后处理。
- OCR 和 DOC 共享既有 OpenCV／ORT 资源，不复制引擎。
- 当前 catalog 只开放真实跑通的 WASM；WebGPU 尚未通过真实验收，不能标记为可用。

真实验证使用独立 localhost 浏览器探针运行生产 DOC Worker，而不是模拟输出。模型下载、大小和 SHA 校验、OPFS 写入、外部权重加载和两份非正方形首页推理均完成。此探针不能代替扩展模型中心安装验收。

| 输入首页 | 图像尺寸 | 区域数 | 浏览器 WASM | 原生 ORT CPU | 最大置信度差 | 最大框坐标差 |
| --- | --- | --- | --- | --- | --- | --- |
| 2601.01674v1.pdf | 774×1095 | 23 | 约 10.18 秒 | 约 1.89 秒 | 0.000595 | 0.0304 px |
| 2601.00597v2.pdf | 774×1095 | 13 | 约 9.64 秒 | 约 1.91 秒 | 0.000672 | 0.00870 px |

CPU 对照使用 Python OpenCV 独立预处理和 onnxruntime-node 推理。有效区域的阅读顺序相同；未过阈值查询的绝对投票排名存在数值差异。轮廓多边形及全页语义质量尚未完成独立人工验收。

复现：

```powershell
pnpm build:edge-dev
pnpm build:homepage
node src/scripts/verify-doc-browser.mjs
# 在 http://127.0.0.1:3001 点击安装并验证两份样本
# 使用 Python 环境，将 opencv-python-headless 安装到临时目录：
python -m pip install --target tmp/doc-reference-deps opencv-python-headless==4.12.0.88
node src/scripts/verify-doc-reference.mjs <python.exe路径>
```

探针仅监听 127.0.0.1，验收产物写入 `tmp/doc-validation/`；原始 PNG、浏览器 JSON、CPU 对照 JSON 可保留复核，不包含在发布包。

## 阶段二：读取与三栏

代码：`src/libs/pdf/pdfDocument.js`、`src/views/FileTranslate/PdfPage.js`、`PdfWorkspace.js` 和 CSS。

- 固定 PDF.js 5.4.624，主库与本地 Worker 一致，CMap、字体、解码资源本地发布。
- 读取页数、旋转尺寸和层级书签，支持密码请求、错误密码及文件头检查。
- 可见页与邻近页 Canvas／文字层渲染，连续阅读、页码、缩放、适宽、选择复制。
- 不调用 PDF 脚本；禁用 eval。换文件／卸载取消 render task、销毁文档并释放 Canvas、文字层与对象 URL。
- 状态和警告独立于目录。旧扩展或断连仍可浏览原文、运行 Fast。

已有浏览器证据：两份样本均读取页数和原文，分别完成 9 页和 6 页 Fast 解析。最终第二份截图位于 `tmp/doc-validation/pdf-three-pane.jpg`。目录选择第 2 页标题后，PDF 页码为 2、Markdown 定位块为 `p2-b5`；阅读／源码切换仍保持该块。源码生成 158 个可定位 span，滚动同步控件禁用。目录分隔线方向键验证 240→256→240。800px 断点的目录抽屉／标签 DOM 已检查，窄屏全套交互仍待人工核对。

待验收：密码／旋转／损坏／大文件的完整矩阵、所有页面显示、长期内存变化及不同浏览器文字选择行为。

## 阶段三：结构与定位

代码：`src/libs/pdf/structure.js`、`structure-worker.js`、`nativeTables.js`、`pdfParser.js`。

- Raw IR 保留 span、字体、baseline、变换、标记内容、结构树、图片／路径几何与可识别链接。
- 统一为旋转后 scale=1 的页面左上角坐标。
- 规则恢复行、段落、字号／标签标题、列表、图注、上下标、多栏顺序和重复页眉页脚。
- 使用稳定 block ID、fragments、来源与 warnings；跨页段落只在严格证据成立时合并。
- 原生对齐数值表格采用保守检测；重复表头、列宽和跨页位置一致的原生表格可以合并。
- Smart 融合布局，未命中的原生文字继续保留；行内公式保持原生文字，作为原段落中的 Markdown 数学节点保护，避免拆散正文。复杂显示公式和表格按需 VLM，扫描／乱码页面按需 OCR。
- 图片保留；Fast 对识别到的矢量区域保留图像和提示。失败区域保留图像，支持重试。
- JEV 默认关闭，仅请求结构候选判断。布局、视觉与判断结果限当前文档缓存。
- 三个新增桥接方法限制模型任务、后端、区域任务及候选大小，复用既有分块上传、会话、取消和超时。
- 书签先显示，补充标题；未匹配书签仍可跳 PDF。块回定位、跨页 fragments 高亮及可选同步均已接入。

`node src/scripts/verify-pdf-structure.mjs` 已检查两份样本共 15 页：第一份 2,162 个原生 span、804 行、572 块、26 个标题候选；第二份 541 个 span、269 行、155 块、5 个标题候选。每页非空，横向原生 span 不丢失／不重复，首页多栏顺序和换行标题通过检查。这不等于公式／表格质量全部通过。

已知质量边界：任意复杂多栏、跨页复杂 HTML 表格、未标记脚注与原生复杂公式的结构恢复仍可能需要图像兜底或人工检查；行内原生公式目前保留 Unicode 上下标，并非完整 LaTeX 重建。Fast 的个别页码、图中文字仍可能进入正文，需要对照原文检查。应继续用扫描、混合、合并单元格、tagged 和旋转 PDF 补充人工验收。

## 阶段四：Markdown 翻译与导出

代码：`src/libs/document/markdown.js`、`export.js`；PDF 与直接上传 Markdown 使用同一套 AST、翻译和渲染能力。

- remark／rehype 支持 GFM、数学、脚注、链接和净化后的受限 HTML。
- 按块翻译；保护代码、数学、图片、链接目标／标题、HTML 属性和表格合并单元格。
- 损坏占位符和文字块结构变化判为失败，保留原文与重试入口。
- 翻译调用既有扩展服务，PDF 使用独立场景；已完成块保留，取消后续处理，不重新翻译已有成功块。
- 原文／译文／双语、阅读／只读源码切换，稳定块定位。图片、代码和数学资源在双语中避免重复。
- HTML 渲染统一 DOMPurify、KaTeX trust=false；不同块的脚注 DOM ID 分开。
- MD 导出内嵌本地图片；ZIP 使用 assets 相对路径；HTML 内嵌图片、样式与数学字体。
- 相对图片路径缺失提示，当前不支持 Markdown 文件夹上传。

自动测试覆盖数学／代码／复杂链接保护、表格 rowspan／colspan、HTML 安全、占位符损坏、取消／失败重试、MD 图片、ZIP 路径、独立 HTML 字体与图片内嵌。

## 自动检查与发布边界

- TypeScript 检查已通过。
- Local AI Vitest：30 套件、224 项通过，包含主要字号统计和行内公式保护回归测试。
- 文件翻译 Jest：5 套件、69 项通过，包含 TXT／图片／EPUB 既有回归。
- Chrome、Firefox、Edge 开发版、homepage／组合网站构建通过；最终产物需继续保持构建检查通过。
- homepage 排除 Local AI 引擎和权重。新增本地 PDF 资源约 3,059,209 字节，数学资源约 1,880,229 字节（未压缩，不含入口 JS）。
- Edge 调试启动使用已有隔离 profile 和 `pnpm debug:edge`，没有修改日常用户 profile。

**当前验收阻断：** 浏览器自动化工具没有 Edge 控制入口，并拒绝访问扩展协议页面（仅允许 HTTP／HTTPS）。未绕过这个限制。因此真实 Edge 插件握手、模型中心安装、Smart 全文解析、真实服务双语翻译与最终下载闭环尚未完成；不能把独立 Worker 输出或单元测试算作这条链路验收成功。

发布前仍须：完成两份样本全部页面的 Smart 人工核对、真实翻译／导出闭环、断连／重载／资源不足矩阵、DOC 真实取消卸载及 WebGPU 验证。插件先发布，网页随后发布；当前没有执行发布。
