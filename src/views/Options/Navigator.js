import { useMemo, useState } from "react";
import ApiRoundedIcon from "@mui/icons-material/ApiRounded";
import BookmarksRoundedIcon from "@mui/icons-material/BookmarksRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import CloudSyncRoundedIcon from "@mui/icons-material/CloudSyncRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import KeyboardRoundedIcon from "@mui/icons-material/KeyboardRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import SegmentRoundedIcon from "@mui/icons-material/SegmentRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import SubtitlesRoundedIcon from "@mui/icons-material/SubtitlesRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { NavLink } from "react-router-dom";
import Logo from "../../components/Logo";
import { useI18n } from "../../hooks/I18n";
import { useSetting } from "../../hooks/Setting";

function normalizeSearchText(text, uiLang) {
  try {
    return text.toLocaleLowerCase(uiLang?.replace(/_/g, "-") || undefined);
  } catch {
    return text.toLocaleLowerCase();
  }
}

export default function Navigator({ open, isMobile = false, onClose }) {
  const i18n = useI18n();
  const {
    setting: { uiLang },
  } = useSetting();
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => [
      {
        label: i18n("options_group_general"),
        items: [
          ["overview", i18n("options_overview"), "/", TuneRoundedIcon],
          [
            "appearance",
            i18n("options_appearance"),
            "/styles",
            PaletteRoundedIcon,
          ],
        ],
      },
      {
        label: i18n("options_group_scenarios"),
        items: [
          [
            "web",
            i18n("options_web_translation"),
            "/rules",
            LanguageRoundedIcon,
          ],
          [
            "selection",
            i18n("selection_translate"),
            "/tranbox",
            SelectAllRoundedIcon,
          ],
          ["hover", i18n("touch_paragraph"), "/mousehover", SegmentRoundedIcon],
          ["input", i18n("input_translate"), "/input", KeyboardRoundedIcon],
          [
            "subtitle",
            i18n("subtitle_translate"),
            "/subtitle",
            SubtitlesRoundedIcon,
          ],
        ],
      },
      {
        label: i18n("options_group_services"),
        items: [
          [
            "apis",
            i18n("options_translation_services"),
            "/apis",
            ApiRoundedIcon,
          ],
          [
            "prompts",
            i18n("prompt_management"),
            "/prompts",
            DescriptionRoundedIcon,
          ],
        ],
      },
      {
        label: i18n("options_group_data"),
        items: [
          ["sync", i18n("options_data_sync"), "/sync", CloudSyncRoundedIcon],
          ["words", i18n("favorite_words"), "/words", BookmarksRoundedIcon],
        ],
      },
      {
        label: "",
        items: [
          ["playground", "Playground", "/playground", BugReportRoundedIcon],
          ["about", i18n("about"), "/about", InfoRoundedIcon],
        ],
      },
    ],
    [i18n]
  );

  const normalizedQuery = normalizeSearchText(query.trim(), uiLang);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(([, label]) =>
        normalizeSearchText(label, uiLang).includes(normalizedQuery)
      ),
    }))
    .filter((group) => group.items.length);

  return (
    <aside
      id="kt-options-navigation"
      className={`kt-options-sidebar ${open ? "kt-options-sidebar--open" : ""}`}
      role={isMobile ? "dialog" : undefined}
      aria-modal={isMobile ? "true" : undefined}
      aria-labelledby={isMobile ? "kt-options-navigation-title" : undefined}
      tabIndex={isMobile ? -1 : undefined}
    >
      <a
        className="kt-options-brand"
        href={process.env.REACT_APP_HOMEPAGE}
        target="_blank"
        rel="noreferrer"
      >
        <Logo size={30} />
        <span>
          <span
            id="kt-options-navigation-title"
            className="kt-options-brand__name"
          >
            {i18n("app_name")}
          </span>
          <span className="kt-options-brand__version">
            v{process.env.REACT_APP_VERSION}
          </span>
        </span>
      </a>
      <label className="kt-options-search">
        <SearchRoundedIcon />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={i18n("options_search")}
          aria-label={i18n("options_search")}
        />
      </label>
      <nav className="kt-options-nav">
        {visibleGroups.length ? (
          visibleGroups.map((group) => (
            <section
              className="kt-options-nav__group"
              key={group.label || "other"}
            >
              {group.label && (
                <h2 className="kt-options-nav__label">{group.label}</h2>
              )}
              {group.items.map(([id, label, path, Icon]) => (
                <NavLink
                  className="kt-options-nav__link"
                  to={path}
                  end={path === "/"}
                  key={id}
                  onClick={isMobile ? onClose : undefined}
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
            </section>
          ))
        ) : (
          <div className="kt-options-nav__empty">
            {i18n("options_no_results")}
          </div>
        )}
      </nav>
      {isMobile && (
        <button
          type="button"
          className="kt-options-sidebar__close"
          aria-label={i18n("options_close_navigation")}
          onClick={onClose}
        >
          <CloseRoundedIcon />
        </button>
      )}
    </aside>
  );
}
