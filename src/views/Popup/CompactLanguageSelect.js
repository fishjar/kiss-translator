import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import { useEffect, useId, useRef, useState } from "react";
import PopupMenu from "./PopupMenu";
import { useI18n } from "../../hooks/I18n";

function splitLanguageName(name = "") {
  const [primary, ...parts] = name.split(" - ");
  const secondary = parts.join(" - ").trim();
  return {
    primary,
    secondary:
      secondary.toLowerCase() === primary.toLowerCase() ? "" : secondary,
  };
}

export default function CompactLanguageSelect({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  changed = false,
}) {
  const i18n = useI18n();
  const languageOptions = options.map(([key, name]) => [
    key,
    key === "auto" ? i18n("popup_auto_detect") : name,
  ]);
  const [anchorEl, setAnchorEl] = useState(null);
  const selectedRef = useRef(null);
  const menuId = useId();
  const name =
    languageOptions.find(([key]) => key === value)?.[1] || value || "";
  const { primary } = splitLanguageName(name);
  useEffect(() => {
    if (!anchorEl) return undefined;
    const frame = requestAnimationFrame(() => {
      const item = selectedRef.current;
      const paper = item?.closest(".kt-popup-language-menu");
      if (paper && item)
        paper.scrollTop =
          item.offsetTop - (paper.clientHeight - item.offsetHeight) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorEl]);
  return (
    <>
      <button
        type="button"
        className="kt-popup-language-select"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={Boolean(anchorEl)}
        aria-controls={anchorEl ? menuId : undefined}
        aria-haspopup="listbox"
        title={name}
        disabled={disabled}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setAnchorEl(event.currentTarget);
          }
        }}
      >
        <span className="kt-popup-language-value">
          <span className="kt-popup-language-value__primary">{primary}</span>
        </span>
        <ArrowDropDownRoundedIcon aria-hidden="true" />
        {changed && <span className="kt-popup-dirty-dot" aria-hidden="true" />}
      </button>
      <PopupMenu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        id={menuId}
        ariaLabel={ariaLabel}
        className="kt-popup-language-menu"
        estimatedHeight={320}
        menuRole="listbox"
      >
        {languageOptions.flatMap(([key, languageName], index) => {
          const { primary: nativeName, secondary } =
            splitLanguageName(languageName);
          const selected = key === value;
          const item = (
            <MenuItem
              key={key}
              value={key}
              role="option"
              aria-selected={selected}
              selected={selected}
              ref={selected ? selectedRef : undefined}
              onClick={() => {
                onChange({ target: { value: key } });
                setAnchorEl(null);
              }}
            >
              <span className="kt-popup-language-option__copy">
                <span className="kt-popup-language-menu__primary">
                  {nativeName}
                </span>
                {secondary && (
                  <small className="kt-popup-language-menu__secondary">
                    {secondary}
                  </small>
                )}
              </span>
              {selected && (
                <CheckRoundedIcon
                  className="kt-popup-menu-check"
                  aria-hidden="true"
                />
              )}
            </MenuItem>
          );
          return index === 0 && key === "auto"
            ? [item, <Divider key="auto-divider" />]
            : [item];
        })}
      </PopupMenu>
    </>
  );
}
