import TranBtn from "./TranBtn";
import TranBox from "./TranBox";
import useTranBoxState from "../../hooks/useTranBoxState";
import useSelectionController from "../../hooks/useSelectionController";
import useTranboxShortcuts from "../../hooks/useTranboxShortcuts";

/**
 * 划词翻译交互整体入口组件
 *
 * @param {Object} props
 * @param {string} props.contextMenuType - 浏览器右键菜单的类型/配置
 * @param {Object} props.tranboxSetting - 划词翻译框的相关设置项
 * @param {Array} props.transApis - 启用的翻译 API 配置列表
 * @param {string} props.uiLang - 当前扩展所用的 UI 本地化语言
 * @param {Object} props.langDetector - 语种检测器的状态配置项
 */
export default function Selection({
  contextMenuType,
  tranboxSetting,
  transApis,
  prompts,
  uiLang,
  langDetector,
}) {
  // 1. 初始化并管理划词翻译框（TranBox）的各种展示和交互状态（如宽高、位置、极简模式、点击外部关闭等）
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

  // 2. 初始化并绑定全局鼠标划词选区监听器，控制翻译按钮和翻译面板的定位、显示与隐藏
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

  // 3. 注册并侦听划词框专属的全局键盘快捷键 (如 Esc 关闭，特定键拉起等)
  useTranboxShortcuts({
    showBox,
    setShowBox,
    handleOpenTranbox,
    handleToggleTranbox,
    contextMenuType,
    uiLang,
  });

  return (
    <>
      {/* 渲染可拖拽拉伸的划词翻译面板 */}
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
          selectionContext={textContext}
        />
      }

      {/* 当有划词选区时，在选区旁渲染悬浮的蓝色翻译触发按钮 */}
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
