const POLICY_NAME = "kiss-translator-policy";

const loadTrustedTypesHelper = () => {
  jest.resetModules();

  const sanitize = jest.fn((value) => `sanitized:${value}`);

  jest.doMock("dompurify", () => ({
    __esModule: true,
    default: {
      sanitize,
    },
  }));

  const { trustedTypesHelper } = require("./trustedTypes");
  return { trustedTypesHelper, sanitize };
};

describe("trustedTypesHelper", () => {
  const originalTrustedTypes = globalThis.trustedTypes;
  const originalConsoleInfo = console.info;

  beforeEach(() => {
    delete globalThis.trustedTypes;
    console.info = jest.fn();
  });

  afterEach(() => {
    jest.dontMock("dompurify");
    jest.resetModules();
    console.info = originalConsoleInfo;

    if (originalTrustedTypes === undefined) {
      delete globalThis.trustedTypes;
    } else {
      globalThis.trustedTypes = originalTrustedTypes;
    }
  });

  test("does not create policy during import", () => {
    const createPolicy = jest.fn();
    globalThis.trustedTypes = {
      createPolicy,
    };

    const { trustedTypesHelper } = loadTrustedTypesHelper();

    expect(createPolicy).not.toHaveBeenCalled();
    expect(trustedTypesHelper.isEnabled()).toBe(false);
  });

  test("lazily creates and uses policy on first createHTML call", () => {
    const policy = {
      createHTML: jest.fn((value) => `trusted:${value}`),
      createScript: jest.fn(),
      createScriptURL: jest.fn(),
    };
    const createPolicy = jest.fn(() => policy);
    globalThis.trustedTypes = {
      createPolicy,
    };

    const { trustedTypesHelper, sanitize } = loadTrustedTypesHelper();

    expect(trustedTypesHelper.createHTML("<b>hello</b>")).toBe(
      "trusted:<b>hello</b>"
    );
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy).toHaveBeenCalledWith(
      POLICY_NAME,
      expect.objectContaining({
        createHTML: expect.any(Function),
        createScript: expect.any(Function),
        createScriptURL: expect.any(Function),
      })
    );
    expect(policy.createHTML).toHaveBeenCalledWith("<b>hello</b>");
    expect(sanitize).not.toHaveBeenCalledWith("<b>hello</b>");
    expect(trustedTypesHelper.isEnabled()).toBe(true);
  });

  test("reuses existing policy when duplicate policy error is thrown", () => {
    const existingPolicy = {
      createHTML: jest.fn((value) => `existing:${value}`),
      createScript: jest.fn((value) => `script:${value}`),
      createScriptURL: jest.fn((value) => `url:${value}`),
    };
    const createPolicy = jest.fn(() => {
      throw new Error("Policy kiss-translator-policy already exists");
    });
    const get = jest.fn(() => existingPolicy);
    globalThis.trustedTypes = {
      createPolicy,
      policies: {
        get,
      },
    };

    const { trustedTypesHelper } = loadTrustedTypesHelper();

    expect(trustedTypesHelper.createHTML("<i>hello</i>")).toBe(
      "existing:<i>hello</i>"
    );
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(POLICY_NAME);
    expect(trustedTypesHelper.createScript("run()")).toBe("script:run()");
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(trustedTypesHelper.isEnabled()).toBe(true);
  });

  test("sanitizes HTML and does not retry when CSP blocks policy creation", () => {
    const createPolicy = jest.fn(() => {
      throw new Error(
        'Creating a TrustedTypePolicy named \'kiss-translator-policy\' violates the following Content Security policy directive: "trusted-types gIqNx7 default". The action has been blocked.'
      );
    });
    globalThis.trustedTypes = {
      createPolicy,
    };

    const { trustedTypesHelper, sanitize } = loadTrustedTypesHelper();

    expect(trustedTypesHelper.createHTML("<img src=x onerror=alert(1)>")).toBe(
      "sanitized:<img src=x onerror=alert(1)>"
    );
    expect(trustedTypesHelper.createHTML("<b>again</b>")).toBe(
      "sanitized:<b>again</b>"
    );
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(sanitize).toHaveBeenCalledTimes(2);
    expect(console.info).not.toHaveBeenCalled();
    expect(trustedTypesHelper.isEnabled()).toBe(false);
  });

  test("treats allow-duplicates CSP rejection as unavailable policy", () => {
    const createPolicy = jest.fn(() => {
      throw new Error(
        'Creating a TrustedTypePolicy named \'kiss-translator-policy\' violates the following Content Security policy directive: "trusted-types fast-html dompurify 1DSScriptURL MeControlScriptURL @azure/ms-rest-js#xml.browser lit-html npsTrustedTypePolicy default \'allow-duplicates\'". The action has been blocked.'
      );
    });
    globalThis.trustedTypes = {
      createPolicy,
    };

    const { trustedTypesHelper, sanitize } = loadTrustedTypesHelper();

    expect(trustedTypesHelper.createHTML("<p>blocked</p>")).toBe(
      "sanitized:<p>blocked</p>"
    );
    expect(trustedTypesHelper.createScript("run()")).toBe("run()");
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(sanitize).toHaveBeenCalledTimes(1);
    expect(console.info).not.toHaveBeenCalled();
    expect(trustedTypesHelper.isEnabled()).toBe(false);
  });
});
