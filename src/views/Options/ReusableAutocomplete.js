import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import useDropdownDismiss from "./useDropdownDismiss";

// 伪下拉选中态统一 secondary-container 形态（RuleEditor index.js 同款）：
// 选中 secc 底＋onsecc 文字（去 pri 竖条），hover/focus 走 currentColor 8% 瞬时层，行圆角 8px；
// 组件级注入覆盖全部调用方。
// 状态规则一律挂 MUI 自有 listbox/option 类，使默认渲染与 baseSlot/rest 自定义渲染
// 共用同一真源（盘面事实：Autocomplete.js:591-592 给 renderOption 的 props 注入
// classes.option；useAutocomplete.js:280-305 再以 classList 命令式给高亮项加/摘
// Mui-focused，键盘高亮另加 Mui-focusVisible）。listbox 限定把特异度抬到
// (0,2,0)~(0,4,0)，压得住 MUI v5 同键规则；注入体后置的层叠序闸作为第二重保障。
const PSEUDO_DROPDOWN_CSS = `
.MuiAutocomplete-listbox .MuiAutocomplete-option { border-radius: 8px; }
.MuiAutocomplete-listbox .MuiAutocomplete-option:hover { background-color: color-mix(in srgb, currentColor 8%, transparent); }
.MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused { background-color: color-mix(in srgb, currentColor 8%, transparent); }
.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] { background-color: var(--kt-secc); color: var(--kt-onsecc); }
.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused { background-color: var(--kt-secc); }
`;

// 三级回退真源：container 回调与渲染期解析共用同一函数，避免两径漂移
// （回退序：① .kt-m3-root 祖先；② 锚点所属影子根；③ body 兜底）。
const resolvePopperContainer = (anchor) => {
  const insideRoot = anchor?.closest(".kt-m3-root");
  if (insideRoot) return insideRoot;
  const ownerRoot = anchor?.getRootNode?.();
  if (ownerRoot?.host) return ownerRoot;
  return anchor?.ownerDocument.body;
};

// 影子根 emotion 缓存按根缓存：head 默认缓存的规则不级联进影子树；
// WeakMap 防每次 render 重建缓存导致样式重灌（依赖先例：libs/domManager.js、
// components/TextareaResizeGrip.test.js）。speedy 关闭＝textContent 注入形态：
// jsdom 不为影子根内 style 标签挂载 sheet（cssRules 不可用），speedy 的
// insertRule 会让规则在测试与 DevTools 检视中双双不可读。
const shadowCaches = new WeakMap();
const getShadowCache = (shadowRoot) => {
  if (!shadowCaches.has(shadowRoot)) {
    shadowCaches.set(
      shadowRoot,
      createCache({ key: "kt-aut-popper", container: shadowRoot, speedy: false })
    );
  }
  return shadowCaches.get(shadowRoot);
};

const PSEUDO_DROPDOWN_STYLE_ID = "kt-autocomplete-styles";

// 每根仅一份：head 与影子根各自独立去重（id 命中即跳过该根的注入），
// 与 wordHover/YouTubeSubtitleList 同款注入范式。
// CSS 自定义属性在目标元素继承链上求值，标签物理位置不改变 var() 解析结果。
const ensurePseudoDropdownStyles = (rootNode) => {
  if (document.head && !document.getElementById(PSEUDO_DROPDOWN_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = PSEUDO_DROPDOWN_STYLE_ID;
    style.setAttribute("data-kt-autocomplete", "");
    style.textContent = PSEUDO_DROPDOWN_CSS;
    document.head.appendChild(style);
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
  // MUI v5 Autocomplete forwardRef 到根 div（@mui/material ^5.15.15），
  // 供 container 挂根判据，不依赖 renderInput 是否回挂 fieldRef。
  const rootRef = useRef(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  // 影子缓存按挂载期一次性判定（useLayoutEffect，rootRef 就绪后立即固化）：
  // 不得随 open 翻转——包裹翻转 = 返回树根元素类型翻转（CacheProvider ↔ 裸树），
  // React 视为不同节点整树卸载重挂，输入框 DOM 重建丢焦点（影子宿主场景
  // 开面板即复现，实测 input id :re:→:rg:）。挂载期判定后类型恒定，开合零重挂。
  // 判定依据取组件根节点所属根（getRootNode）：组件活在影子树内就需要影子
  // 专属缓存——与弹层挂载点解析（resolvePopperContainer）是两个正交问题，
  // 后者可能返回影子内的 .kt-m3-root 元素（无 host），据此判定会漏掉
  // 「.kt-m3-root 位于影子树内」的场景，弹层与组件样式全部落 head 失效。
  // 已知边界（声明不扩大处理）：
  // ①挂载期固化重挂在首次 commit 后立即发生（paint 前），此刻尚无焦点可丢；
  //   仅「首渲染即 open=true 且焦点已入输入框」的受控边缘会丢一次焦点；
  // ②调用方经 slotProps.popper.container 显式传入容器时，缓存仍按组件所属
  //   根自动判定（正交关注点，不随调用方容器变化）。
  const [shadowCache, setShadowCache] = useState(null);
  useLayoutEffect(() => {
    const ownerRoot = rootRef.current?.getRootNode?.();
    if (ownerRoot?.host) setShadowCache(getShadowCache(ownerRoot));
  }, []);
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

  // 首次挂载保证 head 一份；本实例根在影子树内时再向该影子根补一份
  // （卸载不回收，注入体为常量，重复注入才是缺陷，与实例生命周期无关）。
  useEffect(() => {
    ensurePseudoDropdownStyles(rootRef.current?.getRootNode() ?? null);
  }, []);

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
    <TextField {...params} {...textFieldProps} ref={fieldRef} name={name} label={label} />
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
            ref: popupRef,
            // 弹层默认 portal 到 body，脱离 .kt-m3-root 令牌作用域，
            // 选中态 var(--kt-secc)/var(--kt-onsecc) 不可达。挂根顺序：
            // ① .kt-m3-root 祖先（closest 不跨影子边界）；② 锚点所属影子根
            // （主题根挂影子宿主时，令牌经宿主继承跨边界可达）；③ body 兜底。
            container: () => {
              const callerContainer = slotProps.popper?.container;
              // 调用方函数先无参调用取结果；结果为空（锚点未就绪等）回退
              // 默认回退链，非函数真值（节点）直接尊重——优先级与 P2 一致。
              if (typeof callerContainer === "function") {
                return callerContainer() ?? resolvePopperContainer(rootRef.current);
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
                  : option.label ?? String(option)}
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
