import { isHtmlDocument } from "./libs/htmlDocument";

// SVG/XML 等非 HTML 文档框架直接跳过，避免 react-dom 等依赖在求值阶段崩溃
// 使用 require 延迟求值依赖（静态 import 会被提升，无法被条件判断拦截）
if (isHtmlDocument(document)) {
  // 标记全局运行上下文为 "content"，辅助 getContext() 判断运行宿主
  globalThis.__KISS_CONTEXT__ = "content";

  // 启动通用翻译器前端业务逻辑
  require("./common").run();
}
