import {
  isInInlineHidden,
  isInlineHidden,
  getInlineVisibleText,
  cloneWithoutInlineHidden,
  visitTranslationTargets,
  getNodeLayout,
  hasBlockLayout,
} from "./translationTargets";

test.each([
  ['<span display="block" style="display:inline"></span>', "inline"],
  ['<div display="inline" style="display:block"></div>', "block"],
  ["<unknown-box hidden></unknown-box>", "hidden"],
  ['<span style="display:contents"></span>', "contents"],
  ['<span style="display:math"></span>', "atomic"],
  ['<span style="display:block math"></span>', "block"],
  ['<span style="display:block ruby"></span>', "block"],
])(
  "reads computed layout independently of HTML display attributes: %s",
  (html, layout) => {
    document.body.innerHTML = html;
    expect(getNodeLayout(document.body.firstElementChild)).toBe(layout);
  }
);

test.each([
  "ruby",
  "ruby-base",
  "ruby-text",
  "ruby-base-container",
  "ruby-text-container",
])("keeps internal ruby boxes out of paragraph boundaries: %s", (display) => {
  document.body.innerHTML = `<span style="display:${display}">Annotation</span>`;
  const node = document.body.firstElementChild;
  expect(getNodeLayout(node)).toBe("atomic");
  expect(hasBlockLayout(node)).toBe(false);
  const visit = jest.fn();
  document.body.innerHTML = `<main id="root">Before <span style="display:${display}">annotation</span> after</main>`;
  const root = document.querySelector("main");
  visitTranslationTargets(
    root,
    {
      autoScan: "true",
      ignoreSelector: "script",
      wrapperClass: "kiss-translator-wrapper",
      isBlock: (child) => hasBlockLayout(child),
      hasText: () => true,
    },
    visit
  );
  expect(visit.mock.calls.map(([target]) => target)).toEqual([root]);
});

test("reads iframe styles through the element's own window", () => {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = win.document;
  doc.body.innerHTML =
    '<style>.hidden { display:none }</style><span class="hidden">Source</span>';
  // Keep hiding in the stylesheet so both helpers must consult the right view.
  const source = doc.querySelector("span");
  const ownerStyle = jest.spyOn(win, "getComputedStyle");
  const parentStyle = jest
    .spyOn(window, "getComputedStyle")
    .mockImplementation(() => {
      throw new Error("Must use the owner document's window");
    });
  try {
    expect(getNodeLayout(source)).toBe("hidden");
    expect(isInlineHidden(source)).toBe(true);
    source.className = "";
    source.style.display = "block";
    expect(getNodeLayout(source)).toBe("block");
    expect(isInlineHidden(source)).toBe(false);
    expect(ownerStyle).toHaveBeenCalledTimes(4);
    expect(parentStyle).not.toHaveBeenCalled();
  } finally {
    parentStyle.mockRestore();
    ownerStyle.mockRestore();
    frame.remove();
  }
});

test("falls back to the current window for a document without a view", () => {
  const doc = document.implementation.createHTMLDocument();
  const source = doc.createElement("span");
  expect(doc.defaultView).toBeNull();
  const style = jest
    .spyOn(window, "getComputedStyle")
    .mockReturnValue({ display: "inline" });
  try {
    expect(getNodeLayout(source)).toBe("inline");
    expect(isInlineHidden(source)).toBe(false);
    expect(style).toHaveBeenCalledWith(source);
  } finally {
    style.mockRestore();
  }
});

test.each([
  "inline",
  "contents",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
])(
  "finds structural blocks without entering atomic inline boxes: %s",
  (display) => {
    document.body.innerHTML = `<unknown-box style="display:${display}"><span><div>Block</div></span></unknown-box>`;
    expect(hasBlockLayout(document.body.firstElementChild)).toBe(
      ["inline", "contents"].includes(display)
    );
  }
);

test("explicit boundaries override hidden layout and preserved inline content", () => {
  document.body.innerHTML = '<span class="forced" style="display:none"></span>';
  expect(
    hasBlockLayout(
      document.body.firstElementChild,
      (node) => node.matches?.(".forced"),
      () => true
    )
  ).toBe(true);
});

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

test("filters stylesheet-hidden source without changing the live DOM", () => {
  document.body.innerHTML =
    '<style>.hidden { display:none }</style><p>Visible<span class="hidden">Secret</span></p>';
  const source = document.querySelector("p");
  expect(getInlineVisibleText(source)).toBe("Visible");
  expect(cloneWithoutInlineHidden(source).textContent).toBe("Visible");
  expect(source.textContent).toBe("VisibleSecret");
  source.firstElementChild.classList.remove("hidden");
  expect(getInlineVisibleText(source)).toBe("VisibleSecret");
});

test("does not infer display:none from ARIA or visibility", () => {
  document.body.innerHTML =
    '<p aria-hidden="true" style="visibility:hidden">Source</p>';
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
