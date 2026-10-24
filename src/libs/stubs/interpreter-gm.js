import { logger } from "../log";
/**
 * @file interpreter-gm.js
 * @description 油猴脚本环境下的轻量原生执行器。
 * 油猴不受扩展 MV3 禁止 eval/Function 的限制，直接通过原生 Function 执行 Hook，
 * 从而避免将庞大的 sval (170KB) 与 acorn (241KB) 打包进单文件油猴脚本。
 */

class GmInterpreter {
  constructor() {
    this.exports = {};
    this.scope = {};
  }

  import(obj) {
    if (obj && typeof obj === "object") {
      Object.assign(this.scope, obj);
    }
  }

  run(code) {
    try {
      const keys = Object.keys(this.scope);
      const values = Object.values(this.scope);
      // eslint-disable-next-line no-new-func
      const fn = new Function("exports", ...keys, code);
      fn(this.exports, ...values);
    } catch (e) {
      logger.child("interpreter-gm").error("[GmInterpreter] Execution error:", e);
    }
  }
}

const shared = new GmInterpreter();

export async function createInterpreter() {
  return new GmInterpreter();
}

export async function getInterpreter() {
  return shared;
}

export const interpreter = shared;
