import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Navigator from "./Navigator";
import { useI18n } from "../../hooks/I18n";
import { useMediaQueryMatch } from "../../hooks/MediaQuery";
import { OPTIONS_STYLES } from "./styles";
import { normalizeOptionsPath } from "./paths";

const WIDE_PAGE_PATHS = new Set(["/apis", "/playground", "/prompts"]);

export const isWideOptionsPage = (pathname) =>
  WIDE_PAGE_PATHS.has(normalizeOptionsPath(pathname));

export async function fetchLatestVersion({ signal, now = Date.now } = {}) {
  const versionUrls = [
    process.env.REACT_APP_VERSION_URL,
    process.env.REACT_APP_VERSION_URL_GITHUB,
  ].filter(Boolean);
  let lastError;

  for (const versionUrl of versionUrls) {
    try {
      const response = await fetch(`${versionUrl}?t=${now()}`, { signal });
      if (!response.ok) {
        throw new Error(`Version request failed: ${response.status}`);
      }
      return (await response.text()).trim();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      lastError = error;
    }
  }

  throw lastError || new Error("No version URL configured");
}

export default function Layout() {
  const location = useLocation();
  const pathname = normalizeOptionsPath(location.pathname);
  const i18n = useI18n();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef(null);
  const backgroundRef = useRef(null);
  const [latestVersion, setLatestVersion] = useState("");
  const isMobile = useMediaQueryMatch("(max-width: 1179px)");
  const isWidePage = isWideOptionsPage(pathname);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return undefined;
    let active = true;
    const controller = new AbortController();
    fetchLatestVersion({ signal: controller.signal })
      .then((version) => {
        if (
          active &&
          version &&
          process.env.REACT_APP_VERSION &&
          version !== process.env.REACT_APP_VERSION
        ) {
          setLatestVersion(version);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.error("fetch version error:", error);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setNavigationOpen(false);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!isMobile || !navigationOpen) return undefined;
    const navigation = document.getElementById("kt-options-navigation");
    if (!navigation) return undefined;
    const scrollStyles = [
      document.documentElement.style,
      document.body.style,
    ].map((style) => {
      const overflowProperties = ["overflow", "overflow-x", "overflow-y"].map(
        (property) => [
          property,
          style.getPropertyValue(property),
          style.getPropertyPriority(property),
        ]
      );
      style.setProperty("overflow", "hidden", "important");
      return { style, overflowProperties };
    });
    const background = backgroundRef.current;
    const backgroundFocusTargets = getNavigationFocusTargets(background).map(
      (element) => [element, element.getAttribute("tabindex")]
    );
    backgroundFocusTargets.forEach(([element]) => {
      element.setAttribute("tabindex", "-1");
    });

    const focusNavigation = (last = false) => {
      const focusTargets = getNavigationFocusTargets(navigation);
      const target = last
        ? focusTargets[focusTargets.length - 1]
        : focusTargets[0];
      (target || navigation).focus();
    };
    focusNavigation();
    background?.setAttribute("aria-hidden", "true");
    background?.setAttribute("inert", "");

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavigationOpen(false);
        return;
      }
      const focusTargets = getNavigationFocusTargets(navigation);
      if (event.key !== "Tab") return;
      if (focusTargets.length === 0) {
        event.preventDefault();
        navigation.focus();
        return;
      }
      const first = focusTargets[0];
      const last = focusTargets[focusTargets.length - 1];
      if (!navigation.contains(document.activeElement)) {
        event.preventDefault();
        focusNavigation(event.shiftKey);
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        focusNavigation(true);
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        focusNavigation();
      }
    };

    const handleFocusIn = (event) => {
      if (!navigation.contains(event.target)) focusNavigation();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      background?.removeAttribute("aria-hidden");
      background?.removeAttribute("inert");
      backgroundFocusTargets.forEach(([element, tabIndex]) => {
        if (tabIndex === null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", tabIndex);
      });
      scrollStyles.forEach(({ style, overflowProperties }) => {
        overflowProperties.forEach(([property]) => {
          style.removeProperty(property);
        });
        overflowProperties.forEach(([property, value, priority]) => {
          if (value) style.setProperty(property, value, priority);
        });
      });
      navigationTriggerRef.current?.focus({ preventScroll: true });
    };
  }, [isMobile, navigationOpen]);

  const page = useMemo(() => {
    const pages = {
      "/": [i18n("options_overview"), i18n("options_overview_description")],
      "/styles": [
        i18n("options_appearance"),
        i18n("options_appearance_description"),
      ],
      "/rules": [
        i18n("options_web_translation"),
        i18n("options_web_description"),
      ],
      "/tranbox": [
        i18n("selection_translate"),
        i18n("options_selection_description"),
      ],
      "/mousehover": [
        i18n("mousehover_translate"),
        i18n("options_hover_description"),
      ],
      "/input": [i18n("input_translate"), i18n("options_input_description")],
      "/subtitle": [
        i18n("subtitle_translate"),
        i18n("options_subtitle_description"),
      ],
      "/apis": [
        i18n("options_translation_services"),
        i18n("options_services_description"),
      ],
      "/prompts": [
        i18n("prompt_management"),
        i18n("options_prompts_description"),
      ],
      "/sync": [i18n("options_data_sync"), i18n("options_sync_description")],
      "/words": [i18n("favorite_words"), i18n("options_words_description")],
      "/playground": ["Playground", ""],
      "/about": [i18n("about"), ""],
    };
    return pages[pathname] || pages["/"];
  }, [i18n, pathname]);

  return (
    <div className="kt-options-shell">
      <style>{OPTIONS_STYLES}</style>
      <div className="kt-options-background" ref={backgroundRef}>
        <Header
          navigationOpen={navigationOpen}
          onDrawerToggle={(event) => {
            navigationTriggerRef.current = event.currentTarget;
            setNavigationOpen(true);
          }}
        />
        <div className="kt-options-layout">
          {!isMobile && <Navigator open={false} isMobile={false} />}
          <main className="kt-options-main">
            <div
              className={`kt-options-main__inner ${
                isWidePage ? "kt-options-main__inner--wide" : ""
              }`.trim()}
            >
              <header className="kt-options-page-header">
                <h1>{page[0]}</h1>
                {page[1] && <p>{page[1]}</p>}
              </header>
              {latestVersion && (
                <div className="kt-options-version-alert" role="status">
                  <span>
                    {i18n("version_warning")
                      .replace("{0}", process.env.REACT_APP_VERSION)
                      .replace("{1}", latestVersion)}
                  </span>
                  <a
                    href={process.env.REACT_APP_RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {i18n("download_update")}
                  </a>
                </div>
              )}
              <div className="kt-options-page">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>
      {isMobile && navigationOpen && (
        <>
          <button
            type="button"
            className="kt-options-overlay kt-options-overlay--open"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setNavigationOpen(false)}
          />
          <Navigator open isMobile onClose={() => setNavigationOpen(false)} />
        </>
      )}
    </div>
  );
}

export function getNavigationFocusTargets(navigation) {
  if (!navigation) return [];
  return Array.from(
    navigation.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("hidden"));
}
