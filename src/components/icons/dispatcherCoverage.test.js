// 调度图标的覆盖闸：①调度器可导入；②mui 分支与上游
// @mui/icons-material 逐字等价；③lucide 分支与生成物逐字等价；④无 MD3
// scale(0.025) 坐标变换残留。名单来自调度器导出基名清单，kebab 与生成器 MAPPING
// 对账，防止"导出存在但映射漂移"。
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import * as Dispatcher from "./index";
import * as Lucide from "./lucide";
import { GLYPH_META } from "./lucide";
import { setIconStyleSnapshot } from "../../styles/iconStyleStore";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// [调度器导出基名, MAPPING kebab, 预期 MUI 模块基名]
// 第三列手写、禁止从 GLYPH_META.mui 派生（派生即自比较，改派漂移抓不住）；
// MyLocation 对经 MUI_OVERRIDES 改派 CenterFocus，为仅有的两处例外。
const ADDED = [
  ["AddRounded", "plus", "AddRounded"],
  ["ArrowForward", "arrow-right", "ArrowForward"],
  ["ArrowForwardRounded", "arrow-right", "ArrowForwardRounded"],
  ["AdsClick", "mouse-pointer-click", "AdsClick"],
  ["AdsClickRounded", "mouse-pointer-click", "AdsClickRounded"],
  ["ChevronLeft", "chevron-left", "ChevronLeft"],
  ["ChevronLeftRounded", "chevron-left", "ChevronLeftRounded"],
  ["ChevronRightRounded", "chevron-right", "ChevronRightRounded"],
  ["CloudUpload", "cloud-upload", "CloudUpload"],
  ["CloudUploadRounded", "cloud-upload", "CloudUploadRounded"],
  ["ContentPasteRounded", "clipboard-paste", "ContentPasteRounded"],
  ["FileDownloadRounded", "file-down", "FileDownloadRounded"],
  ["HighlightAlt", "mouse-pointer-2", "HighlightAlt"],
  ["HighlightAltRounded", "mouse-pointer-2", "HighlightAltRounded"],
  ["InsertDriveFile", "file", "InsertDriveFile"],
  ["InsertDriveFileRounded", "file", "InsertDriveFileRounded"],
  ["MenuBook", "book", "MenuBook"],
  ["MenuBookRounded", "book", "MenuBookRounded"],
  ["PictureAsPdf", "file-text", "PictureAsPdf"],
  ["PictureAsPdfRounded", "file-text", "PictureAsPdfRounded"],
  ["Redo", "redo", "Redo"],
  ["RedoRounded", "redo", "RedoRounded"],
  ["RemoveRounded", "minus", "RemoveRounded"],
  ["SaveOutlined", "save", "SaveOutlined"],
  ["Undo", "undo", "Undo"],
  ["ViewQuilt", "layout-grid", "ViewQuilt"],
  ["ViewQuiltRounded", "layout-grid", "ViewQuiltRounded"],
  ["VisibilityRounded", "eye", "VisibilityRounded"],
  ["VisibilityOffRounded", "eye-off", "VisibilityOffRounded"],
  ["WarningAmber", "triangle-alert", "WarningAmber"],
  ["WarningAmberRounded", "triangle-alert", "WarningAmberRounded"],
  ["ZoomIn", "zoom-in", "ZoomIn"],
  ["ZoomInRounded", "zoom-in", "ZoomInRounded"],
  ["ZoomOut", "zoom-out", "ZoomOut"],
  ["ZoomOutRounded", "zoom-out", "ZoomOutRounded"],
  ["MyLocation", "locate-fixed", "CenterFocusStrong"],
  ["MyLocationOutlined", "locate", "CenterFocusWeak"],
];

const renderSvg = (Icon) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Icon />);
  });
  const svg = container.querySelector("svg");
  act(() => root.unmount());
  container.remove();
  return svg;
};

const renderInner = (Icon) => renderSvg(Icon).innerHTML;

describe("icon dispatcher covers dispatcher additions", () => {
  afterEach(() => {
    setIconStyleSnapshot("lucide");
  });

  test("declares exactly the 37 dispatcher additions", () => {
    expect(ADDED).toHaveLength(37);
    expect(new Set(ADDED.map(([name]) => name)).size).toBe(37);
  });

  for (const [name, kebab, muiBase] of ADDED) {
    test(`${name}Icon dispatches the mapped glyph in both styles`, () => {
      const dispatched = Dispatcher[`${name}Icon`];
      const lucide = Lucide[`${name}Icon`];
      // ① 调度器与生成物均导出该图标
      expect(dispatched).toBeDefined();
      expect(lucide).toBeDefined();
      // kebab 与生成器 MAPPING 对账（GLYPH_META 由生成器单点 emit）
      const meta = GLYPH_META.find((entry) => entry.name === `${name}Icon`);
      expect(meta && meta.kebab).toBe(kebab);

      // ② mui 分支与上游 glyph 等价（预期 MUI 基名取手写清单第三列）
      setIconStyleSnapshot("mui");
      const muiModule = require(`@mui/icons-material/${muiBase}`);
      const MuiIcon = muiModule.default || muiModule;
      expect(renderInner(dispatched)).toBe(renderInner(MuiIcon));

      // ③ lucide 分支与生成物 glyph 等价
      setIconStyleSnapshot("lucide");
      expect(renderInner(dispatched)).toBe(renderInner(lucide));

      // ④ 无 MD3 坐标变换残留
      expect(renderSvg(dispatched).outerHTML).not.toContain("scale(0.025)");
    });
  }
});
