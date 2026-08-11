import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { sendBgMsg } from "../../libs/msg";
import { useI18n } from "../../hooks/I18n";
import Header from "./Header";
import {
  MSG_OPEN_OPTIONS,
  MSG_OPEN_SEPARATE_WINDOW,
  DEFAULT_SETTING,
  GLOBLA_RULE,
  resolveApiPromptList,
} from "../../config";
import { kissLog } from "../../libs/log";
import PopupCont from "./PopupCont";
import TranForm from "../Selection/TranForm";
import { useSetting } from "../../hooks/Setting";
import { POPUP_STYLES } from "./styles";
import { loadPopupData } from "./loadData";

function TranslationTab() {
  const [text, setText] = useState("");
  const i18n = useI18n();
  const { setting } = useSetting();

  if (!setting?.tranboxSetting) {
    return (
      <div
        className="kt-popup-loading"
        role="status"
        aria-label={i18n("popup_loading")}
      >
        <AutorenewRoundedIcon />
      </div>
    );
  }

  const {
    tranboxSetting: {
      enDict,
      enSug,
      apiSlugs,
      fromLang,
      toLang,
      toLang2,
      aiDictApiSlug,
      aiDictPromptSlug,
    },
    transApis = [],
    langDetector = {},
    prompts = [],
    subtitleSetting,
  } = setting;
  const resolvedTransApis = resolveApiPromptList(
    transApis,
    prompts,
    subtitleSetting
  );

  return (
    <div className="kt-popup-text-panel">
      <TranForm
        text={text}
        setText={setText}
        apiSlugs={apiSlugs}
        fromLang={fromLang}
        toLang={toLang}
        toLang2={toLang2}
        transApis={resolvedTransApis}
        simpleStyle={false}
        langDetector={langDetector}
        enDict={enDict}
        enSug={enSug}
        aiDictApiSlug={aiDictApiSlug}
        aiDictPromptSlug={aiDictPromptSlug}
        prompts={prompts}
        popupStyle
      />
    </div>
  );
}

export default function Popup() {
  const i18n = useI18n();
  const [rule, setRule] = useState(null);
  const [setting, setSetting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("page");
  const [isSeparate, setIsSeparate] = useState(false);
  const popupShellRef = useRef(null);
  const initialFocusGuardRef = useRef(true);

  useLayoutEffect(() => {
    if (!isSeparate) {
      popupShellRef.current?.focus({ preventScroll: true });
    }
  }, [isSeparate]);

  useEffect(() => {
    if (isSeparate || isLoading) return undefined;

    let activationTimer;
    const clearSafariAutofocus = () => {
      if (!initialFocusGuardRef.current) return;
      const shell = popupShellRef.current;
      if (!shell) return;
      if (shell.contains(document.activeElement)) {
        document.activeElement?.blur?.();
      }
      shell.focus({ preventScroll: true });
    };
    const handleWindowFocus = (event) => {
      if (event.target !== window) return;
      window.clearTimeout(activationTimer);
      activationTimer = window.setTimeout(clearSafariAutofocus, 0);
    };

    window.addEventListener("focus", handleWindowFocus);
    const mountTimer = window.setTimeout(clearSafariAutofocus, 0);
    const settleTimer = window.setTimeout(clearSafariAutofocus, 120);
    const guardTimer = window.setTimeout(() => {
      initialFocusGuardRef.current = false;
      window.removeEventListener("focus", handleWindowFocus);
    }, 300);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.clearTimeout(activationTimer);
      window.clearTimeout(mountTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(guardTimer);
    };
  }, [isLoading, isSeparate]);

  const handleOpenSetting = useCallback(() => {
    sendBgMsg(MSG_OPEN_OPTIONS);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const previewMode =
          process.env.NODE_ENV === "development" &&
          new URLSearchParams(window.location.search).has("preview");
        if (previewMode) {
          setRule({
            ...GLOBLA_RULE,
            transOpen: "true",
            textStyle: "dash_line",
          });
          setSetting({
            ...DEFAULT_SETTING,
            uiLang: "zh",
            darkMode: "light",
            tranboxSetting: {
              ...DEFAULT_SETTING.tranboxSetting,
              transOpen: true,
            },
            mouseHoverSetting: {
              ...DEFAULT_SETTING.mouseHoverSetting,
              useMouseHover: true,
            },
          });
          return;
        }
        const cleanHash = window.location.hash.slice(1);
        if (cleanHash === "tranbox") {
          if (active) setIsSeparate(true);
          return;
        }
        const response = await loadPopupData();
        if (active && response && !response.error) {
          setRule(response.rule);
          setSetting(response.setting);
        }
      } catch (error) {
        kissLog("query rule", error);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const openSeparateWindow = useCallback(() => {
    sendBgMsg(MSG_OPEN_SEPARATE_WINDOW);
    window.close();
  }, []);

  const tabs = useMemo(
    () => [
      {
        value: "page",
        label: i18n("popup_page_translation"),
        tabId: "kt-popup-page-tab",
        panelId: "kt-popup-active-panel",
      },
      {
        value: "text",
        label: i18n("popup_text_translation"),
        tabId: "kt-popup-text-tab",
        panelId: "kt-popup-active-panel",
      },
    ],
    [i18n]
  );

  if (isSeparate) {
    return (
      <main className="kt-popup-shell kt-popup-shell--window">
        <style>{POPUP_STYLES}</style>
        <TranslationTab />
      </main>
    );
  }

  return (
    <main
      className="kt-popup-shell"
      ref={popupShellRef}
      tabIndex={-1}
      onPointerDownCapture={() => {
        initialFocusGuardRef.current = false;
      }}
      onKeyDownCapture={() => {
        initialFocusGuardRef.current = false;
      }}
    >
      <style>{POPUP_STYLES}</style>
      <div className="kt-popup-chrome">
        <Header
          openSeparateWindow={openSeparateWindow}
          openSettings={handleOpenSetting}
        />
        <Tabs
          className="kt-popup-tabs"
          value={activeTab}
          onChange={(_event, value) => setActiveTab(value)}
          aria-label={i18n("translate")}
          variant="fullWidth"
        >
          {tabs.map((tab) => (
            <Tab
              value={tab.value}
              label={tab.label}
              id={tab.tabId}
              aria-controls={tab.panelId}
              key={tab.value}
            />
          ))}
        </Tabs>
      </div>
      <div
        id="kt-popup-active-panel"
        role="tabpanel"
        aria-labelledby={`kt-popup-${activeTab}-tab`}
        className="kt-popup-scroll"
      >
        {activeTab === "text" ? (
          <TranslationTab />
        ) : rule && setting ? (
          <PopupCont
            rule={rule}
            setting={setting}
            setRule={setRule}
            setSetting={setSetting}
            handleOpenSetting={handleOpenSetting}
          />
        ) : isLoading ? (
          <div
            className="kt-popup-loading"
            role="status"
            aria-label={i18n("popup_loading")}
          >
            <AutorenewRoundedIcon />
          </div>
        ) : (
          <div className="kt-popup-empty">
            <span>{i18n("load_setting_err")}</span>
            <div className="kt-popup-empty__actions">
              <Button
                variant="text"
                onClick={() =>
                  window.open(
                    process.env.REACT_APP_REVIEW_URL,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                {i18n("comment_support")}
              </Button>
              <Button
                variant="text"
                onClick={() =>
                  window.open(
                    process.env.REACT_APP_SUPPORT_URL,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                {i18n("appreciate_support")}
              </Button>
              <Button variant="text" onClick={handleOpenSetting}>
                {i18n("setting")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
