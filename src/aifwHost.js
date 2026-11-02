/**
 * @file aifwHost.js
 * @description aifw 隐私脱敏后台宿主入口。
 *
 * 该入口只在 Chromium 的 offscreen 文档里加载（offscreen.html），与本地 AI 运行时
 * 同页面运行；Firefox/Thunderbird 的 MV2 背景页由 background.js 直接承载宿主逻辑。
 * 作用是让 aifw 引擎运行在扩展 origin，模型只缓存一份，而不是按站点各存一份。
 */
import { installAifwHostListener } from "./libs/aifw/host";

installAifwHostListener();
