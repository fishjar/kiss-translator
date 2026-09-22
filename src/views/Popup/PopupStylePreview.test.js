/* eslint-disable testing-library/no-unnecessary-act */
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import PopupStylePreview from "./PopupStylePreview";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("inserts preview styles and keyframes into the active ShadowRoot cache", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  shadowRoot.appendChild(mount);
  const cache = createCache({
    key: "popup-preview",
    container: shadowRoot,
    speedy: false,
  });
  const root = createRoot(mount);

  act(() => {
    root.render(
      <CacheProvider value={cache}>
        <PopupStylePreview
          styleSlug="gradient"
          previewCode="color: transparent; animation: old-preview 4s linear infinite;"
          label="Preview"
        />
      </CacheProvider>
    );
  });

  const shadowCss = [...shadowRoot.querySelectorAll("style[data-emotion]")]
    .map((style) => style.textContent)
    .join("\n");
  expect(shadowCss).toContain("color:transparent");
  expect(shadowCss).toContain("@keyframes");
  expect(
    document.head.querySelector('style[data-emotion^="popup-preview"]')
  ).toBeNull();

  act(() => root.unmount());
  cache.sheet.flush();
  host.remove();
});
