/**
 * @file ImageTranslateBox.js
 * @description 网页图片翻译可拖拽缩放浮层：整合 Header、Content 与后台执行流。
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import DraggableResizable from "../Selection/DraggableResizable";
import ImageTranslateHeader, {
  ImageTranslateSettings,
} from "./ImageTranslateHeader";
import ImageTranslateContent from "./ImageTranslateContent";
import ImageTranslateActions from "./ImageTranslateActions";
import { DEFAULT_IMAGE_TRANSLATE_SETTING } from "../../config/setting";
import { getAllPrompts } from "../../config/prompt";
import {
  MSG_IMAGE_TRANSLATE_EXECUTE,
  MSG_IMAGE_TRANSLATE_CANCEL,
  MSG_IMAGE_TRANSLATE_PROGRESS,
} from "../../config/msg";
import { sendBgMsg } from "../../libs/msg";
import { blobToDataUrl } from "../../libs/imageTranslate/imageReader";
import { browser } from "../../libs/browser";

export default function ImageTranslateBox({
  showBox = false,
  boxVisible = true,
  setShowBox,
  imageBlob = null,
  imageDataUrl = null,
  selectedRegions = null,
  initialAutoTranslate = false,
  requestVersion = null,
  selectedRegionsVersion = null,
  onLayoutDetected,
  onSettingResetLayout,
  onTaskStateChange,
  sourceBusy = false,
  sourceError = "",
  onCancelSource,
  onRetrySource,
  setting = {},
  updateSetting,
  i18n = (k, d) => d || k,
}) {
  // 1. 面板尺寸与位置（限制在视口内）
  const defaultW = Math.min(560, Math.max(360, window.innerWidth - 40));
  const defaultH = Math.min(480, Math.max(300, window.innerHeight - 40));

  const [boxSize, setBoxSize] = useState({ w: defaultW, h: defaultH });
  const [boxPosition, setBoxPosition] = useState(() => ({
    x: Math.max(20, Math.floor((window.innerWidth - defaultW) / 2)),
    y: Math.max(20, Math.floor((window.innerHeight - defaultH) / 2)),
  }));

  // 2. 场景配置
  const [scene, setScene] = useState(
    () => setting?.imageTranslateSetting || DEFAULT_IMAGE_TRANSLATE_SETTING
  );

  // 同步外部传入的最新设置
  useEffect(() => {
    if (setting?.imageTranslateSetting) {
      setScene(setting.imageTranslateSetting);
    }
  }, [setting?.imageTranslateSetting]);

  // 配置持久化保存与服务变更重置
  const handleSettingChange = useCallback(
    (nextScene) => {
      const isRecognitionChanged =
        nextScene.layoutApiSlug !== scene.layoutApiSlug ||
        nextScene.recognitionService?.apiSlug !==
          scene.recognitionService?.apiSlug ||
        nextScene.recognitionService?.capability !==
          scene.recognitionService?.capability ||
        nextScene.vlmPromptSlug !== scene.vlmPromptSlug ||
        nextScene.fromLang !== scene.fromLang;

      const isTranslationChanged =
        nextScene.toLang !== scene.toLang ||
        nextScene.apiSlug !== scene.apiSlug ||
        nextScene.promptSlug !== scene.promptSlug;

      setScene(nextScene);
      updateSetting?.({ imageTranslateSetting: nextScene });

      if (isRecognitionChanged) {
        // 识别配置变化清空文本，只有分析服务变化才清空布局。
        setItems([]);
        setHasExecuted(false);
        setError("");
        setRecognitionErrors([]);
        if (nextScene.layoutApiSlug !== scene.layoutApiSlug) {
          layoutRegionsRef.current = null;
          onSettingResetLayout?.();
        }
      } else if (isTranslationChanged) {
        // 翻译配置变更清空旧译文与单项错误
        setItems((prev) =>
          prev.map((item) => ({ ...item, translation: "", error: undefined }))
        );
      }
    },
    [scene, updateSetting, onSettingResetLayout]
  );

  // 3. 任务执行状态
  const [busy, setBusy] = useState(false);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [stage, setStage] = useState(""); // "layout" | "recognize" | "translate" | ""
  const [recognitionProgress, setRecognitionProgress] = useState(null);
  const [recognitionErrors, setRecognitionErrors] = useState([]);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [viewMode, setViewMode] = useState("bilingual");

  const currentTaskIdRef = useRef(null);
  const progressSequenceRef = useRef(0);
  const hasAutoTriggeredRef = useRef(false);
  const lastHandledVersionRef = useRef(null);
  const layoutRegionsRef = useRef(selectedRegions);
  const lastActionRef = useRef("all");
  const taskStateRef = useRef();
  taskStateRef.current = { onTaskStateChange, requestVersion };
  const setTaskBusy = useCallback((value) => {
    setBusy(value);
    const current = taskStateRef.current;
    current.onTaskStateChange?.({
      busy: value,
      requestVersion: current.requestVersion,
    });
  }, []);

  useEffect(() => {
    layoutRegionsRef.current = selectedRegions;
  }, [selectedRegions, requestVersion]);

  // 监听选区变化：若选区发生改变，立即作废旧识别项，确保重新翻译时使用新选区
  const currentRegionsKey = (selectedRegions || [])
    .map((r, idx) => `${r.order ?? idx}:${r.enabled !== false}`)
    .join(";");
  const lastRegionsKeyRef = useRef(currentRegionsKey);

  useEffect(() => {
    if (lastRegionsKeyRef.current !== currentRegionsKey) {
      lastRegionsKeyRef.current = currentRegionsKey;
      if (currentTaskIdRef.current && lastActionRef.current !== "layout") {
        sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, {
          taskId: currentTaskIdRef.current,
        });
        currentTaskIdRef.current = null;
        setTaskBusy(false);
        setStage("");
      }
      setItems([]);
      setRecognitionErrors([]);
    }
  }, [currentRegionsKey, setTaskBusy]);

  // 4. 执行图片处理流
  const runAction = useCallback(
    async (
      actionType,
      { forceAll = false, forceCancelExisting = false } = {}
    ) => {
      if (sourceBusy || (busy && !forceCancelExisting)) return;
      if (forceCancelExisting && currentTaskIdRef.current) {
        sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, {
          taskId: currentTaskIdRef.current,
        });
        currentTaskIdRef.current = null;
      }
      setError("");

      const activeScene = scene;
      // 若当前已有识别好的文本且没有强制指定完整重翻，点击翻译时智能转为直译
      let finalAction = actionType;
      if (
        !forceAll &&
        finalAction === "all" &&
        items &&
        items.length > 0 &&
        items.some((i) => i.original || i.text)
      ) {
        finalAction = "translate";
      }

      const isTranslateOnly = finalAction === "translate";

      if (isTranslateOnly && (!items || items.length === 0)) {
        return;
      }

      const taskId = crypto.randomUUID();
      currentTaskIdRef.current = taskId;
      progressSequenceRef.current = 0;
      setRecognitionProgress(null);
      lastActionRef.current = finalAction;
      setTaskBusy(true);
      setHasExecuted(finalAction !== "layout");
      setStage(
        finalAction === "layout"
          ? "layout"
          : isTranslateOnly
            ? "translate"
            : "recognize"
      );
      if (finalAction === "layout") {
        setItems([]);
        setRecognitionErrors([]);
        layoutRegionsRef.current = null;
        onSettingResetLayout?.();
      } else if (!isTranslateOnly) {
        setItems([]);
        setRecognitionErrors([]);
      }

      try {
        let dataUrl = imageDataUrl;
        if (!isTranslateOnly && !dataUrl && imageBlob) {
          try {
            dataUrl = await blobToDataUrl(imageBlob);
          } catch (err) {
            if (currentTaskIdRef.current === taskId) {
              setError(i18n("image_read_error", "读取图片数据失败"));
            }
            return;
          }
        }
        if (currentTaskIdRef.current !== taskId) return;
        if (!isTranslateOnly && !dataUrl) {
          setError(i18n("image_no_source", "无可用图片源，请重新截图"));
          return;
        }
        const response = await sendBgMsg(MSG_IMAGE_TRANSLATE_EXECUTE, {
          taskId,
          action: finalAction,
          dataUrl: isTranslateOnly ? undefined : dataUrl,
          items: isTranslateOnly ? items : undefined,
          selectedRegions:
            finalAction === "layout"
              ? undefined
              : (layoutRegionsRef.current ?? undefined),
          scene: activeScene,
        });

        // 若任务已被取消或被新任务取代，则忽略返回
        if (currentTaskIdRef.current !== taskId) {
          return;
        }

        if (response?.success && response.result) {
          if (Array.isArray(response.result.recognitionErrors)) {
            setRecognitionErrors(response.result.recognitionErrors);
          }
          if (response.result.layout?.regions) {
            layoutRegionsRef.current = response.result.layout.regions;
            onLayoutDetected?.(response.result.layout.regions, {
              replace: finalAction === "layout",
            });
          }
          const resItems = response.result.items || [];
          if (finalAction === "translate") {
            // 合并翻译结果到现有项，保留每项独立的 error 与 translation
            setItems((prev) =>
              prev.map((item, idx) => ({
                ...item,
                translation: resItems[idx]?.translation || "",
                error: resItems[idx]?.error || undefined,
              }))
            );
          } else if (finalAction === "recognize") {
            setItems(
              resItems.map((item) => ({
                ...item,
                translation: "", // 识别清空旧翻译
                error: undefined,
              }))
            );
          } else {
            // "all"
            setItems(resItems);
          }
        } else {
          setError(response?.error || i18n("image_process_failed", "处理失败"));
        }
      } catch (err) {
        if (currentTaskIdRef.current === taskId) {
          setError(err?.message || i18n("image_process_failed", "处理失败"));
        }
      } finally {
        if (currentTaskIdRef.current === taskId) {
          currentTaskIdRef.current = null;
          setTaskBusy(false);
          setStage("");
          setRecognitionProgress(null);
        }
      }
    },
    [
      busy,
      sourceBusy,
      setTaskBusy,
      scene,
      items,
      imageDataUrl,
      imageBlob,
      onLayoutDetected,
      onSettingResetLayout,
      i18n,
    ]
  );

  // 5. 取消执行
  const handleCancel = useCallback(() => {
    if (currentTaskIdRef.current) {
      sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, {
        taskId: currentTaskIdRef.current,
      });
      currentTaskIdRef.current = null;
    }
    setTaskBusy(false);
    setStage("");
    setRecognitionProgress(null);
  }, [setTaskBusy]);

  // 单项翻译重试
  const handleRetryItem = useCallback(
    async (index) => {
      if (busy || sourceBusy || !items[index]) return;
      const targetItem = items[index];
      const sourceText = targetItem.original || targetItem.text;
      if (!sourceText) return;

      const taskId = crypto.randomUUID();
      currentTaskIdRef.current = taskId;
      progressSequenceRef.current = 0;
      setRecognitionProgress(null);
      setTaskBusy(true);
      setStage("translate");

      try {
        const response = await sendBgMsg(MSG_IMAGE_TRANSLATE_EXECUTE, {
          taskId,
          action: "translate",
          items: [{ ...targetItem, error: undefined }],
          scene,
        });

        if (currentTaskIdRef.current !== taskId) return;

        if (response?.success && response.result?.items?.[0]) {
          const resItem = response.result.items[0];
          setItems((prev) =>
            prev.map((it, idx) =>
              idx === index
                ? {
                    ...it,
                    translation: resItem.translation || "",
                    error: resItem.error || undefined,
                  }
                : it
            )
          );
        } else if (response?.error) {
          setItems((prev) =>
            prev.map((it, idx) =>
              idx === index ? { ...it, error: response.error } : it
            )
          );
        }
      } catch (err) {
        if (currentTaskIdRef.current === taskId) {
          setItems((prev) =>
            prev.map((it, idx) =>
              idx === index
                ? {
                    ...it,
                    error: err.message || i18n("retry_failed", "重试失败"),
                  }
                : it
            )
          );
        }
      } finally {
        if (currentTaskIdRef.current === taskId) {
          currentTaskIdRef.current = null;
          setTaskBusy(false);
          setStage("");
        }
      }
    },
    [busy, sourceBusy, setTaskBusy, items, scene, i18n]
  );

  // 6. 监听后台推送进度
  useEffect(() => {
    const handleMessage = (msg) => {
      if (
        msg?.action === MSG_IMAGE_TRANSLATE_PROGRESS &&
        currentTaskIdRef.current &&
        msg?.args?.taskId === currentTaskIdRef.current
      ) {
        const { sequence } = msg.args;
        if (
          !Number.isInteger(sequence) ||
          sequence <= progressSequenceRef.current
        )
          return;
        progressSequenceRef.current = sequence;
        if (msg.args.stage) {
          setStage(msg.args.stage);
        }
        if (
          msg.args.stage === "recognize" &&
          Number.isInteger(msg.args.current)
        ) {
          setRecognitionProgress({
            current: msg.args.current,
            total: msg.args.total,
          });
        }
        if (Array.isArray(msg.args.recognitionErrors)) {
          setRecognitionErrors(msg.args.recognitionErrors);
        }
        if (
          (msg.args.stage === "recognize" ||
            msg.args.stage === "recognize_done") &&
          Array.isArray(msg.args.items)
        ) {
          setItems(msg.args.items);
        }
        if (msg.args.layout?.regions) {
          layoutRegionsRef.current = msg.args.layout.regions;
          onLayoutDetected?.(msg.args.layout.regions);
        }
      }
    };
    browser?.runtime?.onMessage?.addListener?.(handleMessage);
    return () => {
      browser?.runtime?.onMessage?.removeListener?.(handleMessage);
    };
  }, [onLayoutDetected]);

  // 7. 自动执行一键翻译与换图状态重置
  const lastSourceRef = useRef({ imageDataUrl, imageBlob });
  useEffect(() => {
    if (!showBox) return;

    const isVersionChanged =
      requestVersion != null &&
      lastHandledVersionRef.current !== requestVersion;
    const isSourceChanged =
      lastSourceRef.current.imageDataUrl !== imageDataUrl ||
      lastSourceRef.current.imageBlob !== imageBlob;

    if (
      isVersionChanged ||
      isSourceChanged ||
      (initialAutoTranslate && !hasAutoTriggeredRef.current)
    ) {
      hasAutoTriggeredRef.current = true;
      lastHandledVersionRef.current = requestVersion;
      lastSourceRef.current = { imageDataUrl, imageBlob };

      // 无论上一张图是否在执行，换图均立刻中止旧任务并清空历史结果
      handleCancel();
      setItems([]);
      setError("");
      setRecognitionErrors([]);
      setHasExecuted(false);

      if (initialAutoTranslate) {
        runAction("all", { forceAll: true, forceCancelExisting: true });
      }
    }
  }, [
    showBox,
    initialAutoTranslate,
    requestVersion,
    imageDataUrl,
    imageBlob,
    handleCancel,
    runAction,
  ]);

  // 关闭面板重置状态
  useEffect(() => {
    if (!showBox) {
      hasAutoTriggeredRef.current = false;
      lastHandledVersionRef.current = null;
      setHasExecuted(false);
      setItems([]);
      setRecognitionErrors([]);
      handleCancel();
    }
  }, [showBox, handleCancel]);

  // 组件卸载清理
  useEffect(() => {
    return () => {
      handleCancel();
    };
  }, [handleCancel]);

  if (!showBox) return null;

  return (
    <div style={{ display: boxVisible ? "contents" : "none" }}>
      <DraggableResizable
        position={boxPosition}
        setPosition={setBoxPosition}
        size={boxSize}
        setSize={setBoxSize}
        minSize={{ w: 360, h: 260 }}
        maxSize={{ w: 1000, h: 800 }}
        autoHeight={false}
        header={
          <ImageTranslateHeader onClose={() => setShowBox(false)} i18n={i18n} />
        }
        onClick={(e) => e.stopPropagation()}
      >
        <ImageTranslateSettings
          scene={scene}
          apis={setting?.transApis || []}
          prompts={getAllPrompts(setting?.prompts || [])}
          busy={busy || sourceBusy}
          onSettingChange={handleSettingChange}
          i18n={i18n}
        />
        <ImageTranslateContent
          actions={
            <ImageTranslateActions
              scene={scene}
              apis={setting?.transApis || []}
              busy={busy || sourceBusy}
              stage={sourceBusy ? "reading" : stage}
              recognitionProgress={recognitionProgress}
              hasRecognizedText={items.some((i) =>
                Boolean(i.original || i.text)
              )}
              onRunAction={runAction}
              onCancel={
                sourceBusy && onCancelSource ? onCancelSource : handleCancel
              }
              i18n={i18n}
            />
          }
          items={items}
          recognitionErrors={recognitionErrors}
          busy={busy || sourceBusy}
          error={sourceError || error}
          hasRecognitionService={Boolean(scene?.recognitionService)}
          hasExecuted={hasExecuted}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRetry={
            sourceError ? onRetrySource : () => runAction(lastActionRef.current)
          }
          onRetryItem={handleRetryItem}
          i18n={i18n}
        />
      </DraggableResizable>
    </div>
  );
}
