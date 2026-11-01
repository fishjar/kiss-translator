// Phase A 新增 35 个调度图标的覆盖闸：①调度器可导入；②mui 分支与上游
// @mui/icons-material 逐字等价；③lucide 分支与生成物逐字等价；④无 MD3
// scale(0.025) 坐标变换残留。名单取自计划 Phase A-1，kebab 与生成器 MAPPING
// 对账，防止"导出存在但映射漂移"。
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import * as Dispatcher from "./index";
import * as Lucide from "./lucide";
import { GLYPH_META } from "./lucide";
import { setIconStyleSnapshot } from "../../styles/m3";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// [调度器导出基名, MAPPING kebab]
const ADDED = [
  ["AddRounded", "plus"],
  ["ArrowForward", "arrow-right"],
  ["ArrowForwardRounded", "arrow-right"],
  ["AdsClick", "mouse-pointer-click"],
  ["AdsClickRounded", "mouse-pointer-click"],
  ["ChevronLeft", "chevron-left"],
  ["ChevronLeftRounded", "chevron-left"],
  ["ChevronRightRounded", "chevron-right"],
  ["CloudUpload", "cloud-upload"],
  ["CloudUploadRounded", "cloud-upload"],
  ["ContentPasteRounded", "clipboard-paste"],
  ["FileDownloadRounded", "file-down"],
  ["HighlightAlt", "mouse-pointer-2"],
  ["HighlightAltRounded", "mouse-pointer-2"],
  ["InsertDriveFile", "file"],
  ["InsertDriveFileRounded", "file"],
  ["MenuBook", "book"],
  ["MenuBookRounded", "book"],
  ["PictureAsPdf", "file-text"],
  ["PictureAsPdfRounded", "file-text"],
  ["Redo", "redo"],
  ["RedoRounded", "redo"],
  ["RemoveRounded", "minus"],
  ["SaveOutlined", "save"],
  ["Undo", "undo"],
  ["ViewQuilt", "layout-grid"],
  ["ViewQuiltRounded", "layout-grid"],
  ["VisibilityRounded", "eye"],
  ["VisibilityOffRounded", "eye-off"],
  ["WarningAmber", "triangle-alert"],
  ["WarningAmberRounded", "triangle-alert"],
  ["ZoomIn", "zoom-in"],
  ["ZoomInRounded", "zoom-in"],
  ["ZoomOut", "zoom-out"],
  ["ZoomOutRounded", "zoom-out"],
  ["MyLocation", "locate-fixed"],
  ["MyLocationOutlined", "locate"],
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

describe("icon dispatcher covers Phase A additions", () => {
  afterEach(() => {
    setIconStyleSnapshot("lucide");
  });

  test("declares exactly the 37 planned additions", () => {
    expect(ADDED).toHaveLength(37);
    expect(new Set(ADDED.map(([name]) => name)).size).toBe(37);
  });

  for (const [name, kebab] of ADDED) {
    test(`${name}Icon dispatches the mapped glyph in both styles`, () => {
      const dispatched = Dispatcher[`${name}Icon`];
      const lucide = Lucide[`${name}Icon`];
      // ① 调度器与生成物均导出该图标
      expect(dispatched).toBeDefined();
      expect(lucide).toBeDefined();
      // kebab 与生成器 MAPPING 对账（GLYPH_META 由生成器单点 emit）
      const meta = GLYPH_META.find((entry) => entry.name === `${name}Icon`);
      expect(meta && meta.kebab).toBe(kebab);

      // ② mui 分支与上游 glyph 等价
      setIconStyleSnapshot("mui");
      const muiName = GLYPH_META.find((m) => m.name === `${name}Icon`)?.mui ?? name;
      const muiModule = require(`@mui/icons-material/${muiName}`);
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
