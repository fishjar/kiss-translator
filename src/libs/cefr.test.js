describe("cefr helpers", () => {
  const mockDict = {
    apple: { level: "A1", zh: "苹果" },
    community: { level: "B1", zh: "社区" },
    ambiguous: { level: "B2", zh: "模棱两可的" },
    mitigate: { level: "C1", zh: "减轻，缓和" },
  };

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = "";
    global.chrome = {
      runtime: {
        getURL: jest.fn((path) => `chrome-extension://test/${path}`),
      },
    };
    global.fetch = jest.fn(async () => ({
      json: async () => mockDict,
    }));
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
  });

  test("shouldAnnotateOriginalNodes gates on english, completion, enabled state, and visible origin", async () => {
    const { shouldAnnotateOriginalNodes } = await import("./cefr");

    expect(
      shouldAnnotateOriginalNodes({
        sourceLang: "en-US",
        cefrSetting: { enabled: true, assessmentCompleted: true },
        hideOrigin: false,
      })
    ).toBe(true);

    expect(
      shouldAnnotateOriginalNodes({
        sourceLang: "zh-CN",
        cefrSetting: { enabled: true, assessmentCompleted: true },
        hideOrigin: false,
      })
    ).toBe(false);

    expect(
      shouldAnnotateOriginalNodes({
        sourceLang: "en",
        cefrSetting: { enabled: false, assessmentCompleted: true },
        hideOrigin: false,
      })
    ).toBe(false);

    expect(
      shouldAnnotateOriginalNodes({
        sourceLang: "en",
        cefrSetting: { enabled: true, assessmentCompleted: false },
        hideOrigin: false,
      })
    ).toBe(false);

    expect(
      shouldAnnotateOriginalNodes({
        sourceLang: "en",
        cefrSetting: { enabled: true, assessmentCompleted: true },
        hideOrigin: true,
      })
    ).toBe(false);
  });

  test("lazy loads the CEFR dictionary once and exposes word level info", async () => {
    const { getCEFRDict, getWordLevelInfo, CEFR_LEVEL_SCORES } = await import(
      "./cefr"
    );

    const firstDict = await getCEFRDict();
    const secondDict = await getCEFRDict();
    const levelInfo = await getWordLevelInfo("Mitigate");

    expect(firstDict).toBe(secondDict);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(levelInfo).toEqual({
      word: "mitigate",
      level: "C1",
      levelScore: CEFR_LEVEL_SCORES.C1,
      zh: "减轻，缓和",
    });
  });

  test("recognizes english language codes", async () => {
    const { isEnglishLang } = await import("./cefr");

    expect(isEnglishLang("en")).toBe(true);
    expect(isEnglishLang("en-GB")).toBe(true);
    expect(isEnglishLang("zh-CN")).toBe(false);
    expect(isEnglishLang("")).toBe(false);
  });

  test("annotates only words above the user's level with CEFR wrapper and gloss classes", async () => {
    const { annotateNodeGroupWithCEFR } = await import("./cefr");
    const host = document.createElement("div");
    const textNode = document.createTextNode(
      "Community support can mitigate ambiguous wording."
    );
    host.appendChild(textNode);

    await annotateNodeGroupWithCEFR({
      nodes: [textNode],
      sourceLang: "en",
      hideOrigin: false,
      cefrSetting: {
        enabled: true,
        assessmentCompleted: true,
        level: 3,
      },
    });

    expect(host.querySelectorAll(".kiss-cefr-word")).toHaveLength(2);
    expect(host.textContent).toBe(
      "Community support can mitigate减轻，缓和 ambiguous模棱两可的 wording."
    );

    const wrappers = Array.from(host.querySelectorAll(".kiss-cefr-word"));
    expect(wrappers.map((node) => node.getAttribute("data-word"))).toEqual([
      "mitigate",
      "ambiguous",
    ]);
    wrappers.forEach((node) => {
      expect(node.getAttribute("data-kiss-cefr")).toBe("1");
      expect(node.querySelector(".kiss-cefr-gloss")).toBeTruthy();
      expect(node.querySelector("ruby")).toBeNull();
      expect(node.querySelector("rt")).toBeNull();
    });

    const styleTag = document.head.querySelector('style[data-kiss-cefr-style="1"]');
    expect(styleTag).toBeTruthy();
    expect(styleTag.textContent).toContain("position: absolute;");
    expect(styleTag.textContent).toContain(".kiss-cefr-gloss");
  });

  test("skips annotation when original text is hidden", async () => {
    const { annotateNodeGroupWithCEFR } = await import("./cefr");
    const host = document.createElement("div");
    const textNode = document.createTextNode("Mitigate ambiguity carefully.");
    host.appendChild(textNode);

    await annotateNodeGroupWithCEFR({
      nodes: [textNode],
      sourceLang: "en",
      cefrSetting: {
        enabled: true,
        assessmentCompleted: true,
        level: 2,
      },
      hideOrigin: true,
    });

    expect(host.querySelector(".kiss-cefr-word")).toBeNull();
    expect(host.textContent).toBe("Mitigate ambiguity carefully.");
  });

  test("cleanup removes CEFR wrappers and restores plain text", async () => {
    const { annotateNodeGroupWithCEFR, removeCEFRAnnotations } = await import(
      "./cefr"
    );
    const host = document.createElement("div");
    const textNode = document.createTextNode("Mitigate ambiguous outcomes.");
    host.appendChild(textNode);

    await annotateNodeGroupWithCEFR({
      nodes: [textNode],
      sourceLang: "en",
      hideOrigin: false,
      cefrSetting: {
        enabled: true,
        assessmentCompleted: true,
        level: 2,
      },
    });

    expect(host.querySelectorAll(".kiss-cefr-word")).toHaveLength(2);

    removeCEFRAnnotations(host);

    expect(host.querySelector(".kiss-cefr-word")).toBeNull();
    expect(host.querySelector(".kiss-cefr-gloss")).toBeNull();
    expect(host.innerHTML).toBe("Mitigate ambiguous outcomes.");
  });

  test("cleanup does not touch sibling translation wrappers", async () => {
    const { annotateNodeGroupWithCEFR, removeCEFRAnnotations } = await import(
      "./cefr"
    );
    const host = document.createElement("div");
    const textNode = document.createTextNode("Mitigate ambiguity carefully.");
    host.appendChild(textNode);

    const translationWrapper = document.createElement("kiss-translator");
    translationWrapper.className = "kiss-wrapper notranslate";
    translationWrapper.innerHTML =
      '<span class="kiss-inner">Translated sibling stays put.</span>';
    host.appendChild(translationWrapper);

    await annotateNodeGroupWithCEFR({
      nodes: [textNode],
      sourceLang: "en",
      hideOrigin: false,
      cefrSetting: {
        enabled: true,
        assessmentCompleted: true,
        level: 2,
      },
    });

    expect(host.querySelectorAll(".kiss-cefr-word")).toHaveLength(1);
    expect(host.querySelector(".kiss-wrapper .kiss-inner").textContent).toBe(
      "Translated sibling stays put."
    );

    const removed = removeCEFRAnnotations(host);

    expect(removed).toBe(1);
    expect(host.querySelector(".kiss-cefr-word")).toBeNull();
    expect(host.querySelector(".kiss-wrapper")).toBe(translationWrapper);
    expect(host.querySelector(".kiss-wrapper .kiss-inner").textContent).toBe(
      "Translated sibling stays put."
    );
    expect(host.textContent).toContain("Mitigate ambiguity carefully.");
  });
});
