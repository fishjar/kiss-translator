/* eslint-disable testing-library/no-container */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useTheme } from "@mui/material/styles";
import OptionsTheme from "./OptionsTheme";
import { SettingsSelect } from "./SettingsCard";
import { AddIcon } from "../../components/icons";
import { setIconStyleSnapshot } from "../../styles/iconStyleStore";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// iconStyle 切换测试无论成败都恢复全局快照为缺省 lucide，避免污染同进程
// 后续套件（jest 全局钩子覆盖失败路径，比测试体 try/finally 更稳）
afterEach(() => {
  setIconStyleSnapshot("lucide");
});

jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light" }),
}));
jest.mock("../../hooks/SystemColorScheme", () => ({
  useSystemDarkPreference: () => false,
}));

let capturedTheme;

function ThemeProbe() {
  capturedTheme = useTheme();
  return null;
}

test("dropdown paper radius stays a raw 12px in sx and styleOverrides", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <OptionsTheme>
        <ThemeProbe />
      </OptionsTheme>
    );
  });

  // A numeric borderRadius inside `sx` is multiplied by
  // theme.shape.borderRadius (12 * 12 = 144px) and clips the first/last
  // options, so the value must remain a length string.
  const selectPaperSx =
    capturedTheme.components.MuiSelect.defaultProps.MenuProps.PaperProps.sx;
  expect(selectPaperSx(capturedTheme).borderRadius).toBe("12px");

  const menuPaper = capturedTheme.components.MuiMenu.styleOverrides.paper({
    theme: capturedTheme,
  });
  expect(menuPaper.borderRadius).toBe("12px");

  act(() => root.unmount());
  container.remove();
});

test("wires the select menu list marker class for scoped geometry", () => {
  // 挂载标记锁（真下拉几何的挂载标记）：MuiSelect defaultProps.MenuProps
  // 携 MenuListProps.className="kt-settings-select__menu"。实例 MenuProps
  // 会经 resolveProps 浅合并整体覆写主题 defaultProps（MenuProps 不在
  // components/slots/slotProps 深合并键集内），标记必须在主题层接线才能
  // 零回归地覆盖全部 SettingsSelect 下拉；几何本体锁在 StylesSetting.test
  // （OPTIONS_STYLES 专属类规则）
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <OptionsTheme>
        <ThemeProbe />
      </OptionsTheme>
    );
  });

  const menuProps = capturedTheme.components.MuiSelect.defaultProps.MenuProps;
  expect(menuProps.MenuListProps?.className).toBe("kt-settings-select__menu");

  act(() => root.unmount());
  container.remove();
});

test("lands the menu list marker class on the rendered listbox surface", async () => {
  // 挂载标记真传导锁：配置对象在位不等于标记真实落到 ul[role=listbox]——
  // 主题 defaultProps 经 MUI Select 内部 MenuListProps 合并、DropdownRoot
  // 根槽重排 children，任一环丢失都会让 scoped 几何 CSS 静默失效而配置
  // 未变。真渲染打开下拉断言标记落在 listbox 本体（开合事件形态沿用
  // 同仓库 grip select 先例：原生 mousedown + 微任务冲洗）
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        <OptionsTheme>
          <SettingsSelect
            label="probe"
            value="a"
            onChange={() => {}}
            options={[
              { value: "a", label: "Alpha" },
              { value: "b", label: "Beta" },
            ]}
          />
        </OptionsTheme>
      );
    });

    const combobox = container.querySelector(
      '.kt-settings-select [role="combobox"]'
    );
    expect(combobox).not.toBeNull();
    await act(async () => {
      combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await Promise.resolve();
    });

    // 开链与标记传导分别断言：listbox 挂载（真下拉已开）先行，标记落位随后
    const listbox = document.body.querySelector('ul[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox.classList.contains("kt-settings-select__menu")).toBe(true);

    await act(async () => root.unmount());
  } finally {
    container.remove();
  }
});

function IconProbe() {
  return <AddIcon data-testid="probe-icon" />;
}

test("reflects iconStyle setting changes on dispatched icons", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    // mui 档：分发器选 MUI 件——svg 直接挂 path（fill 实心形态），无
    // lucide 的 stroke 描边 g 组。快照写入口的唯一消费方为设置存储接线，
    // 本测试直接驱动 store 写入口，锁 M3Theme 订阅 → 分发器反映链。
    act(() => setIconStyleSnapshot("mui"));
    act(() => {
      root.render(
        <OptionsTheme>
          <IconProbe />
        </OptionsTheme>
      );
    });
    const muiSvg = container.querySelector("svg");
    expect(muiSvg).not.toBeNull();
    expect(muiSvg.querySelector("path")).not.toBeNull();
    expect(muiSvg.querySelector("g[stroke='currentColor']")).toBeNull();

    // 切到 lucide：M3Theme 经 useSyncExternalStore 订阅快照 → 分发器改选
    // Lucide 件——描边形态特征（g[fill=none][stroke=currentColor]）真实
    // 反映到渲染。本仓库 lucide 件经 createSvgIcon 包装，stroke 在内层
    // g 而非 svg 根
    act(() => setIconStyleSnapshot("lucide"));
    const lucideSvg = container.querySelector("svg");
    expect(lucideSvg).not.toBeNull();
    expect(lucideSvg.querySelector("g[stroke='currentColor']")).not.toBeNull();
    expect(lucideSvg.querySelector("g[fill='none']")).not.toBeNull();
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});
