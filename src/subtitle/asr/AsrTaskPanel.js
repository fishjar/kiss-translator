import { groupAsrTasks } from "./tasks";
import { asrErrorDescription, asrStoppedDescription } from "./status";
import { translationLanguageOptions } from "./language";

const text = (node, value) => {
  if (node.textContent !== value) node.textContent = value;
};
const time = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const fraction = Math.round(ms) % 1000;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${fraction ? `.${String(fraction).padStart(3, "0")}` : ""}`;
};
const range = (task) => `${time(task.startMs)}–${time(task.endMs)}`;

/** A page-owned, metadata-only view. It never schedules ASR or downloads on render. */
export class AsrTaskPanel {
  constructor(i18n, actions) {
    this.t = i18n;
    this.actions = actions;
    this.tasks = new Map();
    this.rows = new Map();
    this.limit = 100;
    this.summary = document.createElement("div");
    this.summary.className = "kiss-asr-summary";
    this.summary.setAttribute("role", "status");
    this.summary.style.cssText =
      "flex-shrink:0;box-sizing:border-box;padding:8px 16px;border-bottom:1px solid var(--kt-divider);font-size:12px;line-height:1.6;";
    this.coverage = new Map();
    for (const key of ["audio", "cutting", "recognition", "translation"]) {
      const row = document.createElement("div");
      const label = document.createElement("div");
      const bar = document.createElement("progress");
      bar.max = 100;
      bar.style.cssText =
        "display:block;width:100%;height:4px;margin:3px 0 6px;accent-color:var(--kt-primary);";
      row.append(label, bar);
      this.summary.append(row);
      this.coverage.set(key, { row, label, bar });
    }
    this.cacheNotice = document.createElement("div");
    this.cacheNoticeLabel = document.createElement("span");
    this.cacheNotice.append(this.cacheNoticeLabel);
    this.summary.append(this.cacheNotice);
    this.statusNotice = document.createElement("div");
    this.statusLabel = document.createElement("span");
    this.statusRetry = document.createElement("button");
    this.statusRetry.style.cssText =
      "padding:6px 12px;line-height:16px;white-space:nowrap;flex-shrink:0;border:var(--kt-btn-border);border-radius:4px;background:var(--kt-btn-bg);color:var(--kt-btn-color);cursor:pointer;";
    this.statusRetry.textContent = this.t("youtube_asr_retry_btn");
    this.statusRetry.onclick = () => void this.actions.retryIncomplete?.();
    this.statusNotice.append(this.statusLabel);
    this.summary.append(this.statusNotice);
    this.element = document.createElement("div");
    this.element.style.cssText =
      "display:none;flex-direction:column;flex:1;min-height:0;overflow-y:auto;color:var(--kt-text);";
    this.toolbar = document.createElement("div");
    this.toolbar.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;flex-shrink:0;gap:8px;padding:10px 16px;";
    this.languageControl = document.createElement("label");
    this.languageControl.style.cssText =
      "display:inline-flex;align-items:center;gap:6px;font-size:12px;";
    this.languageControl.append(this.t("youtube_asr_language"));
    this.languageSelect = document.createElement("select");
    this.languageSelect.setAttribute(
      "aria-label",
      this.t("youtube_asr_language")
    );
    this.languageSelect.style.cssText =
      "max-width:150px;padding:4px;border:var(--kt-btn-border);border-radius:4px;background:var(--kt-bg);color:var(--kt-text);";
    this.languageSelect.onchange = () =>
      void this.actions.setLanguage?.(this.languageSelect.value);
    this.languageControl.append(this.languageSelect);
    this.toolbar.append(this.languageControl);
    this.translationControl = document.createElement("label");
    this.translationControl.style.cssText = this.languageControl.style.cssText;
    this.translationControl.append(this.t("youtube_asr_translation_language"));
    this.translationSelect = document.createElement("select");
    this.translationSelect.style.cssText = this.languageSelect.style.cssText;
    this.translationSelect.setAttribute(
      "aria-label",
      this.t("youtube_asr_translation_language")
    );
    for (const item of translationLanguageOptions) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      this.translationSelect.append(option);
    }
    this.translationSelect.onchange = () =>
      void this.actions.setTranslationLanguage?.(this.translationSelect.value);
    this.translationControl.append(this.translationSelect);
    this.toolbar.append(this.translationControl);
    this.languageStatus = document.createElement("div");
    this.summary.append(this.languageStatus);
    this.element.append(this.toolbar, this.summary);
    this.list = document.createElement("div");
    this.list.className = "kiss-asr-tasks";
    this.list.style.cssText =
      "flex-shrink:0;padding:0 16px;font-size:12px;line-height:1.6;";
    this.element.append(this.list);
    this.more = document.createElement("button");
    this.more.style.cssText =
      "padding:6px 12px;line-height:16px;white-space:nowrap;flex-shrink:0;border:var(--kt-btn-border);border-radius:4px;background:var(--kt-btn-bg);color:var(--kt-btn-color);cursor:pointer;";
    this.more.textContent = i18n("youtube_asr_more_tasks");
    this.more.onclick = () => {
      this.limit += 100;
      this.schedule();
    };
    this.clock = setInterval(() => {
      if (
        this.state?.audio?.cooldownUntil > Date.now() ||
        this.cooldownVisible ||
        [...this.tasks.values()].some(
          (task) => task.recognition === "recognizing"
        )
      )
        this.schedule();
    }, 1000);
  }
  updateState(state) {
    if (state.phase === "off" || state.audio?.phase === "missing")
      this.stopPreview();
    this.state = state;
    this.schedule();
  }
  updateTasks({ reset, tasks = [] }) {
    if (reset) {
      this.stopPreview();
      this.tasks.clear();
      this.rows.clear();
      this.list.replaceChildren();
      this.limit = 100;
    }
    for (const task of tasks)
      this.tasks.set(task.id, { ...this.tasks.get(task.id), ...task });
    this.schedule();
  }
  schedule() {
    if (this.disposed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.render();
    }, 100);
  }
  label(state) {
    return this.t(`youtube_asr_task_${state}`);
  }
  stopPreview() {
    const preview = this.preview;
    if (!preview) return;
    this.preview = undefined;
    preview.video?.removeEventListener("play", preview.onVideoPlay);
    if (preview.audio) {
      preview.audio.onended = null;
      preview.audio.onerror = null;
      preview.audio.pause();
      preview.audio.removeAttribute("src");
      preview.audio.load();
    }
    if (preview.url) URL.revokeObjectURL(preview.url);
    this.schedule();
  }
  async playSegment(segment) {
    const same = this.preview?.id === segment.id;
    this.stopPreview();
    if (same || this.disposed) return;
    const preview = {
      id: segment.id,
      preparing: true,
      video: this.actions.getVideo?.(),
      onVideoPlay: () => this.stopPreview(),
    };
    this.preview = preview;
    preview.video?.addEventListener("play", preview.onVideoPlay);
    this.actions.setPlaybackError?.(segment, undefined);
    this.schedule();
    try {
      const blob = await this.actions.prepareSegmentAudio(segment);
      if (this.preview !== preview || this.disposed) return;
      preview.url = URL.createObjectURL(blob);
      const audio = (preview.audio = new Audio(preview.url));
      const failed = (code) => {
        if (this.preview !== preview) return;
        this.actions.setPlaybackError?.(segment, code);
        this.stopPreview();
      };
      audio.onended = () => {
        if (this.preview === preview) this.stopPreview();
      };
      audio.onerror = () => failed("AUDIO_PLAYBACK_FAILED");
      preview.video?.pause();
      await audio.play();
      if (this.preview !== preview) return;
      preview.preparing = false;
      this.schedule();
    } catch (cause) {
      if (this.preview !== preview) return;
      this.actions.setPlaybackError?.(
        segment,
        cause.code || "AUDIO_PLAYBACK_FAILED"
      );
      this.stopPreview();
    }
  }
  render() {
    const state = this.state || { phase: "waiting" };
    const options = [
      { value: "auto", label: this.t("youtube_asr_language_auto") },
      ...(state.languageOptions || []),
    ];
    const optionsKey = JSON.stringify(options);
    if (this.languageOptionsKey !== optionsKey) {
      this.languageOptionsKey = optionsKey;
      this.languageSelect.replaceChildren(
        ...options.map((item) => {
          const option = document.createElement("option");
          option.value = item.value;
          option.textContent = item.label;
          return option;
        })
      );
    }
    if (this.languageSelect.value !== (state.selectedLanguage || "auto"))
      this.languageSelect.value = state.selectedLanguage || "auto";
    const languageDisabled = !state.active || !!state.clearing;
    if (this.languageSelect.disabled !== languageDisabled)
      this.languageSelect.disabled = languageDisabled;
    if (this.translationSelect.value !== (state.translationLanguage || ""))
      this.translationSelect.value = state.translationLanguage || "";
    const translationDisabled = languageDisabled || !state.translationReady;
    if (this.translationSelect.disabled !== translationDisabled)
      this.translationSelect.disabled = translationDisabled;
    const language = state.effectiveLanguage;
    const baseLanguage = language?.toLowerCase().split("-")[0];
    const label =
      options.find((item) => item.value === language)?.label ||
      options.find((item) => item.value === baseLanguage)?.label ||
      (baseLanguage === "zh"
        ? this.t("youtube_asr_language_chinese")
        : language);
    text(
      this.languageStatus,
      language
        ? `${label} · ${this.t(`youtube_asr_language_${state.languageSource || "detected"}`)}`
        : ""
    );
    const tasks = [...this.tasks.values()];
    const phase = state.phase === "off" ? "stopped" : state.phase || "waiting";
    const audio = state.audio || {};
    for (const [key, progress, label] of [
      ["audio", audio, this.t("youtube_asr_audio_label")],
      [
        "cutting",
        state.cutting && {
          ...state.cutting,
          percent: state.cutting.complete
            ? 100
            : (state.cutting.samples / state.cutting.totalSamples) * 100,
        },
        this.t("youtube_asr_cutting_label"),
      ],
      [
        "recognition",
        state.recognition,
        this.t("youtube_asr_recognition_label"),
      ],
      [
        "translation",
        state.translation,
        this.t("youtube_asr_translation_label"),
      ],
    ]) {
      const view = this.coverage.get(key);
      const hidden = key === "cutting" && !progress;
      if (view.row.hidden !== hidden) view.row.hidden = hidden;
      const total =
        key === "audio" ? progress.expectedMs : progress?.totalSamples;
      const percent =
        total > 0 && Number.isFinite(progress?.percent)
          ? Math.max(0, Math.min(100, Math.floor(progress.percent)))
          : 0;
      const caption =
        label +
        ` ${percent}%` +
        (key === "audio"
          ? ` · ${((audio.bytes || 0) / 1048576).toFixed(1)} MiB`
          : "");
      text(view.label, caption);
      if (view.bar.getAttribute("aria-label") !== caption)
        view.bar.setAttribute("aria-label", caption);
      if (view.bar.getAttribute("value") !== String(percent))
        view.bar.value = percent;
    }
    this.cooldownVisible = audio.cooldownUntil > Date.now();
    const cacheLabel =
      state.cacheMode === "session"
        ? undefined
        : {
            checking: "youtube_asr_checking_audio_cache",
            hit: "youtube_asr_audio_cache_hit",
            partial: "youtube_asr_audio_cache_partial",
            miss:
              audio.phase === "fetching"
                ? "youtube_asr_acquiring_audio"
                : "youtube_asr_preparing_audio",
            error: "youtube_asr_audio_cache_error",
          }[audio.cacheStatus];
    const hideCache =
      !cacheLabel ||
      phase === "stopped" ||
      (audio.phase === "complete" && audio.cacheStatus !== "hit") ||
      (tasks.length > 0 &&
        !!(
          state.recognitionError ||
          state.error ||
          state.paused ||
          state.cuttingActive ||
          phase === "recognizing" ||
          phase === "translating" ||
          audio.phase === "error"
        ));
    if (this.cacheNotice.hidden !== hideCache)
      this.cacheNotice.hidden = hideCache;
    const cacheMessage =
      audio.cacheStatus === "error"
        ? asrErrorDescription(audio.code, this.t) || this.t(cacheLabel)
        : cacheLabel
          ? this.t(cacheLabel)
          : "";
    text(this.cacheNoticeLabel, cacheMessage);
    const groups = groupAsrTasks(tasks);
    const statusError =
      state.stoppedByError && !state.paused && !state.retrying;
    const status = statusError
      ? asrStoppedDescription(state, this.t)
      : state.retrying
        ? this.t("youtube_asr_retrying")
        : state.paused
          ? this.t("youtube_asr_paused")
          : audio.reconnecting && audio.phase === "fetching"
            ? this.t("youtube_asr_reconnecting")
            : audio.phase === "fetching"
              ? this.t("youtube_asr_audio_fetching")
              : audio.phase === "restoring"
                ? this.t("youtube_asr_checking_audio_cache")
                : phase === "recognizing"
                  ? this.t("youtube_asr_recognizing")
                  : phase === "translating"
                    ? this.t("youtube_asr_translating")
                    : state.cuttingActive
                      ? this.t("youtube_asr_cutting")
                      : "";
    const hideStatus = !status;
    if (this.statusNotice.hidden !== hideStatus)
      this.statusNotice.hidden = hideStatus;
    text(this.statusLabel, status);
    if (
      statusError &&
      ![
        "LANGUAGE_UNCERTAIN",
        "LANGUAGE_DETECTION_UNAVAILABLE",
        "UNSUPPORTED_LANGUAGE",
      ].includes(state.recognitionError) &&
      typeof this.actions?.retryIncomplete === "function"
    ) {
      this.statusRetry.disabled = this.cooldownVisible;
      if (!this.statusRetry.isConnected)
        this.statusNotice.append(this.statusRetry);
    } else this.statusRetry.remove();
    if (!groups.length) {
      if (!this.empty) {
        this.empty = document.createElement("div");
        this.empty.style.cssText = "padding:12px 0;color:var(--kt-subtext);";
      }
      let placeholder = this.t("youtube_asr_preparing_audio");
      const isComplete =
        (phase === "cached" || phase === "complete" || state.cacheRestored) &&
        state.recognition?.percent === 100 &&
        (!state.translation || state.translation?.percent === 100);
      const isFailed = statusError;
      if (audio.cacheStatus === "error") {
        placeholder = cacheMessage;
      } else if (isFailed) {
        const errorCode =
          audio.code ||
          state.error ||
          state.recognitionError ||
          state.waitReason;
        if (errorCode === "NEED_PLAYBACK") {
          placeholder = this.t("youtube_asr_need_playback");
        } else {
          const detail = asrErrorDescription(errorCode, this.t);
          placeholder = detail
            ? `${this.t("youtube_asr_task_failed")} (${detail})`
            : this.t("youtube_asr_task_failed");
        }
      } else if (state.paused) {
        placeholder = this.t("youtube_asr_paused");
      } else if (state.cuttingActive) {
        placeholder = this.t("youtube_asr_cutting");
      } else if (phase === "stopped") {
        placeholder = this.t("youtube_asr_task_stopped");
      } else if (
        state.cacheMode !== "session" &&
        (phase === "restoring" || audio.cacheStatus === "checking")
      ) {
        placeholder = this.t("youtube_asr_checking_cache");
      } else if (state.waitReason) {
        placeholder = this.t(
          state.waitReason === "NEED_PLAYBACK"
            ? "youtube_asr_need_playback"
            : "youtube_asr_waiting_player"
        );
      } else if (audio.phase === "fetching" && state.cacheMode === "session") {
        placeholder = this.t("youtube_asr_acquiring_audio");
      } else if (cacheLabel && !hideCache) {
        placeholder = this.t(cacheLabel);
      } else if (
        phase === "complete" ||
        (isComplete && audio.phase !== "fetching")
      ) {
        placeholder = this.t("youtube_asr_complete");
      } else if (phase === "cached" || state.cacheRestored) {
        placeholder = this.t("youtube_asr_restored_fetching_audio");
      } else if (phase === "waiting") {
        placeholder =
          state.waitReason === "NEED_PLAYBACK"
            ? this.t("youtube_asr_need_playback")
            : this.t("youtube_asr_waiting_player");
      }
      this.cacheNotice.hidden = !!statusError || !!state.retrying;
      text(this.cacheNoticeLabel, placeholder);
      text(this.empty, "");
      if (!this.empty.isConnected) this.list.append(this.empty);
    } else {
      this.empty?.remove();
    }
    if (state.cacheMode !== "session" && state.cacheWarning) {
      this.cacheNotice.hidden = false;
      text(
        this.cacheNoticeLabel,
        state.cacheWarning === "CACHE_WRITE_FAILED"
          ? this.t("youtube_asr_cache_session_fallback")
          : asrErrorDescription(state.cacheWarning, this.t)
      );
    }
    const visible = new Set();
    let cursor = this.list.firstElementChild;
    for (const group of groups.slice(0, this.limit)) {
      visible.add(group.id);
      let row = this.rows.get(group.id);
      if (!row) {
        const element = document.createElement("details");
        element.style.cssText =
          "padding:8px 0;border-bottom:1px solid var(--kt-divider);";
        const title = document.createElement("summary");
        title.style.cursor = "pointer";
        const titleWrap = document.createElement("span");
        titleWrap.style.cssText =
          "display:inline-flex;align-items:center;justify-content:space-between;width:calc(100% - 18px);vertical-align:middle;";
        const titleInfo = document.createElement("span");
        const titleStatus = document.createElement("span");
        titleStatus.style.cssText =
          "margin-left:auto;white-space:nowrap;padding-left:8px;font-size:11px;color:var(--kt-subtext);flex-shrink:0;";
        titleWrap.append(titleInfo, titleStatus);
        title.append(titleWrap);
        const body = document.createElement("div");
        body.style.paddingLeft = "12px";
        row = {
          element,
          title,
          titleInfo,
          titleStatus,
          body,
          children: new Map(),
        };
        element.append(title, body);
        this.rows.set(group.id, row);
        element.addEventListener("toggle", () => {
          if (element.open) this.schedule();
        });
        element.open = false;
      }
      let statusText = this.label(group.download);
      if (group.download === "complete") {
        const isCompleteBlock = (c) =>
          c.translation === "complete" ||
          c.translation === "skipped" ||
          c.recognition === "skipped";
        let isComplete = false;
        let blocks = group.children || [];
        if (group.children?.length > 0) {
          isComplete = group.children.every(isCompleteBlock);
        } else if (group.coveredElsewhere) {
          const coveringBlocks = tasks.filter(
            (t) =>
              t.kind === "block" &&
              t.startMs < group.endMs &&
              t.endMs > group.startMs
          );
          blocks = coveringBlocks;
          isComplete =
            coveringBlocks.length > 0 && coveringBlocks.every(isCompleteBlock);
        }
        statusText = isComplete
          ? this.label("complete")
          : this.t(
              state.cutting
                ? !blocks.length && !group.coveredElsewhere
                  ? "youtube_asr_pending_cutting"
                  : "youtube_asr_indexed_pending"
                : "youtube_asr_media_downloaded_pending"
            );
        if (!isComplete) {
          const active = ["recognizing", "segmenting", "translating"].find(
            (stage) =>
              blocks.some(
                (block) =>
                  block.recognition === stage ||
                  block.processing === stage ||
                  block.translation === stage
              )
          );
          if (active) statusText = this.label(active);
        }
      }
      text(
        row.titleInfo,
        `${this.t("youtube_asr_media_segment")} ${group.index} · ${range(group)} · ${(group.bytes / 1024).toFixed(1)} KiB`
      );
      text(row.titleStatus, statusText);
      if (row.element !== cursor) this.list.insertBefore(row.element, cursor);
      cursor = row.element.nextElementSibling;
      if (group.kind === "media") {
        if (!row.download) {
          row.download = document.createElement("button");
          row.download.style.cssText =
            "padding:4px 8px;margin:4px 0;border:var(--kt-btn-border);border-radius:4px;background:var(--kt-btn-bg);color:var(--kt-btn-color);cursor:pointer;";
          row.download.onclick = () => {
            void this.actions.exportSegment?.(row.group);
          };
          row.body.prepend(row.download);
          row.play = document.createElement("button");
          row.play.style.cssText = row.download.style.cssText;
          row.play.style.marginLeft = "8px";
          row.play.onclick = () => void this.playSegment(row.group);
          row.playError = document.createElement("div");
          row.playError.setAttribute("role", "status");
          row.download.after(row.play, row.playError);
        }
        row.group = group;
        const disabled =
          state.phase === "off" ||
          state.audio?.phase === "missing" ||
          group.download !== "complete" ||
          group.exportState === "saving";
        if (row.download.disabled !== disabled)
          row.download.disabled = disabled;
        const opacity = disabled ? "0.45" : "1";
        if (row.download.style.opacity !== opacity)
          row.download.style.opacity = opacity;
        const title =
          state.phase === "off"
            ? this.label("stopped")
            : `${this.t("youtube_asr_download_chunk")} ${range(group)}`;
        if (row.download.title !== title) row.download.title = title;
        const unavailable =
          state.phase === "off" ||
          state.audio?.phase === "missing" ||
          group.download !== "complete";
        if (row.play.disabled !== unavailable) row.play.disabled = unavailable;
        const playOpacity = unavailable ? "0.45" : "1";
        if (row.play.style.opacity !== playOpacity)
          row.play.style.opacity = playOpacity;
        const playTitle = unavailable
          ? this.t("youtube_asr_audio_missing")
          : `${this.t("youtube_asr_play_segment")} ${range(group)}`;
        if (row.play.title !== playTitle) row.play.title = playTitle;
        text(
          row.play,
          this.preview?.id === group.id
            ? this.t(
                this.preview.preparing
                  ? "youtube_asr_preparing"
                  : "youtube_asr_stop_playback"
              )
            : this.t("youtube_asr_play_segment")
        );
        text(
          row.playError,
          group.playbackError ? this.t("youtube_asr_playback_failed") : ""
        );
        text(
          row.download,
          group.exportState === "saving"
            ? this.t("youtube_asr_preparing")
            : group.exportState === "failed"
              ? this.t("youtube_asr_export_error")
              : this.t("youtube_asr_download_chunk")
        );
      }
      const childIds = new Set(group.children.map((child) => child.id));
      for (const [id, node] of row.children)
        if (!childIds.has(id)) {
          node.remove();
          row.children.delete(id);
        }
      if (row.element.open) {
        let childCursor = row.playError
          ? row.playError.nextElementSibling
          : row.body.firstElementChild;
        for (const child of group.children) {
          let node = row.children.get(child.id);
          if (!node) {
            node = document.createElement("div");
            node.style.cssText =
              "padding:6px 0;line-height:1.5;white-space:pre-line;";

            const header = document.createElement("div");
            header.style.cssText = "display:flex;align-items:center;gap:6px;";
            const headerText = document.createElement("span");
            const playBtn = document.createElement("button");
            playBtn.style.cssText =
              "display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:var(--kt-btn-border);border-radius:3px;background:var(--kt-btn-bg);color:var(--kt-btn-color);cursor:pointer;font-size:10px;line-height:1;";
            playBtn.title = this.t("youtube_asr_play_block");
            playBtn.setAttribute("aria-label", playBtn.title);
            const downloadBtn = document.createElement("button");
            downloadBtn.style.cssText = playBtn.style.cssText;
            downloadBtn.title = this.t("youtube_asr_download_chunk");
            downloadBtn.setAttribute("aria-label", downloadBtn.title);
            const icon = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "svg"
            );
            icon.setAttribute("width", "14");
            icon.setAttribute("height", "14");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.setAttribute("aria-hidden", "true");
            const path = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path"
            );
            path.setAttribute("fill", "currentColor");
            path.setAttribute("d", "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v3h14v-3H5z");
            icon.append(path);
            downloadBtn.append(icon);
            const exportStatus = document.createElement("span");
            exportStatus.setAttribute("role", "status");
            header.append(headerText, playBtn, downloadBtn, exportStatus);

            const recRow = document.createElement("div");
            recRow.style.cssText =
              "display:flex;align-items:flex-start;gap:4px;word-break:break-word;margin-top:2px;";
            const recText = document.createElement("span");
            const recRetry = document.createElement("button");
            recRetry.style.cssText =
              "display:none;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:var(--kt-btn-border);border-radius:3px;background:var(--kt-btn-bg);color:var(--kt-btn-color);cursor:pointer;font-size:11px;line-height:1;flex-shrink:0;margin-left:4px;";
            recRetry.textContent = "🔄";
            recRetry.title =
              this.t("youtube_asr_retry_inline") || this.t("youtube_asr_retry");
            recRetry.setAttribute("aria-label", recRetry.title);
            recRetry.onclick = (e) => {
              e.stopPropagation();
              void this.actions.retryRecognition?.(node._taskId);
            };
            recRow.append(recText, recRetry);

            const trRow = document.createElement("div");
            trRow.style.cssText =
              "display:flex;align-items:flex-start;gap:4px;word-break:break-word;margin-top:2px;";
            const trText = document.createElement("span");
            const trRetry = document.createElement("button");
            trRetry.style.cssText = recRetry.style.cssText;
            trRetry.textContent = "🔄";
            trRetry.title = recRetry.title;
            trRetry.setAttribute("aria-label", trRetry.title);
            trRetry.onclick = (e) => {
              e.stopPropagation();
              void this.actions.retryTranslation?.(node._taskId);
            };
            trRow.append(trText, trRetry);

            node.append(header, recRow, trRow);
            node._headerText = headerText;
            node._playBtn = playBtn;
            node._downloadBtn = downloadBtn;
            node._exportStatus = exportStatus;
            node._recText = recText;
            node._recRetry = recRetry;
            node._trText = trText;
            node._trRetry = trRetry;
            row.children.set(child.id, node);
          }
          if (node !== childCursor) row.body.insertBefore(node, childCursor);
          childCursor = node.nextElementSibling;
          node._playBtn.onclick = (e) => {
            e.stopPropagation();
            void this.playSegment(child);
          };
          node._downloadBtn.onclick = (e) => {
            e.stopPropagation();
            void this.actions.exportSegment?.(child);
          };
          const downloadDisabled =
            state.phase === "off" ||
            state.audio?.phase === "missing" ||
            child.exportState === "saving";
          if (node._downloadBtn.disabled !== downloadDisabled)
            node._downloadBtn.disabled = downloadDisabled;
          const downloadOpacity = downloadDisabled ? "0.45" : "1";
          if (node._downloadBtn.style.opacity !== downloadOpacity)
            node._downloadBtn.style.opacity = downloadOpacity;
          text(
            node._exportStatus,
            child.exportState === "saving"
              ? this.t("youtube_asr_preparing")
              : child.exportState === "failed"
                ? this.t("youtube_asr_export_error")
                : ""
          );
          const isPlaying = this.preview?.id === child.id;
          text(
            node._playBtn,
            isPlaying ? (this.preview.preparing ? "…" : "⏹") : "▶"
          );
          text(
            node._headerText,
            `${range(child)}${child.crossSegment ? ` · ${this.t("youtube_asr_cross_segment")}` : ""}`
          );

          node._taskId = child.id;
          node._recRetry.disabled = node._trRetry.disabled =
            !!state.paused ||
            !!state.retrying ||
            phase === "off" ||
            phase === "stopped";
          const elapsed =
            child.recognition === "recognizing" &&
            Number.isFinite(child.startedAt)
              ? ` · ${Math.floor((Date.now() - child.startedAt) / 1000)}s`
              : "";
          const percent =
            child.recognition === "recognizing" &&
            Number.isFinite(child.progress) &&
            child.progress >= 0 &&
            child.progress <= 1
              ? ` ${Math.floor(child.progress * 100)}%`
              : "";
          const count =
            child.total > 0 ? ` ${child.translated || 0}/${child.total}` : "";

          if (child.recognition === "failed" || child.errorCode) {
            text(
              node._recText,
              `${this.t("youtube_asr_recognition_label")}: ${asrErrorDescription(child.errorCode || "ASR_FAILED", this.t)}${child.errorDetail ? `\n${child.errorDetail}` : ""}`
            );
            if (node._recRetry.style.display !== "inline-flex")
              node._recRetry.style.display = "inline-flex";
          } else {
            if (node._recRetry.style.display !== "none")
              node._recRetry.style.display = "none";
            if (child.recognition === "recognizing") {
              text(
                node._recText,
                `${this.t("youtube_asr_recognition_label")}: ${this.label("recognizing")}${percent}${elapsed}`
              );
            } else if (child.recognition === "recognized") {
              text(
                node._recText,
                `${this.t("youtube_asr_recognition_label")}: ${child.text || this.label("recognized")}`
              );
            } else {
              text(
                node._recText,
                `${this.t("youtube_asr_recognition_label")}: ${(state.retrying || child.retrying) && child.recognition === "queued" ? this.t("youtube_asr_retrying") : this.label(child.recognition)}`
              );
            }
          }

          if (child.translation === "failed" || child.translationError) {
            text(
              node._trText,
              `${this.t("youtube_asr_translation_label")}: ${asrErrorDescription(child.translationError || "TRANSLATION_FAILED", this.t)}`
            );
            if (node._trRetry.style.display !== "inline-flex")
              node._trRetry.style.display = "inline-flex";
          } else {
            if (node._trRetry.style.display !== "none")
              node._trRetry.style.display = "none";
            if (
              child.translation === "translating" ||
              child.processing === "translating"
            ) {
              text(
                node._trText,
                `${this.t("youtube_asr_translation_label")}: ${this.label(child.processing || "translating")}${count}`
              );
            } else if (child.translation === "complete") {
              text(
                node._trText,
                `${this.t("youtube_asr_translation_label")}: ${child.translationText || this.label("complete")}`
              );
            } else {
              text(
                node._trText,
                `${this.t("youtube_asr_translation_label")}: ${child.retrying ? this.t("youtube_asr_retrying") : this.label(child.processing || child.translation)}${count}`
              );
            }
          }
        }
        if (!group.children.length) {
          if (!row.empty) {
            row.empty = document.createElement("div");
            row.body.append(row.empty);
          }
          text(
            row.empty,
            this.t(
              group.coveredElsewhere
                ? "youtube_asr_covered_elsewhere"
                : "youtube_asr_no_blocks"
            )
          );
        } else {
          row.empty?.remove();
          row.empty = undefined;
        }
      }
    }
    for (const [id, row] of this.rows)
      if (!visible.has(id)) {
        row.element.remove();
        this.rows.delete(id);
      }
    if (groups.length > this.limit) {
      if (!this.more.isConnected) this.list.append(this.more);
    } else this.more.remove();
  }
  destroy() {
    this.disposed = true;
    this.stopPreview();
    clearTimeout(this.timer);
    clearInterval(this.clock);
    this.tasks.clear();
    this.rows.clear();
  }
}
