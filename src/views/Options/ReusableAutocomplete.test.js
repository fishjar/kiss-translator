import fs from "fs";
import path from "path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Simulate } from "react-dom/test-utils";
import TextField from "@mui/material/TextField";
import ReusableAutocomplete, {
  resolvePopperContainer,
} from "./ReusableAutocomplete";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  // head 基线复位：document.head 为跨用例全局面，模块级注入体不随容器卸载回收，
  // 须逐用例定点移除本用例组的注入体，前一用例残留不得参与后一用例的全文档计数；
  // 只摘本模块 id 标签，不动 emotion 等第三方样式面。
  document
    .querySelectorAll("#kt-autocomplete-styles, style[data-kt-autocomplete]")
    .forEach((node) => node.remove());
});

test("uses the default input slot when no baseSlot is provided", async () => {
  await act(async () => {
    root.render(<ReusableAutocomplete name="x" label="X" options={[]} />);
  });
  expect(container.querySelector("label").textContent).toBe("X");
});

test("custom renderInput keeps the dismiss anchor on the autocomplete root", async () => {
  // 自定义输入槽不回挂 fieldRef：dismiss 的触发器归属判定不得因此失效
  // （anchorEl 落到弹层挂载判据同源的组件根），触发器上的按压不得误判
  // 为弹层外而关闭弹层。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
        baseSlot={{
          renderInput: (params) => <TextField {...params} label="Custom" />,
        }}
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  expect(document.querySelector(".MuiAutocomplete-popper")).not.toBeNull();
  act(() =>
    input.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      })
    )
  );
  expect(document.querySelector(".MuiAutocomplete-popper")).not.toBeNull();
});

test("adopts the renderInput slot provided through baseSlot", async () => {
  const renderInput = jest.fn((params) => (
    <TextField
      {...params}
      inputProps={{ ...params.inputProps, "aria-label": "custom-slot" }}
    />
  ));
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        options={["alpha", "beta"]}
        baseSlot={{ renderInput }}
      />
    );
  });
  expect(renderInput).toHaveBeenCalled();
  expect(container.querySelector('[aria-label="custom-slot"]')).toBeTruthy();
  // 契约：自定义输入槽必须把 MUI 的 params 整串交给输入组件。MUI 把
  // setAnchorEl 塞进 params.InputProps.ref（Autocomplete.js:615-616），且仅在
  // anchorEl 为真时渲染 Popper（Autocomplete.js:652）——裸 <input> 丢 ref 后
  // 弹层根本不出现，故"能定位并打开"是本用例的硬断言而非可选项。
  expect(container.querySelector(".MuiInputBase-root")).not.toBeNull();
  const input = container.querySelector('input[role="combobox"]');
  expect(input).not.toBeNull();
  // MUI 的开面板路径是 input 的 mousedown（useAutocomplete handleInputMouseDown
  // → handlePopupIndicator），click 不进该路径，故夹具派发 mousedown。
  await act(async () => {
    input.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    );
  });
  expect(input.getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector(".MuiAutocomplete-popper")).not.toBeNull();
});

test("applies the current pseudo-dropdown selected-state shape to all options", async () => {
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const selected = document.querySelector(
    '.MuiAutocomplete-listbox [aria-selected="true"]'
  );
  // 选中 secc 底＋onsecc 文字，行圆角 8px；
  // 状态规则一律绑在 MUI 自有 listbox/option 类上，自定义 renderOption 才能
  // 与默认渲染共享同一真源，特异度也才压得住 MUI v5 的同键规则。
  expect(selected).not.toBeNull();
  expect(selected.className).toContain("MuiAutocomplete-option");
  expect(selected.className).toContain("kt-autocomplete-option");
  const styleTag = document.querySelector("style[data-kt-autocomplete]");
  expect(styleTag.textContent).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] {'
  );
  expect(styleTag.textContent).toContain(
    "background-color: var(--kt-secc, #e8def8)"
  );
  expect(styleTag.textContent).toContain("color: var(--kt-onsecc, #1d192b)");
  // pri 竖条形态不得回流。
  expect(styleTag.textContent).not.toContain("inset 3px 0 0");
  // 样式钩子不得只挂自研类——那会让 baseSlot/rest 自定义渲染整体失配。
  expect(styleTag.textContent).not.toContain(
    '.kt-autocomplete-option[aria-selected="true"]'
  );
  // 三档状态齐全：hover、focus、选中、焦点且选中。
  // 瞬时状态层：hover/focus 一律 currentColor 8% 叠加层，
  // 严禁实心 surface 令牌 --kt-sf3；持久 [aria-selected] secondary-container 另计（单通道选择态）。
  expect(styleTag.textContent).toContain(
    "ul.MuiAutocomplete-listbox .MuiAutocomplete-option:hover { background-color: color-mix(in srgb, currentColor 8%, transparent); }"
  );
  expect(styleTag.textContent).toContain(
    "ul.MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused { background-color: color-mix(in srgb, currentColor 8%, transparent); }"
  );
  expect(styleTag.textContent).not.toContain("--kt-sf3");
  expect(styleTag.textContent).toContain(
    "ul.MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused {"
  );
  expect(styleTag.textContent).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused {'
  );
  expect(styleTag.textContent).toContain("border-radius: 8px");
});

test("keyboard-highlighted selected options carry a distinct focus ring", async () => {
  // owner 发现：已选行被键盘高亮（.Mui-focused/.Mui-focusVisible）与未高亮
  // 选中态同色、零反馈。契约：高亮选中态叠加独立 box-shadow 环（pri 描边），
  // forced-colors 下以系统色 outline 替代（高对比引擎吞 box-shadow 染色），
  // 未高亮选中行仍走纯底色规则——反馈只在高亮态出现。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const styleTag = document.querySelector("style[data-kt-autocomplete]");
  expect(styleTag).not.toBeNull();
  // 高亮选中态两态同口径：底色之上追加独立 box-shadow 键。
  expect(styleTag.textContent).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused { background-color: var(--kt-secc, #e8def8); box-shadow: inset 0 0 0 2px var(--kt-pri, #0b57d0); }'
  );
  expect(styleTag.textContent).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focusVisible { background-color: var(--kt-secc, #e8def8); box-shadow: inset 0 0 0 2px var(--kt-pri, #0b57d0); }'
  );
  // forced-colors 退化腿：系统色描边替代自绘环，保留选中兜底。
  expect(styleTag.textContent).toContain("@media (forced-colors: active)");
  expect(styleTag.textContent).toContain("outline: 2px solid CanvasText");
  expect(styleTag.textContent).toContain("outline-offset: -2px");
  expect(styleTag.textContent).toContain("box-shadow: none");
  // 不该触发域：未高亮选中行维持纯底色形态（无 box-shadow 键）。
  expect(styleTag.textContent).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] { background-color: var(--kt-secc, #e8def8); color: var(--kt-onsecc, #1d192b); }'
  );
});

test("@media (forced-colors: active) block is single and scoped to selected highlight only", async () => {
  await act(async () => {
    document.body.innerHTML = "";
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
      />
    );
  });
  const combobox = container.querySelector('input[role="combobox"]');
  await act(async () => {
    combobox.focus();
  });
  const css = document.querySelector("style[data-kt-autocomplete]").textContent;
  // 媒体块恰 1 处（注入体不重复）。
  expect(css.split("@media (forced-colors: active)").length - 1).toBe(1);
  // 块内仅两条 selected 选择器，不泛到普通 option。
  expect(css).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused'
  );
  expect(css).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focusVisible'
  );
  // HC 兜底用系统色 outline，且把自有 box-shadow 环让位。
  expect(css).toContain("outline: 2px solid CanvasText");
  expect(css).toContain("box-shadow: none");
  // 不该触发域：未选中普通选中态无环、无 outline 声明。
  expect(css).toContain(
    'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] { background-color: var(--kt-secc, #e8def8); color: var(--kt-onsecc, #1d192b); }'
  );
  // token 退化腿：环色必须带 fallback，脱离 .kt-m3-root 仍可见。
  expect(css).toContain("var(--kt-pri, #0b57d0)");
});

test("installs the pseudo-dropdown stylesheet once per document, not per instance", async () => {
  const second = document.createElement("div");
  document.body.appendChild(second);
  const secondRoot = createRoot(second);
  try {
    await act(async () => {
      root.render(<ReusableAutocomplete name="x" label="X" options={[]} />);
    });
    await act(async () => {
      secondRoot.render(
        <ReusableAutocomplete name="y" label="Y" options={[]} />
      );
    });
    // 同文档多实例共一份注入体，实例数不得参与标签计数。
    expect(
      document.querySelectorAll("style[data-kt-autocomplete]")
    ).toHaveLength(1);
    expect(document.querySelectorAll("#kt-autocomplete-styles")).toHaveLength(
      1
    );
    // 反例：注入体只允许挂在 document.head，不得留在任一实例子树内。
    expect(container.querySelector("style[data-kt-autocomplete]")).toBeNull();
    expect(second.querySelector("style[data-kt-autocomplete]")).toBeNull();
    const injected = document.head.querySelector("#kt-autocomplete-styles");
    expect(injected).not.toBeNull();
    // 层叠序机检：注入体必须居所有 emotion 样式标签之后（同特异度平手规则
    // 靠后置胜出）；严禁 insertBefore(head.firstChild) 式前置翻负胜负手。
    const emotionTags = [
      ...document.head.querySelectorAll("style[data-emotion]"),
    ];
    expect(emotionTags.length).toBeGreaterThan(0);
    emotionTags.forEach((tag) => {
      expect(
        injected.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_PRECEDING
      ).toBeTruthy();
    });
  } finally {
    await act(async () => secondRoot.unmount());
    second.remove();
  }
});

test("keeps the pseudo-dropdown stylesheet out of the host document under a shadow root", async () => {
  // 影子挂载场景：head 注入仅限 Document（及挂载期未就绪的 null 回退）；
  // 组件活在影子树内时由影子分支就地注入，宿主 document.head 不得被污染。
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const shadowBox = document.createElement("div");
  shadowBox.className = "kt-m3-root";
  shadowRoot.appendChild(shadowBox);
  const shadowContainer = document.createElement("div");
  shadowBox.appendChild(shadowContainer);
  const hostRoot = createRoot(shadowContainer);
  try {
    await act(async () => {
      hostRoot.render(
        <ReusableAutocomplete name="x" label="X" options={[]} openOnFocus />
      );
    });
    const input = shadowContainer.querySelector('input[role="combobox"]');
    await act(async () => {
      input.focus();
    });
    // head 零污染。
    expect(document.querySelector("style[data-kt-autocomplete]")).toBeNull();
    expect(document.head.querySelector("#kt-autocomplete-styles")).toBeNull();
    // 影子根内就地注入同一份选中态规则。
    const injected = shadowRoot.querySelector("style[data-kt-autocomplete]");
    expect(injected).not.toBeNull();
    expect(injected.textContent).toContain(
      "background-color: var(--kt-secc, #e8def8)"
    );
  } finally {
    await act(async () => hostRoot.unmount());
    host.remove();
  }
});

test("mounts the popper inside the M3 root so selected-state tokens stay reachable", async () => {
  // 结构契约：MUI Popper 默认 portal 到 document.body，脱离 .kt-m3-root 的
  // CSS 自定义属性作用域，选中态 var(--kt-secc)/var(--kt-onsecc) 在弹层内不可达，
  // 选中底色/文字色整体失效。挂载容器须回根内（closest 失败退 body），
  // 并显式声明顶层 zIndex（同 PopupMenu.js / TranForm.js 的既有范式）。
  // jsdom getComputedStyle 不做 var() 替换（探针实测 backgroundColor=""），
  // 故计算样式断言不可行，本用例钉结构面。
  const rootWrapper = document.createElement("div");
  rootWrapper.className = "kt-m3-root";
  document.body.appendChild(rootWrapper);
  const popperRoot = createRoot(rootWrapper);
  try {
    await act(async () => {
      popperRoot.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value="alpha"
          options={["alpha", "beta"]}
          openOnFocus
        />
      );
    });
    const input = rootWrapper.querySelector('input[role="combobox"]');
    await act(async () => {
      input.focus();
    });
    const popper = document.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    // 弹层必须挂在 .kt-m3-root 子树内（本用例容器），不得漂回 body 直下。
    expect(popper.closest(".kt-m3-root")).toBe(rootWrapper);
    expect(popper.parentElement).not.toBe(document.body);
    // 挂回根内后叠加上下文改变，弹层须携带显式顶层 zIndex（与组件内同值）。
    expect(getComputedStyle(popper).zIndex).toBe("2147483647");
    // 竞争后插反向保障（结构锁）：宿主页面可能在注入体之后追加同特异度
    // (0,1,0) 的同名类规则，真浏览器按特异度裁决时文档序靠后者须被压制。
    // jsdom 的 getComputedStyle 按文档序裁决、不按特异度（探针实证：后置
    // (0,1,0) 会压过前置 (0,2,0) 甚至 !important），计算样式无法裁决竞争，
    // 故此保障只能结构锁定：注入体 z-index 规则必须双写类名提到 (0,2,0)。
    const injectedStyle = document.querySelector("style[data-kt-autocomplete]");
    expect(injectedStyle.textContent).toContain(
      ".kt-autocomplete-popper.kt-autocomplete-popper { z-index: 2147483647; }"
    );
  } finally {
    await act(async () => popperRoot.unmount());
    rootWrapper.remove();
  }
});

test("mounts the popper inside the M3 root even when the input slot never sets the field ref", async () => {
  // 契约：挂根判据不得依赖 fieldRef——baseSlot.renderInput 自定义输入槽
  // （不回挂 fieldRef）场景下 Popper 仍须落在 .kt-m3-root 子树内，
  // 不得漂回 body 直下（脱离主题根令牌作用域）。
  const rootWrapper = document.createElement("div");
  rootWrapper.className = "kt-m3-root";
  document.body.appendChild(rootWrapper);
  const popperRoot = createRoot(rootWrapper);
  try {
    await act(async () => {
      popperRoot.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value="alpha"
          options={["alpha", "beta"]}
          openOnFocus
          baseSlot={{
            renderInput: (params) => (
              <TextField {...params} aria-label="custom-slot" />
            ),
          }}
        />
      );
    });
    const input = rootWrapper.querySelector('input[role="combobox"]');
    expect(input).not.toBeNull();
    await act(async () => {
      input.focus();
    });
    const popper = document.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    expect(popper.closest(".kt-m3-root")).toBe(rootWrapper);
    expect(popper.parentElement).not.toBe(document.body);
  } finally {
    await act(async () => popperRoot.unmount());
    rootWrapper.remove();
  }
});

test("mounts the popper into the shadow root when the theme root sits on the shadow host", async () => {
  // 契约：.kt-m3-root 挂在影子宿主上、影子内无 .kt-m3-root 祖先时，
  // closest 不跨影子边界必然未命中；回退须取锚点所属影子根（令牌经宿主
  // 继承跨边界可达），不得漂回 document.body 直下（丢令牌作用域）。
  const host = document.createElement("div");
  host.className = "kt-m3-root";
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const inner = document.createElement("div");
  shadowRoot.appendChild(inner);
  const popperRoot = createRoot(inner);
  try {
    await act(async () => {
      popperRoot.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value="alpha"
          options={["alpha", "beta"]}
          openOnFocus
        />
      );
    });
    const input = inner.querySelector('input[role="combobox"]');
    await act(async () => {
      input.focus();
    });
    const popper = shadowRoot.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    // 结构断言：弹层挂在影子根内（getRootNode 为该影子根），未漂回 body 直下。
    expect(popper.getRootNode()).toBe(shadowRoot);
    expect(popper.parentElement).not.toBe(document.body);
    // 开合零重挂契约：缓存包裹翻转不得重建输入框 DOM（影子宿主场景开面板
    // 即整树重挂丢焦点）。开面板前后输入框必须是同一节点且焦点仍在输入框。
    expect(inner.querySelector('input[role="combobox"]')).toBe(input);
    expect(shadowRoot.activeElement).toBe(input);
    // emotion 影子缓存契约：head 默认缓存的规则（含 sx 的 zIndex 顶层声明
    // 与 MUI 组件样式）不级联进影子树，回退路径必须把弹层树包进以影子根
    // 为 container 的专属缓存。
    // 鉴别力注记：jsdom 的 getComputedStyle
    // 不实现影子边界级联隔离——旧实现下 head 注入的 zIndex 被照常解析（假绿），
    // 影子缓存实现后影子内注入的规则反而取不到（返回空串）。故 zIndex 断言
    // 改由 CSSOM 管道承载（下行两条），计算值断言移除。
    const shadowEmotionStyles = Array.from(
      shadowRoot.querySelectorAll('style[data-emotion="kt-aut-popper"]')
    );
    expect(shadowEmotionStyles.length).toBeGreaterThan(0);
    // 顶层 zIndex 由按根注入体承载（emotion 通道在混合拓扑下会灌错根）；
    // 影子落点时注入体与影子缓存同根。
    const shadowRuleText = [
      ...Array.from(
        shadowRoot.querySelectorAll("style[data-kt-autocomplete]")
      ).map((style) => style.textContent),
      ...shadowEmotionStyles.flatMap((style) => [
        style.textContent,
        ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
      ]),
    ]
      .join("\n")
      .replace(/\s+/g, "");
    expect(shadowRuleText).toContain("z-index:2147483647");
    // 令牌继承尽力断言已移除：jsdom getComputedStyle 对跨影子
    // 边界的自定义属性继承返回空串，令牌可达性由
    // 结构断言（弹层挂影子根 ⇒ 宿主令牌经继承作用域可达）承载。
  } finally {
    await act(async () => popperRoot.unmount());
    host.remove();
  }
});

test("shadow-root pointerdown inside the popup neither dismisses it nor breaks selection", async () => {
  // 影子宿主下 document 级监听收到的 event.target 被重定向为宿主，旧
  // contains() 判定把弹层内点击误判为外部——pointerdown 即误关弹层，
  // 后续 click 落空。composedPath 归属判定后：选项 pointerdown 不关弹层，
  // 同一手势的 click 仍能提交选择。
  const onChange = jest.fn();
  const host = document.createElement("div");
  host.className = "kt-m3-root";
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const inner = document.createElement("div");
  shadowRoot.appendChild(inner);
  const popperRoot = createRoot(inner);
  try {
    await act(async () => {
      popperRoot.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value=""
          options={["alpha", "beta"]}
          openOnFocus
          onChange={onChange}
        />
      );
    });
    const input = inner.querySelector('input[role="combobox"]');
    await act(async () => {
      input.focus();
    });
    const popper = shadowRoot.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    const option = popper.querySelector('[role="option"]');
    expect(option).not.toBeNull();
    // 影子内 pointerdown：误关回归绊线（修复前 target=宿主 → backdropClick
    // 误关，此处弹层消失、后续 click 静默落空）。原生派发（composed=true）
    // 才能穿透影子边界触发 document 级捕获监听：React Simulate 事件不出
    // 影子根，合成形态下本断言属假绿（jsdom 无 PointerEvent 构造器，
    // 先例：focusModality.test.js、TextareaResizeGrip.test.js）。
    act(() => {
      option.dispatchEvent(
        new Event("pointerdown", { bubbles: true, composed: true })
      );
    });
    expect(shadowRoot.querySelector(".MuiAutocomplete-popper")).not.toBeNull();
    act(() => Simulate.click(option));
    // ReusableAutocomplete 经合成事件单参提交：target.value 即所选选项值。
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: { name: "x", value: "alpha" } })
    );
    expect(inner.querySelector('input[role="combobox"]')).toBe(input);
  } finally {
    await act(async () => popperRoot.unmount());
    host.remove();
  }
});

test("injects the pseudo-dropdown stylesheet into the shadow root hosting the popper", async () => {
  // 契约：Popper 经 container 挂入影子树内的 .kt-m3-root 时，document.head
  // 的注入体不级联进影子树，选中/聚焦/圆角规则在影子内整体失活——同一份
  // CSS 必须按根注入：head 恒一份、每个影子根恒一份。
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const rootWrapper = document.createElement("div");
  rootWrapper.className = "kt-m3-root";
  shadowRoot.appendChild(rootWrapper);
  const popperRoot = createRoot(rootWrapper);
  try {
    await act(async () => {
      popperRoot.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value="alpha"
          options={["alpha", "beta"]}
          openOnFocus
        />
      );
    });
    const input = rootWrapper.querySelector('input[role="combobox"]');
    await act(async () => {
      input.focus();
    });
    const popper = rootWrapper.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    expect(popper.closest(".kt-m3-root")).toBe(rootWrapper);
    // Emotion 影子缓存契约：组件活在影子树内 ⇒ 弹层 emotion 规则必须注入
    // 该影子根，不得落 document.head（head 规则不级联进影子树）。CSSOM
    // 管道断言（jsdom getComputedStyle 无影子边界隔离，计算值断言无鉴别力，
    // 见影子宿主用例回执）。顶层 zIndex 由按根注入体承载。
    const popperShadowStyles = Array.from(
      shadowRoot.querySelectorAll('style[data-emotion="kt-aut-popper"]')
    );
    expect(popperShadowStyles.length).toBeGreaterThan(0);
    const popperShadowRuleText = popperShadowStyles
      .flatMap((style) => [
        style.textContent,
        ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
      ])
      .join("\n")
      .replace(/\s+/g, "");
    expect(popperShadowRuleText).not.toContain("z-index:2147483647");
    // 影子根内必须有一份注入体且含选中态规则（含 ul 元素限定的提升特异度
    // 与键盘高亮 Mui-focusVisible 选中态覆盖）；顶层 zIndex 由注入体承载。
    const shadowStyle = shadowRoot.querySelector("style[data-kt-autocomplete]");
    expect(shadowStyle).not.toBeNull();
    expect(shadowStyle.textContent.replace(/\s+/g, "")).toContain(
      "z-index:2147483647"
    );
    expect(shadowStyle.textContent).toContain(
      'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] {'
    );
    expect(shadowStyle.textContent).toContain(
      'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focusVisible {'
    );
    // 影子根内层叠顺序登记：无论注入体与 emotion 标签谁先谁后，选中态规则
    // (0,3,1)/(0,4,1) 特异度严格高于 MUI v5 同键规则 (0,2,0)/(0,3,0)，层叠
    // 结果与标签物理顺序无关。此处断言注入体与 emotion 标签是不同节点，
    // 并登记实测先后供层叠推演锚定。
    const injectedIndex = [...shadowRoot.children].indexOf(shadowStyle);
    const emotionIndexes = popperShadowStyles.map((style) =>
      [...shadowRoot.children].indexOf(style)
    );
    expect(injectedIndex).toBeGreaterThanOrEqual(0);
    // 实测物理顺序：data-kt-autocomplete 注入体（ensurePseudoDropdownStyles
    // 挂载期追加）先于弹层渲染期经影子缓存注入的 emotion 标签——注入体在前的
    // 形态真实存在。选中态规则 (0,3,1)/(0,4,1) 特异度严格高于 MUI v5 同键规则
    // (0,2,0)/(0,3,0)，层叠结果因此与该顺序无关；若此断言红说明注入时序翻转，
    // 层叠结果仍不变，按新顺序更新本登记即可，严禁回退特异度。
    expect(emotionIndexes.some((index) => index > injectedIndex)).toBe(true);
    // document 零污染：head 注入仅限 Document（及挂载期未就绪的 null 回退）
    // 场景，组件活在影子树内时不得向宿主 head 泄漏注入体。
    expect(
      document.querySelectorAll("style[data-kt-autocomplete]")
    ).toHaveLength(0);
    // 注入体不得落入实例子树。
    expect(rootWrapper.querySelector("style[data-kt-autocomplete]")).toBeNull();
  } finally {
    await act(async () => popperRoot.unmount());
    host.remove();
  }
});

test("container override into a shadow root re-homes injection and emotion cache to that root", async () => {
  // 契约：调用方经 slotProps.popper.container 显式指定影子根容器时，伪下拉
  // 规则注入与弹层 emotion 缓存都必须跟随最终解析出的容器根，而非输入框
  // 所在根节点——head 注入体与 head 默认缓存的规则都不级联进影子树，
  // 两者落 head 即整体失活。容器回退链（.kt-m3-root 祖先 → 影子根 → body）
  // 行为不变。
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const inner = document.createElement("div");
  document.body.appendChild(inner);
  const popperRoot = createRoot(inner);
  try {
    let controlledValue = "";
    const handleChange = (event) => {
      controlledValue = event.target.value;
      rerender();
    };
    const rerender = () =>
      popperRoot.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value={controlledValue}
          options={["alpha", "beta"]}
          openOnFocus
          textFieldProps={{ sx: { marginTop: "28px" } }}
          slotProps={{
            popper: { container: () => shadowRoot, sx: { padding: "12px" } },
          }}
          onChange={handleChange}
        />
      );
    await act(async () => {
      rerender();
    });
    const input = inner.querySelector('input[role="combobox"]');
    await act(async () => {
      input.focus();
    });
    const popper = shadowRoot.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    expect(popper.getRootNode()).toBe(shadowRoot);
    // 树级缓存包裹翻转落地后再挂载文档侧 styled 元素：值由空变非空使
    // 清除按钮此刻挂载——缓存作用域必须按子树归属确定性解析，不随
    // 挂载时序漂移（时序漂移下该元素规则会被灌进落点缓存）。
    await act(async () => {
      controlledValue = "alpha";
      rerender();
    });
    // 伪下拉规则注入体落在影子根，head 零泄漏。
    const injected = shadowRoot.querySelector("style[data-kt-autocomplete]");
    expect(injected).not.toBeNull();
    expect(injected.textContent).toContain(
      'ul.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] {'
    );
    expect(
      document.querySelectorAll("style[data-kt-autocomplete]")
    ).toHaveLength(0);
    // 弹层 emotion 影子缓存同根：textContent 包含判定（jsdom 影子根内
    // style 无 sheet，speedy:false 为 textContent 形态）；head 零泄漏。
    const cacheStyles = shadowRoot.querySelectorAll(
      'style[data-emotion="kt-aut-popper"]'
    );
    expect(cacheStyles.length).toBeGreaterThan(0);
    const cacheText = Array.from(cacheStyles)
      .map((style) => style.textContent)
      .join("\n")
      .replace(/\s+/g, "");
    expect(
      document.querySelectorAll('style[data-emotion="kt-aut-popper"]')
    ).toHaveLength(0);
    // 顶层 zIndex 归注入体承载（按落点根注入，随影子缓存同根），不再走
    // emotion 通道——混合拓扑下 emotion 规则会被灌错根。
    expect(injected.textContent.replace(/\s+/g, "")).toContain(
      "z-index:2147483647"
    );
    // 输入框样式作用域（混合拓扑闸）：组件在文档、弹层落影子根时，输入框
    // 的 emotion 样式必须留在环境缓存（head）——影子根内规则不级联出边界，
    // 弹层落点缓存劫走输入框样式即失样。旧实现整树单缓存下此断言红
    // （输入框样式被灌进影子根）。
    const inputClass = Array.from(input.classList).find((cls) =>
      cls.startsWith("css-")
    );
    expect(inputClass).toBeDefined();
    const headEmotionText = Array.from(
      document.querySelectorAll("style[data-emotion]")
    )
      .flatMap((style) => [
        style.textContent,
        ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
      ])
      .join("\n")
      .replace(/\s+/g, "");
    expect(headEmotionText).toContain(`.${inputClass}{`);
    // 影子缓存不得包含输入框样式类。
    expect(cacheText).not.toContain(`.${inputClass}{`);
    // 组件根样式规则作用域（缓存边界闸）：根 div 作用域规则（含
    // clearIndicator 等 root 变体）服务于文档侧根 div，必须留在环境缓存——
    // 树级落点缓存劫走根样式即把整组规则灌错根（影子根内选择器永不命中）。
    expect(cacheText).not.toContain("MuiAutocomplete-root");
    expect(headEmotionText).toContain("MuiAutocomplete-clearIndicator");
    // 输入框独有 sx 规则随本次渲染落环境缓存（不由前例残留规则顶替）。
    expect(headEmotionText).toContain("margin-top:28px");
    // 调用方 popper.sx 属弹层落点根的样式诉求：混合拓扑下须经桥落影子
    // 缓存，不得落 head（影子根内 head 规则不级联即失活）。
    expect(cacheText).toContain("padding:12px");
    expect(headEmotionText).not.toContain("padding:12px");
  } finally {
    await act(async () => popperRoot.unmount());
    inner.remove();
    host.remove();
  }
});

test("popper cache follows the landing point across a shadow→document switch", async () => {
  // 落点跟随契约：调用方容器在开合间切换落点根时，弹层缓存必须随落点
  // 翻转——影子落点时样式入影子根，文档落点时样式回到文档环境缓存。
  // 旧实现缓存只在挂载期判定一次、永不回置，落点切回文档后样式仍滞留
  // 影子根（文档侧弹层失样）。包裹翻转＝整树重挂，仅落点真变时发生，
  // 重挂后需重新聚焦输入框。
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const inner = document.createElement("div");
  document.body.appendChild(inner);
  let landing = shadowRoot;
  const popperRoot = createRoot(inner);
  try {
    await act(async () => {
      popperRoot.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value="alpha"
          options={["alpha", "beta"]}
          openOnFocus
          slotProps={{ popper: { container: () => landing } }}
        />
      );
    });
    const focusInput = async () => {
      const input = inner.querySelector('input[role="combobox"]');
      await act(async () => {
        input.focus();
      });
      return input;
    };
    // 影子落点开面板：弹层与缓存样式入影子根。
    await focusInput();
    let popper = shadowRoot.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    expect(
      shadowRoot.querySelectorAll('style[data-emotion="kt-aut-popper"]').length
    ).toBeGreaterThan(0);
    // 关闭并把落点切回文档：容器返回 undefined 走默认回退链。
    await act(async () => {
      const input = inner.querySelector('input[role="combobox"]');
      input.blur();
    });
    landing = undefined;
    // 文档落点重开：聚焦触发开面板与落点翻转（包裹翻转＝整树重挂，open
    // 状态由组件持有不随子树重挂丢失），MUI 的失焦关闭定时器排空后弹层
    // 以文档落点缓存保持开启。
    await focusInput();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    popper = document.body.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    expect(popper.getRootNode()).toBe(document);
    const headAllText = Array.from(
      document.querySelectorAll("style[data-emotion]")
    )
      .flatMap((style) => [
        style.textContent,
        ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
      ])
      .join("\n")
      .replace(/\s+/g, "");
    // 文档落点的顶层 zIndex 同样由按根注入体承载（head 侧 <style> 文本）。
    expect(
      Array.from(document.querySelectorAll("style[data-kt-autocomplete]"))
        .map((style) => style.textContent)
        .join("\n")
        .replace(/\s+/g, "")
    ).toContain("z-index:2147483647");
    // 文档侧输入框样式不受落点翻转影响（环境缓存重声明持续生效）。
    const reopenedInput = inner.querySelector('input[role="combobox"]');
    const reopenedClass = Array.from(reopenedInput.classList).find((cls) =>
      cls.startsWith("css-")
    );
    expect(headAllText).toContain(`.${reopenedClass}{`);
  } finally {
    await act(async () => popperRoot.unmount());
    inner.remove();
    host.remove();
  }
});

test("merges caller popper sx with the top-layer zIndex instead of overwriting it", async () => {
  // 契约：调用方 slotProps.popper.sx 的键必须保留；冲突键 zIndex 以本组件
  // 顶层声明为准（挂根后弹层须显式顶层 zIndex）。Oracle 不得用 width——
  // MUI 上游对 Popper 施加内联 style.width（Autocomplete.js:652-656，
  // 取 anchorEl.clientWidth），内联恒压 sx，与合并契约无关。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
        slotProps={{ popper: { sx: { padding: "8px" } } }}
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const popper = document.querySelector(".MuiAutocomplete-popper");
  expect(popper).not.toBeNull();
  expect(getComputedStyle(popper).padding).toBe("8px");
  expect(getComputedStyle(popper).zIndex).toBe("2147483647");
});

test("preserves caller array-form popper sx alongside the top-layer zIndex", async () => {
  // 契约：数组形态 sx 是 MUI 合法入参；对象展开 {...[]} 会把它打散成
  // 数值键对象而整体失效。数组后追加既保留调用方数组（含函数项）、
  // 又保证 zIndex 冲突项按序后置胜出。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
        slotProps={{
          popper: {
            sx: [{ padding: "8px" }, { marginTop: "4px" }],
          },
        }}
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const popper = document.querySelector(".MuiAutocomplete-popper");
  expect(popper).not.toBeNull();
  expect(getComputedStyle(popper).padding).toBe("8px");
  // jsdom getComputedStyle 不解析 margin-top（padding/zIndex 可解析，实测）：
  // margin 项改走 Emotion CSSOM 规则文本断言，口径与 AiDictCont 管道一致。
  const ruleText = Array.from(document.querySelectorAll("style[data-emotion]"))
    .flatMap((style) => [
      style.textContent,
      ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
    ])
    .join("\n")
    .replace(/\s+/g, "");
  const popperRules = Array.from(popper.classList)
    .flatMap((cls) =>
      Array.from(
        ruleText.matchAll(new RegExp("\\." + cls + "[^{}]*\\{[^}]*\\}", "g"))
      ).map((match) => match[0])
    )
    .join("\n");
  expect(popperRules).toContain("padding:8px");
  expect(popperRules).toContain("margin-top:4px");
  expect(getComputedStyle(popper).zIndex).toBe("2147483647");
});

test("preserves caller function-form popper sx alongside the top-layer zIndex", async () => {
  // 契约：函数形态 sx 以 theme 求值后生效；对象展开会整体丢失该函数。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
        slotProps={{ popper: { sx: (theme) => ({ padding: "6px" }) } }}
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const popper = document.querySelector(".MuiAutocomplete-popper");
  expect(popper).not.toBeNull();
  expect(getComputedStyle(popper).padding).toBe("6px");
  expect(getComputedStyle(popper).zIndex).toBe("2147483647");
});

test("does not crash when caller omits popper sx and still pins the top-layer zIndex", async () => {
  // 调用方不传 slotProps.popper.sx 时数组首项
  // 为 undefined，被 emotion 忽略——组件不崩、弹层照常渲染，且顶层
  // zIndex 恒 2147483647，零行为变化。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const popper = document.querySelector(".MuiAutocomplete-popper");
  expect(popper).not.toBeNull();
  expect(getComputedStyle(popper).zIndex).toBe("2147483647");
});

test("option state styling survives a custom renderOption", async () => {
  // 契约：状态规则绑 MUI 自有 option 类之后，自定义渲染不再需要重复加自研类；
  // 自定义渲染优先级（baseSlot > rest > 默认）不得因此翻转。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
        baseSlot={{
          renderOption: (props, option) => {
            const { key, ...optionProps } = props;
            return (
              <li key={key} {...optionProps}>
                custom {option}
              </li>
            );
          },
        }}
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const selected = document.querySelector(
    '.MuiAutocomplete-listbox [aria-selected="true"]'
  );
  expect(selected).not.toBeNull();
  expect(selected.textContent).toBe("custom alpha");
  const styleTag = document.querySelector("style[data-kt-autocomplete]");
  const selectedRule = styleTag.textContent
    .split("\n")
    .find((line) =>
      line.includes('.MuiAutocomplete-option[aria-selected="true"]')
    );
  expect(selectedRule).toContain("background-color: var(--kt-secc, #e8def8)");
  expect(selectedRule).toContain("color: var(--kt-onsecc, #1d192b)");
});

test("respects a caller-provided popper container instead of the default fallback chain", async () => {
  // 契约：调用方显式传入 slotProps.popper.container 时必须被尊重，
  // 不得被组件默认三级回退（closest→影子根→body）无条件覆盖。本用例
  // 容器不在任何 .kt-m3-root 内，钉死"不回落 body"的行为。
  const customNode = document.createElement("div");
  document.body.appendChild(customNode);
  try {
    await act(async () => {
      root.render(
        <ReusableAutocomplete
          name="x"
          label="X"
          value="alpha"
          options={["alpha", "beta"]}
          openOnFocus
          slotProps={{ popper: { container: () => customNode } }}
        />
      );
    });
    const input = container.querySelector('input[role="combobox"]');
    await act(async () => {
      input.focus();
    });
    const popper = customNode.querySelector(".MuiAutocomplete-popper");
    expect(popper).not.toBeNull();
    expect(popper.parentElement).toBe(customNode);
    expect(document.querySelector("body > .MuiAutocomplete-popper")).toBeNull();
  } finally {
    customNode.remove();
  }
});

test("scopes injected dropdown rules to the component popper class and merges caller className", async () => {
  // 注入体挂 head 即全文档生效：不限定本组件专属弹层类，会连带染宿主页面
  // 与插件面自有的 MUI Autocomplete；调用方 className 须合并而非覆盖。
  await act(async () => {
    root.render(
      <ReusableAutocomplete
        name="x"
        label="X"
        value="alpha"
        options={["alpha", "beta"]}
        openOnFocus
        slotProps={{ popper: { className: "caller-popper-class" } }}
      />
    );
  });
  const input = container.querySelector('input[role="combobox"]');
  await act(async () => {
    input.focus();
  });
  const popper = document.querySelector(".MuiAutocomplete-popper");
  expect(popper).not.toBeNull();
  expect(popper.classList.contains("kt-autocomplete-popper")).toBe(true);
  expect(popper.classList.contains("caller-popper-class")).toBe(true);

  const styleTag = document.querySelector("style[data-kt-autocomplete]");
  expect(styleTag.textContent).toContain(
    ".kt-autocomplete-popper ul.MuiAutocomplete-listbox .MuiAutocomplete-option { border-radius: 8px; }"
  );
  // 行首裸 ul.MuiAutocomplete 规则残留即泄漏面。
  expect(styleTag.textContent).not.toMatch(/^ul\.MuiAutocomplete-listbox/m);
});

test("resolvePopperContainer shadow fallback keeps the popper inside the shadow tree", () => {
  // 锚点位于无 .kt-m3-root 祖先的影子树内时，②腿返回影子根本身：Popper
  // 容器必须留在影子树内才能吃到影子 emotion 缓存与注入样式（ShadowRoot
  // 不可作 MUI Menu/Modal 的 container——scroll-lock 读 .style 会崩——
  // 此类消费者的锚点须保证 .kt-m3-root 祖先走①腿）。
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const anchor = document.createElement("div");
  shadowRoot.appendChild(anchor);
  // 同一性断言：ShadowRoot 直接进 expect 的序列化器会深拷贝崩溃。
  expect(resolvePopperContainer(anchor) === shadowRoot).toBe(true);

  // 光 DOM 锚点位于 .kt-m3-root 内时走①腿取 root 元素本身（closest
  // 不穿透影子边界，影子内锚点只能走②腿——上一断言已覆盖）。
  const pageRoot = document.createElement("div");
  pageRoot.className = "kt-m3-root";
  const lightAnchor = document.createElement("div");
  pageRoot.appendChild(lightAnchor);
  expect(resolvePopperContainer(lightAnchor) === pageRoot).toBe(true);

  // 无根可归时落 body 兜底。
  expect(resolvePopperContainer(document.createElement("div"))).toBe(
    document.body
  );
});

// 主题 MuiAutocomplete popper 覆盖闸：styleOverrides.popper 的规则生成归属
// Autocomplete 根组件所在缓存，PopperCacheBridge 只桥 Popper 子树——混合
// 拓扑（组件在文档、弹层落影子根）下规则落 head 失活。Popper 级主题样式
// 须走 slotProps.popper.sx（桥内编译，落点缓存）；禁止在主题 styleOverrides
// 内新增 popper 键（paper/listbox/option 系 Popper 子树规则，不在禁列）。
const THEME_FILES = [
  path.resolve(__dirname, "..", "..", "hooks", "M3Theme.js"),
  path.resolve(__dirname, "..", "..", "views", "Options", "OptionsTheme.js"),
];

const extractBalancedBlocks = (text, key) => {
  const blocks = [];
  const marker = `${key}: {`;
  let from = 0;
  for (;;) {
    const at = text.indexOf(marker, from);
    if (at === -1) return blocks;
    const open = at + marker.length;
    let depth = 0;
    let end = -1;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) return blocks;
    blocks.push(text.slice(at, end));
    from = end;
  }
};

const hasTopLevelPopperKey = (text, key) =>
  extractBalancedBlocks(text, key).some((block) => {
    const sub = extractBalancedBlocks(block, "styleOverrides")[0];
    if (!sub) return false;
    const body = sub
      .slice(sub.indexOf("{") + 1, sub.lastIndexOf("}"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    let depth = 0;
    let buf = "";
    for (const ch of body) {
      if (depth === 0 && /[A-Za-z0-9_$]/.test(ch)) buf += ch;
      if (ch === "{" || ch === "(" || ch === "[") depth += 1;
      if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
      if (depth === 0 && ch === ":") {
        if (buf.trim() === "popper") return true;
        buf = "";
      }
      if (depth === 0 && ch === ",") buf = "";
    }
    return false;
  });

describe("theme MuiAutocomplete popper override guard", () => {
  test("scanner flags a popper key inside MuiAutocomplete.styleOverrides", () => {
    // 闸牙自检（合成文本）：popper 键必须被识别，防闸空转。
    const text =
      "const t = { MuiAutocomplete: { styleOverrides: { popper: { border: 1 } } } };";
    expect(hasTopLevelPopperKey(text, "MuiAutocomplete")).toBe(true);
  });

  test("subtree overrides and defaultProps-only forms pass the guard", () => {
    // paper/listbox/option 系 Popper 子树规则（桥已覆盖），不在禁列；
    // 无 styleOverrides 的 defaultProps 形态放行。
    expect(
      hasTopLevelPopperKey(
        "const t = { MuiAutocomplete: { styleOverrides: { paper: (p) => ({ marginBlock: 4 }), listbox: { padding: 4 }, option: {} } } };",
        "MuiAutocomplete"
      )
    ).toBe(false);
    expect(
      hasTopLevelPopperKey(
        "const t = { MuiAutocomplete: { defaultProps: { popupIcon: null } } };",
        "MuiAutocomplete"
      )
    ).toBe(false);
  });

  test("registered theme files carry no MuiAutocomplete.styleOverrides.popper", () => {
    // 盘面扫描：登记主题文件（新增主题文件时同步登记 THEME_FILES）零 popper 键。
    for (const file of THEME_FILES) {
      const text = fs.readFileSync(file, "utf8");
      expect(hasTopLevelPopperKey(text, "MuiAutocomplete")).toBe(false);
    }
  });
});
