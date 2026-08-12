import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import Apis from "./Apis";
import {
  OPT_TRANS_BUILTINAI,
  GEMINI_INTERACTIONS_URL,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
} from "../../config";
import { fetchModelCatalog } from "../../libs/modelList";
import { apiTranslate } from "../../apis";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollTo = jest.fn();
const mockConfirm = jest.fn();

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/Api", () => ({
  ...jest.requireActual("../../hooks/Api"),
  useApiList: jest.fn(),
  useApiItem: jest.fn(),
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => mockConfirm,
}));

jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: { prompts: [], subtitleSetting: {}, uiLang: "zh" },
  }),
}));

jest.mock("../../apis", () => ({
  apiTranslate: jest.fn(),
}));

jest.mock("../../libs/modelList", () => ({
  fetchModelCatalog: jest.fn(),
}));

jest.mock("./ReusableAutocomplete", () => {
  return function MockReusableAutocomplete({
    name,
    label,
    value,
    options = [],
    onChange,
    onFocus,
    textFieldProps = {},
  }) {
    return (
      <label>
        {label}
        <input
          name={name}
          value={value || ""}
          onChange={onChange}
          onFocus={onFocus}
          data-options={options.join(",")}
          aria-invalid={textFieldProps.error ? "true" : "false"}
        />
        {textFieldProps.helperText ? (
          <span>{textFieldProps.helperText}</span>
        ) : null}
      </label>
    );
  };
});
const { useApiList, useApiItem } = require("../../hooks/Api");

function createApi(overrides = {}) {
  return {
    apiSlug: "OpenAI",
    apiName: "OpenAI",
    apiType: OPT_TRANS_OPENAI,
    url: "https://api.openai.com/v1/chat/completions",
    key: "sk-test",
    model: "gpt-4",
    modelListUrl: "https://api.openai.com/v1/models",
    sortOrder: 0,
    httpTimeout: 30,
    ...overrides,
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderApis(api = createApi(), update = jest.fn()) {
  let apis = Array.isArray(api) ? api : [api];
  const reset = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const apiListValue = {
    addApi: jest.fn(),
    deleteApi: jest.fn(),
    deleteApis: jest.fn(),
    pinApis: jest.fn(),
    disableApis: jest.fn(),
    enableApis: jest.fn(),
    copyApi: jest.fn(),
    alphaSortApis: jest.fn(),
    reorderApis: jest.fn(),
  };

  const configureApiMocks = () => {
    useApiList.mockReturnValue({ transApis: apis, ...apiListValue });
    useApiItem.mockImplementation((apiSlug) => ({
      api: apis.find((item) => item.apiSlug === apiSlug),
      update,
      reset,
    }));
  };

  configureApiMocks();

  await act(async () => {
    root.render(<Apis />);
  });
  await flushEffects();

  return {
    apiListValue,
    container,
    rerender: async (nextApis) => {
      apis = nextApis;
      configureApiMocks();
      await act(async () => {
        root.render(<Apis />);
      });
      await flushEffects();
    },
    reset,
    update,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function getInput(container, name) {
  const input = container.querySelector(`input[name="${name}"]`);
  if (!input) {
    throw new Error(`Unable to find input named ${name}`);
  }
  return input;
}

function getSaveButton(container) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "save"
  );
}

function getApiListItem(container, apiName) {
  const item = Array.from(
    container.querySelectorAll(".MuiListItemButton-root")
  ).find((element) => element.textContent.includes(apiName));
  if (!item) {
    throw new Error(`Unable to find list item for ${apiName}`);
  }
  return item;
}

async function editUrlDraft(container) {
  const urlInput = getInput(container, "url");
  await act(async () => {
    Simulate.change(urlInput, {
      target: { name: "url", value: "https://draft.example/v1" },
    });
  });
  return urlInput;
}

describe("Apis ordering and master-detail layout", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("offers explicit A-Z and Z-A actions and starts with A-Z", async () => {
    const view = await renderApis([
      createApi({ apiSlug: "alpha", apiName: "Alpha", sortOrder: 0 }),
      createApi({ apiSlug: "charlie", apiName: "Charlie", sortOrder: 1 }),
      createApi({ apiSlug: "beta", apiName: "Beta", sortOrder: 2 }),
    ]);
    const sortButton = view.container.querySelector("#api-sort-button");

    expect(sortButton.textContent).toContain("Custom");
    expect(sortButton.getAttribute("aria-label")).toContain("Custom");

    await act(async () => {
      Simulate.click(sortButton);
    });

    const sortItems = Array.from(
      document.body.querySelectorAll('[role="menuitemradio"]')
    );
    const ascendingItem = sortItems.find(
      (item) => item.textContent.trim() === "A–Z"
    );
    const descendingItem = sortItems.find(
      (item) => item.textContent.trim() === "Z–A"
    );

    expect(ascendingItem).toBeDefined();
    expect(descendingItem).toBeDefined();
    expect(ascendingItem.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      Simulate.click(ascendingItem);
    });

    expect(view.apiListValue.alphaSortApis).toHaveBeenCalledWith("asc");

    await act(async () => {
      Simulate.click(sortButton);
    });
    const reopenedDescendingItem = Array.from(
      document.body.querySelectorAll('[role="menuitemradio"]')
    ).find((item) => item.textContent.trim() === "Z–A");

    await act(async () => {
      Simulate.click(reopenedDescendingItem);
    });

    expect(view.apiListValue.alphaSortApis).toHaveBeenCalledWith("desc");

    view.unmount();
  });

  test("disables alphabetical sorting when fewer than two APIs can move", async () => {
    const view = await renderApis(createApi());

    expect(view.container.querySelector("#api-sort-button").disabled).toBe(
      true
    );

    view.unmount();
  });

  test("reflects the persisted order and becomes custom after drag reorder", async () => {
    const alpha = createApi({
      apiSlug: "alpha",
      apiName: "Alpha",
      sortOrder: 0,
    });
    const beta = createApi({
      apiSlug: "beta",
      apiName: "Beta",
      sortOrder: 1,
    });
    const charlie = createApi({
      apiSlug: "charlie",
      apiName: "Charlie",
      sortOrder: 2,
    });
    const view = await renderApis([alpha, beta, charlie]);
    const sortButton = view.container.querySelector("#api-sort-button");

    expect(sortButton.textContent).toContain("A–Z");

    const alphaCard = getApiListItem(view.container, "Alpha");
    const charlieCard = getApiListItem(view.container, "Charlie");
    const dragHandle = alphaCard.querySelector('[draggable="true"]');
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      getData: jest.fn(() => "alpha"),
      setData: jest.fn(),
    };

    await act(async () => {
      Simulate.dragStart(dragHandle, { dataTransfer });
    });
    await act(async () => {
      Simulate.dragOver(charlieCard.closest("li"), { dataTransfer });
      Simulate.drop(charlieCard.closest("li"), { dataTransfer });
    });

    expect(view.apiListValue.reorderApis).toHaveBeenCalledWith(
      "alpha",
      "charlie"
    );

    await view.rerender([
      { ...beta, sortOrder: 0 },
      { ...charlie, sortOrder: 1 },
      { ...alpha, sortOrder: 2 },
    ]);

    expect(
      view.container.querySelector("#api-sort-button").textContent
    ).toContain("Custom");

    view.unmount();
  });

  test("uses one-dimensional interactive cards and layered detail actions", async () => {
    const view = await renderApis([
      createApi({ apiSlug: "alpha", apiName: "Alpha", sortOrder: 0 }),
      createApi({ apiSlug: "beta", apiName: "Beta", sortOrder: 1 }),
    ]);
    const masterDetail = view.container.querySelector(".kt-api-master-detail");
    const list = masterDetail.querySelector(".kt-api-list");
    const selectedCard = getApiListItem(view.container, "Alpha");
    const detail = masterDetail.querySelector(".kt-api-detail");

    expect(view.container.querySelector(".kt-api-grid")).toBeNull();
    expect(list.querySelectorAll(".kt-api-list__card")).toHaveLength(2);
    expect(selectedCard.classList.contains("Mui-selected")).toBe(true);
    expect(selectedCard.getAttribute("aria-current")).toBe("true");
    expect(
      selectedCard.parentElement.classList.contains("kt-api-list__item")
    ).toBe(true);
    expect(selectedCard.parentElement.classList.contains("Mui-selected")).toBe(
      false
    );
    expect(masterDetail.children[0]).toBe(list);
    expect(masterDetail.children[1]).toBe(detail);

    const disabledSwitch = detail.querySelector(
      '.kt-api-detail__header input[name="isDisabled"]'
    );
    expect(disabledSwitch).not.toBeNull();
    expect(
      detail.querySelector('.kt-api-detail__header input[name="isPinned"]')
    ).not.toBeNull();

    expect(disabledSwitch.checked).toBe(false);
    await act(async () => disabledSwitch.click());
    expect(disabledSwitch.checked).toBe(true);
    await act(async () => disabledSwitch.click());
    expect(disabledSwitch.checked).toBe(false);
    expect(
      detail.querySelectorAll('[class*="MuiGrid-grid-lg-3"]')
    ).toHaveLength(0);
    expect(
      detail.querySelectorAll('[class*="MuiGrid-grid-lg-6"]').length
    ).toBeGreaterThan(0);

    const footer = detail.querySelector(".kt-api-detail__footer");
    const footerButtonTexts = Array.from(footer.querySelectorAll("button")).map(
      (button) => button.textContent
    );
    expect(footerButtonTexts).toEqual(
      expect.arrayContaining(["save", "click_test", "api_actions"])
    );
    expect(footer.textContent).not.toContain("restore_default");
    expect(footer.textContent).not.toContain("copy_api");
    expect(footer.textContent).not.toContain("delete");

    const moreButton = footer.querySelector(
      '[id^="api-detail-actions-button-"]'
    );
    expect(moreButton.getAttribute("aria-haspopup")).toBe("menu");

    await act(async () => {
      Simulate.click(moreButton);
    });

    const actionMenu = document.body.querySelector(
      `#api-detail-actions-menu-alpha`
    );
    expect(actionMenu.textContent).toContain("restore_default");
    expect(actionMenu.textContent).toContain("copy_api");
    expect(actionMenu.textContent).toContain("delete");

    view.unmount();
  });

  test("uses the service card itself as the bulk-selection control", async () => {
    const view = await renderApis([
      createApi({ apiSlug: "alpha", apiName: "Alpha", sortOrder: 0 }),
      createApi({ apiSlug: "beta", apiName: "Beta", sortOrder: 1 }),
    ]);
    const bulkButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "bulk_actions");

    await act(async () => Simulate.click(bulkButton));

    const bulkCards = Array.from(
      view.container.querySelectorAll('.kt-api-list__card[role="checkbox"]')
    );
    expect(bulkCards).toHaveLength(2);
    expect(bulkCards[1].getAttribute("aria-checked")).toBe("false");
    expect(bulkCards[1].querySelector("input")).toBeNull();

    await act(async () => {
      Simulate.keyDown(bulkCards[1], { key: " " });
      Simulate.keyUp(bulkCards[1], { key: " " });
    });
    expect(bulkCards[1].getAttribute("aria-checked")).toBe("true");
    expect(getInput(view.container, "apiName").value).toBe("Alpha");
    expect(mockConfirm).not.toHaveBeenCalled();

    view.unmount();
  });
});

describe("Apis conditional option groups", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("omits the runtime option shell when the API has no matching controls", async () => {
    const view = await renderApis(
      createApi({ apiSlug: "BuiltinAI", apiType: OPT_TRANS_BUILTINAI })
    );

    expect(view.container.querySelector(".kt-api-runtime-options")).toBeNull();
    expect(
      Array.from(view.container.querySelectorAll(".MuiGrid-item")).filter(
        (item) => !item.firstElementChild && !item.textContent.trim()
      )
    ).toHaveLength(0);

    view.unmount();
  });

  test("keeps runtime options for APIs that support them", async () => {
    const view = await renderApis();

    expect(
      view.container.querySelector(".kt-api-runtime-options")
    ).not.toBeNull();

    view.unmount();
  });
});

describe("Apis model list", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("loads model list once when model input is focused", async () => {
    fetchModelCatalog.mockResolvedValue({
      models: ["gpt-4o", "gpt-4.1"],
      thinkingCapabilities: {},
    });
    const view = await renderApis();
    const modelInput = getInput(view.container, "model");

    await act(async () => {
      Simulate.focus(modelInput);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      Simulate.focus(modelInput);
      await Promise.resolve();
    });

    expect(fetchModelCatalog).toHaveBeenCalledTimes(1);
    expect(fetchModelCatalog).toHaveBeenCalledWith({
      apiType: OPT_TRANS_OPENAI,
      modelListUrl: "https://api.openai.com/v1/models",
      key: "sk-test",
      httpTimeout: 30,
    });
    expect(modelInput.getAttribute("data-options")).toContain("gpt-4o");

    view.unmount();
  });

  test("normalizes mandatory OpenRouter thinking without saving metadata", async () => {
    fetchModelCatalog.mockResolvedValue({
      models: ["provider/mandatory-model"],
      thinkingCapabilities: {
        "provider/mandatory-model": {
          model: "provider/mandatory-model",
          supportedEfforts: ["high", "low"],
          mandatory: true,
        },
      },
    });
    const update = jest.fn();
    const view = await renderApis(
      createApi({
        apiSlug: "OpenRouter",
        apiName: "OpenRouter",
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/mandatory-model",
        modelListUrl: "https://openrouter.ai/api/v1/models",
        thinkingMode: "disabled",
      }),
      update
    );
    const modelInput = getInput(view.container, "model");

    await act(async () => {
      Simulate.focus(modelInput);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();
    expect(view.container.textContent).toContain(
      "gemini_thinking_minimum_helper"
    );

    await act(async () => {
      Simulate.click(getSaveButton(view.container));
    });
    const savedApi = update.mock.calls[0][0];
    expect(savedApi).toMatchObject({
      thinkingMode: "disabled",
      thinkingEffort: "low",
    });
    expect(savedApi).not.toHaveProperty("thinkingCapability");
    expect(savedApi).not.toHaveProperty("thinkingCapabilities");

    view.unmount();
  });

  test("loads OpenRouter capabilities on mode change and reuses the catalog", async () => {
    fetchModelCatalog.mockResolvedValue({
      models: ["provider/reasoning-model"],
      thinkingCapabilities: {
        "provider/reasoning-model": {
          model: "provider/reasoning-model",
          supportedEfforts: ["high", "medium", "low"],
          defaultEffort: "medium",
          defaultEnabled: true,
          mandatory: false,
        },
      },
    });
    const update = jest.fn();
    const view = await renderApis(
      createApi({
        apiSlug: OPT_TRANS_OPENROUTER,
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/reasoning-model",
        modelListUrl: "https://openrouter.ai/api/v1/models",
        thinkingMode: "auto",
        thinkingEffort: "_default",
      }),
      update
    );

    const modeInput = getInput(view.container, "thinkingMode");
    await act(async () => {
      Simulate.change(modeInput, {
        target: { name: "thinkingMode", value: "enabled" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();

    expect(fetchModelCatalog).toHaveBeenCalledTimes(1);
    expect(getInput(view.container, "thinkingEffort").value).toBe("medium");

    await act(async () => {
      Simulate.change(getInput(view.container, "thinkingMode"), {
        target: { name: "thinkingMode", value: "disabled" },
      });
      await Promise.resolve();
    });
    await flushEffects();
    expect(fetchModelCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      Simulate.click(getSaveButton(view.container));
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingMode: "disabled",
        thinkingEffort: "none",
      })
    );

    view.unmount();
  });

  test("resets and resolves OpenRouter effort when the model changes", async () => {
    fetchModelCatalog.mockResolvedValue({
      models: ["provider/model-a", "provider/model-b"],
      thinkingCapabilities: {
        "provider/model-a": {
          model: "provider/model-a",
          supportedEfforts: ["high", "low"],
          defaultEffort: "high",
          defaultEnabled: true,
          mandatory: false,
        },
        "provider/model-b": {
          model: "provider/model-b",
          supportedEfforts: ["low", "minimal"],
          defaultEffort: "low",
          defaultEnabled: true,
          mandatory: false,
        },
      },
    });
    const view = await renderApis(
      createApi({
        apiSlug: OPT_TRANS_OPENROUTER,
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/model-a",
        modelListUrl: "https://openrouter.ai/api/v1/models",
        thinkingMode: "enabled",
        thinkingEffort: "high",
      })
    );
    const modelInput = getInput(view.container, "model");

    await act(async () => {
      Simulate.focus(modelInput);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();
    await act(async () => {
      Simulate.change(modelInput, {
        target: { name: "model", value: "provider/model-b" },
      });
      await Promise.resolve();
    });
    await flushEffects();

    expect(fetchModelCatalog).toHaveBeenCalledTimes(1);
    expect(getInput(view.container, "thinkingEffort").value).toBe("low");

    await act(async () => {
      Simulate.change(modelInput, {
        target: { name: "model", value: "provider/unknown-model" },
      });
      await Promise.resolve();
    });
    await flushEffects();
    expect(
      getInput(view.container, "thinkingMode").getAttribute("aria-invalid")
    ).toBe("true");
    expect(
      view.container.querySelector('input[name="thinkingEffort"]')
    ).toBeNull();

    view.unmount();
  });

  test("does not load model list without url or key", async () => {
    const view = await renderApis(createApi({ key: "" }));
    const modelInput = getInput(view.container, "model");

    await act(async () => {
      Simulate.focus(modelInput);
      await Promise.resolve();
    });

    expect(fetchModelCatalog).not.toHaveBeenCalled();

    view.unmount();
  });

  test("keeps manual model input saveable", async () => {
    const update = jest.fn();
    const view = await renderApis(createApi(), update);
    const modelInput = getInput(view.container, "model");

    await act(async () => {
      Simulate.change(modelInput, {
        target: {
          name: "model",
          value: "manual-model",
        },
      });
    });

    const saveButton = getSaveButton(view.container);
    await act(async () => {
      Simulate.click(saveButton);
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "manual-model",
      })
    );

    view.unmount();
  });

  test("shows fetch failure without clearing model", async () => {
    fetchModelCatalog
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({
        models: ["gpt-4o"],
        thinkingCapabilities: {},
      });
    const view = await renderApis();
    const modelInput = getInput(view.container, "model");

    await act(async () => {
      Simulate.focus(modelInput);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(modelInput.value).toBe("gpt-4");
    expect(modelInput.getAttribute("aria-invalid")).toBe("true");
    expect(view.container.textContent).toContain("model_list_fetch_failed");
    expect(fetchModelCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      Simulate.focus(getInput(view.container, "model"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();

    expect(fetchModelCatalog).toHaveBeenCalledTimes(2);
    expect(getInput(view.container, "model").getAttribute("aria-invalid")).toBe(
      "false"
    );
    expect(
      getInput(view.container, "model").getAttribute("data-options")
    ).toContain("gpt-4o");

    view.unmount();
  });

  test("retries OpenRouter catalog loading after another mode change", async () => {
    fetchModelCatalog
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({
        models: ["provider/reasoning-model"],
        thinkingCapabilities: {
          "provider/reasoning-model": {
            model: "provider/reasoning-model",
            supportedEfforts: ["high", "low"],
            defaultEffort: "high",
            defaultEnabled: true,
            mandatory: false,
          },
        },
      });
    const view = await renderApis(
      createApi({
        apiSlug: OPT_TRANS_OPENROUTER,
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/reasoning-model",
        modelListUrl: "https://openrouter.ai/api/v1/models",
        thinkingMode: "auto",
        thinkingEffort: "_default",
      })
    );

    await act(async () => {
      Simulate.change(getInput(view.container, "thinkingMode"), {
        target: { name: "thinkingMode", value: "enabled" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();
    expect(fetchModelCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      Simulate.change(getInput(view.container, "thinkingMode"), {
        target: { name: "thinkingMode", value: "disabled" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();

    expect(fetchModelCatalog).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).not.toContain("model_list_fetch_failed");
    expect(view.container.textContent).not.toContain(
      "thinking_unknown_model_helper"
    );

    view.unmount();
  });

  test("ignores a failed catalog request after the URL changes", async () => {
    let rejectRequest;
    fetchModelCatalog.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          rejectRequest = reject;
        })
    );
    const view = await renderApis();

    await act(async () => {
      Simulate.focus(getInput(view.container, "model"));
      await Promise.resolve();
    });
    await act(async () => {
      Simulate.change(getInput(view.container, "modelListUrl"), {
        target: {
          name: "modelListUrl",
          value: "https://api.openai.com/v1/models?fixed=1",
        },
      });
      await Promise.resolve();
    });
    await act(async () => {
      rejectRequest(new Error("stale network failure"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getInput(view.container, "model").getAttribute("aria-invalid")).toBe(
      "false"
    );
    expect(view.container.textContent).not.toContain("stale network failure");

    view.unmount();
  });

  test("ignores a successful catalog request after the URL changes", async () => {
    let resolveOldRequest;
    let resolveNewRequest;
    fetchModelCatalog
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldRequest = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewRequest = resolve;
          })
      );
    const view = await renderApis();

    await act(async () => {
      Simulate.focus(getInput(view.container, "model"));
      await Promise.resolve();
    });
    await act(async () => {
      Simulate.change(getInput(view.container, "modelListUrl"), {
        target: {
          name: "modelListUrl",
          value: "https://api.openai.com/v1/models?current=1",
        },
      });
      await Promise.resolve();
    });
    await flushEffects();
    await act(async () => {
      Simulate.focus(getInput(view.container, "model"));
      await Promise.resolve();
    });

    await act(async () => {
      resolveNewRequest({
        models: ["current-model"],
        thinkingCapabilities: {},
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      resolveOldRequest({
        models: ["stale-model"],
        thinkingCapabilities: {},
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const modelOptions = getInput(view.container, "model").getAttribute(
      "data-options"
    );
    expect(modelOptions).toContain("current-model");
    expect(modelOptions).not.toContain("stale-model");

    view.unmount();
  });

  test("resets model list error when url or key changes", async () => {
    fetchModelCatalog.mockRejectedValue(new Error("network failed"));
    const view = await renderApis();
    const modelInput = getInput(view.container, "model");
    const modelListUrlInput = getInput(view.container, "modelListUrl");

    await act(async () => {
      Simulate.focus(modelInput);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(modelInput.getAttribute("aria-invalid")).toBe("true");
    expect(view.container.textContent).toContain("model_list_fetch_failed");

    await act(async () => {
      Simulate.change(modelListUrlInput, {
        target: {
          name: "modelListUrl",
          value: "https://api.openai.com/v1/models?fixed=1",
        },
      });
      await Promise.resolve();
    });

    expect(modelInput.getAttribute("aria-invalid")).toBe("false");
    expect(view.container.textContent).not.toContain("model_list_fetch_failed");

    view.unmount();
  });
});

describe("Apis unsaved API switching", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("keeps the draft and selection when switching APIs is cancelled", async () => {
    const selectedApi = createApi();
    const otherApi = createApi({
      apiSlug: "Other",
      apiName: "Other",
      url: "https://other.example/v1",
    });
    const view = await renderApis([selectedApi, otherApi]);
    const urlInput = await editUrlDraft(view.container);
    mockConfirm.mockResolvedValueOnce(false);

    await act(async () => {
      Simulate.click(getApiListItem(view.container, otherApi.apiName));
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledWith({
      message: "This API has unsaved changes. Discard them?",
      confirmText: "discard_changes",
      cancelText: "cancel",
    });
    expect(urlInput.value).toBe("https://draft.example/v1");
    expect(getInput(view.container, "apiName").value).toBe(selectedApi.apiName);

    view.unmount();
  });

  test("switches clean APIs without confirmation", async () => {
    const otherApi = createApi({
      apiSlug: "Other",
      apiName: "Other",
      url: "https://other.example/v1",
    });
    const view = await renderApis([createApi(), otherApi]);

    await act(async () => {
      Simulate.click(getApiListItem(view.container, otherApi.apiName));
      await Promise.resolve();
    });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(getInput(view.container, "url").value).toBe(otherApi.url);

    view.unmount();
  });

  test("switches APIs after the draft is deliberately discarded", async () => {
    const selectedApi = createApi();
    const otherApi = createApi({
      apiSlug: "Other",
      apiName: "Other",
      url: "https://other.example/v1",
    });
    const view = await renderApis([selectedApi, otherApi]);
    await editUrlDraft(view.container);
    mockConfirm.mockResolvedValueOnce(true);

    await act(async () => {
      Simulate.click(getApiListItem(view.container, otherApi.apiName));
      await Promise.resolve();
    });

    expect(getInput(view.container, "url").value).toBe(otherApi.url);
    expect(getInput(view.container, "apiName").value).toBe(otherApi.apiName);

    view.unmount();
  });

  test("keeps a local draft when the same API is refreshed with a new object", async () => {
    const selectedApi = createApi();
    const view = await renderApis(selectedApi);
    const urlInput = await editUrlDraft(view.container);

    await view.rerender([{ ...selectedApi }]);

    expect(urlInput.value).toBe("https://draft.example/v1");
    expect(getSaveButton(view.container).disabled).toBe(false);

    view.unmount();
  });

  test("cancels alphabetical sorting without discarding the current draft", async () => {
    const view = await renderApis([
      createApi({ apiSlug: "charlie", apiName: "Charlie", sortOrder: 0 }),
      createApi({ apiSlug: "alpha", apiName: "Alpha", sortOrder: 1 }),
    ]);
    const urlInput = await editUrlDraft(view.container);
    mockConfirm.mockResolvedValueOnce(false);

    await act(async () => {
      Simulate.click(view.container.querySelector("#api-sort-button"));
    });
    const ascendingItem = Array.from(
      document.body.querySelectorAll('[role="menuitemradio"]')
    ).find((item) => item.textContent.trim() === "A–Z");
    await act(async () => {
      Simulate.click(ascendingItem);
      await Promise.resolve();
    });

    expect(view.apiListValue.alphaSortApis).not.toHaveBeenCalled();
    expect(urlInput.value).toBe("https://draft.example/v1");

    view.unmount();
  });

  test("treats the already active sort direction as a no-op", async () => {
    const view = await renderApis([
      createApi({ apiSlug: "alpha", apiName: "Alpha", sortOrder: 0 }),
      createApi({ apiSlug: "beta", apiName: "Beta", sortOrder: 1 }),
    ]);
    const urlInput = await editUrlDraft(view.container);

    await act(async () => {
      Simulate.click(view.container.querySelector("#api-sort-button"));
    });
    const ascendingItem = Array.from(
      document.body.querySelectorAll('[role="menuitemradio"]')
    ).find((item) => item.textContent.trim() === "A–Z");
    await act(async () => {
      Simulate.click(ascendingItem);
      await Promise.resolve();
    });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(view.apiListValue.alphaSortApis).not.toHaveBeenCalled();
    expect(urlInput.value).toBe("https://draft.example/v1");

    view.unmount();
  });

  test("sorts after the current draft is deliberately discarded", async () => {
    const selectedApi = createApi({
      apiSlug: "charlie",
      apiName: "Charlie",
      sortOrder: 0,
    });
    const view = await renderApis([
      selectedApi,
      createApi({ apiSlug: "alpha", apiName: "Alpha", sortOrder: 1 }),
    ]);
    await editUrlDraft(view.container);
    mockConfirm.mockResolvedValueOnce(true);

    await act(async () => {
      Simulate.click(view.container.querySelector("#api-sort-button"));
    });
    const ascendingItem = Array.from(
      document.body.querySelectorAll('[role="menuitemradio"]')
    ).find((item) => item.textContent.trim() === "A–Z");
    await act(async () => {
      Simulate.click(ascendingItem);
      await Promise.resolve();
    });

    expect(view.apiListValue.alphaSortApis).toHaveBeenCalledWith("asc");
    expect(getInput(view.container, "url").value).toBe(selectedApi.url);
    expect(getSaveButton(view.container).disabled).toBe(true);

    view.unmount();
  });

  test("cancels drag reordering without discarding the current draft", async () => {
    const selectedApi = createApi({
      apiSlug: "alpha",
      apiName: "Alpha",
      sortOrder: 0,
    });
    const otherApi = createApi({
      apiSlug: "beta",
      apiName: "Beta",
      sortOrder: 1,
    });
    const view = await renderApis([selectedApi, otherApi]);
    const urlInput = await editUrlDraft(view.container);
    mockConfirm.mockResolvedValueOnce(false);
    const selectedCard = getApiListItem(view.container, "Alpha");
    const otherCard = getApiListItem(view.container, "Beta");
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      getData: jest.fn(() => "alpha"),
      setData: jest.fn(),
    };

    await act(async () => {
      Simulate.dragStart(selectedCard.querySelector('[draggable="true"]'), {
        dataTransfer,
      });
      Simulate.dragOver(otherCard.closest("li"), { dataTransfer });
      Simulate.drop(otherCard.closest("li"), { dataTransfer });
      await Promise.resolve();
    });

    expect(view.apiListValue.reorderApis).not.toHaveBeenCalled();
    expect(urlInput.value).toBe("https://draft.example/v1");

    view.unmount();
  });

  test("restores the persisted form before resetting an edited API", async () => {
    const selectedApi = createApi();
    const view = await renderApis(selectedApi);
    await editUrlDraft(view.container);
    const actionsButton = view.container.querySelector(
      '[id^="api-detail-actions-button-"]'
    );

    await act(async () => Simulate.click(actionsButton));
    const resetItem = Array.from(
      document.body.querySelectorAll('[role="menuitem"]')
    ).find((item) => item.textContent === "restore_default");
    await act(async () => Simulate.click(resetItem));

    expect(view.reset).toHaveBeenCalledTimes(1);
    expect(getInput(view.container, "url").value).toBe(selectedApi.url);
    expect(getSaveButton(view.container).disabled).toBe(true);

    view.unmount();
  });
});

describe("Apis batch concurrency", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("disables batch concurrency at one when context is enabled", async () => {
    const view = await renderApis(
      createApi({
        useBatchFetch: true,
        batchConcurrency: 4,
        useContext: true,
      })
    );
    const concurrencyInput = getInput(view.container, "batchConcurrency");

    expect(concurrencyInput.value).toBe("1");
    expect(concurrencyInput.disabled).toBe(true);
    expect(view.container.textContent).toContain(
      "batch_concurrency_context_hint"
    );

    view.unmount();
  });
});

describe("Apis temperature input", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("renders temperature input for OpenAI but hides it for Gemini and Gemini2", async () => {
    const openaiView = await renderApis(
      createApi({ apiType: OPT_TRANS_OPENAI })
    );
    expect(
      openaiView.container.querySelector('input[name="temperature"]')
    ).not.toBeNull();
    openaiView.unmount();

    const geminiView = await renderApis(
      createApi({ apiType: OPT_TRANS_GEMINI })
    );
    expect(
      geminiView.container.querySelector('input[name="temperature"]')
    ).toBeNull();
    geminiView.unmount();

    const gemini2View = await renderApis(
      createApi({ apiType: OPT_TRANS_GEMINI_2 })
    );
    expect(
      gemini2View.container.querySelector('input[name="temperature"]')
    ).toBeNull();
    gemini2View.unmount();
  });
});

describe("Apis static thinking normalization", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("normalizes an unsupported saved effort before saving", async () => {
    const update = jest.fn();
    const view = await renderApis(
      createApi({
        apiSlug: OPT_TRANS_GEMINI,
        apiType: OPT_TRANS_GEMINI,
        model: "gemini-3-pro-preview",
        thinkingMode: "enabled",
        thinkingEffort: "medium",
      }),
      update
    );
    const effortInput = getInput(view.container, "thinkingEffort");
    expect(effortInput.value).toBe("_default");

    await act(async () => {
      Simulate.change(effortInput, {
        target: { name: "thinkingEffort", value: "_default" },
      });
    });
    await act(async () => {
      Simulate.click(getSaveButton(view.container));
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingMode: "enabled",
        thinkingEffort: "high",
      })
    );

    view.unmount();
  });

  test("enables GPT-5.1 with low effort when clicking test", async () => {
    apiTranslate.mockResolvedValue({ trText: "你好" });
    const view = await renderApis(
      createApi({
        model: "gpt-5.1",
        thinkingMode: "disabled",
        thinkingEffort: "none",
      })
    );

    await act(async () => {
      Simulate.change(getInput(view.container, "thinkingMode"), {
        target: { name: "thinkingMode", value: "enabled" },
      });
    });
    await act(async () => {
      Simulate.click(
        Array.from(view.container.querySelectorAll("button")).find(
          (button) => button.textContent === "click_test"
        )
      );
      await Promise.resolve();
    });

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSetting: expect.objectContaining({
          thinkingMode: "enabled",
          thinkingEffort: "low",
        }),
      })
    );

    view.unmount();
  });

  test("uses Gemini 3.6 Flash medium as the interface default", async () => {
    apiTranslate.mockResolvedValue({ trText: "你好" });
    const view = await renderApis(
      createApi({
        apiSlug: OPT_TRANS_GEMINI,
        apiType: OPT_TRANS_GEMINI,
        url: GEMINI_INTERACTIONS_URL,
        model: "gemini-3.6-flash",
        thinkingMode: "disabled",
        thinkingEffort: "minimal",
      })
    );

    await act(async () => {
      Simulate.change(getInput(view.container, "thinkingMode"), {
        target: { name: "thinkingMode", value: "enabled" },
      });
    });
    expect(getInput(view.container, "thinkingEffort").value).toBe("medium");

    await act(async () => {
      Simulate.click(
        Array.from(view.container.querySelectorAll("button")).find(
          (button) => button.textContent === "click_test"
        )
      );
      await Promise.resolve();
    });
    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSetting: expect.objectContaining({
          thinkingMode: "enabled",
          thinkingEffort: "medium",
        }),
      })
    );

    view.unmount();
  });
});

describe("Apis unknown model thinking warning", () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  test.each(["enabled", "disabled"])(
    "shows an error for unknown models in %s mode",
    async (thinkingMode) => {
      const view = await renderApis(
        createApi({ model: "unknown-model", thinkingMode })
      );
      const modeInput = getInput(view.container, "thinkingMode");

      expect(modeInput.getAttribute("aria-invalid")).toBe("true");
      expect(view.container.textContent).toContain(
        "thinking_unknown_model_helper"
      );
      expect(
        view.container.querySelector('input[name="thinkingEffort"]')
      ).toBeNull();

      view.unmount();
    }
  );

  test.each([
    ["enabled", "high"],
    ["disabled", "none"],
  ])(
    "treats persisted OpenRouter %s/%s settings as resolved",
    async (thinkingMode, thinkingEffort) => {
      apiTranslate.mockResolvedValue({ trText: "你好" });
      const view = await renderApis(
        createApi({
          apiSlug: OPT_TRANS_OPENROUTER,
          apiType: OPT_TRANS_OPENROUTER,
          model: "provider/reasoning-model",
          modelListUrl: "https://openrouter.ai/api/v1/models",
          thinkingMode,
          thinkingEffort,
        })
      );

      expect(
        getInput(view.container, "thinkingMode").getAttribute("aria-invalid")
      ).toBe("false");
      expect(view.container.textContent).not.toContain(
        "thinking_unknown_model_helper"
      );
      expect(
        view.container.querySelector('input[name="thinkingEffort"]')
      ).toBeNull();

      const testButton = Array.from(
        view.container.querySelectorAll("button")
      ).find((button) => button.textContent === "click_test");
      await act(async () => {
        Simulate.click(testButton);
        await Promise.resolve();
      });
      expect(apiTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          apiSetting: expect.objectContaining({
            thinkingMode,
            thinkingEffort,
          }),
        })
      );

      view.unmount();
    }
  );

  test("keeps unresolved OpenRouter defaults in the unknown state", async () => {
    const view = await renderApis(
      createApi({
        apiSlug: OPT_TRANS_OPENROUTER,
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/unknown-model",
        modelListUrl: "https://openrouter.ai/api/v1/models",
        thinkingMode: "enabled",
        thinkingEffort: "_default",
      })
    );

    expect(
      getInput(view.container, "thinkingMode").getAttribute("aria-invalid")
    ).toBe("true");
    expect(view.container.textContent).toContain(
      "thinking_unknown_model_helper"
    );

    view.unmount();
  });

  test("keeps API default mode free of the unknown-model error", async () => {
    const view = await renderApis(
      createApi({ model: "unknown-model", thinkingMode: "auto" })
    );

    expect(
      getInput(view.container, "thinkingMode").getAttribute("aria-invalid")
    ).toBe("false");
    expect(view.container.textContent).not.toContain(
      "thinking_unknown_model_helper"
    );

    view.unmount();
  });

  test("uses the current unknown-model selection when clicking test", async () => {
    apiTranslate.mockResolvedValue({ trText: "你好" });
    const view = await renderApis(
      createApi({ model: "unknown-model", thinkingMode: "enabled" })
    );
    const testButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "click_test");

    await act(async () => {
      Simulate.click(testButton);
      await Promise.resolve();
    });

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSetting: expect.objectContaining({
          model: "unknown-model",
          thinkingMode: "enabled",
        }),
        useCache: false,
        usePool: false,
      })
    );

    view.unmount();
  });
});
