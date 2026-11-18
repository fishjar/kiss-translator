/**
 * 判断文档是否为 HTML 文档（含 XHTML）
 * 内容脚本会注入到所有框架，SVG/XML 等非 HTML 文档中
 * document.createElement("div") 创建的元素没有 style，
 * react-dom 在模块求值阶段即会因此崩溃，故需在加载前判断。
 * 注意：本文件不要引入其他模块，以免提前求值依赖。
 */
export const isHtmlDocument = (doc) => {
  try {
    return !!doc?.createElement?.("div")?.style;
  } catch (err) {
    return false;
  }
};
