import { shadowRootInjector } from "./injectors/shadowroot";

// 启动 Shadow DOM 拦截器，重写 attachShadow 以便翻译能穿透进入 Shadow DOM 内部
shadowRootInjector();
