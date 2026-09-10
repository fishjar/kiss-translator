import { RuleEditorSession } from "./ruleEditorSession";
import { selectorCandidates } from "./ruleEditorDom";
import { resolveRuleContext } from "./rules";
import { saveSiteRule } from "./ruleEditorStorage";
import { DEFAULT_RULE, GLOBLA_RULE } from "../config";
import { getRulesWithDefault } from "./storage";

jest.mock("./storage", () => ({ getRulesWithDefault: jest.fn() }));
jest.mock("./subRules", () => ({ loadOrFetchSubRules: jest.fn() }));
jest.mock("./sync", () => ({ trySyncRules: jest.fn() }));

jest.mock("./rules", () => ({
  hostnamePattern: (href) => `hostname:${new URL(href).hostname}`,
  resolveRuleContext: jest.fn(),
  findMatchingRule: (rules) =>
    rules.find((rule) => rule.pattern !== "*") || null,
  matchesRulePattern: jest.requireActual("./rules").matchesRulePattern,
}));
jest.mock("./ruleEditorStorage", () => ({ saveSiteRule: jest.fn() }));
jest.mock("./ruleEditorDom", () => ({
  ...jest.requireActual("./ruleEditorDom"),
  RuleHighlights: class {
    show = jest.fn();
    destroy = jest.fn();
  },
}));

let session, translator, context;
beforeEach(async () => {
  jest.useFakeTimers();
  document.body.innerHTML =
    '<main><a href="/away" class="story">Article one</a><p class="story">Article two</p></main>';
  context = {
    effective: { ...GLOBLA_RULE, selector: ".story", autoScan: "false" },
    inherited: { ...GLOBLA_RULE },
    personal: null,
    site: null,
    global: { ...GLOBLA_RULE },
    subscription: null,
  };
  resolveRuleContext.mockResolvedValue(context);
  translator = {
    setting: {},
    beginRuleEditing: jest.fn(() => ({ enabled: false })),
    endRuleEditing: jest.fn(),
    setRuleEditingPreview: jest.fn(),
    updateRule: jest.fn(),
    previewRule: () => ({
      targets: Array.from(document.querySelectorAll(".story")),
    }),
    ruleRangeContext: () => ({
      roots: [document.body],
      ignoreSelector: ".excluded",
    }),
  };
  saveSiteRule.mockImplementation(async ({ patch }) => {
    context = {
      ...context,
      effective: { ...context.effective, ...patch },
      site: {
        ...DEFAULT_RULE,
        pattern: "hostname:localhost",
        ...context.site,
        ...patch,
      },
    };
    return context;
  });
  session = new RuleEditorSession({ translator, onExit: jest.fn() });
  await session.start();
});
afterEach(() => {
  session.dispose();
  jest.useRealTimers();
  jest.clearAllMocks();
});

test.each([
  null,
  { ...DEFAULT_RULE, pattern: "hostname:localhost", autoScan: "true" },
])(
  "opening switches inherited or saved automatic mode to selected targets: %p",
  async (site) => {
    session.dispose();
    context = {
      ...context,
      effective: { ...context.effective, autoScan: "true" },
      personal: site,
      site,
    };
    resolveRuleContext.mockResolvedValue(context);
    session = new RuleEditorSession({ translator, onExit: jest.fn() });

    await session.start();

    expect(session.state.field).toBe("selector");
    expect(session.state.context.effective.autoScan).toBe("false");
    expect(saveSiteRule).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { autoScan: "false" } })
    );
    expect(translator.updateRule).toHaveBeenLastCalledWith(
      expect.objectContaining({ autoScan: "false" })
    );
    expect(session.undoStack).toHaveLength(1);
  }
);

test("opens on translation targets and saves a new entry to that group", async () => {
  expect(session.state.field).toBe("selector");
  expect(saveSiteRule).not.toHaveBeenCalled();
  session.add();
  session.setInput("main > p");
  await session.commitInput();
  expect(saveSiteRule).toHaveBeenCalledWith(
    expect.objectContaining({ patch: { selector: ".story, main > p" } })
  );
});

test("picking cancels link clicks, locks an element and highlights every candidate match", () => {
  const link = document.querySelector("a");
  const pageHandler = jest.fn();
  link.addEventListener("click", pageHandler);
  session.pick();
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  expect(link.dispatchEvent(click)).toBe(false);
  expect(click.defaultPrevented).toBe(true);
  expect(pageHandler).not.toHaveBeenCalled();
  expect(session.state.selected).toBe(link);
  expect(session.state.ancestors).toContain(document.querySelector("main"));
  session.setInput(".story");
  session.refresh();
  expect(session.state.matches).toHaveLength(2);
  expect(session.highlights.show).toHaveBeenLastCalledWith(
    expect.arrayContaining([{ element: link, excluded: false }]),
    null
  );
});

test("candidates include the selected element and never copy text, links or input values", () => {
  const link = document.querySelector("a");
  link.id = "title:with,comma";
  link.href = "https://example.com/?private=do-not-copy";
  const candidates = selectorCandidates(link);
  expect(candidates.length).toBeGreaterThan(2);
  for (const candidate of candidates) {
    expect(Array.from(document.querySelectorAll(candidate.selector))).toContain(
      link
    );
    expect(candidate.selector).not.toMatch(/do-not-copy|Article one|private/);
  }
});

test("candidates stay ordered by match count after the page changes", async () => {
  session.selectElement(document.querySelector("a"));
  const expectSorted = () => {
    const counts = session.state.candidates.map(({ count }) => count);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  };
  expectSorted();
  document
    .querySelector("main")
    .insertAdjacentHTML(
      "beforeend",
      '<a class="story">Third</a><a class="story">Fourth</a>'
    );
  await Promise.resolve();
  jest.advanceTimersByTime(220);
  expectSorted();
  expect(
    session.state.candidates.find(({ kind }) => kind === "class").count
  ).toBe(4);
});

test("count ordering does not automatically recommend a fragile position selector", () => {
  document
    .querySelector("main")
    .insertAdjacentHTML("beforeend", '<a class="story">Another link</a>');
  session.selectElement(document.querySelector("a"));
  expect(session.state.candidates[0]).toMatchObject({
    count: 1,
    fragile: true,
  });
  expect(
    session.state.candidates.find(
      ({ selector }) => selector === session.state.input
    ).fragile
  ).toBe(false);
});

test("closing the inspector cancels its draft without exiting or saving", () => {
  session.edit(".story");
  session.selectElement(document.querySelector("a"));
  session.setInput(".draft");
  session.closeInspector();
  expect(session.state).toMatchObject({
    inspectorOpen: false,
    input: "",
    editing: null,
    selected: null,
    candidates: [],
    picking: false,
  });
  expect(session.onExit).not.toHaveBeenCalled();
  expect(saveSiteRule).not.toHaveBeenCalled();
  session.add();
  expect(session.state.inspectorOpen).toBe(true);
  session.setField("selector");
  expect(session.state.inspectorOpen).toBe(false);
});

test("Escape cancels picking, then closes the inspector, then exits", () => {
  const escape = () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  session.selectElement(document.querySelector("a"));
  session.pick();
  escape();
  expect(session.state.picking).toBe(false);
  expect(session.state.inspectorOpen).toBe(true);
  escape();
  expect(session.state.inspectorOpen).toBe(false);
  expect(session.onExit).not.toHaveBeenCalled();
  escape();
  expect(session.onExit).toHaveBeenCalledTimes(1);
});

test("saving keeps the inspector open on failure and closes it on success", async () => {
  session.setField("selector");
  session.edit(".story");
  session.setInput("main > p");
  saveSiteRule.mockRejectedValueOnce(new Error("save-failed"));
  await session.commitInput();
  expect(session.state).toMatchObject({
    inspectorOpen: true,
    input: "main > p",
    editing: ".story",
  });
  await session.commitInput();
  expect(context.effective.selector).toBe("main > p");
  expect(session.state.inspectorOpen).toBe(false);
});

test("Escape in a shadow-tree menu does not close the editor or inspector", () => {
  const host = document.createElement("div");
  host.id = "kiss-rule-editor";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    '<ul role="listbox"><li role="option" tabindex="0">Option</li></ul>';
  session.add();
  shadow.querySelector("li").dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      composed: true,
    })
  );
  expect(session.state.inspectorOpen).toBe(true);
  expect(session.onExit).not.toHaveBeenCalled();
  host.remove();
});

test("dynamic content updates counts and removed selections are released", async () => {
  session.selectElement(document.querySelector("a"));
  session.setInput(".story");
  document
    .querySelector("main")
    .insertAdjacentHTML("beforeend", '<p class="story">Third article</p>');
  await Promise.resolve();
  jest.advanceTimersByTime(220);
  expect(session.state.matches).toHaveLength(3);
  session.state.selected.remove();
  await Promise.resolve();
  jest.advanceTimersByTime(220);
  expect(session.state.selected).toBeNull();
  expect(session.state.notice).toBe("element-removed");
});

test("failed writes preserve input; undo and redo persist actual field changes", async () => {
  session.setField("selector");
  session.setInput("main > p");
  saveSiteRule.mockRejectedValueOnce(new Error("rule-conflict"));
  await session.commitInput();
  expect(session.state.input).toBe("main > p");
  expect(session.state.error).toBe("rule-conflict");
  expect(session.undoStack).toHaveLength(0);
  await session.commitInput();
  expect(session.undoStack).toHaveLength(1);
  expect(context.effective.selector).toBe(".story, main > p");
  await session.history();
  expect(saveSiteRule).toHaveBeenLastCalledWith(
    expect.objectContaining({ patch: { selector: "" } })
  );
  await session.history(true);
  expect(context.effective.selector).toBe(".story, main > p");
});

test("selecting candidates and previewing do not persist anything", () => {
  session.selectElement(document.querySelector("a"));
  session.setInput(".story");
  session.refresh();
  session.showWhole();
  expect(saveSiteRule).not.toHaveBeenCalled();
  expect(translator.setRuleEditingPreview).not.toHaveBeenCalledWith(true);
});

test("external changes are reported without discarding the draft", async () => {
  session.setInput(".my-draft");
  getRulesWithDefault.mockResolvedValue([
    { pattern: "hostname:localhost", selector: ".external" },
  ]);
  await session.checkExternalChanges();
  expect(session.state.error).toBe("rule-conflict");
  expect(session.state.input).toBe(".my-draft");
});

test("removal distinguishes overlapping coverage from an empty scope", async () => {
  session.setField("selector");
  await session.remove(".story");
  expect(session.state.notice).toBe("removed-coverage");
  translator.previewRule = () => ({ targets: [] });
  await session.save({ selector: ".story" });
  await session.remove(".story");
  expect(session.state.notice).toBe("removed");
});

test("session cleanup removes page click interception and restores runtime state", () => {
  session.pick();
  session.dispose();
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  expect(document.querySelector("a").dispatchEvent(event)).toBe(true);
  expect(translator.endRuleEditing).toHaveBeenCalledWith(
    { enabled: false },
    true
  );
});

const arrow = (key, target = window, options = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
};

test("arrow keys browse from the first page match and highlight the active element", () => {
  const matches = [...document.querySelectorAll(".story")];
  matches.forEach((element) => {
    element.scrollIntoView = jest.fn();
  });
  session.selectElement(matches[1]);
  session.setInput(".story");
  expect(arrow("ArrowRight").defaultPrevented).toBe(true);
  expect(matches[0].scrollIntoView).toHaveBeenCalledWith({
    block: "center",
    behavior: "smooth",
  });
  expect(session.state.matchIndex).toBe(1);
  expect(session.highlights.show).toHaveBeenLastCalledWith(
    expect.any(Array),
    matches[0]
  );
  arrow("ArrowRight");
  expect(session.state.matchIndex).toBe(2);
  session.refresh();
  expect(session.highlights.show).toHaveBeenLastCalledWith(
    expect.any(Array),
    matches[1]
  );
  arrow("ArrowRight");
  expect(session.state.matchIndex).toBe(1);
  arrow("ArrowLeft");
  expect(session.state.matchIndex).toBe(2);
  session.setInput("a");
  arrow("ArrowRight");
  expect(session.state.matchIndex).toBe(1);
  expect(session.highlights.show).toHaveBeenLastCalledWith(
    expect.any(Array),
    matches[0]
  );
  expect(saveSiteRule).not.toHaveBeenCalled();
});

test("navigation handles removed matches and an invalid or empty selector", () => {
  const matches = [...document.querySelectorAll(".story")];
  matches.forEach((element) => {
    element.scrollIntoView = jest.fn();
  });
  session.selectElement(matches[0]);
  session.setInput(".story");
  arrow("ArrowLeft");
  expect(session.state.matchIndex).toBe(2);
  matches[1].remove();
  arrow("ArrowRight");
  expect(session.state.matchIndex).toBe(1);
  expect(session.highlights.show).toHaveBeenLastCalledWith(
    expect.any(Array),
    matches[0]
  );
  for (const selector of ["[", ".missing", ""]) {
    session.setInput(selector);
    expect(arrow("ArrowRight").defaultPrevented).toBe(false);
    expect(session.state.matchIndex).toBe(0);
  }
});

test("navigation leaves text inputs, menus and panel movement alone in shadow DOM", () => {
  session.add();
  session.setInput(".story");
  const host = document.createElement("div");
  host.id = "kiss-rule-editor";
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    '<input><textarea></textarea><select></select><div contenteditable="true"><span>Text</span></div><div role="combobox"></div><ul role="listbox"><li>Option</li></ul><button data-rule-editor-move><span>Move</span></button>';
  const navigate = jest.spyOn(session, "navigate");
  for (const node of shadow.querySelectorAll(
    "input, textarea, select, span, [role=combobox], li"
  )) {
    expect(arrow("ArrowRight", node).defaultPrevented).toBe(false);
  }
  arrow("ArrowLeft", window, { altKey: true });
  expect(navigate).not.toHaveBeenCalled();
  host.remove();
});

test("arrow navigation is inactive while picking, previewing or outside the inspector", () => {
  const navigate = jest.spyOn(session, "navigate");
  arrow("ArrowRight");
  session.add();
  session.pick();
  arrow("ArrowRight");
  session.cancelPick();
  session.showTranslation(true);
  arrow("ArrowRight");
  expect(navigate).not.toHaveBeenCalled();
});

test("right-click cancels picking and suppresses the page context menu", () => {
  const link = document.querySelector("a");
  const pageMenu = jest.fn();
  link.addEventListener("contextmenu", pageMenu);
  session.selectElement(link);
  session.pick();
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
  });
  expect(link.dispatchEvent(event)).toBe(false);
  expect(pageMenu).not.toHaveBeenCalled();
  expect(session.state.picking).toBe(false);
  expect(session.state.inspectorOpen).toBe(true);
  expect(session.state.selected).toBe(link);
  expect(session.onExit).not.toHaveBeenCalled();
  expect(
    link.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    )
  ).toBe(true);
});

test("pattern defaults to hostname and can be renamed, undone and redone", async () => {
  expect(session.state.pattern).toBe("hostname:localhost");
  session.setPattern(" https://localhost/article/* ");
  await session.commitPattern();
  expect(session.state.pattern).toBe("https://localhost/article/*");
  expect(session.state.context.site.pattern).toBe(session.state.pattern);
  await session.save({ selector: "main p" });
  expect(saveSiteRule).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expected: expect.objectContaining({
        pattern: "https://localhost/article/*",
      }),
    })
  );
  await session.history();
  await session.history();
  expect(session.state.pattern).toBe("hostname:localhost");
  await session.history(true);
  expect(session.state.pattern).toBe("https://localhost/article/*");
  resolveRuleContext.mockResolvedValue(context);
  await session.load();
  expect(resolveRuleContext).toHaveBeenLastCalledWith(
    session.href,
    translator.setting,
    "https://localhost/article/*"
  );
});

test("invalid and duplicate patterns preserve the draft without overwriting rules", async () => {
  for (const pattern of [" ", "*"]) {
    session.setPattern(pattern);
    await session.commitPattern();
    expect(session.state.patternError).toBe("invalid-pattern");
  }
  expect(saveSiteRule).not.toHaveBeenCalled();
  saveSiteRule.mockRejectedValueOnce(new Error("duplicate-pattern"));
  session.setPattern("localhost");
  await session.commitPattern();
  expect(session.state.pattern).toBe("localhost");
  expect(session.state.patternError).toBe("duplicate-pattern");
  expect(session.undoStack).toHaveLength(0);
});

test("external changes to a renamed rule are detected even outside its URL scope", async () => {
  session.setPattern("https://localhost/another-page/*");
  await session.commitPattern();
  getRulesWithDefault.mockResolvedValue([context.site]);
  await session.checkExternalChanges();
  expect(session.state.error).toBe("");
  getRulesWithDefault.mockResolvedValue([
    { ...context.site, selector: ".external" },
  ]);
  await session.checkExternalChanges();
  expect(session.state.error).toBe("rule-conflict");
});

test("pattern save conflicts use the reloadable error while retaining the input", async () => {
  session.setPattern("localhost");
  saveSiteRule.mockRejectedValueOnce(new Error("rule-conflict"));
  await session.commitPattern();
  expect(session.state.error).toBe("rule-conflict");
  expect(session.state.pattern).toBe("localhost");
  expect(session.state.patternError).toBe("");
});

test("exiting restores the actual page rule when the edited pattern no longer matches", () => {
  context.pageEffective = { ...GLOBLA_RULE, selector: ".actual-page" };
  session.showTranslation(true);
  session.dispose();
  expect(translator.setRuleEditingPreview).toHaveBeenLastCalledWith(false);
  expect(translator.updateRule).toHaveBeenLastCalledWith({
    ...context.pageEffective,
    transOpen: "false",
  });
  expect(translator.endRuleEditing).toHaveBeenLastCalledWith(
    { enabled: false },
    true
  );
  expect(translator.updateRule.mock.invocationCallOrder.at(-1)).toBeLessThan(
    translator.endRuleEditing.mock.invocationCallOrder.at(-1)
  );
});
