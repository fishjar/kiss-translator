# 文件图片与 PDF 视觉解析接入

## 使用与边界

文件图片、网页图片、截图及 PDF 普通文字区域共用视觉请求构造、服务调用、结果校验和译文复用规则。选择原文识别、图片翻译或双语解析提示词表达任务，无需切换额外模式。

- 图片解析已有有效目标译文时跳过文本翻译，只对缺译且有原文的内容调用所选文本服务。仅识别不补译。
- 文件图片的布局服务空值现在表示“不调用独立界面分析服务”。原先依赖空值自动选择的用户需要显式选择一次服务；已有明确选择保留。
- 整图识别服务声明 `includesLayout: true` 时，自动跳过独立布局服务。宿主保留已保存的选择，切换回普通 OCR 时恢复使用。主动版面分析与已选区域仍可单独执行。
- PDF 首版支持已有普通文字区域和手动“识别图中文字”。Smart 仍需要独立布局服务或已有布局，不增加整页融合布局。
- PDF 表格 HTML、公式 LaTeX、文字层、页码、结构恢复及传统文本的保护校验保留原路径。
- 全文双语作为整体展示；区域双语按 ID 对应。仅译文不制造原文，PDF 可保留所属原图区域。
- 开始识别前等待该场景的最新排队保存完成，避免乐观更新的语言或术语尚未落盘时读取旧设置。
- 切换文本兜底服务保留视觉结果；修改视觉服务、视觉提示词、语言或术语，使相关结果失效。原图回填仍要求真实文字坐标。

文件桥接协议保持 1，`recognizeImage` 增加可选场景 `kind: image | pdf`；宿主从保存的场景读取语言与术语，页面不传服务凭据。新宿主通过 `features.structuredImageResults` 声明支持，并提供解析指纹。新页面连接旧宿主时隐藏已知结构化预设并提示升级；旧页面的原文识别请求继续工作，结构化选择要求刷新页面。

## 自动化验证

2026-11-18，固定响应，不依赖公共接口：

- 宿主核心、桥接、缓存、网页图片及文件设置：16 套、305 项通过。
- 文件图片处理阶段：33 项通过，包括仅译文、双语、区域补译、仅识别、兜底服务切换、取消和迟到响应。
- PDF／文档：8 套、140 项通过，包括区域缓存、坐标映射、仅译文原图引用、跨页边界、公式、表格保护及导出。
- 官方插件宿主集成：146 项通过；使用测试宿主版本 2.2.6 运行，未修改正式版本或插件包。

主要命令：

```sh
CI=true pnpm test --watch=false --runInBand --silent src/fileTranslation src/providers/imageResult.test.js src/config/setting.test.js src/views/FileTranslate/PdfWorkspace.test.js src/views/FileTranslate/ScenePromptSelect.test.js src/views/FileTranslate/ImageSourcePreview.test.js src/background.imageTranslate.test.js src/views/ImageTranslate/ImageTranslate.test.js
CI=true pnpm test --watch=false --runInBand --silent src/views/FileTranslate/FileTranslateView.test.js --testNamePattern='image stages'
pnpm exec vitest run --exclude 'tmp/**' src/localAi/core/__tests__/visualResult.test.ts src/localAi/core/__tests__/pdfInlineRecognition.test.ts src/localAi/core/__tests__/pdfStructure.test.ts src/localAi/core/__tests__/pdfIncremental.test.ts src/localAi/core/__tests__/documentMarkdown.test.ts src/localAi/core/__tests__/documentProtection.test.ts src/localAi/core/__tests__/documentExport.test.ts src/localAi/core/__tests__/documentAssets.test.ts
```

没有宣称全量测试通过：之前及本次全文件界面测试中的本地模型名称断言仍期望“本地翻译模型”，实际显示模型 ID `hy-mt2-1.8b`；该未改动行为不属于本次范围。

## 浏览器及交付记录

浏览器使用独立 Chrome 配置、合成图片、扫描 PDF、带文字层和图片的混合 PDF，以及本地固定文件桥接响应。该验证覆盖实际文件页面、PDF.js、文档渲染及界面调度；后台桥接与插件调用由自动化测试单独覆盖，不将页面模拟响应视为真实模型或完整扩展链路验证。

本地调试脚本、截图和调用记录保存在 `tmp/unified-visual/`，不随扩展发布。浏览器共 12 个场景通过，无捕获到的运行异常：文件图片与扫描 PDF 分别覆盖仅原文、全文双语、仅译文及区域缺译；混合 PDF 验证文字层翻译及手动图中文字直译；旧宿主没有收到结构化请求。延迟 2 秒保存目标语言时，确认保存完成后才上传图片并开始识别，且不触发文本补译。已有译文场景的文本调用为 0，缺译场景仅补译缺失项。同一组 12 个场景已在最终 Web 生产构建上复跑通过，Chrome 与 Web 构建均通过。

本次没有重测 Index 公共接口或其他真实视觉模型的翻译和布局质量。Firefox、Safari、移动设备以及大文档性能未实测。宿主与文件页面均未发布、部署或合并；上线应先提供支持宿主，再部署文件页面。
