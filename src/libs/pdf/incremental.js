import { mergeAcrossPages } from "./structure";

// Merge only contiguous completed pages. The final open boundary is not stable yet.
export function incrementalPdfBlocks(
  pageBlocks,
  pages,
  completedPages,
  numPages
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
    const continuation =
      tail?.source === "native" &&
      last?.bbox[3] > page?.height * 0.82 &&
      ((tail.type === "paragraph" &&
        !/[.!?:;。！？：；]$/.test(tail.text.trim())) ||
        (tail.type === "table" &&
          tail.cells?.length &&
          /^\|/.test(tail.markdown || "")));
    output.push(
      ...merged.map((block) => ({
        ...block,
        translationReady: !(block === tail && open && continuation),
      }))
    );
    run = [];
  };
  for (let index = 0; index < pageBlocks.length; index++) {
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
