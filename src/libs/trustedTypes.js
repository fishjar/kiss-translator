export const trustedTypesHelper = (() => {
  const POLICY_NAME = "kiss-translator-policy";
  let policy = null;

  if (globalThis.trustedTypes && globalThis.trustedTypes.createPolicy) {
    try {
      policy = globalThis.trustedTypes.createPolicy(POLICY_NAME, {
        createHTML: (string) => string,
        createScript: (string) => string,
        createScriptURL: (string) => string,
      });
    } catch (err) {
      if (err.message.includes("already exists")) {
        policy = globalThis.trustedTypes.policies.get(POLICY_NAME);
      } else {
        console.error("cont create Trusted Types", err);
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
