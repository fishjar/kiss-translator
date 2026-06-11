/**
 * @file storage.js
 * @description 存储相关的常量配置模块。定义保存在本地（如 chrome.storage.local）和云端同步（如 WebDAV）中的键名 (Key) 及版本化规则。
 */

import { APP_NAME, APP_VERSION } from "./app";

// --- 云端同步时的 JSON 数据文件名 (包含主版本号做兼容性隔离) ---
export const KV_RULES_KEY = `kiss-rules_v${APP_VERSION[0]}.json`; // 同步的自定义规则文件名
export const KV_WORDS_KEY = "kiss-words.json"; // 同步的生词本文件名
export const KV_RULES_SHARE_KEY = `kiss-rules-share_v${APP_VERSION[0]}.json`; // 共享/订阅规则文件名
export const KV_SETTING_KEY = `kiss-setting_v${APP_VERSION[0]}.json`; // 同步的全局设置文件名
export const KV_SALT_SYNC = "KISS-Translator-SYNC"; // 导出同步配置加密时的 Salt
export const KV_SALT_SHARE = "KISS-Translator-SHARE"; // 导出共享配置加密时的 Salt

// --- 浏览器本地存储 (chrome.storage 或 localStorage) 的键名 ---
export const STOKEY_MSAUTH = `${APP_NAME}_msauth`; // 微软翻译授权 Token 缓存键名
export const STOKEY_BDAUTH = `${APP_NAME}_bdauth`; // 百度翻译授权 Token 缓存键名
export const STOKEY_SETTING_OLD = `${APP_NAME}_setting`; // 旧版全局配置的缓存键名
export const STOKEY_RULES_OLD = `${APP_NAME}_rules`; // 旧版网页规则的缓存键名
export const STOKEY_SETTING = `${APP_NAME}_setting_v${APP_VERSION[0]}`; // 当前大版本全局配置缓存键名
export const STOKEY_SETTING_BACKUP_V1_BEFORE_V2 = `${STOKEY_SETTING}_backup_v1_before_v2`; // settings v1 升级 v2 前的完整备份
export const STOKEY_RULES = `${APP_NAME}_rules_v${APP_VERSION[0]}`; // 当前大版本网页规则缓存键名
export const STOKEY_WORDS = `${APP_NAME}_words`; // 用户生词本 (高亮词汇) 缓存键名
export const STOKEY_SYNC = `${APP_NAME}_sync`; // 同步接口及凭证配置缓存键名
export const STOKEY_FAB = `${APP_NAME}_fab`; // 网页翻译悬浮球最近一次位置等配置缓存键名
export const STOKEY_TRANBOX = `${APP_NAME}_tranbox`; // 划词翻译框的最后状态缓存键名
export const STOKEY_SEPARATE_WINDOW = `${APP_NAME}_separate_window`; // 划词翻译独立小窗口的最后边界尺寸(坐标及宽高)缓存键名
export const STOKEY_RULESCACHE_PREFIX = `${APP_NAME}_rulescache_`; // 网页规则匹配缓存键名前缀
export const STOKEY_DISABLED_SUB_RULES = `${APP_NAME}_disabled_sub_rules`; // 被用户手动禁用的订阅规则 ID 集合的缓存键名

// --- 翻译 HTTP 请求的缓存配置 ---
export const CACHE_NAME = `${APP_NAME}_cache`; // 翻译接口响应缓存的 CacheStorage 名称
export const DEFAULT_CACHE_TIMEOUT = 3600 * 24 * 7; // 默认翻译请求缓存有效期 (单位：秒，即 7 天)
