import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { useRef } from "react";

export default function CompactLanguageSelect({
  ariaLabel,
  value,
  options,
  onChange,
}) {
  const selectRef = useRef(null);

  return (
    <Select
      ref={selectRef}
      className="kt-popup-language-select"
      value={value}
      variant="standard"
      disableUnderline
      inputProps={{ "aria-label": ariaLabel }}
      MenuProps={{
        container: () => selectRef.current?.closest(".kt-m3-root"),
        disableScrollLock: true,
        PaperProps: {
          className: "kt-popup-language-menu",
          elevation: 0,
        },
        MenuListProps: {
          dense: true,
        },
      }}
      onChange={onChange}
    >
      {options.map(([key, name]) => (
        <MenuItem key={key} value={key}>
          {name.split(" - ")[0]}
        </MenuItem>
      ))}
    </Select>
  );
}
