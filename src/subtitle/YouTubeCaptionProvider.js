import { logger } from "../libs/log.js";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager.js";
import { YouTubeSubtitleList } from "./YouTubeSubtitleList.js";
import {
  MSG_XHR_DATA_YOUTUBE,
  APP_NAME,
  OPT_LANGS_TO_CODE,
  OPT_TRANS_MICROSOFT,
  OPT_LANGS_SPEC_DEFAULT,
  API_SPE_TYPES,
} from "../config";
import { sleep, downloadBlobFile } from "../libs/utils.js";
import { createLogoSVG } from "../libs/svg.js";
import { randomBetween } from "../libs/utils.js";
import { newI18n } from "../config";
import DomManager from "../libs/domManager.js";
import { Menus } from "./Menus.js";
import { buildBilingualVtt } from "./vtt.js";
import { getDocInfo } from "../libs/docInfo.js";
import { intelligentSentenceBreak } from "./sentenceBreaker.js";
import { isSubtitleModeEnabled } from "./modes.js";
import { clearMsgHistory } from "../apis/history.js";

const VIDEO_SELECT = "#container video";
const CONTORLS_SELECT = ".ytp-right-controls";
const YT_CAPTION_SELECT = "#ytp-caption-window-container";
const YT_AD_SELECT = ".video-ads";
const YT_SUBTITLE_BTN_SELECT = "button.ytp-subtitles-button";

class YouTubeCaptionProvider {
  // 扩展配置选项对象
  #setting = {};

  // 最终处理合并、翻译好的双语字幕数组（包含开始/结束时间、原文、翻译）
  #subtitles = [];
  // YouTube 返回的原生字幕事件流数据，直接保存以备重处理/降级使用
  #events = [];
  // 展平并排好序的细粒度单词级别字幕流
  #flatEvents = [];
  // 翻译处理进度百分比 (0-100)
  #progressedNum = 0;
  // 视频原字幕的源语言编码，默认 auto
  #fromLang = "auto";
  // 网页上下文及大模型提炼的大纲信息，辅助提高翻译专有名词与句式准确率
  #docInfo = {};
  // 原生视频的完整 shortDescription 描述文本
  #fullDescription = "";
  // 拦截到的原生字幕轨种类（'asr' 为自动生成语音识别，null 为普通人工上传）
  #interceptedCaptionKind = null;

  // 当前正在处理的字幕轨唯一标识 Key
  #processingId = null;
  // 递增的版本号，用于避免前一视频异步翻译返回污染当前新视频的竞态条件
  #processingVersion = 0;
  // 当前已成功激活并运行的字幕轨唯一标识 Key
  #activeTrackKey = null;

  // 控制双语字幕渲染、显示和位置计算的管理器实例
  #managerInstance = null;
  // 注入到 YouTube 右下角控制栏的 Extension 开关按钮 DOM 元素
  #toggleButton = null;
  // 控制菜单面板当前是否处于展开显示状态
  #isMenuShow = false;
  // 视频播放器画面上渲染的通知信息气泡 DOM 元素
  #notificationEl = null;
  // 自动隐藏通知气泡的定时器句柄
  #notificationTimeout = null;
  // 国际化文案翻译辅助函数
  #i18n = () => "";
  // 菜单界面的 DOM 挂载和状态管理器实例
  #menuManager = null;
  // YouTube 底部控制条原生字幕激活状态的 DOM 监听器
  #ytSubtitleStateObserver = null;

  // 挂载在视频右侧/下方的双语字幕列表面板管理器实例
  #subtitleListManager = null;

  constructor(setting = {}) {
    this.#setting = { ...setting, showOrigin: false };
    this.#i18n = newI18n(setting.uiLang || "zh");
  }

  get #videoId() {
    const docUrl = new URL(document.location.href);
    return docUrl.searchParams.get("v");
  }

  get #videoEl() {
    return document.querySelector(VIDEO_SELECT);
  }

  set #progressed(num) {
    this.#progressedNum = num;
    this.#updateMenuProps(); // 更新菜单 props
  }

  get #progressed() {
    return this.#progressedNum;
  }

  initialize() {
    // 监听来自网页（通常是拦截 YouTube 请求的注入脚本）的 message 事件，捕获原生字幕数据
    window.addEventListener("message", (event) => {
      if (event.data?.type === MSG_XHR_DATA_YOUTUBE) {
        const { url, response } = event.data;
        if (url && response) {
          this.#handleInterceptedRequest(url, response);
        }
      }
    });

    // 监听 YouTube 页面路由切换完成事件，重置当前视频的字幕状态与临时数据
    window.addEventListener("yt-navigate-finish", () => {
      logger.debug("Youtube Provider: yt-navigate-finish", this.#videoId);

      this.#destroyManager();
      clearMsgHistory(this.#setting.apiSlug);

      this.#subtitles = [];
      this.#events = [];
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#fromLang = "auto";
      this.#docInfo = {};
      this.#fullDescription = "";
      this.#interceptedCaptionKind = null;
      this.#processingId = null;
      this.#processingVersion += 1;
      this.#activeTrackKey = null;
      this.#updateMenuProps(); // 更新菜单 props
    });

    // 等待右侧控制栏元素加载完成，然后绑定字幕按钮状态监听并注入自定义双语字幕开关按钮
    this.#waitForElement(CONTORLS_SELECT, (ytControls) => {
      const ytSubtitleBtn = ytControls.querySelector(YT_SUBTITLE_BTN_SELECT);
      if (ytSubtitleBtn) {
        this.#observeYtSubtitleState(ytSubtitleBtn);
      }

      this.#injectToggleButton(ytControls);
    });

    // 等待广告容器加载完成，并开始监听广告状态，以进行静音跳过或降级控制
    this.#waitForElement(YT_AD_SELECT, (adContainer) => {
      this.#moAds(adContainer);
    });
  }

  /**
   * 建立对 YouTube 原生字幕按钮状态的 MutationObserver 观察器
   *
   * @private
   * @param {HTMLButtonElement} ytSubtitleBtn - YouTube 原生控制栏中的字幕切换按钮 DOM
   */
  #observeYtSubtitleState(ytSubtitleBtn) {
    this.#ytSubtitleStateObserver?.disconnect();
    this.#ytSubtitleStateObserver = new MutationObserver(() => {
      this.#syncYtSubtitleState(ytSubtitleBtn);
    });
    this.#ytSubtitleStateObserver.observe(ytSubtitleBtn, {
      attributes: true,
      attributeFilter: ["aria-pressed"], // 仅监听 aria-pressed 字幕开关属性的改变
    });
    this.#syncYtSubtitleState(ytSubtitleBtn);
  }

  /**
   * 同步本插件的双语字幕状态至原生的字幕开关属性
   * 当原生字幕被按下激活时，启动本插件双语字幕渲染器；反之则销毁它以退回原生显示
   *
   * @private
   * @param {HTMLButtonElement} ytSubtitleBtn - YouTube 原生字幕按钮 DOM
   */
  #syncYtSubtitleState(ytSubtitleBtn) {
    if (ytSubtitleBtn.getAttribute("aria-pressed") === "true") {
      this.#startManager();
    } else {
      this.#destroyManager();
    }
  }

  /**
   * 检测当前 YouTube 视频上原生字幕按钮是否处于开启状态
   *
   * @private
   * @returns {boolean} 开启返回 true，未开启或找不到按钮返回 false
   */
  #isYtSubtitleEnabled() {
    const ytSubtitleBtn = document.querySelector(YT_SUBTITLE_BTN_SELECT);
    return (
      !ytSubtitleBtn || ytSubtitleBtn.getAttribute("aria-pressed") === "true"
    );
  }

  // 监听 YouTube 广告播放状态的 MutationObserver
  #moAds(adContainer) {
    const adLayoutSelector = ".ytp-ad-player-overlay-layout";
    const skipBtnSelector =
      ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern";
    const observer = new MutationObserver((mutations) => {
      const { skipAd = false } = this.#setting;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const videoEl = this.#videoEl;
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            // 检测到 YouTube 广告图层开始挂载渲染
            if (node.matches(adLayoutSelector)) {
              logger.debug("Youtube Provider: AD start playing!", node);
              // 如果开启了跳过广告，临时将播放速度拉至 16 倍并强跳到视频末尾，实现广告的瞬间快进
              if (videoEl && skipAd) {
                // REVIEW: 直接将播放速度设置为 16 倍，并跳转到终点，这在现代 YouTube 广告拦截检测机制中可能会触发风控。
                // REVIEW: 此外，当广告结束重置回 1 时，忽略了用户原本自定义的播放速度设置（例如 1.5x、2.0x），导致用户体验受损。
                videoEl.playbackRate = 16;
                videoEl.currentTime = videoEl.duration;
              }
              if (this.#managerInstance) {
                this.#managerInstance.setIsAdPlaying(true);
              }
            } else if (node.matches(skipBtnSelector) && skipAd) {
              // 检测到传统跳过按钮出现时直接点击
              logger.debug("Youtube Provider: AD skip button!", node);
              node.click();
            }

            if (skipAd) {
              const skipBtn = node?.querySelector(skipBtnSelector);
              if (skipBtn) {
                logger.debug("Youtube Provider: AD skip button!!", skipBtn);
                skipBtn.click();
              }
            }
          });
          mutation.removedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            // 广告图层卸载，标志着广告播放结束，恢复原片播放状态
            if (node.matches(adLayoutSelector)) {
              logger.debug("Youtube Provider: Ad ends!");

              // 若配置是不展示原字幕，在广告播完后重新隐藏 YouTube 原生自带字幕窗口
              if (!this.#setting.showOrigin) {
                this.#hideYtCaption();
              }
              if (videoEl && skipAd) {
                // REVIEW: 此处将倍速强制重置为 1，可能会覆盖用户的自定义倍速。建议在广告开始时保存原倍速并在结束时恢复。
                videoEl.playbackRate = 1;
              }
              if (this.#managerInstance) {
                this.#managerInstance.setIsAdPlaying(false);
              }
            }
          });
        }
      }
    });

    observer.observe(adContainer, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * 异步等待目标 DOM 元素挂载并执行回调的通用观察器
   *
   * @private
   * @param {string} selector - CSS 选择器
   * @param {function(HTMLElement): void} callback - 找到元素后的回调函数，参数为定位到的 DOM 节点
   */
  #waitForElement(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
      callback(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const targetNode = document.querySelector(selector);
      if (targetNode) {
        obs.disconnect(); // 找到节点后立即断开观察器，避免重复执行与内存占用
        callback(targetNode);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * 外部 UI 设置变更响应总入口
   * 当用户在浮动面板或侧边栏切换选项（例如断句引擎、双语开关、模糊翻译）时调用
   *
   * @public
   * @param {object} param0
   * @param {string} param0.name - 设置项属性键名
   * @param {*} param0.value - 设置项的新值
   */
  updateSetting({ name, value }) {
    if (this.#setting[name] === value) return;

    logger.debug("Youtube Provider: update setting", name, value);
    this.#setting[name] = value;

    this.#updateMenuProps(); // 更新快捷设置菜单对应的 React 状态

    // 动态分流响应配置变更
    if (name === "isBilingual" || name === "blurTranslation") {
      this.#managerInstance?.updateSetting({ [name]: value });
    } else if (name === "segSlug") {
      this.#reProcessEvents(); // 断句服务变更：重新断句分段
    } else if (name === "showOrigin") {
      this.#toggleShowOrigin(); // 隐藏/恢复双语字幕渲染
    } else if (name === "aiContextSlug") {
      this.#reProcessEventsWithContext(); // 重新加载 AI 上下文分析
    } else if (name === "showLoadNotification" && value === false) {
      this.#hideNotification(); // 关闭通知展示
    }
  }

  /**
   * 根据“显示原版字幕”的切换配置，执行字幕渲染管理器的挂载与销毁
   *
   * @private
   */
  #toggleShowOrigin() {
    if (this.#setting.showOrigin) {
      this.#destroyManager();
    } else {
      this.#startManager();
    }
  }

  /**
   * 将当前翻译组装完毕的双语字幕打包为 VTT 格式文件，并唤起浏览器下载
   *
   * @public
   */
  downloadSubtitle() {
    if (!this.#subtitles.length || this.#progressed !== 100) {
      logger.debug("Youtube Provider: The subtitle is not yet ready.");
      return;
    }

    try {
      const vtt = buildBilingualVtt(this.#subtitles);
      downloadBlobFile(
        vtt,
        `kiss-subtitles-${this.#videoId}_${Date.now()}.vtt`
      );
    } catch (error) {
      logger.info("Youtube Provider: download subtitles:", error);
    }
  }

  /**
   * 获取菜单组件的 props
   * @private
   */
  #getMenuProps() {
    const {
      transApis,
      segSlug,
      skipAd,
      isBilingual,
      blurTranslation,
      showOrigin,
      aiContextSlug,
    } = this.#setting;
    return {
      i18n: this.#i18n,
      updateSetting: this.updateSetting.bind(this),
      downloadSubtitle: this.downloadSubtitle.bind(this),
      transApis,
      progressed: this.#progressedNum,
      formData: {
        segSlug,
        skipAd,
        isBilingual,
        blurTranslation,
        showOrigin,
        aiContextSlug,
      },
    };
  }

  /**
   * 更新菜单组件的 props
   * @private
   */
  #updateMenuProps() {
    if (this.#menuManager && this.#isMenuShow) {
      this.#menuManager.updateProps(this.#getMenuProps());
    }
  }

  #injectToggleButton(ytControls) {
    const kissControls = document.createElement("div");
    kissControls.className = "notranslate kiss-subtitle-controls";
    Object.assign(kissControls.style, {
      height: "100%",
      position: "relative",
    });

    const toggleButton = document.createElement("button");
    toggleButton.className = "ytp-button kiss-subtitle-button";
    toggleButton.title = APP_NAME;

    toggleButton.appendChild(createLogoSVG());
    kissControls.appendChild(toggleButton);

    // 使用新的 DomManager 替代 ShadowDomManager
    this.#menuManager = new DomManager({
      id: "kiss-subtitle-menus",
      className: "notranslate",
      reactComponent: Menus,
      rootElement: kissControls,
      props: this.#getMenuProps(), // 获取菜单 props
    });

    toggleButton.onclick = () => {
      if (!this.#isMenuShow) {
        this.#isMenuShow = true;
        this.#toggleButton?.replaceChildren(
          createLogoSVG({ isSelected: true })
        );
        this.#menuManager.show();
        this.#updateMenuProps(); // 显示时更新 props
      } else {
        this.#isMenuShow = false;
        this.#toggleButton?.replaceChildren(createLogoSVG());
        this.#menuManager.hide();
      }
    };
    this.#toggleButton = toggleButton;

    ytControls?.prepend(kissControls);
  }

  // 简易判断两种语言编码是否属于同一种语言的大类（如 zh-CN 与 zh-TW 均视为 zh）
  #isSameLang(lang1, lang2) {
    if (!lang1 || !lang2) return false;
    return lang1.slice(0, 2) === lang2.slice(0, 2);
  }

  // 检测字幕轨是否是 Live Chat（弹幕）类型，这类字幕轨无需翻译
  #isChatCaptionTrack(track) {
    if (!track) return false;
    const name = track.name?.simpleText || track.name?.runs?.[0]?.text || "";
    return /chat/i.test(name);
  }

  // 根据 URL 的 Query 参数拼接字幕轨的唯一哈希 Key
  #buildTrackKey(potUrl) {
    const p = potUrl.searchParams;
    return [
      p.get("v") || "",
      p.get("lang") || "",
      p.get("kind") || "",
      p.get("name") || "",
      p.get("tlang") || "",
    ].join("|");
  }

  // 比对版本号检查该异步处理线程是否因为用户切视频/切字幕而过期失效
  #isStaleProcessing(version) {
    return version !== this.#processingVersion;
  }

  // 寻找与当前拦截到的网络请求最匹配的 YouTube 字幕配置项
  // todo: 优化逻辑
  #findCaptionTrack(captionTracks, lang, kind) {
    logger.debug("Youtube Provider: find caption track", {
      captionTracks,
      lang,
      kind,
    });

    if (!captionTracks?.length) {
      return null;
    }

    // 优先匹配用户选择的字幕轨（语言+kind完全一致）
    // 手动字幕没有 kind 字段，统一转成 null，避免 undefined !== null 导致无法匹配
    let captionTrack = captionTracks.find(
      (item) =>
        item.languageCode === lang && (item.kind || null) === (kind || null)
    );
    if (!captionTrack) {
      captionTrack = captionTracks.find((item) => item.languageCode === lang);
    }
    if (!captionTrack) {
      const asrTrack = captionTracks.find((item) => item.kind === "asr");
      if (asrTrack) {
        captionTrack = captionTracks.find(
          (item) =>
            item.kind !== "asr" &&
            this.#isSameLang(item.languageCode, asrTrack.languageCode)
        );
        if (!captionTrack) {
          captionTrack = asrTrack;
        }
      }
    }

    if (!captionTrack) {
      // REVIEW: 直接使用 pop() 会修改原始的 captionTracks 数组，如果该数组在其他地方被共享或复用，可能导致副作用。建议使用下标或克隆数组。
      captionTrack = captionTracks.pop();
    }

    // Chat/弹幕字幕轨道自动降级为正常字幕轨道
    if (captionTrack && this.#isChatCaptionTrack(captionTrack)) {
      logger.debug(
        "Youtube Provider: detected chat subtitle track, switching to normal subtitle"
      );

      const nonChatSameLang = captionTracks.find(
        (item) =>
          this.#isSameLang(item.languageCode, lang) &&
          !this.#isChatCaptionTrack(item)
      );

      if (nonChatSameLang) {
        logger.debug(
          "Youtube Provider: switched to same-language non-chat track"
        );
        captionTrack = nonChatSameLang;
      } else {
        const anyNonChat = captionTracks.find(
          (item) => !this.#isChatCaptionTrack(item)
        );
        if (anyNonChat) {
          logger.debug("Youtube Provider: switched to fallback non-chat track");
          captionTrack = anyNonChat;
        }
      }
    }

    return captionTrack;
  }

  // 请求 YouTube 页面抓取 html 内容并解析视频对应的所有可选字幕轨和原描述
  async #getCaptionTracks(videoId) {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      // REVIEW: 每次处理字幕都要重新对完整播放页面进行 fetch 拉取并正则匹配 ytInitialPlayerResponse。
      // REVIEW: 这会造成二次网页下载，耗费不必要的网络带宽，且可能在高频使用时被 YouTube 判定为异常流量实施人机验证。
      // REVIEW: 推荐优先从当前页面的全局对象（如 window.ytInitialPlayerResponse）或 YouTube 客户端内部 API 中读取。
      const html = await fetch(url).then((r) => r.text());
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
      if (!match) return {};
      const data = JSON.parse(match[1]);
      return {
        captionTracks:
          data.captions?.playerCaptionsTracklistRenderer?.captionTracks,
        fullDescription: data.videoDetails?.shortDescription || "",
      };
    } catch (err) {
      logger.info("Youtube Provider: get captionTracks", err);
      return {};
    }
  }

  // 获取字幕详细事件数组（如果当前网络拦截的内容已符合要求则直接解析，否则发送额外请求）
  async #getSubtitleEvents(capUrl, potUrl, responseText) {
    if (
      !potUrl.searchParams.get("tlang") &&
      potUrl.searchParams.get("kind") === capUrl.searchParams.get("kind") &&
      this.#isSameLang(
        potUrl.searchParams.get("lang"),
        capUrl.searchParams.get("lang")
      )
    ) {
      try {
        const json = JSON.parse(responseText);
        return json?.events;
      } catch (err) {
        logger.info("Youtube Provider: parse responseText", err);
        return null;
      }
    }

    try {
      // REVIEW: 直接对 potUrl 实例的 searchParams 进行 delete/set 修改，这会产生就地修改副作用。如果该 URL 对象在其他地方有引用，会造成不可预测的影响。
      potUrl.searchParams.delete("tlang");
      potUrl.searchParams.delete("name");
      potUrl.searchParams.set("lang", capUrl.searchParams.get("lang"));
      potUrl.searchParams.set("fmt", "json3");
      if (capUrl.searchParams.get("kind")) {
        potUrl.searchParams.set("kind", capUrl.searchParams.get("kind"));
      } else {
        potUrl.searchParams.delete("kind");
      }

      const res = await fetch(potUrl.href);
      if (res?.ok) {
        const json = await res.json();
        return json?.events;
      }
      logger.info(`Youtube Provider: Failed to fetch subtitles: ${res.status}`);
      return null;
    } catch (error) {
      logger.info("Youtube Provider: fetching subtitles error", error);
      return null;
    }
  }

  #getChunkContext(chunks, chunkIndex, side, maxEvents = 3, maxChars = 240) {
    const NON_SPEECH_RE = /^\[.+\]$/i;
    const adj =
      side === "prev" ? chunks[chunkIndex - 1] : chunks[chunkIndex + 1];
    if (!adj?.length) return "";
    const picked =
      side === "prev" ? adj.slice(-maxEvents) : adj.slice(0, maxEvents);
    return picked
      .map((e) => String(e?.text ?? "").trim())
      .filter((t) => t && !NON_SPEECH_RE.test(t))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
  }

  /**
   * 通过大模型 AI 接口对字幕切片事件流进行“智能断句”与“辅助翻译”
   *
   * 详细解析设计意图与逻辑：
   * 1. 区分语音和非语音事件：
   *    在 timedtext 字幕流中，经常夹杂诸如 `[Music]`、`[Laughter]` 这种代表背景音效的文本。
   *    本函数预先用 `NON_SPEECH_RE` 正则提取非语音文本，将常规语音文本打包送给大模型处理，
   *    处理完后再将非语音文本无缝合并回队列中，节省 Token 并防范 AI 产生直译混淆。
   *
   * 2. 重试容错（Tail Retry）机制：
   *    大模型流式响应偶尔会因为到达最大输出限制（Max Tokens）或解析异常导致“半截截断”。
   *    如果 `maxEi`（最大被处理索引）小于 `speechEvents.length - 1`，说明有部分尾部文本被 AI 遗漏了。
   *    如果遗漏较小（<= 50%），则认定是小概率的截断误差，进行一次追加请求，并在 `prevContext` 中注入前一句，保证分词的语意连贯性。
   *
   * 3. 抹除直译结果（translation: ""）：
   *    因为用户可以独立配置“断句模型”（如 DeepSeek）和“翻译模型”（如 GPT-4）。
   *    当断句模型完成智能拆分句式后，其直译结果（translation）并非最终的翻译服务提供的，因此需清空，留给最终翻译服务渲染。
   *
   * @private
   */
  async #aiSegment({
    videoId,
    fromLang,
    toLang,
    chunkEvents,
    segApiSetting,
    prevContext = "",
    nextContext = "",
  }) {
    // 步骤 1: 声明非语音背景声效正则，用于剔除 [Music] 等无效 Token 块以防干扰 AI 分句并节省 Token
    const NON_SPEECH_RE = /^\[.+\]$/i;
    const speechEvents = []; // 存放正常人声语音文本事件
    const nonSpeechEvents = []; // 存放纯音效/背景音事件

    // 步骤 2: 遍历当前分块中的所有事件，进行语音与非语音分类
    for (const item of chunkEvents) {
      if (!item.text) continue;
      // 若匹配音效正则（如带中括号的文本），归入 nonSpeech，否则归入语音 speech 队列
      if (NON_SPEECH_RE.test(item.text.trim())) {
        nonSpeechEvents.push(item);
      } else {
        speechEvents.push(item);
      }
    }

    const toStandaloneSub = (e) => ({
      start: e.start,
      end: e.end,
      text: e.text,
      translation: e.text,
    });

    if (!speechEvents.length) return nonSpeechEvents.map(toStandaloneSub);

    try {
      const chunkSign = `${speechEvents[0].start} --> ${speechEvents[speechEvents.length - 1].end}`;
      logger.debug("Youtube Provider: aiSegment events", {
        videoId,
        chunkSign,
        fromLang,
        toLang,
        speechEvents,
      });
      const subtitles = await apiSubtitle({
        videoId,
        chunkSign,
        fromLang,
        toLang,
        events: speechEvents,
        apiSetting: segApiSetting,
        docInfo: this.#docInfo,
        prevContext,
        nextContext,
      });
      logger.debug("Youtube Provider: aiSegment subtitles", subtitles);
      if (Array.isArray(subtitles) && subtitles.length) {
        // 步骤 4: 检查断句 API。如果断句引擎和翻译引擎不是同一个服务（例如独立使用模型进行分句，但使用主翻译模型进行双语翻译），
        // 那么断句模型返回的直译结果需在此抹去，全部设置为空，留给后续正式翻译流程处理。
        let result = subtitles;
        if (segApiSetting.apiSlug !== this.#setting.apiSlug) {
          result = subtitles.map((sub) => ({ ...sub, translation: "" }));
        }

        // 步骤 5: 溢出截断容错与重试补救 (Tail Retry)
        // 大模型单次生成可能会漏掉最后几个词。我们获取 AI 返回字幕里记录的最大已被处理的原始事件索引 _ei。
        const maxEi = Math.max(...result.map((s) => s._ei ?? -1));

        // 如果 maxEi 小于事件队列总长度 - 1，代表存在尾部遗漏
        if (maxEi >= 0 && maxEi < speechEvents.length - 1) {
          const tailEvents = speechEvents.slice(maxEi + 1);
          // 仅当遗漏的事件较少（不超过 50%）时才启动追加重试，防止因服务彻底挂掉而陷入死循环
          if (tailEvents.length <= speechEvents.length * 0.5) {
            try {
              // 重新组装剩余部分的切片签名时间戳
              const tailSign = `${tailEvents[0].start} --> ${tailEvents[tailEvents.length - 1].end}`;
              const lastResultText = result[result.length - 1]?.text || "";

              // 发起二次请求。在 prevContext 中混入前一部分最后一句话作为暗示，确保发音分词连贯
              const tailSubs = await apiSubtitle({
                videoId,
                chunkSign: tailSign,
                fromLang,
                toLang,
                events: tailEvents,
                apiSetting: segApiSetting,
                docInfo: this.#docInfo,
                prevContext: [prevContext, lastResultText]
                  .filter(Boolean)
                  .join(" "),
                nextContext,
              });

              if (tailSubs?.length) {
                // 补救成功：将新老段落拼合
                result = [...result, ...tailSubs];
              } else {
                // 补救结果为空：直接使用内置启发式规则格式化剩余尾部，保证信息不丢失
                result = [
                  ...result,
                  ...this.#formatSubtitles(tailEvents, fromLang),
                ];
              }
            } catch {
              // 补救异常：直接降级使用内置算法切分剩余段落
              result = [
                ...result,
                ...this.#formatSubtitles(tailEvents, fromLang),
              ];
            }
          }
        }

        // 步骤 6: 重新将最开始被隔离清洗掉的音效块（非语音块）混入队列中
        // 过滤条件：仅保留时间戳未与任何已整理出的语音字幕发生时间交叉的音效节点，防止界面重合叠字
        const gapCues = nonSpeechEvents
          .filter(
            (ns) =>
              !result.some((sub) => ns.start < sub.end && ns.end > sub.start)
          )
          .map(toStandaloneSub);

        // 步骤 7: 将人声字幕与音效字幕合并，重新按照时间戳从前向后升序排序，输出最终断句成果
        return [...result, ...gapCues].sort((a, b) => a.start - b.start);
      }
    } catch (err) {
      logger.info("Youtube Provider: ai segmentation", err);
    }

    // 步骤 8: 彻底异常时的兜底：将清洗出的音效段落全部映射返回
    return nonSpeechEvents.map(toStandaloneSub);
  }

  #getFromLang(lang) {
    if (lang === "zh") {
      return "zh-CN";
    }

    return (
      OPT_LANGS_SPEC_DEFAULT.get(lang) ||
      OPT_LANGS_SPEC_DEFAULT.get(lang.slice(0, 2)) ||
      OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang) ||
      OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang.slice(0, 2)) ||
      "auto"
    );
  }

  async #handleInterceptedRequest(url, responseText) {
    const videoId = this.#videoId;
    if (!videoId) {
      logger.debug("Youtube Provider: videoId not found.");
      return;
    }

    const potUrl = new URL(url);
    // 确认拦截到的字幕请求属于当前正在播放的视频，否则忽略
    if (videoId !== potUrl.searchParams.get("v")) {
      logger.debug("Youtube Provider: skip other timedtext:", videoId);
      return;
    }

    const lang = potUrl.searchParams.get("lang");
    if (!lang) {
      logger.debug("Youtube Provider: timedtext lang not found:", url);
      return;
    }

    const interceptedKind = potUrl.searchParams.get("kind") || null;
    const trackKey = this.#buildTrackKey(potUrl);
    const fromLang = this.#getFromLang(lang);

    // 如果该字幕轨已经被处理过，或者正在被处理，则跳过以防重复请求
    if (this.#flatEvents.length && trackKey === this.#activeTrackKey) {
      logger.debug("Youtube Provider: track was processed:", trackKey);
      return;
    }

    if (this.#processingId === trackKey) {
      logger.debug("Youtube Provider: track is processing:", trackKey);
      return;
    }

    // 更新处理版本号，用于异步网络请求返回时的竞态判定（丢弃旧请求）
    const processingVersion = (this.#processingVersion += 1);
    this.#processingId = trackKey;

    // 清理先前视频的字幕状态
    if (this.#flatEvents.length) {
      this.#destroyManager();
      clearMsgHistory(this.#setting.apiSlug);
      this.#subtitles = [];
      this.#events = [];
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#activeTrackKey = null;
      this.#interceptedCaptionKind = null;
    }

    try {
      this.#showNotification(this.#i18n("starting_to_process_subtitle"));

      const { toLang } = this.#setting;
      // 异步获取 YouTube 网页中当前视频的所有字幕轨配置以及视频完整描述
      const { captionTracks, fullDescription } =
        await this.#getCaptionTracks(videoId);
      if (this.#isStaleProcessing(processingVersion)) return;

      this.#fullDescription = fullDescription || "";
      // 筛选出最适合的字幕轨（如优先选用户指定轨，或 ASR 自动生成轨）
      const captionTrack = this.#findCaptionTrack(
        captionTracks,
        lang,
        interceptedKind
      );
      if (!captionTrack) {
        logger.debug("Youtube Provider: CaptionTrack not found:", videoId);
        return;
      }
      if (!captionTrack.baseUrl.startsWith("https")) {
        captionTrack.baseUrl = window.location.origin + captionTrack.baseUrl;
      }
      const capUrl = new URL(captionTrack.baseUrl);
      // 拉取字幕详细事件，并保证格式转为 JSON3 标准格式
      const events = await this.#getSubtitleEvents(
        capUrl,
        potUrl,
        responseText
      );
      if (this.#isStaleProcessing(processingVersion)) return;

      if (!events?.length) {
        logger.debug("Youtube Provider: events not got:", videoId);
        return;
      }

      logger.debug(
        `Youtube Provider: lang: ${lang}, fromLang: ${fromLang}, toLang: ${toLang}`
      );
      // 如果源语言与目标翻译语言一致，则不执行翻译
      if (this.#isSameLang(fromLang, toLang)) {
        logger.debug("Youtube Provider: skip same lang", fromLang, toLang);
        this.#showNotification(this.#i18n("subtitle_same_lang"));
        return;
      }

      // 将零碎的字幕词块拍平（Flatten）并合并成易于处理的片段列表
      const flatEvents = this.#genFlatEvents(events);
      if (!flatEvents?.length) {
        logger.debug("Youtube Provider: flatEvents not got:", videoId);
        return;
      }
      if (this.#isStaleProcessing(processingVersion)) return;

      this.#events = events;
      this.#flatEvents = flatEvents;
      this.#fromLang = fromLang;
      this.#interceptedCaptionKind = interceptedKind;
      this.#activeTrackKey = trackKey;
      this.#docInfo = getDocInfo();
      // 使用 AI 生成视频的总结或上下文背景信息，用以增强翻译质量
      await this.#enrichDocInfoWithAI(flatEvents, processingVersion);
      if (this.#isStaleProcessing(processingVersion)) return;

      // 开始进行断句和翻译渲染流程
      this.#processEvents({
        videoId,
        flatEvents,
        fromLang,
        processingVersion,
      });
    } catch (error) {
      logger.warn("Youtube Provider: handle subtitle", error);
      this.#showNotification(this.#i18n("subtitle_load_failed"));
    } finally {
      if (
        !this.#isStaleProcessing(processingVersion) &&
        this.#processingId === trackKey
      ) {
        this.#processingId = null;
      }
    }
  }

  /**
   * 核心断句分句渲染调度器
   * 负责将展平后的 flatEvents 传递给断句流程，并启动 BilingualSubtitleManager 实例
   *
   * @private
   * @async
   * @param {object} param0
   * @param {string} param0.videoId - 当前视频 ID
   * @param {Array} param0.flatEvents - 展平清洗后的单词节点流
   * @param {string} param0.fromLang - 字幕源语言代码
   * @param {number} param0.processingVersion - 当前异步任务的版本号快照，用于过期检测
   */
  async #processEvents({ videoId, flatEvents, fromLang, processingVersion }) {
    try {
      // 将扁平化的字幕事件转化为结构化的字幕条目，并支持流式/异步增量获取
      const [subtitles, progressed] = await this.#eventsToSubtitles({
        videoId,
        events: this.#events,
        flatEvents,
        fromLang,
        processingVersion,
      });
      if (this.#isStaleProcessing(processingVersion)) return;

      if (!subtitles?.length) {
        logger.debug(
          "Youtube Provider: events to subtitles got empty",
          videoId
        );
        return;
      }

      // 再次确认在此异步阶段没有发生视频切换
      if (videoId !== this.#videoId) {
        logger.debug(
          "Youtube Provider: videoId changed!",
          videoId,
          this.#videoId
        );
        return;
      }

      this.#subtitles = subtitles;
      this.#progressed = progressed;

      // 启动双语字幕渲染管理器，控制页面双语字幕的显示与同步
      this.#startManager();
    } catch (error) {
      logger.info("Youtube Provider: process events", error);
      this.#showNotification(this.#i18n("subtitle_load_failed"));
    }
  }

  /**
   * 当用户更改了断句设置（如切换 AI/规则/统计断句）时，触发对现有字幕的重新处理与渲染
   *
   * @private
   */
  #reProcessEvents() {
    this.#progressed = 0;
    this.#subtitles = [];

    const videoId = this.#videoId;
    const flatEvents = this.#flatEvents;
    const fromLang = this.#fromLang;
    if (!videoId || !flatEvents.length) {
      return;
    }

    this.#showNotification(this.#i18n("starting_reprocess_events"));

    const processingVersion = (this.#processingVersion += 1);
    this.#destroyManager();
    clearMsgHistory(this.#setting.apiSlug);

    this.#processEvents({ videoId, flatEvents, fromLang, processingVersion });
  }

  /**
   * 异步调用 AI 总结 API，提取视频的专有名词、主要大意及语境背景
   * 提取的信息将保存在 docInfo.summary 中，为之后的翻译步骤提供准确的上下文系统提示 (System Prompt Context)
   *
   * @private
   * @async
   * @param {Array} flatEvents - 展平后的原始字幕单词节点流，用以构成视频内容的文本概要
   * @param {number} processingVersion - 当前异步生命周期版本号，用于规避串视频的竞态
   */
  async #enrichDocInfoWithAI(flatEvents, processingVersion) {
    const { aiContextSlug, transApis } = this.#setting;

    // 检查是否启用了 AI 上下文分析
    if (!aiContextSlug || aiContextSlug === "-") return;
    if (this.#isStaleProcessing(processingVersion)) return;

    const contextApiSetting = transApis?.find(
      (api) => api.apiSlug === aiContextSlug
    );
    if (!contextApiSetting) return;
    if (!API_SPE_TYPES.ai.has(contextApiSetting.apiType)) return;

    // 截取前 8000 个字符作为 AI 提取上下文的依据（包含字幕前几分钟的文本）
    const transcript = flatEvents
      .map((e) => e.text)
      .filter(Boolean)
      .join(" ")
      .slice(0, 8000);

    if (transcript.length < 200) return;

    // 捕获当前视频快照，防止异步返回时污染其他视频的上下文
    const videoId = this.#videoId;
    const docInfo = this.#docInfo;

    try {
      this.#showNotification(this.#i18n("ai_context_analyzing"));

      // 异步调用 AI 总结 API 生成视频大纲和主要词汇总结
      const summary = await apiSummarizeContext({
        videoId,
        title: docInfo.title,
        description: this.#fullDescription || docInfo.description,
        transcript,
        apiSetting: contextApiSetting,
      });

      // 保存分析生成的总结信息，会在之后的翻译 API 调用中作为 system prompt 上下文传入
      if (
        summary &&
        videoId === this.#videoId &&
        !this.#isStaleProcessing(processingVersion)
      ) {
        docInfo.summary = summary;
      }
    } catch (err) {
      logger.info("Youtube Provider: AI context enrichment failed", err);
    }
  }

  /**
   * 当用户更改了 AI 上下文引擎配置时，清空当前大纲记忆，并带上新上下文重新处理字幕事件
   *
   * @private
   * @async
   */
  async #reProcessEventsWithContext() {
    this.#progressed = 0;
    this.#subtitles = [];

    const videoId = this.#videoId;
    const flatEvents = this.#flatEvents;
    if (!videoId || !flatEvents.length) return;

    const processingVersion = (this.#processingVersion += 1);
    this.#destroyManager();
    clearMsgHistory(this.#setting.apiSlug);
    this.#docInfo = getDocInfo();
    await this.#enrichDocInfoWithAI(flatEvents, processingVersion);
    if (this.#isStaleProcessing(processingVersion)) return;
    this.#processEvents({
      videoId,
      flatEvents,
      fromLang: this.#fromLang,
      processingVersion,
    });
  }

  async #eventsToSubtitles({
    videoId,
    events,
    flatEvents,
    fromLang,
    processingVersion,
  }) {
    const { segSlug, transApis, chunkLength, toLang } = this.#setting;

    const segApiSetting = transApis?.find((api) => api.apiSlug === segSlug);
    const isAutoCaption = this.#interceptedCaptionKind === "asr";

    // 仅针对 YouTube 自动生成的 ASR 字幕轨，并且启用了 AI 智能分句服务时，才使用 AI 断句
    if (isAutoCaption && segSlug && segSlug !== "-" && segApiSetting) {
      if (this.#isStaleProcessing(processingVersion)) return [[], 0];
      logger.info("Youtube Provider: Starting AI segmentation...");
      this.#showNotification(this.#i18n("ai_processing_pls_wait"));

      // 将扁平化的字幕流根据 chunkLength 切分为多个片段块，便于分批向 AI 请求
      const eventChunks = this.#splitEventsIntoChunks(flatEvents, chunkLength);

      if (eventChunks.length === 0) {
        logger.info("Youtube Provider: AI no chunks, falling back to built-in");
        return [this.#builtinSegment(events, flatEvents, fromLang), 100];
      }

      // 优先处理第一个字幕分块，以实现极速首屏出字渲染
      const firstChunkEvents = eventChunks[0];
      const firstBatchSubtitles = await this.#aiSegment({
        videoId,
        chunkEvents: firstChunkEvents,
        fromLang,
        toLang,
        segApiSetting,
        prevContext: "",
        nextContext: this.#getChunkContext(eventChunks, 0, "next"),
      });
      if (this.#isStaleProcessing(processingVersion)) return [[], 0];

      if (!firstBatchSubtitles?.length) {
        logger.info("Youtube Provider: AI failed, falling back to built-in");
        return [this.#builtinSegment(events, flatEvents, fromLang), 100];
      }

      logger.info("Youtube Provider: Sentence break mode: AI");
      // 如果存在多个分块，第一块渲染后，在后台异步增量分块请求并追加剩余的字幕
      if (eventChunks.length > 1) {
        this.#processRemainingChunksAsync({
          chunks: eventChunks,
          startIndex: 1,
          videoId,
          fromLang,
          toLang,
          segApiSetting,
          processingVersion,
        });

        // 返回首屏数据及初始处理进度百分比
        const processed = Math.floor(100 / eventChunks.length);
        return [firstBatchSubtitles, processed];
      }
      return [firstBatchSubtitles, 100];
    }

    // 自动生成字幕但未开启 AI 断句，降级使用内置规则或统计算法断句
    if (isAutoCaption) {
      return [this.#builtinSegment(events, flatEvents, fromLang), 100];
    }

    // 人工上传的字幕（带有正常的标点和分句），直接过滤出有效文本即可
    logger.info(
      "Youtube Provider: Sentence break mode: MANUAL (human caption)"
    );
    return [flatEvents.filter((e) => e.text), 100];
  }

  // 内置兜底分句方法（选择统计算法智能分句或内置规则匹配）
  #builtinSegment(events, flatEvents, fromLang) {
    const { useAlgorithmBreaker } = this.#setting;

    if (useAlgorithmBreaker === "statistical") {
      logger.info("Youtube Provider: Sentence break mode: STATISTICAL");
      const result = this.#algorithmicSegment(events, fromLang);
      if (result?.length) return result;
      logger.info("Youtube Provider: Statistical segmentation returned empty");
      return [];
    }

    logger.info("Youtube Provider: Sentence break mode: RULE");
    return this.#formatSubtitles(flatEvents, fromLang);
  }

  // 基于启发式统计算法提取的智能分句逻辑
  #algorithmicSegment(events, fromLang) {
    try {
      const algorithmicSubtitles = intelligentSentenceBreak({ events });
      return algorithmicSubtitles.map((sub) => ({
        text: sub.text,
        start: sub.start,
        end: sub.end,
        translation: "",
      }));
    } catch (error) {
      logger.info("Youtube Provider: Error in algorithmic segmentation", error);
      return null;
    }
  }

  // 实例化双语字幕渲染管理器，并在页面和侧边栏初始化显示
  #startManager() {
    if (!this.#isYtSubtitleEnabled()) {
      return;
    }

    if (this.#managerInstance) {
      return;
    }

    if (this.#setting.showOrigin) {
      return;
    }

    if (!this.#subtitles.length) {
      this.#showNotification(this.#i18n("waitting_for_subtitle"));
      return;
    }

    const videoEl = this.#videoEl;
    if (!videoEl) {
      logger.warn("Youtube Provider: No video element found");
      return;
    }

    logger.info("Youtube Provider: Starting manager...");

    this.#managerInstance = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: this.#subtitles,
      setting: {
        ...this.#setting,
        fromLang: this.#fromLang,
        docInfo: this.#docInfo,
      },
    });

    // 监听字幕更新事件，将翻译后的字幕传递给字幕列表
    const showList = isSubtitleModeEnabled(
      this.#setting.showList,
      this.#setting.enhanceMode
    );

    if (showList && !this.#subtitleListManager) {
      // 初始化字幕列表管理器
      this.#subtitleListManager = new YouTubeSubtitleList(videoEl);
      this.#subtitleListManager.initialize(this.#subtitles);

      // 监听字幕更新事件，在字幕翻译完成后增量更新字幕列表
      this.#managerInstance.onSubtitleUpdate = (subtitleUpdate) => {
        this.#subtitleListManager.updateSingleSubtitle(subtitleUpdate);
      };

      // 创建包含翻译信息的双语字幕数据（初始可能没有翻译）
      const bilingualSubtitles = this.#subtitles.map((sub) => ({
        start: sub.start,
        end: sub.end,
        text: sub.text,
        translation: sub.translation || "",
      }));

      // 将双语字幕数据传递给字幕列表
      this.#subtitleListManager.setBilingualSubtitles(bilingualSubtitles);
      // 启动字幕列表自动滚动
      this.#subtitleListManager.turnOnAutoSub();
    }

    this.#managerInstance.start();

    this.#showNotification(this.#i18n("subtitle_load_succeed"));

    this.#hideYtCaption();
  }

  // 销毁双语字幕管理器以及字幕侧边栏，恢复网页原生字幕展示状态
  #destroyManager() {
    this.#showYtCaption();

    if (!this.#managerInstance) {
      return;
    }

    logger.info("Youtube Provider: Destroying manager...");

    this.#managerInstance.onSubtitleUpdate = null;
    this.#managerInstance.destroy();
    this.#managerInstance = null;

    // 销毁字幕列表
    if (this.#subtitleListManager) {
      this.#subtitleListManager.destroy();
      this.#subtitleListManager = null;
    }
  }

  // 将 YouTube 原生的字幕窗口通过定位隐藏在屏幕外
  #hideYtCaption() {
    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.top = "-10000px");
  }

  // 恢复 YouTube 原生字幕窗口在原位置显示
  #showYtCaption() {
    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.top = "0");
  }

  // 基础字幕格式化处理函数（支持按语言特性自适应分段）
  #formatSubtitles(flatEvents, lang) {
    if (!flatEvents?.length) return [];

    // 对于东亚无空格语系，由于无法根据空格分词，直接按最大字数（如30字）为阈值进行换行
    const noSpaceLanguages = [
      "zh", // 中文
      "ja", // 日文
      "ko", // 韩文（现代用空格，但结构上仍可连写）
      "th", // 泰文
      "lo", // 老挝文
      "km", // 高棉文
      "my", // 缅文
    ];

    if (noSpaceLanguages.some((l) => lang?.startsWith(l))) {
      const subtitles = [];

      // 质量异常检测：若出现较多超长单行，则不执行切分，直接保留原字幕事件
      if (this.#isQualityPoor(flatEvents, 5, 0.5)) {
        return flatEvents;
      }

      let currentLine = null;
      const MAX_LENGTH = 30;

      for (const segment of flatEvents) {
        if (segment.text) {
          if (!currentLine) {
            currentLine = {
              text: segment.text,
              start: segment.start,
              end: segment.end,
            };
          } else {
            currentLine.text += segment.text;
            currentLine.end = segment.end;
          }

          if (currentLine.text.length >= MAX_LENGTH) {
            subtitles.push(currentLine);
            currentLine = null;
          }
        } else {
          if (currentLine) {
            subtitles.push(currentLine);
            currentLine = null;
          }
        }
      }

      if (currentLine) {
        subtitles.push(currentLine);
      }

      return subtitles;
    }

    // 针对有空格分隔的语言（如英语/欧系语言），使用缓冲区单词与标点进行切分
    let subtitles = this.#processSubtitles({ flatEvents });

    // 超长单句的二次纠碎处理：防单句长度溢出影响用户排版体验
    const longSentenceThreshold = this.#setting.longSentenceThreshold ?? 120;
    const result = [];
    for (const sub of subtitles) {
      if (sub.text.length > longSentenceThreshold) {
        const subEvents = flatEvents.filter(
          (e) => e.start >= sub.start && e.start < sub.end
        );
        if (subEvents.length > 1) {
          logger.debug(
            "Youtube Provider: re-processing long sentence with pause",
            {
              length: sub.text.length,
              text: sub.text.slice(0, 50) + "...",
            }
          );
          const reProcessed = this.#processSubtitles({
            flatEvents: subEvents,
            usePause: true,
          });
          result.push(...reProcessed);
        } else {
          result.push(sub);
        }
      } else {
        result.push(sub);
      }
    }
    subtitles = result;

    return subtitles;
  }

  // 质量检测辅助方法：判断传入的一行或多行字幕是否是异常的长行，若长行占比过多，则视为源字幕排版质量极差，停止自动合并分段
  #isQualityPoor(lines, lengthThreshold = 200, percentageThreshold = 0.1) {
    if (lines.length === 0) return false;
    const longLinesCount = lines.filter(
      (line) => line.text.length > lengthThreshold
    ).length;
    logger.debug("Youtube Provider: quality check", {
      longLinesCount,
      totalLines: lines.length,
      percentage: longLinesCount / lines.length,
    });
    return longLinesCount / lines.length > percentageThreshold;
  }

  // 核心断句分行状态机算法（针对英文和欧系空格分隔语系）
  #processSubtitles({
    flatEvents,
    usePause = false,
    timeout = 1000,
    maxWords = 15,
    maxDurationMs = 10000,
  } = {}) {
    // REVIEW: 这里的 pause 连词词库完全硬编码为英文单词，对于西语、法语、德语等其他空格分隔语言，
    // REVIEW: 会因为词库不匹配而无法触发“在逻辑连词前切分”的逻辑。对于小语种的断句支持有局限性。
    const groupedPauseWords = {
      1: new Set([
        "actually",
        "also",
        "although",
        "and",
        "anyway",
        "as",
        "basically",
        "because",
        "but",
        "eventually",
        "frankly",
        "honestly",
        "hopefully",
        "however",
        "if",
        "instead",
        "it's",
        "just",
        "let's",
        "like",
        "literally",
        "maybe",
        "meanwhile",
        "nevertheless",
        "nonetheless",
        "now",
        "okay",
        "or",
        "otherwise",
        "perhaps",
        "personally",
        "probably",
        "right",
        "since",
        "so",
        "suddenly",
        "that's",
        "then",
        "there's",
        "therefore",
        "though",
        "thus",
        "unless",
        "until",
        "well",
        "while",
      ]),
      2: new Set([
        "after all",
        "at first",
        "at least",
        "even if",
        "even though",
        "for example",
        "for instance",
        "i believe",
        "i guess",
        "i mean",
        "i suppose",
        "i think",
        "in fact",
        "in the end",
        "of course",
        "then again",
        "to be fair",
        "you know",
        "you see",
      ]),
      3: new Set([
        "as a result",
        "by the way",
        "in other words",
        "in that case",
        "in this case",
        "to be clear",
        "to be honest",
      ]),
    };

    const sentences = [];
    let currentBuffer = [];
    let bufferWordCount = 0;

    // 清空缓冲区，将积累的单词拼接合并成一个字幕片段并加入结果列表
    const flushBuffer = () => {
      if (currentBuffer.length > 0) {
        sentences.push({
          text: currentBuffer
            .map((s) => s.text)
            .join(" ")
            .trim(),
          start: currentBuffer[0].start,
          end: currentBuffer[currentBuffer.length - 1].end,
        });
      }
      currentBuffer = [];
      bufferWordCount = 0;
    };

    flatEvents.forEach((segment) => {
      // 过滤空白片段，防止产生空白字幕行
      if (!segment.text) return;

      const lastSegment = currentBuffer[currentBuffer.length - 1];

      // 如果缓冲区中已有单词，评估当前词是否触发“断句分行”阈值
      if (lastSegment) {
        // 条件 A: 上一个词是以句尾结束标点（. ? ! … 右括号）结尾，说明是一句话的自然结束
        const isEndOfSentence = /[.?!…\])]$/.test(lastSegment.text);

        // 条件 B: 上一个词带有逗号（,），指示存在弱暂停
        const isPauseOfSentence = /[,]$/.test(lastSegment.text);

        // 条件 C: 音频流在两个单词间产生了大于 1000ms（或设定 timeout）的静音空白，说明有口语停顿
        const isTimeout = segment.start - lastSegment.end > timeout;

        // 条件 D: 当前缓冲区里字幕的物理总时长超过了最大限制（10 秒），强制切行防止长字幕霸屏
        const isDurationExceeded =
          segment.start - currentBuffer[0].start >= maxDurationMs;

        // 条件 E: 在弱暂停或连词停顿开启的状况下，当前累积单词数超出了最大词数限制（15词），强制折行保证排版美观
        const isWordLimitExceeded =
          (usePause || isPauseOfSentence) && bufferWordCount >= maxWords;

        // 条件 F: 当前单词以 `[` / `(` / `♪` 开头，一般代表换人说话、背景歌词或转场旁白，需在其前面强制换行
        const startsWithSign = /^[[(♪]/.test(segment.text);

        // 条件 G: 当前词是以 but, although, because 等逻辑连词开头，且当前缓存已不为空（避免句子过短），
        // 为了语意逻辑的清晰，在连词前方进行行切割
        const startsWithPauseWord =
          usePause &&
          groupedPauseWords["1"].has(
            segment.text.toLowerCase().split(" ")[0]
          ) &&
          currentBuffer.length > 1;

        // 如果触发了上述任一断句切割阈值，立刻把当前缓冲区的内容打包成字幕行刷出，并清空 buffer
        if (
          isEndOfSentence ||
          isTimeout ||
          isDurationExceeded ||
          isWordLimitExceeded ||
          startsWithSign ||
          startsWithPauseWord
        ) {
          flushBuffer();
        }
      }

      // 将当前扫描到的单词节点推入缓冲区，并累加单词长度
      currentBuffer.push(segment);
      bufferWordCount += segment.text.split(/\s+/).length;
    });

    // 扫描完毕后，将缓冲区内剩余的所有残留单词进行最终的刷出
    flushBuffer();

    return sentences;
  }

  // 将 YouTube events 格式 of 原始字幕流拍平并规范化为按单词/词组的起始/结束时间的扁平数组
  #genFlatEvents(events = []) {
    const segments = [];
    let buffer = null;

    events.forEach(({ segs = [], tStartMs = 0, dDurationMs = 0 }) => {
      segs.forEach(({ utf8 = "", tOffsetMs = 0 }, j) => {
        const text = utf8
          .replace(/<[^>]+>/g, "")
          .trim()
          .replace(/\s+/g, " ");
        const start = tStartMs + tOffsetMs;

        if (buffer) {
          if (!buffer.end || buffer.end > start) {
            buffer.end = start;
          }
          segments.push(buffer);
          buffer = null;
        }

        buffer = {
          text,
          start,
        };

        if (j === segs.length - 1) {
          buffer.end = tStartMs + dDurationMs;
        }
      });
    });

    if (buffer) {
      segments.push(buffer);
    }

    return segments.filter(
      (s) => s && typeof s.start === "number" && s.end > s.start
    );
  }

  /**
   * 将展平后的单词事件流智能划分为适度大小的大分块 (Chunks)
   *
   * 详细解析设计意图与算法：
   * 1. 为什么要分块提交给 AI？
   *    如果把整部一两个小时视频的几万字英文字幕一并投递，响应极慢且费用暴涨，
   *    甚至可能超出大模型的单次 Prompt 最大 Token 上限。
   *    因此必须划分成大小在 1000 字符左右的 Chunks。
   *
   * 2. 为什么不能简单地按字符数“暴力截断”？
   *    如果简单地截取前 1000 个字符，经常会将一句正在说的话拦腰斩断。
   *    这会导致 AI 由于缺乏前言后语，产生啼笑皆非的错误翻译，或在断句时发生句式重叠。
   *
   * 3. 动态柔性分割算法：
   *    - 本函数遍历 flatEvents 时累加字符数。
   *    - 一旦累加值触及 `chunkLength`（阈值），算法不立即切割，而是开启“探针寻找状态”。
   *    - 探针继续向后检索单词，直到检索到以句尾结束的标点符号 (`isEndOfSentence`)，
   *      或者发现下一个单词与当前单词的时间差超过了 `PAUSE_THRESHOLD_MS` (1秒沉默期)，
   *      便认定找到了段落的自然交界处，在此处执行“温和切分”。
   *    - 设有 `MAX_CHUNK_LENGTH` (默认限制为阈值 + 500) 兜底，防范极长难句导致 Chunks 过大。
   *
   * @private
   * @param {Array} flatEvents - 展平单词事件数组
   * @param {number} chunkLength - 切分长度阈值，默认 1000 字符
   * @returns {Array} 分割后的分块数组，每个分块是 events 的子数组
   */
  #splitEventsIntoChunks(flatEvents, chunkLength = 1000) {
    if (!flatEvents || flatEvents.length === 0) {
      return [];
    }

    const eventChunks = [];
    let currentChunk = [];
    let currentChunkTextLength = 0;
    const MAX_CHUNK_LENGTH = chunkLength + 500;
    const PAUSE_THRESHOLD_MS = 1000;

    for (let i = 0; i < flatEvents.length; i++) {
      const event = flatEvents[i];
      currentChunk.push(event);
      currentChunkTextLength += event.text.length;

      const isLastEvent = i === flatEvents.length - 1;
      if (isLastEvent) {
        continue;
      }

      let shouldSplit = false;

      // 如果当前积累的内容长度超出最大限制，或者超出了 chunkLength 且刚好遇到了句尾或长停顿，则在此处截断分块
      if (currentChunkTextLength >= MAX_CHUNK_LENGTH) {
        shouldSplit = true;
      } else if (currentChunkTextLength >= chunkLength) {
        const isEndOfSentence = /[.?!…\])]$/.test(event.text);
        const nextEvent = flatEvents[i + 1];
        const pauseDuration = nextEvent.start - event.end;
        if (isEndOfSentence || pauseDuration > PAUSE_THRESHOLD_MS) {
          shouldSplit = true;
        }
      }

      if (shouldSplit) {
        eventChunks.push(currentChunk);
        currentChunk = [];
        currentChunkTextLength = 0;
      }
    }

    if (currentChunk.length > 0) {
      eventChunks.push(currentChunk);
    }

    return eventChunks;
  }

  /**
   * 异步批次处理视频后续的所有字幕分块并增量渲染到界面上。
   *
   * 详细解析设计意图与逻辑：
   * 1. 为什么采用大分块流式增量追加？
   *    对于长达数小时的长视频或网课，其字幕可能有数千行。
   *    如果一次性提交所有数据给 AI，不仅会突破 LLM 的单次上下文窗口（Context Window）导致出错，
   *    而且长任务耗时极久，用户会看到长时间没有字幕。
   *    本方法以 `for` 循环逐块遍历 `chunks`，通过流式并发依次发起 AI 断句与翻译。
   *    每当一块翻译完毕，就调用 `this.#managerInstance.appendSubtitles` 增量追加到前台，并同步更新侧边栏字幕列表。
   *    这能使用户在播放视频的同时，背景悄无声息地加载完所有字幕。
   *
   * 2. 为什么需要每次追加后重新执行 `.sort()` 排序？
   *    因为视频可能在播放中由于用户频繁跳转 (Seek) 或 AI 分块流式到达顺序微调。
   *    在多线程或异步环境中，为了万无一失地保证前台高亮二分搜索字幕时不会因为时间轴错乱而失效，
   *    每次合并新分块到 `this.#subtitles` 时都必须强制按照 `start` 时间戳重新做升序排序。
   *
   * 3. 随机延时抖动 (`sleep(randomBetween(500, 1000))`) 的用意？
   *    如果对 AI 服务发起连续的高频无延迟循环 HTTP 请求，极易触发商业翻译 API 的 QPS 频控流限（Rate Limiting）。
   *    通过在两个 Chunks 之间人为施加 500ms 至 1000ms 的随机延时抖动（Jitter），能够平滑请求曲线，大幅提升长视频的翻译成功率。
   *
   * // REVIEW: 视频切换时后台异步 API 请求浪费风险。
   * //    在异步 for 循环中遍历后续的分块，当视频中途被用户切换或退出时，虽然有 `#isStaleProcessing` 拦截，
   * //    但由于该拦截只发生在异步 await 请求返回之后进行检查抛弃，
   * //    这就导致已经发出的 AI 翻译网络请求依然会被后台的 TaskPool 处理并执行完毕。
   * //    如果在前一个视频处理期间用户频繁切换了几个新视频，可能会导致大量被废弃的“前视频字幕翻译请求”依然常驻后台，
   * //    造成高额的大模型 API 额度（Token）消耗与浏览器跨域带宽浪费。
   * //    推荐为每次异步请求引入 `AbortController` 并在视频重定向销毁时执行 `.abort()`。
   *
   * @private
   */
  async #processRemainingChunksAsync({
    chunks,
    startIndex = 0,
    videoId,
    fromLang,
    toLang,
    segApiSetting,
    processingVersion,
  }) {
    logger.info(
      `Youtube Provider: Starting async from chunk ${startIndex + 1}/${chunks.length}.`
    );

    for (let i = startIndex; i < chunks.length; i++) {
      // 检查本批次是否已经因为用户切换了字幕轨道或视频而过期，若是则立即退出
      if (this.#isStaleProcessing(processingVersion)) {
        logger.info("Youtube Provider: Skip stale chunk processing.");
        break;
      }

      const chunkEvents = chunks[i];
      const chunkNum = i + 1;
      logger.debug(
        `Youtube Provider: Processing subtitle chunk ${chunkNum}/${chunks.length}: ${chunkEvents[0]?.start} --> ${chunkEvents[chunkEvents.length - 1]?.start}`
      );

      let subtitlesForThisChunk = [];

      try {
        // 请求大模型 AI 对当前分块进行智能断句及辅助翻译
        const aiSubtitles = await this.#aiSegment({
          videoId,
          chunkEvents,
          fromLang,
          toLang,
          segApiSetting,
          prevContext: this.#getChunkContext(chunks, i, "prev"),
          nextContext: this.#getChunkContext(chunks, i, "next"),
        });
        if (this.#isStaleProcessing(processingVersion)) break;

        if (aiSubtitles?.length > 0) {
          subtitlesForThisChunk = aiSubtitles;
        } else {
          // AI 模式返回空时，降级采用内置普通规则断句
          logger.debug(
            `Youtube Provider: AI segmentation for chunk ${chunkNum} returned no data.`
          );
          subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
        }
      } catch (chunkError) {
        // 出错时降级
        subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
      }

      // 双重检查防竞态：确认视频 ID 是否在此期间发生了改变
      if (
        videoId !== this.#videoId ||
        this.#isStaleProcessing(processingVersion)
      ) {
        logger.info(
          "Youtube Provider: videoId changed or track replaced!",
          videoId,
          this.#videoId
        );
        break;
      }

      if (subtitlesForThisChunk.length > 0) {
        const progressed = Math.floor((chunkNum * 100) / chunks.length);
        this.#subtitles.push(...subtitlesForThisChunk);
        // 按时间轴起始点进行重新排序以确保不错序
        this.#subtitles.sort((a, b) => a.start - b.start);
        this.#progressed = progressed;

        logger.debug(
          `Youtube Provider: Appending ${subtitlesForThisChunk.length} subtitles from chunk ${chunkNum} (${this.#progressed}%).`
        );

        if (this.#managerInstance) {
          this.#managerInstance.appendSubtitles(subtitlesForThisChunk);
        }

        // 增量追加新字条目到侧边字幕列表渲染器中
        if (this.#subtitleListManager) {
          this.#subtitleListManager.setBilingualSubtitles(this.#subtitles);
        }
      } else {
        logger.debug(`Youtube Provider: Chunk ${chunkNum} no subtitles.`);
      }

      // 引入轻微延时抖动以防请求触发高频流控
      await sleep(randomBetween(500, 1000));
    }

    logger.info("Youtube Provider: All subtitle chunks processed.");
  }

  // 动态创建并插入右上角通知弹窗的 DOM 容器与基本样式
  #createNotificationElement() {
    const notificationEl = document.createElement("div");
    notificationEl.className = "kiss-notification";
    Object.assign(notificationEl.style, {
      position: "absolute",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0, 0, 0, 0.5)",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "8px",
      zIndex: "2147483647",
      opacity: "0",
      transition: "opacity 0.3s ease-in-out",
      pointerEvents: "none",
      fontSize: "16px",
      lineHeight: "1.4",
      width: "auto",
      maxWidth: "min(360px, calc(100% - 32px))",
      textAlign: "left",
      boxSizing: "border-box",
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    });

    const videoEl = this.#videoEl;
    const videoContainer = videoEl?.parentElement?.parentElement;
    if (videoContainer) {
      videoContainer.appendChild(notificationEl);
      this.#notificationEl = notificationEl;
    }
  }

  // 隐藏当前右上角通知弹窗
  #hideNotification() {
    clearTimeout(this.#notificationTimeout);
    if (this.#notificationEl) {
      this.#notificationEl.style.opacity = "0";
    }
  }

  // 展现通知弹窗，支持传入自定义停留展示时长
  #showNotification(message, duration = 2000) {
    if (this.#setting.showLoadNotification === false) {
      this.#hideNotification();
      return;
    }

    if (!this.#notificationEl) this.#createNotificationElement();
    if (!this.#notificationEl) return;

    this.#notificationEl.textContent = message;
    this.#notificationEl.style.opacity = "1";
    clearTimeout(this.#notificationTimeout);
    this.#notificationTimeout = setTimeout(() => {
      this.#hideNotification();
    }, duration);
  }
}

export const YouTubeInitializer = (() => {
  let initialized = false;

  return async (setting) => {
    if (initialized) {
      return;
    }
    initialized = true;

    logger.info("Bilingual Subtitle Extension: Initializing...");
    const provider = new YouTubeCaptionProvider(setting);
    provider.initialize();
  };
})();
