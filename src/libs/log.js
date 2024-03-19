/**
 * 日志函数
 * @param {*} msg
 * @param {*} type
 */
export const kissLog = (msg, type) => {
  let prefix = `[KISS-Translator]`;
  if (type) {
    prefix += `[${type}]`;
  }
  console.log(`${prefix} ${msg}`);
};
