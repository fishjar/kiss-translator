// Function to inject inline JavaScript code
export const injectInlineJs = (code) => {
  const el = document.createElement("script");
  el.setAttribute("data-source", "KISS-Calendar injectInlineJs");
  el.setAttribute("type", "text/javascript");
  el.textContent = code;
  document.body?.appendChild(el);
};

// Function to inject external JavaScript file
export const injectExternalJs = (src) => {
  const el = document.createElement("script");
  el.setAttribute("data-source", "KISS-Calendar injectExternalJs");
  el.setAttribute("type", "text/javascript");
  el.setAttribute("src", src);
  document.body?.appendChild(el);
};

// Function to inject internal CSS code
export const injectInternalCss = (styles) => {
  const el = document.createElement("style");
  el.setAttribute("data-source", "KISS-Calendar injectInternalCss");
  el.textContent = styles;
  document.head?.appendChild(el);
};

// Function to inject external CSS file
export const injectExternalCss = (href) => {
  const el = document.createElement("link");
  el.setAttribute("data-source", "KISS-Calendar injectExternalCss");
  el.setAttribute("rel", "stylesheet");
  el.setAttribute("type", "text/css");
  el.setAttribute("href", href);
  document.head?.appendChild(el);
};
