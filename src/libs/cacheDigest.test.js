const originalCrypto = globalThis.crypto;

const setCrypto = (crypto) => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: crypto,
  });
};

const loadCacheDigest = ({ isExt = true, sha256, sendBgMsg }) => {
  jest.resetModules();
  jest.doMock("../config/msg", () => ({
    MSG_SHA256: "sha256",
  }));
  jest.doMock("./client", () => ({
    isExt,
  }));
  jest.doMock("./utils", () => ({
    sha256: jest.fn(sha256),
  }));
  jest.doMock("./msg", () => ({
    sendBgMsg: jest.fn(sendBgMsg),
  }));

  return {
    ...require("./cacheDigest"),
    sha256Mock: require("./utils").sha256,
    sendBgMsgMock: require("./msg").sendBgMsg,
  };
};

describe("getCacheDigest", () => {
  afterEach(() => {
    jest.dontMock("../config/msg");
    jest.dontMock("./client");
    jest.dontMock("./utils");
    jest.dontMock("./msg");
    jest.clearAllMocks();
    setCrypto(originalCrypto);
  });

  test("uses sha256 when Web Crypto digest is available", async () => {
    setCrypto({ subtle: { digest: jest.fn() } });
    const { getCacheDigest, sha256Mock, sendBgMsgMock } = loadCacheDigest({
      sha256: async () => "native-digest",
      sendBgMsg: async () => "background-digest",
    });

    await expect(getCacheDigest("text", "salt")).resolves.toBe("native-digest");
    expect(sha256Mock).toHaveBeenCalledWith("text", "salt");
    expect(sendBgMsgMock).not.toHaveBeenCalled();
  });

  test("requests background sha256 when Web Crypto digest is unavailable in extension", async () => {
    setCrypto({});
    const { getCacheDigest, sha256Mock, sendBgMsgMock } = loadCacheDigest({
      sha256: async () => "native-digest",
      sendBgMsg: async () => "background-digest",
    });

    await expect(getCacheDigest("text", "salt")).resolves.toBe(
      "background-digest"
    );
    expect(sha256Mock).not.toHaveBeenCalled();
    expect(sendBgMsgMock).toHaveBeenCalledWith("sha256", {
      text: "text",
      salt: "salt",
    });
  });

  test("falls back to a stable simple hash when background sha256 fails", async () => {
    setCrypto({});
    const { getCacheDigest } = loadCacheDigest({
      sha256: async () => "native-digest",
      sendBgMsg: async () => {
        throw new Error("background unavailable");
      },
    });

    const digest = await getCacheDigest("text", "salt");
    const sameDigest = await getCacheDigest("text", "salt");
    const otherDigest = await getCacheDigest("text", "other-salt");

    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    expect(sameDigest).toBe(digest);
    expect(otherDigest).not.toBe(digest);
  });

  test("uses simple hash directly outside extension when Web Crypto digest is unavailable", async () => {
    setCrypto({});
    const { getCacheDigest, sendBgMsgMock } = loadCacheDigest({
      isExt: false,
      sha256: async () => "native-digest",
      sendBgMsg: async () => "background-digest",
    });

    await expect(getCacheDigest("text", "salt")).resolves.toMatch(
      /^[0-9a-f]{16}$/
    );
    expect(sendBgMsgMock).not.toHaveBeenCalled();
  });
});
