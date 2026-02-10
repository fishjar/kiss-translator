import TranBtn from "./TranBtn";
import TranBox from "./TranBox";
import useTranBoxState from "../../hooks/useTranBoxState";
import useSelectionController from "../../hooks/useSelectionController";
import useTranboxShortcuts from "../../hooks/useTranboxShortcuts";

export default function Selection({
  contextMenuType,
  tranboxSetting,
  transApis,
  uiLang,
  langDetector,
}) {
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

  const {
    showBox,
    setShowBox,
    showBtn,
    text,
    setText,
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

  useTranboxShortcuts({
    tranboxSetting,
    showBox,
    setShowBox,
    handleToggleTranbox,
    contextMenuType,
    uiLang,
  });

  return (
    <>
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
          setShowBox={setShowBox}
          simpleStyle={simpleStyle}
          setSimpleStyle={setSimpleStyle}
          hideClickAway={hideClickAway}
          setHideClickAway={setHideClickAway}
          followSelection={followSelection}
          setFollowSelection={setFollowSelection}
          // extStyles={extStyles}
          langDetector={langDetector}
        />
      }

      {showBtn && (
        <TranBtn
          position={position}
          btnOffsetX={tranboxSetting.btnOffsetX}
          btnOffsetY={tranboxSetting.btnOffsetY}
          btnEvent={btnEvent}
          onTrigger={(e) => {
            e.stopPropagation();
            handleOpenTranbox();
          }}
        />
      )}
    </>
  );
}
