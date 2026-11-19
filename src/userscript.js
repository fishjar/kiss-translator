import { isHtmlDocument } from "./libs/htmlDocument";

// SVG/XML 等非 HTML 文档直接跳过，避免 react-dom 等依赖在求值阶段崩溃
// 使用 require 延迟求值依赖（静态 import 会被提升，无法被条件判断拦截）
if (isHtmlDocument(document)) {
  // 启动前端翻译流程，并传入 isUserscript = true 标识为油猴脚本模式运行
  require("./common").run(true);
}
