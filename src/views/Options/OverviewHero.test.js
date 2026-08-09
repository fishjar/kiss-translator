import { act } from "react";
import { createRoot } from "react-dom/client";
import OverviewHero from "./OverviewHero";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      transApis: [
        { apiSlug: "BuiltinAI", apiName: "BuiltinAI" },
        { apiSlug: "Microsoft", apiName: "Microsoft" },
      ],
    },
  }),
}));
jest.mock("../../hooks/Rules", () => ({
  useRules: () => ({
    list: [
      {
        pattern: "*",
        apiSlug: "Microsoft",
        fromLang: "auto",
        toLang: "zh-CN",
      },
    ],
  }),
}));
jest.mock("../../hooks/Commands", () => ({
  useOverviewShortcuts: () => ({
    page: ["Ctrl", "Q"],
    popup: ["Ctrl", "K"],
    style: ["Ctrl", "C"],
    selection: ["Ctrl", "S"],
    input: ["Ctrl", "I"],
    settings: ["Ctrl", "O"],
  }),
}));
describe("OverviewHero", () => {
  test("renders the global rule and actual command shortcuts", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => root.render(<OverviewHero />));

    expect(container.textContent).toContain("Microsoft");
    expect(container.textContent).not.toContain("BuiltinAI");
    expect(container.textContent).toContain("translate_service");
    expect(container.textContent).toContain("from_lang");
    expect(container.textContent).toContain("to_lang");
    expect(container.textContent).toContain("Ctrl");

    act(() => root.unmount());
  });

  test("does not render a global enabled state or switch", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => root.render(<OverviewHero />));
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).toContain("options_overview");
    expect(
      container.querySelector(".kt-overview-hero__summary")
    ).not.toBeNull();

    act(() => root.unmount());
  });
});
