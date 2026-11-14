import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  MENU_CHECK_MASK_LUCIDE,
  MENU_CHECK_MASK_MUI,
} from "./maskGlyphs";
import { CheckIcon } from "./index";
import { setIconStyleSnapshot } from "../../styles/iconStyleStore";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderCheckPath = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<CheckIcon />));
  const path = container.querySelector("svg path");
  act(() => root.unmount());
  container.remove();
  return path;
};

describe("mask glyph constants (single-source)", () => {
  afterEach(() => {
    setIconStyleSnapshot("lucide");
  });
  test("lucide mask contains the stroke polyline geometry", () => {
    expect(MENU_CHECK_MASK_LUCIDE).toContain("M20 6 9 17l-5-5");
    expect(MENU_CHECK_MASK_LUCIDE).toContain("fill='none'");
    expect(MENU_CHECK_MASK_LUCIDE).toContain("stroke='%23fff'");
    expect(MENU_CHECK_MASK_LUCIDE).not.toContain("polyline");
    expect(MENU_CHECK_MASK_LUCIDE).toMatch(/^url\("data:image\/svg\+xml,/);
  });

  test("mui mask contains the filled path geometry", () => {
    expect(MENU_CHECK_MASK_MUI).toContain("M9 16.17");
    expect(MENU_CHECK_MASK_MUI).toContain("fill='%23fff'");
    expect(MENU_CHECK_MASK_MUI).not.toContain("stroke-width");
    expect(MENU_CHECK_MASK_MUI).toMatch(/^url\("data:image\/svg\+xml,/);
  });

  test("both masks use the shared 24x24 viewBox", () => {
    const viewBox = "viewBox='0 0 24 24'";
    expect(MENU_CHECK_MASK_LUCIDE).toContain(viewBox);
    expect(MENU_CHECK_MASK_MUI).toContain(viewBox);
  });

  // 漂移检测锁：常量几何必须逐字命中分发器在该快照下真实渲染的 path d。
  // 上游换 lucide 资产、升 @mui/icons-material、改生成器模板字面量——任一
  // 造成分叉即红。期望值取自渲染结果，不再拷第三份手写串（拷串即造第二源）。
  // 锁的另一端是裸勾资产 CheckIcon（与勾选盒 CheckBox 对分属不同形状族）。
  test("lucide mask geometry stays locked to the rendered check glyph", () => {
    setIconStyleSnapshot("lucide");
    const renderedPath = renderCheckPath();
    expect(renderedPath).not.toBeNull();
    const renderedD = renderedPath.getAttribute("d");
    expect(renderedD.length).toBeGreaterThan(0);
    // 全等锁：从 data-URI 抽出 d='…' 值与渲染 d 逐字节相等，
    // 封死「常量侧取渲染串超集仍绿」的子串单向失明。
    const lucideMatch = MENU_CHECK_MASK_LUCIDE.match(/d='([^']*)'/);
    expect(lucideMatch).not.toBeNull();
    expect(lucideMatch[1]).toBe(renderedD);
  });

  test("mui mask geometry stays locked to the rendered check glyph", () => {
    setIconStyleSnapshot("mui");
    const renderedPath = renderCheckPath();
    expect(renderedPath).not.toBeNull();
    const renderedD = renderedPath.getAttribute("d");
    expect(renderedD.length).toBeGreaterThan(0);
    const muiMatch = MENU_CHECK_MASK_MUI.match(/d='([^']*)'/);
    expect(muiMatch).not.toBeNull();
    expect(muiMatch[1]).toBe(renderedD);
  });

  test("mask constants stay out of the checkbox glyph shape family", () => {
    // 形状族隔离铁证：菜单勾选实渲体是 CheckBox 对（方框＋勾），
    // 与本常量的裸勾几何分属两族——本锁不声称覆盖两者语义一致性。
    setIconStyleSnapshot("lucide");
    expect(MENU_CHECK_MASK_LUCIDE).not.toContain("M21 10.656");
    expect(MENU_CHECK_MASK_MUI).not.toContain("M19 3");
  });
});
