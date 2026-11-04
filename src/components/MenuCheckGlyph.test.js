import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import MenuCheckGlyph from "./MenuCheckGlyph";
import { setIconStyleSnapshot } from "../styles/m3";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("MenuCheckGlyph", () => {
  let container;
  let root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setIconStyleSnapshot("lucide");
  });

  const renderGlyph = (checked) =>
    act(() => root.render(<MenuCheckGlyph checked={checked} />));

  test("both states keep one aria-hidden slot and a machine hook", () => {
    renderGlyph(false);
    const box = container.querySelector('[data-checked="false"]');
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(box.querySelector("svg")).not.toBeNull();
    expect(box.getAttribute("class")).toContain("kt-menu-check");
  });

  test("checked state flips the hook without changing the slot", () => {
    renderGlyph(false);
    renderGlyph(true);
    expect(container.querySelectorAll("[data-checked]")).toHaveLength(1);
    expect(
      container.querySelector("[data-checked]").getAttribute("data-checked")
    ).toBe("true");
  });

  test("the glyph family follows the icon-style snapshot", () => {
    setIconStyleSnapshot("lucide");
    renderGlyph(true);
    const lucidePath = container
      .querySelector("svg")
      .querySelector('[d^="M21 10.656"]');
    act(() => setIconStyleSnapshot("mui"));
    renderGlyph(true);
    const muiPath = container.querySelector("svg").querySelector("path");
    expect(lucidePath).not.toBeNull();
    expect(muiPath.getAttribute("d")).toContain("M19 3");
  });

  test("unchecked state swaps in the outline-blank glyph per icon style", () => {
    setIconStyleSnapshot("lucide");
    renderGlyph(false);
    const lucideUnchecked = container.querySelector("svg").innerHTML;
    renderGlyph(true);
    const lucideChecked = container.querySelector("svg").innerHTML;
    act(() => setIconStyleSnapshot("mui"));
    renderGlyph(false);
    const muiUnchecked = container.querySelector("svg").innerHTML;
    renderGlyph(true);
    const muiChecked = container.querySelector("svg").innerHTML;
    expect(lucideUnchecked).not.toBe(lucideChecked);
    expect(muiUnchecked).not.toBe(muiChecked);
    expect(lucideChecked).not.toBe(muiChecked);
    expect(lucideUnchecked).not.toBe(muiUnchecked);
  });

  test("visual state comes from glyph entity swap, not from an aria attribute toggle", () => {
    setIconStyleSnapshot("lucide");
    renderGlyph(false);
    const uncheckedSvg = container.querySelector("svg").innerHTML;
    renderGlyph(true);
    const checkedSvg = container.querySelector("svg").innerHTML;
    expect(checkedSvg).not.toBe(uncheckedSvg);
    expect(container.querySelector("svg").getAttribute("aria-checked")).toBeNull();
    expect(container.querySelector('[data-checked="true"]')).not.toBeNull();
  });
});
