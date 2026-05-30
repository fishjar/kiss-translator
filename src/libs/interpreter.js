import Sval from "sval";

/**
 * 全局共享的 Sval JS 沙盒解释器实例
 * 用于在隔离的安全沙盒中执行用户自定义的 Hook 脚本（例如翻译前的文本处理、翻译后的译文调整等）。
 *
 * // REVIEW: 状态隔离风险。将单一 `interpreter` 实例导出并在多处共享，
 * // 如果不同的自定义 Hook 脚本在执行过程中污染或修改了沙盒的全局上下文（Context），
 * // 这些状态会常驻并影响到后续其他 Hook 脚本的执行。
 * // 推荐为每次 Hook 脚本的执行动态实例化独立的 Sval 解释器，以实现彻底的状态隔离。
 */
export const interpreter = new Sval({
  // 支持的 ECMAScript 语法版本
  // 3 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 或 "latest"
  ecmaVer: "latest",
  // 代码源类型，"script" 表示普通脚本，"module" 表示 ES 模块
  sourceType: "script",
  // 是否开启沙盒模式以隔离运行环境，防止执行恶意代码或污染宿主环境的全局 Window 变量
  sandBox: true,
});
