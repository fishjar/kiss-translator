/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import PdfPage from "./PdfPage";
import { FILE_TRANSLATE_I18N } from "../../config/locales/fileTranslate";
jest.mock("../../libs/pdf/pdfDocument", () => ({ PDFJS: {} }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("places layout labels above their regions and marks only the active recognition target", async () => {
  const observer = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const toggle = jest.fn();
  const pdf = {
    getPage: jest.fn(async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
    })),
  };
  const props = {
    pdf,
    number: 1,
    width: 600,
    zoom: 1,
    showLayout: true,
    onToggleRegion: toggle,
    regions: [
      { id: "first", type: "paragraph", bbox: [10, 20, 80, 40] },
      { id: "second", type: "formula", bbox: [90, 20, 140, 40] },
    ],
  };
  try {
    await act(async () =>
      root.render(<PdfPage {...props} recognizingRegionId="second" />)
    );
    const labels = container.querySelectorAll(
      ".kt-pdf-layout-layer > div > span"
    );
    expect(labels[0].style.bottom).toBe("calc(100% + 2px)");
    expect(labels[0].style.top).toBe("");
    expect(labels[0].querySelector('[role="progressbar"]')).toBeNull();
    expect(labels[1].querySelector('[aria-label="正在识别"]')).not.toBeNull();
    await act(async () =>
      root.render(<PdfPage {...props} disabled recognizingRegionId="first" />)
    );
    act(() => labels[0].parentElement.click());
    expect(toggle).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    await act(async () => root.render(<PdfPage {...props} />));
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    act(() => labels[0].parentElement.click());
    expect(toggle).toHaveBeenCalledWith(1, "first");
    await act(async () =>
      root.render(
        <PdfPage {...props} showLayout={false} recognizingRegionId="first" />
      )
    );
    expect(container.querySelector(".kt-pdf-layout-layer")).toBeNull();
    await act(async () =>
      root.render(
        <PdfPage
          {...props}
          i18n={(key, fallback) => FILE_TRANSLATE_I18N[key]?.en || fallback}
        />
      )
    );
    expect(
      container.querySelector(".kt-pdf-layout-layer").textContent
    ).toContain("Body text");
    expect(
      container.querySelector(".kt-pdf-layout-layer > div").title
    ).toContain("Click to exclude from recognition");
  } finally {
    act(() => root.unmount());
    container.remove();
    globalThis.IntersectionObserver = observer;
  }
});

test("shows every valid fragment on its page with scaled bounds even when layout is hidden", async () => {
  const observer = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const pdf = {
    getPage: jest.fn(async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
    })),
  };
  const highlights = [
    { page: 1, bbox: [10, 20, 80, 40] },
    { page: 1, bbox: [90, 50, 140, 70] },
    { page: 2, bbox: [10, 20, 80, 40] },
    { page: 1, bbox: [0, 0, 0, 0] },
  ];
  try {
    await act(async () =>
      root.render(
        <PdfPage
          pdf={pdf}
          number={1}
          width={632}
          zoom={1.25}
          highlight={highlights}
        />
      )
    );
    expect(container.querySelector(".kt-pdf-layout-layer")).toBeNull();
    const frames = container.querySelectorAll(".kt-pdf-source-highlight");
    expect(frames).toHaveLength(2);
    expect(frames[0].style.left).toBe("12.5px");
    expect(frames[0].style.top).toBe("25px");
    expect(frames[0].style.width).toBe("87.5px");
    expect(frames[0].style.pointerEvents).toBe("none");
    await act(async () =>
      root.render(
        <PdfPage pdf={pdf} number={1} width={632} zoom={1} highlight={[]} />
      )
    );
    expect(container.querySelector(".kt-pdf-source-highlight")).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
    globalThis.IntersectionObserver = observer;
  }
});
