import {
  isInInlineHidden,
  getInlineVisibleText,
  cloneWithoutInlineHidden,
  visitTranslationTargets,
} from "./translationTargets";

test.each(["display:none", "display: none !important"])(
  "filters parsed inline display and preserves the live source: %s",
  (style) => {
    document.body.innerHTML = `<p>Visible <span style="${style}"><b>Secret</b></span><code>code<span style="${style}">Secret</span></code></p>`;
    const source = document.querySelector("p");
    expect(getInlineVisibleText(source)).toBe("Visible code");
    const clone = cloneWithoutInlineHidden(source);
    expect(clone.textContent).toBe("Visible code");
    expect(source.textContent).toBe("Visible SecretcodeSecret");
    expect(isInInlineHidden(source.querySelector("b"))).toBe(true);
  }
);

test("checks shadow hosts without caching their display", () => {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = "<p>Shadow text</p>";
  host.style.display = "none";
  expect(isInInlineHidden(shadow.querySelector("p"))).toBe(true);
  expect(getInlineVisibleText(shadow)).toBe("");
  host.style.display = "block";
  expect(getInlineVisibleText(shadow)).toBe("Shadow text");
});

test.each(["true", "false"])(
  "scan and preview skip hidden targets: autoScan=%s",
  (autoScan) => {
    document.body.innerHTML =
      '<main><section style="display:none"><p>Secret</p></section><p id="visible">Visible</p></main>';
    const visit = jest.fn();
    const options = {
      autoScan,
      selector: "p",
      ignoreSelector: "script",
      isBlock: () => true,
      hasText: (node) =>
        Array.from(node.childNodes).some(
          (child) => child.nodeType === 3 && child.textContent.trim()
        ),
      wrapperClass: "kiss-translator-wrapper",
    };
    visitTranslationTargets(document.querySelector("main"), options, visit);
    expect(visit.mock.calls.map(([node]) => node.id)).toEqual(["visible"]);
  }
);

test("does not infer hiding from stylesheets, ARIA, or unrelated inline values", () => {
  document.body.innerHTML =
    '<style>.hidden { display:none }</style><p class="hidden" aria-hidden="true" style="visibility:hidden">Source</p>';
  expect(getInlineVisibleText(document.querySelector("p"))).toBe("Source");
});

test.each([null, undefined])("handles an absent source: %s", (node) => {
  expect(getInlineVisibleText(node)).toBe("");
  expect(cloneWithoutInlineHidden(node)).toBe(node);
});

test("skips entire ignored subtrees without consulting their descendants", () => {
  document.body.innerHTML =
    '<p>Visible<span class="ignored"><b>SECRET</b></span> source</p>';
  const skip = jest.fn((node) => node.matches(".ignored"));
  expect(getInlineVisibleText(document.querySelector("p"), skip)).toBe(
    "Visible source"
  );
  expect(skip.mock.calls.map(([node]) => node.tagName)).toEqual(["P", "SPAN"]);
  expect(document.querySelector("b").textContent).toBe("SECRET");
});
