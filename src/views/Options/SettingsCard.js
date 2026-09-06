import { useEffect, useRef, useState } from "react";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

export function SettingsSection({ title, children, className = "" }) {
  return (
    <section className={`kt-settings-section ${className}`.trim()}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function SettingsCard({ children, className = "" }) {
  return (
    <Card
      component="ul"
      variant="outlined"
      className={`kt-settings-card ${className}`.trim()}
    >
      {children}
    </Card>
  );
}

export function SettingsRow({
  label,
  description,
  children,
  stacked = false,
  className = "",
}) {
  return (
    <ListItem
      disableGutters
      className={`kt-settings-row ${stacked ? "kt-settings-row--stacked" : ""} ${className}`.trim()}
    >
      <ListItemText
        className="kt-settings-row__copy"
        primary={label}
        secondary={description || null}
        primaryTypographyProps={{ component: "strong" }}
        secondaryTypographyProps={{ component: "span" }}
      />
      <Box className="kt-settings-row__control">{children}</Box>
    </ListItem>
  );
}

export function SettingsSwitch({ checked, onChange, label, disabled = false }) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      inputProps={{ "aria-label": label }}
    />
  );
}

export function SettingsSegmented({
  value,
  onChange,
  items,
  label,
  className = "",
}) {
  const itemRefs = useRef([]);
  const normalizedItems = items.map((item) =>
    typeof item === "object" ? item : { value: item, label: String(item) }
  );
  const enabledIndexes = normalizedItems.reduce((indexes, item, index) => {
    if (!item.disabled) indexes.push(index);
    return indexes;
  }, []);
  const selectedIndex = normalizedItems.findIndex(
    (item) => !item.disabled && item.value === value
  );
  const tabbableIndex =
    selectedIndex === -1 ? (enabledIndexes[0] ?? -1) : selectedIndex;

  const handleKeyDown = (event, currentIndex) => {
    let targetIndex;

    if (event.key === "Home") {
      targetIndex = enabledIndexes[0];
    } else if (event.key === "End") {
      targetIndex = enabledIndexes[enabledIndexes.length - 1];
    } else {
      const direction = {
        ArrowDown: 1,
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -1,
      }[event.key];

      if (direction === undefined || enabledIndexes.length === 0) return;

      const currentPosition = enabledIndexes.indexOf(currentIndex);
      const nextPosition =
        (currentPosition + direction + enabledIndexes.length) %
        enabledIndexes.length;
      targetIndex = enabledIndexes[nextPosition];
    }

    if (targetIndex === undefined) return;

    event.preventDefault();
    itemRefs.current[targetIndex]?.focus();
    const nextValue = normalizedItems[targetIndex].value;
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_event, nextValue) => {
        if (nextValue !== null) onChange(nextValue);
      }}
      className={`kt-settings-segmented ${className}`.trim()}
      aria-label={label}
      role="radiogroup"
    >
      {normalizedItems.map((normalized, index) => {
        const selected = normalized.value === value;
        return (
          <ToggleButton
            value={normalized.value}
            disabled={Boolean(normalized.disabled)}
            role="radio"
            aria-checked={selected}
            aria-pressed={undefined}
            aria-label={
              typeof normalized.label === "string"
                ? normalized.label
                : undefined
            }
            tabIndex={index === tabbableIndex ? 0 : -1}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            key={normalized.value}
          >
            <span className="kt-settings-segmented__label">
              {normalized.label}
            </span>
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}

export function SettingsSelect({
  value,
  onChange,
  options,
  label,
  multiple = false,
  disabled = false,
}) {
  return (
    <TextField
      select
      hiddenLabel
      size="small"
      variant="filled"
      className="kt-settings-select"
      value={value}
      disabled={disabled}
      SelectProps={{ multiple }}
      inputProps={{ "aria-label": label }}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => {
        const normalized = Array.isArray(option)
          ? { value: option[0], label: option[1] }
          : option;
        return (
          <MenuItem key={normalized.value} value={normalized.value}>
            {normalized.label}
          </MenuItem>
        );
      })}
    </TextField>
  );
}

export function SettingsRange({
  value,
  min,
  max,
  step = 1,
  unit = "",
  label,
  onChange,
}) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <Box className="kt-settings-range">
      <Slider
        value={draftValue}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onChange={(_event, nextValue) => setDraftValue(Number(nextValue))}
        onChangeCommitted={(_event, nextValue) => onChange(Number(nextValue))}
      />
      <Typography component="output">{`${draftValue}${unit}`}</Typography>
    </Box>
  );
}

export function ShortcutKeys({ keys = [] }) {
  if (keys.length === 0) {
    return <span className="kt-settings-keys kt-settings-keys--empty">—</span>;
  }

  return (
    <span className="kt-settings-keys" aria-label={keys.join("+")}>
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  );
}

export function SettingsAdvanced({
  label,
  children,
  open = false,
  rows = false,
  className = "",
}) {
  const [expanded, setExpanded] = useState(open);
  const [hasExpanded, setHasExpanded] = useState(open);

  useEffect(() => {
    setExpanded(open);
    if (open) setHasExpanded(true);
  }, [open]);

  const handleChange = (_event, nextExpanded) => {
    setExpanded(nextExpanded);
    if (nextExpanded) setHasExpanded(true);
  };

  return (
    <Box
      className={`kt-settings-advanced-shell ${
        rows ? "kt-settings-advanced-shell--rows" : ""
      } ${className}`.trim()}
    >
      <Accordion
        disableGutters
        expanded={expanded}
        onChange={handleChange}
        className="kt-settings-advanced"
      >
        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
          {label}
        </AccordionSummary>
        <AccordionDetails className="kt-settings-advanced__content">
          {rows ? (
            <Box component="ul" className="kt-settings-advanced__rows">
              {hasExpanded ? children : null}
            </Box>
          ) : hasExpanded ? (
            children
          ) : null}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
