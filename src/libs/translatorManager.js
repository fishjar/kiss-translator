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

/**
 * 前台翻译业务的总生命周期管理器。
 *
 * 这个类负责把网页翻译核心、划词翻译、输入框翻译、弹出面板、
 * 悬浮球、快捷键、油猴菜单和跨 iframe 消息分发组织到同一个
 * start/stop/restart 生命周期里。构造函数刻意不创建 DOM 相关子模块，
 * 因为 SPA 页面可能替换 body/html，运行期子模块必须能被销毁并重建。
 */
export default class TranslatorManager {
  // 全局注册项的清理句柄；这些只随 start/stop 注册，restart 时不重复注册。
  #clearShortcuts = [];
  #menuCommandIds = [];
  #clearTouchListeners = [];
  #isActive = false;

  // 初始配置快照。restart 会用运行期状态刷新这些快照，再重建子模块。
  #setting;
  #rule;
  #fabConfig;
  #favWords;
  #isUserscript;
  #isIframe;
  #transboxOnly;

  // SPA 容器监听：document 负责 html 替换，documentElement 负责 body 替换。
  #documentObserver = null;
  #documentElementObserver = null;
  #knownDocumentElement = null;
  #knownBody = null;

  // 多个导航/DOM 事件通常会连发，用 0ms timer 合并成一次 rescan/restart。
  #spaRefreshTimer = null;
  #pendingSpaRefresh = null;
  #pendingSpaRefreshReason = "";

  // 绑定后的 handler 必须稳定保存，才能在 stop/restart 时准确 remove。
  #innerMessageHandler = null;
  #browserMessageHandler = null;
  #windowMessageHandler = null;
  #pageRestoreHandler = null;
  #spaNavigationHandler = null;

  // 运行期子模块实例。它们可能挂载 DOM，因此随 restart 销毁并重建。
  _translator = null;
  _transboxManager = null;
  _inputTranslator = null;
  _popupManager = null;
  _fabManager = null;

  /**
   * 保存启动参数并绑定全局 handler。
   *
   * 不在构造函数里创建 Translator/FAB/Popup 等运行期模块，避免
   * 构造即挂载 DOM。这样 body/html 被 SPA 替换后，可以通过 restart()
   * 只重建运行期模块，而不重复注册全局消息、快捷键和菜单。
   */
  constructor({
    setting,
    rule,
    fabConfig,
    favWords,
    isIframe,
    isUserscript,
    transboxOnly = false,
  }) {
    this.#setting = this.#cloneConfig(setting);
    this.#rule = this.#cloneConfig(rule);
    this.#fabConfig = this.#cloneConfig(fabConfig);
    this.#favWords = this.#cloneConfig(favWords);
    this.#isIframe = isIframe;
    this.#isUserscript = isUserscript;
    this.#transboxOnly = transboxOnly;

    this.#innerMessageHandler = this.#handleInnerMessage.bind(this);
    this.#browserMessageHandler = this.#handleBrowserMessage.bind(this);
    this.#windowMessageHandler = this.#handleWindowMessage.bind(this);
    this.#pageRestoreHandler = this.#handlePageRestore.bind(this);
    this.#spaNavigationHandler = this.#handleSpaNavigation.bind(this);
  }

  /**
   * 启动前台翻译业务。
   *
   * start 注册全局通信、快捷入口和 SPA 监听，并创建运行期子模块。
   * start 是幂等的；重复调用只记录日志，不会重复注册监听器。
   */
  start() {
    if (this.#isActive) {
      logger.info("TranslatorManager is already started.");
      return;
    }

    this.#createRuntimeModules();
    this.#setupMessageListeners();
    if (!this.#transboxOnly) {
      this.#setupTouchOperations();
    }

    if (!this.#transboxOnly && !this.#isIframe && this.#isUserscript) {
      this.#registerShortcuts();
      this.#registerMenus();
    }

    if (!this.#transboxOnly) {
      this.#setupSpaListeners();
    }
    this.#isActive = true;
    logger.info("TranslatorManager started.");
  }

  /**
   * 重启运行期子模块，用于 SPA 替换 body/html 后重新挂载。
   *
   * restart 不会重新注册全局消息监听、快捷键、触屏手势或油猴菜单。
   * 它只快照当前运行期状态，销毁挂 DOM 的子模块，再用快照创建新实例。
   * 这能保留用户当前的翻译开关、划词翻译开关和输入框翻译开关。
   */
  restart(reason = "spa-navigation") {
    if (!this.#isActive) {
      logger.info("TranslatorManager is not running.");
      return;
    }

    // 必须在 destroy 前快照：Translator.stop() 会把实例内 rule.transOpen 改成 false。
    const state = this.#snapshotRuntimeState();
    this.#destroyRuntimeModules();

    this.#setting = state.setting;
    this.#rule = state.rule;
    this.#fabConfig = state.fabConfig;
    this.#favWords = state.favWords;

    this.#createRuntimeModules();
    this.#refreshDocumentElementObserver();
    logger.info(`TranslatorManager restarted: ${reason}`);
  }

  /**
   * 停止前台翻译业务并释放所有注册项。
   *
   * stop 会清理 SPA timer/observer、全局通信监听、快捷键、触屏手势、
   * 油猴菜单和运行期子模块。stop 后 body/html 变化不应再触发 restart。
   */
  stop() {
    if (!this.#isActive) {
      logger.info("TranslatorManager is not running.");
      return;
    }

    this.#clearSpaRefreshTimer();
    this.#teardownSpaListeners();

    window.removeEventListener(
      EVENT_KISS_TRANSLATOR,
      this.#windowMessageHandler
    );
    if (this.#isUserscript) {
      window.removeEventListener("message", this.#innerMessageHandler);
    } else {
      browser.runtime.onMessage.removeListener(this.#browserMessageHandler);
      if (this.#isIframe) {
        window.removeEventListener("message", this.#innerMessageHandler);
      }
    }

    this.#clearShortcuts.forEach((clear) => clear());
    this.#clearShortcuts = [];

    this.#clearTouchListeners.forEach((clear) => clear());
    this.#clearTouchListeners = [];

    if (globalThis.GM && this.#menuCommandIds.length > 0) {
      this.#menuCommandIds.forEach((id) => GM.unregisterMenuCommand?.(id));
      this.#menuCommandIds = [];
    }

    this.#destroyRuntimeModules();
    this.#isActive = false;
    logger.info("TranslatorManager stopped.");
  }

  /**
   * 创建所有会读写页面 DOM 或注册局部状态的运行期子模块。
   *
   * 每个子模块拿到的都是独立配置副本，避免子模块内部修改状态时污染
   * manager 保存的基线快照；restart 时会用当前运行期 getter 重新同步。
   */
  #createRuntimeModules() {
    if (this.#transboxOnly) {
      this._transboxManager = new TransboxManager(
        this.#cloneConfig(this.#setting)
      );
      return;
    }

    this._translator = new Translator({
      rule: this.#cloneConfig(this.#rule),
      setting: this.#cloneConfig(this.#setting),
      favWords: this.#cloneConfig(this.#favWords),
      isUserscript: this.#isUserscript,
      isIframe: this.#isIframe,
    });

    this._transboxManager = new TransboxManager(
      this.#cloneConfig(this.#setting)
    );

    // iframe 内只跑核心翻译，不创建顶层页面专属交互 UI。
    if (!this.#isIframe) {
      this._inputTranslator = new InputTranslator(
        this.#cloneConfig(this.#setting)
      );
      this._popupManager = new PopupManager({
        translator: this._translator,
        processActions: this.#processActions.bind(this),
      });
      this._fabManager = new FabManager({
        processActions: this.#processActions.bind(this),
        fabConfig: this.#cloneConfig(this.#fabConfig),
      });
    }
  }

  /**
   * 销毁运行期子模块，并清空引用以帮助 GC。
   *
   * 这里不清理全局消息、快捷键和菜单；那些属于 start/stop 生命周期。
   * restart 只调用本方法，避免重复注册全局入口。
   */
  #destroyRuntimeModules() {
    this._popupManager?.destroy();
    this._fabManager?.destroy();
    this._transboxManager?.disable();
    this._inputTranslator?.disable();
    this._translator?.stop();

    this._translator = null;
    this._transboxManager = null;
    this._inputTranslator = null;
    this._popupManager = null;
    this._fabManager = null;
  }

  /**
   * 克隆配置对象，隔离 manager 快照和子模块运行期可变状态。
   *
   * 优先使用 structuredClone 以保留更多数据类型；如果宿主不支持或克隆
   * 失败，则回退到 JSON clone。本项目当前配置主要是普通 JSON 数据。
   */
  #cloneConfig(value) {
    if (value == null) return value;
    if (typeof globalThis.structuredClone === "function") {
      try {
        return globalThis.structuredClone(value);
      } catch (err) {
        logger.debug("structuredClone failed, using JSON clone.", err);
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * 从当前运行期实例读取最新状态，作为 restart 重建子模块的输入。
   *
   * Translator 的 getter 会返回当前 rule/setting 的副本，所以可保留
   * 用户在页面内切换过的全文翻译、划词翻译、输入框翻译等开关。
   */
  #snapshotRuntimeState() {
    return {
      setting: this.#cloneConfig(this._translator?.setting || this.#setting),
      rule: this.#cloneConfig(this._translator?.rule || this.#rule),
      fabConfig: this.#cloneConfig(this.#fabConfig),
      favWords: this.#cloneConfig(this.#favWords),
    };
  }

  /**
   * 注册 SPA 相关监听。
   *
   * 采用两层策略：
   * - document/documentElement 的 MutationObserver 发现 body/html 替换时 restart；
   * - pageshow/turbo 事件没有替换容器时只 rescan，修复 BFCache/Turbo 状态过期。
   */
  #setupSpaListeners() {
    this.#documentObserver = new MutationObserver(() => {
      this.#handleDocumentContainerMutation("document");
    });
    // 监听 document 的直接子节点，用于捕捉 documentElement/html 被替换。
    this.#documentObserver.observe(document, { childList: true });

    this.#refreshDocumentElementObserver();
    window.addEventListener("pageshow", this.#pageRestoreHandler);
    document.addEventListener(
      "turbo:frame-load",
      this.#spaNavigationHandler,
      true
    );
  }

  /**
   * 注销 SPA 监听并清空当前已知容器引用。
   */
  #teardownSpaListeners() {
    this.#documentObserver?.disconnect();
    this.#documentObserver = null;

    this.#documentElementObserver?.disconnect();
    this.#documentElementObserver = null;

    this.#knownDocumentElement?.removeEventListener(
      "turbo:load",
      this.#spaNavigationHandler
    );
    this.#knownDocumentElement = null;
    this.#knownBody = null;

    window.removeEventListener("pageshow", this.#pageRestoreHandler);
    document.removeEventListener(
      "turbo:frame-load",
      this.#spaNavigationHandler,
      true
    );
  }

  /**
   * 重新绑定当前 documentElement 上的 body 观察器和 turbo:load 监听。
   *
   * body/html 被替换后，旧 documentElement 上的监听器已经不再可靠；
   * restart 完成后必须刷新已知引用和 observer。
   */
  #refreshDocumentElementObserver() {
    this.#documentElementObserver?.disconnect();
    this.#documentElementObserver = null;

    this.#knownDocumentElement?.removeEventListener(
      "turbo:load",
      this.#spaNavigationHandler
    );

    // 这两个引用是判断“容器是否真的被替换”的基准。
    this.#knownDocumentElement = document.documentElement;
    this.#knownBody = document.body;

    if (!this.#knownDocumentElement) return;

    this.#knownDocumentElement.addEventListener(
      "turbo:load",
      this.#spaNavigationHandler
    );
    this.#documentElementObserver = new MutationObserver(() => {
      this.#handleDocumentContainerMutation("documentElement");
    });
    // 监听 documentElement 的直接子节点，用于捕捉 body 被整体替换。
    this.#documentElementObserver.observe(this.#knownDocumentElement, {
      childList: true,
    });
  }

  /**
   * 处理 DOM 容器观察事件。
   *
   * MutationObserver 会因任意直接子节点变化触发；只有 body/html 引用变化
   * 才说明运行期 DOM 挂载点失效，需要重启子模块。
   */
  #handleDocumentContainerMutation(reason) {
    if (this.#hasDocumentContainerChanged()) {
      this.#scheduleSpaRefresh("restart", reason);
    }
  }

  /**
   * BFCache 恢复处理。
   *
   * 普通首次 pageshow 不需要处理；persisted=true 表示从 BFCache 恢复，
   * content script 不会重新执行，但 Translator 的内部扫描状态可能过期。
   */
  #handlePageRestore(event) {
    if (event.type === "pageshow" && event.persisted !== true) return;
    this.#scheduleSpaRefresh("rescan", event.type);
  }

  /**
   * Turbo 导航完成处理。
   *
   * Turbo 事件本身不一定替换 body/html，因此默认只请求 rescan。
   * 如果同一轮事件里观察到容器替换，调度器会自动升级为 restart。
   */
  #handleSpaNavigation(event) {
    this.#scheduleSpaRefresh("rescan", event.type);
  }

  /**
   * 合并 SPA 刷新请求，并保证 restart 优先于 rescan。
   *
   * 同一次前进/后退可能连续触发 turbo:load、turbo:frame-load、
   * pageshow 和 MutationObserver。这里用 0ms timer 将它们合并，
   * 避免重复 rescan/restart。
   */
  #scheduleSpaRefresh(type, reason) {
    if (!this.#isActive) return;

    if (this.#spaRefreshTimer) {
      clearTimeout(this.#spaRefreshTimer);
      this.#spaRefreshTimer = null;
    }

    // 一旦出现 restart 请求，本轮调度不能被后续 rescan 降级。
    if (type === "restart" || this.#pendingSpaRefresh !== "restart") {
      this.#pendingSpaRefresh = type;
      this.#pendingSpaRefreshReason = reason;
    }

    if (type === "restart") {
      this.#pendingSpaRefreshReason = reason;
    }

    this.#spaRefreshTimer = setTimeout(() => {
      const refreshType = this.#pendingSpaRefresh;
      const refreshReason = this.#pendingSpaRefreshReason;
      this.#spaRefreshTimer = null;
      this.#pendingSpaRefresh = null;
      this.#pendingSpaRefreshReason = "";

      if (!this.#isActive) return;

      if (refreshType === "restart" || this.#hasDocumentContainerChanged()) {
        this.restart(refreshReason);
        return;
      }

      this._translator?.rescan();
      logger.info(`TranslatorManager rescanned: ${refreshReason}`);
    }, 0);
  }

  /**
   * 清理尚未执行的 SPA 刷新任务。
   */
  #clearSpaRefreshTimer() {
    if (!this.#spaRefreshTimer) return;

    clearTimeout(this.#spaRefreshTimer);
    this.#spaRefreshTimer = null;
    this.#pendingSpaRefresh = null;
    this.#pendingSpaRefreshReason = "";
  }

  /**
   * 判断当前页面根容器是否已被替换。
   */
  #hasDocumentContainerChanged() {
    return (
      document.documentElement !== this.#knownDocumentElement ||
      document.body !== this.#knownBody
    );
  }

  /**
   * 根据运行环境注册消息通道。
   *
   * Userscript 环境通过 window message 通信；扩展环境通过 runtime.onMessage
   * 接收 background 指令，iframe 中还要监听父页面转发的 window message。
   */
  #setupMessageListeners() {
    if (this.#isUserscript) {
      window.addEventListener("message", this.#innerMessageHandler);
    } else {
      browser.runtime.onMessage.addListener(this.#browserMessageHandler);
      if (this.#isIframe) {
        window.addEventListener("message", this.#innerMessageHandler);
      }
    }

    window.addEventListener(EVENT_KISS_TRANSLATOR, this.#windowMessageHandler);
  }

  /**
   * 根据设置注册触屏手势。
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

  /**
   * 处理同窗口 CustomEvent 通信。
   */
  #handleWindowMessage(event) {
    logger.debug("handle window message:", event);
    this.#processActions(event.detail);
  }

  /**
   * 处理 iframe 或页面内 postMessage 通信。
   */
  #handleInnerMessage(event) {
    this.#processActions(event.data);
  }

  /**
   * 处理扩展 background 发送的 runtime 消息。
   */
  #handleBrowserMessage(message, sender, sendResponse) {
    const result = this.#processActions(message, true);
    const response = result || {
      rule: this._translator?.rule || this.#rule,
      setting: this._translator?.setting || this.#setting,
    };
    sendResponse(response);
    return true;
  }

  /**
   * 注册页面级快捷键，并保存每个快捷键的清理函数。
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
   * 注册油猴菜单命令。
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
   * 翻译动作分发入口。
   *
   * 顶层页面发起的动作会同步广播给 iframe；来自扩展 background 的动作
   * 已经是统一入口，不再二次广播，避免 iframe 收到重复指令。
   */
  #processActions({ action, args } = {}, fromExt = false) {
    if (!action) return;

    // 非 background 指令需要主动同步给子 iframe，保持多 frame 页面状态一致。
    if (!fromExt) {
      sendIframeMsg(action, args);
    }

    logger.debug("process action:", action, args);

    switch (action) {
      case MSG_TRANS_TOGGLE:
        this._translator?.toggle();
        break;
      case MSG_TRANS_TOGGLE_ONLY:
        this._translator?.toggleTransOnly();
        break;
      case MSG_TRANS_TOGGLE_STYLE:
        this._translator?.toggleStyle();
        break;
      case MSG_TRANS_GETRULE:
        break;
      case MSG_TRANS_PUTRULE:
        this._translator?.updateRule(args);
        break;
      case MSG_OPEN_TRANBOX:
        document.dispatchEvent(
          new CustomEvent(EVENT_KISS_INNER, {
            detail: { action: MSG_OPEN_TRANBOX, args },
          })
        );
        break;
      case MSG_POPUP_TOGGLE:
        this._popupManager?.toggle();
        break;
      case MSG_TRANSBOX_TOGGLE:
        this._transboxManager?.toggle();
        this._translator?.toggleTransbox();
        break;
      case MSG_MOUSEHOVER_TOGGLE:
        this._translator?.toggleMouseHover();
        break;
      case MSG_TRANSINPUT_TOGGLE:
        this._inputTranslator?.toggle();
        this._translator?.toggleInputTranslate();
        break;
      case MSG_HOVERNODE_TOGGLE:
        this._translator?.toggleHoverNode();
        break;
      case MSG_INPUT_TRANSLATE:
        this._inputTranslator?.handleTranslate();
        break;
      default:
        logger.info(`Message action is unavailable: ${action}`);
        return { error: `Message action is unavailable: ${action}` };
    }
  }
}
