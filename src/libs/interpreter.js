/**
 * JS 沙盒解释器按需加载模块。
 * 避免在 content.js / background.js 初始化阶段静态引入庞大的 sval (170KB) 与 acorn (241KB)。
 * 仅在用户实际使用带有 JS Hook 的自定义规则时按需动态拉起。
 */

let svalModulePromise = null;

/**
 * 动态加载并实例化 Sval 沙盒解释器
 * @param {Object} options Sval 初始化选项
 * @returns {Promise<any>} Sval 实例
 */
export async function createInterpreter(options = {}) {
  if (!svalModulePromise) {
    svalModulePromise = import("sval").then((m) => m.default || m);
  }
  const Sval = await svalModulePromise;
  return new Sval({
    ecmaVer: "latest",
    sourceType: "script",
    sandBox: true,
    ...options,
  });
}

let sharedInterpreter = null;

/**
 * 获取共享的解释器实例（惰性单例）
 * @returns {Promise<any>}
 */
export async function getInterpreter() {
  if (!sharedInterpreter) {
    sharedInterpreter = await createInterpreter();
  }
  return sharedInterpreter;
}

// 针对可能未转换的同步调用提供基础防护代理
export const interpreter = new Proxy(
  {},
  {
    get(_target, prop) {
      if (sharedInterpreter) {
        return sharedInterpreter[prop];
      }
      throw new Error(
        `[interpreter] Sval 尚未异步初始化，请使用 await getInterpreter() 替代静态 interpreter.${String(
          prop
        )}`
      );
    },
  }
);
