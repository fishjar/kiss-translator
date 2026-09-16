import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "../../libs/browser";
import { getCurTab } from "../../libs/msg";
import { kissLog } from "../../libs/log";
import { loadPopupData } from "./loadData";
import { isCurrentPopupDocument } from "../../libs/popupDocument";

/** Keep page data and edits attached to the tab captured by this popup. */
export function usePopupPage({ enabled = true, initialData = null } = {}) {
  const generationRef = useRef(0);
  const rediscoverRef = useRef(null);
  const [page, setPage] = useState(() => ({
    generation: 0,
    tab: null,
    data: initialData,
    isLoading: enabled,
  }));

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let targetTab = null;
    let targetWindowId;
    let pendingTabRead = false;
    let tabEventsDuringRead = false;
    let retryTimer;
    let currentDocument;
    let documentGeneration;
    let updateSequence = 0;
    const advanceGeneration = () => ++generationRef.current;

    const invalidate = (tab, isLoading) => {
      const generation = advanceGeneration();
      updateSequence += 1;
      window.clearTimeout(retryTimer);
      currentDocument = null;
      documentGeneration = undefined;
      pendingTabRead = false;
      tabEventsDuringRead = false;
      targetTab = tab;
      setPage({ generation, tab, data: null, isLoading });
      return generation;
    };

    const watchDocument = async (tab, generation, documentInfo, sequence) => {
      const current = await isCurrentPopupDocument(tab.id, documentInfo);
      if (
        !active ||
        generation !== generationRef.current ||
        sequence !== updateSequence
      )
        return;
      if (targetTab?.status !== "loading") return;
      if (current) {
        retryTimer = window.setTimeout(
          () => void watchDocument(tab, generation, documentInfo, sequence),
          250
        );
      } else {
        void load(tab, invalidate(tab, true));
      }
    };

    const load = async (tab, generation, retryWhileLoading = true) => {
      try {
        const data = await loadPopupData({ tabId: tab.id });
        if (!active || generation !== generationRef.current) return;
        const available = data?.rule && data?.setting && !data.error;
        const waiting =
          !available && retryWhileLoading && tab.status === "loading";
        if (available) {
          currentDocument = data.document;
          documentGeneration = generation;
        }
        setPage({
          generation,
          tab,
          data: available ? data : null,
          isLoading: waiting,
        });
        if (waiting) {
          // A committed document can initialize its runtime before its images
          // and child frames finish. Retry verified reads during that interval.
          retryTimer = window.setTimeout(() => void load(tab, generation), 250);
        } else if (available && tab.status === "loading" && data.document) {
          // Keep checking identity, not rule values: background resources may
          // still be loading, and a same-URL navigation need not change tab.url.
          retryTimer = window.setTimeout(
            () =>
              void watchDocument(
                tab,
                generation,
                data.document,
                updateSequence
              ),
            250
          );
        }
      } catch (error) {
        kissLog("load popup page", error);
        if (active && generation === generationRef.current) {
          setPage({ generation, tab, data: null, isLoading: false });
        }
      }
    };

    const selectTab = async (getTab, initialTab = null) => {
      const generation = invalidate(initialTab, true);
      pendingTabRead = true;
      tabEventsDuringRead = false;
      try {
        const tab = await getTab();
        if (!active || generation !== generationRef.current) return;
        pendingTabRead = false;
        if (tabEventsDuringRead) {
          // The initial tab query can resolve with a pre-navigation snapshot.
          void selectTab(getCurTab);
          return;
        }
        if (!Number.isInteger(tab?.id) || tab.id < 0) {
          invalidate(null, false);
          return;
        }
        targetTab = tab;
        targetWindowId = tab.windowId;
        setPage({ generation, tab, data: null, isLoading: true });
        void load(tab, generation);
      } catch (error) {
        kissLog("get popup target tab", error);
        if (active && generation === generationRef.current) {
          pendingTabRead = false;
          invalidate(null, false);
        }
      }
    };

    const invalidateInitialRead = () => {
      if (targetTab || !pendingTabRead) return false;
      tabEventsDuringRead = true;
      return true;
    };

    const handleUpdated = async (tabId, changeInfo, tab) => {
      if (invalidateInitialRead()) return;
      if (tabId !== targetTab?.id) return;
      if (!changeInfo.url && !changeInfo.status) return;
      const sequence = ++updateSequence;
      window.clearTimeout(retryTimer);
      const nextTab = { ...targetTab, ...tab, ...changeInfo, id: tabId };
      const sameUrl = nextTab.url === targetTab.url;
      // Keep recovery attached to the latest tab snapshot even while this
      // event's asynchronous identity check is still pending.
      targetTab = nextTab;
      if (
        sameUrl &&
        currentDocument &&
        documentGeneration === generationRef.current
      ) {
        const generation = generationRef.current;
        const current = await isCurrentPopupDocument(tabId, currentDocument);
        if (
          !active ||
          generation !== generationRef.current ||
          sequence !== updateSequence
        )
          return;
        if (current) {
          // Child-frame navigation and slow resources can change tab status
          // while the displayed document and its pending edits remain current.
          setPage((previous) => ({ ...previous, tab: nextTab }));
          if (nextTab.status === "loading") {
            retryTimer = window.setTimeout(
              () =>
                void watchDocument(
                  nextTab,
                  generation,
                  currentDocument,
                  sequence
                ),
              250
            );
          }
          return;
        }
      }
      const generation = invalidate(nextTab, true);
      void load(nextTab, generation);
    };
    const handleRemoved = (tabId) => {
      if (invalidateInitialRead()) return;
      if (tabId === targetTab?.id) invalidate(null, false);
    };
    const handleActivated = ({ tabId, windowId }) => {
      if (invalidateInitialRead()) return;
      if (windowId !== targetWindowId) return;
      if (tabId === targetTab?.id) return;
      void selectTab(() => browser.tabs.get(tabId), { id: tabId, windowId });
    };

    rediscoverRef.current = (generation) => {
      if (!active || generation !== generationRef.current) return;
      const tab = targetTab;
      if (!tab) {
        invalidate(null, false);
        return;
      }
      // Retire the failed receiver before independently discovering another
      // verified runtime. Its snapshot cannot confirm or replay the old action.
      // A failed recovery settles as unavailable even if tab status is stale.
      void load(tab, invalidate(tab, true), false);
    };

    browser?.tabs?.onUpdated?.addListener?.(handleUpdated);
    browser?.tabs?.onRemoved?.addListener?.(handleRemoved);
    browser?.tabs?.onActivated?.addListener?.(handleActivated);
    void selectTab(getCurTab);
    return () => {
      active = false;
      rediscoverRef.current = null;
      window.clearTimeout(retryTimer);
      advanceGeneration();
      browser?.tabs?.onUpdated?.removeListener?.(handleUpdated);
      browser?.tabs?.onRemoved?.removeListener?.(handleRemoved);
      browser?.tabs?.onActivated?.removeListener?.(handleActivated);
    };
  }, [enabled]);

  const updateData = useCallback(
    (key, update) => {
      const generation = page.generation;
      // Old action handlers can outlive their mounted panel after navigation.
      if (generation !== generationRef.current) return;
      setPage((previous) => {
        if (previous.generation !== generation || !previous.data)
          return previous;
        const value = previous.data[key];
        return {
          ...previous,
          data: {
            ...previous.data,
            [key]: typeof update === "function" ? update(value) : update,
          },
        };
      });
    },
    [page.generation]
  );
  const setRule = useCallback(
    (update) => updateData("rule", update),
    [updateData]
  );
  const setSetting = useCallback(
    (update) => updateData("setting", update),
    [updateData]
  );

  const markUnavailable = useCallback(() => {
    rediscoverRef.current?.(page.generation);
  }, [page.generation]);

  return { ...page, setRule, setSetting, markUnavailable };
}
