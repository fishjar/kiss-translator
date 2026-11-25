/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import ModelsTab from "./Models";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";

jest.mock("../../../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: {
    request: jest.fn(),
    onServiceState: jest.fn(),
  },
}));
jest.mock("../../../localAi/runtime/rpc", () => ({ nextRpcId: () => "test" }));
jest.mock("../../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback ?? key,
}));
jest.mock("../../../localAi/core/catalog", () => ({
  OCR_GROUPS: [
    {
      id: "grp",
      name: "Group",
      detId: "det-1",
      recId: "rec-1",
      detName: "Det",
      recName: "Rec",
    },
  ],
  getModelDisplayName: (model) =>
    typeof model === "string"
      ? model
      : (model && (model.name || model.id)) || "",
}));
jest.mock("../../../localAi/core/modelManager", () => ({
  sharedModelManager: {
    subscribe: () => () => {},
    init: async () => {},
    list: () => [
      {
        manifest: {
          id: "m1",
          task: "llm",
          files: [{ path: "a.bin", size: 10 }],
        },
        files: {},
        state: "not-installed",
      },
      {
        manifest: {
          id: "det-1",
          task: "ocr-detection",
          files: [{ path: "d.bin", size: 5 }],
        },
        files: {},
        state: "not-installed",
      },
      {
        manifest: {
          id: "rec-1",
          task: "ocr-recognition",
          files: [{ path: "r.bin", size: 5 }],
        },
        files: {},
        state: "not-installed",
      },
    ],
    storageStats: async () => ({ usage: 0, quota: 0 }),
  },
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sectionToggles = (container) =>
  [...container.querySelectorAll("button[aria-label]")].filter((button) =>
    /local_ai_models_(expand|collapse)_section/.test(
      button.getAttribute("aria-label") || ""
    )
  );

describe("local AI models section toggles", () => {
  let container;
  let root;

  beforeEach(async () => {
    jest.clearAllMocks();
    runtimeHost.request.mockResolvedValue({ mirror: "hf-mirror" });
    runtimeHost.onServiceState.mockImplementation(() => () => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<ModelsTab />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("marks each collapsed section toggle as aria-expanded=false", () => {
    const toggles = sectionToggles(container);
    expect(toggles).toHaveLength(2);
    toggles.forEach((toggle) => {
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.getAttribute("aria-haspopup")).toBe(null);
    });
    expect(container.textContent).not.toContain("a.bin");
  });

  it("flips aria-expanded to true after expanding each section", async () => {
    let toggles = sectionToggles(container);
    expect(toggles).toHaveLength(2);
    await act(async () => {
      Simulate.click(toggles[0]);
    });
    toggles = sectionToggles(container);
    await act(async () => {
      Simulate.click(toggles[1]);
    });
    toggles = sectionToggles(container);
    expect(
      toggles.map((toggle) => toggle.getAttribute("aria-expanded"))
    ).toEqual(["true", "true"]);
    expect(container.textContent).toContain("a.bin");
    expect(container.textContent).toContain("d.bin");
  });
});
