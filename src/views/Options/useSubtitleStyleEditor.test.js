import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSubtitleStyleEditor } from "./useSubtitleStyleEditor";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("useSubtitleStyleEditor", () => {
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;

  beforeEach(() => {
    jest.useFakeTimers();
    global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    global.cancelAnimationFrame = clearTimeout;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("flushes the latest pending style when the editor unmounts", () => {
    const writes = [];
    let writerVersion = 0;
    let editor;
    const root = createRoot(document.createElement("div"));
    function Harness({ revision }) {
      const version = ++writerVersion;
      editor = useSubtitleStyleEditor({
        originStyle: "color: white;",
        translationStyle: "color: blue;",
        windowStyle: "background-color: black;",
        updateSubtitle: (value) => writes.push({ value, version }),
      });
      return null;
    }

    act(() => root.render(<Harness revision={0} />));
    act(() => editor.updateOriginCss("font-weight", "700"));
    act(() => root.render(<Harness revision={1} />));
    act(() => root.unmount());

    expect(writes).toEqual([
      {
        value: {
          originStyle: expect.stringContaining("font-weight: 700"),
        },
        version: 2,
      },
    ]);
  });

  test("debounces repeated edits across changing writer identities", () => {
    const writes = [];
    let latestWriterVersion = 0;
    let editor;
    const root = createRoot(document.createElement("div"));
    function Harness({ revision }) {
      const version = ++latestWriterVersion;
      editor = useSubtitleStyleEditor({
        originStyle: "color: white;",
        translationStyle: "color: blue;",
        windowStyle: "background-color: black;",
        updateSubtitle: (value) => writes.push({ value, version }),
      });
      return null;
    }

    act(() => root.render(<Harness revision={0} />));
    const editAndRender = (index) => {
      act(() => {
        editor.updateOriginCss("font-size", `${index + 10}px`);
        root.render(<Harness revision={index + 1} />);
      });
    };
    for (let index = 0; index < 10; index += 1) {
      editAndRender(index);
    }

    expect(writes).toEqual([]);
    act(() => jest.advanceTimersByTime(199));
    expect(writes).toEqual([]);
    act(() => jest.advanceTimersByTime(1));
    expect(writes).toEqual([
      {
        value: {
          originStyle: expect.stringContaining("font-size: 19px"),
        },
        version: latestWriterVersion,
      },
    ]);

    act(() => root.unmount());
    expect(writes).toHaveLength(1);
  });

  test("preserves advanced CSS source during a visual property edit", () => {
    const source = [
      "/* fallback declaration */",
      "color: red;",
      "color : blue !important;",
      "unknown ???;",
      '--token: {"semi":";"};',
    ].join("\n");
    const expected = [
      "/* fallback declaration */",
      "color: red;",
      "color : #123456 !important;",
      "unknown ???;",
      '--token: {"semi":";"};',
    ].join("\n");
    const writes = [];
    let editor;
    const root = createRoot(document.createElement("div"));
    function Harness() {
      editor = useSubtitleStyleEditor({
        originStyle: source,
        translationStyle: "color: blue;",
        windowStyle: "background-color: black;",
        updateSubtitle: (value) => writes.push(value),
      });
      return null;
    }

    act(() => root.render(<Harness />));
    act(() => editor.updateOriginCss("color", "#123456"));
    act(() => jest.advanceTimersByTime(200));

    expect(writes).toEqual([{ originStyle: expected }]);
    expect(editor.localOriginStyle).toBe(expected);
    act(() => root.unmount());
  });
});
