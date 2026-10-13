import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBlocker } from "react-router-dom";
import { useConfirm } from "../../hooks/Confirm";
import { useI18n } from "../../hooks/I18n";

const RuleDraftContext = createContext(null);

function RuleNavigationGuard() {
  const { hasDrafts, confirmDiscard } = useContext(RuleDraftContext);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasDrafts && currentLocation.pathname !== nextLocation.pathname
  );
  const pendingRef = useRef(false);

  useEffect(() => {
    if (blocker.state !== "blocked" || pendingRef.current) return;
    pendingRef.current = true;
    confirmDiscard().then((discard) => {
      pendingRef.current = false;
      if (discard) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirmDiscard]);

  return null;
}

export function RuleDraftProvider({ guardNavigation, children }) {
  const [drafts, setDrafts] = useState(() => new Set());
  const confirm = useConfirm();
  const i18n = useI18n();
  const hasDrafts = drafts.size > 0;
  const updateDraft = useCallback((id, modified) => {
    setDrafts((previous) => {
      if (previous.has(id) === modified) return previous;
      const next = new Set(previous);
      if (modified) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const confirmDiscard = useCallback(
    async (id) => {
      if (id === undefined ? !hasDrafts : !drafts.has(id)) return true;
      return confirm({
        message: i18n("discard_rule_changes_confirm"),
        confirmText: i18n("discard_changes"),
        cancelText: i18n("cancel"),
      });
    },
    [confirm, drafts, hasDrafts, i18n]
  );

  useEffect(() => {
    if (!hasDrafts) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDrafts]);

  const value = useMemo(
    () => ({ drafts, hasDrafts, updateDraft, confirmDiscard }),
    [drafts, hasDrafts, updateDraft, confirmDiscard]
  );
  return (
    <RuleDraftContext.Provider value={value}>
      {guardNavigation && <RuleNavigationGuard />}
      {children}
    </RuleDraftContext.Provider>
  );
}

export function useRuleDrafts() {
  return useContext(RuleDraftContext);
}

export function useRuleDraft(id, modified) {
  const { updateDraft } = useRuleDrafts();
  useEffect(() => {
    updateDraft(id, modified);
    return () => updateDraft(id, false);
  }, [id, modified, updateDraft]);
}
