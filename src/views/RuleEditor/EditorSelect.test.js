import { act } from "react";
import { createRoot } from "react-dom/client";
import { MenuItem } from "@mui/material";
import EditorSelect from "./EditorSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("shadow menus retain the theme scope while navigating, searching and selecting", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  container.className = "notranslate";
  shadow.appendChild(container);
  const root = createRoot(container);
  const onChange = jest.fn();

  try {
    act(() =>
      root.render(
        <div className="kt-m3-root">
          <EditorSelect label="Purpose" value="alpha" onChange={onChange}>
            <MenuItem value="alpha">Alpha</MenuItem>
            <MenuItem value="blocked" disabled>
              Blocked
            </MenuItem>
            <MenuItem value="beta">Beta</MenuItem>
            <MenuItem value="bravo">Bravo</MenuItem>
          </EditorSelect>
        </div>
      )
    );
    act(() =>
      shadow
        .querySelector('[role="combobox"]')
        .dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0 })
        )
    );
    const themeRoot = container.querySelector(".kt-m3-root");
    const list = shadow.querySelector('[role="listbox"]');
    const options = list.querySelectorAll('[role="option"]');
    const press = (key) =>
      act(() =>
        shadow.activeElement.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          })
        )
      );

    expect(list.closest(".kt-m3-root")).toBe(themeRoot);
    // 发行版纵向单列行为被 c1222ef5 误改为两列网格。jsdom 无几何
    // （offsetTop 恒 0），"纵向"以负向锁 grid 布局缺位 + DOM 顺序/单步键盘导航正向锁
    // （本用例下方 press 段）共同证明，禁几何断言。
    expect(getComputedStyle(list).display).not.toBe("grid");
    expect(getComputedStyle(list).gridTemplateColumns).not.toContain("repeat(2");
    const paper = list.closest(".MuiPaper-root");
    expect(getComputedStyle(paper).borderRadius).toBe("4px");
    expect(getComputedStyle(paper).minHeight).toBe("48px");
    expect(shadow.activeElement).toBe(options[0]);
    press("ArrowDown");
    expect(shadow.activeElement).toBe(options[2]);
    press("Home");
    expect(shadow.activeElement).toBe(options[0]);
    press("b");
    expect(shadow.activeElement).toBe(options[2]);
    press("b");
    expect(shadow.activeElement).toBe(options[3]);
    press("ArrowDown");
    expect(shadow.activeElement).toBe(options[3]);
    act(() =>
      options[3].dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe("bravo");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

test("purpose dropdown renders every option in DOM order as a vertical single-select list", () => {
  // 回归锁：五个真实目的项（对齐 SELECTOR_FIELDS：selector/ignoreSelector/
  // rootsSelector/keepSelector/blockSelector，见 libs/selectorList.js:3-9）纵向单列 +
  // 单选 ARIA，与视觉列数解耦。
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  container.className = "notranslate";
  shadow.appendChild(container);
  const root = createRoot(container);
  const onChange = jest.fn();
  try {
    act(() =>
      root.render(
        <div className="kt-m3-root">
          <EditorSelect label="Purpose" value="rootsSelector" onChange={onChange}>
            <MenuItem value="selector">需翻译节点选择器</MenuItem>
            <MenuItem value="ignoreSelector">不翻译节点选择器</MenuItem>
            <MenuItem value="rootsSelector">根节点选择器</MenuItem>
            <MenuItem value="keepSelector">保留元素选择器</MenuItem>
            <MenuItem value="blockSelector">块级元素选择器</MenuItem>
          </EditorSelect>
        </div>
      )
    );
    act(() =>
      shadow
        .querySelector('[role="combobox"]')
        .dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0 })
        )
    );
    const list = shadow.querySelector('[role="listbox"]');
    const options = Array.from(list.querySelectorAll('[role="option"]'));
    // 纵向：负向锁两列网格缺位。
    expect(getComputedStyle(list).display).not.toBe("grid");
    expect(getComputedStyle(list).gridTemplateColumns).not.toContain("repeat(2");
    // 五项齐全且 DOM 顺序 = 声明顺序（纵向单列可达真源）。
    expect(options).toHaveLength(5);
    expect(options.map((o) => o.textContent)).toEqual([
      "需翻译节点选择器",
      "不翻译节点选择器",
      "根节点选择器",
      "保留元素选择器",
      "块级元素选择器",
    ]);
    // 单选语义：恰一项 aria-selected=true，且唯一选中项确为
    // value=rootsSelector（SelectInput 落在选项上的 data-value），
    // 其余四项均未被选中。
    const selected = options.filter(
      (o) => o.getAttribute("aria-selected") === "true"
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute("data-value")).toBe("rootsSelector");
    expect(
      options
        .filter((o) => o.getAttribute("aria-selected") !== "true")
        .map((o) => o.textContent)
    ).toEqual([
      "需翻译节点选择器",
      "不翻译节点选择器",
      "保留元素选择器",
      "块级元素选择器",
    ]);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
