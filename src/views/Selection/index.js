import TranBtn from "./TranBtn";
import TranBox from "./TranBox";
import useTranBoxState from "../../hooks/useTranBoxState";
import useSelectionController from "../../hooks/useSelectionController";
import useTranboxShortcuts from "../../hooks/useTranboxShortcuts";
import ThemeProvider from "../../hooks/M3Theme";
import { SettingProvider } from "../../hooks/Setting";
import { SELECTION_STYLES } from "./styles";
import { newI18n } from "../../config";

/**
 * Entry point for selection translation interactions.
 *
 * @param {Object} props
 * @param {string} props.contextMenuType - Browser context menu type or configuration.
 * @param {Object} props.tranboxSetting - Selection translation panel settings.
 * @param {Array} props.transApis - Enabled translation API settings.
 * @param {string} props.uiLang - Extension UI language.
 * @param {Object} props.langDetector - Language detector settings.
 */
export default function Selection({
  contextMenuType,
  tranboxSetting,
  transApis,
  prompts,
  uiLang,
  langDetector,
  translateVariants = true,
  extStyles,
}) {
  const i18n = newI18n(uiLang || "zh");
  // 1. Manage the panel's size, position, simple mode, and click-away behavior.
  const {
    boxSize,
    setBoxSize,
    boxPosition,
    setBoxPosition,
    simpleStyle,
    setSimpleStyle,
    hideClickAway,
    setHideClickAway,
    followSelection,
    setFollowSelection,
    boxOffsetX,
    boxOffsetY,
  } = useTranBoxState(tranboxSetting);

  // 2. Listen for global selection changes to position and show the button and panel.
  const {
    showBox,
    setShowBox,
    showBtn,
    text,
    setText,
    textContext,
    position,
    handleOpenTranbox,
    handleToggleTranbox,
    btnEvent,
  } = useSelectionController({
    tranboxSetting,
    followSelection,
    boxOffsetX,
    boxOffsetY,
    boxSize,
    setBoxPosition,
    hideClickAway,
  });

  // 3. Register global panel shortcuts, including Escape to close.
  useTranboxShortcuts({
    showBox,
    setShowBox,
    handleOpenTranbox,
    handleToggleTranbox,
    contextMenuType,
    uiLang,
  });

  return (
    <SettingProvider context="tranbox">
      <ThemeProvider styles={extStyles}>
        <style>{SELECTION_STYLES}</style>
        {/* Render the draggable, resizable selection translation panel. */}
        {
          <TranBox
            showBox={showBox}
            text={text}
            setText={setText}
            boxSize={boxSize}
            setBoxSize={setBoxSize}
            boxPosition={boxPosition}
            setBoxPosition={setBoxPosition}
            tranboxSetting={tranboxSetting}
            transApis={transApis}
            prompts={prompts}
            setShowBox={setShowBox}
            simpleStyle={simpleStyle}
            setSimpleStyle={setSimpleStyle}
            hideClickAway={hideClickAway}
            setHideClickAway={setHideClickAway}
            followSelection={followSelection}
            setFollowSelection={setFollowSelection}
            // extStyles={extStyles}
            langDetector={langDetector}
            translateVariants={translateVariants}
            selectionContext={textContext}
          />
        }

        {/* Show the floating translation action beside the current selection. */}
        {showBtn && (
          <TranBtn
            position={position}
            btnEvent={btnEvent}
            label={i18n("translate") || "Translate selection"}
            onTrigger={(e) => {
              e.stopPropagation();
              handleOpenTranbox();
            }}
          />
        )}
      </ThemeProvider>
    </SettingProvider>
  );
}
