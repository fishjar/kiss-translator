import { APP_NAME, APP_VERSION } from "./app";

export const KV_RULES_KEY = `kiss-rules_v${APP_VERSION[0]}.json`;
export const KV_WORDS_KEY = "kiss-words.json";
export const KV_RULES_SHARE_KEY = `kiss-rules-share_v${APP_VERSION[0]}.json`;
export const KV_SETTING_KEY = `kiss-setting_v${APP_VERSION[0]}.json`;
export const KV_SALT_SYNC = "KISS-Translator-SYNC";
export const KV_SALT_SHARE = "KISS-Translator-SHARE";

export const STOKEY_MSAUTH = `${APP_NAME}_msauth`;
export const STOKEY_BDAUTH = `${APP_NAME}_bdauth`;
export const STOKEY_SETTING_OLD = `${APP_NAME}_setting`;
export const STOKEY_RULES_OLD = `${APP_NAME}_rules`;
export const STOKEY_SETTING = `${APP_NAME}_setting_v${APP_VERSION[0]}`;
export const STOKEY_RULES = `${APP_NAME}_rules_v${APP_VERSION[0]}`;
export const STOKEY_WORDS = `${APP_NAME}_words`;
export const STOKEY_SYNC = `${APP_NAME}_sync`;
export const STOKEY_FAB = `${APP_NAME}_fab`;
export const STOKEY_TRANBOX = `${APP_NAME}_tranbox`;
export const STOKEY_SEPARATE_WINDOW = `${APP_NAME}_separate_window`;
export const STOKEY_RULESCACHE_PREFIX = `${APP_NAME}_rulescache_`;

export const CACHE_NAME = `${APP_NAME}_cache`;
export const DEFAULT_CACHE_TIMEOUT = 3600 * 24 * 7; // 缓存超时时间(7天)
