/**
 * @file imageSourceHighlight.js
 * @description 网页图片源高亮指示器：打开翻译弹窗时在当前图片四周显示绿色实线指示框，关闭弹窗自动移除。
 */

export class ImageSourceHighlight {
  #element = null;
  #target = null;
  #cleanup = null;

  highlight(target) {
    this.clear();
    if (!target || !(target instanceof HTMLElement)) return;
    this.#target = target;

    const el = document.createElement("div");
    el.className = "kt-image-source-highlight notranslate";
    el.style.cssText = `
      position: absolute;
      border: 2px solid #00c853;
      box-shadow: 0 0 0 2px rgba(0, 200, 83, 0.2);
      border-radius: 4px;
      z-index: 2147483636;
      pointer-events: none;
      box-sizing: border-box;
      transition: all 0.15s ease;
    `;
    document.body.appendChild(el);
    this.#element = el;
    this.#updatePosition();

    const onScrollOrResize = () => this.#updatePosition();
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    this.#cleanup = () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }

  #updatePosition() {
    if (!this.#element || !this.#target || !this.#target.isConnected) {
      this.clear();
      return;
    }
    const rect = this.#target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.clear();
      return;
    }
    this.#element.style.left = `${rect.left + window.scrollX - 2}px`;
    this.#element.style.top = `${rect.top + window.scrollY - 2}px`;
    this.#element.style.width = `${rect.width + 4}px`;
    this.#element.style.height = `${rect.height + 4}px`;
  }

  clear() {
    this.#cleanup?.();
    this.#cleanup = null;
    this.#element?.remove();
    this.#element = null;
    this.#target = null;
  }
}
