import { CheckBoxIcon, CheckBoxOutlineBlankIcon } from "./icons";

/**
 * 多选下拉的勾选字形：两态恒由图标分发器提供——lucide 档取 Lucide 自带
 * checkbox 对，MUI 档取 MUI 自带 checkbox 对，不手绘形状、不借 MUI
 * <Checkbox>（它会绕过分发器，在 lucide 档漏出 MUI 方框）。
 *
 * 语义仍由宿主行承载（role="option" + aria-selected，或
 * role="menuitemcheckbox" + aria-checked）；本字形对读屏隐藏，
 * data-checked 只是样式与测试的机器钩子。颜色沿用行内 currentColor，
 * 挂在 kt 令牌作用域之外（YouTube 播放器 DOM）时由调用方显式传 style.color。
 */
export default function MenuCheckGlyph({
  checked = false,
  size = 18,
  style,
  className = "",
}) {
  const Glyph = checked ? CheckBoxIcon : CheckBoxOutlineBlankIcon;
  return (
    <span
      aria-hidden="true"
      className={`kt-menu-check${className ? ` ${className}` : ""}`.trim()}
      data-checked={String(Boolean(checked))}
      style={{
        display: "inline-flex",
        flex: "none",
        width: size,
        height: size,
        alignItems: "center",
        ...style,
      }}
    >
      <Glyph style={{ width: size, height: size }} />
    </span>
  );
}
