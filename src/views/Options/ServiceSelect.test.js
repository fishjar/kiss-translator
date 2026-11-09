import { act } from "react";
import { createRoot } from "react-dom/client";
import ServiceSelect from "./ServiceSelect";
import ScenePromptSelect from "./ScenePromptSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../components/ExtensionLocalServiceNotice", () => ({
  __esModule: true,
  default: ({ apis }) =>
    require("react").createElement(
      "div",
      { "data-testid": "model-notice" },
      apis.map((api) => api.apiSlug).join(",")
    ),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({
    prompts: [
      { slug: "p1", name: "Custom Prompt 1", category: "user prompt" },
      { slug: "p2", name: "Batch Prompt 2", category: "batch system prompt" },
    ],
  }),
}));

describe("ServiceSelect", () => {
  test("renders with fullWidth and visible label when fullWidth is true", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const apis = [
      { apiSlug: "google", apiName: "Google" },
      { apiSlug: "bing", apiName: "Bing" },
    ];
    const scene = { apiSlug: "google", apiSlugs: ["deepl"] };

    act(() => {
      root.render(
        <ServiceSelect
          fullWidth
          scene={scene}
          apis={apis}
          label="翻译服务"
          onChange={jest.fn()}
        />
      );
    });

    const select = container.querySelector(".kt-settings-select");
    expect(select).not.toBeNull();
    expect(select.classList.contains("kt-settings-select--full")).toBe(true);
    expect(select.classList.contains("kt-settings-select--with-label")).toBe(
      true
    );

    const label = container.querySelector("label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("翻译服务");

    act(() => root.unmount());
    container.remove();
  });

  test("renders compact and hiddenLabel by default when fullWidth is false", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const apis = [{ apiSlug: "google", apiName: "Google" }];
    const scene = { apiSlug: "google", apiSlugs: ["deepl"] };

    act(() => {
      root.render(
        <ServiceSelect
          scene={scene}
          apis={apis}
          label="翻译服务"
          onChange={jest.fn()}
        />
      );
    });

    const select = container.querySelector(".kt-settings-select");
    expect(select).not.toBeNull();
    expect(select.classList.contains("kt-settings-select--full")).toBe(false);
    expect(select.classList.contains("kt-settings-select--with-label")).toBe(
      false
    );

    const label = container.querySelector("label");
    expect(label).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  test("uses the singular choice even when a leftover list exists", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const apis = [
      { apiSlug: "google", apiName: "Google" },
      { apiSlug: "deepl", apiName: "DeepL" },
    ];
    const scene = { apiSlug: "google", apiSlugs: ["deepl"] };
    const handleChange = jest.fn();

    act(() => {
      root.render(
        <ServiceSelect
          multiple={false}
          scene={scene}
          apis={apis}
          label="翻译服务"
          onChange={handleChange}
        />
      );
    });

    const input = container.querySelector(".kt-settings-select input");
    expect(input).not.toBeNull();
    expect(input.value).toBe("google");

    act(() => root.unmount());
    container.remove();
  });
});

describe("ScenePromptSelect", () => {
  test("renders with fullWidth and visible label when fullWidth is true", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenePromptSelect
          fullWidth
          label="翻译提示词"
          value="p1"
          onChange={jest.fn()}
        />
      );
    });

    const select = container.querySelector(".kt-settings-select");
    expect(select).not.toBeNull();
    expect(select.classList.contains("kt-settings-select--full")).toBe(true);
    expect(select.classList.contains("kt-settings-select--with-label")).toBe(
      true
    );

    const label = container.querySelector("label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("翻译提示词");

    act(() => root.unmount());
    container.remove();
  });

  test("renders compact and hiddenLabel by default when fullWidth is false", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenePromptSelect label="翻译提示词" value="p1" onChange={jest.fn()} />
      );
    });

    const select = container.querySelector(".kt-settings-select");
    expect(select).not.toBeNull();
    expect(select.classList.contains("kt-settings-select--full")).toBe(false);
    expect(select.classList.contains("kt-settings-select--with-label")).toBe(
      false
    );

    const label = container.querySelector("label");
    expect(label).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

test("model notice follows single or multiple selection and can be hidden", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    scene: { apiSlug: "first", apiSlugs: ["second", "third"] },
    apis: ["first", "second", "third"].map((apiSlug) => ({
      apiSlug,
      apiName: apiSlug,
    })),
    onChange: jest.fn(),
  };
  act(() => root.render(<ServiceSelect {...props} />));
  expect(
    container.querySelector('[data-testid="model-notice"]').textContent
  ).toBe("first");
  act(() => root.render(<ServiceSelect {...props} multiple />));
  expect(
    container.querySelector('[data-testid="model-notice"]').textContent
  ).toBe("second,third");
  act(() =>
    root.render(<ServiceSelect {...props} multiple showModelNotice={false} />)
  );
  expect(container.querySelector('[data-testid="model-notice"]')).toBeNull();
  act(() => root.unmount());
  container.remove();
});
