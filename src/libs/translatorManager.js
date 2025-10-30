import { browser } from "./browser";
import { Translator } from "./translator";
import { InputTranslator } from "./inputTranslate";
import { TransboxManager } from "./tranbox";
import { shortcutRegister } from "./shortcut";
import { sendIframeMsg } from "./iframe";
import { EVENT_KISS, newI18n } from "../config";
import { touchTapListener } from "./touch";
import { PopupManager } from "./popupManager";
import { FabManager } from "./fabManager";
import {
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  MSG_OPEN_TRANBOX,
  MSG_TRANSBOX_TOGGLE,
  MSG_POPUP_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
} from "../config";
import { logger } from "./log";

export default class TranslatorManager {
  #clearShortcuts = [];
  #menuCommandIds = [];
  #clearTouchListeners = [];
  #isActive = false;
  #isUserscript;
  #isIframe;

  #windowMessageHandler = null;
  #browserMessageHandler = null;

  _translator;
  _transboxManager;
  _inputTranslator;
  _popupManager;
  _fabManager;

  constructor({ setting, rule, fabConfig, favWords, isIframe, isUserscript }) {
    this.#isIframe = isIframe;
    this.#isUserscript = isUserscript;

    this._translator = new Translator({
      rule,
      setting,
      favWords,
      isUserscript,
      isIframe,
    });

    this._transboxManager = new TransboxManager(setting);

    if (!isIframe) {
      this._inputTranslator = new InputTranslator(setting);
      this._popupManager = new PopupManager({
        translator: this._translator,
        processActions: this.#processActions.bind(this),
      });
      this._fabManager = new FabManager({
        processActions: this.#processActions.bind(this),
        fabConfig,
      });
    }

    this.#windowMessageHandler = this.#handleWindowMessage.bind(this);
    this.#browserMessageHandler = this.#handleBrowserMessage.bind(this);
  }

  start() {
    if (this.#isActive) {
      logger.info("TranslatorManager is already started.");
      return;
    }

    this.#setupMessageListeners();
    this.#setupTouchOperations();

    if (!this.#isIframe && this.#isUserscript) {
      this.#registerShortcuts();
      this.#registerMenus();
    }

    this.#isActive = true;
    logger.info("TranslatorManager started.");
  }

  stop() {
    if (!this.#isActive) {
      logger.info("TranslatorManager is not running.");
      return;
    }

    // 移除消息监听器
    if (this.#isUserscript) {
      window.removeEventListener("message", this.#windowMessageHandler);
    } else if (
      browser.runtime.onMessage.hasListener(this.#browserMessageHandler)
    ) {
      browser.runtime.onMessage.removeListener(this.#browserMessageHandler);
    }

    // 已注册的快捷键
    this.#clearShortcuts.forEach((clear) => clear());
    this.#clearShortcuts = [];

    // 触屏
    this.#clearTouchListeners.forEach((clear) => clear());
    this.#clearTouchListeners = [];

    // 油猴菜单
    if (globalThis.GM && this.#menuCommandIds.length > 0) {
      this.#menuCommandIds.forEach((id) =>
        globalThis.GM.unregisterMenuCommand(id)
      );
      this.#menuCommandIds = [];
    }

    // 子模块
    this._popupManager?.destroy();
    this._fabManager?.destroy();
    this._transboxManager?.disable();
    this._inputTranslator?.disable();
    this._translator.stop();

    this.#isActive = false;
    logger.info("TranslatorManager stopped.");
  }

  #setupMessageListeners() {
    if (this.#isUserscript) {
      window.addEventListener("message", this.#windowMessageHandler);
    } else {
      browser.runtime.onMessage.addListener(this.#browserMessageHandler);
      if (this.#isIframe) {
        window.addEventListener("message", this.#windowMessageHandler);
      }
    }
  }

  #setupTouchOperations() {
    if (this.#isIframe) return;

    const { touchModes = [2] } = this._translator.setting;
    if (touchModes.length === 0) {
      return;
    }

    const handleTap = () => {
      this.#processActions({ action: MSG_TRANS_TOGGLE });
    };

    const handleListener = (mode) => {
      let options = null;
      switch (mode) {
        case 2:
        case 3:
        case 4:
          options = { taps: 1, fingers: mode };
          break;
        case 5:
          options = { taps: 2, fingers: 1 };
          break;
        case 6:
          options = { taps: 3, fingers: 1 };
          break;
        case 7:
          options = { taps: 2, fingers: 2 };
          break;
        default:
      }
      if (options) {
        this.#clearTouchListeners.push(touchTapListener(handleTap, options));
      }
    };

    touchModes.forEach((mode) => handleListener(mode));
  }

  #handleWindowMessage(event) {
    this.#processActions(event.data);
  }

  #handleBrowserMessage(message, sender, sendResponse) {
    const result = this.#processActions(message, true);
    const response = result || {
      rule: this._translator.rule,
      setting: this._translator.setting,
    };
    sendResponse(response);
    return true;
  }

  #registerShortcuts() {
    const { shortcuts } = this._translator.setting;
    this.#clearShortcuts = [
      shortcutRegister(shortcuts[OPT_SHORTCUT_TRANSLATE], () =>
        this.#processActions({ action: MSG_TRANS_TOGGLE })
      ),
      shortcutRegister(shortcuts[OPT_SHORTCUT_STYLE], () =>
        this.#processActions({ action: MSG_TRANS_TOGGLE_STYLE })
      ),
      shortcutRegister(shortcuts[OPT_SHORTCUT_POPUP], () =>
        this.#processActions({ action: MSG_POPUP_TOGGLE })
      ),
      shortcutRegister(shortcuts[OPT_SHORTCUT_SETTING], () =>
        window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank")
      ),
    ];
  }

  #registerMenus() {
    if (!globalThis.GM) return;
    const { contextMenuType, uiLang } = this._translator.setting;
    if (contextMenuType === 0) return;

    const i18n = newI18n(uiLang || "zh");
    const GM = globalThis.GM;
    this.#menuCommandIds = [
      GM.registerMenuCommand(
        i18n("translate_switch"),
        () => this.#processActions({ action: MSG_TRANS_TOGGLE }),
        "Q"
      ),
      GM.registerMenuCommand(
        i18n("toggle_style"),
        () => this.#processActions({ action: MSG_TRANS_TOGGLE_STYLE }),
        "C"
      ),
      GM.registerMenuCommand(
        i18n("open_menu"),
        () => this.#processActions({ action: MSG_POPUP_TOGGLE }),
        "K"
      ),
      GM.registerMenuCommand(
        i18n("open_setting"),
        () => window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank"),
        "O"
      ),
    ];
  }

  #processActions({ action, args } = {}, fromExt = false) {
    if (!fromExt) {
      sendIframeMsg(action, args);
    }

    switch (action) {
      case MSG_TRANS_TOGGLE:
        this._translator.toggle();
        break;
      case MSG_TRANS_TOGGLE_STYLE:
        this._translator.toggleStyle();
        break;
      case MSG_TRANS_GETRULE:
        break;
      case MSG_TRANS_PUTRULE:
        this._translator.updateRule(args);
        break;
      case MSG_OPEN_TRANBOX:
        document.dispatchEvent(
          new CustomEvent(EVENT_KISS, {
            detail: { action: MSG_OPEN_TRANBOX },
          })
        );
        break;
      case MSG_POPUP_TOGGLE:
        this._popupManager?.toggle();
        break;
      case MSG_TRANSBOX_TOGGLE:
        this._transboxManager?.toggle();
        this._translator.toggleTransbox();
        break;
      case MSG_MOUSEHOVER_TOGGLE:
        this._translator.toggleMouseHover();
        break;
      case MSG_TRANSINPUT_TOGGLE:
        this._inputTranslator?.toggle();
        this._translator.toggleInputTranslate();
        break;
      default:
        logger.info(`Message action is unavailable: ${action}`);
        return { error: `Message action is unavailable: ${action}` };
    }
  }
}
