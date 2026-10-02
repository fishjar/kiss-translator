/* eslint-disable testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
} from "../../config";
import { useSetting } from "../../hooks/Setting";
import { sendTabMsg } from "../../libs/msg";
import { queryPopupData } from "./loadData";
import { usePopupFeatureToggles } from "./usePopupFeatureToggles";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
jest.mock("../../libs/msg", () => ({ sendTabMsg: jest.fn() }));
jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  kissLog: jest.fn(),
}));
jest.mock("./loadData", () => ({ queryPopupData: jest.fn() }));

const initialSetting = {
  tranboxSetting: { transOpen: true, apiSlugs: ["google"] },
  mouseHoverSetting: { useMouseHover: false, mouseHoverKey: ["Alt"] },
  inputRule: { transOpen: false, toLang: "en" },
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("Popup global feature preferences", () => {
  let container;
  let root;
  let latest;
  let storedSetting;
  let updateSetting;
  let props;

  function Probe(probeProps) {
    latest = usePopupFeatureToggles(probeProps);
    return null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    storedSetting = JSON.parse(JSON.stringify(initialSetting));
    updateSetting = jest.fn(async (update) => {
      storedSetting = update(storedSetting);
      return storedSetting;
    });
    useSetting.mockImplementation(() => ({
      setting: storedSetting,
      updateSetting,
    }));
    sendTabMsg.mockReset();
    queryPopupData.mockReset();
    props = {
      setting: initialSetting,
      targetTab: { id: 7 },
      documentInfo: { token: "first-document", frameId: 0 },
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  function render(nextProps = props) {
    act(() => root.render(<Probe {...nextProps} />));
  }

  test("counts and exposes only supported global features", () => {
    render({
      ...props,
      setting: {
        ...initialSetting,
        mouseHoverSetting: { useMouseHover: true },
      },
      capabilities: { hoverTranslation: false, inputTranslation: false },
    });

    expect(latest.features.map((feature) => feature.name)).toEqual([
      "selection",
    ]);
    expect(latest.enabledCount).toBe(1);
  });

  test("persists a confirmed change while preserving sibling settings", async () => {
    const command = deferred();
    sendTabMsg.mockReturnValue(command.promise);
    queryPopupData.mockResolvedValue({
      setting: {
        ...initialSetting,
        mouseHoverSetting: {
          ...initialSetting.mouseHoverSetting,
          useMouseHover: true,
        },
      },
    });
    render();

    let operation;
    act(() => {
      operation = latest.handleMouseHoverToggle(true);
    });
    expect(updateSetting).not.toHaveBeenCalled();
    expect(
      latest.features.find((feature) => feature.name === "hover").pending
    ).toBe(true);

    await act(async () => {
      command.resolve({});
      await operation;
    });
    expect(sendTabMsg).toHaveBeenCalledWith(
      MSG_MOUSEHOVER_TOGGLE,
      { enabled: true },
      undefined,
      7,
      undefined,
      "first-document"
    );
    expect(storedSetting.mouseHoverSetting).toEqual({
      useMouseHover: true,
      mouseHoverKey: ["Alt"],
    });
    expect(storedSetting.tranboxSetting).toEqual(initialSetting.tranboxSetting);
    expect(latest.enabledCount).toBe(2);
  });

  test("settles a runtime confirmation while hidden and permits another toggle after returning", async () => {
    const confirmation = deferred();
    sendTabMsg.mockResolvedValue({});
    queryPopupData
      .mockReturnValueOnce(confirmation.promise)
      .mockResolvedValue({ setting: initialSetting });
    render();

    let operation;
    await act(async () => {
      operation = latest.handleMouseHoverToggle(true);
      await Promise.resolve();
    });
    expect(queryPopupData).toHaveBeenCalledTimes(1);
    render({ ...props, isVisible: false });
    await act(async () => latest.handleInputToggle(true));
    expect(sendTabMsg).toHaveBeenCalledTimes(1);
    expect(
      latest.features.find((feature) => feature.name === "hover").pending
    ).toBe(true);

    await act(async () => {
      confirmation.resolve({
        setting: {
          ...initialSetting,
          mouseHoverSetting: {
            ...initialSetting.mouseHoverSetting,
            useMouseHover: true,
          },
        },
      });
      await operation;
    });
    expect(storedSetting.mouseHoverSetting.useMouseHover).toBe(true);
    expect(latest.features.find((feature) => feature.name === "hover")).toEqual(
      { name: "hover", enabled: true, pending: false, failed: false }
    );

    render({ ...props, isVisible: true });
    await act(async () => latest.handleMouseHoverToggle(false));
    expect(sendTabMsg).toHaveBeenCalledTimes(2);
    expect(storedSetting.mouseHoverSetting.useMouseHover).toBe(false);
    expect(
      latest.features.find((feature) => feature.name === "hover").pending
    ).toBe(false);
  });

  test("runs a queued preference reducer while its page controls are hidden", async () => {
    let queuedUpdate;
    const persistence = deferred();
    updateSetting.mockImplementation((update) => {
      queuedUpdate = update;
      return persistence.promise;
    });
    const processActions = jest.fn(async ({ args }) => ({
      setting: {
        ...initialSetting,
        inputRule: { ...initialSetting.inputRule, transOpen: args.enabled },
      },
    }));
    render({ ...props, processActions });

    let operation;
    await act(async () => {
      operation = latest.handleInputToggle(true);
      await Promise.resolve();
    });
    expect(queuedUpdate).toEqual(expect.any(Function));
    render({ ...props, processActions, isVisible: false });
    storedSetting = queuedUpdate(storedSetting);
    expect(storedSetting.inputRule).toEqual({ transOpen: true, toLang: "en" });
    await act(async () => {
      persistence.resolve(storedSetting);
      await operation;
    });
    expect(latest.features.find((feature) => feature.name === "input")).toEqual(
      { name: "input", enabled: true, pending: false, failed: false }
    );
    expect(processActions).toHaveBeenCalledTimes(1);
  });

  test.each(["runtime", "persistence"])(
    "rolls back a %s failure while hidden and clears the pending gate",
    async (failure) => {
      const response = deferred();
      const processActions = jest.fn(async ({ args }) => ({
        setting: {
          ...initialSetting,
          inputRule: { ...initialSetting.inputRule, transOpen: args.enabled },
        },
      }));
      if (failure === "runtime")
        processActions.mockReturnValueOnce(response.promise);
      else updateSetting.mockReturnValueOnce(response.promise);
      render({ ...props, processActions });

      let operation;
      await act(async () => {
        operation = latest.handleInputToggle(true);
        await Promise.resolve();
      });
      render({ ...props, processActions, isVisible: false });
      await act(async () => {
        response.reject(new Error(`${failure} failed`));
        await operation;
      });
      expect(
        latest.features.find((feature) => feature.name === "input")
      ).toEqual({
        name: "input",
        enabled: false,
        pending: false,
        failed: true,
      });
      expect(storedSetting.inputRule.transOpen).toBe(false);
      expect(processActions).toHaveBeenCalledTimes(
        failure === "runtime" ? 1 : 2
      );

      render({ ...props, processActions, isVisible: true });
      await act(async () => latest.handleInputToggle(true));
      expect(storedSetting.inputRule.transOpen).toBe(true);
      expect(
        latest.features.find((feature) => feature.name === "input")
      ).toEqual({
        name: "input",
        enabled: true,
        pending: false,
        failed: false,
      });
    }
  );

  test("a disabled-page status change does not retire an operation for the same receiver", async () => {
    const command = deferred();
    const processActions = jest.fn(() => command.promise);
    render({ ...props, processActions });

    let operation;
    act(() => {
      operation = latest.handleTransboxToggle(false);
    });
    render({
      ...props,
      processActions,
      isDisabledPage: true,
      isVisible: false,
    });
    await act(async () => {
      command.resolve({
        setting: {
          ...initialSetting,
          tranboxSetting: {
            ...initialSetting.tranboxSetting,
            transOpen: false,
          },
        },
      });
      await operation;
    });
    expect(storedSetting.tranboxSetting.transOpen).toBe(false);
    expect(
      latest.features.find((feature) => feature.name === "selection")
    ).toEqual({
      name: "selection",
      enabled: false,
      pending: false,
      failed: false,
    });
  });

  test("rejects an unconfirmed reply and shows a temporary row failure", async () => {
    sendTabMsg.mockResolvedValue({});
    queryPopupData.mockResolvedValue({ setting: initialSetting });
    render();

    await act(async () => latest.handleInputToggle(true));
    expect(updateSetting).not.toHaveBeenCalled();
    expect(latest.features.find((feature) => feature.name === "input")).toEqual(
      {
        name: "input",
        enabled: false,
        pending: false,
        failed: true,
      }
    );
    act(() => jest.advanceTimersByTime(2000));
    expect(
      latest.features.find((feature) => feature.name === "input").failed
    ).toBe(false);
  });

  test("compensates a confirmed runtime change when persistence fails", async () => {
    updateSetting.mockRejectedValue(new Error("Persistence failed"));
    const processActions = jest.fn(async ({ args }) => ({
      setting: {
        ...initialSetting,
        tranboxSetting: {
          ...initialSetting.tranboxSetting,
          transOpen: args.enabled,
        },
      },
    }));
    render({ ...props, processActions });

    await act(async () => latest.handleTransboxToggle(false));
    expect(processActions.mock.calls).toEqual([
      [{ action: MSG_TRANSBOX_TOGGLE, args: { enabled: false } }],
      [{ action: MSG_TRANSBOX_TOGGLE, args: { enabled: true } }],
    ]);
    expect(
      latest.features.find((feature) => feature.name === "selection").enabled
    ).toBe(true);
    expect(
      latest.features.find((feature) => feature.name === "selection").failed
    ).toBe(true);
  });

  test.each(["mismatch", "missing"])(
    "retains the confirmed actual state when rollback is %s",
    async (failure) => {
      updateSetting.mockRejectedValue(new Error("Persistence failed"));
      const changedSetting = {
        ...initialSetting,
        tranboxSetting: { ...initialSetting.tranboxSetting, transOpen: false },
      };
      const processActions = jest
        .fn()
        .mockResolvedValueOnce({ setting: changedSetting })
        .mockResolvedValueOnce(
          failure === "mismatch" ? { setting: changedSetting } : {}
        );
      render({ ...props, processActions });

      await act(async () => latest.handleTransboxToggle(false));
      expect(
        latest.features.find((feature) => feature.name === "selection")
      ).toEqual({
        name: "selection",
        enabled: false,
        pending: false,
        failed: true,
      });
    }
  );

  test("disabled sites persist global preferences without a runtime message", async () => {
    render({ ...props, documentInfo: undefined, isDisabledPage: true });

    await act(async () => latest.handleInputToggle(true));
    expect(storedSetting.inputRule).toEqual({ transOpen: true, toLang: "en" });
    expect(sendTabMsg).not.toHaveBeenCalled();
    expect(queryPopupData).not.toHaveBeenCalled();
    expect(latest.enabledCount).toBe(2);
  });

  test("a disabled-site storage failure rolls back only its preference control", async () => {
    updateSetting.mockRejectedValue(new Error("Persistence failed"));
    render({ ...props, documentInfo: undefined, isDisabledPage: true });

    await act(async () => latest.handleInputToggle(true));
    expect(latest.features.find((feature) => feature.name === "input")).toEqual(
      { name: "input", enabled: false, pending: false, failed: true }
    );
    expect(sendTabMsg).not.toHaveBeenCalled();
  });

  test("a retired document cannot persist a late confirmation", async () => {
    const command = deferred();
    sendTabMsg.mockReturnValue(command.promise);
    queryPopupData.mockResolvedValue({
      setting: {
        ...initialSetting,
        inputRule: { ...initialSetting.inputRule, transOpen: true },
      },
    });
    render();

    let operation;
    act(() => {
      operation = latest.handleInputToggle(true);
    });
    act(() => root.render(null));
    await act(async () => {
      command.resolve({});
      await operation;
    });
    expect(updateSetting).not.toHaveBeenCalled();
    expect(sendTabMsg.mock.calls[0][0]).toBe(MSG_TRANSINPUT_TOGGLE);
  });

  test.each(["document", "frame", "tab", "receiver"])(
    "a retired %s identity cannot persist a late confirmation",
    async (changedIdentity) => {
      const command = deferred();
      sendTabMsg.mockReturnValue(command.promise);
      queryPopupData.mockResolvedValue({
        setting: {
          ...initialSetting,
          inputRule: { ...initialSetting.inputRule, transOpen: true },
        },
      });
      render();
      let operation;
      act(() => {
        operation = latest.handleInputToggle(true);
      });
      const nextProps = {
        ...props,
        ...(changedIdentity === "document"
          ? { documentInfo: { ...props.documentInfo, token: "next-document" } }
          : changedIdentity === "frame"
            ? { documentInfo: { ...props.documentInfo, frameId: 7 } }
            : changedIdentity === "tab"
              ? { targetTab: { id: 99 } }
              : { processActions: jest.fn() }),
      };
      render(nextProps);
      await act(async () => {
        command.resolve({});
        await operation;
      });
      expect(updateSetting).not.toHaveBeenCalled();
      expect(storedSetting.inputRule.transOpen).toBe(false);
    }
  );

  test("concurrent feature changes merge against the latest stored settings", async () => {
    const processActions = jest.fn(async ({ action, args }) => ({
      setting: {
        ...initialSetting,
        ...(action === MSG_MOUSEHOVER_TOGGLE
          ? {
              mouseHoverSetting: {
                ...initialSetting.mouseHoverSetting,
                useMouseHover: args.enabled,
              },
            }
          : {
              inputRule: {
                ...initialSetting.inputRule,
                transOpen: args.enabled,
              },
            }),
      },
    }));
    render({ ...props, processActions });

    await act(async () => {
      await Promise.all([
        latest.handleMouseHoverToggle(true),
        latest.handleInputToggle(true),
      ]);
    });
    expect(storedSetting.mouseHoverSetting).toEqual({
      useMouseHover: true,
      mouseHoverKey: ["Alt"],
    });
    expect(storedSetting.inputRule).toEqual({ transOpen: true, toLang: "en" });
    expect(latest.enabledCount).toBe(3);
  });

  test("queued storage reducers skip preferences after the popup retires", async () => {
    let queuedUpdate;
    const persistence = deferred();
    updateSetting.mockImplementation((update) => {
      queuedUpdate = update;
      return persistence.promise;
    });
    const processActions = jest.fn(async () => ({
      setting: {
        ...initialSetting,
        inputRule: { ...initialSetting.inputRule, transOpen: true },
      },
    }));
    render({ ...props, processActions });

    let operation;
    await act(async () => {
      operation = latest.handleInputToggle(true);
      await Promise.resolve();
    });
    act(() => root.render(null));
    expect(queuedUpdate(storedSetting)).toBe(storedSetting);
    await act(async () => {
      persistence.resolve();
      await operation;
    });
  });
});
