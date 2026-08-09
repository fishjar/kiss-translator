import { isolateShadowHost, setShadowHostVisible } from "./shadowHost";

describe("Shadow host isolation", () => {
  test("uses author-inline important resets and preserves visibility control", () => {
    const host = document.createElement("div");

    expect(isolateShadowHost(host)).toBe(host);
    expect(host.style.getPropertyValue("all")).toBe("initial");
    expect(host.style.getPropertyPriority("all")).toBe("important");
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyPriority("display")).toBe("important");
    expect(host.style.getPropertyValue("direction")).toBe("ltr");
    expect(host.style.getPropertyPriority("direction")).toBe("important");
    expect(host.style.getPropertyValue("unicode-bidi")).toBe("normal");
    expect(host.style.getPropertyPriority("unicode-bidi")).toBe("important");

    setShadowHostVisible(host, false);
    expect(host.style.getPropertyValue("display")).toBe("none");
    expect(host.style.getPropertyPriority("display")).toBe("important");

    setShadowHostVisible(host, true);
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyPriority("display")).toBe("important");
  });
});
