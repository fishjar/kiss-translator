import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  forwardRef,
} from "react";
import { CacheProvider, withEmotionCache } from "@emotion/react";
import createCache from "@emotion/cache";
import Autocomplete from "@mui/material/Autocomplete";
import Popper from "@mui/material/Popper";
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
/* z-index 规则双写类名提到 (0,2,0)：宿主页面可能在注入体之后追加同特异度
   (0,1,0) 的同名类规则，文档序靠后会压过 (0,1,0)；顶层 zIndex 是弹层可
   用性契约，不允许被后插竞争者覆盖。 */
.${PSEUDO_DROPDOWN_POPPER_CLASS}.${PSEUDO_DROPDOWN_POPPER_CLASS} { z-index: 2147483647; }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option { border-radius: 8px; }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option:hover { background-color: color-mix(in srgb, currentColor 8%, transparent); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused { background-color: color-mix(in srgb, currentColor 8%, transparent); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] { background-color: var(--kt-secc, #e8def8); color: var(--kt-onsecc, #1d192b); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused { background-color: var(--kt-secc, #e8def8); }
.${PSEUDO_DROPDOWN_POPPER_CLASS} ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focusVisible { background-color: var(--kt-secc, #e8def8); }
`;

// 三级回退真源：container 回调与渲染期解析共用同一函数，避免两径漂移
// （回退序：① .kt-m3-root 祖先；② 锚点所属影子根；③ body 兜底）。
// ②腿返回影子根是 Popper 侧有意设计：弹层留在影子树内才能吃到影子
// emotion 缓存与注入样式；ShadowRoot 仅不可作 MUI Menu/Modal 的 container
// （scroll-lock 读 .style 会崩），此类消费者的锚点须保证有 .kt-m3-root
// 祖先（走①腿），不得在无根影子拓扑中接入本回退链。
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

// 文档侧弹层缓存按文档去重（组件活在影子树而弹层落文档的混合拓扑）：
// 字段根缓存服务影子树、head 默认缓存服务文档输入框，弹层落文档时两根
// 互异，弹层样式须单独取文档作用域缓存（WeakMap 防重建）。
const documentCaches = new WeakMap();
const getDocumentCache = (doc) => {
  const target = doc?.nodeType === Node.DOCUMENT_NODE ? doc : document;
  if (!documentCaches.has(target)) {
    documentCaches.set(
      target,
      createCache({
        key: "kt-aut-popper",
        container: target.head,
        speedy: false,
      })
    );
  }
  return documentCaches.get(target);
};

const PSEUDO_DROPDOWN_STYLE_ID = "kt-autocomplete-styles";

// Popper 子树缓存桥：Autocomplete 在组件内部渲染整棵 Popper（popper 根、
// paper、listbox、option 的规则都是真规则 styled 组件），这些规则跟随
// 渲染位置的缓存上下文。styled(Popper) 的 component 穿透无法把规则生成
// 挪进目标缓存（styled 包装层在 component 外侧），PopperComponent 换件
// 是唯一整树可控缝——把 Popper 子树包进落点缓存，树级缓存随之收敛为
// 字段根/环境作用域，组件根 div、输入框与 adornment 的规则不再被灌进
// 落点缓存（时序不再决定规则归属）。ktPopperCache 与 ktPopperSx 经
// slotProps.popper 传入并由本组件消费，不落到 DOM；调用方 popper sx 经
// ktPopperSx 在桥内应用（该位置的 sx 编译落在落点缓存），树级上下文
// 不再消费调用方 sx——混合拓扑下其规则不得落 head 失活。
const PopperCacheBridge = forwardRef(function PopperCacheBridge(
  { ktPopperCache, ktPopperSx, ...props },
  ref
) {
  const popper = <Popper {...props} sx={ktPopperSx} ref={ref} />;
  return ktPopperCache ? (
    <CacheProvider value={ktPopperCache}>{popper}</CacheProvider>
  ) : (
    popper
  );
});

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
function ReusableAutocompleteInner(
  {
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
  },
  ambientCache
) {
  // 本地 inputValue 用来暂存用户的文本输入框输入（对于 freeSolo 可输入非列表项的值很有用）
  const [inputValue, setInputValue] = useState(value || "");
  // 用以标识是否是选择下拉项提交的值变化，避免在 onBlur 时发生二次冗余的重复 onChange 提交
  const isChangeCommitted = useRef(false);
  const popupRef = useRef(null);
  // 内部弹层引用与调用方 slotProps.popper.ref 合流：MUI 把 popper slotProps
  // 整体展开到 Popper（Autocomplete.js popperSlotProps），ref 键只允许一个，
  // 直接写 popupRef 会静默吞掉调用方引用，弹层节点永远到不了调用方手里。
  const popperRef = useForkRef(popupRef, slotProps.popper?.ref);
  // MUI v5 Autocomplete forwardRef 到根 div（@mui/material ^5.15.15），
  // 供 container 挂根判据，不依赖 renderInput 是否回挂输入框引用。
  const rootRef = useRef(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  // 缓存按根与子树拆分：树级缓存取字段根缓存 ?? 环境缓存，承载组件根
  // div、输入框与 adornment 的样式作用域；弹层落点缓存（随落点真值跟随，
  // open 翻转重评——弹层仅 open 时挂载，落点拓扑可在开合间翻转）只经
  // PopperCacheBridge 作用 Popper 子树。混合拓扑（组件在文档、弹层落影子
  // 根，或反向）下两根互异，各侧样式各归其根。落点解析统一走
  // resolvePopperTarget：弹层最终落点（调用方显式容器优先，未传时回退链）
  // 归一到其根节点。
  // 已知边界（声明不扩大处理）：
  // ①挂载期固化重挂在首次 commit 后立即发生（paint 前），此刻尚无焦点可丢；
  //   仅「首渲染即 open=true 且焦点已入输入框」的受控边缘会丢一次焦点；
  // ②容器 prop 引用变化会触发本 effect 重评（依赖数组随 lint 契约声明），
  //   函数式容器的返回值仍在每次评估时随取随固化；getShadowCache 按根去重
  //   （WeakMap）与注入体按根幂等去重保证重评零副作用、包裹不翻转。
  const [fieldCache, setFieldCache] = useState(null);
  const [popperCache, setPopperCache] = useState(null);
  useLayoutEffect(() => {
    // 字段根缓存按组件自身所在根判定（影子宿主 → 影子缓存）。
    const fieldRoot = rootRef.current?.getRootNode?.();
    const nextFieldCache = fieldRoot?.host ? getShadowCache(fieldRoot) : null;
    setFieldCache(nextFieldCache);
    // 弹层落点缓存随落点真值跟随：影子落点 → 影子缓存；文档落点 →
    // 字段根缓存已服务文档（组件在文档，置 null 用环境缓存）或取按文档
    // 去重的 head 缓存（组件在影子树）。
    const targetRoot = resolvePopperTarget(
      rootRef.current,
      slotProps.popper?.container
    );
    if (targetRoot?.host) {
      setPopperCache(getShadowCache(targetRoot));
    } else {
      setPopperCache(nextFieldCache ? getDocumentCache(targetRoot) : null);
    }
    ensurePseudoDropdownStyles(targetRoot);
  }, [slotProps.popper?.container, open]);
  const closeDropdown = (event, reason) => {
    setLocalOpen(false);
    onClose?.(event, reason);
  };
  useDropdownDismiss({
    open,
    popupRef,
    // 触发器归属判定锚到组件根（挂载判据同源）：baseSlot 自定义输入槽
    // 自定义 renderInput 不回挂输入框引用时 anchorEl 不得为 null，否则触发器上的按压会被
    // 误判为弹层外而关闭弹层。
    anchorEl: rootRef.current,
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
    <TextField {...params} {...textFieldProps} name={name} label={label} />
  );
  // 输入框样式作用域桥：字段根缓存 ?? 环境缓存。弹层落点缓存包树时
  // （混合拓扑），环境缓存重声明把输入框样式拦回环境作用域——影子根
  // 内规则不级联出边界，影子落点缓存劫走文档输入框样式即失样。
  // renderInput 产物内包 CacheProvider：render prop 元素继承的是
  // Autocomplete 所在位置的上下文（弹层落点缓存），桥是唯一能把输入框
  // 子树拉回字段作用域的位置。
  const renderInput = (params) => {
    const fieldElement = (baseSlot.renderInput ?? defaultRenderInput)(params);
    const fieldCacheValue = fieldCache ?? ambientCache;
    return fieldCacheValue ? (
      <CacheProvider value={fieldCacheValue}>{fieldElement}</CacheProvider>
    ) : (
      fieldElement
    );
  };

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
      // Popper 子树缓存桥：见 PopperCacheBridge 注释——落点缓存只作用
      // Popper 子树，树级缓存不再整树包裹。
      PopperComponent={PopperCacheBridge}
      slotProps={{
        ...slotProps,
        popper: {
          // 调用方 sx 不随展开留在本对象（styled 包装层会在树级上下文
          // 消费它，混合拓扑下落 head 失活），改经 ktPopperSx 交桥内
          // Popper（编译落在落点缓存）。
          ...slotProps.popper,
          sx: undefined,
          ref: popperRef,
          ktPopperCache: popperCache,
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
          // 调用方 sx 经 ktPopperSx 交给桥内 Popper（编译落在落点缓存）；
          // 树级上下文不再消费调用方 sx（混合拓扑下会落 head 失活），顶层
          // zIndex 亦由 PSEUDO_DROPDOWN_CSS 注入体按落点根承载。
          ktPopperSx: slotProps.popper?.sx,
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
  // 树级缓存收敛为字段根/环境作用域：组件根 div、输入框与 adornment 的
  // 规则始终落各自正确根（混合拓扑下不再被灌进落点缓存，也不再依赖
  // 挂载时序）。弹层落点缓存只经 PopperCacheBridge 作用 Popper 子树。
  // 组件在文档且落点在文档（环境缓存即默认缓存）时零包裹、零行为变化。
  const treeCache = fieldCache ?? ambientCache;
  return treeCache ? (
    <CacheProvider value={treeCache}>{autocompleteTree}</CacheProvider>
  ) : (
    autocompleteTree
  );
}

// 环境缓存经 withEmotionCache 在包裹外层读取：组件根位置的上下文即
// 调用方环境缓存（弹层落点 CacheProvider 在返回树内层，不污染该读取）。
const ReusableAutocomplete = withEmotionCache(ReusableAutocompleteInner);

export default ReusableAutocomplete;
