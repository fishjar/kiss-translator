import { asrFeedbackEvents } from "./status";
import { groupAsrTasks } from "./tasks";

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
      "box-sizing:border-box;padding:8px 16px;border-bottom:1px solid var(--kt-divider);font-size:12px;line-height:1.6;";
    this.coverage = new Map();
    for (const key of ["audio", "recognition", "translation"]) {
      const row = document.createElement("div");
      row.hidden = true;
      const label = document.createElement("div");
      const bar = document.createElement("progress");
      bar.max = 100;
      bar.style.cssText =
        "display:block;width:100%;height:4px;margin:3px 0 6px;accent-color:var(--kt-primary);";
      row.append(label, bar);
      this.summary.append(row);
      this.coverage.set(key, { row, label, bar });
    }
    this.element = document.createElement("div");
    this.element.style.cssText =
      "display:none;flex-direction:column;height:100%;overflow:hidden;";
    this.toolbar = document.createElement("div");
    this.toolbar.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px;";
    this.element.append(this.toolbar, this.summary);
    this.list = document.createElement("div");
    this.list.className = "kiss-asr-tasks";
    this.list.style.cssText =
      "overflow:auto;flex:1;min-height:0;padding:0 16px;font-size:12px;line-height:1.6;";
    this.element.append(this.list);
    this.more = document.createElement("button");
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
    const tasks = [...this.tasks.values()];
    const phase = state.phase === "off" ? "stopped" : state.phase || "waiting";
    const audio = state.audio || {};
    for (const [key, progress, active, label] of [
      [
        "audio",
        audio,
        audio.phase === "fetching" || audio.bytes > 0,
        this.t("youtube_asr_audio_label"),
      ],
      [
        "recognition",
        state.recognition,
        state.recognition?.samples > 0 || phase === "recognizing",
        this.t("youtube_asr_recognition_label"),
      ],
      [
        "translation",
        state.translation,
        state.translation?.samples > 0 || phase === "translating",
        this.t("youtube_asr_translation_label"),
      ],
    ]) {
      const view = this.coverage.get(key);
      if (view.row.hidden !== !active) view.row.hidden = !active;
      if (!active) continue;
      const total =
        key === "audio" ? progress.expectedMs : progress?.totalSamples;
      const percent =
        total > 0 && Number.isFinite(progress?.percent)
          ? Math.max(0, Math.min(100, Math.floor(progress.percent)))
          : undefined;
      const caption =
        label +
        (percent === undefined ? "" : ` ${percent}%`) +
        (key === "audio"
          ? ` · ${((audio.bytes || 0) / 1048576).toFixed(1)} MiB`
          : "");
      text(view.label, caption);
      if (view.bar.getAttribute("aria-label") !== caption)
        view.bar.setAttribute("aria-label", caption);
      if (percent === undefined) {
        if (view.bar.hasAttribute("value")) view.bar.removeAttribute("value");
      } else if (view.bar.getAttribute("value") !== String(percent))
        view.bar.value = percent;
    }
    this.cooldownVisible = audio.cooldownUntil > Date.now();
    const groups = groupAsrTasks(tasks);
    if (!groups.length) {
      if (!this.empty) {
        this.empty = document.createElement("div");
        this.empty.textContent = this.t("youtube_asr_no_tasks");
      }
      if (!this.empty.isConnected) this.list.append(this.empty);
    } else this.empty?.remove();
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
        element.open =
          this.rows.size === 1 ||
          group.children.some((child) => child.recognition === "recognizing");
      }
      let statusText = this.label(group.download);
      if (group.download === "complete") {
        const isCompleteBlock = (c) =>
          c.translation === "complete" ||
          c.translation === "skipped" ||
          c.recognition === "skipped";
        let isComplete = false;
        if (group.children.length > 0) {
          isComplete = group.children.every(isCompleteBlock);
        } else if (group.coveredElsewhere) {
          const coveringBlocks = tasks.filter(
            (t) =>
              t.kind === "block" &&
              t.startMs < group.endMs &&
              t.endMs > group.startMs
          );
          isComplete =
            coveringBlocks.length > 0 &&
            coveringBlocks.every(isCompleteBlock);
        }
        statusText = isComplete
          ? this.label("complete")
          : this.t("youtube_asr_media_downloaded_pending");
      }
      if (group.id === "unmatched") {
        text(
          row.titleInfo,
          this.t(
            group.cached
              ? "youtube_asr_cached_tasks"
              : "youtube_asr_unmatched_tasks"
          )
        );
        text(row.titleStatus, "");
      } else {
        text(
          row.titleInfo,
          `${this.t("youtube_asr_media_segment")} ${group.index} · ${range(group)} · ${(group.bytes / 1024).toFixed(1)} KiB`
        );
        text(row.titleStatus, statusText);
      }
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
            header.append(headerText, playBtn);

            const recRow = document.createElement("div");
            recRow.style.cssText =
              "display:flex;align-items:flex-start;gap:4px;word-break:break-word;margin-top:2px;";
            const recText = document.createElement("span");
            const recRetry = document.createElement("button");
            recRetry.style.cssText =
              "display:none;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:var(--kt-btn-border);border-radius:3px;background:var(--kt-btn-bg);color:var(--kt-btn-color);cursor:pointer;font-size:11px;line-height:1;flex-shrink:0;margin-left:4px;";
            recRetry.textContent = "🔄";
            recRetry.title =
              this.t("youtube_asr_retry_inline") ||
              this.t("youtube_asr_retry");
            recRetry.setAttribute("aria-label", recRetry.title);
            recRetry.onclick = (e) => {
              e.stopPropagation();
              void this.actions.retryRecognition?.();
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
              void this.actions.retryTranslation?.();
            };
            trRow.append(trText, trRetry);

            node.append(header, recRow, trRow);
            node._headerText = headerText;
            node._playBtn = playBtn;
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
          const isPlaying = this.preview?.id === child.id;
          text(
            node._playBtn,
            isPlaying ? (this.preview.preparing ? "…" : "⏹") : "▶"
          );
          text(
            node._headerText,
            `${range(child)}${child.crossSegment ? ` · ${this.t("youtube_asr_cross_segment")}` : ""}`
          );

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
              `${this.t("youtube_asr_recognition_label")}: ${this.label("failed")} [${child.errorCode || "FAILED"}]${child.errorDetail ? `\n${child.errorDetail}` : ""}`
            );
            node._recRetry.style.display = "inline-flex";
          } else {
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
                `${this.t("youtube_asr_recognition_label")}: ${this.label(child.recognition)}`
              );
            }
          }

          if (child.translation === "failed" || child.translationError) {
            text(
              node._trText,
              `${this.t("youtube_asr_translation_label")}: ${this.label("failed")} [${child.translationError || "FAILED"}]`
            );
            node._trRetry.style.display = "inline-flex";
          } else {
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
                `${this.t("youtube_asr_translation_label")}: ${this.label(child.processing || child.translation)}${count}`
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
