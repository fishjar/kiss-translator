import {
  isApiConfigured,
  supportsApiCapability,
} from "../../config/serviceSelection";
import { SettingsSelect } from "../Options/SettingsCard";
import LocalServiceNotice from "../../components/LocalServiceNotice";

export default function ServiceSelect({
  i18n,
  scene,
  apis = [],
  label,
  onChange,
  fullWidth = false,
  hiddenLabel,
  multiple = false,
  showModelNotice = true,
  ...rest
}) {
  const selected = multiple ? scene.apiSlugs || [] : scene.apiSlug || "";
  const services = apis.filter(
    (api) =>
      api.apiSlug === "*" ||
      (isApiConfigured(api) && supportsApiCapability(api, "translate"))
  );
  const options = services.map((api) => ({
    value: api.apiSlug,
    label:
      api.translationAvailable === false
        ? `${api.apiName || api.apiSlug} (${i18n("api_unavailable_here", "unavailable here")})`
        : api.apiName || api.apiSlug,
  }));
  for (const slug of multiple ? selected : selected ? [selected] : []) {
    if (!options.some((option) => option.value === slug))
      options.push({
        value: slug,
        label: `${slug} (${i18n("api_unavailable_here", "unavailable here")})`,
      });
  }
  return (
    <>
    <SettingsSelect
      name={multiple ? "apiSlugs" : "apiSlug"}
      {...rest}
      multiple={multiple}
      fullWidth={fullWidth}
      hiddenLabel={hiddenLabel !== undefined ? hiddenLabel : !fullWidth}
      value={selected}
      label={label || i18n("translate_service", "翻译服务")}
      options={options}
      onChange={onChange}
    />
    {showModelNotice && <LocalServiceNotice
      apis={apis.filter((api) => (multiple ? selected : [selected]).includes(api.apiSlug))}
      i18n={i18n} sx={{ mt: 1 }}
    />}
    </>
  );
}
