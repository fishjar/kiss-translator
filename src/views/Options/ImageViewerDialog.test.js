import { act } from "react";
import { createRoot } from "react-dom/client";
import ImageViewerDialog from "./ImageViewerDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

describe("ImageViewerDialog component", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  test("renders semi-transparent backdrop, floating pill and floating close button with no line borders", async () => {
    const handleClose = jest.fn();
    await act(async () => {
      root.render(
        <ImageViewerDialog
          open={true}
          onClose={handleClose}
          sourceUrl="blob:http://localhost/source.png"
          translatedUrl="blob:http://localhost/translated.png"
          initialTab="translated"
          filename="manga.png"
        />
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    // 验证包含原图预览、译图结果和缩放百分比
    expect(dialog.textContent).toContain("原图预览");
    expect(dialog.textContent).toContain("译图结果");
    expect(dialog.textContent).toContain("100%");

    // 验证包含右上角关闭按钮
    const closeBtn = dialog.querySelector('button[title="关闭 (Esc)"]');
    expect(closeBtn).not.toBeNull();
    await act(async () => {
      closeBtn.click();
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test("supports zooming, resetting, and keyboard shortcuts", async () => {
    const handleClose = jest.fn();
    await act(async () => {
      root.render(
        <ImageViewerDialog
          open={true}
          onClose={handleClose}
          sourceUrl="blob:http://localhost/source.png"
          translatedUrl="blob:http://localhost/translated.png"
          initialTab="source"
          filename="test.png"
        />
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    const zoomInBtn = dialog.querySelector('button[title="放大"]');
    const zoomOutBtn = dialog.querySelector('button[title="缩小"]');
    const resetBtn = dialog.querySelector('button[title="复位 (1:1)"]');

    expect(zoomInBtn).not.toBeNull();
    expect(zoomOutBtn).not.toBeNull();
    expect(resetBtn).not.toBeNull();

    // 点击放大
    await act(async () => {
      zoomInBtn.click();
    });
    expect(dialog.textContent).toContain("115%");

    // 点击复位
    await act(async () => {
      resetBtn.click();
    });
    expect(dialog.textContent).toContain("100%");

    // 空格键切换视图
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    const selectedBtn = dialog.querySelector('.Mui-selected');
    expect(selectedBtn?.getAttribute("value")).toBe("translated");

    // Escape 键关闭
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
