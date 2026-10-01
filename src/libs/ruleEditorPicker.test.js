import { RuleElementPicker } from "./ruleEditorPicker";
import {
  elementTextPreview,
  recommendSelector,
  selectorCandidates,
} from "./ruleEditorDom";

let picker, title, image;
const rect = (left, top, width, height) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

beforeEach(() => {
  document.body.innerHTML = `
    <div class="card" style="position:relative">
      <a href="/away"><img></a>
      <div class="footer" style="position:absolute;pointer-events:none">
        <p class="title">Card title</p>
      </div>
    </div>`;
  picker = new RuleElementPicker();
  title = document.querySelector("p");
  image = document.querySelector("img");
  const computedStyle = window.getComputedStyle;
  // JSDOM omits these browser defaults, which would hide stacking regressions.
  jest.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = computedStyle(element);
    return new Proxy(style, {
      get: (target, key) =>
        target[key] || { position: "static", zIndex: "auto" }[key],
    });
  });
  jest.spyOn(document, "createRange").mockImplementation(() => ({
    selectNodeContents: jest.fn(),
    getClientRects: () => [rect(20, 70, 80, 20)],
  }));
});
afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

test("picks text in a sibling footer that ignores mouse events", () => {
  expect(picker.elementsAtPoint(50, 80, image)[0]).toBe(title);
  expect(picker.elementsAtPoint(50, 40, image)[0]).toBe(image);
  expect(title.style.pointerEvents).toBe("");
});

test("rejects hidden and clipped text even when its Range has rectangles", () => {
  title.parentElement.style.visibility = "hidden";
  expect(picker.elementsAtPoint(50, 80, image)[0]).toBe(image);
  title.parentElement.style.visibility = "visible";
  title.parentElement.style.overflowY = "hidden";
  title.parentElement.getBoundingClientRect = () => rect(20, 20, 80, 30);
  expect(picker.elementsAtPoint(50, 80, image)[0]).toBe(image);
});

test("does not expose text behind a later high stacking layer", () => {
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;z-index:100";
  document.querySelector(".card").append(modal);
  expect(picker.elementsAtPoint(50, 80, modal)[0]).toBe(modal);
});

test("does not prioritize ancestor text covered by a descendant layer", () => {
  document.body.innerHTML = `
    <div class="card" style="position:relative">Card title
      <div class="overlay" style="position:absolute;inset:0;background:gray"></div>
    </div>`;
  const overlay = document.querySelector(".overlay");
  expect(picker.elementsAtPoint(50, 80, overlay)[0]).toBe(overlay);
});

test.each(["flex", "inline-flex", "grid", "inline-grid"])(
  "respects z-index on static %s items instead of their document order",
  (display) => {
    document.body.innerHTML = `
      <div style="display:${display}">
        <div class="overlay" style="z-index:20;background:gray"></div>
        <div style="z-index:1;pointer-events:none"><p>Card title</p></div>
      </div>`;
    const overlay = document.querySelector(".overlay");
    expect(picker.elementsAtPoint(50, 80, overlay)[0]).toBe(overlay);
    overlay.style.zIndex = "0";
    expect(picker.elementsAtPoint(50, 80, overlay)[0]).toBe(
      document.querySelector("p")
    );
  }
);

test("keeps text above a descendant with a negative z-index", () => {
  document.body.innerHTML = `
    <div class="card" style="position:relative;isolation:isolate">Card title
      <div class="background" style="position:absolute;z-index:-1"></div>
    </div>`;
  const background = document.querySelector(".background");
  expect(picker.elementsAtPoint(50, 80, background)[0]).toBe(
    document.querySelector(".card")
  );
});

test("cached text nodes use fresh geometry and can be invalidated", () => {
  expect(picker.elementsAtPoint(50, 80, image)[0]).toBe(title);
  document.createRange.mockImplementation(() => ({
    selectNodeContents: jest.fn(),
    getClientRects: () => [rect(20, 120, 80, 20)],
  }));
  expect(picker.elementsAtPoint(50, 80, image)[0]).toBe(image);
  expect(picker.elementsAtPoint(50, 130, image)[0]).toBe(title);
  title.replaceWith(title.cloneNode(true));
  picker.invalidate();
  expect(picker.elementsAtPoint(50, 130, image)[0]).toBe(
    document.querySelector("p")
  );
});

test("recommends a shared component structure that survives new IDs and hashes", () => {
  document.body.innerHTML =
    `<p class="mantine-Text-root" data-size="xl" data-line-clamp="true">Profile name</p>` +
    ["qgyKJ3Wu", "uj4nyn50"]
      .map(
        (id) => `
      <div id="${id}">
        <div class="AspectRatioCard-module-scss-module__qD4-9G__footer">
          <p class="mantine-focus-auto Cards-module__OuHqJW__dropShadow m_b6d8b162 mantine-Text-root" data-size="xl" data-line-clamp="true">Title</p>
        </div>
      </div>`
      )
      .join("");
  const element = document.querySelector("div p");
  const candidates = selectorCandidates(element);
  expect(
    candidates.find(
      ({ selector, kind, count }) =>
        kind === "container" && count === 1 && selector.startsWith("#")
    ).fragile
  ).toBe(true);
  expect(
    candidates.find(({ selector }) => selector === ".m_b6d8b162").fragile
  ).toBe(true);
  const recommended = recommendSelector(candidates);
  expect(recommended.count).toBe(2);
  expect(recommended.selector).not.toMatch(/qgyKJ3Wu|OuHqJW|qD4-9G|m_b6d8b162/);
  document.querySelectorAll("div[id]").forEach((node, index) => {
    node.id = `changed-${index}`;
  });
  document.querySelectorAll("div[class]").forEach((node) => {
    node.className = node.className.replace("qD4-9G", "newHash");
  });
  document.querySelectorAll("div p").forEach((node) => {
    node.className = node.className.replace("OuHqJW", "anotherHash");
  });
  expect(document.querySelectorAll(recommended.selector)).toHaveLength(2);
});

test("preserves stable title classes when recommending presentation variants", () => {
  document.body.innerHTML = `
    <main class="page">
      <div class="card">
        <p class="title" data-size="xl">Title</p>
        <p class="description" data-size="xl">Description</p>
      </div>
      <p class="profile" data-size="xl">Profile</p>
    </main>`;
  const element = document.querySelector(".title");
  const recommended = recommendSelector(selectorCandidates(element));
  expect(Array.from(document.querySelectorAll(recommended.selector))).toEqual([
    element,
  ]);
  expect(recommended.selector).toContain(".title");
});

test("can scope presentation variants when the target has no stable class", () => {
  document.body.innerHTML = `
    <div class="card"><p data-size="xl">Title</p></div>
    <p data-size="xl">Profile</p>`;
  const element = document.querySelector("div p");
  const recommended = recommendSelector(selectorCandidates(element));
  expect(recommended.selector).toBe('.card p[data-size="xl"]');
  expect(recommended.count).toBe(1);
});

test("module selectors preserve local-name and class-token boundaries", () => {
  document.body.innerHTML = `
    <p class="Cards-module__a-b__title">Title</p>
    <p class="other Cards-module__a-b__titleDescription">Description</p>
    <p class="OtherCards-module__a-b__title">Other component</p>`;
  const element = document.querySelector("p");
  const recommended = recommendSelector(selectorCandidates(element));
  expect(recommended.fragile).toBe(false);
  expect(Array.from(document.querySelectorAll(recommended.selector))).toEqual([
    element,
  ]);
  element.className = "before Cards-module__newHash__title after";
  expect(document.querySelectorAll(recommended.selector)).toHaveLength(1);
  expect(document.querySelector(recommended.selector)).toBe(element);
});

test("rejects module fragments that match across different class tokens", () => {
  document.body.innerHTML = `
    <div class="Card-module__hash__footer">
      <p class="Cards-module__hash__title" data-size="xl">Title</p>
    </div>
    <div class="Card-module__hash__body Other-module__hash__footer">
      <p class="Cards-module__hash__description Other-module__hash__title" data-size="xl">Description</p>
    </div>`;
  const element = document.querySelector("p");
  const candidates = selectorCandidates(element);
  expect(
    candidates.find(({ selector }) => selector === ".Cards-module__hash__title")
      .fragile
  ).toBe(true);
  for (const candidate of candidates) {
    if (candidate.selector.includes("[class"))
      expect(Array.from(document.querySelectorAll(candidate.selector))).toEqual(
        [element]
      );
  }
});

test.each([" ", "\t"])(
  "module selectors support class tokens separated by %p",
  (separator) => {
    document.body.innerHTML = '<p class="Cards-module__hash__title">Title</p>';
    const element = document.querySelector("p");
    const recommended = recommendSelector(selectorCandidates(element));
    element.setAttribute(
      "class",
      `before${separator}Cards-module__newHash__title${separator}after`
    );
    expect(document.querySelector(recommended.selector)).toBe(element);
  }
);

test("element previews omit scripts, form contents, editor UI and hidden counters", () => {
  document.body.innerHTML =
    '<div><script>configuration secret</script><style>.hidden{color:red}</style><textarea>form value</textarea><p>Card <b>title</b><span aria-hidden="true">0123456789</span></p><div id="kiss-rule-editor">editor controls</div></div>';
  expect(elementTextPreview(document.querySelector("div"))).toBe("Card title");
});
