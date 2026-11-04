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
  // 契约（M3 v3.1 §3.1.C 统一 secc 形态）：选中 secc 底＋onsecc 文字，行圆角 8px；
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
  // 负向锁一：pri 竖条形态不得回流。
  expect(styleTag.textContent).not.toContain("inset 3px 0 0");
  // 负向锁二：样式钩子不得只挂自研类——那会让 baseSlot/rest 自定义渲染整体失配。
  expect(styleTag.textContent).not.toContain(
    '.kt-autocomplete-option[aria-selected="true"]'
  );
  // 三档状态齐全（#7 的"检查各状态的实际样式"义务）：焦点、选中、焦点且选中。
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
