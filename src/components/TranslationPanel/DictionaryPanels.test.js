/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import DictionaryPanels, {
  getDictionaryAvailability,
} from "./DictionaryPanels";
import { PROMPT_CATEGORY_DICTIONARY } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));
jest.mock("../../views/Selection/DictCont", () => {
  const React = require("react");
  return ({ text, source }) =>
    React.createElement("div", {
      "data-testid": "default-dict",
      "data-dict-text": text,
      "data-source-sentence": source?.sentence || "",
    });
});
jest.mock("../../views/Selection/AiDictCont", () => {
  const React = require("react");
  return (props) =>
    React.createElement("div", {
      "data-testid": "ai-dict",
      "data-speech-lang": props.speechLang,
      "data-to-lang": props.toLang,
      "data-tts-service": props.ttsApiSlug,
      "data-request-revision": props.requestRevision,
      "data-context": props.context,
    });
});
jest.mock("../../views/Selection/SugCont", () => {
  const React = require("react");
  return ({ enSug }) =>
    React.createElement("div", { "data-testid": "sug", "data-sug": enSug });
});
jest.mock("../../views/Selection/Zdic", () => {
  const React = require("react");
  return () => React.createElement("div", { "data-testid": "zdic" });
});

const openAiDict = [
  {
    apiSlug: "openai",
    apiName: "OpenAI",
    apiType: "OpenAI",
    dictPrompt: "Dictionary prompt",
  },
];

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("getDictionaryAvailability", () => {
  const probe = (input) => getDictionaryAvailability(input);

  test("offers the default dictionary only for a registered source", () => {
    expect(probe({ text: "apple", enDict: "Bing" }).defaultDictAvailable).toBe(
      true
    );
    expect(probe({ text: "apple", enDict: "-" }).defaultDictAvailable).toBe(
      false
    );
    expect(
      probe({ text: "a sentence", enDict: "Bing" }).defaultDictAvailable
    ).toBe(false);
    expect(probe({ text: "苹", enDict: "-" }).defaultDictAvailable).toBe(true);
  });

  test("drops a stored AI slug that is disabled, unconfigured or not dictionary capable", () => {
    const base = { text: "apple", enDict: "-", aiDictApiSlug: "openai" };
    expect(probe({ ...base, transApis: openAiDict }).aiDictAvailable).toBe(
      true
    );
    expect(
      probe({
        ...base,
        transApis: [{ ...openAiDict[0], isDisabled: true }],
      }).aiDictAvailable
    ).toBe(false);
    expect(
      probe({ ...base, transApis: [{ apiSlug: "openai", apiType: "OpenAI" }] })
        .aiDictAvailable
    ).toBe(false);
    expect(
      probe({ ...base, transApis: [], aiDictApiSlug: "gone" }).aiDictAvailable
    ).toBe(false);
    expect(
      probe({ ...base, transApis: openAiDict, aiDictApiSlug: "-" })
        .aiDictAvailable
    ).toBe(false);
  });

  test("requires a non-blank prompt when following the API and a dictionary prompt when overriding", () => {
    const base = { text: "apple", enDict: "-", aiDictApiSlug: "openai" };
    expect(
      probe({
        ...base,
        transApis: [{ apiSlug: "openai", apiType: "OpenAI", dictPrompt: "  " }],
      }).aiDictAvailable
    ).toBe(false);
    const prompt = {
      slug: "p1",
      category: PROMPT_CATEGORY_DICTIONARY,
      systemPrompt: "system",
      userPrompt: "user",
    };
    expect(
      probe({
        ...base,
        transApis: openAiDict,
        aiDictPromptSlug: "p1",
        prompts: [prompt],
      }).aiDictApiSetting
    ).toMatchObject({ dictPrompt: "system", dictUserPrompt: "user" });
    expect(
      probe({
        ...base,
        transApis: openAiDict,
        aiDictPromptSlug: "p1",
        prompts: [{ ...prompt, category: "other" }],
      }).aiDictAvailable
    ).toBe(false);
  });

  test("needs text before the AI dictionary can run", () => {
    expect(
      getDictionaryAvailability({
        text: "   ",
        enDict: "-",
        transApis: openAiDict,
        aiDictApiSlug: "openai",
      }).aiDictAvailable
    ).toBe(false);
  });

  test.each([undefined, null, "", "   ", 42])(
    "treats the query %p as no dictionary at all",
    (text) => {
      const availability = getDictionaryAvailability({
        text,
        enDict: "Bing",
        transApis: openAiDict,
        aiDictApiSlug: "openai",
      });
      expect(availability.isWord).toBe(false);
      expect(availability.defaultDictAvailable).toBe(false);
      expect(availability.aiDictAvailable).toBe(false);
    }
  );
});

describe("DictionaryPanels rendering", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (props) => {
    act(() => root.render(<DictionaryPanels {...props} />));
    await flushEffects();
  };
  const tabs = () => container.querySelectorAll('[role="tab"]');

  test("renders nothing at all without an available dictionary", async () => {
    await render({
      text: "a sentence",
      enDict: "-",
      enSug: "-",
      aiDictApiSlug: "-",
    });
    expect(container.firstChild).toBeNull();
  });

  test("shows the default dictionary without tabs for a word", async () => {
    await render({
      text: "apple",
      enDict: "Bing",
      enSug: "-",
      aiDictApiSlug: "-",
    });
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(
      container.querySelector('[data-testid="default-dict"]').dataset.dictText
    ).toBe("apple");
  });

  test("shows the Chinese character dictionary for a single ideograph", async () => {
    await render({ text: "苹", enDict: "-", enSug: "-", aiDictApiSlug: "-" });
    expect(container.querySelector('[data-testid="zdic"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="default-dict"]')).toBeNull();
  });

  test("forces the AI tab when only the AI dictionary is available", async () => {
    await render({
      text: "apple",
      enDict: "-",
      enSug: "-",
      transApis: openAiDict,
      aiDictApiSlug: "openai",
    });
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs()[0].textContent).toBe("AI词典");
    expect(container.querySelectorAll('[role="tabpanel"]').length).toBe(1);
  });

  test("labels the tab list with the dictionary role and selects the fast one first", async () => {
    await render({
      text: "apple",
      enDict: "Bing",
      enSug: "-",
      transApis: openAiDict,
      aiDictApiSlug: "openai",
    });
    expect(
      container.querySelector('[role="tablist"]').getAttribute("aria-label")
    ).toBe("Dictionary");
    expect(tabs()).toHaveLength(2);
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector('[data-testid="default-dict"]')
    ).not.toBeNull();
    // useId ids contain colons, so a bare "#id" selector is invalid; match the
    // attribute value instead and confirm it is the default tabpanel.
    const controlsId = tabs()[0].getAttribute("aria-controls");
    const panel = container.querySelector(`[id="${controlsId}"]`);
    expect(panel).not.toBeNull();
    expect(panel.getAttribute("role")).toBe("tabpanel");
  });

  test("forwards speech service, resolved language, revision and guarded context to the AI dictionary", async () => {
    await render({
      text: "apple",
      enDict: "-",
      enSug: "-",
      fromLang: "auto",
      detectedLang: "ja",
      toLang: "zh-CN",
      transApis: openAiDict,
      aiDictApiSlug: "openai",
      requestRevision: 3,
      context: "The apple is red.",
      ttsApiSlug: "azure-tts",
    });
    const ai = container.querySelector('[data-testid="ai-dict"]');
    expect(ai.dataset.speechLang).toBe("ja");
    expect(ai.dataset.toLang).toBe("zh-CN");
    expect(ai.dataset.ttsService).toBe("azure-tts");
    expect(ai.dataset.requestRevision).toBe("3");
    expect(ai.dataset.context).toBe("The apple is red.");
  });

  test("drops a stale context that no longer contains the text", async () => {
    await render({
      text: "pear",
      enDict: "-",
      enSug: "-",
      fromLang: "en",
      transApis: openAiDict,
      aiDictApiSlug: "openai",
      context: "The apple is red.",
    });
    expect(
      container.querySelector('[data-testid="ai-dict"]').dataset.context
    ).toBe("");
  });

  test("hands the selection source to the default dictionary", async () => {
    await render({
      text: "apple",
      enDict: "Bing",
      enSug: "-",
      source: { sentence: "An apple a day.", url: "https://e.com" },
    });
    expect(
      container.querySelector('[data-testid="default-dict"]').dataset
        .sourceSentence
    ).toBe("An apple a day.");
  });

  test("wraps auxiliary blocks per host", async () => {
    await render({
      text: "apple",
      enDict: "Bing",
      enSug: "Youdao",
      aiDictApiSlug: "-",
      isPlayground: true,
    });
    expect(
      container
        .querySelector('[data-testid="default-dict"]')
        .closest(".kt-playground-translator__auxiliary")
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="sug"]')
        .closest(".kt-playground-translator__auxiliary")
    ).not.toBeNull();

    await render({
      text: "apple",
      enDict: "Bing",
      enSug: "Youdao",
      aiDictApiSlug: "-",
      auxiliaryClassName: "kt-popup-text-auxiliary",
    });
    expect(
      container
        .querySelector('[data-testid="default-dict"]')
        .closest(".kt-popup-text-auxiliary")
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="sug"]')
        .closest(".kt-popup-text-auxiliary")
    ).not.toBeNull();

    await render({
      text: "apple",
      enDict: "Bing",
      enSug: "Youdao",
      aiDictApiSlug: "-",
    });
    const bareWrapper = container.querySelector(
      '[data-testid="default-dict"]'
    ).parentElement;
    // A bare host keeps the default dict inside the shared panel's Box (whose
    // auxiliary className is undefined), so that wrapper carries no auxiliary
    // class; only the suggestion block renders directly under the host.
    expect(
      bareWrapper.classList.contains("kt-playground-translator__auxiliary")
    ).toBe(false);
    expect(bareWrapper.classList.contains("kt-popup-text-auxiliary")).toBe(
      false
    );
    expect(container.querySelector('[data-testid="sug"]').parentElement).toBe(
      container
    );
  });
});
