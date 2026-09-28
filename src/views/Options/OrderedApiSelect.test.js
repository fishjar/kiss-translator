import { act } from "react";
import { createRoot } from "react-dom/client";
import OrderedApiSelect from "./OrderedApiSelect";
import ScenePromptSelect from "./ScenePromptSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({
    prompts: [
      { slug: "p1", name: "Custom Prompt 1", category: "translation" },
      { slug: "p2", name: "Batch Prompt 2", category: "batch_system" },
    ],
  }),
}));

describe("OrderedApiSelect", () => {
  test("renders with fullWidth and visible label when fullWidth is true", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const apis = [
      { apiSlug: "google", apiName: "Google" },
      { apiSlug: "bing", apiName: "Bing" },
    ];
    const scene = { apiSlugs: ["google"] };

    act(() => {
      root.render(
        <OrderedApiSelect
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
    const scene = { apiSlugs: ["google"] };

    act(() => {
      root.render(
        <OrderedApiSelect
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

  test("supports multiple=false single select mode and preserves array structure", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const apis = [
      { apiSlug: "google", apiName: "Google" },
      { apiSlug: "deepl", apiName: "DeepL" },
    ];
    const scene = { apiSlugs: ["google"] };
    const handleChange = jest.fn();

    act(() => {
      root.render(
        <OrderedApiSelect
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
