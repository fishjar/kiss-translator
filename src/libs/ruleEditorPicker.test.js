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

test("element previews omit scripts, form contents, editor UI and hidden counters", () => {
  document.body.innerHTML =
    '<div><script>configuration secret</script><style>.hidden{color:red}</style><textarea>form value</textarea><p>Card <b>title</b><span aria-hidden="true">0123456789</span></p><div id="kiss-rule-editor">editor controls</div></div>';
  expect(elementTextPreview(document.querySelector("div"))).toBe("Card title");
});
