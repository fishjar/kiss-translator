import { XMLHttpRequestInjector } from "./injectors/xmlhttp";

// 页面字幕桥：捕获 Fetch/XHR，补读资源时序，并响应当前视频的字幕请求。
XMLHttpRequestInjector();
