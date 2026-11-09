import { createRoot } from "react-dom/client";
import { act } from "react";
import TextField from "@mui/material/TextField";
import ReusableAutocomplete from "./ReusableAutocomplete";

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
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
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
    '.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] {'
  );
  expect(styleTag.textContent).toContain("background-color: var(--kt-secc)");
  expect(styleTag.textContent).toContain("color: var(--kt-onsecc)");
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
    ".MuiAutocomplete-listbox .MuiAutocomplete-option:hover { background-color: color-mix(in srgb, currentColor 8%, transparent); }"
  );
  expect(styleTag.textContent).toContain(
    ".MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused { background-color: color-mix(in srgb, currentColor 8%, transparent); }"
  );
  expect(styleTag.textContent).not.toContain("--kt-sf3");
  expect(styleTag.textContent).toContain(
    ".MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused {"
  );
  expect(styleTag.textContent).toContain(
    '.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused {'
  );
  expect(styleTag.textContent).toContain("border-radius: 8px");
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
    expect(document.querySelectorAll("#kt-autocomplete-styles")).toHaveLength(1);
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
        injected.compareDocumentPosition(tag) &
          Node.DOCUMENT_POSITION_PRECEDING
      ).toBeTruthy();
    });
  } finally {
    await act(async () => secondRoot.unmount());
    second.remove();
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
            renderInput: (params) => <TextField {...params} aria-label="custom-slot" />,
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
    const shadowRuleText = shadowEmotionStyles
      .flatMap((style) => [
        style.textContent,
        ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
      ])
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
    // Emotion 影子缓存契约：组件活在影子树内 ⇒ 弹层 emotion 规则（含 sx 的
    // zIndex 顶层声明）必须注入该影子根，不得落 document.head（head 规则
    // 不级联进影子树）。CSSOM 管道断言（jsdom getComputedStyle 无影子边界
    // 隔离，计算值断言无鉴别力，见影子宿主用例回执）。
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
    expect(popperShadowRuleText).toContain("z-index:2147483647");
    // 影子根内必须有一份注入体且含选中态规则。
    const shadowStyle = shadowRoot.querySelector("style[data-kt-autocomplete]");
    expect(shadowStyle).not.toBeNull();
    expect(shadowStyle.textContent).toContain(
      '.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] {'
    );
    // document 面行为保持：head 恒一份。
    expect(
      document.querySelectorAll("style[data-kt-autocomplete]")
    ).toHaveLength(1);
    // 注入体不得落入实例子树。
    expect(rootWrapper.querySelector("style[data-kt-autocomplete]")).toBeNull();
  } finally {
    await act(async () => popperRoot.unmount());
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
            return <li key={key} {...optionProps}>custom {option}</li>;
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
  expect(selectedRule).toContain("background-color: var(--kt-secc)");
  expect(selectedRule).toContain("color: var(--kt-onsecc)");
});

test("respects a caller-provided popper container instead of the default fallback chain", async () => {
  // 契约：调用方显式传入 slotProps.popper.container 时必须被尊重，
  // 不得被组件默认三级回退（closest→影子根→body）无条件覆盖。本用例
  // 容器不在任何 .kt-m3-root 内，旧实现会把弹层覆盖回 body 直下（真红）。
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
