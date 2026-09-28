import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { orderedApiSlugs } from "../../config";
import { useI18n } from "../../hooks/I18n";
import { SettingsSelect } from "./SettingsCard";

export default function OrderedApiSelect({
  scene,
  apis = [],
  label,
  onChange,
  disabled = false,
  fullWidth = false,
  hiddenLabel,
  showOrderList = true,
  sx,
  variant,
  multiple = true,
  ...rest
}) {
  const i18n = useI18n();
  const displayLabel = label || i18n("translate_service", "翻译服务");
  const isHiddenLabel = hiddenLabel !== undefined ? hiddenLabel : !fullWidth;
  const selected = orderedApiSlugs(scene);
  const translationApis = apis.filter(
    (api) =>
      api.apiSlug === "*" ||
      (api.capabilities || ["translation"]).includes("translation")
  );
  const names = new Map(
    translationApis.map((api) => [api.apiSlug, api.apiName || api.apiSlug])
  );
  const options = [
    ...translationApis.map((api) => ({
      value: api.apiSlug,
      label: names.get(api.apiSlug),
    })),
  ];
  selected.forEach((slug) => {
    if (!names.has(slug))
      options.push({
        value: slug,
        label: `${slug} (${i18n("api_unavailable_here", "unavailable here")})`,
      });
  });
  const move = (index, offset) => {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  const change = (values) => {
    if (!multiple) {
      const nextSlug =
        typeof values === "string"
          ? values
          : Array.isArray(values)
            ? values[0]
            : "";
      onChange(nextSlug ? [nextSlug] : []);
      return;
    }
    if (values.includes("*") && values.length > 1) {
      onChange(
        selected.includes("*") ? values.filter((value) => value !== "*") : ["*"]
      );
    } else {
      onChange(values);
    }
  };
  return (
    <Box sx={{ ...(fullWidth ? { width: "100%" } : {}), ...sx }}>
      <SettingsSelect
        multiple={multiple}
        fullWidth={fullWidth}
        hiddenLabel={isHiddenLabel}
        value={multiple ? selected : selected[0] || ""}
        label={displayLabel}
        options={options}
        onChange={change}
        disabled={disabled}
        variant={variant}
        {...rest}
      />
      {multiple &&
        showOrderList &&
        selected.map((slug, index) => (
          <Box
            key={slug}
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              mt: 0.5,
              fontSize: "12px",
              color: "text.secondary",
            }}
          >
            <span>
              {index + 1}. {names.get(slug) || slug}
            </span>
            <Button
              size="small"
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              aria-label={`${slug} up`}
              sx={{ minWidth: 24, px: 0.5, py: 0 }}
            >
              ↑
            </Button>
            <Button
              size="small"
              disabled={disabled || index === selected.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`${slug} down`}
              sx={{ minWidth: 24, px: 0.5, py: 0 }}
            >
              ↓
            </Button>
          </Box>
        ))}
    </Box>
  );
}
