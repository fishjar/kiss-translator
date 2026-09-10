import { DEFAULT_RULE, GLOBLA_RULE } from "../config";
import {
  findMatchingRule,
  hostnamePattern,
  matchesRulePattern,
  mergeRules,
  resolveRuleContext,
} from "./rules";
import { getDomainOptions } from "./url";
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
      dirty: false,
      confirmAction: "",
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
      dirty: this.savedContext
        ? !this.savedContext.site ||
          (patch.pattern ?? this.state.pattern).trim() !==
            this.baseline.pattern ||
          Object.keys(this.draft).some(
            (key) => this.draft[key] !== this.baseline[key]
          )
        : false,
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
        !this.state.confirmAction &&
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
        if (this.state.confirmAction) {
          this.emit({ confirmAction: "" });
        } else if (this.state.picking) {
          this.cancelPick();
        } else if (this.state.inspectorOpen) this.closeInspector();
        else this.requestAction("exit");
      }
    };
    window.addEventListener("keydown", this.handleKey, true);
    this.handleBeforeUnload = (event) => {
      if (!this.state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", this.handleBeforeUnload);
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
      if (
        window.location.href !== (this.observedHref || this.href) &&
        !this.state.loading &&
        !this.state.saving
      ) {
        this.observedHref = window.location.href;
        this.requestAction("reload");
      }
    }, 400);
    this.storageTimer = setInterval(() => this.checkExternalChanges(), 1500);
    await this.load();
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
    const context = this.savedContext;
    try {
      const rules = await getRulesWithDefault();
      if (this.disposed || this.state.saving || context !== this.savedContext)
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
      this.resetDraft(context);
      this.translator.updateRule({ ...context.effective, transOpen: "false" });
      this.emit({
        context,
        loading: false,
        pattern: this.draft.pattern,
        domainOptions: getDomainOptions(href),
      });
      this.refresh();
    } catch (error) {
      this.emit({ loading: false, error: error.message });
    }
  }
  resetDraft(context) {
    this.savedContext = context;
    this.context = context;
    this.baseline = {
      ...DEFAULT_RULE,
      ...(context.site || context.personal),
      pattern: context.site?.pattern || getDomainOptions(this.href)[0],
    };
    this.draft = { ...this.baseline };
  }
  requestAction(action) {
    if (this.disposed || this.state.saving) return;
    if (this.state.dirty) {
      this.cancelPick();
      this.emit({ confirmAction: action });
    } else return this.finishAction(action);
  }
  async confirmAction(save) {
    const action = this.state.confirmAction;
    if (!action || this.state.saving) return;
    if (save && !(await this.save())) return;
    return this.finishAction(action);
  }
  async finishAction(action) {
    this.emit({ confirmAction: "" });
    if (action === "reload") {
      const changed = this.href !== window.location.href;
      this.href = window.location.href;
      this.observedHref = this.href;
      if (changed) this.context = null;
      this.closeInspector();
      this.emit({ notice: changed ? "route-changed" : "" });
      return this.load();
    }
    // A SPA can navigate while the user keeps the old page's draft open.
    // Restore the rule for the actual page when leaving that draft.
    if (this.href !== window.location.href) {
      this.emit({ loading: true });
      try {
        const context = await resolveRuleContext(
          window.location.href,
          this.translator.setting
        );
        if (this.disposed) return;
        this.restoreRule = context.effective;
      } catch (error) {
        this.emit({ loading: false, error: error.message });
        return;
      }
    }
    this.onExit();
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
    const whole = !this.state.whole;
    this.closeInspector();
    this.showTranslation(false);
    this.emit({ whole, picking: false });
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
  commitPattern() {
    const pattern = this.state.pattern.trim();
    if (!pattern || pattern === "*") {
      this.emit({ patternError: "invalid-pattern" });
      return false;
    }
    return this.updateDraft({ pattern });
  }
  showTranslation(show) {
    if (show === this.state.translated) return;
    this.translator.setRuleEditingPreview(show);
    this.emit({
      translated: show,
      picking: false,
      ...(show ? { whole: false } : {}),
    });
    this.highlights.show([]);
    if (!show) this.refresh();
  }
  commitInput() {
    try {
      const selectors = splitSelectorList(this.state.input);
      if (!selectors.length) return;
      selectors.forEach((selector) => queryPage(selector));
      const list = this.list().filter(
        (selector) => selector !== this.state.editing
      );
      const updated = this.updateDraft({
        [this.state.field]: [...new Set([...list, ...selectors])].join(", "),
      });
      if (updated) this.closeInspector();
    } catch (error) {
      this.emit({ error: error.message });
    }
  }
  remove(selector) {
    const list = this.list().filter((item) => item !== selector);
    const updated = this.updateDraft({
      [this.state.field]: list.join(", ") || EMPTY_SELECTOR,
    });
    if (updated) {
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
  updateDraft(patch, history = "push") {
    if (this.disposed || this.state.saving || this.state.loading || !this.draft)
      return false;
    this.showTranslation(false);
    const before = Object.fromEntries(
      Object.keys(patch).map((key) => [key, this.draft[key]])
    );
    const changed = Object.keys(patch).some(
      (key) => patch[key] !== before[key]
    );
    this.draft = { ...this.draft, ...patch };
    this.context = {
      ...this.savedContext,
      personal: this.draft,
      effective: mergeRules(this.savedContext.inherited, this.draft),
    };
    this.translator.updateRule({
      ...this.context.effective,
      transOpen: "false",
    });
    if (changed && history === "push") {
      this.undoStack.push({ before, after: patch });
      this.redoStack = [];
    }
    this.emit({
      context: this.context,
      notice: "",
      ...(patch.pattern ? { pattern: patch.pattern, patternError: "" } : {}),
    });
    this.refresh();
    return true;
  }
  async save() {
    if (
      this.disposed ||
      this.state.saving ||
      this.state.loading ||
      !this.context
    )
      return false;
    if (!this.commitPattern()) return false;
    const patch = Object.fromEntries(
      Object.keys(this.draft)
        .filter((key) => this.draft[key] !== this.baseline[key])
        .map((key) => [key, this.draft[key]])
    );
    if (!this.savedContext.site) patch.pattern = this.draft.pattern;
    if (!Object.keys(patch).length) return true;
    const href = this.href;
    this.emit({ saving: true, error: "", notice: "" });
    try {
      const context = await saveSiteRule({
        href,
        patch,
        expected: this.savedContext.site,
        seed: this.savedContext.personal,
        inherited: this.savedContext.inherited,
      });
      if (!context?.effective) throw new Error("save-failed");
      if (this.disposed || href !== this.href) return false;
      this.resetDraft(context);
      this.translator.updateRule({ ...context.effective, transOpen: "false" });
      this.emit({
        context,
        saving: false,
        editing: null,
        notice: "saved",
        pattern: this.draft.pattern,
        patternError: "",
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
  history(redo = false) {
    const from = redo ? this.redoStack : this.undoStack;
    const item = from[from.length - 1];
    if (item && this.updateDraft(redo ? item.after : item.before, "history")) {
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
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    this.highlights?.destroy();
    if (restore && this.runtimeState && this.savedContext) {
      this.translator.setRuleEditingPreview(false);
      this.translator.updateRule({
        ...(this.restoreRule ||
          this.savedContext.pageEffective ||
          this.savedContext.effective),
        transOpen: "false",
      });
    }
    if (this.runtimeState)
      this.translator.endRuleEditing(this.runtimeState, restore);
    this.listeners.clear();
  }
}

export { SELECTOR_FIELDS };
