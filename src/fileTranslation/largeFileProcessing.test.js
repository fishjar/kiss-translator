/** @jest-environment node */
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { Blob } from "buffer";
import { deserialize, serialize } from "v8";
import { zipSync, strToU8 } from "fflate";
import {
  cleanDocumentSessions,
  createDocumentSession,
} from "./documentSession";
import {
  boundedImageSize,
  imageDecodePlan,
  resizeFileTranslationImage,
} from "./imageDimensions";
import { readTextSections } from "./textSections";
import { writeFileChunks, writeFileDownload } from "./fileOutput";
import { openEpubArchive } from "../libs/epub/epubArchive";
import {
  epubDiskCachePaths,
  prepareEpubDiskCache,
} from "../libs/epub/epubDiskCache";
import {
  epubPartMarkup,
  splitEpubBody,
  storedEpubParts,
} from "../libs/epub/epubSections";
import { createTranslationRequestWindow } from "../libs/translationTasks";
import { writeZipOutput } from "../libs/zipOutput";

test("EPUB index reads nominated entries and can stream a resource", async () => {
  const archive = await openEpubArchive(
    new Blob([
      zipSync({
        "first.xhtml": strToU8("First chapter"),
        "last.xhtml": strToU8("Last chapter"),
      }),
    ])
  );
  expect([...archive.paths()]).toEqual(["first.xhtml", "last.xhtml"]);
  expect(new TextDecoder().decode(await archive.read("last.xhtml"))).toBe(
    "Last chapter"
  );
  await expect(archive.read("./last.xhtml", { maxBytes: 1 })).rejects.toThrow(
    "last.xhtml"
  );
  await expect(archive.read("last.xhtml", { maxBytes: NaN })).rejects.toThrow(
    RangeError
  );
  await expect(
    archive.stream("absent.xhtml", new WritableStream())
  ).rejects.toThrow("absent.xhtml");
  const chunks = [];
  await archive.stream(
    "first.xhtml",
    new WritableStream({ write: (bytes) => chunks.push(bytes) })
  );
  expect(await new Blob(chunks).text()).toBe("First chapter");
});

test("cancelling one reader does not interrupt a chapter shared with the preview", async () => {
  const source = strToU8("Shared chapter");
  const archive = await openEpubArchive(
    new Blob([zipSync({ chapter: source })])
  );
  const abort = new AbortController();
  const prefetch = archive.read("chapter", { signal: abort.signal });
  const visible = archive.read("chapter");
  abort.abort();
  await expect(prefetch).rejects.toMatchObject({ name: "AbortError" });
  expect([...(await visible)]).toEqual([...source]);
});

test("an interrupted OPFS read resumes from ZIP without duplicating delivered bytes", async () => {
  const source = strToU8("Original chapter");
  const archive = await openEpubArchive(
    new Blob([zipSync({ chapter: source })])
  );
  const release = archive.useDiskCache(
    new Map([
      [
        "chapter",
        {
          getFile: async () => ({
            size: source.length,
            stream: () =>
              new ReadableStream({
                start(controller) {
                  controller.enqueue(source.subarray(0, 3));
                },
                pull(controller) {
                  controller.error(new Error("OPFS file unreadable"));
                },
              }),
          }),
        },
      ],
    ])
  );
  const chunks = [];
  await archive.stream(
    "chapter",
    new WritableStream({ write: (bytes) => chunks.push(bytes) })
  );
  expect(await new Blob(chunks).text()).toBe("Original chapter");
  expect(chunks).toHaveLength(2);
  await release();
});

test("EPUB disk planning counts unique chapters and never stages illustrations", () => {
  const mib = 1024 ** 2;
  const sizes = new Map([
    ["one", 2 * mib],
    ["two", 2 * mib],
    ["nav", 10],
    ["cover", 64 * mib],
  ]);
  const book = {
    archive: {
      has: (path) => sizes.has(path),
      size: (path) => sizes.get(path),
    },
    spineItems: ["one", "two", "two"].map((fullPath) => ({ fullPath })),
    navItemHref: "nav",
  };
  expect(epubDiskCachePaths(book)).toEqual([]);
  sizes.set("one", 2 * mib + 1);
  expect(epubDiskCachePaths(book)).toEqual(["one", "two", "nav"]);
  sizes.set("one", 64 * mib);
  expect(epubDiskCachePaths(book)).toEqual([]);
});

test("OPFS publishes complete preparation and removes discarded sessions", async () => {
  globalThis.structuredClone ||= (value) => deserialize(serialize(value));
  globalThis.indexedDB ||= new IDBFactory();
  globalThis.IDBKeyRange ||= IDBKeyRange;
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let quotaExceeded = false;
  const root = makeDirectory();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { getDirectory: async () => root } },
  });
  const source = new Blob([
    zipSync({ one: strToU8("One"), two: strToU8("Two") }),
  ]);
  const archive = await openEpubArchive(source);
  const paths = ["one", "two"];
  const publish = jest.spyOn(archive, "useDiskCache");
  try {
    const first = new AbortController();
    expect(
      await prepareEpubDiskCache({ archive }, paths, first.signal, () =>
        first.abort()
      )
    ).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    const parent = await root.getDirectoryHandle("file-translation-epub");
    expect(parent.children.size).toBe(0);
    quotaExceeded = true;
    expect(
      await prepareEpubDiskCache(
        { archive },
        paths,
        new AbortController().signal,
        jest.fn()
      )
    ).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    expect(parent.children.size).toBe(0);
    quotaExceeded = false;
    const next = new AbortController();
    const progress = jest.fn();
    const cache = await prepareEpubDiskCache(
      { archive },
      paths,
      next.signal,
      progress
    );
    try {
      expect(progress.mock.calls).toEqual([
        [1, 2],
        [2, 2],
      ]);
      expect(parent.children.size).toBe(1);
      expect(new TextDecoder().decode(await archive.read("two"))).toBe("Two");
      const other = await openEpubArchive(source);
      const otherCache = await prepareEpubDiskCache(
        { archive: other },
        paths,
        next.signal,
        jest.fn()
      );
      try {
        await cleanDocumentSessions();
        expect(parent.children.size).toBe(2);
        await cache.close();
        expect(parent.children.size).toBe(1);
        expect(new TextDecoder().decode(await other.read("one"))).toBe("One");
      } finally {
        await otherCache?.close();
      }
    } finally {
      await cache?.close();
    }
    expect(parent.children.size).toBe(0);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }

  function makeDirectory() {
    const children = new Map();
    return {
      children,
      async removeEntry(name) {
        if (!children.delete(name))
          throw new DOMException("Missing", "NotFoundError");
      },
      async getDirectoryHandle(name) {
        if (!children.has(name)) children.set(name, makeDirectory());
        return children.get(name);
      },
      async getFileHandle(name) {
        const chunks = [];
        const file = {
          async getFile() {
            return new Blob(chunks);
          },
          async createWritable() {
            return new WritableStream({
              write(chunk) {
                if (quotaExceeded)
                  throw new DOMException(
                    "Quota exceeded",
                    "QuotaExceededError"
                  );
                chunks.push(chunk);
              },
            });
          },
        };
        children.set(name, file);
        return file;
      },
    };
  }
});

test("EPUB chapter parts preserve body boundaries and keep complete structures", async () => {
  const prefix = '<html xmlns="http://www.w3.org/1999/xhtml"><head/><body>';
  const suffix = "</body></html>\n";
  const body =
    '<section id="first"><p>one 😀</p></section>'.repeat(8000) +
    "<table><tr><td>last &amp; final</td></tr></table>";
  const all = prefix + body + suffix;
  const sections = [];
  for await (const section of splitEpubBody(all.match(/[\s\S]{1,2047}/g)))
    sections.push(section);
  expect(sections.length).toBeGreaterThan(2);
  expect(sections[0].prefix).toBe(prefix);
  expect(sections.map((part) => (part.before || "") + part.body).join("")).toBe(
    body
  );
  expect(sections.at(-1).suffix).toBe(suffix);
  expect(epubPartMarkup(sections[0])).toContain(
    '<section id="first"><p>one 😀</p></section>'
  );
  expect(sections.at(-2).body).toContain(
    "<table><tr><td>last &amp; final</td></tr></table>"
  );
});

test("EPUB splits a wrapper larger than the structural limit and preserves empty bodies", async () => {
  const prefix = '<html xmlns="http://www.w3.org/1999/xhtml"><body>';
  const row = "<p>" + "a".repeat(1024) + "</p>";
  const source =
    prefix +
    '<div id="intro"><p>Introduction</p></div>' +
    '<section id="chapter">' +
    row.repeat(4320) +
    '<p id="last">Last</p></section></body></html>';
  const split = [];
  for await (const part of splitEpubBody(source.match(/[\s\S]{1,16384}/g)))
    split.push(part);
  expect(split.length).toBeGreaterThan(80);
  const chapter = split.find(
    (part) => part.opener === '<section id="chapter">'
  );
  expect(chapter.before).toBe('</div><section id="chapter">');
  const rebuilt =
    split[0].prefix +
    split
      .map((part) => (part.before || "") + part.body + (part.suffix || ""))
      .join("");
  expect(rebuilt.length).toBe(source.length);
  expect(rebuilt === source).toBe(true);
  const empty = [];
  for await (const part of splitEpubBody([
    "<html><bo",
    'dy class="empty"/></html>',
  ]))
    empty.push(part);
  expect(empty).toEqual([
    {
      prefix: '<html><body class="empty">',
      suffix: "</body></html>",
      body: "",
    },
  ]);
  const old = {
    count: 0,
    prefix: '<html><body class="empty"/>',
    suffix: "</html>",
  };
  await expect(
    storedEpubParts(old, undefined, "target").next()
  ).resolves.toEqual({ done: false, value: empty[0] });
  await expect(storedEpubParts(old, undefined, "raw").next()).rejects.toThrow();
});

test.each(["source", "sink", "close", "cancel"])(
  "ZIP output releases the sink and preserves the %s failure",
  async (scenario) => {
    const abort = new AbortController();
    const failure = new Error(scenario);
    const discard = jest.fn();
    const close = jest.fn(() => {
      if (scenario === "close") throw failure;
    });
    const sink = new WritableStream({
      write() {
        if (scenario === "sink") throw failure;
        if (scenario === "cancel") abort.abort(failure);
      },
      close,
      abort: discard,
    });
    await expect(
      writeZipOutput(sink, abort.signal, async (writer, signal) => {
        const readable = new ReadableStream({
          pull(controller) {
            if (scenario === "source") controller.error(failure);
            else {
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.close();
            }
          },
        });
        await writer.add("chapter", readable, { level: 0, signal });
      })
    ).rejects.toBe(failure);
    expect(sink.locked).toBe(false);
    expect(close).toHaveBeenCalledTimes(scenario === "close" ? 1 : 0);
    expect(discard).toHaveBeenCalledTimes(
      scenario === "source" || scenario === "cancel" ? 1 : 0
    );
  }
);

test("Markdown resumes translation after a formula delimiter split across text reads", async () => {
  const source =
    "$$\n" +
    "x".repeat(24 * 1024 - 1) +
    "$" +
    " ".repeat(64 * 1024 - 3 - 24 * 1024) +
    "$\nOutside";
  const sections = [];
  const spanning =
    "$$\n" +
    "x".repeat(24 * 1024 - 1) +
    "$$" +
    " ".repeat(64 * 1024) +
    "\nOutside";
  for await (const section of readTextSections(new Blob([spanning]), true))
    sections.push(section);
  expect(sections.map(({ text }) => text).join("")).toBe(spanning);
  expect(sections.at(-1)).toEqual({ text: "Outside", raw: false });
  const raw = [];
  for await (const section of readTextSections(new Blob([source]), true))
    raw.push(section);
  expect(raw.at(-1).raw).toBe(true);
});

test("Blob export checks the real byte budget before storing a chunk", async () => {
  const large = new Uint8Array(64 * 1024 ** 2);
  await expect(
    writeFileDownload("result", "text/plain", (writable) =>
      writeFileChunks(writable, [large, new Uint8Array(1)])
    )
  ).rejects.toThrow("64 MiB");
  await expect(
    writeFileDownload("result", "text/plain", (writable) =>
      writeFileChunks(writable, ["not a byte chunk"])
    )
  ).rejects.toThrow(TypeError);
});

test("the text request window cancels queued work and counts outstanding requests", async () => {
  const run = createTranslationRequestWindow();
  const abort = new AbortController();
  const resolve = [];
  const submit = jest.fn(() => new Promise((done) => resolve.push(done)));
  const tasks = Array.from({ length: 45 }, () => run(submit, abort.signal));
  const results = Promise.allSettled(tasks);
  expect(submit).toHaveBeenCalledTimes(32);
  resolve[0]();
  await new Promise((done) => setTimeout(done, 0));
  expect(submit).toHaveBeenCalledTimes(33);
  abort.abort();
  resolve.forEach((done) => done());
  expect(
    (await results).filter((result) => result.status === "rejected")
  ).toHaveLength(12);
  expect(submit).toHaveBeenCalledTimes(33);
});

test("memory-only sessions keep committed results when the fallback fills", async () => {
  const previousBlob = globalThis.Blob;
  const previousDatabase = globalThis.indexedDB;
  globalThis.Blob = Blob;
  delete globalThis.indexedDB;
  const session = createDocumentSession();
  try {
    const committed = { target: "already translated" };
    await session.put("completed", committed);
    await expect(
      session.put("oversized", new Blob([new Uint8Array(16 * 1024 ** 2)]))
    ).rejects.toThrow("文件翻译内存暂存已满");
    expect(await session.get("completed")).toEqual(committed);
    expect(await session.get("oversized")).toBeUndefined();
    await expect(
      session.put("completed", { pages: [new Uint8Array(16 * 1024 ** 2)] })
    ).rejects.toThrow("文件翻译内存暂存已满");
    expect(await session.get("completed")).toEqual(committed);
    await session.put("undefined", undefined);
  } finally {
    session.close();
    globalThis.Blob = previousBlob;
    globalThis.indexedDB = previousDatabase;
  }
});

test("file sessions isolate data and persist committed results in IndexedDB", async () => {
  globalThis.structuredClone ||= (value) => deserialize(serialize(value));
  globalThis.indexedDB ||= new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  const first = createDocumentSession();
  const second = createDocumentSession();
  try {
    const result = { target: "translated" };
    await first.put("1", result);
    result.target = "changed after commit";
    expect(await first.get("1")).toEqual({ target: "translated" });
    expect(await second.get("1")).toBeUndefined();

    const open = globalThis.indexedDB.open("kiss-file-translation", 1);
    const otherTab = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const seed = otherTab.transaction(["sessions", "results"], "readwrite");
      const sessions = seed.objectStore("sessions");
      const results = seed.objectStore("results");
      const now = Date.now();
      sessions.put({ owner: "other", state: "active", updatedAt: now }, "live");
      sessions.put(
        { owner: "other", state: "closed", updatedAt: now },
        "closed"
      );
      sessions.put(
        { owner: "other", state: "active", updatedAt: now - 25 * 3_600_000 },
        "expired"
      );
      for (const id of ["live", "closed", "expired"])
        results.put(id, [id, "1"]);
      await new Promise((resolve, reject) => {
        seed.oncomplete = resolve;
        seed.onabort = () => reject(seed.error);
      });

      await cleanDocumentSessions();
      const keys = await new Promise((resolve, reject) => {
        const query = otherTab
          .transaction("results")
          .objectStore("results")
          .getAllKeys();
        query.onsuccess = () => resolve(query.result.map(([id]) => id));
        query.onerror = () => reject(query.error);
      });
      expect(keys).toContain("live");
      expect(keys).not.toContain("closed");
      expect(keys).not.toContain("expired");
    } finally {
      otherTab.close();
    }

    const upgrade = globalThis.indexedDB.open("kiss-file-translation", 2);
    const upgraded = await new Promise((resolve, reject) => {
      upgrade.onsuccess = () => resolve(upgrade.result);
      upgrade.onerror = () => reject(upgrade.error);
    });
    upgraded.close();
    expect(await first.get("1")).toEqual({ target: "translated" });
    await first.remove(["1"]);
    expect(await first.get("1")).toBeUndefined();
    first.close();
    await expect(first.put("2", {})).rejects.toMatchObject({
      name: "AbortError",
    });
  } finally {
    first.close();
    second.close();
  }
});

function png(width, height) {
  const head = Uint8Array.of(
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  );
  const view = new DataView(head.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([head], { type: "image/png" });
}

test("pixel budgets apply before allocating an image decoder", async () => {
  await expect(imageDecodePlan(png(4000, 4000))).resolves.toMatchObject({
    resize: false,
  });
  await expect(imageDecodePlan(png(5000, 4000))).resolves.toMatchObject({
    resize: true,
  });
  await expect(imageDecodePlan(png(10000, 10000))).rejects.toThrow(
    "超过安全解码上限"
  );
  const resized = boundedImageSize(5000, 4000);
  expect(resized.width * resized.height).toBeLessThanOrEqual(8_000_000);
});

test("a failed resize releases both the bitmap and its canvas", async () => {
  const oldDecoder = globalThis.createImageBitmap;
  const oldCanvas = globalThis.OffscreenCanvas;
  const close = jest.fn();
  let canvas;
  globalThis.createImageBitmap = async () => ({
    width: 5000,
    height: 4000,
    close,
  });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      Object.assign(this, { width, height });
      canvas = this;
    }
    getContext() {
      return null;
    }
  };
  try {
    await expect(resizeFileTranslationImage(png(5000, 4000))).rejects.toThrow(
      "画布"
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  } finally {
    globalThis.createImageBitmap = oldDecoder;
    globalThis.OffscreenCanvas = oldCanvas;
  }
});

test("streamed text preserves split CRLF and Unicode and protects a Markdown fence", async () => {
  const text =
    "a".repeat(65535) +
    "\r\n😀\r\n```js\n" +
    "x = 1;\n".repeat(20000) +
    "```\n\nnext";
  const sections = [];
  for await (const section of readTextSections(new Blob([text]), true))
    sections.push(section);
  expect(sections.map(({ text }) => text).join("")).toBe(text);
  expect(
    sections
      .filter(({ raw }) => raw)
      .map(({ text }) => text)
      .join("")
  ).toContain("x = 1;\n".repeat(20000));
  expect(sections.at(-1)).toEqual({ raw: false, text: "\nnext" });
});

test("invalid inline backticks do not suppress the rest of a streamed Markdown file", async () => {
  const source = new Blob(["```foo``` 说明\n\nContinue translating.\n"]);
  const sections = [];
  for await (const section of readTextSections(source, true))
    sections.push(section);
  expect(sections).toEqual([{ text: await source.text(), raw: false }]);
});

test("chunked Markdown tables keep a rendering header and lossless source order", async () => {
  const header = "| a | b |\n| - | - |\n";
  const markdown = header + "| alpha | beta |\n".repeat(5000) + "\nEnd\n";
  const sections = [];
  for await (const section of readTextSections(new Blob([markdown]), true))
    sections.push(section);
  expect(sections.length).toBeGreaterThan(2);
  expect(sections[0].text.startsWith(header)).toBe(true);
  expect(sections[1].tableHead).toBe(header);
  expect(sections.map(({ text }) => text).join("")).toBe(markdown);
});
