import { newI18n } from "../config/i18n";

/** One dismissible notice per task; never interrupts translation. */
export function terminologyWarningHandler(uiLang = "en") {
  let shown = false;
  return (ids) => {
    if (shown || !ids.length || typeof document === "undefined") return;
    shown = true;
    const i18n = newI18n(uiLang);
    const notice = document.createElement("div");
    notice.className = "notranslate";
    notice.setAttribute("role", "status");
    notice.style.cssText =
      "position:fixed;top:16px;right:16px;max-width:340px;padding:12px 36px 12px 12px;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;border-radius:8px;z-index:2147483647;font:14px/1.5 sans-serif";
    notice.textContent = i18n("terminology_missing_help");
    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", i18n("close"));
    close.style.cssText =
      "position:absolute;right:8px;top:8px;border:0;background:transparent;color:inherit;cursor:pointer;font-size:18px";
    close.onclick = () => notice.remove();
    notice.append(close);
    document.documentElement.append(notice);
  };
}
