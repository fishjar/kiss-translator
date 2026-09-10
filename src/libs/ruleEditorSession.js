import { DEFAULT_RULE, GLOBLA_RULE } from "../config";
import {
  findMatchingRule,
  hostnamePattern,
  matchesRulePattern,
  resolveRuleContext,
} from "./rules";
import { getRulesWithDefault } from "./storage";
import {
  EMPTY_SELECTOR,
  SELECTOR_FIELDS,
  splitSelectorList,
} from "./selectorList";
import { saveSiteRule } from "./ruleEditorStorage";
import {
  ancestorElements,
  compareCandidates,
  isEditorElement,
  isPageElement,
  queryPage,
  RuleHighlights,
  selectorCandidates,
} from "./ruleEditorDom";

export class RuleEditorSession {
  constructor({ translator, onExit }) {
    this.translator = translator;
    this.onExit = onExit;
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.state = {
      loading: true,
      saving: false,
      field: "selector",
      input: "",
      pattern: "",
      patternError: "",
      error: "",
      notice: "",
      picking: false,
      inspectorOpen: false,
      selected: null,
      ancestors: [],
      candidates: [],
      entries: [],
      matches: [],
      matchIndex: 0,
      excluded: 0,
      hidden: 0,
      whole: false,
      translated: false,
      undo: false,
      redo: false,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  emit(patch = {}) {
    if (this.disposed) return;
    this.state = {
      ...this.state,
      ...patch,
      undo: !!this.undoStack.length,
      redo: !!this.redoStack.length,
    };
    this.listeners.forEach((listener) => listener());
  }
  async start() {
    this.runtimeState = this.translator.beginRuleEditing();
    this.highlights = new RuleHighlights();
    this.href = window.location.href;
    this.handlePointer = (event) => {
      if (this.state.picking && event.type === "contextmenu") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancelPick();
        return;
      }
      if (isEditorElement(event.target)) return;
      if (!this.state.picking || this.state.translated) return;
      const element = event.target;
      if (event.type === "mousemove") {
        if (this.hovered !== element) {
          this.hovered = element;
          this.highlights.show(isPageElement(element) ? [{ element }] : []);
        }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "click") {
        if (
          element.localName === "iframe" ||
          !isPageElement(element) ||
          element.shadowRoot
        ) {
          this.emit({ notice: "unsupported-element" });
        } else this.selectElement(element);
      }
    };
    this.pointerEvents = [
      "mousemove",
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
      "auxclick",
      "dblclick",
      "contextmenu",
    ];
    this.pointerEvents.forEach((type) =>
      window.addEventListener(type, this.handlePointer, true)
    );
    this.handleKey = (event) => {
      if (
        ["ArrowLeft", "ArrowRight"].includes(event.key) &&
        this.state.inspectorOpen &&
        !this.state.picking &&
        !this.state.translated &&
        !this.state.saving &&
        !this.state.loading &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event
          .composedPath()
          .some((node) =>
            node.matches?.(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"], [data-rule-editor-move]'
            )
          )
      ) {
        if (this.navigate(event.key === "ArrowRight" ? 1 : -1)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (event.key === "Escape") {
        // Let an open editor menu consume Escape before closing either panel.
        if (
          isEditorElement(event.target) &&
          event
            .composedPath()
            .some(
              (node) =>
                node.getAttribute?.("role") === "listbox" ||
                node.shadowRoot?.querySelector('[role="listbox"]')
            )
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.state.saving) return;
        if (this.state.picking) {
          this.cancelPick();
        } else if (this.state.inspectorOpen) this.closeInspector();
        else this.onExit();
      }
    };
    window.addEventListener("keydown", this.handleKey, true);
    this.observer = new MutationObserver((records) => {
      if (
        records.every((record) =>
          isEditorElement(
            record.target.nodeType === 1
              ? record.target
              : record.target.parentElement
          )
        )
      )
        return;
      if (!this.refreshTimer)
        this.refreshTimer = setTimeout(() => {
          this.refreshTimer = null;
          this.refresh();
        }, 180);
    });
    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    this.routeTimer = setInterval(() => {
      if (window.location.href !== this.href && !this.state.loading) {
        this.href = window.location.href;
        this.context = null;
        this.activeMatch = null;
        this.undoStack = [];
        this.redoStack = [];
        this.emit({
          picking: false,
          inspectorOpen: false,
          input: "",
          editing: null,
          selected: null,
          ancestors: [],
          candidates: [],
          translated: false,
          notice: "route-changed",
        });
        this.translator.setRuleEditingPreview(false);
        this.load();
      }
    }, 400);
    this.storageTimer = setInterval(() => this.checkExternalChanges(), 1500);
    await this.load();
    if (this.context && this.context.effective.autoScan !== "false") {
      await this.save({ autoScan: "false" });
    }
  }
  async checkExternalChanges() {
    if (
      this.disposed ||
      this.checkingStorage ||
      this.state.loading ||
      this.state.saving ||
      !this.context
    )
      return;
    this.checkingStorage = true;
    const context = this.context;
    try {
      const rules = await getRulesWithDefault();
      if (this.disposed || this.state.saving || context !== this.context)
        return;
      const personal = context.site
        ? rules.find((rule) => rule.pattern === context.site.pattern) || null
        : findMatchingRule(rules, this.href) || null;
      const global = {
        ...GLOBLA_RULE,
        ...rules.find((rule) => rule.pattern === "*"),
      };
      if (
        (context.site &&
          matchesRulePattern(this.href, context.site.pattern) &&
          findMatchingRule(rules, this.href)?.pattern !==
            context.site.pattern) ||
        JSON.stringify(personal) !==
          JSON.stringify(context.site || context.personal) ||
        JSON.stringify(global) !== JSON.stringify(context.global)
      ) {
        this.emit({ error: "rule-conflict" });
      }
    } catch {
      /* A failed background read must not discard the draft. */
    } finally {
      this.checkingStorage = false;
    }
  }
  async load() {
    const href = this.href;
    this.showTranslation(false);
    this.undoStack = [];
    this.redoStack = [];
    this.emit({ loading: true, error: "", patternError: "" });
    try {
      hostnamePattern(href);
      const context = await resolveRuleContext(
        href,
        this.translator.setting,
        this.context?.site?.pattern
      );
      if (this.disposed || href !== this.href) return;
      this.context = context;
      this.translator.updateRule({ ...context.effective, transOpen: "false" });
      this.emit({
        context,
        loading: false,
        pattern: context.site?.pattern || hostnamePattern(href),
      });
      this.refresh();
    } catch (error) {
      this.emit({ loading: false, error: error.message });
    }
  }
  list(field = this.state.field) {
    try {
      return splitSelectorList(this.context?.effective[field] || "").filter(
        (s) => s !== EMPTY_SELECTOR
      );
    } catch {
      return [this.context?.effective[field] || ""];
    }
  }
  source(selector) {
    const field = this.state.field;
    const personal = splitSelectorList(this.context?.personal?.[field] || "");
    if (
      personal.includes(selector) ||
      personal.includes(`+${selector}`) ||
      personal.includes(`+ ${selector}`)
    )
      return "personal";
    const inherited = splitSelectorList(this.context?.inherited[field] || "");
    if (!inherited.includes(selector)) return "personal";
    const global = splitSelectorList(this.context?.global[field] || "");
    return global.includes(selector) ? "global" : "subscription";
  }
  classify(elements) {
    const rule = this.context.effective;
    const { roots, ignoreSelector } = this.translator.ruleRangeContext(rule);
    return elements.map((element) => ({
      element,
      excluded:
        Boolean(element.closest(ignoreSelector)) ||
        !roots.some((root) => root.contains(element)),
    }));
  }
  refresh() {
    if (this.disposed || !this.context || this.state.loading) return;
    try {
      const entries = this.list().map((selector) => {
        try {
          return {
            selector,
            count: queryPage(selector).length,
            source: this.source(selector),
          };
        } catch {
          return { selector, count: 0, source: "personal", invalid: true };
        }
      });
      const candidates = this.state.candidates
        .map((candidate) => ({
          ...candidate,
          count: queryPage(candidate.selector).length,
        }))
        .sort(compareCandidates);
      const removed = this.state.selected && !this.state.selected.isConnected;
      const matches = this.state.whole
        ? this.translator.previewRule().targets
        : queryPage(this.state.input);
      const classified = this.classify(matches);
      const matchIndex = matches.indexOf(this.activeMatch);
      if (matchIndex < 0) this.activeMatch = null;
      if (!this.state.picking && !this.state.translated)
        this.highlights.show(classified, this.activeMatch);
      let hidden = 0;
      for (const element of matches)
        if (
          !element.getClientRects().length ||
          getComputedStyle(element).visibility === "hidden"
        )
          hidden++;
      this.emit({
        entries,
        candidates,
        matches,
        matchIndex: matchIndex + 1,
        excluded: classified.filter((entry) => entry.excluded).length,
        hidden,
        validation: "",
        ...(removed
          ? {
              selected: null,
              ancestors: [],
              candidates: [],
              notice: "element-removed",
            }
          : {}),
      });
    } catch (error) {
      this.activeMatch = null;
      this.highlights.show([]);
      this.emit({ matches: [], matchIndex: 0, validation: error.message });
    }
  }
  selectElement(element) {
    if (!isPageElement(element)) return;
    this.activeMatch = null;
    const candidates = selectorCandidates(element);
    const recommended =
      candidates.find((candidate) => !candidate.fragile) || candidates[0];
    this.emit({
      selected: element,
      ancestors: ancestorElements(element),
      candidates,
      picking: false,
      inspectorOpen: true,
      whole: false,
      input: recommended?.selector || "",
      notice: "",
      error: "",
    });
    this.refresh();
  }
  pick() {
    this.showTranslation(false);
    this.hovered = null;
    this.emit({ picking: true, whole: false, notice: "" });
  }
  cancelPick() {
    this.hovered = null;
    this.emit({ picking: false });
    this.refresh();
  }
  closeInspector() {
    if (this.state.saving) return;
    clearTimeout(this.inputTimer);
    this.activeMatch = null;
    this.emit({
      inspectorOpen: false,
      picking: false,
      selected: null,
      ancestors: [],
      candidates: [],
      input: "",
      editing: null,
      validation: "",
      whole: false,
    });
    this.refresh();
  }
  add() {
    this.closeInspector();
    this.showTranslation(false);
    this.emit({ inspectorOpen: true, notice: "", error: "" });
  }
  setField(field) {
    this.closeInspector();
    this.emit({
      field,
      editing: null,
      input: "",
      whole: false,
      validation: "",
      error: "",
      notice: "",
    });
    this.refresh();
  }
  setInput(input) {
    this.activeMatch = null;
    this.emit({ input, matchIndex: 0, whole: false, error: "" });
    clearTimeout(this.inputTimer);
    this.inputTimer = setTimeout(() => this.refresh(), 160);
  }
  edit(selector) {
    this.closeInspector();
    this.showTranslation(false);
    this.emit({
      inspectorOpen: true,
      input: selector,
      editing: selector,
      whole: false,
      notice: "",
    });
    this.refresh();
  }
  hover(selector) {
    if (this.state.translated || this.state.picking) return;
    try {
      this.highlights.show(this.classify(queryPage(selector)));
    } catch {
      this.highlights.show([]);
    }
  }
  showWhole() {
    this.closeInspector();
    this.showTranslation(false);
    this.emit({ whole: true, picking: false });
    this.refresh();
  }
  navigate(direction) {
    // Resolve pending selector input and dynamic page changes before moving.
    clearTimeout(this.inputTimer);
    this.refresh();
    const matches = this.state.matches;
    if (!matches.length) return false;
    const current = matches.indexOf(this.activeMatch);
    const index =
      current < 0
        ? direction > 0
          ? 0
          : matches.length - 1
        : (current + direction + matches.length) % matches.length;
    this.activeMatch = matches[index];
    this.activeMatch.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    this.highlights.show(this.classify(matches), this.activeMatch);
    this.emit({ matchIndex: index + 1 });
    return true;
  }
  setPattern(pattern) {
    this.emit({ pattern, patternError: "" });
  }
  async commitPattern() {
    const pattern = this.state.pattern.trim();
    if (
      pattern === (this.context?.site?.pattern || hostnamePattern(this.href))
    ) {
      this.emit({ pattern });
      return;
    }
    if (!pattern || pattern === "*") {
      this.emit({ patternError: "invalid-pattern" });
      return;
    }
    await this.save({ pattern });
  }
  showTranslation(show) {
    if (show === this.state.translated) return;
    this.translator.setRuleEditingPreview(show);
    this.emit({ translated: show, picking: false });
    this.highlights.show([]);
    if (!show) this.refresh();
  }
  async commitInput() {
    try {
      const selectors = splitSelectorList(this.state.input);
      if (!selectors.length) return;
      selectors.forEach((selector) => queryPage(selector));
      const list = this.list().filter(
        (selector) => selector !== this.state.editing
      );
      const saved = await this.save({
        [this.state.field]: [...new Set([...list, ...selectors])].join(", "),
      });
      if (saved) this.closeInspector();
    } catch (error) {
      this.emit({ error: error.message });
    }
  }
  async remove(selector) {
    const list = this.list().filter((item) => item !== selector);
    const saved = await this.save({
      [this.state.field]: list.join(", ") || EMPTY_SELECTOR,
    });
    if (saved) {
      this.closeInspector();
      const targets = this.translator.previewRule().targets;
      const coverage = this.classify(queryPage(selector)).some(
        ({ element, excluded }) =>
          !excluded &&
          targets.some(
            (target) =>
              target === element ||
              target.contains(element) ||
              element.contains(target)
          )
      );
      this.emit({
        input: selector,
        notice: coverage ? "removed-coverage" : "removed",
        whole: false,
      });
      this.refresh();
    }
  }
  async save(patch, history = "push") {
    if (this.disposed || this.state.saving || this.state.loading) return false;
    if (window.location.href !== this.href) {
      this.href = window.location.href;
      this.context = null;
      this.emit({ notice: "route-changed" });
      await this.load();
      return false;
    }
    this.showTranslation(false);
    const href = this.href;
    const raw = this.context.site || this.context.personal || DEFAULT_RULE;
    const before = Object.fromEntries(
      Object.keys(patch).map((key) => [
        key,
        key === "pattern"
          ? this.context.site?.pattern || hostnamePattern(href)
          : (raw[key] ?? DEFAULT_RULE[key]),
      ])
    );
    this.emit({ saving: true, error: "", notice: "" });
    try {
      const context = await saveSiteRule({
        href,
        patch,
        expected: this.context.site,
        seed: this.context.personal,
        inherited: this.context.inherited,
      });
      if (!context?.effective) throw new Error("save-failed");
      if (this.disposed || href !== this.href) return false;
      this.context = context;
      this.translator.updateRule({ ...context.effective, transOpen: "false" });
      if (history === "push") {
        this.undoStack.push({ before, after: patch });
        this.redoStack = [];
      }
      this.emit({
        context,
        saving: false,
        editing: null,
        notice: "saved",
        ...(patch.pattern
          ? { pattern: context.site.pattern, patternError: "" }
          : {}),
      });
      this.refresh();
      return true;
    } catch (error) {
      const errorField =
        patch.pattern &&
        ["invalid-pattern", "duplicate-pattern"].includes(error.message)
          ? "patternError"
          : "error";
      this.emit({
        [errorField]: error.message.includes("rule-conflict")
          ? "rule-conflict"
          : error.message,
      });
      return false;
    } finally {
      this.emit({ saving: false });
    }
  }
  async history(redo = false) {
    const from = redo ? this.redoStack : this.undoStack;
    const item = from[from.length - 1];
    if (item && (await this.save(redo ? item.after : item.before, "history"))) {
      from.pop();
      (redo ? this.undoStack : this.redoStack).push(item);
      this.emit();
    }
  }
  dispose(restore = true) {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.refreshTimer);
    clearTimeout(this.inputTimer);
    clearInterval(this.routeTimer);
    clearInterval(this.storageTimer);
    this.observer?.disconnect();
    this.pointerEvents?.forEach((type) =>
      window.removeEventListener(type, this.handlePointer, true)
    );
    window.removeEventListener("keydown", this.handleKey, true);
    this.highlights?.destroy();
    if (restore && this.runtimeState && this.context?.pageEffective) {
      this.translator.setRuleEditingPreview(false);
      this.translator.updateRule({
        ...this.context.pageEffective,
        transOpen: "false",
      });
    }
    if (this.runtimeState)
      this.translator.endRuleEditing(this.runtimeState, restore);
    this.listeners.clear();
  }
}

export { SELECTOR_FIELDS };
