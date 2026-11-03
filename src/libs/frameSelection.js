import {
  OPT_TRANBOX_TRIGGER_SELECT,
  OPT_TRANBOX_TRIGGER_DBLCLICK,
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_BTN_POSITION_MOUSE,
} from "../config";
import { SESSION_SELECTION, SESSION_FOCUS } from "./pageSession";
import {
  getSelectionContext,
  getSelectionSource,
  getSelectionButtonPosition,
  getPointerButtonPosition,
  shouldSkipSelection,
} from "../hooks/useSelectionController";
import { isMobile } from "./mobile";
import { shortcutRegister } from "./shortcut";

// No React root or translation request is created in child documents.
export class FrameSelection {
  constructor(setting, send) {
    this.send = send;
    this.update(setting);
  }
  update(setting) {
    this.disable();
    this.setting = setting;
    if (!setting.tranboxSetting?.transOpen) return;
    const config = setting.tranboxSetting;
    const event =
      config.triggerMode === OPT_TRANBOX_TRIGGER_DBLCLICK
        ? "dblclick"
        : isMobile
          ? "touchend"
          : "mouseup";
    this.capture = async (e) => {
      if (e.button === 2 || this.button?.contains(e.target)) return;
      const root = e.composedPath?.()[0]?.getRootNode?.();
      const selection = root?.getSelection?.() || window.getSelection();
      const text = selection?.toString()?.trim();
      const revision = ++this.revision;
      this.button?.remove();
      if (
        !text ||
        (this.pressed &&
          this.pressed.text === text &&
          ["anchorNode", "anchorOffset", "focusNode", "focusOffset"].every(
            (key) => this.pressed[key] === selection?.[key]
          ))
      ) {
        this.send(SESSION_FOCUS, { selection: true, enabled: false });
        if (this.requestId)
          this.send(SESSION_SELECTION, {
            close: true,
            requestId: this.requestId,
          });
        return;
      }
      const snapshot = {
        text,
        context: getSelectionContext(selection),
        selectionSource: getSelectionSource(selection, e.target),
      };
      if (
        (await shouldSkipSelection(text, config.skipLangs || [])) ||
        revision !== this.revision
      )
        return;
      this.pending = snapshot;
      this.send(SESSION_FOCUS, { selection: true, enabled: true });
      if (
        [OPT_TRANBOX_TRIGGER_SELECT, OPT_TRANBOX_TRIGGER_DBLCLICK].includes(
          config.triggerMode
        )
      ) {
        this.open();
        return;
      }
      if (config.hideTranBtn || !selection.rangeCount) return;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const position =
        config.btnPositionMode === OPT_TRANBOX_BTN_POSITION_MOUSE
          ? getPointerButtonPosition(
              { x: e.clientX, y: e.clientY },
              config.btnOffsetX,
              config.btnOffsetY
            )
          : getSelectionButtonPosition(
              rect,
              config.btnOffsetX,
              config.btnOffsetY
            );
      if (!position) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "KT-tranbtn notranslate";
      button.setAttribute("translate", "no");
      button.textContent = "译";
      button.style.cssText = `position:fixed;left:${position.x}px;top:${position.y}px;width:40px;height:40px;z-index:2147483647;border:0;border-radius:50%;background:#6750a4;color:white;cursor:pointer`;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener(
        config.triggerMode === OPT_TRANBOX_TRIGGER_HOVER
          ? "mouseenter"
          : "click",
        () => this.open()
      );
      document.documentElement.appendChild(button);
      this.button = button;
    };
    const press = (event) => {
      if (this.button?.contains(event.target)) return;
      ++this.revision;
      const selection = window.getSelection();
      this.pressed = { text: selection?.toString()?.trim() };
      for (const key of [
        "anchorNode",
        "anchorOffset",
        "focusNode",
        "focusOffset",
      ])
        this.pressed[key] = selection?.[key];
    };
    window.addEventListener("pointerdown", press, true);
    window.addEventListener(event, this.capture);

    this.clear = () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener(event, this.capture);
    };
    if (config.tranboxShortcut)
      this.clearShortcut = shortcutRegister(config.tranboxShortcut, () =>
        this.open()
      );
  }
  open(args) {
    const selection = window.getSelection();
    const snapshot = args?.text
      ? args
      : this.pending || {
          text: selection?.toString()?.trim(),
          context: getSelectionContext(selection),
          selectionSource: getSelectionSource(selection),
        };
    this.requestId = `${Date.now()}:${++this.revision}`;
    this.send(SESSION_SELECTION, { ...snapshot, requestId: this.requestId });
    this.button?.remove();
  }
  isEnabled() {
    return Boolean(this.clear);
  }
  disable() {
    this.revision = (this.revision || 0) + 1;
    this.clear?.();
    this.clear = null;
    this.clearShortcut?.();
    this.clearShortcut = null;
    this.button?.remove();
    this.button = null;
  }
}
