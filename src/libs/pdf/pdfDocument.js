import * as pdfjs from "pdfjs-dist/build/pdf.mjs";

const asset = (name) => new URL(`assets/pdf/${name}`, document.baseURI).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset("pdf.worker.min.mjs");
export const PDFJS = pdfjs;
export async function openPdf(file, onPassword, signal) {
  const header = new TextDecoder().decode(
    await file.slice(0, 1024).arrayBuffer()
  );
  if (!header.includes("%PDF-")) throw new Error("文件不是有效 PDF");
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: asset("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: asset("standard_fonts/"),
    wasmUrl: asset("wasm/"),
    isEvalSupported: false,
  });
  const abort = () => {
    void task.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  task.onPassword = (update, reason) =>
    onPassword(update, reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
  try {
    const pdf = await task.promise;
    if (signal?.aborted) {
      await task.destroy();
      throw new DOMException("已取消", "AbortError");
    }
    const bookmarks = [];
    const walk = async (nodes, depth = 0, parentId = null) => {
      for (const node of nodes || []) {
        let page = 0,
          y = 0;
        try {
          const dest =
            typeof node.dest === "string"
              ? await pdf.getDestination(node.dest)
              : node.dest;
          if (dest?.[0] !== undefined) {
            page =
              (typeof dest[0] === "number"
                ? dest[0]
                : await pdf.getPageIndex(dest[0])) + 1;
            const p = await pdf.getPage(page);
            const viewport = p.getViewport({ scale: 1 });
            const type = dest[1]?.name;
            const topIndex = ["FitH", "FitBH"].includes(type) ? 2 : 3;
            const top =
              typeof dest[topIndex] === "number"
                ? dest[topIndex]
                : viewport.viewBox[3];
            const left =
              type === "XYZ" && typeof dest[2] === "number" ? dest[2] : 0;
            y = Math.max(0, viewport.convertToViewportPoint(left, top)[1]);
          }
        } catch {
          /* Invalid destinations must not prevent reading a PDF. */
        }
        const id = `bookmark-${bookmarks.length}`;
        if (page > 0)
          bookmarks.push({
            id,
            title: node.title || `第 ${page} 页`,
            page,
            y,
            depth,
            parentId,
          });
        await walk(node.items, depth + 1, page > 0 ? id : parentId);
      }
    };
    await walk(await pdf.getOutline());
    return { pdf, bookmarks, destroy: () => task.destroy() };
  } catch (e) {
    await task.destroy().catch(() => {});
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    throw e;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export async function renderPdfRegion(
  page,
  bbox,
  signal,
  scale = 1.5,
  masks = []
) {
  const viewport = page.getViewport({ scale }),
    full = page.getViewport({ scale: 1 });
  const box = bbox || [0, 0, full.width, full.height];
  const width = Math.max(1, Math.ceil((box[2] - box[0]) * scale)),
    height = Math.max(1, Math.ceil((box[3] - box[1]) * scale));
  if (width * height > 16000000)
    return renderPdfRegion(
      page,
      bbox,
      signal,
      scale * Math.sqrt(16000000 / (width * height)),
      masks
    );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const task = page.render({
    canvas,
    canvasContext: canvas.getContext("2d"),
    viewport,
    transform: [1, 0, 0, 1, -box[0] * scale, -box[1] * scale],
    background: "white",
  });
  const cancel = () => task.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    await task.promise;
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    for (const mask of masks) {
      const left = Math.max(box[0], mask[0]),
        top = Math.max(box[1], mask[1]);
      const right = Math.min(box[2], mask[2]),
        bottom = Math.min(box[3], mask[3]);
      if (right > left && bottom > top)
        context.fillRect(
          (left - box[0]) * scale,
          (top - box[1]) * scale,
          (right - left) * scale,
          (bottom - top) * scale
        );
    }
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("页面渲染失败"))),
        "image/png"
      )
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
    canvas.width = canvas.height = 0;
  }
}
