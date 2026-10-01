import { useI18n } from "../../hooks/I18n";
import Control from "../FileTranslate/OrderedApiSelect";

export default function OrderedApiSelect(props) {
  const i18n = useI18n();
  return <Control {...props} i18n={i18n} />;
}
