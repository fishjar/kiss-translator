import * as fflate from "fflate";
import {
  translateTxt,
  translateMarkdown,
  translateEpubBook,
} from "./fileTranslate";
import { translateFileText } from "../fileTranslation/client";
import { getBatchQueue, clearAllBatchQueue } from "./batchQueue";

jest.mock("../fileTranslation/client", () => ({
  translateFileText: jest.fn(),
}));
let pending;
beforeEach(() => {
  pending = [];
  translateFileText.mockReset().mockImplementation(
    (text, scene, setting, signal) =>
      new Promise((resolve, reject) => {
        pending.push({ text, resolve, reject, signal });
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true }
        );
      })
  );
});
afterEach(() => clearAllBatchQueue());

const finishBackwards = () =>
  [...pending].reverse().forEach(({ text, resolve }) => resolve(`译:${text}`));

test.each(["txt", "markdown"])(
  "%s submits more than 50 units before any response and preserves order",
  async (kind) => {
    const lines = Array.from({ length: 61 }, (_, i) => `line${i}`);
    const progress = jest.fn();
    const run =
      kind === "txt"
        ? translateTxt(lines.join("\r\n"), {}, {}, undefined, progress)
        : translateMarkdown(lines.join("\n\n"), {}, {}, undefined, progress);
    expect(pending).toHaveLength(61);
    finishBackwards();
    const result = await run;
    expect(result.comparisons.map((row) => row.source)).toEqual(lines);
    expect(progress.mock.calls.map(([done]) => done)).toEqual(
      lines.map((_, i) => i + 1)
    );
    expect(kind === "txt" ? result.text : result.translatedMd).toBe(
      lines.map((line) => `译:${line}`).join(kind === "txt" ? "\r\n" : "\n\n")
    );
  }
);

test("TXT submits long-line chunks together and retains surrounding whitespace", async () => {
  const run = translateTxt(`  ${"a".repeat(2000)}b  \r\n\r\nlast\n`, {}, {});
  expect(pending.map(({ text }) => text)).toEqual([
    "a".repeat(2000),
    "b",
    "last",
  ]);
  finishBackwards();
  expect((await run).text).toBe(
    `  译:${"a".repeat(2000)}译:b  \r\n\r\n译:last\n`
  );
});

test("first failure cancels sibling requests and suppresses late progress", async () => {
  const progress = jest.fn();
  const run = translateMarkdown(
    "one\n\ntwo\n\nthree",
    {},
    {},
    undefined,
    progress
  );
  pending[1].reject(new Error("offline"));
  await expect(run).rejects.toThrow("offline");
  expect(pending.every(({ signal }) => signal.aborted)).toBe(true);
  finishBackwards();
  expect(progress).not.toHaveBeenCalled();
});

test("EPUB submits every chapter and paragraph together and reports actual completed chapters", async () => {
  const paths = ["a.xhtml", "b.xhtml"];
  const book = {
    filesMap: Object.fromEntries(
      paths.map((path) => [
        path,
        fflate.strToU8(
          `<html xmlns="http://www.w3.org/1999/xhtml"><body>${Array.from({ length: 51 }, (_, i) => `<p>${path}-${i}</p>`).join("")}</body></html>`
        ),
      ])
    ),
    spineItems: paths.map((fullPath) => ({ fullPath })),
  };
  const progress = jest.fn();
  const run = translateEpubBook(book, {}, {}, undefined, progress);
  expect(pending).toHaveLength(102);
  finishBackwards();
  const result = await run;
  expect(Object.keys(result.chapterResults)).toEqual(paths);
  for (const path of paths) {
    expect(
      result.chapterResults[path].comparisons.map((row) => row.target)
    ).toEqual(Array.from({ length: 51 }, (_, i) => `译:${path}-${i}`));
  }
  expect(
    progress.mock.calls
      .filter((args) => args[4].chapterCompleted)
      .map(([done]) => done)
  ).toEqual([1, 2]);
});

test("TXT ready units can coalesce in the real backend batch queue", async () => {
  const batches = [];
  const queue = getBatchQueue(
    "file-scheduling-test",
    async (texts) => {
      batches.push(texts);
      return texts.map((text) => `译:${text}`);
    },
    { batchSize: 100, batchInterval: 1 }
  );
  translateFileText.mockImplementation((text, scene, setting, signal) =>
    queue.addTask(text, { signal })
  );
  const result = await translateTxt("one\ntwo\nthree", {}, {});
  expect(batches).toEqual([["one", "two", "three"]]);
  expect(result.text).toBe("译:one\n译:two\n译:three");
});
