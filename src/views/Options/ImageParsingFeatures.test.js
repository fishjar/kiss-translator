import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import ImageParsingFeatures from "./ImageParsingFeatures";
import CapabilityOptions from "./CapabilityOptions";

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});
async function render(view) {
  await act(async () => root.render(view));
}
async function hover() {
  await act(async () =>
    Simulate.mouseOver(container.querySelector('span[tabindex="0"]'))
  );
  await act(async () => jest.advanceTimersByTime(200));
}

test.each([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
  [undefined, undefined],
])(
  "hover shows declarations independently: translation=%s layout=%s",
  async (translation, layout) => {
    await render(
      <ImageParsingFeatures
        descriptor={{
          includesTranslation: translation,
          includesLayout: layout,
        }}
      >
        <span>VLM</span>
      </ImageParsingFeatures>
    );
    expect(container.textContent).toBe("VLM");
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await hover();
    const text = document.querySelector('[role="tooltip"]').textContent;
    expect(text).toContain(
      "附带译文：" + (translation === true ? "支持" : "未声明支持")
    );
    expect(text).toContain(
      "附带布局：" + (layout === true ? "支持" : "未声明支持")
    );
    expect(text).toContain("实际输出取决于所选提示词和模型");
  }
);
test("services without image parsing retain their label without a tooltip", async () => {
  await render(
    <ImageParsingFeatures>
      <span>Other</span>
    </ImageParsingFeatures>
  );
  expect(container.textContent).toBe("Other");
  expect(container.querySelector("span[tabindex]")).toBeNull();
});
test("disabled capability declarations remain available without enabling the task", async () => {
  const onChange = jest.fn();
  const api = {
    enabledCapabilities: [],
    provider: {
      apiVersion: 1,
      capabilities: {
        parseImage: { handler: "parseImage", includesTranslation: true },
      },
    },
  };
  const before = JSON.stringify(api);
  await render(<CapabilityOptions api={api} onChange={onChange} />);
  expect(container.textContent).not.toContain("附带译文");
  await hover();
  expect(document.querySelector('[role="tooltip"]').textContent).toContain(
    "附带译文：支持"
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(api)).toBe(before);
});
