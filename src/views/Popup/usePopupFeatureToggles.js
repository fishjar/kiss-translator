import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
} from "../../config";
import { useSetting } from "../../hooks/Setting";
import { kissLog } from "../../libs/log";
import { sendTabMsg } from "../../libs/msg";
import { queryPopupData } from "./loadData";

const FEATURES = [
  {
    name: "selection",
    capability: "selectionTranslation",
    child: "tranboxSetting",
    field: "transOpen",
    action: MSG_TRANSBOX_TOGGLE,
  },
  {
    name: "hover",
    capability: "hoverTranslation",
    child: "mouseHoverSetting",
    field: "useMouseHover",
    action: MSG_MOUSEHOVER_TOGGLE,
  },
  {
    name: "input",
    capability: "inputTranslation",
    child: "inputRule",
    field: "transOpen",
    action: MSG_TRANSINPUT_TOGGLE,
  },
];

const readEnabled = (setting, feature) => {
  const value = setting?.[feature.child]?.[feature.field];
  return value === true || value === "true";
};

const readFeatures = (setting) =>
  Object.fromEntries(
    FEATURES.map((feature) => [feature.name, readEnabled(setting, feature)])
  );

/** Confirm runtime changes before persisting their global preferences. */
export function usePopupFeatureToggles({
  setting,
  capabilities,
  processActions,
  targetTab,
  documentInfo,
  isDisabledPage = false,
  isVisible = true,
  onPageUnavailable,
}) {
  const { setting: storedSetting, updateSetting } = useSetting();
  const [values, setValues] = useState(() => readFeatures(setting));
  const [pending, setPending] = useState({});
  const [errors, setErrors] = useState({});
  const valuesRef = useRef({ ...values });
  const pendingRef = useRef({});
  const activeRef = useRef(true);
  const activityRef = useRef(0);
  const errorTimersRef = useRef({});
  const storedValuesRef = useRef(readFeatures(storedSetting));

  const syncValues = useCallback(() => {
    const next = { ...valuesRef.current };
    setValues((previous) =>
      FEATURES.every((feature) => previous[feature.name] === next[feature.name])
        ? previous
        : next
    );
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const errorTimers = errorTimersRef.current;
    return () => {
      activeRef.current = false;
      Object.values(errorTimers).forEach(window.clearTimeout);
    };
  }, []);

  useLayoutEffect(() => {
    // Hidden controls keep settling operations for the same page receiver.
    // Disabled-page status selects the path for new operations; rediscovery
    // retires the parent document generation rather than this status flag.
    activityRef.current += 1;
  }, [
    documentInfo?.token,
    documentInfo?.frameId,
    processActions,
    targetTab?.id,
  ]);

  useLayoutEffect(() => {
    const next = readFeatures(setting);
    for (const feature of FEATURES) {
      if (!pendingRef.current[feature.name]) {
        valuesRef.current[feature.name] = next[feature.name];
      }
    }
    syncValues();
  }, [setting, syncValues]);

  useLayoutEffect(() => {
    const next = readFeatures(storedSetting);
    for (const feature of FEATURES) {
      const name = feature.name;
      // The initial page snapshot may include unsaved runtime preferences.
      // Only subsequent storage changes override that initial runtime state.
      if (
        next[name] !== storedValuesRef.current[name] &&
        !pendingRef.current[name]
      ) {
        valuesRef.current[name] = next[name];
      }
    }
    storedValuesRef.current = next;
    syncValues();
  }, [storedSetting, syncValues]);

  const dispatchFeature = useCallback(
    async (feature, enabled) => {
      const args = { enabled };
      if (processActions) {
        const response = await processActions({ action: feature.action, args });
        if (response?.error) throw new Error(response.error);
        return response;
      }
      if (!Number.isInteger(targetTab?.id) || !documentInfo?.token) {
        throw new Error("The popup document is not ready.");
      }
      let result;
      try {
        result = await sendTabMsg(
          feature.action,
          args,
          undefined,
          targetTab.id,
          undefined,
          documentInfo.token
        );
      } catch (error) {
        const current = await queryPopupData(targetTab.id, documentInfo);
        if (current == null && activeRef.current) onPageUnavailable?.();
        throw error;
      }
      if (result?.error) {
        if (result.code === "STALE_DOCUMENT" && activeRef.current) {
          onPageUnavailable?.();
        }
        throw new Error(result.error);
      }
      // A broadcast acknowledgement alone cannot confirm a retired document.
      const response = await queryPopupData(targetTab.id, documentInfo);
      if (response == null && activeRef.current) onPageUnavailable?.();
      if (response?.error) throw new Error(response.error);
      return response;
    },
    [documentInfo, onPageUnavailable, processActions, targetTab?.id]
  );

  const toggleFeature = useCallback(
    async (name, enabled) => {
      const feature = FEATURES.find((candidate) => candidate.name === name);
      if (
        !feature ||
        !setting ||
        capabilities?.[feature.capability] === false ||
        pendingRef.current[name] ||
        !isVisible ||
        !activeRef.current
      ) {
        return;
      }
      const previous = valuesRef.current[name];
      const requested = enabled ?? !previous;
      const activity = activityRef.current;
      const isCurrent = () =>
        activeRef.current && activity === activityRef.current;
      pendingRef.current[name] = true;
      valuesRef.current[name] = requested;
      setValues({ ...valuesRef.current });
      setPending({ ...pendingRef.current });
      window.clearTimeout(errorTimersRef.current[name]);
      setErrors((current) => ({ ...current, [name]: false }));
      let runtimeConfirmed = false;
      try {
        if (!isDisabledPage) {
          const response = await dispatchFeature(feature, requested);
          if (!isCurrent()) return;
          const confirmed = response?.setting?.[feature.child]?.[feature.field];
          if (
            ![true, false, "true", "false"].includes(confirmed) ||
            readEnabled(response.setting, feature) !== requested
          ) {
            throw new Error("The global feature state was not confirmed.");
          }
          runtimeConfirmed = true;
        }
        if (typeof updateSetting !== "function") {
          throw new Error("Global settings are unavailable.");
        }
        await updateSetting((current) => {
          // The storage reducer can run after a queued write. Do not save a
          // preference for a document whose popup controls have been retired.
          if (!isCurrent()) return current;
          return {
            ...current,
            [feature.child]: {
              ...current?.[feature.child],
              [feature.field]: requested,
            },
          };
        });
      } catch (error) {
        if (!isCurrent()) return;
        kissLog("toggle popup global feature", name, error);
        let settled = previous;
        // Compensate a rejected persistence operation in the same document.
        if (runtimeConfirmed) {
          settled = requested;
          try {
            const rollback = await dispatchFeature(feature, previous);
            const confirmed =
              rollback?.setting?.[feature.child]?.[feature.field];
            if (![true, false, "true", "false"].includes(confirmed)) {
              throw new Error(
                "The restored global feature state was not confirmed."
              );
            }
            settled = readEnabled(rollback.setting, feature);
            if (settled !== previous) {
              throw new Error("The global feature could not be restored.");
            }
          } catch (rollbackError) {
            kissLog("restore popup global feature", name, rollbackError);
          }
        }
        if (!isCurrent()) return;
        valuesRef.current[name] = settled;
        setValues({ ...valuesRef.current });
        setErrors((current) => ({ ...current, [name]: true }));
        errorTimersRef.current[name] = window.setTimeout(() => {
          if (isCurrent()) {
            setErrors((current) => ({ ...current, [name]: false }));
          }
        }, 2000);
      } finally {
        if (isCurrent()) {
          delete pendingRef.current[name];
          setPending({ ...pendingRef.current });
        }
      }
    },
    [
      capabilities,
      dispatchFeature,
      isDisabledPage,
      isVisible,
      setting,
      updateSetting,
    ]
  );

  const features = setting
    ? FEATURES.filter(
        (feature) => capabilities?.[feature.capability] !== false
      ).map((feature) => ({
        name: feature.name,
        enabled: values[feature.name],
        pending: Boolean(pending[feature.name]),
        failed: Boolean(errors[feature.name]),
      }))
    : [];

  return {
    features,
    enabledCount: features.filter((feature) => feature.enabled).length,
    handleTransboxToggle: (enabled) => toggleFeature("selection", enabled),
    handleMouseHoverToggle: (enabled) => toggleFeature("hover", enabled),
    handleInputToggle: (enabled) => toggleFeature("input", enabled),
  };
}
