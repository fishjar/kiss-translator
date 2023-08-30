import {
  STOKEY_SETTING,
  STOKEY_RULES,
  STOKEY_FAB,
  STOKEY_SYNC,
  STOKEY_MSAUTH,
  STOKEY_RULESCACHE_PREFIX,
  DEFAULT_SETTING,
  DEFAULT_RULES,
  DEFAULT_SYNC,
  BUILTIN_RULES,
} from "../config";
import { browser, isExt, isGm } from "./client";
// import { APP_NAME } from "../config/app";

async function set(key, val) {
  if (isExt) {
    await browser.storage.local.set({ [key]: val });
  } else if (isGm) {
    // const oldValue = await (window.KISS_GM || GM).getValue(key);
    await (window.KISS_GM || GM).setValue(key, val);
    // window.dispatchEvent(
    //   new StorageEvent("storage", {
    //     key,
    //     oldValue,
    //     newValue: val,
    //   })
    // );
  } else {
    // const oldValue = window.localStorage.getItem(key);
    window.localStorage.setItem(key, val);
    // window.dispatchEvent(
    //   new StorageEvent("storage", {
    //     key,
    //     oldValue,
    //     newValue: val,
    //   })
    // );
  }
}

async function get(key) {
  if (isExt) {
    const val = await browser.storage.local.get([key]);
    return val[key];
  } else if (isGm) {
    const val = await (window.KISS_GM || GM).getValue(key);
    return val;
  }
  return window.localStorage.getItem(key);
}

async function del(key) {
  if (isExt) {
    await browser.storage.local.remove([key]);
  } else if (isGm) {
    // const oldValue = await (window.KISS_GM || GM).getValue(key);
    await (window.KISS_GM || GM).deleteValue(key);
    // window.dispatchEvent(
    //   new StorageEvent("storage", {
    //     key,
    //     oldValue,
    //     newValue: null,
    //   })
    // );
  } else {
    // const oldValue = window.localStorage.getItem(key);
    window.localStorage.removeItem(key);
    // window.dispatchEvent(
    //   new StorageEvent("storage", {
    //     key,
    //     oldValue,
    //     newValue: null,
    //   })
    // );
  }
}

async function setObj(key, obj) {
  await set(key, JSON.stringify(obj));
}

async function trySetObj(key, obj) {
  if (!(await get(key))) {
    await setObj(key, obj);
  }
}

async function getObj(key) {
  const val = await get(key);
  return val && JSON.parse(val);
}

async function putObj(key, obj) {
  const cur = (await getObj(key)) ?? {};
  await setObj(key, { ...cur, ...obj });
}

// /**
//  * 监听storage事件
//  * @param {*} handleChanged
//  */
// function onChanged(handleChanged) {
//   if (isExt) {
//     browser.storage.onChanged.addListener(handleChanged);
//   } else {
//     window.addEventListener("storage", handleChanged);
//   }
// }

/**
 * 对storage的封装
 */
export const storage = {
  get,
  set,
  del,
  setObj,
  trySetObj,
  getObj,
  putObj,
  // onChanged,
};

/**
 * 设置信息
 */
export const getSetting = () => getObj(STOKEY_SETTING);
export const getSettingWithDefault = async () => ({
  ...DEFAULT_SETTING,
  ...((await getSetting()) || {}),
});
export const setSetting = (val) => setObj(STOKEY_SETTING, val);
export const updateSetting = (obj) => putObj(STOKEY_SETTING, obj);

/**
 * 规则列表
 */
export const getRules = () => getObj(STOKEY_RULES);
export const getRulesWithDefault = async () =>
  (await getRules()) || DEFAULT_RULES;
export const setRules = (val) => setObj(STOKEY_RULES, val);

/**
 * 订阅规则
 */
export const getSubRules = (url) => getObj(STOKEY_RULESCACHE_PREFIX + url);
export const getSubRulesWithDefault = async () => (await getSubRules()) || [];
export const delSubRules = (url) => del(STOKEY_RULESCACHE_PREFIX + url);
export const setSubRules = (url, val) =>
  setObj(STOKEY_RULESCACHE_PREFIX + url, val);

/**
 * fab位置
 */
export const getFab = () => getObj(STOKEY_FAB);
export const getFabWithDefault = async () => (await getFab()) || {};
export const setFab = (obj) => setObj(STOKEY_FAB, obj);

/**
 * 数据同步
 */
export const getSync = () => getObj(STOKEY_SYNC);
export const getSyncWithDefault = async () => (await getSync()) || DEFAULT_SYNC;
export const updateSync = (obj) => putObj(STOKEY_SYNC, obj);

/**
 * ms auth
 */
export const getMsauth = () => getObj(STOKEY_MSAUTH);
export const setMsauth = (val) => setObj(STOKEY_MSAUTH, val);

/**
 * 存入默认数据
 */
export const tryInitDefaultData = async () => {
  try {
    await trySetObj(STOKEY_SETTING, DEFAULT_SETTING);
    await trySetObj(STOKEY_RULES, DEFAULT_RULES);
    await trySetObj(STOKEY_SYNC, DEFAULT_SYNC);
    await trySetObj(
      `${STOKEY_RULESCACHE_PREFIX}${process.env.REACT_APP_RULESURL}`,
      BUILTIN_RULES
    );
  } catch (err) {
    console.log("[init default]", err);
  }
};
