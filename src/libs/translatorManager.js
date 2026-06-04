import { browser } from "./browser";
import { Translator } from "./translator";
import { InputTranslator } from "./inputTranslate";
import { TransboxManager } from "./tranbox";
import { shortcutRegister } from "./shortcut";
import { sendIframeMsg } from "./iframe";
import {
  EVENT_KISS_INNER,
  EVENT_KISS_TRANSLATOR,
  MSG_HOVERNODE_TOGGLE,
  MSG_INPUT_TRANSLATE,
  newI18n,
} from "../config";
import { touchTapListener } from "./touch";
import { PopupManager } from "./popupManager";
import { FabManager } from "./fabManager";
import {
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_TRANSONLY,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_ONLY,
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

  #innerMessageHandler = null;
  #browserMessageHandler = null;
  #windowMessageHandler = null;

  _translator;
  _transboxManager;
  _inputTranslator;
  _popupManager;
  _fabManager;

  constructor({ setting, rule, fabConfig, favWords, isIframe, isUserscript }) {
    this.#isIframe = isIframe;
    this.#isUserscript = isUserscript;

    // 1. 初始化核心网页翻译扫描器
    this._translator = new Translator({
      rule,
      setting,
      favWords,
      isUserscript,
      isIframe,
    });

    // 2. 初始化划词翻译面板管理器
    this._transboxManager = new TransboxManager(setting);

    // 3. 非 iframe (即在 top window 主页面) 模式下，额外初始化输入框翻译、快捷弹出菜单与悬浮球按钮
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

    // 绑定各类环境下的通信消息处理器句柄
    this.#innerMessageHandler = this.#handleInnerMessage.bind(this);
    this.#browserMessageHandler = this.#handleBrowserMessage.bind(this);
    this.#windowMessageHandler = this.#handleWindowMessage.bind(this);
  }

  /**
   * 启动整个翻译扩展前端业务。
   * 注册各类事件监听、绑定触屏手势和油猴右上角菜单选项。
   */
  start() {
    if (this.#isActive) {
      logger.info("TranslatorManager is already started.");
      return;
    }

    this.#setupMessageListeners();
    this.#setupTouchOperations();

    // 仅在主页面窗口且属于油猴脚本时，注册页面级物理快捷键及油猴右上角点击菜单
    if (!this.#isIframe && this.#isUserscript) {
      this.#registerShortcuts();
      this.#registerMenus();
    }

    this.#isActive = true;
    logger.info("TranslatorManager started.");
  }

  /**
   * 彻底停用并注销前端翻译器。
   * 执行健全的垃圾回收，清除全局事件、物理按键监听、手势绑定、撤回油猴特权菜单，并逐个销毁子模块实例，防止内存泄漏。
   */
  stop() {
    if (!this.#isActive) {
      logger.info("TranslatorManager is not running.");
      return;
    }

    // 1. 移出消息监听器
    window.removeEventListener(
      EVENT_KISS_TRANSLATOR,
      this.#innerMessageHandler
    );
    if (this.#isUserscript) {
      window.removeEventListener("message", this.#innerMessageHandler);
    } else {
      browser.runtime.onMessage.removeListener(this.#browserMessageHandler);
      if (this.#isIframe) {
        window.removeEventListener("message", this.#innerMessageHandler);
      }
    }

    // 2. 清理物理快捷键监听
    this.#clearShortcuts.forEach((clear) => clear());
    this.#clearShortcuts = [];

    // 3. 清理触屏手势监听
    this.#clearTouchListeners.forEach((clear) => clear());
    this.#clearTouchListeners = [];

    // 4. 销毁并撤销已挂载的油猴特权菜单
    if (globalThis.GM && this.#menuCommandIds.length > 0) {
      this.#menuCommandIds.forEach((id) => GM.unregisterMenuCommand?.(id));
      this.#menuCommandIds = [];
    }

    // 5. 销毁各子组件实例
    this._popupManager?.destroy();
    this._fabManager?.destroy();
    this._transboxManager?.disable();
    this._inputTranslator?.disable();
    this._translator.stop();

    this.#isActive = false;
    logger.info("TranslatorManager stopped.");
  }

  /**
   * 依据运行宿主环境，注册相应的消息通道监听。
   */
  #setupMessageListeners() {
    if (this.#isUserscript) {
      window.addEventListener("message", this.#innerMessageHandler);
    } else {
      // 浏览器插件环境：监听 background.js 发送的控制指令
      browser.runtime.onMessage.addListener(this.#browserMessageHandler);
      if (this.#isIframe) {
        window.addEventListener("message", this.#innerMessageHandler);
      }
    }

    // 监听其它前台扩展模块或外部页面事件直接派发的 EVENT_KISS_TRANSLATOR CustomEvent 调用
    window.addEventListener(EVENT_KISS_TRANSLATOR, this.#windowMessageHandler);
  }

  /**
   * 根据设置配置项，将手势手势绑定到 touchTapListener。
   */
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
          options = { taps: 1, fingers: mode }; // fingers 根手指单次点击
          break;
        case 5:
          options = { taps: 2, fingers: 1 }; // 单指双击
          break;
        case 6:
          options = { taps: 3, fingers: 1 }; // 单指三击
          break;
        case 7:
          options = { taps: 2, fingers: 2 }; // 双指双击
          break;
        default:
      }
      if (options) {
        this.#clearTouchListeners.push(touchTapListener(handleTap, options));
      }
    };

    touchModes.forEach((mode) => handleListener(mode));
  }

  // 处理来自主 window 自定义事件的通信
  #handleWindowMessage(event) {
    logger.debug("handle window message:", event);
    this.#processActions(event.detail);
  }

  // 处理 iframe 或页面内 postMessage 传递的消息
  #handleInnerMessage(event) {
    this.#processActions(event.data);
  }

  // 扩展环境：处理 runtime.onMessage 底层通信
  #handleBrowserMessage(message, sender, sendResponse) {
    const result = this.#processActions(message, true);
    const response = result || {
      rule: this._translator.rule,
      setting: this._translator.setting,
    };
    sendResponse(response);
    return true; // 返回 true 以支持异步回调 (sendResponse)
  }

  /**
   * 使用 shortcutRegister 在页面全局注册对应的控制快捷键。
   */
  #registerShortcuts() {
    const { shortcuts, tranboxSetting } = this._translator.setting;
    this.#clearShortcuts = [
      shortcutRegister(shortcuts[OPT_SHORTCUT_TRANSLATE], () =>
        this.#processActions({ action: MSG_TRANS_TOGGLE })
      ),
      shortcutRegister(shortcuts[OPT_SHORTCUT_TRANSONLY], () =>
        this.#processActions({ action: MSG_TRANS_TOGGLE_ONLY })
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
      shortcutRegister(tranboxSetting?.tranboxShortcut, () =>
        this.#processActions({ action: MSG_TRANSBOX_TOGGLE })
      ),
    ];
  }

  /**
   * 在油猴环境下，向浏览器右上角的脚本菜单中添加交互可点击的命令按钮。
   */
  #registerMenus() {
    if (!globalThis.GM) return;
    const { contextMenuType, uiLang } = this._translator.setting;
    if (contextMenuType === 0) return;

    const i18n = newI18n(uiLang || "zh");

    this.#menuCommandIds = [
      GM.registerMenuCommand?.(
        i18n("translate_switch"),
        () => this.#processActions({ action: MSG_TRANS_TOGGLE }),
        "Q"
      ),
      GM.registerMenuCommand?.(
        i18n("transonly_alt"),
        () => this.#processActions({ action: MSG_TRANS_TOGGLE_ONLY }),
        "Q"
      ),
      GM.registerMenuCommand?.(
        i18n("toggle_style"),
        () => this.#processActions({ action: MSG_TRANS_TOGGLE_STYLE }),
        "C"
      ),
      GM.registerMenuCommand?.(
        i18n("open_menu"),
        () => this.#processActions({ action: MSG_POPUP_TOGGLE }),
        "K"
      ),
      GM.registerMenuCommand?.(
        i18n("open_setting"),
        () => window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank"),
        "O"
      ),
    ];
  }

  /**
   * 翻译动作分发器中枢。
   * 接收指令后，将其应用给子模块，且将非 Extension 内部的消息向子 iframe 广播，同步翻译动作。
   * @param {Object} action 包含指令名 action 和参数 args
   * @param {boolean} fromExt 标识该命令是否直接来自 Background 扩展，为真时不需要二次向 Iframe 广播
   */
  #processActions({ action, args } = {}, fromExt = false) {
    if (!action) return;

    // REVIEW: 强大的跨 Iframe 动作广播机制！
    // 若当前为顶级框架主页面触发的翻译动作（如点击了悬浮球或按下了快捷键），
    // 主动调用 sendIframeMsg 广播消息给所有子 iframe，使多层 iframe 页面能统一联动翻译，效果极佳。
    if (!fromExt) {
      sendIframeMsg(action, args);
    }

    logger.debug("process action:", action, args);

    switch (action) {
      case MSG_TRANS_TOGGLE:
        this._translator.toggle();
        break;
      case MSG_TRANS_TOGGLE_ONLY:
        this._translator.toggleTransOnly();
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
          new CustomEvent(EVENT_KISS_INNER, {
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
      case MSG_HOVERNODE_TOGGLE:
        this._translator.toggleHoverNode();
        break;
      case MSG_INPUT_TRANSLATE:
        this._inputTranslator.handleTranslate();
        break;
      default:
        logger.info(`Message action is unavailable: ${action}`);
        return { error: `Message action is unavailable: ${action}` };
    }
  }
}
