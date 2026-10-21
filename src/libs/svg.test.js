import {
  loadingSvg,
  createLoadingSVG,
  createRetrySVG,
  createLogoSVG,
} from "./svg";

describe("svg", () => {
  test("loadingSvg string contains CSS animations without SMIL animateTransform", () => {
    expect(loadingSvg).toContain("<svg");
    expect(loadingSvg).toContain("@keyframes");
    expect(loadingSvg).not.toContain("<animateTransform");
    expect(loadingSvg).not.toContain("<animate");
  });

  test("createLoadingSVG returns SVG element with pure CSS keyframes animation", () => {
    const svg = createLoadingSVG();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("viewBox")).toBe("-20 0 100 100");

    // 不包含任何 SMIL 动画元素，避免触发 Blink SMIL 崩溃
    expect(svg.querySelectorAll("animateTransform")).toHaveLength(0);
    expect(svg.querySelectorAll("animate")).toHaveLength(0);

    // 包含嵌入式样式以及 3 个关键帧圆圈
    const style = svg.querySelector("style");
    expect(style).not.toBeNull();
    expect(style.textContent).toContain("@keyframes kt-loading-bounce-1");

    const circles = svg.querySelectorAll("circle");
    expect(circles).toHaveLength(3);
    circles.forEach((circle) => {
      expect(circle.getAttribute("style")).toContain("animation:");
      expect(circle.getAttribute("fill")).toBe("#209CEE");
    });
  });

  test("createRetrySVG creates clickable retry icon", () => {
    const svg = createRetrySVG();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelector("path")).not.toBeNull();
    expect(svg.style.opacity).toBe("0.7");

    svg.dispatchEvent(new Event("mouseenter"));
    expect(svg.style.opacity).toBe("1");

    svg.dispatchEvent(new Event("mouseleave"));
    expect(svg.style.opacity).toBe("0.7");
  });

  test("createLogoSVG creates logo SVG with default and selected options", () => {
    const defaultLogo = createLogoSVG();
    expect(defaultLogo.tagName.toLowerCase()).toBe("svg");
    expect(defaultLogo.querySelectorAll("path")).toHaveLength(2);

    const selectedLogo = createLogoSVG({ isSelected: true });
    expect(selectedLogo.tagName.toLowerCase()).toBe("svg");
  });
});
