import React from "react";
import { FAVICON_BASE64 } from "./icon.base64.js";

/**
 * 软件 Logo 的 React 渲染组件，基于 Base64 内联图片，防止外部静态资源加载失败
 * @param {object} props
 * @param {number} props.size 图标的尺寸（像素，默认 16）
 * @param {string} props.className 传递给 img 的 CSS 类名
 * @param {object} props.style 传递给 img 的 CSS 样式
 * @param {function} props.onClick 点击事件回调
 */
const Logo = ({ size = 16, className = "", style = {}, onClick }) => {
  return (
    <img
      src={FAVICON_BASE64}
      alt="Logo"
      className={className}
      draggable={false}
      onClick={onClick}
      onDragStart={(e) => e.preventDefault()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "contain",
        display: "block",
        ...style,
      }}
    />
  );
};

export { FAVICON_BASE64 };
export default Logo;
