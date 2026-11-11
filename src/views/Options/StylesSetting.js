import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevealSearchTarget } from "./SettingsSearchTarget";
import { useTheme } from "@mui/material/styles";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import { AddIcon, CloseIcon, ExpandMoreIcon } from "../../components/icons";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { useConfirm } from "../../hooks/Confirm";
import Box from "@mui/material/Box";
import CodeField from "./CodeField";
import TextareaResizeGrip from "../../components/TextareaResizeGrip";
import useTextareaHeightLock, {
  useReleaseOnGripHidden,
} from "../../hooks/useTextareaHeightLock";
import { ClassNames, keyframes } from "@emotion/react";
import {
  OPT_STYLE_BLINK,
  OPT_STYLE_GLOW,
  OPT_STYLE_GRADIENT,
  OPT_STYLE_NONE,
} from "../../config/styles";
import {
  toPersistedCustomStyle,
  useAllTextStyles,
  useStyleList,
} from "../../hooks/CustomStyles";
import { useSetting } from "../../hooks/Setting";
import { GripGlyph } from "../../components/TextareaResizeGrip";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import { useTextareaGripStyle } from "../../hooks/useTextareaHeightLock";
import { compileCss, sanitizeScopeSlug } from "../../libs/compileCss";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSelect,
} from "./SettingsCard";

/**
 * 下拉选项图标 + 文案的内联排布（参照 Apis.js MenuItem 内联图标先例；
 * SettingsSelect 的 label 天然接受 React 节点，SettingsSelect 自身零改造）。
 * 图标由 GripGlyph 纯展示渲染；hidden 项不渲染手柄，textarea 回退原生 resize。
 *
 * @param {string} variant 手柄样式 key。
 * @param {string} text 选项文案。
 * @returns {JSX.Element}
 */
function gripOptionLabel(variant, text) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
    >
      <GripGlyph variant={variant} />
      {text}
    </Box>
  );
}

// 内置样式 compact 预览的动画 keyframes（gradient/blink/glow），与
// PopupStylePreview 同源形态：三个内置模板的 CSS 以 animation-name 引用
// 这些 keyframes，缺失即动画演示失真（弹窗选项演示消费）。
const previewGradientFlow = keyframes`
  to { background-position: 200% center; }
`;
const previewBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;
const previewGlow = keyframes`
  from {
    text-shadow: 0 0 10px #fff, 0 0 20px #fff, 0 0 30px #0073e6,
      0 0 40px #0073e6;
  }
  to {
    text-shadow: 0 0 20px #fff, 0 0 30px #ff4da6, 0 0 40px #ff4da6,
      0 0 50px #ff4da6;
  }
`;
const PREVIEW_ANIMATION_STYLES = {
  [OPT_STYLE_GRADIENT]: {
    animation: `${previewGradientFlow} 4s linear infinite`,
  },
  [OPT_STYLE_BLINK]: { animation: `${previewBlink} 1s infinite` },
  [OPT_STYLE_GLOW]: {
    animation: `${previewGlow} 2s ease-in-out infinite alternate`,
  },
};

/**
 * 样式化「译文」演示 span：previewCode 非空（内置模板）时编译预览代码
 * 并注入动画样式；空 previewCode（空白样式/自定义）→ 无样式纯文本。
 */
function StyleDemoSpan({ styleSlug, previewCode, children }) {
  return (
    <ClassNames>
      {({ css }) => (
        <span
          className={
            previewCode
              ? css(previewCode, PREVIEW_ANIMATION_STYLES[styleSlug])
              : undefined
          }
        >
          {children}
        </span>
      )}
    </ClassNames>
  );
}

// 安全 CSS 编译解析器已上收至 libs/compileCss.js：卡片演示与本页 Rules
// 下拉的 custom 项预览共用同一作用域编译与校验口径。

/**
 * 自绘样式卡片（v2）：header 恒定 46px（名字区 + 「译文」演示 + 箭头钮）+
 * body（代码框 + 底部按钮行）。展开/收起仅由箭头钮触发（onToggle），互斥
 * 单开由主组件 activeEditSlug 裁决（isActive）；「译文」演示为唯一实时样式
 * 载体（compileCss 按卡片作用域实时编译草稿）。
 *
 * @param {Object} props.customStyle - 样式对象配置（useAllTextStyles 归一化形态）
 * @param {Object} props.draft - 主组件提升的草稿（drafts[styleSlug]，未编辑时缺省）
 * @param {boolean} props.isActive - 本卡是否为当前展开卡
 * @param {Function} props.onToggle - 箭头钮切换回调
 * @param {Function} props.onDelete - 删除回调（主组件侧接 deleteStyle 并复位激活态）
 * @param {Function} props.onUpdate - 保存回调（主组件侧接 updateStyle）
 */
function StyleCard({
  customStyle,
  draft,
  isActive,
  onToggle,
  onDelete,
  onUpdate,
  onDraftChange,
}) {
  const i18n = useI18n();
  const confirm = useConfirm();
  const scopeClass = `kt-scope-${sanitizeScopeSlug(customStyle.styleSlug)}`;
  // 通用拉伸手柄接线（与 Prompts/TranForm 等五个接入视图同一体系）：
  // 会话高度锁按卡片 slug 隔离，hidden 样式切换时自动释放。
  const gripStyle = useTextareaGripStyle();
  const codeHeightLock = useTextareaHeightLock(
    `options-style-code:${customStyle.styleSlug}`
  );
  useReleaseOnGripHidden(gripStyle, codeHeightLock.releaseHeight);
  // 草稿状态提升至主组件（drafts[styleSlug]）：本组件改为受控渲染，
  // 持久化变更重置草稿的快照对比同步由主组件统一承接（同步 effect）。
  // useMemo 定引用：cardDraft 进 isModified 的依赖数组，裸逻辑表达式
  // 会每渲染换引用触发 exhaustive-deps 警告（CI 构建视为错误）。
  const cardDraft = useMemo(
    () => draft || customStyle || {},
    [draft, customStyle]
  );

  const isModified = useMemo(
    () => JSON.stringify(customStyle || {}) !== JSON.stringify(cardDraft),
    [customStyle, cardDraft]
  );

  const { styleName = "", styleCode = "" } = cardDraft;
  // 编辑器安全显示值：导入的 styleCode 可为非字符串（123/null）——编辑框
  // 与 trim 判断只用字符串值，避免 styleCode.trim() 抛 TypeError；编译
  // 仍按原值（compileCss 对非字符串判 invalid），无效导入值在用户修正前
  // 保持 invalid 形态。
  const editableStyleCode = typeof styleCode === "string" ? styleCode : "";
  const compiled = useMemo(
    () => compileCss(scopeClass, styleCode),
    [scopeClass, styleCode]
  );

  // 表单字段输入改变处理：上抛主组件 drafts[styleSlug]
  const handleChange = (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    onDraftChange((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // 触发样式规则更新
  const handleSave = () => {
    onUpdate(customStyle.styleSlug, toPersistedCustomStyle(cardDraft));
  };

  // 二次确认删除自定义样式
  const handleDelete = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      onDelete(customStyle.styleSlug);
    }
  };

  return (
    <Box
      className={`kt-style-card ${scopeClass} ${isActive ? "is-expanded" : ""}`}
    >
      <Box className="kt-style-card__header">
        {isActive ? (
          /* 名称类字段沿用项目既定家族（同 Apis apiName / Prompts
              prompt_name）：TextField size="small" + filled 形态（显式
              声明——无主题的测试环境缺省 outlined、应用主题 filled，显式
              才双侧一致）+ label 上浮；手柄体系仅接多行代码框，名称框
              天然无手柄 */
          <TextField
            className="kt-style-card__name-input"
            variant="filled"
            size="small"
            label={i18n("style_name")}
            value={styleName}
            name="styleName"
            onChange={handleChange}
            sx={{ width: 160 }}
          />
        ) : (
          <Typography className="kt-style-card__name-text">
            {customStyle.styleName}
          </Typography>
        )}
        {/* 「译文」演示：唯一实时样式载体；contain:paint 沙箱容器由
            .kt-style-card__demo 在 styles.js 中声明（position:fixed 类
            危险声明被裁剪在演示框内） */}
        <Box
          className={`kt-style-card__demo ${
            compiled.valid ? "" : "is-invalid"
          }`}
          title={
            compiled.valid
              ? compiled.css
                ? i18n("style_active")
                : undefined
              : i18n("css_invalid")
          }
        >
          <style>{compiled.css}</style>
          <span className="kt-style-demo">{i18n("translated_text")}</span>
        </Box>
        {/* 展开/收起：仅此钮触发；点击名字区、演示区及其他区域均不触发展开
            （反向断言锁定，回归防护）；180° 旋转与 aria-expanded 同步
            （is-expanded 类） */}
        <button
          type="button"
          className="kt-style-card__toggle"
          aria-expanded={isActive}
          aria-controls={`kt-style-body-${customStyle.styleSlug}`}
          aria-label={i18n(
            isActive ? "style_card_collapse" : "style_card_expand"
          )}
          onClick={onToggle}
        >
          <ExpandMoreIcon />
          <span className="m3-state-layer" />
        </button>
      </Box>
      {isActive && (
        <Box
          className="kt-style-card__body"
          id={`kt-style-body-${customStyle.styleSlug}`}
        >
          {/* 代码框：CodeField（multiline）+ 通用拉伸手柄（endAdornment），
              hidden 样式时手柄早退、textarea 回退原生 resize:vertical */}
          <CodeField
            className="kt-style-card__code-field"
            size="small"
            name="styleCode"
            value={editableStyleCode}
            onChange={handleChange}
            inputRef={codeHeightLock.textareaRef}
            minRows={1}
            maxRows={12}
            InputProps={{
              ...codeHeightLock.rootProps,
              endAdornment:
                editableStyleCode.trim() ||
                codeHeightLock.lockedHeight != null ? (
                  <TextareaResizeGrip
                    target={codeHeightLock.textareaRef}
                    onResize={codeHeightLock.applyHeight}
                    value={codeHeightLock.lockedHeight}
                    label={i18n("field_resize_height")}
                    variant={gripStyle}
                    onRelease={codeHeightLock.releaseHeight}
                    unlockHint={i18n("field_resize_unlock_hint")}
                  />
                ) : null,
            }}
            inputProps={{
              className: "kt-resizable-textarea",
              style: {
                resize: gripStyle === "hidden" ? "vertical" : "none",
              },
            }}
            sx={{ "& .MuiInputBase-root": { overflow: "visible" } }}
          />
          <Box className="kt-style-card__footer">
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={handleDelete}
            >
              {i18n("delete")}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={!isModified || !compiled.valid}
            >
              {i18n("save")}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * 模板选择模态：添加按钮 → 「选即创建」的一次性动作菜单。弹窗复用 MUI
 * Dialog（焦点圈闭/遮罩/aria-modal 由 MUI 承载）；选项行语义按动作菜单裁决（role=menu/menuitem，无选中染色、无勾选标记）；列表滚动
 * overscroll-behavior:contain 物理隔离（滚动不得误关）；Escape/遮罩关闭
 * 后焦点回退添加按钮本体（关闭后焦点回到触发源）。
 *
 * @param {boolean} props.open - 模态开关
 * @param {Function} props.onClose - 关闭回调（MUI onClose 原样透传）
 * @param {Function} props.onSelect - 选中回调（接收所选模板 styleCode）
 * @param {Array} props.templates - 模板清单（useAllTextStyles().builtinStyles 单一事实源）
 */
// 初始焦点入内哨兵：MUI Modal 的 Portal 容器在其自身 effect 中延迟
// 挂载，外层 effect 取不到对话框 DOM；本哨兵渲染于 DialogContent 内，随
// Portal 内容二次提交后执行——对对话框 Paper 显式聚焦（MUI FocusTrap 在
// jsdom 下不自动落焦点；真实浏览器其自动聚焦先于此执行，本调用幂等）。
// Paper 无 tabindex 时按 FocusTrap 同款规则补 -1。
function ModalInitialFocus() {
  useEffect(() => {
    const dialogEl = document
      .getElementById("kt-template-modal-title")
      ?.closest('[role="dialog"]');
    if (dialogEl) {
      if (!dialogEl.hasAttribute("tabindex")) {
        dialogEl.setAttribute("tabindex", "-1");
      }
      dialogEl.focus();
    }
  }, []);
  return null;
}

function TemplateSelectModal({ open, onClose, onSelect, templates }) {
  const i18n = useI18n();
  const theme = useTheme();
  const titleId = "kt-template-modal-title";

  // Escape/遮罩/✕ 统一路径：关闭即收口；焦点回退挂在 Dialog 过渡 exited
  // 的 TransitionProps.onExited（见 JSX 处注释）
  const handleClose = (...args) => {
    onClose(...args);
  };

  // 菜单键盘巡航：menuitem 为非按钮节点且
  // tabIndex=-1（menu 语义按箭头键巡航设计、不入 Tab 序），keydown 委托
  // 至 Dialog 层（React 合成事件沿组件树冒泡，Portal 内容同样触达）：
  // 巡航项从 event.currentTarget（Dialog 挂载本元素）作用域向下查询，
  // 杜绝误捞本对话框之外其他浮层的 menuitem；ArrowUp/ArrowDown 在选项间
  // 循环巡航，Enter/Space 激活当前聚焦项；焦点在菜单外（对话框本体）时
  // ArrowDown 进入首项、ArrowUp 进入末项。✕ 按钮等原生可激活节点不经此
  // 劫持（currentIndex=-1 时 Enter/Space 直通）。
  const handleDialogKeyDown = (event) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll('[role="menuitem"]')
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? event.key === "ArrowDown"
            ? 0
            : items.length - 1
          : (currentIndex + delta + items.length) % items.length;
      items[nextIndex].focus();
    } else if (currentIndex !== -1) {
      event.preventDefault();
      items[currentIndex].click();
    }
  };

  // 「空白样式」首项：i18n 就地取用（hook 内构造）
  const blankTemplate = {
    styleSlug: "blank",
    styleName: i18n("blank_style"),
    styleCode: "",
    source: "custom",
    isBuiltin: false,
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onKeyDown={handleDialogKeyDown}
      aria-labelledby={titleId}
      // 禁用 FocusTrap 的自带焦点恢复（FocusTrap.js:122-135 cleanup 在
      // open=false 瞬间执行——弹窗仍挂载、ModalManager 的 aria-hidden 仍在
      // #root 上，此时 nodeToRestore（= opener，FocusTrap.js:239-242 经
      // focus 事件 relatedTarget 捕获，jsdom 无 relatedTarget 故测试不可
      // 见）.focus() 会把焦点放回 aria-hidden 子树，触发 chrome Blocked
      // aria-hidden 告警）。回退改由下方 onExited 的 aria-hidden 守卫承担：
      // 等 Modal 卸载提交清除 aria-hidden 后再聚焦 opener（透传口径：
      // disableRestoreFocus 非 Dialog 具名 prop，随 other 展开到 Modal）。
      disableRestoreFocus
      TransitionProps={{
        onExited: () => {
          // 卸载后守卫回退：逐帧/逐宏任务检查 #root 的
          // aria-hidden 是否已被 Modal 卸载提交清除，清除后才聚焦 opener。
          // 不赌任何任务队列序——四轮时序方案（handleClose 定时器 FIFO、
          // 同步聚焦、rAF、onExited 后 0ms 定时器）均被现场 __warnLog
          // 序列证伪：aria-hidden 在场时聚焦 opener 即触发 chrome Blocked
          // aria-hidden 告警（focus-opener@dialogOpen:true）。守卫使该窗口
          // 结构性不可能：aria-hidden 在场时只重试、永不聚焦。测试环境
          // （jsdom 的 rAF 走真实时钟不受 fake timers 接管）用 0ms 定时器
          // 同一守卫，由两段式 advance（既有 ：1431 观测点）驱动：第一次
          // advance 完成卸载提交（aria-hidden 移除），第二次 advance 触发
          // 守卫通过并聚焦。聚焦目标实时取活跃节点：重渲染会重建按钮
          // 节点，卸载前捕获的引用是游离旧节点。重试封顶 100 次（约 1.6s
          // 生产 / 100 次宏任务测试），封顶后按旧口径兜底聚焦，防止异常
          // 场景下无限循环。
          const restoreFocus = (attempt) => {
            if (attempt < 100 && document.getElementById("root")?.getAttribute("aria-hidden")) {
              const retry = () => restoreFocus(attempt + 1);
              if (process.env.NODE_ENV === "test") {
                setTimeout(retry, 0);
              } else {
                requestAnimationFrame(retry);
              }
              return;
            }
            document.getElementById("add-style-button")?.focus?.();
          };
          restoreFocus(0);
        },
      }}
      PaperProps={{
        // MUI v5 Dialog 的顶层 aria-* 落在 Modal 根而非 role=dialog 的
        // Paper；aria-modal 按 M3 合规要求经 PaperProps 补声明到对话框
        // 本体。
        "aria-modal": true,
        sx: {
          width: 440,
          maxHeight: "72vh",
          borderRadius: "12px",
          // ✕ 关闭钮的定位锚点=Paper 本体（浏览器实测：锚在 Title 时右缘
          // 超出 Paper 4px，Paper 的 overflow-x:auto 画出 4px 横向滚动条）
          position: "relative",
          // 定尺寸壳绝不自滚：内部滚动已委托 .kt-template-list，
          // 壳层 overflow hidden 吃掉任何残余溢出（4px 级别的绝对定位
          // 越缘被裁剪而非画滚动条）
          overflow: "hidden",
          // Portal 挂载于 .kt-m3-root 之外，:root 级 --kt-* 变量不可解析
          // （口径同 OptionsTheme dropdownPaper：Portal 内改用 theme 解析
          // 值）——在 Paper 根重定模板项所需变量，OPTIONS_STYLES 的
          // .kt-template-item 规则（主色环/文字色）在 Portal 内恢复解析。
          "--kt-pri": theme.palette.primary.main,
          "--kt-on": theme.palette.text.primary,
        },
      }}
    >
      {/* ✕ 为标题行 flex 常规子项（space-between）——弃用绝对定位：
          abspos 落点存在 +12px 的 containing block 盲区、右缘越出 Paper
          4px（浏览器实测）；流内元素被内容盒约束，越缘结构性不可能 */}
      <DialogTitle
        id={titleId}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {i18n("choose_style_template")}
        <IconButton
          aria-label={i18n("close")}
          onClick={handleClose}
          edge="end"
          className="kt-template-modal__close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      {/* 横向溢出钳制在内容壳；滚动权（长列表 max-height 280 + 纵向
          滚动 + overscroll contain）收归 .kt-template-list 列表本体 */}
      <DialogContent sx={{ overflowX: "hidden" }}>
        <ModalInitialFocus />
        <Box
          role="menu"
          className="kt-template-list"
          aria-label={i18n("choose_style_template")}
        >
          {[blankTemplate, ...templates].map((style) => (
            <Box
              key={style.styleSlug}
              role="menuitem"
              className="kt-template-item"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(style.styleCode);
              }}
            >
              <Typography className="kt-template-item__name">
                {style.styleName}
              </Typography>
              <StyleDemoSpan
                styleSlug={style.styleSlug}
                previewCode={style.styleCode}
              >
                {i18n("translated_text")}
              </StyleDemoSpan>
              <span className="m3-state-layer" />
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 译文展现样式设置主页面组件 (StylesSetting)
 */
export default function StylesSetting() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const [showStyleManager, setShowStyleManager] = useState(false);
  const [hasOpenedStyleManager, setHasOpenedStyleManager] = useState(false);
  useRevealSearchTarget(setShowStyleManager, [
    "settings_style_library",
    "settings_custom_css",
    "style_name",
    "style_code",
  ]);
  useRevealSearchTarget(setHasOpenedStyleManager, [
    "settings_style_library",
    "settings_custom_css",
    "style_name",
    "style_code",
  ]);
  // 自定义 CSS 列表 Hook
  const { addStyle, deleteStyle, updateStyle } = useStyleList();
  // 系统内置的只读样式配置列表
  const { builtinStyles, customStyles } = useAllTextStyles();
  // 互斥单开：同一时刻仅一张卡展开；null＝全收起。
  const [activeEditSlug, setActiveEditSlug] = useState(null);
  // 搜索命中 style 锚键（style_name/style_code）：激活数据序第一张卡。
  // 揭示收敛在主组件——per-card 上抛在双列瀑布流的树序下"最后上抛者
  // 胜出"（3 卡树序 a,c,b，会激活数据序中间卡），与搜索意图不符。
  // 揭示后仍可手动收起，与既有面板行为一致。
  useRevealSearchTarget(
    useCallback(
      (open) => {
        if (open && customStyles.length) {
          setActiveEditSlug(customStyles[0].styleSlug);
        }
      },
      [customStyles]
    ),
    ["style_name", "style_code"]
  );
  // 草稿按 styleSlug 提升到主组件：卡片奇偶分列在头部 unshift 新卡时翻转
  // 列位 → 跨父级卸载重挂，实例内草稿会丢；提升后草稿随主组件存活。
  const [drafts, setDrafts] = useState({});
  const syncedSnapshotsRef = useRef({});
  // 持久化内容变更才清对应草稿（回落 customStyle），引用抖动不清稿：
  // 快照与上次同步一致即跳过；首跑时 drafts 为空、清删为 no-op。
  useEffect(() => {
    // 清理已消失 slug 的草稿与快照：外部同步删除样式后，残留草稿会在同
    // slug 恢复时陈稿复现（回落 customStyle 失效）；快照残留则让恢复场景
    // 误判"快照一致"跳过清稿。正在编辑的卡因同步暂时消失，清草稿是正确
    // 行为——卡已不在列表。
    const liveSlugs = new Set(
      customStyles.map((style) => style.styleSlug)
    );
    setDrafts((prev) => {
      const stale = Object.keys(prev).filter((slug) => !liveSlugs.has(slug));
      if (stale.length === 0) return prev;
      const rest = { ...prev };
      stale.forEach((slug) => {
        delete rest[slug];
      });
      return rest;
    });
    Object.keys(syncedSnapshotsRef.current).forEach((slug) => {
      if (!liveSlugs.has(slug)) {
        delete syncedSnapshotsRef.current[slug];
      }
    });
    customStyles.forEach((style) => {
      const slug = style.styleSlug;
      const nextSnapshot = JSON.stringify(style || {});
      if (syncedSnapshotsRef.current[slug] === nextSnapshot) {
        return;
      }
      syncedSnapshotsRef.current[slug] = nextSnapshot;
      setDrafts((prev) => {
        if (!(slug in prev)) return prev;
        const { [slug]: _removed, ...rest } = prev;
        return rest;
      });
    });
  }, [customStyles]);
  // 模板选择模态开关。
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  // 选模板即创建：置顶新建 + 预填所选代码 + 新卡自动展开（互斥单开下
  // 旧卡自动收起——activeEditSlug 被覆盖即旧卡失活）。
  const handleCreateFromTemplate = (initialCode) => {
    const slug = addStyle(initialCode);
    setActiveEditSlug(slug);
    setTemplateModalOpen(false);
  };

  // 添加新 CSS 样式：创建流程改由模板选择模态承接（选即创建）。leading 现
  // 常驻样式库行（不再受 hasOpenedStyleManager 挂载门约束）——新建须先揭示
  // 抽屉，否则首屏直接点 leading 落库的卡渲染进未挂载的抽屉、静默不可见，
  // 重试即产生多张脏卡。
  const handleClick = (e) => {
    e.preventDefault();
    // 开侧焦点让位（事件时点，早于任何提交）：弹窗挂载时 ModalManager 会向
    // #root 施加 aria-hidden——若此刻 opener 仍持焦点（键盘 Enter 激活后
    // 焦点留在按钮上），chrome 打印 Blocked aria-hidden 告警（拒绝生效）。
    // 先行 blur 使 aria-hidden 施加时 activeElement=body（非 #root 后代），
    // 无「聚焦于隐藏子树」前提；随后 FocusTrap 自动聚焦对话框（既有行为）。
    // 关闭侧由 TransitionProps.onExited 的 aria-hidden 守卫承担。
    e.currentTarget.blur();
    setStyleManagerVisibility(true);
    setTemplateModalOpen(true);
  };

  const setStyleManagerVisibility = (visible) => {
    if (visible) setHasOpenedStyleManager(true);
    setShowStyleManager(visible);
  };

  const darkMode = setting.darkMode || "auto";
  const gripStyle = useTextareaGripStyle();

  return (
    <Box>
      <SettingsSection title={i18n("settings_interface_theme")}>
        <SettingsCard>
          <SettingsRow label={i18n("settings_appearance_mode")}>
            <SettingsSegmented
              value={darkMode}
              label={i18n("settings_appearance_mode")}
              onChange={(value) => updateSetting({ darkMode: value })}
              items={[
                { value: "light", label: i18n("settings_theme_light") },
                { value: "dark", label: i18n("settings_theme_dark") },
                { value: "auto", label: i18n("settings_theme_system") },
              ]}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={i18n("settings_textarea_grip_style")}>
        <SettingsCard>
          <SettingsRow
            label={i18n("settings_textarea_grip_style")}
            description={i18n("settings_textarea_grip_style_desc")}
          >
            <SettingsSelect
              value={gripStyle}
              label={i18n("settings_textarea_grip_style")}
              onChange={(value) => updateSetting({ textareaGripStyle: value })}
              options={TEXTAREA_GRIP_STYLE_KEYS.map((key) => ({
                value: key,
                label: gripOptionLabel(
                  key,
                  i18n(`grip_style_${key.replace(/-/g, "_")}`)
                ),
              }))}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={i18n("settings_translation_styles")}>
        <SettingsCard>
          <SettingsRow
            className="kt-settings-row--inline-control"
            label={i18n("settings_style_library")}
            description={i18n("settings_style_library_description")
              .replace("{0}", String(customStyles.length))
              .replace("{1}", String(builtinStyles.length))}
          >
            <Box
              role="group"
              aria-label={i18n("settings_style_library")}
              className="kt-style-split-group"
            >
              <Button
                size="small"
                variant="outlined"
                id="add-style-button"
                className="kt-style-split-group__leading"
                aria-label={i18n("settings_custom_css")}
                aria-haspopup="dialog"
                startIcon={<AddIcon />}
                onClick={handleClick}
              >
                <span className="kt-style-split-group__label">
                  {i18n("settings_custom_css")}
                </span>
              </Button>
              <Button
                size="small"
                variant="outlined"
                className="kt-style-split-group__trailing"
                aria-expanded={showStyleManager}
                aria-controls="kt-style-manager-panel"
                aria-label={i18n(
                  showStyleManager
                    ? "style_library_collapse"
                    : "style_library_expand"
                )}
                onClick={() => setStyleManagerVisibility(!showStyleManager)}
              >
                <ExpandMoreIcon />
              </Button>
            </Box>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {hasOpenedStyleManager && (
        <Stack
          id="kt-style-manager-panel"
          className="kt-style-manager"
          spacing={3}
          hidden={!showStyleManager}
          sx={{ display: showStyleManager ? "flex" : "none" }}
        >
          <section>
            <Typography component="h2" className="kt-options-section-title">
              {i18n("custom_styles")}
            </Typography>
            {/* 确定性双列瀑布流：显式双列按数据序对半切分分布（前 ⌈n/2⌉ 入
                左列、余入右列），既杜绝 CSS 多列平衡在 ≤2 项时的顺序堆叠退化，
                又保证窄屏列容器 display:contents 展平后 DOM 文档序＝数据序
                （视觉序＝Tab 序＝读屏序）；≤620px 折叠单列。 */}
            <Box className="kt-style-grid">
              {/* 按数据序对半切分（非奇偶轮转）：col0=[0,mid)、col1=[mid,len)。
                  使两列 DOM 文档序恒等于 customStyles 数据序——窄屏 display:contents
                  展平后视觉序＝Tab 序＝读屏序＝数据序，杜绝 CSS order 的焦点序尾债。 */}
              {[0, 1].map((columnIndex) => (
                <Box className="kt-style-grid__column" key={columnIndex}>
                  {customStyles
                    .slice(
                      columnIndex === 0
                        ? 0
                        : Math.ceil(customStyles.length / 2),
                      columnIndex === 0
                        ? Math.ceil(customStyles.length / 2)
                        : customStyles.length
                    )
                    .map((customStyle) => (
                      <StyleCard
                        key={customStyle.styleSlug}
                        customStyle={customStyle}
                        draft={drafts[customStyle.styleSlug]}
                        isActive={customStyle.styleSlug === activeEditSlug}
                        onToggle={() =>
                          setActiveEditSlug((prev) =>
                            prev === customStyle.styleSlug
                              ? null
                              : customStyle.styleSlug
                          )
                        }
                        onDraftChange={(updater) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [customStyle.styleSlug]:
                              typeof updater === "function"
                                ? updater(
                                    prev[customStyle.styleSlug] ||
                                      customStyle ||
                                      {}
                                  )
                                : updater,
                          }))
                        }
                        onDelete={(styleSlug) => {
                          deleteStyle(styleSlug);
                          // 删除卡片：同步清该 slug 的提升草稿
                          setDrafts((prev) => {
                            if (!(styleSlug in prev)) return prev;
                            const { [styleSlug]: _removed, ...rest } = prev;
                            return rest;
                          });
                          // 删除激活卡：按 slug 相等复位，避免悬空激活引用
                          setActiveEditSlug((prev) =>
                            prev === styleSlug ? null : prev
                          );
                        }}
                        onUpdate={updateStyle}
                      />
                    ))}
                </Box>
              ))}
            </Box>
          </section>
        </Stack>
      )}

      <TemplateSelectModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelect={handleCreateFromTemplate}
        // style_none（无样式）的内置代码为空串，与「空白样式」同语义：
        // 从模板清单剔除，避免同义重复项
        templates={builtinStyles.filter(
          (style) => style.styleSlug !== OPT_STYLE_NONE
        )}
      />
    </Box>
  );
}
