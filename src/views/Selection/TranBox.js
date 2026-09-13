import DraggableResizable from "./DraggableResizable";
import TranslationPanelHeader from "../../components/TranslationPanel/Header";
import TranslationPanelContent from "../../components/TranslationPanel/Content";
import { MSG_OPEN_SEPARATE_WINDOW } from "../../config/msg";
import { sendBgMsg } from "../../libs/msg";
import { isExt } from "../../libs/client";
import { isValidWord } from "../../libs/utils";

export { getOverflowMenuPosition } from "../../components/TranslationPanel/Header";

const openSeparateWindow = () => sendBgMsg(MSG_OPEN_SEPARATE_WINDOW);

/** Add selection behavior and its draggable host to the shared panel. */
export default function TranBox(props) {
  const simpleStyle = props.simpleStyle;
  const setSimpleStyle = props.setSimpleStyle;
  const hideClickAway = props.hideClickAway;
  const setHideClickAway = props.setHideClickAway;
  const followSelection = props.followSelection;
  const setFollowSelection = props.setFollowSelection;

  let realApiSlugs = props.tranboxSetting.apiSlugs;
  // Skip translation for single words when configured to show only dictionary results and suggestions.
  if (props.tranboxSetting.singleWordNoTrans && isValidWord(props.text)) {
    // Clear the translation engine API slugs.
    realApiSlugs = [];
  }

  return props.showBox ? (
    <DraggableResizable
      position={props.boxPosition}
      size={props.boxSize}
      setSize={props.setBoxSize}
      setPosition={props.setBoxPosition}
      autoHeight={props.tranboxSetting.autoHeight}
      header={
        <TranslationPanelHeader
          onClose={() => props.setShowBox(false)}
          onOpenSeparateWindow={isExt ? openSeparateWindow : undefined}
          draggable
          simpleStyle={simpleStyle}
          setSimpleStyle={setSimpleStyle}
          hideClickAway={hideClickAway}
          setHideClickAway={setHideClickAway}
          followSelection={followSelection}
          setFollowSelection={setFollowSelection}
        />
      }
      onClick={(e) => e.stopPropagation()}
    >
      <TranslationPanelContent
        simpleStyle={simpleStyle}
        text={props.text}
        setText={props.setText}
        apiSlugs={realApiSlugs}
        fromLang={props.tranboxSetting.fromLang}
        toLang={props.tranboxSetting.toLang}
        toLang2={props.tranboxSetting.toLang2}
        transApis={props.transApis}
        prompts={props.prompts}
        langDetector={props.langDetector}
        translateVariants={props.translateVariants}
        parseLatex={props.parseLatex}
        enDict={props.tranboxSetting.enDict}
        enSug={props.tranboxSetting.enSug}
        aiDictApiSlug={props.tranboxSetting.aiDictApiSlug}
        aiDictPromptSlug={props.tranboxSetting.aiDictPromptSlug}
        selectionContext={props.selectionContext}
      />
    </DraggableResizable>
  ) : null;
}
