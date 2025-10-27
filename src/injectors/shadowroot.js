export const shadowRootInjector = () => {
  try {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (...args) {
      const root = orig.apply(this, args);
      window.postMessage({ type: "KISS_SHADOW_ROOT_CREATED" }, "*");
      return root;
    };
  } catch (err) {
    console.log("shadowRootInjector", err);
  }
};
