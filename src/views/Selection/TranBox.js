import { useMemo } from "react";
import DraggableResizable from "./DraggableResizable";
import TranslationPanelHeader from "../../components/TranslationPanel/Header";
import TranslationPanelContent from "../../components/TranslationPanel/Content";
import { MSG_OPEN_SEPARATE_WINDOW } from "../../config/msg";
import { resolveApiPromptList, withScenePrompt } from "../../config";
import { sendBgMsg } from "../../libs/msg";
import { isExt } from "../../libs/client";
import { isValidWord } from "../../libs/utils";
import useTranboxFocus from "../../hooks/useTranboxFocus";

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
  const panelRef = useTranboxFocus({
    showBox: props.showBox,
    hideOnBlur: hideClickAway,
    setShowBox: props.setShowBox,
  });

  let realApiSlugs = props.tranboxSetting.apiSlugs;
  // Skip translation for single words when configured to show only dictionary results and suggestions.
  if (props.tranboxSetting.singleWordNoTrans && isValidWord(props.text)) {
    // Clear the translation engine API slugs.
    realApiSlugs = [];
  }

  const resolvedTransApis = useMemo(() => {
    if (!props.transApis) return [];
    const withPrompt = props.transApis.map((api) =>
      withScenePrompt(api, props.tranboxSetting)
    );
    return resolveApiPromptList(
      withPrompt,
      props.prompts,
      props.subtitleSetting
    );
  }, [
    props.transApis,
    props.tranboxSetting,
    props.prompts,
    props.subtitleSetting,
  ]);

  const scene = useMemo(() => {
    if (!props.rule) {
      return props.tranboxSetting;
    }
    return {
      ...props.tranboxSetting,
      terms: props.rule.terms || "",
      aiTerms: props.rule.aiTerms || "",
      termsList: props.rule.termsList || [],
      ...(props.rule.terminologySources && {
        terminologySources: props.rule.terminologySources,
      }),
    };
  }, [props.rule, props.tranboxSetting]);

  return props.showBox ? (
    <DraggableResizable
      panelRef={panelRef}
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
        scene={scene}
        ttsApiSlug={props.tranboxSetting.ttsApiSlug || ""}
        simpleStyle={simpleStyle}
        text={props.text}
        setText={props.setText}
        syncExternalTextWhileEditing
        apiSlugs={realApiSlugs}
        fromLang={props.tranboxSetting.fromLang}
        toLang={props.tranboxSetting.toLang}
        toLang2={props.tranboxSetting.toLang2}
        transApis={resolvedTransApis}
        prompts={props.prompts}
        langDetector={props.langDetector}
        translateVariants={props.translateVariants}
        parseLatex={props.parseLatex}
        enDict={props.tranboxSetting.enDict}
        enSug={props.tranboxSetting.enSug}
        aiDictApiSlug={props.tranboxSetting.aiDictApiSlug}
        aiDictPromptSlug={props.tranboxSetting.aiDictPromptSlug}
        selectionContext={props.selectionContext}
        selectionSource={props.selectionSource}
      />
    </DraggableResizable>
  ) : null;
}
