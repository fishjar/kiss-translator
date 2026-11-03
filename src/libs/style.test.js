describe("translation stylesheet recovery", () => {
  let genTextClass;
  let builtinStylesMap;
  let emotion;
  let config;
  let originalHead;

  const customStyles = [
    {
      styleSlug: "custom-probe",
      styleCode: "color: red; &:hover { color: blue; }",
    },
  ];
  const tagsFor = (classes) => {
    const className = classes[config.OPT_STYLE_LINE];
    const key = className.slice(0, className.lastIndexOf("-"));
    return [...document.head.querySelectorAll(`style[data-emotion="${key}"]`)];
  };
  const rulesFor = (classes) =>
    tagsFor(classes).flatMap((tag) =>
      [...tag.sheet.cssRules].map((rule) => rule.cssText)
    );

  beforeEach(() => {
    jest.resetModules();
    originalHead = document.head;
    document.head.replaceWith(document.createElement("head"));
    emotion = require("@emotion/css");
    config = require("../config");
    ({ genTextClass, builtinStylesMap } = require("./style"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.head.replaceWith(originalHead);
  });

  test("uses the dedicated instance's animation names initially and after recovery", () => {
    const createInstance = require("@emotion/css/create-instance");
    const createEmotion = createInstance.default;
    const registeredNames = [];
    let generation = 0;
    jest.spyOn(createInstance, "default").mockImplementation((options) => {
      const instance = createEmotion(options);
      const keyframes = instance.keyframes;
      const currentGeneration = ++generation;
      // Keep real Emotion registration, but make each instance's names differ.
      instance.keyframes = (strings) => {
        const name = keyframes(
          `/* instance ${currentGeneration} */ ${strings.join("")}`
        );
        registeredNames.push(name);
        return name;
      };
      return instance;
    });

    const previewStyles = { ...builtinStylesMap };
    const slugs = [
      config.OPT_STYLE_GRADIENT,
      config.OPT_STYLE_BLINK,
      config.OPT_STYLE_GLOW,
    ];
    for (let i = 0; i < 2; i++) {
      const [classes, textStyles] = genTextClass();
      const names = registeredNames.slice(i * 3, i * 3 + 3);
      expect(names).toHaveLength(3);
      const rules = rulesFor(classes).join("\n");
      slugs.forEach((slug, index) => {
        const previewName = previewStyles[slug].match(/animation:\s*(\S+)/)[1];
        expect(names[index]).not.toBe(previewName);
        expect(textStyles).toContain(`animation: ${names[index]} `);
        expect(rules).toContain(`@keyframes ${names[index]}`);
        const animationRule = rulesFor(classes).find((rule) =>
          rule.startsWith(`.${classes[slug]} {`)
        );
        expect(animationRule).toContain(names[index]);
      });
      expect(builtinStylesMap).toEqual(previewStyles);
      tagsFor(classes).forEach((tag) => tag.remove());
    }
    expect(registeredNames).toHaveLength(6);
    expect(registeredNames.slice(0, 3)).not.toEqual(registeredNames.slice(3));
  });

  test("restores the same classes and complete rules after styles are removed", () => {
    const before = genTextClass(customStyles);
    const rules = rulesFor(before[0]);
    expect(rules.join("\n")).toContain("text-decoration-line: underline");
    expect(rules.join("\n")).toContain(`.${before[0]["custom-probe"]}:hover`);
    expect(rules.join("\n")).toContain("color: blue");
    tagsFor(before[0]).forEach((tag) => tag.remove());

    const after = genTextClass(customStyles);
    expect(after).toEqual(before);
    expect(rulesFor(after[0])).toEqual(rules);
  });

  test("binds restored styles to the current head", () => {
    const before = genTextClass(customStyles);
    const rules = rulesFor(before[0]);
    const oldHead = document.head;
    document.head.replaceWith(document.createElement("head"));

    const after = genTextClass(customStyles);
    expect(after).toEqual(before);
    expect(rulesFor(after[0])).toEqual(rules);
    expect(oldHead.querySelector('style[data-emotion="kiss-text"]')).toBeNull();
  });

  test("restores every builtin animation keyframe", () => {
    const [classes] = genTextClass();
    tagsFor(classes).forEach((tag) => tag.remove());
    genTextClass();

    const rules = rulesFor(classes).join("\n");
    for (const slug of [
      config.OPT_STYLE_GRADIENT,
      config.OPT_STYLE_BLINK,
      config.OPT_STYLE_GLOW,
    ]) {
      const animation = builtinStylesMap[slug].match(/animation:\s*(\S+)/)[1];
      expect(rules).toContain(`@keyframes ${animation}`);
      expect(rules).toContain(`.${classes[slug]}`);
    }
  });

  test("does not remove or invalidate default Emotion styles", () => {
    emotion.css`color: green;`;
    const defaultTags = [
      ...document.head.querySelectorAll('style[data-emotion="css"]'),
    ];
    const defaultRules = defaultTags.map((tag) =>
      [...tag.sheet.cssRules].map((r) => r.cssText)
    );
    const [classes] = genTextClass(customStyles);
    tagsFor(classes).forEach((tag) => tag.remove());
    genTextClass(customStyles);

    expect(defaultTags.every((tag) => tag.isConnected)).toBe(true);
    expect(
      defaultTags.map((tag) => [...tag.sheet.cssRules].map((r) => r.cssText))
    ).toEqual(defaultRules);
  });

  test("reuses connected styles without adding rules or tags", () => {
    const before = genTextClass(customStyles);
    const tags = tagsFor(before[0]);
    const rules = rulesFor(before[0]);
    for (let i = 0; i < 10; i++) {
      expect(genTextClass(customStyles)).toEqual(before);
    }
    expect(tagsFor(before[0])).toEqual(tags);
    expect(rulesFor(before[0])).toEqual(rules);
  });

  test("keeps tag and rule counts stable across ten recoveries", () => {
    const before = genTextClass(customStyles);
    const count = tagsFor(before[0]).length;
    const rules = rulesFor(before[0]);
    for (let i = 0; i < 10; i++) {
      // Removing just one tag also exercises cleanup of surviving tags.
      tagsFor(before[0])[0].remove();
      expect(genTextClass(customStyles)).toEqual(before);
      expect(tagsFor(before[0])).toHaveLength(count);
      expect(rulesFor(before[0])).toEqual(rules);
    }
  });

  test("preserves builtin exports and the stylesheet return contract", () => {
    const snapshot = { ...builtinStylesMap };
    const [classes, textStyles] = genTextClass();
    expect(Object.keys(classes)).toEqual(Object.keys(builtinStylesMap));
    expect(typeof textStyles).toBe("string");
    for (const [slug, code] of Object.entries(builtinStylesMap)) {
      expect(textStyles).toContain(`.${classes[slug]}`);
      expect(textStyles).toContain(code);
    }
    for (const slug of [
      config.OPT_STYLE_GRADIENT,
      config.OPT_STYLE_BLINK,
      config.OPT_STYLE_GLOW,
    ]) {
      const name = builtinStylesMap[slug].match(/animation:\s*(\S+)/)[1];
      const rules = emotion.sheet.tags
        .flatMap((tag) => [...tag.sheet.cssRules].map((r) => r.cssText))
        .join("\n");
      expect(rules).toContain(`@keyframes ${name}`);
    }
    tagsFor(classes).forEach((tag) => tag.remove());
    genTextClass();
    expect(builtinStylesMap).toEqual(snapshot);
  });
});
