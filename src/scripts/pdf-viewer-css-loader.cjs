// PDF.js 5.4.624 uses a bare custom property as the fallback in this expression.
// Resolve the fallback variable before postcss-calc processes the viewer CSS.
module.exports = (source) =>
  source.replaceAll(
    "var(--viewsManager-width, --sidebar-width)",
    "var(--viewsManager-width, var(--sidebar-width))"
  );
