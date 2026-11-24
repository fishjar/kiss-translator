const READ_SIZE = 64 * 1024;
const SECTION_SIZE = 24 * 1024;
export const LARGE_TEXT_BYTES = 256 * 1024;
export const MAX_ENTIRE_TEXT = 100000;

async function* lines(file, signal) {
  const decoder = new TextDecoder();
  let pending = "";
  for (let offset = 0; offset < file.size; offset += READ_SIZE) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const bytes = await file.slice(offset, offset + READ_SIZE).arrayBuffer();
    pending += decoder.decode(bytes, { stream: true });
    let consumed = 0;
    for (const match of pending.matchAll(/\r\n|\n|\r(?!$)/g)) {
      const end = match.index + match[0].length;
      yield { value: pending.slice(consumed, end), endOfLine: true };
      consumed = end;
    }
    pending = pending.slice(consumed);
    while (pending.length > SECTION_SIZE) {
      // Keep the final code point and a potentially incomplete CRLF for the next read.
      const end = /^[\uDC00-\uDFFF]$/.test(pending[SECTION_SIZE])
        ? SECTION_SIZE - 1
        : SECTION_SIZE;
      yield { value: pending.slice(0, end), endOfLine: false };
      pending = pending.slice(end);
    }
  }
  pending += decoder.decode();
  if (pending) yield { value: pending, endOfLine: true };
}

export async function* readTextSections(file, markdown, signal) {
  let output = "";
  let fence = "";
  let formula = false;
  let raw = false;
  let fragmentedLine = false;
  let lineEnding = "";
  let previousCharacter = "";
  let previousLine = "";
  let previousWholeLine = false;
  let tableHead = "";
  let tableContinuation = false;
  let paragraphEnd = 0;
  const flush = () => {
    const section = { text: output, raw };
    if (tableContinuation) section.tableHead = tableHead;
    else if (tableHead) section.tableStart = true;
    output = "";
    paragraphEnd = 0;
    return section;
  };
  for await (const { value, endOfLine } of lines(file, signal)) {
    const text = value.replace(/[\r\n]+$/, "");
    const boundary = !fragmentedLine;
    fragmentedLine = !endOfLine;
    const trimmed = text.trimEnd();
    if (boundary) lineEnding = "";
    if (trimmed)
      lineEnding = (
        (boundary ? "" : previousCharacter) + trimmed.slice(-2)
      ).slice(-2);
    previousCharacter = text.slice(-1);
    const candidate =
      boundary && endOfLine && text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    const marker =
      candidate &&
      (candidate[1][0] === "~" || !candidate[2].includes("`")) &&
      candidate;
    const opensFormula = boundary && text.trim().startsWith("$$");
    if (
      tableHead &&
      boundary &&
      (!text.includes("|") || marker || opensFormula)
    ) {
      if (output) yield flush();
      tableHead = "";
      tableContinuation = false;
    }
    if (
      markdown &&
      !raw &&
      !tableHead &&
      boundary &&
      endOfLine &&
      previousWholeLine &&
      previousLine.includes("|") &&
      output.endsWith(previousLine) &&
      /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(text)
    ) {
      const before = output.slice(0, -previousLine.length);
      if (before) yield { text: before, raw: false };
      output = previousLine;
      paragraphEnd = 0;
      tableHead = previousLine + value;
    }
    if (markdown && !fence && !formula && (marker || opensFormula)) {
      if (output) yield { text: output, raw: false };
      output = "";
      paragraphEnd = 0;
      raw = true;
      if (marker) fence = marker[1];
      if (opensFormula)
        formula = !endOfLine || !text.trim().slice(2).includes("$$");
    } else if (
      markdown &&
      fence &&
      marker &&
      marker[1][0] === fence[0] &&
      marker[1].length >= fence.length &&
      !marker[2].trim()
    ) {
      fence = "";
    } else if (markdown && formula && endOfLine && lineEnding === "$$") {
      formula = false;
    }

    output += value;
    if (markdown && !raw && !tableHead && !text.trim() && endOfLine)
      paragraphEnd = output.length;
    if (
      markdown &&
      !raw &&
      !tableHead &&
      paragraphEnd &&
      output.length >= SECTION_SIZE
    ) {
      yield { text: output.slice(0, paragraphEnd), raw: false };
      output = output.slice(paragraphEnd);
      paragraphEnd = 0;
    }
    if (
      markdown &&
      !raw &&
      !tableHead &&
      boundary &&
      endOfLine &&
      text.includes("|") &&
      output.length >= SECTION_SIZE &&
      output.length > value.length
    ) {
      yield { text: output.slice(0, -value.length), raw: false };
      output = value;
      paragraphEnd = 0;
    } else if (output.length >= SECTION_SIZE || (raw && !fence && !formula)) {
      yield flush();
      if (tableHead) tableContinuation = true;
      if (!fence && !formula) raw = false;
    }
    previousLine = value;
    previousWholeLine = boundary && endOfLine;
  }
  if (output) yield flush();
}
