/**
 * @file client.js
 * @description 根据编译时的环境变量 (REACT_APP_CLIENT) 自动判定当前的运行客户端环境类型，对外暴露布尔判定变量。
 */

import {
  CLIENT_EXTS,
  CLIENT_USERSCRIPT,
  CLIENT_WEB,
  CLIENT_FIREFOX,
} from "../config";

export const client = process.env.REACT_APP_CLIENT; // 获取当前的客户端标识
export const isExt = CLIENT_EXTS.includes(client); // 是否为浏览器插件扩展环境 (Chrome, Edge, Firefox, Thunderbird)
export const isGm = client === CLIENT_USERSCRIPT; // 是否为油猴脚本运行环境
export const isWeb = client === CLIENT_WEB; // 是否为纯 Web 演示网页环境
export const isFirefox = client === CLIENT_FIREFOX; // 是否在 Firefox 浏览器扩展环境中运行
