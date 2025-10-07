// Function to inject inline JavaScript code
export const injectInlineJs = (code) => {
  const el = document.createElement("script");
  el.setAttribute("data-source", "kiss-inject injectInlineJs");
  el.setAttribute("type", "text/javascript");
  el.textContent = code;
  document.body?.appendChild(el);
};

// Function to inject external JavaScript file
export const injectExternalJs = (src, id = "kiss-translator-injector") => {
  if (document.getElementById(id)) {
    return;
  }

  // const el = document.createElement("script");
  // el.setAttribute("data-source", "kiss-inject injectExternalJs");
  // el.setAttribute("type", "text/javascript");
  // el.setAttribute("src", src);
  // el.setAttribute("id", id);
  // document.body?.appendChild(el);
  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  (document.head || document.documentElement).appendChild(script);
};

// Function to inject internal CSS code
export const injectInternalCss = (styles) => {
  const el = document.createElement("style");
  el.setAttribute("data-source", "kiss-inject injectInternalCss");
  el.textContent = styles;
  document.head?.appendChild(el);
};

// Function to inject external CSS file
export const injectExternalCss = (href) => {
  const el = document.createElement("link");
  el.setAttribute("data-source", "kiss-inject injectExternalCss");
  el.setAttribute("rel", "stylesheet");
  el.setAttribute("type", "text/css");
  el.setAttribute("href", href);
  document.head?.appendChild(el);
};
