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
