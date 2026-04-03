import { logger } from "./log";

export const trustedTypesHelper = (() => {
  const POLICY_NAME = "kiss-translator-policy";
  let policy = null;

  if (globalThis.trustedTypes && globalThis.trustedTypes.createPolicy) {
    try {
      policy = globalThis.trustedTypes.createPolicy(POLICY_NAME, {
        createHTML: (string) =>
          String(string)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;"),
        createScript: () => {
          throw new TypeError("createScript is disabled");
        },
        createScriptURL: (string) => {
          const url = String(string);

          if (
            url.startsWith("chrome-extension://") ||
            url.startsWith("moz-extension://")
          ) {
            return url;
          }

          throw new TypeError("Untrusted script URL");
        },
      });
    } catch (err) {
      if (err.message.includes("already exists")) {
        policy = globalThis.trustedTypes.policies.get(POLICY_NAME);
      } else {
        logger.info("cont create Trusted Types", err);
      }
    }
  }

  return {
    createHTML: (htmlString) => {
      return policy ? policy.createHTML(htmlString) : htmlString;
    },
    createScript: (scriptString) => {
      return policy ? policy.createScript(scriptString) : scriptString;
    },
    createScriptURL: (urlString) => {
      return policy ? policy.createScriptURL(urlString) : urlString;
    },
    isEnabled: () => policy !== null,
  };
})();
