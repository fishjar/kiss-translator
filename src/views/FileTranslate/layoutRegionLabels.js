const REGION_TYPE_LABELS = {
  paragraph: ["pdf_region_body", "正文"],
  text: ["pdf_region_body", "正文"],
  content: ["pdf_region_body", "正文"],
  abstract: ["pdf_region_abstract", "摘要"],
  doc_title: ["pdf_region_document_title", "文档标题"],
  paragraph_title: ["pdf_region_title", "标题"],
  heading: ["pdf_region_title", "标题"],
  figure_title: ["pdf_region_figure_title", "图标题"],
  table: ["pdf_region_table", "表格"],
  chart: ["pdf_region_chart", "图表"],
  formula: ["pdf_region_formula", "公式"],
  formula_number: ["pdf_region_formula_number", "公式序号"],
  image: ["pdf_region_image", "图片"],
  header: ["pdf_region_header", "页眉"],
  footer: ["pdf_region_footer", "页脚"],
  number: ["pdf_region_page_number", "页码"],
  reference: ["pdf_region_reference", "参考文献"],
  reference_content: ["pdf_region_reference_content", "文献内容"],
  footnote: ["pdf_region_footnote", "脚注"],
  vision_footnote: ["pdf_region_footnote", "脚注"],
  algorithm: ["pdf_region_algorithm", "算法"],
  aside_text: ["pdf_region_aside", "旁注"],
  seal: ["pdf_region_seal", "印章"],
};

export function getRegionLabel(type, label, i18n) {
  const entry = REGION_TYPE_LABELS[type] || REGION_TYPE_LABELS[label];
  return entry
    ? i18n?.(entry[0], entry[1]) || entry[1]
    : type || label || i18n?.("pdf_region_generic", "区域") || "区域";
}
