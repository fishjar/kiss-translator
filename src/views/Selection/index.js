import { useState, useRef, useEffect } from "react";
import { getMaxTranBoxX, getMaxTranBoxY } from "../../libs/tranboxPosition";
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
  parseLatex = false,
  extStyles,
  rule,
}) {
  const [remotePosition, setRemotePosition] = useState(null);
  const [remoteMode, setRemoteMode] = useState(false);
  const remotePositionRef = useRef(null);
  const i18n = newI18n(uiLang || "zh");
  // 1. Manage the panel's size, position, simple mode, and hide-on-blur setting.
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
    selectionSource,
    position,
    handleOpenTranbox,
    handleToggleTranbox,
    btnEvent,
  } = useSelectionController({
    tranboxSetting,
    followSelection,
    hideClickAway,
    boxOffsetX,
    boxOffsetY,
    boxSize,
    setBoxPosition,
    onRemoteSelection: (fromFrame) => setRemoteMode(fromFrame),
    setRemotePosition: (position) => {
      if (position) {
        remotePositionRef.current = position;
        setRemotePosition(position);
      }
      return remotePositionRef.current;
    },
  });

  useEffect(() => {
    if (!remoteMode || !followSelection) return;
    const clamp = () =>
      setRemotePosition((previous) => {
        if (!previous) return previous;
        const next = {
          x: Math.max(0, Math.min(previous.x, getMaxTranBoxX(boxSize.w))),
          y: Math.max(0, Math.min(previous.y, getMaxTranBoxY(boxSize.h))),
        };
        remotePositionRef.current = next;
        return next;
      });
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [remoteMode, followSelection, boxSize]);

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
            boxPosition={
              remoteMode && followSelection
                ? remotePosition || boxPosition
                : boxPosition
            }
            setBoxPosition={
              remoteMode && followSelection
                ? (position) => {
                    setRemotePosition((previous) => {
                      const next =
                        typeof position === "function"
                          ? position(previous)
                          : position;
                      remotePositionRef.current = next;
                      return next;
                    });
                  }
                : setBoxPosition
            }
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
            parseLatex={parseLatex}
            rule={rule}
            selectionContext={textContext}
            selectionSource={selectionSource}
          />
        }

        {/* Show the floating translation action beside the current selection. */}
        {showBtn && (
          <TranBtn
            position={position}
            btnEvent={btnEvent}
            label={i18n("translate", "Translate selection")}
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
