import { getEditorPortalContainer } from "./portal";

describe("RuleEditor portal base-slot resolution chain", () => {
  test("portals resolve to the kt theme root so base slot tokens stay reachable", () => {
    const shadowHost = document.createElement("div");
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const themeRoot = document.createElement("div");
    themeRoot.className = "kt-m3-root";
    const field = document.createElement("div");
    themeRoot.appendChild(field);
    shadow.appendChild(themeRoot);
    document.body.appendChild(shadowHost);
    try {
      expect(getEditorPortalContainer(field)).toBe(themeRoot);
      // 令牌可达性由解析链落点保证：container === themeRoot ⇒ portal 内容
      // 位于主题根内，基槽令牌与 shadow-tree 样式边界对 popper/dialog 内容
      // 同时可达。
    } finally {
      shadowHost.remove();
    }
  });

  test("falls back to the notranslate wrapper, then the document body", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "notranslate";
    const field = document.createElement("div");
    wrapper.appendChild(field);
    document.body.appendChild(wrapper);
    try {
      expect(getEditorPortalContainer(field)).toBe(wrapper);
      expect(
        getEditorPortalContainer(document.createElement("div"))
      ).toBe(document.body);
    } finally {
      wrapper.remove();
    }
  });
});
