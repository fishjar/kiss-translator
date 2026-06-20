import { act } from "react";
import Selection from "../views/Selection";
import { APP_CONSTS } from "../config";
import { TransboxManager } from "./tranbox";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../views/Selection", () => jest.fn(() => null));

function lastSelectionProps() {
  const calls = Selection.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe("TransboxManager", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Selection.mockClear();
  });

  test("rerenders the active selection box when settings update", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "select" },
      });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).not.toBeNull();
    const initialRenderCount = Selection.mock.calls.length;
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("select");

    act(() => {
      manager.update({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
      });
    });

    expect(Selection.mock.calls.length).toBeGreaterThan(initialRenderCount);
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("click");

    act(() => {
      manager.disable();
    });
  });

  test("unmounts when transOpen is disabled", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
      });
    });

    act(() => {
      manager.update({ tranboxSetting: { transOpen: false } });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).toBeNull();
  });

  test("mounts when a disabled manager is enabled by update", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: false, triggerMode: "click" },
      });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).toBeNull();

    act(() => {
      manager.update({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
      });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).not.toBeNull();
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("click");

    act(() => {
      manager.disable();
    });
  });

  test("keeps API prompt resolution on update renders", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "select" },
        transApis: [
          {
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPromptSlug: "dictionary-en-zh",
          },
        ],
      });
    });

    expect(lastSelectionProps().transApis[0].dictPrompt).toBeTruthy();

    act(() => {
      manager.update({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
        transApis: [
          {
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPromptSlug: "dictionary-en-zh",
          },
        ],
      });
    });

    expect(lastSelectionProps().transApis[0].dictPrompt).toBeTruthy();
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("click");

    act(() => {
      manager.disable();
    });
  });
});
