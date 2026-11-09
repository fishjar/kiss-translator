import { useI18n } from "../../hooks/I18n";
import Control from "../FileTranslate/ServiceSelect";
import ExtensionLocalServiceNotice from "../../components/ExtensionLocalServiceNotice";

export default function ServiceSelect({ showModelNotice = true, ...props }) {
  const i18n = useI18n();
  const { scene, apis = [], multiple = false } = props;
  const selected = multiple ? scene.apiSlugs || [] : [scene.apiSlug || ""];
  return (
    <>
      <Control {...props} i18n={i18n} />
      {showModelNotice && (
        <ExtensionLocalServiceNotice
          apis={apis.filter((api) => selected.includes(api.apiSlug))}
          i18n={i18n}
          sx={{ mt: 1 }}
        />
      )}
    </>
  );
}
