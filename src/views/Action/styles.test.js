import { ACTION_STYLES } from "./styles";
import { getCssAtRuleBodies } from "../../styles/testUtils";

describe("content FAB Material 3 shape", () => {
  test("uses regular FAB geometry without morphing between states", () => {
    const baseRule = ACTION_STYLES.match(
      /\.kt-content-fab\.MuiFab-root\s*\{([^}]*)\}/
    )?.[1];
    const hoverRule = ACTION_STYLES.match(
      /\.kt-content-fab\.MuiFab-root:hover\s*\{([^}]*)\}/
    )?.[1];
    const activeStateRule = ACTION_STYLES.match(
      /\.kt-content-fab\.MuiFab-root:focus-visible,[\s\S]*?\.kt-content-fab\.MuiFab-root:active\s*\{([^}]*)\}/
    )?.[1];

    expect(baseRule).toContain("width: var(--kt-fab-size, 56px)");
    expect(baseRule).toContain("height: var(--kt-fab-size, 56px)");
    expect(baseRule).toContain("min-width: var(--kt-fab-size, 56px)");
    expect(baseRule).toContain("min-height: var(--kt-fab-size, 56px)");
    expect(baseRule).toContain("border-radius: var(--kt-fab-radius, 16px)");
    expect(baseRule).toContain("background-color: var(--kt-pric)");
    expect(baseRule).not.toMatch(/transition:[^;]*border-radius/);
    expect(hoverRule).toContain("var(--kt-onpric) 8%");
    expect(hoverRule).not.toContain("border-radius");
    expect(activeStateRule).not.toContain("border-radius");
    expect(ACTION_STYLES).not.toContain("border-radius: 999px");
    expect(ACTION_STYLES).toContain("@media (hover: hover)");
    expect(ACTION_STYLES).toMatch(
      /\.kt-content-fab\.MuiFab-root:focus-visible\s*\{[^}]*outline:\s*none;[^}]*inset 0 0 0 3px var\(--kt-pri\);/
    );
    expect(ACTION_STYLES).not.toContain("--kt-shadow-4");
    expect(ACTION_STYLES).not.toMatch(
      /\.kt-content-fab\.MuiFab-root(?:\[[^\]]+\]|\.[\w-]+|:[\w-]+)[^{]*\{[^}]*border-radius/
    );
  });

  test("overrides MUI state colors while keeping compact menu shapes", () => {
    expect(ACTION_STYLES).toMatch(
      /\.kt-content-fab\.MuiFab-root:focus-visible,[\s\S]*?\.kt-content-fab\.MuiFab-root:active\s*\{[^}]*var\(--kt-onpric\) 10%/
    );
    expect(ACTION_STYLES).toMatch(
      /\.kt-content-fab-menu\s*\{[^}]*border-radius:\s*4px;/
    );
    expect(ACTION_STYLES).toMatch(
      /\.kt-content-fab-menu\s*\{[^}]*padding:\s*8px 0;/
    );
    expect(ACTION_STYLES).toMatch(
      /\.kt-content-fab-menu\s*\{[^}]*border:\s*1px solid var\(--kt-linev\);/
    );
    expect(ACTION_STYLES).toMatch(
      /\.kt-content-fab-menu\s*\{[^}]*overflow-x:\s*hidden;/
    );
    const menuItemRule = ACTION_STYLES.match(
      /\.kt-content-fab-menu__item\s*\{([^}]*)\}/
    )?.[1];
    expect(menuItemRule).toContain("min-height: 48px");
    expect(menuItemRule).toContain("padding: 0 16px");
    expect(menuItemRule).not.toContain("border-radius");
    expect(menuItemRule).toContain("transition:");
    expect(menuItemRule).not.toContain("animation:");
    const primaryTextRule = ACTION_STYLES.match(
      /\.kt-content-fab-menu__item \.MuiListItemText-primary\s*\{([^}]*)\}/
    )?.[1];
    expect(primaryTextRule).toBeDefined();
    expect(primaryTextRule).toContain("overflow: hidden");
    expect(primaryTextRule).toContain("text-overflow: ellipsis");
    expect(primaryTextRule).toContain("white-space: nowrap");
    const hoverBodies = getCssAtRuleBodies(
      ACTION_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some((body) =>
        /\.kt-content-fab-menu__item:hover\s*\{/.test(body)
      )
    ).toBe(true);
  });

  test("action rows carry no selected-state fill (menuitemcheckbox is an action, not a selection)", () => {
    expect(ACTION_STYLES).not.toMatch(
      /\.kt-content-fab-menu__item\[aria-checked="true"\][^{]*\{/
    );
    expect(ACTION_STYLES).not.toContain(
      '.kt-content-fab-menu__item[aria-checked="true"] .MuiListItemIcon-root'
    );
    // 普通行 hover 走 State Layer 叠色；全菜单无选中底色。
    const menuItemRule = ACTION_STYLES.match(
      /\.kt-content-fab-menu__item\s*\{([^}]*)\}/
    )?.[1];
    expect(menuItemRule).toContain("gap: 12px");
    const hoverBodies = getCssAtRuleBodies(
      ACTION_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some((body) =>
        /\.kt-content-fab-menu__item:hover\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--kt-on\) 8%, transparent\)/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      hoverBodies.some((body) =>
        /\.kt-content-fab-menu__item\[aria-checked="true"\]/.test(body)
      )
    ).toBe(false);
  });

  test("menu container budget fits 8 rows without scrolling and width is content-driven", () => {
    // 行数来源：ContentFab 的 items 数组 7 项 + 末尾「关闭悬浮球」
    // menuitemcheckbox 1 行 = 8。菜单行数增减时同步更新此常量，高度预算
    // 随之联动（48px 行高、4px 间距、16px 容器 padding、2px 边框）。
    const MENU_ROW_COUNT = 8;
    const menuRule = ACTION_STYLES.match(
      /\.kt-content-fab-menu\s*\{([^}]*)\}/
    )?.[1];
    // 高度预算形态锁：上限必须 ≥ 行数预算，否则触屏下「关闭悬浮球」行被
    // 裁出可视区。
    const budgetCeiling =
      MENU_ROW_COUNT * 48 + (MENU_ROW_COUNT - 1) * 4 + 16 + 2;
    const maxHeight = menuRule.match(/max-height:\s*min\((\d+)px,/)?.[1];
    expect(Number(maxHeight)).toBeGreaterThanOrEqual(budgetCeiling);
    expect(menuRule).toContain("max-height: min(");
    expect(menuRule).toContain("calc(100vh - 24px)");
    // 宽度内容驱动：禁止 210px 定宽遗产，须贴内容并留上下限。
    expect(menuRule).not.toContain("min-width: 210px");
    expect(menuRule).toContain("width: max-content");
    expect(menuRule).toMatch(/min-width:\s*\d+px/);
    expect(menuRule).toContain("max-width: min(280px, calc(100vw - 24px))");
    // hover 实底违规消除：禁止 --kt-sf1 hover 实底回归。
    expect(menuRule).not.toContain("background: var(--kt-sf1)");
    const hoverBodies = getCssAtRuleBodies(
      ACTION_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some((body) =>
        /\.kt-content-fab-menu__item:hover\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--kt-on\) 8%, transparent\)/.test(
          body
        )
      )
    ).toBe(true);
  });
});
