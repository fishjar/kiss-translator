/**
 * @file constants.js
 * @description aifw 适配层共享常量。
 */

/** public/ 下 aifw-js 产物的入口模块路径（相对站点 / 扩展根目录）。 */
export const AIFW_MODULE_PATH = "aifw-js/aifw-js.js";

/**
 * createRedaction 等待首次 init 的最长时间（毫秒）。
 * 首次 init 需要联网下载 NER 模型，可能非常慢；超时后本次跳过脱敏，
 * 初始化在后台继续，后续请求可直接复用。
 */
export const AIFW_INIT_TIMEOUT_MS = 12000;

/**
 * init 失败后再次尝试前的最小间隔（毫秒）。
 * 避免模型下载失败时每个段落都重新触发一次缓慢的失败流程。
 */
export const AIFW_INIT_RETRY_INTERVAL_MS = 30000;

/**
 * privacyMask 开关读取的进程内缓存时长（毫秒）。
 * 整页翻译会按段落高频调用 createRedaction，这里避免每个段落都读一次 storage；
 * 开关切换后最多 2s 生效。
 */
export const AIFW_SETTING_CACHE_TTL_MS = 2000;

/** 下载进度写状态的最小间隔（毫秒），避免流式响应每块都写一次 storage。 */
export const AIFW_PROGRESS_THROTTLE_MS = 250;

/**
 * 模型下载看门狗：响应体读取过程中超过该时间没有新数据即中止请求（毫秒）。
 * 用于模型下载卡住（进度长时间不增长）时让 init 失败，用户可点“重试”续传。
 */
export const AIFW_DOWNLOAD_IDLE_TIMEOUT_MS = 45000;

/** 日志子模块标识。 */
export const AIFW_LOG_MODULE = "aifw";
