/**
 * Shadow DOM 创建拦截器
 * 用于重写原生的 Element.prototype.attachShadow 方法，以便在页面上动态创建 Shadow Root 时，
 * 能够实时捕获并向扩展主线程发送通知，启动翻译节点的重新扫描与样式表挂载。
 */
export const shadowRootInjector = () => {
  try {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (...args) {
      // 执行原生的 attachShadow 逻辑
      const root = orig.apply(this, args);

      // REVIEW: 消息监听滥用与安全风险。
      // 此处使用 `window.postMessage` 进行跨域或跨环境通知，并且将 `targetOrigin` 设置为了通配符 `*`。
      // 这意味着当前窗口内的任何第三方脚本都可以监听并捕获到该事件。
      // 虽然该通知负载没有包含敏感数据，但使用通配符并不符合安全防御性编程的最佳实践，推荐在已知当前域时使用 `window.location.origin` 进行限制。
      window.postMessage({ type: "KISS_SHADOW_ROOT_CREATED" }, "*");
      return root;
    };
  } catch (err) {
    console.log("shadowRootInjector", err);
  }
};
