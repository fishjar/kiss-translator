import { logger } from "../libs/log.js";
import { truncateWords, throttle } from "../libs/utils.js";
import { decodeHTMLEntities } from "../libs/html.js";
import { apiTranslate } from "../apis/index.js";
import { resolveApiPromptSettings } from "../config/prompt.js";
import { apiMicrosoftDict } from "../apis/index.js";
import { trustedTypesHelper } from "../libs/trustedTypes.js";
import { isSubtitleModeEnabled } from "./modes.js";

/**
 * 动态向网页 document.head 中注入生词 hover 及详情气泡弹窗所需的 CSS 样式
 */
const addWordHoverStyles = () => {
  // 如果已经注入过该样式表，直接返回，避免重复创建
  if (document.getElementById("kiss-word-hover-styles")) return;

  const style = document.createElement("style");
  style.id = "kiss-word-hover-styles";
  style.textContent = `
    /* 鼠标 hover 的单词样式：呈现下划线，指示可点击查词 */
    .kiss-word-hover {
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: #4fc3f7;
      text-decoration-thickness: 2px;
    }
    
    /* 查词气泡弹窗主体样式 */
    .kiss-word-tooltip {
      position: fixed;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-radius: 6px;
      padding: 12px;
      font-size: 14px;
      z-index: 2147483647;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: Arial, sans-serif;
    }
    
    /* 气泡弹窗头部（包含单词名和关闭按钮） */
    .kiss-word-tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: bold;
      font-size: 16px;
      color: #4fc3f7;
    }
    
    /* 关闭气泡弹窗的 X 按钮 */
    .kiss-word-tooltip-close {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      margin-left: 10px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .kiss-word-tooltip-close:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }
    
    /* 释义加载中状态文案 */
    .kiss-word-loading {
      color: #bbb;
      font-style: italic;
    }
    
    /* 单词词性释义行 */
    .kiss-word-definition {
      margin: 4px 0;
    }
    
    /* 词性前缀标记（如 n. / v. 等） */
    .kiss-word-pos {
      color: #4fc3f7;
      font-weight: bold;
    }
    
    /* 音标字符样式 */
    .kiss-word-phonetic {
      color: #bbb;
      font-style: italic;
      margin-right: 10px;
    }
    
    /* 例句包裹区 */
    .kiss-word-example {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #444;
    }
    
    .kiss-word-example-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    /* 例句英文正文 */
    .kiss-word-example-sentence {
      margin-bottom: 3px;
    }
    
    /* 例句中文翻译 */
    .kiss-word-example-translation {
      color: #bbb;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
};

/**
 * @class BilingualSubtitleManager
 * @description 负责控制在 YouTube 原生视频播放器上悬浮渲染双语字幕，以及对字幕进行预翻译缓存管理的核心逻辑类
 */
export class BilingualSubtitleManager {
  // --- 私有成员变量 ---
  #videoEl; // 当前绑定的 HTMLVideoElement 播放器实例
  #formattedSubtitles = []; // 已经分句整理好的全部字幕数组
  #captionWindowEl = null; // 悬浮字幕窗口的内部 DOM 引用
  #captionDragged = false; // 标识用户是否手动拖拽过字幕窗口，用于暂停自动同步位置
  #paperEl = null; // 悬浮字幕外层背景画布 DOM 引用
  #currentSubtitleIndex = -1; // 当前正在显示的字幕在数组中的索引，-1 代表无字幕显示
  #setting = {}; // 全局设置项副本
  #isAdPlaying = false; // 当前视频是否正在播放 YouTube 广告
  #throttledTriggerTranslations; // 预翻译请求防抖节流函数
  #tooltipEl = null; // 划词查义气泡弹窗 DOM 引用
  #hoverTimeout = null; // 用于控制 hover 延迟显隐的定时器 ID
  #seekSyncRafId = null; // 控制进度 seek 完毕后强制同步的 requestAnimationFrame ID
  #translationSessionId = 0; // 当前翻译会话版本 ID，用于防竞态过滤过期异步请求
  #abortController = null; // 用于在实例销毁时中止所有尚未返回的网络请求
  #wasPlayingBeforeHover = false; // 记录鼠标 hover 单词前视频是否原本处于播放状态，用于离开时恢复播放
  #hoverTarget = null;
  #playerControlBarObserver = null; // 监听播放器底部控制条显隐突变的 MutationObserver

  /**
   * @param {object} options
   * @param {HTMLVideoElement} options.videoEl - 原生网页 video 节点
   * @param {Array<object>} options.formattedSubtitles - 标准字幕数据列表
   * @param {object} options.setting - 配置对象
   */
  constructor({ videoEl, formattedSubtitles, setting }) {
    this.#setting = setting;
    this.#videoEl = videoEl;
    this.#formattedSubtitles = formattedSubtitles;
    this.#abortController = new AbortController();

    // 绑定事件上下文，确保回调中 this 指向本管理实例
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onSeeking = this.onSeeking.bind(this);
    this.onSeek = this.onSeek.bind(this);

    // 对预翻译机制进行节流控制，以 (setting.throttleTrans 缺省 30秒) 为步长触发，防止频繁向服务端发送翻译请求
    this.#throttledTriggerTranslations = throttle(
      this.#triggerTranslations.bind(this),
      (setting.throttleTrans ?? 30) * 1000
    );

    // 如果启用了悬浮背词/查词翻译功能，将所需 CSS 样式表写入 head
    if (this.#isHoverLookupEnabled()) {
      addWordHoverStyles();
    }
  }

  // 判定是否激活了悬浮查词翻译功能
  #isHoverLookupEnabled() {
    return isSubtitleModeEnabled(
      this.#setting.hoverLookupMode,
      this.#setting.enhanceMode
    );
  }

  /**
   * 启动字幕显示及监听流程
   */
  start() {
    if (this.#formattedSubtitles.length === 0) {
      logger.warn("Bilingual Subtitles: No subtitles to display.");
      return;
    }

    logger.info("Bilingual Subtitle Manager: Starting...");
    this.#createCaptionWindow(); // 1. 创建悬浮字幕 DOM 树并挂载到网页
    this.#attachEventListeners(); // 2. 绑定视频播放事件
    this.onTimeUpdate(); // 3. 触发一次初始化同步渲染
  }

  /**
   * 销毁当前实例，全面清理 DOM 元素、未决请求、事件监听以及轮询定时器，防止内存泄漏
   */
  destroy() {
    logger.info("Bilingual Subtitle Manager: Destroying...");
    this.#translationSessionId += 1; // 递增会话 ID，使当前在途的异步请求回调全部失效
    this.#abortController?.abort(); // 中止未返回的底层请求
    this.#abortController = null;
    this.onSubtitleUpdate = null;
    this.#removeEventListeners(); // 解绑视频播放监听
    this.#throttledTriggerTranslations?.cancel(); // 取消节流触发器
    if (this.#seekSyncRafId !== null) {
      cancelAnimationFrame(this.#seekSyncRafId);
      this.#seekSyncRafId = null;
    }
    // 移除字幕渲染容器
    this.#captionWindowEl?.parentElement?.parentElement?.remove();
    // 释放 MutationObserver 监听器
    this.#playerControlBarObserver?.disconnect();
    this.#playerControlBarObserver = null;
    this.#formattedSubtitles = [];

    // 清理单词提示气泡框
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
      this.#tooltipEl = null;
    }

    // 清理 hover 查词定时器
    if (this.#hoverTimeout) {
      clearTimeout(this.#hoverTimeout);
      this.#hoverTimeout = null;
    }
  }

  /**
   * 更新当前是否处于广告播放阶段
   * 在广告播放时会隐藏我们的双语字幕，广告结束自动恢复
   */
  setIsAdPlaying(isPlaying) {
    this.#isAdPlaying = isPlaying;
    this.onTimeUpdate();
  }

  /**
   * 监听 YouTube 原生控制栏的显示状态突变。
   * 控制条弹出时，需要将字幕框底部边缘上移，控制条隐退时下移，防止挡住控制菜单。
   */
  #observePlayerControlBar() {
    const player = this.#videoEl.closest(".html5-video-player");
    if (!player) return;
    const controlBar = player.querySelector(".ytp-left-controls");
    if (!controlBar) return;
    let controlBarHeight = parseFloat(getComputedStyle(controlBar).height);

    // 根据 YouTube 原生是否有 ytp-autohide 样式类，初始化计算底部高度
    const isHiddenNow = player.classList.contains("ytp-autohide");
    let initialBottom = player.clientHeight * 0.05;
    if (!isHiddenNow) initialBottom += controlBarHeight;
    this.#paperEl.style.bottom = `${initialBottom}px`;
    let lastControlBarHiddenState = isHiddenNow;

    // 当控制条状态变化时，加/减控制条的高度自适应平移字幕
    const updatePaperElBottom = () => {
      const isHidden = player.classList.contains("ytp-autohide");
      if (isHidden === lastControlBarHiddenState) return;
      lastControlBarHiddenState = isHidden;

      let currentBottom = parseFloat(this.#paperEl.style.bottom) || 0;
      let newBottom = isHidden
        ? currentBottom - controlBarHeight
        : currentBottom + controlBarHeight;

      this.#paperEl.style.bottom = `${newBottom}px`;
    };

    const observer = new MutationObserver(() => {
      // 如果用户已经手动拖拽了字幕框，则不再执行位置自适应平移，以用户手动拖拽位置为准
      if (!this.#captionDragged) updatePaperElBottom();
    });
    observer.observe(player, { attributes: true, attributeFilter: ["class"] });
    this.#playerControlBarObserver = observer;
  }

  /**
   * 创建用于渲染双语字幕的 DOM 层次结构，并附加拖拽和查词动作监听器
   */
  #createCaptionWindow() {
    // 1. 最外层全屏透明容器，用于做拖拽的边界范围
    const container = document.createElement("div");
    container.className = `kiss-caption-container notranslate`;
    Object.assign(container.style, {
      position: "absolute",
      width: "100%",
      height: "100%",
      left: "0",
      top: "0",
      pointerEvents: "none", // 允许穿透，不阻碍原生播放器点击
    });

    // 2. 字幕承载背景板 (paper)
    const paper = document.createElement("div");
    paper.className = `kiss-caption-paper`;
    Object.assign(paper.style, {
      position: "absolute",
      width: "80%",
      left: "50%",
      transform: "translateX(-50%)",
      textAlign: "center",
      containerType: "inline-size",
      zIndex: "2147483647",
      pointerEvents: "auto", // 自身拦截点击，用来做拖拽操作
      display: "none", // 缺省隐藏，有字幕时显示
    });
    this.#paperEl = paper;

    // 3. 字幕文字展示窗口
    this.#captionWindowEl = document.createElement("div");
    this.#captionWindowEl.className = `kiss-caption-window`;
    // 读取并注入用户自定义的字幕窗口 CSS 样式参数
    this.#captionWindowEl.style.cssText = this.#setting.windowStyle;
    this.#captionWindowEl.style.pointerEvents = "auto";
    this.#captionWindowEl.style.cursor = "grab";
    this.#captionWindowEl.style.opacity = "1";

    this.#paperEl.appendChild(this.#captionWindowEl);
    container.appendChild(this.#paperEl);

    // 寻找到 YouTube 原生的视频包裹容器节点，以将其挂载进去
    const videoContainer = this.#videoEl.parentElement?.parentElement;
    if (!videoContainer) {
      logger.warn("could not find videoContainer");
      return;
    }

    videoContainer.style.position = "relative";
    videoContainer.appendChild(container);

    const isHoverLookupEnabled = this.#isHoverLookupEnabled();

    // 4. 为字幕框启用拖拽交互
    this.#enableDragging(
      this.#paperEl,
      container,
      this.#captionWindowEl,
      () => (this.#captionDragged = true) // 拖动完成后将标志位置为 true
    );

    // 5. 如果开启了悬浮查词，则在鼠标 hover 字幕窗口时暂停视频，方便用户稳妥查词；移开鼠标时自动恢复播放
    if (isHoverLookupEnabled) {
      this.#captionWindowEl.addEventListener("pointerenter", (e) => {
        if (e.target === this.#captionWindowEl) {
          this.#wasPlayingBeforeHover = this.#videoEl && !this.#videoEl.paused;
          if (this.#videoEl && !this.#videoEl.paused) {
            this.#videoEl.pause();
          }
        }
      });

      this.#captionWindowEl.addEventListener("pointerleave", (e) => {
        if (e.target === this.#captionWindowEl) {
          if (
            this.#wasPlayingBeforeHover &&
            this.#videoEl &&
            this.#videoEl.paused
          ) {
            this.#videoEl.play();
          }
          this.#wasPlayingBeforeHover = false;
          this.#hoverTarget = null;
        }
      });
    }

    // 6. 开启底部控制栏显隐监听
    this.#observePlayerControlBar();
  }

  /**
   * 触发单词 hover 事件
   */
  #handleWordHover(event) {
    const target = event.target;
    if (target.classList.contains("kiss-subtitle-word")) {
      // 撤销先前延迟显隐的定时器
      if (this.#hoverTimeout) {
        clearTimeout(this.#hoverTimeout);
        this.#hoverTimeout = null;
      }

      target.classList.add("kiss-word-hover");

      // 延迟 300 毫秒后显示词义气泡框，防止鼠标划过时频繁触发无意义的查词网络请求
      this.#hoverTimeout = setTimeout(() => {
        this.#showWordTooltip(
          target.dataset.word,
          event.clientX,
          event.clientY
        );
      }, 300);
    }
  }

  /**
   * 鼠标移出单词事件
   */
  #handleWordHoverOut(event) {
    const target = event.target;
    if (target.classList.contains("kiss-subtitle-word")) {
      target.classList.remove("kiss-word-hover");

      if (this.#hoverTimeout) {
        clearTimeout(this.#hoverTimeout);
        this.#hoverTimeout = null;
      }

      // 移出后延迟 100 毫秒关闭提示框，给用户留出鼠标划入弹窗本身的冗余时间
      this.#hoverTimeout = setTimeout(() => {
        this.#hideWordTooltip();
      }, 100);
    }
  }

  #handleWordMouseMove(event) {
    // 已弃用：保持 tooltip 面板在右上角固定位置渲染，优化视觉连续性
  }

  /**
   * 为翻译分词后产生的每一个单词标签绑 hover 移入/移出事件
   */
  #attachSpanListeners() {
    if (!this.#captionWindowEl) return;
    const spans = this.#captionWindowEl.querySelectorAll(".kiss-subtitle-word");
    spans.forEach((span) => {
      if (span.dataset.kissListenerAttached) return; // 避免重复注册
      const enterHandler = (e) => this.#handleWordHover(e);
      const leaveHandler = (e) => this.#handleWordHoverOut(e);
      span.addEventListener("pointerenter", enterHandler);
      span.addEventListener("pointerleave", leaveHandler);
      span.dataset.kissListenerAttached = "1";
    });
  }

  /**
   * 获取单词释义并渲染至网页右侧浮空词典弹窗，同时将查词记录发布到生词本事件队列中
   *
   * @param {string} word - 被查的英文单词文本
   * @param {number} x - 鼠标视口 X 坐标
   * @param {number} y - 鼠标视口 Y 坐标
   */
  async #showWordTooltip(word, x, y) {
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
    }

    // 创建提示气泡框主节点并设为 loading
    this.#tooltipEl = document.createElement("div");
    this.#tooltipEl.className = "kiss-word-tooltip";
    this.#tooltipEl.innerHTML = trustedTypesHelper.createHTML(
      '<div class="kiss-word-loading">Looking up...</div>'
    );

    // 将提示框定位在视频播放器的右上角
    const videoContainer = this.#videoEl.parentElement?.parentElement;
    if (videoContainer) {
      const containerRect = videoContainer.getBoundingClientRect();
      const tooltipWidth = 300;
      const tooltipHeight = 400;

      // 摆放位置：距离容器右边缘 45px，上边缘 20px
      const left = containerRect.right - tooltipWidth - 45;
      const top = containerRect.top + 20;

      const maxLeft = window.innerWidth - tooltipWidth - 10;
      this.#tooltipEl.style.left = Math.min(maxLeft, Math.max(10, left)) + "px";
      this.#tooltipEl.style.top = Math.max(10, top) + "px";
      this.#tooltipEl.style.maxWidth = tooltipWidth + "px";
      this.#tooltipEl.style.maxHeight = tooltipHeight + "px";
      this.#tooltipEl.style.overflow = "auto";
    }

    document.body.appendChild(this.#tooltipEl);

    try {
      // 1. 调用微软在线词典服务获取音标、词性及汉字翻译
      const dictResult = await apiMicrosoftDict(word);

      let phonetic = "";
      if (dictResult && dictResult.aus) {
        // 优先筛选并取美音 (aus) 的音标内容
        const usPhonetic = dictResult.aus.find((au) => au.key === "美");
        if (usPhonetic && usPhonetic.phonetic) {
          phonetic = usPhonetic.phonetic;
        } else if (dictResult.aus.length > 0 && dictResult.aus[0].phonetic) {
          phonetic = dictResult.aus[0].phonetic;
        }
      }

      // 提取前三个有效释义
      let definition = "";
      if (dictResult && dictResult.trs) {
        definition = dictResult.trs
          .slice(0, 3)
          .map((tr) => `${tr.pos ? tr.pos + " " : ""}${tr.def}`)
          .join("; ");
      }

      // 提取前两个双语例句
      let examples = [];
      if (dictResult && dictResult.sentences) {
        examples = dictResult.sentences.slice(0, 2).map((sentence) => ({
          eng: sentence.eng,
          chs: sentence.chs,
        }));
      }

      // 获取当前视频播放到此的绝对时间轴起承点
      const currentTimeMs = this.#getCurrentSubtitleStartTime();

      // 2. 派发自定义全局 DOM 事件 "kiss-add-word"，以此通知侧边生词本管理器同步记录本词汇
      const event = new CustomEvent("kiss-add-word", {
        detail: {
          word,
          phonetic,
          definition,
          examples,
          timestamp: currentTimeMs,
        },
      });
      document.dispatchEvent(event);

      // 3. 构建查词卡片的 HTML 展示模板并渲染
      if (
        dictResult &&
        (dictResult.trs || dictResult.aus || dictResult.sentences)
      ) {
        let content = `<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
        </div>`;

        // 渲染音标栏
        if (dictResult.aus && dictResult.aus.length > 0) {
          content += "<div>";
          dictResult.aus.forEach((au) => {
            if (au.phonetic) {
              content += `<span class="kiss-word-phonetic">${au.phonetic}</span>`;
            }
          });
          content += "</div>";
        }

        // 渲染释义列表
        if (dictResult.trs) {
          dictResult.trs.slice(0, 3).forEach((tr) => {
            content += `<div class="kiss-word-definition">${tr.pos ? '<span class="kiss-word-pos">' + tr.pos + "</span> " : ""}${tr.def}</div>`;
          });
        }

        // 渲染双语例句
        if (dictResult.sentences && dictResult.sentences.length > 0) {
          content += `<div class="kiss-word-example">
            <div class="kiss-word-example-title">例句</div>`;
          dictResult.sentences.slice(0, 2).forEach((sentence) => {
            content += `<div class="kiss-word-example-sentence">${sentence.eng}</div>
              <div class="kiss-word-example-translation">${sentence.chs}</div>`;
          });
          content += "</div>";
        }

        if (this.#tooltipEl) {
          this.#tooltipEl.innerHTML = trustedTypesHelper.createHTML(content);
        }
      } else {
        // 未匹配到任何词典条目兜底
        if (this.#tooltipEl) {
          this.#tooltipEl.innerHTML =
            trustedTypesHelper.createHTML(`<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
        </div>
        <div class="kiss-word-definition">No definition found</div>`);
        }
      }
    } catch (error) {
      logger.info("Dictionary lookup failed for word:", word, error);

      const currentTimeMs = this.#getCurrentSubtitleStartTime();

      // 即使词典查询发生网络请求异常，依然向生词本发布此生词（防止用户记录遗失，仅没有详细翻译）
      const event = new CustomEvent("kiss-add-word", {
        detail: {
          word,
          phonetic: "",
          definition: "",
          examples: [],
          timestamp: currentTimeMs,
        },
      });
      document.dispatchEvent(event);

      if (this.#tooltipEl) {
        this.#tooltipEl.innerHTML =
          trustedTypesHelper.createHTML(`<div class="kiss-word-tooltip-header">
        <span>${word}</span>
        <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
      </div>
      <div class="kiss-word-definition">Failed to load definition</div>`);
      }
    }
  }

  // 隐藏查词气泡框
  #hideWordTooltip() {
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
      this.#tooltipEl = null;
    }
  }

  /**
   * 为指定的 DOM 元素实现垂直物理边界拖拽算法
   *
   * @param {HTMLElement} dragElement - 被移动的目标节点 (即 paperEl 背景板)
   * @param {HTMLElement} boundaryContainer - 拖拽的绝对视口容器 (限制其不滑出边界)
   * @param {HTMLElement} handleElement - 触发拖拽的鼠标把手区域 (即字面框区域本身)
   * @param {Function} dragEndCallback - 拖拽完成时的通知回调
   */
  #enableDragging(
    dragElement,
    boundaryContainer,
    handleElement,
    dragEndCallback
  ) {
    let isDragging = false;
    let startY;
    let initialBottom;
    let dragElementHeight;

    const onDragStart = (e) => {
      // 限制仅允许鼠标左键拖拽
      if (e.type === "mousedown" && e.button !== 0) return;

      e.preventDefault();

      isDragging = true;
      handleElement.style.cursor = "grabbing";
      // 兼容触屏端拖拽
      startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;

      // 记录开始拖动时，字幕框底部与包裹容器底部的绝对间距数值 (bottom)
      initialBottom =
        boundaryContainer.getBoundingClientRect().bottom -
        dragElement.getBoundingClientRect().bottom;

      dragElementHeight = dragElement.offsetHeight;

      // 全局捕获鼠标与触控事件，防止拖拽过快导致指针移出把手时拖拽中断
      document.addEventListener("mousemove", onDragMove, { capture: true });
      document.addEventListener("touchmove", onDragMove, {
        capture: true,
        passive: false,
      });
      document.addEventListener("mouseup", onDragEnd, { capture: true });
      document.addEventListener("touchend", onDragEnd, { capture: true });
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();

      const currentY =
        e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY - startY; // 垂直位移差值
      let newBottom = initialBottom - deltaY;

      // 进行物理视口边界约束计算，防止将字幕框拉出视频范围之外
      const containerHeight = boundaryContainer.clientHeight;
      newBottom = Math.max(0, newBottom);
      newBottom = Math.min(containerHeight - dragElementHeight, newBottom);
      if (dragElementHeight > containerHeight) {
        newBottom = Math.max(0, newBottom);
      }

      dragElement.style.bottom = `${newBottom}px`;
      if (dragEndCallback && typeof dragEndCallback === "function")
        dragEndCallback();
    };

    const onDragEnd = (e) => {
      if (!isDragging) return;

      e.preventDefault();

      isDragging = false;
      handleElement.style.cursor = "grab";

      // 卸载全局移动监听，避免内存泄漏与事件漂移
      document.removeEventListener("mousemove", onDragMove, { capture: true });
      document.removeEventListener("touchmove", onDragMove, { capture: true });
      document.removeEventListener("mouseup", onDragEnd, { capture: true });
      document.removeEventListener("touchend", onDragEnd, { capture: true });

      const finalBottomPx = dragElement.style.bottom;
      setTimeout(() => {
        dragElement.style.bottom = finalBottomPx;
      }, 50);
    };

    handleElement.addEventListener("mousedown", onDragStart);
    handleElement.addEventListener("touchstart", onDragStart, {
      passive: false,
    });
  }

  /**
   * 绑定原生视频事件
   */
  #attachEventListeners() {
    this.#videoEl.addEventListener("timeupdate", this.onTimeUpdate);
    this.#videoEl.addEventListener("seeking", this.onSeeking);
    this.#videoEl.addEventListener("seeked", this.onSeek);
  }

  /**
   * 卸载原生视频事件
   */
  #removeEventListeners() {
    this.#videoEl.removeEventListener("timeupdate", this.onTimeUpdate);
    this.#videoEl.removeEventListener("seeking", this.onSeeking);
    this.#videoEl.removeEventListener("seeked", this.onSeek);
  }

  /**
   * 视频播放进度时间点前进回调，促使更新字幕与预翻译抓取
   */
  onTimeUpdate() {
    this.#syncToCurrentTime();
  }

  /**
   * 视频正在被拖拽进度条过程中触发
   */
  onSeeking() {
    this.#throttledTriggerTranslations.cancel(); // 暂停预翻译，防止产生大量断续的无效预翻译网络请求
    // 强制高亮展示对应处的字幕，且不在此触发翻译
    this.#syncToCurrentTime({ forceRender: true, triggerTranslations: false });
  }

  /**
   * 进度条拖动完毕，落定后触发
   */
  onSeek() {
    this.#throttledTriggerTranslations.cancel();
    this.#syncToCurrentTime({ forceRender: true });
    this.#scheduleSeekSettledSync(); // 调度下一帧做一次确认位置同步
  }

  // 通过两轮 requestAnimationFrame 确认视频底层解码已经落定，执行再次字幕位置校正，防止偶发性的字幕延迟错位
  #scheduleSeekSettledSync() {
    if (typeof requestAnimationFrame !== "function") return;
    if (this.#seekSyncRafId !== null) {
      cancelAnimationFrame(this.#seekSyncRafId);
    }
    this.#seekSyncRafId = requestAnimationFrame(() => {
      this.#seekSyncRafId = requestAnimationFrame(() => {
        this.#seekSyncRafId = null;
        this.#syncToCurrentTime({ forceRender: true });
      });
    });
  }

  /**
   * 同步当前视频时间，计算出应当渲染的那条字幕块
   */
  #syncToCurrentTime({
    forceRender = false,
    triggerTranslations = true,
    forceTriggerTranslations = false,
  } = {}) {
    const currentTimeMs = this.#videoEl.currentTime * 1000;
    const subtitleIndex = this.#findSubtitleIndexForTime(currentTimeMs);

    // 如果强制重绘，或者是当前计算出的字幕索引与窗口上展示的字幕行不匹配，执行重画 DOM
    if (forceRender || subtitleIndex !== this.#currentSubtitleIndex) {
      this.#currentSubtitleIndex = subtitleIndex;
      this.#updateCaptionDisplay(
        subtitleIndex !== -1 ? this.#formattedSubtitles[subtitleIndex] : null
      );
    }

    // 触发预翻译加载
    if (triggerTranslations) {
      if (forceTriggerTranslations) {
        this.#triggerTranslations(currentTimeMs);
      } else {
        this.#throttledTriggerTranslations(currentTimeMs);
      }
    }
  }

  /**
   * 根据时间（毫秒）查找对应的字幕索引。
   * 使用二分查找算法，复杂度为 O(log n)，替代原先 findIndex 的 O(n)，大幅降低了播放器 timeupdate 高频回调下的 CPU 耗能。
   *
   * @param {number} currentTimeMs - 视频当前播放的毫秒数
   * @returns {number} 匹配到的字幕元素在有序数组中的索引。-1 表示该时刻无任何字幕。
   */
  #findSubtitleIndexForTime(currentTimeMs) {
    const arr = this.#formattedSubtitles;
    const len = arr.length;
    if (len === 0) return -1;

    // 快速边界截断，防止无谓的二分检索
    if (currentTimeMs < arr[0].start || currentTimeMs > arr[len - 1].end) {
      return -1;
    }

    let left = 0;
    let right = len - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sub = arr[mid];
      if (currentTimeMs >= sub.start && currentTimeMs <= sub.end) {
        return mid;
      } else if (currentTimeMs < sub.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return -1;
  }

  /**
   * 更新字幕展示 DOM 树
   *
   * @param {object | null} subtitle - 字幕条目对象，若为 null 则隐藏字幕窗口
   */
  #updateCaptionDisplay(subtitle) {
    if (!this.#paperEl || !this.#captionWindowEl) return;

    // 播放广告时隐去我们的双语字幕框，避免遮挡广告
    if (this.#isAdPlaying) {
      this.#paperEl.style.display = "none";
      return;
    }

    if (subtitle) {
      // 1. 创建字幕原文 (text) 显示节点
      const p1 = document.createElement("p");
      p1.style.cssText = this.#setting.originStyle;
      p1.style.margin = "0";

      const isHoverLookupEnabled = this.#isHoverLookupEnabled();

      if (isHoverLookupEnabled) {
        // 如果开启划词查词，用 span 标记每个单词
        p1.innerHTML = trustedTypesHelper.createHTML(
          this.#wrapWordsWithSpans(subtitle.text)
        );
      } else {
        // 没有查词需要时，只做常规安全截断后展示 text 文本内容
        p1.textContent = truncateWords(subtitle.text);
      }

      // 2. 创建字幕译文 (translation) 显示节点
      const p2 = document.createElement("p");
      p2.style.cssText = this.#setting.translationStyle;
      p2.style.margin = "0";
      if (isHoverLookupEnabled) {
        p2.innerHTML = trustedTypesHelper.createHTML(
          this.#wrapWordsWithSpans(subtitle.translation || "...")
        );
      } else {
        p2.textContent = truncateWords(subtitle.translation) || "...";
      }

      // 3. 根据用户设置，决定显示双语对照还是仅显示翻译
      if (this.#setting.isBilingual) {
        const children =
          this.#setting.displayOrder === "translation-first"
            ? [p2, p1]
            : [p1, p2];
        this.#captionWindowEl.replaceChildren(...children);
      } else {
        this.#captionWindowEl.replaceChildren(p2);
      }

      // 4. 背词背句模式（模糊译文，鼠标悬停时才显现翻译）
      if (this.#setting.blurTranslation) {
        const blurValue = "blur(6px)";
        p2.style.setProperty("filter", blurValue);
        p2.addEventListener("pointerenter", () => {
          p2.style.removeProperty("filter");
        });
        p2.addEventListener("pointerleave", () => {
          p2.style.setProperty("filter", blurValue);
        });
      }

      // 5. 重新为新生成的 span 单词绑定 hover 查词动作
      if (isHoverLookupEnabled) {
        this.#attachSpanListeners();
      }

      this.#paperEl.style.display = "block";
    } else {
      this.#paperEl.style.display = "none";
    }
  }

  /**
   * 使用正则表达式，将英文字幕文本中的每一个独立英文单词（包括带单引号/撇号的如 it's）使用 span 标签包裹，
   * 并利用 dataset.word 存储单词本身，以供悬浮查词和背词库集成。
   *
   * @param {string} text - 原文字幕字符串
   * @returns {string} 替换为带 span 标签的 HTML 字符串
   */
  #wrapWordsWithSpans(text) {
    return text.replace(
      /\b([a-zA-Z]+(?:'[a-zA-Z]+)?)\b/g,
      '<span class="kiss-subtitle-word" data-word="$1">$1</span>'
    );
  }

  /**
   * 主动预测性翻译：提前翻译并缓存未来一定时间内 (preTrans 默认90秒) 视频将播放到的字幕
   *
   * @param {number} currentTimeMs - 当前视频播放毫秒
   */
  #triggerTranslations(currentTimeMs) {
    const { preTrans = 90 } = this.#setting;
    const endTimeMs = currentTimeMs + preTrans * 1000;
    const subs = this.#formattedSubtitles;

    // 使用二分法定位到当前播放时间对应的起始字幕索引，避免在长字幕列表中进行全量 for 检索
    let lo = 0,
      hi = subs.length - 1,
      startIdx = subs.length;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (subs[mid].end >= currentTimeMs) {
        startIdx = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    // 从当前索引开始往后扫描，将未来 90 秒内尚未发起翻译的字幕抛入异步队列执行翻译与缓存
    for (let i = startIdx; i < subs.length; i++) {
      const sub = subs[i];
      if (sub.start > endTimeMs) break; // 超出了预翻译时间窗口，退出扫描
      if ((!sub.translation || sub._isDraftTranslation) && !sub.isTranslating) {
        this.#translateAndStore(sub);
      }
    }
  }

  #needsRepairTranslation(subtitle) {
    return subtitle?.translation === "[Translation failed]";
  }

  /**
   * 调用大模型或常规翻译 API 对单个字幕进行翻译，并将翻译成功的译文缓存到字幕对象上。
   *
   * // REVIEW: 视频进度 Seek 导致的在途预翻译请求资源浪费与字幕回刷隐患。
   * //    当用户频繁拖拽视频进度条（Seeking / Seeked）时，代码仅仅取消了防抖触发定时器 `#throttledTriggerTranslations.cancel()`，
   * //    但并没有更新 `#translationSessionId` 或中止（Abort）先前已发起的在途异步翻译网络请求。
   * //    由于 `#translationSessionId` 只在实例销毁 `destroy()` 时递增，导致 seek 发生前已经在途的那些不再需要的预翻译请求在返回时，
   * //    其 `sessionId !== this.#translationSessionId` 校验仍然会通过。
   * //    这不仅会浪费 API 请求额度和网络带宽，还会在翻译完成后，如果用户已 seek 到其他地方，
   * //    因为 subtitle 引用被错误改写而导致未来再次播放到该处时字幕显示不准，或是在 seek 到位后突然被过期请求回调触发重新渲染导致屏幕闪烁。
   * //    推荐在 `onSeeking` 阶段也将 `this.#translationSessionId += 1` 并重置 `AbortController` 中止上一段进度的所有未决请求。
   *
   * @param {object} subtitle - 待翻译的目标字幕数据条目
   */
  async #translateAndStore(subtitle) {
    const sessionId = this.#translationSessionId;
    const signal = this.#abortController?.signal;
    if (signal?.aborted) return;

    const normalizeStreamText = (text) =>
      Array.isArray(text) ? text[0] || "" : text || "";

    const updateSubtitleTranslation = (translation) => {
      if (!translation || sessionId !== this.#translationSessionId) return;
      if (signal?.aborted) return;

      subtitle.translation = decodeHTMLEntities(translation);
      subtitle._isDraftTranslation = false;

      const currentSubtitleIndexNow = this.#findSubtitleIndexForTime(
        this.#videoEl.currentTime * 1000
      );
      if (this.#formattedSubtitles[currentSubtitleIndexNow] === subtitle) {
        this.#updateCaptionDisplay(subtitle);
      }

      if (this.onSubtitleUpdate) {
        this.onSubtitleUpdate({
          start: subtitle.start,
          end: subtitle.end,
          text: subtitle.text,
          translation: subtitle.translation,
        });
      }
    };

    subtitle.isTranslating = true;
    try {
      const {
        fromLang,
        toLang,
        apiSetting: rawApiSetting,
        docInfo,
        prompts,
      } = this.#setting;

      const apiSetting = resolveApiPromptSettings(
        rawApiSetting,
        prompts,
        this.#setting
      );

      const { trText } = await apiTranslate({
        text: subtitle.text,
        fromLang,
        toLang,
        apiSetting,
        docInfo,
        signal,
        onStreamChunk: ({ text }) => {
          // 字幕单句翻译的流式 chunk 只更新当前字幕对象，不改时间轴结构。
          updateSubtitleTranslation(normalizeStreamText(text));
        },
      });
      // 竞态校验：如翻译异步返回时会话 ID 已过时，丢弃结果防止脏数据覆盖
      if (sessionId !== this.#translationSessionId) return;
      updateSubtitleTranslation(trText);
    } catch (error) {
      if (sessionId !== this.#translationSessionId) return;
      if (error?.name === "AbortError") return; // 属于 Abort 中止，静默退出
      logger.info("Translation failed for:", subtitle.text, error);
      if (
        !subtitle.translation ||
        subtitle.translation === "[Translation failed]"
      ) {
        subtitle.translation = "[Translation failed]";
      }
      subtitle._isDraftTranslation = false;
    } finally {
      if (sessionId !== this.#translationSessionId) return;
      subtitle.isTranslating = false;

      // 发布最终状态更新事件；流式阶段已经推送过部分译文，这里保证失败态或最终态也同步给侧栏。
      updateSubtitleTranslation(subtitle.translation);
    }
  }

  /**
   * 增量追加新的分段字幕（用于流式加载或 AI 异步分块翻译追加）
   *
   * @param {Array<object>} newSubtitlesChunk - 待追加的字幕段块
   */
  appendSubtitles(newSubtitlesChunk) {
    if (!newSubtitlesChunk || newSubtitlesChunk.length === 0) {
      return;
    }

    logger.info(
      `Bilingual Subtitle Manager: Appending ${newSubtitlesChunk.length} new subtitles...`
    );

    // 由于上层 provider 在 processRemainingChunksAsync 时直接 push 了全局 subtitles 数组，
    // 这里指向的是同一个底层数组引用，无需重复 push 和 sort 排序，直接将当前索引置 -1 强制触发一次 timeupdate 重刷即可。
    this.#currentSubtitleIndex = -1;
    this.#syncToCurrentTime({
      forceRender: true,
      forceTriggerTranslations: true,
    });
  }

  repairChunkTranslations(subtitles) {
    for (const subtitle of subtitles || []) {
      if (!this.#needsRepairTranslation(subtitle) || subtitle.isTranslating) {
        continue;
      }

      this.#translateAndStore(subtitle);
    }
  }

  // 更新配置项
  updateSetting(obj) {
    this.#setting = { ...this.#setting, ...obj };
    const currentSubtitle = this.#formattedSubtitles[this.#currentSubtitleIndex];
    if (currentSubtitle) {
      this.#updateCaptionDisplay(currentSubtitle);
    }
  }

  // 获取当前字幕的开始时间（以重新分段分句后的时间轴为准）
  #getCurrentSubtitleStartTime() {
    const currentTimeMs = this.#videoEl.currentTime * 1000;
    const idx = this.#findSubtitleIndexForTime(currentTimeMs);
    return idx !== -1 ? this.#formattedSubtitles[idx].start : currentTimeMs;
  }
}
