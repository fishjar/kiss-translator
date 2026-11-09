import "pdfjs-dist/web/pdf_viewer.css";
import "./libs/pdf/pdfViewerGlobal";
import { PDFJS } from "./libs/pdf/pdfDocument";
import {
  EventBus,
  LinkTarget,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import { getSettingWithDefault } from "./libs/storage";
import { matchRule } from "./libs/rules";
import { isInBlacklist } from "./libs/blacklist";
import { logger } from "./libs/log";
import TranslatorManager from "./libs/translatorManager";
import { buildNativePdfUrl, parsePdfReaderFile } from "./libs/pdfReaderLink";
import {
  MAX_SCALE,
  MIN_SCALE,
  createWheelZoom,
  isZoomWheel,
} from "./libs/pdf/readerZoom";

// 扩展页面不会注入 content.js，这里以内容脚本身份运行划词翻译。
globalThis.__KISS_CONTEXT__ = "content";

const ZOOM_STEP = 1.15;
const FIT_WIDTH = "page-width";
const WHEEL_REDRAW_DELAY_MS = 200;

const el = (id) => document.getElementById(id);
const asset = (name) => new URL(`assets/pdf/${name}`, document.baseURI).href;

const showStatus = (message) => {
  el("status").textContent = message;
  el("status").hidden = !message;
};

const fileNameOf = (file) => {
  const name = new URL(file).pathname.split("/").filter(Boolean).pop() || file;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

async function startSelectionTranslate(file) {
  const setting = await getSettingWithDefault();
  logger.setLevel(setting.logLevel);
  if (isInBlacklist(file, setting.tranboxSetting?.blacklist)) {
    setting.tranboxSetting.transOpen = false;
  }
  const rule = await matchRule(file, setting);
  new TranslatorManager({
    setting,
    rule,
    fabConfig: {},
    favWords: {},
    isIframe: false,
    isUserscript: false,
    transboxOnly: true,
  }).start();
}

function bindToolbar(viewer) {
  let fitWidth = true;
  const zoom = (factor) => {
    fitWidth = false;
    viewer.currentScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, viewer.currentScale * factor)
    );
  };
  const applyFitWidth = () => {
    fitWidth = true;
    viewer.currentScaleValue = FIT_WIDTH;
  };

  el("zoom-in").addEventListener("click", () => zoom(ZOOM_STEP));
  el("zoom-out").addEventListener("click", () => zoom(1 / ZOOM_STEP));
  el("zoom-fit").addEventListener("click", applyFitWidth);
  window.addEventListener("resize", () => fitWidth && applyFitWidth());

  const nextWheelFactor = createWheelZoom();
  window.addEventListener(
    "wheel",
    (event) => {
      if (!isZoomWheel(event)) return;
      // 只缩放论文，不触发浏览器自身的页面缩放。
      event.preventDefault();
      const scaleFactor = nextWheelFactor(viewer.currentScale, event);
      if (scaleFactor === null) return;
      fitWidth = false;
      viewer.updateScale({
        drawingDelay: WHEEL_REDRAW_DELAY_MS,
        scaleFactor,
        origin: [event.clientX, event.clientY],
      });
    },
    { passive: false }
  );

  el("page").addEventListener("change", (event) => {
    const page = Number(event.target.value);
    if (page >= 1 && page <= viewer.pagesCount) {
      viewer.currentPageNumber = page;
    } else {
      event.target.value = viewer.currentPageNumber;
    }
  });
  return applyFitWidth;
}

async function openDocument(file) {
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({
    eventBus,
    externalLinkTarget: LinkTarget.BLANK,
  });
  const viewer = new PDFViewer({
    container: el("viewerContainer"),
    viewer: el("viewer"),
    eventBus,
    linkService,
    textLayerMode: 1,
  });
  linkService.setViewer(viewer);

  const applyFitWidth = bindToolbar(viewer);
  eventBus.on("pagesinit", () => {
    applyFitWidth();
    const { hash } = window.location;
    if (hash.length > 1) linkService.setHash(hash.slice(1));
  });
  eventBus.on("pagechanging", ({ pageNumber }) => {
    el("page").value = pageNumber;
  });

  const pdf = await PDFJS.getDocument({
    url: file,
    withCredentials: true,
    cMapUrl: asset("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: asset("standard_fonts/"),
    wasmUrl: asset("wasm/"),
    isEvalSupported: false,
  }).promise;

  viewer.setDocument(pdf);
  linkService.setDocument(pdf, null);
  el("total").textContent = pdf.numPages;

  const { info } = await pdf.getMetadata().catch(() => ({ info: {} }));
  if (info?.Title) {
    document.title = info.Title;
    el("title").textContent = info.Title;
  }
}

async function main() {
  const file = parsePdfReaderFile(window.location.search);
  // 页面需对网页开放跳转，但不允许被第三方页面嵌入。
  if (!file || window.top !== window) {
    showStatus("无法打开这个 PDF 地址。");
    return;
  }

  const name = fileNameOf(file);
  document.title = name;
  el("title").textContent = name;
  el("native").href = buildNativePdfUrl(file);

  startSelectionTranslate(file).catch((err) =>
    logger.child("pdf-reader").error("selection translate failed", err)
  );

  showStatus("正在加载 PDF…");
  try {
    await openDocument(file);
    showStatus("");
  } catch (err) {
    logger.child("pdf-reader").error("open pdf failed", err);
    showStatus("PDF 加载失败，可以点右上角“用浏览器打开”。");
  }
}

main();
