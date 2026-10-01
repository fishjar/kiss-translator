import { useI18n } from "../../hooks/I18n";
import { usePromptList } from "../../hooks/Prompt";
import Control from "../FileTranslate/ScenePromptSelect";

export default function ScenePromptSelect(props) {
  const i18n = useI18n();
  const { prompts } = usePromptList();
  return <Control {...props} i18n={i18n} prompts={prompts} />;
}
