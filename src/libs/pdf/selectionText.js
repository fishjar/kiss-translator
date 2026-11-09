/**
 * @file selectionText.js
 * @description PDF.js 文字层的每一行都是独立元素，选区文本因此每行带一个换行。
 * 这里把行拼回段落，避免原文和译文被按行切开。本模块不依赖 pdfjs，可进入内容脚本。
 */

const PARAGRAPH_MIN_LINES = 4;
const SHORT_LINE_RATIO = 0.7;
const TYPICAL_LINE_PERCENTILE = 0.75;

const SENTENCE_END = /[.?!:;。？！：；…]["”’')）\]]*$/;
const LIST_ITEM_START = /^(\[\d+\]|[•·▪◦‣]|\d+[.)]\s)/;
const LINE_END_HYPHEN = /[A-Za-z\u00C0-\u024F][-\u2010]$/;
const LOWERCASE_START = /^[a-z\u00DF-\u00F6\u00F8-\u00FF]/;
// 这些前缀在学术文本里几乎都是真复合词，行尾连字符不能删。
const COMPOUND_PREFIX =
  /(?:^|[^A-Za-z\u00C0-\u024F])(?:self|well|cross)[-\u2010]$/i;
// 行尾前半截够长、后半截是这些常见词时，按复合词处理；短前缀（in-、re-）多半只是音节断行。
const COMPOUND_HEAD = /[A-Za-z\u00C0-\u024F]{4,}[-\u2010]$/;
const COMPOUND_TAIL =
  /^(?:based|aware|driven|level|scale|free|specific|wise|like|oriented|related|dependent|independent|supervised|answering|attention|learning|training|trained|tuning|making|solving|sized|world|time|term|grained|order|sensitive|invariant|agnostic|efficient|effective|consuming|intensive|ended|fold|step|stage|shot|layer|class|label|task|domain|source)\b/i;
const NO_SPACE_BEFORE = /^[,.;:!?%)\]}’”]/;
const NO_SPACE_AFTER = /[([{‘“/]$/;
const CJK =
  /[\u3000-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\uFF00-\uFFEF]/;

function joinLine(joined, line) {
  if (LINE_END_HYPHEN.test(joined)) {
    const nextWord = line.split(/\s/, 1)[0];
    const keepHyphen =
      !LOWERCASE_START.test(line) ||
      nextWord.includes("-") ||
      COMPOUND_PREFIX.test(joined) ||
      (COMPOUND_HEAD.test(joined) && COMPOUND_TAIL.test(line));
    return keepHyphen ? joined + line : joined.slice(0, -1) + line;
  }

  const last = joined[joined.length - 1];
  const noSpace =
    CJK.test(last) ||
    CJK.test(line[0]) ||
    NO_SPACE_BEFORE.test(line) ||
    NO_SPACE_AFTER.test(joined);
  return joined + (noSpace ? "" : " ") + line;
}

/**
 * 判断某一行是否是段落结尾：句末标点加明显短于正常行宽。
 * 首行可能只选中了后半截，长度不可靠，因此不参与判断。
 */
function createParagraphEndCheck(lines) {
  if (lines.length < PARAGRAPH_MIN_LINES) return () => false;
  const lengths = lines.map((line) => line.length).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * TYPICAL_LINE_PERCENTILE)];
  return (line, index) =>
    index > 0 &&
    SENTENCE_END.test(line) &&
    line.length < typical * SHORT_LINE_RATIO;
}

/**
 * 将 PDF 选区文本按段落重新拼接。
 * @param {string} text Selection.toString() 的结果。
 * @returns {string} 段内无换行、段间以单个换行分隔的文本。
 */
export function joinPdfSelectionLines(text) {
  const lines = String(text || "")
    .replace(/\u00ad/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  if (!lines.length) return "";

  const endsParagraph = createParagraphEndCheck(lines);
  return lines.reduce((joined, line, index) => {
    if (index === 0) return line;
    const startsNewBlock =
      LIST_ITEM_START.test(line) || endsParagraph(lines[index - 1], index - 1);
    return startsNewBlock ? `${joined}\n${line}` : joinLine(joined, line);
  }, "");
}

/** 判断选区是否位于 PDF.js 文字层，普通网页文本的换行需要原样保留。 */
export function isPdfTextLayerSelection(selection) {
  const node = selection?.anchorNode;
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(element?.closest?.(".textLayer"));
}
