import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useForkRef } from "@mui/material/utils";
import useDropdownDismiss from "./useDropdownDismiss";

// 伪下拉选中态统一 secondary-container 形态（RuleEditor index.js 同款）：
// 选中 secc 底＋onsecc 文字（去 pri 竖条），hover/focus 走 currentColor 8% 瞬时层，行圆角 8px；
// 组件级注入覆盖本仓全部调用方（ReusableAutocomplete 与裸 MUI Autocomplete 面）。
// 状态规则一律挂 MUI 自有 listbox/option 类，使默认渲染与 baseSlot/rest 自定义渲染
// 共用同一真源（盘面事实：Autocomplete.js:591-592 给 renderOption 的 props 注入
// classes.option；useAutocomplete.js:280-305 再以 classList 命令式给高亮项加/摘
// Mui-focused，键盘高亮另加 Mui-focusVisible）。注入体挂 head 即全文档生效，故整组
// 规则限定在专属弹层类下——裸 ul.MuiAutocomplete 会连带染宿主页面自有的 Autocomplete；
// 限定后特异度 (0,4,1)/(0,5,1)，严格高于 MUI v5 同键规则且不依赖注入体与 emotion
// 标签的先后顺序（两者谁先谁后层叠结果一致）。注入体后置的层叠序仅作第二重保障。
// 键盘高亮（Mui-focusVisible）与鼠标聚焦（Mui-focused）的选中态同口径覆盖。
export const PSEUDO_DROPDOWN_POPPER_CLASS = "kt-autocomplete-popper";
const PSEUDO_DROPDOWN_CSS = `
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option { border-radius: 8px; }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option:hover { background-color: color-mix(in srgb, currentColor 8%, transparent); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused { background-color: color-mix(in srgb, currentColor 8%, transparent); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] { background-color: var(--kt-secc, #e8def8); color: var(--kt-onsecc, #1d192b); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused { background-color: var(--kt-secc, #e8def8); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focusVisible { background-color: var(--kt-secc, #e8def8); }
`;

// 三级回退真源：container 回调与渲染期解析共用同一函数，避免两径漂移
// （回退序：① .kt-m3-root 祖先；② 锚点所属影子根；③ body 兜底）。
export const resolvePopperContainer = (anchor) => {
  const insideRoot = anchor?.closest(".kt-m3-root");
  if (insideRoot) return insideRoot;
  const ownerRoot = anchor?.getRootNode?.();
  if (ownerRoot?.host) return ownerRoot;
  return anchor?.ownerDocument.body;
};

// 弹层目标根统一解析（container 回调与挂载期固化两径同源，不漂移）：
// 调用方显式容器优先——函数先无参调用取结果，非空节点/文档直接尊重（与
// popper container 回调的优先级语义一致）；元素取其所属根（主文档元素→
// Document，影子内元素→该影子根），本身就是 ShadowRoot/Document 则取自身。
// 未传或为空时按 resolvePopperContainer 既有回退链解析弹层容器，再同样
// 归一到根节点。伪下拉规则注入与影子 emotion 缓存都以该根为作用域：
// head 注入体与 head 默认缓存的规则均不级联进影子树，弹层最终落点的根
// 才是唯一有效的样式作用域。
export const resolvePopperTarget = (rootNode, container) => {
  const resolved = typeof container === "function" ? container() : container;
  if (
    resolved?.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
    resolved?.nodeType === Node.DOCUMENT_NODE
  )
    return resolved;
  const base = resolved || resolvePopperContainer(rootNode);
  if (!base) return null;
  if (
    base.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
    base.nodeType === Node.DOCUMENT_NODE
  )
    return base;
  return base.getRootNode?.() ?? null;
};

// 影子根 emotion 缓存按根缓存：head 默认缓存的规则不级联进影子树；
// WeakMap 防每次 render 重建缓存导致样式重灌（依赖先例：libs/domManager.js、
// components/TextareaResizeGrip.test.js）。speedy 关闭＝textContent 注入形态：
// jsdom 不为影子根内 style 标签挂载 sheet（cssRules 不可用），speedy 的
// insertRule 会让规则在测试与 DevTools 检视中双双不可读。
const shadowCaches = new WeakMap();
// 导出供裸 MUI Autocomplete 面（PluginInstanceFields.ProviderSettings）
// 共用同一按根缓存：影子根与缓存键一一对应（WeakMap 防重建），两面的
// 弹层样式注入同一影子根时共享同一份缓存。
export const getShadowCache = (shadowRoot) => {
  if (!shadowCaches.has(shadowRoot)) {
    shadowCaches.set(
      shadowRoot,
      createCache({
        key: "kt-aut-popper",
        container: shadowRoot,
        speedy: false,
      })
    );
  }
  return shadowCaches.get(shadowRoot);
};

const PSEUDO_DROPDOWN_STYLE_ID = "kt-autocomplete-styles";

// 每根仅一份：head 与影子根各自独立去重（id 命中即跳过该根的注入），
// 与 wordHover/YouTubeSubtitleList 同款注入范式。
// CSS 自定义属性在目标元素继承链上求值，标签物理位置不改变 var() 解析结果。
// 导出供裸 MUI Autocomplete 面（PluginInstanceFields.ProviderSettings）共用
// 同一注入入口：该面可独立于任何本组件实例挂载，须自行兜底注入一次。
export const ensurePseudoDropdownStyles = (rootNode) => {
  // head 注入仅限组件活在主文档（rootNode 为 Document 或挂载期未就绪的
  // null 回退路径，后者以全局 document 兜底）；组件在影子树内时向 head
  // 泄漏会让宿主页面吃到本组件的选中态规则，影子分支（下）负责该场景。
  // Document 节点的 ownerDocument 按 DOM 规范返回 null，故取 rootNode
  // 自身文档注入与去重。
  const inDocument = !rootNode || rootNode.nodeType === Node.DOCUMENT_NODE;
  const doc = rootNode?.nodeType === Node.DOCUMENT_NODE ? rootNode : document;
  if (inDocument && doc.head && !doc.getElementById(PSEUDO_DROPDOWN_STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = PSEUDO_DROPDOWN_STYLE_ID;
    style.setAttribute("data-kt-autocomplete", "");
    style.textContent = PSEUDO_DROPDOWN_CSS;
    doc.head.appendChild(style);
  }
  // 影子树内 head 样式不级联：根节点为 ShadowRoot（DOCUMENT_FRAGMENT_NODE）
  // 时在同一根内追加注入同一份 CSS，按根去重（querySelector 判存，
  // 不用 getElementById——jsdom ShadowRoot 可能缺该方法）。
  // rootNode 非影子（null/Document）时零行为变化。
  if (
    rootNode &&
    rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
    !rootNode.querySelector(`#${PSEUDO_DROPDOWN_STYLE_ID}`)
  ) {
    const shadowStyle = document.createElement("style");
    shadowStyle.id = PSEUDO_DROPDOWN_STYLE_ID;
    shadowStyle.setAttribute("data-kt-autocomplete", "");
    shadowStyle.textContent = PSEUDO_DROPDOWN_CSS;
    rootNode.appendChild(shadowStyle);
  }
};

/**
 * 一个可复用的 Autocomplete 组件，增加了 name 属性和标准化的 onChange 事件
 * @param {object} props - 组件的 props
 * @param {string} props.name - 表单字段的名称，会包含 in onChange 的 event.target 中
 * @param {string} props.label - TextField 的标签
 * @param {any} props.value - 受控组件的当前值
 * @param {function} props.onChange - 值改变时的回调函数 (event) => {}
 * @param {Array} props.options - Autocomplete 的选项列表
 */
export default function ReusableAutocomplete({
  name,
  label,
  value,
  onChange,
  textFieldProps = {},
  onOpen,
  onClose,
  open: controlledOpen,
  slotProps = {},
  baseSlot = {},
  ...rest
}) {
  // 本地 inputValue 用来暂存用户的文本输入框输入（对于 freeSolo 可输入非列表项的值很有用）
  const [inputValue, setInputValue] = useState(value || "");
  // 用以标识是否是选择下拉项提交的值变化，避免在 onBlur 时发生二次冗余的重复 onChange 提交
  const isChangeCommitted = useRef(false);
  const fieldRef = useRef(null);
  const popupRef = useRef(null);
  // 内部弹层引用与调用方 slotProps.popper.ref 合流：MUI 把 popper slotProps
  // 整体展开到 Popper（Autocomplete.js popperSlotProps），ref 键只允许一个，
  // 直接写 popupRef 会静默吞掉调用方引用，弹层节点永远到不了调用方手里。
  const popperRef = useForkRef(popupRef, slotProps.popper?.ref);
  // MUI v5 Autocomplete forwardRef 到根 div（@mui/material ^5.15.15），
  // 供 container 挂根判据，不依赖 renderInput 是否回挂 fieldRef。
  const rootRef = useRef(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  // 影子缓存与注入目标按挂载期一次性判定（useLayoutEffect，rootRef 就绪后
  // 立即固化）：不得随 open 翻转——包裹翻转 = 返回树根元素类型翻转
  // （CacheProvider ↔ 裸树），React 视为不同节点整树卸载重挂，输入框 DOM
  // 重建丢焦点（影子宿主场景开面板即复现，实测 input id :re:→:rg:）。
  // 挂载期判定后类型恒定，开合零重挂。判定与注入目标统一走
  // resolvePopperTarget：弹层最终落点（调用方显式容器优先，未传时回退链）
  // 归一到其根节点——组件活在影子树内、或弹层被显式指定进影子根时，都
  // 需要该根专属的缓存与注入体。
  // 已知边界（声明不扩大处理）：
  // ①挂载期固化重挂在首次 commit 后立即发生（paint 前），此刻尚无焦点可丢；
  //   仅「首渲染即 open=true 且焦点已入输入框」的受控边缘会丢一次焦点；
  // ②容器 prop 引用变化会触发本 effect 重评（依赖数组随 lint 契约声明），
  //   函数式容器的返回值仍在每次评估时随取随固化；getShadowCache 按根去重
  //   （WeakMap）与注入体按根幂等去重保证重评零副作用、包裹不翻转。
  const [shadowCache, setShadowCache] = useState(null);
  useLayoutEffect(() => {
    const targetRoot = resolvePopperTarget(
      rootRef.current,
      slotProps.popper?.container
    );
    if (targetRoot?.host) setShadowCache(getShadowCache(targetRoot));
    ensurePseudoDropdownStyles(targetRoot);
  }, [slotProps.popper?.container]);
  const closeDropdown = (event, reason) => {
    setLocalOpen(false);
    onClose?.(event, reason);
  };
  useDropdownDismiss({
    open,
    popupRef,
    anchorEl: fieldRef.current,
    onClose: closeDropdown,
  });

  // 外部传入值受控响应
  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  // 触发一个合成的 onChange 事件，使得其暴露出来的 API 行为与原生 input TextField 保持高度一致
  const triggerOnChange = (newValue) => {
    if (onChange) {
      const syntheticEvent = {
        target: {
          name: name,
          value: newValue,
        },
        preventDefault: () => {},
      };
      onChange(syntheticEvent);
    }
  };

  // 输入框失去焦点处理 (用于同步自由输入的 inputValue)
  const handleBlur = () => {
    if (isChangeCommitted.current) {
      isChangeCommitted.current = false;
      return;
    }

    if (inputValue !== value) {
      triggerOnChange(inputValue);
    }
  };

  // 从下拉选项中选中新项时的处理
  const handleChange = (event, newValue) => {
    isChangeCommitted.current = true;
    triggerOnChange(newValue);
  };

  // 输入框文字内容变化时的处理
  const handleInputChange = (event, newInputValue) => {
    isChangeCommitted.current = false;
    setInputValue(newInputValue);
  };

  const defaultRenderInput = (params) => (
    <TextField
      {...params}
      {...textFieldProps}
      ref={fieldRef}
      name={name}
      label={label}
    />
  );
  const renderInput = baseSlot.renderInput ?? defaultRenderInput;

  const autocompleteTree = (
    <Autocomplete
      ref={rootRef}
      value={value}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onBlur={handleBlur}
      {...rest}
      open={open}
      onOpen={(event) => {
        setLocalOpen(true);
        onOpen?.(event);
      }}
      onClose={closeDropdown}
      slotProps={{
        ...slotProps,
        popper: {
          ...slotProps.popper,
          ref: popperRef,
          // 专属弹层类：注入规则整组限定在它下面，只染本组件弹层。
          // 调用方 className 合并保留，不覆盖。
          className: [PSEUDO_DROPDOWN_POPPER_CLASS, slotProps.popper?.className]
            .filter(Boolean)
            .join(" "),
          // 弹层默认 portal 到 body，脱离 .kt-m3-root 令牌作用域，
          // 选中态 var(--kt-secc)/var(--kt-onsecc) 不可达。挂根顺序：
          // ① .kt-m3-root 祖先（closest 不跨影子边界）；② 锚点所属影子根
          // （主题根挂影子宿主时，令牌经宿主继承跨边界可达）；③ body 兜底。
          container: () => {
            const callerContainer = slotProps.popper?.container;
            // 调用方函数先无参调用取结果；结果为空（锚点未就绪等）回退
            // 默认回退链，非函数真值（节点）直接尊重——优先级与 P2 一致。
            if (typeof callerContainer === "function") {
              return (
                callerContainer() ?? resolvePopperContainer(rootRef.current)
              );
            }
            return callerContainer ?? resolvePopperContainer(rootRef.current);
          },
          // 挂回根内后叠加上下文改变，弹层须显式声明顶层 zIndex
          // （同 PopupMenu.js / TranForm.js 的既有范式）。数组形态追加后
          // flat 摊平一层：调用方数组 sx 升为顶层项（实测嵌套数组不被
          // styleFunctionSx 解析），对象/函数形态原样保留；顶层 zIndex
          // 按序后置胜出，falsy 项（未传 sx）被 emotion 忽略。
          sx: [slotProps.popper?.sx, { zIndex: 2147483647 }].flat(),
        },
      }}
      renderInput={renderInput}
      renderOption={
        baseSlot.renderOption ??
        rest.renderOption ??
        ((props, option) => {
          // MUI option props 携带 key：解构剥离后显式直传，避免 key 随
          // 展开进入 JSX 配置而触发 React 18 的 key 传播警告。
          const { key, ...optionProps } = props;
          return (
            <li
              key={key}
              {...optionProps}
              // kt-autocomplete-option 降级为纯定位标记类（调用方选择器兼容），
              // 样式钩子已由 MUI 自有 listbox/option 类承担。
              className={`${optionProps.className || ""} kt-autocomplete-option`}
            >
              {rest.getOptionLabel
                ? rest.getOptionLabel(option)
                : (option.label ?? String(option))}
            </li>
          );
        })
      }
    />
  );
  // 仅影子根回退路径包影子专属缓存；非影子路径零包裹、零行为变化。
  return shadowCache ? (
    <CacheProvider value={shadowCache}>{autocompleteTree}</CacheProvider>
  ) : (
    autocompleteTree
  );
}
