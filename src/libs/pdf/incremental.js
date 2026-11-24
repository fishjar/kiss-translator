import { mergeAcrossPages } from "./structure";

function mayContinue(block, page) {
  const last = block?.fragments.at(-1);
  return (
    block?.source === "native" &&
    last?.bbox[3] > page?.height * 0.82 &&
    ((block.type === "paragraph" &&
      !/[.!?:;。！？：；]$/.test(block.text.trim())) ||
      (block.type === "table" &&
        block.cells?.length &&
        /^\|/.test(block.markdown || "")))
  );
}

// Merge only contiguous completed pages. The final open boundary is not stable yet.
export function incrementalPdfBlocks(
  pageBlocks,
  pages,
  completedPages,
  numPages,
  firstIndex = 0
) {
  const completed = new Set(completedPages),
    output = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const merged = mergeAcrossPages(run, pages);
    const tail = merged.at(-1),
      last = tail?.fragments.at(-1);
    const page = pages.find((item) => item.page === last?.page);
    const open = last && last.page < numPages && !completed.has(last.page + 1);
    const continuation = mayContinue(tail, page);
    output.push(
      ...merged.map((block) => ({
        ...block,
        translationReady: !(block === tail && open && continuation),
      }))
    );
    run = [];
  };
  for (let index = firstIndex; index < pageBlocks.length; index++) {
    if (completed.has(index + 1)) run.push(...(pageBlocks[index] || []));
    else {
      flush();
      output.push(
        ...(pageBlocks[index] || []).map((block) => ({
          ...block,
          translationReady: false,
        }))
      );
    }
  }
  flush();
  return output;
}

// Publish each stable prefix once. Only the unconfirmed boundary is carried
// forward, including a table or paragraph that extends over several pages.
export function createPdfReadingSnapshot(convert, numPages) {
  let index = 0;
  let stable = [];
  let boundary;
  return (pageBlocks, pages, completed) => {
    if (index && !completed.has(index)) {
      index = 0;
      stable = [];
      boundary = undefined;
    }
    while (completed.has(index + 1)) {
      const next = pageBlocks[index] || [];
      const merged = mergeAcrossPages(
        boundary ? [boundary, ...next] : next,
        [pages[index - 1], pages[index]].filter(Boolean)
      );
      const tail = merged.at(-1);
      boundary = undefined;
      if (
        index + 1 < numPages &&
        tail?.fragments.at(-1)?.page === index + 1 &&
        mayContinue(tail, pages[index])
      ) {
        boundary = merged.pop();
      }
      for (const block of convert(
        merged.map((block) => ({ ...block, translationReady: true }))
      ))
        stable.push(block);
      index++;
    }
    const pending = boundary ? [{ ...boundary, translationReady: false }] : [];
    const remaining = incrementalPdfBlocks(
      pageBlocks,
      pages.filter(Boolean),
      completed,
      numPages,
      index
    );
    return [...stable, ...convert([...pending, ...remaining])];
  };
}
