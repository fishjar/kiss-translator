import { act } from "react";
import { createRoot } from "react-dom/client";
import Apis from "./Apis";

const mockUpdateSetting = jest.fn();
const mockSaveRules = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();
const mockConfirm = jest.fn();
const mockAddApi = jest.fn();
const mockUseApiList = jest.fn();
const mockUseSetting = jest.fn();
const mockUseRules = jest.fn();

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n:
    () =>
    (key, fallback = "") =>
      ({
        default_translate_service: "Default service",
        default_translate_service_help:
          "Changing this does not overwrite current entries automatically.",
        apply_default_service_to_entries:
          "Apply to current translation entries",
        default_translate_service_applied:
          "Default service applied to current translation entries",
        default_translate_service_invalid: "Selected service is unavailable.",
        default_translate_service_new_api_title: "Set as default service?",
        default_translate_service_new_api_intro: "New API created:",
        default_translate_service_new_api_note:
          "This only changes the default service and does not overwrite current translation entries.",
        set_as_default_service: "Set as default service",
        default_translate_service_set_to_new_api:
          "New API set as default service",
        add: "Add",
        cancel: "Cancel",
      })[key] ||
      fallback ||
      key,
}));

jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({
    success: mockSuccess,
    error: mockError,
  }),
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => mockUseSetting(),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => mockConfirm,
}));

jest.mock("../../hooks/Rules", () => ({
  useRules: () => mockUseRules(),
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: () => mockUseApiList(),
  useApiItem: () => ({
    api: null,
    update: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock("../../apis", () => ({
  apiTranslate: jest.fn(),
}));

function renderUI() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Apis />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("Apis default service controls", () => {
  beforeEach(() => {
    mockUpdateSetting.mockReset();
    mockSaveRules.mockReset();
    mockSuccess.mockReset();
    mockError.mockReset();
    mockConfirm.mockReset();
    mockAddApi.mockReset();
    mockUseSetting.mockReturnValue({
      setting: {
        defaultApiSlug: "Microsoft",
      },
      updateSetting: mockUpdateSetting,
    });
    mockUseRules.mockReturnValue({
      list: [{ pattern: "*", apiSlug: "Microsoft" }],
      save: mockSaveRules,
    });
    mockUseApiList.mockReturnValue({
      enabledApis: [
        { apiSlug: "Microsoft", apiName: "Microsoft" },
        { apiSlug: "OpenAI", apiName: "OpenAI" },
      ],
      userApis: [],
      builtinApis: [],
      addApi: mockAddApi,
      deleteApi: jest.fn(),
      copyApi: jest.fn(),
    });
  });

  test("changing the default service only updates defaultApiSlug", () => {
    const { container, unmount } = renderUI();
    const select = container.querySelector('select[name="defaultApiSlug"]');

    expect(select).toBeTruthy();

    act(() => {
      select.value = "OpenAI";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(mockUpdateSetting).toHaveBeenCalledWith({
      defaultApiSlug: "OpenAI",
    });

    unmount();
  });

  test("apply button syncs the selected api into entry settings and rules", () => {
    mockUseSetting.mockReturnValue({
      setting: {
        defaultApiSlug: "OpenAI",
      },
      updateSetting: mockUpdateSetting,
    });

    const { container, unmount } = renderUI();
    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent === "Apply to current translation entries"
    );

    expect(button).toBeTruthy();

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockUpdateSetting).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSaveRules).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSuccess).toHaveBeenCalledWith(
      "Default service applied to current translation entries"
    );

    const settingUpdater = mockUpdateSetting.mock.calls[0][0];
    expect(
      settingUpdater({
        inputRule: { apiSlug: "Microsoft", toLang: "en" },
        tranboxSetting: { apiSlugs: ["Microsoft"], toLang: "zh-CN" },
        subtitleSetting: { apiSlug: "Microsoft", toLang: "zh-CN" },
      })
    ).toMatchObject({
      inputRule: { apiSlug: "OpenAI", toLang: "en" },
      tranboxSetting: { apiSlugs: ["OpenAI"], toLang: "zh-CN" },
      subtitleSetting: { apiSlug: "OpenAI", toLang: "zh-CN" },
    });

    const rulesUpdater = mockSaveRules.mock.calls[0][0];
    expect(rulesUpdater([{ pattern: "*", apiSlug: "Microsoft" }])[0]).toEqual(
      expect.objectContaining({ pattern: "*", apiSlug: "OpenAI" })
    );

    unmount();
  });

  test("asks whether to set a newly added api as the default service", async () => {
    mockAddApi.mockReturnValue({
      apiSlug: "OpenAI_custom_1",
      apiName: "OpenAI_custom_1",
      apiType: "OpenAI",
    });
    mockConfirm.mockResolvedValue(true);

    const { container, unmount } = renderUI();
    const addButton = container.querySelector("#add-api-button");

    expect(addButton).toBeTruthy();

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const openAiMenuItem = Array.from(
      document.querySelectorAll('[role="menuitem"]')
    ).find((item) => item.textContent === "OpenAI");

    expect(openAiMenuItem).toBeTruthy();

    await act(async () => {
      openAiMenuItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockAddApi).toHaveBeenCalledWith("OpenAI");
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Set as default service?",
        confirmText: "Set as default service",
        cancelText: "Cancel",
      })
    );
    expect(mockUpdateSetting).toHaveBeenCalledWith({
      defaultApiSlug: "OpenAI_custom_1",
    });
    expect(mockSuccess).toHaveBeenCalledWith("New API set as default service");

    unmount();
  });

  test("keeps the current default service when the prompt is dismissed", async () => {
    mockAddApi.mockReturnValue({
      apiSlug: "OpenAI_custom_2",
      apiName: "OpenAI_custom_2",
      apiType: "OpenAI",
    });
    mockConfirm.mockResolvedValue(false);

    const { container, unmount } = renderUI();
    const addButton = container.querySelector("#add-api-button");

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const openAiMenuItem = Array.from(
      document.querySelectorAll('[role="menuitem"]')
    ).find((item) => item.textContent === "OpenAI");

    await act(async () => {
      openAiMenuItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockAddApi).toHaveBeenCalledWith("OpenAI");
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockUpdateSetting).not.toHaveBeenCalledWith({
      defaultApiSlug: "OpenAI_custom_2",
    });
    expect(mockSuccess).not.toHaveBeenCalledWith(
      "New API set as default service"
    );

    unmount();
  });
});
