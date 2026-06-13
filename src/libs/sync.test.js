jest.mock("../config", () => ({
  APP_LCNAME: "kiss-translator",
  KV_SETTING_KEY: "kiss-setting_v2.json",
  KV_RULES_KEY: "kiss-rules_v2.json",
  KV_WORDS_KEY: "kiss-words.json",
  KV_RULES_SHARE_KEY: "kiss-rules-share_v2.json",
  KV_SALT_SHARE: "share-salt",
  OPT_SYNCTYPE_WEBDAV: "WebDAV",
  OPT_SYNCTYPE_GIST: "GitHub Gist",
}));

jest.mock("./storage", () => ({
  getSyncWithDefault: jest.fn(),
  putSync: jest.fn(),
  getSettingWithDefault: jest.fn(),
  getRulesWithDefault: jest.fn(),
  getWordsWithDefault: jest.fn(),
  setSetting: jest.fn(),
  setRules: jest.fn(),
  setWords: jest.fn(),
}));

jest.mock("../apis", () => ({
  apiSyncData: jest.fn(),
  apiCreateGist: jest.fn(),
  apiListGists: jest.fn(),
  apiGetGist: jest.fn(),
  apiUpdateGistFile: jest.fn(),
  apiFetchText: jest.fn(),
}));

jest.mock("./utils", () => ({
  sha256: jest.fn(),
  removeEndchar: jest.fn((value) => value.replace(/\/$/, "")),
}));

jest.mock("webdav", () => ({
  createClient: jest.fn(),
  getPatcher: jest.fn(() => ({
    patch: jest.fn(),
  })),
}));

jest.mock("./fetch", () => ({
  fetchPatcher: jest.fn(),
}));

jest.mock("./log", () => ({
  kissLog: jest.fn(),
}));

jest.mock("./syncCrypto", () => ({
  encryptSyncValue: jest.fn(),
  decryptSyncValue: jest.fn(),
}));

import { changeSyncEncryptKey, syncData, syncSettingAndRules } from "./sync";
import {
  apiCreateGist,
  apiGetGist,
  apiListGists,
  apiUpdateGistFile,
} from "../apis";
import {
  getSettingWithDefault,
  getRulesWithDefault,
  getSyncWithDefault,
  getWordsWithDefault,
  putSync,
  setSetting,
} from "./storage";
import { decryptSyncValue, encryptSyncValue } from "./syncCrypto";

const SYNC_DESCRIPTION = "kiss translator sync files";
const SYNC_KEY = "github-token";
const SYNC_ENCRYPT_KEY = "sync-encrypt-passphrase";
const NEW_SYNC_ENCRYPT_KEY = "new-sync-encrypt-passphrase";
const SETTING_KEY = "kiss-setting_v2.json";
const RULES_KEY = "kiss-rules_v2.json";
const WORDS_KEY = "kiss-words.json";

const gistFileContent = (value, updateAt) =>
  JSON.stringify({
    key: SETTING_KEY,
    value: JSON.stringify(value),
    updateAt,
  });

const encryptedGistFileContent = (value, updateAt) =>
  JSON.stringify({
    key: SETTING_KEY,
    value: `cipher:${Buffer.from(JSON.stringify(value)).toString("base64")}`,
    updateAt,
  });

describe("GitHub Gist sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    encryptSyncValue.mockImplementation((value) =>
      Promise.resolve(`cipher:${Buffer.from(value).toString("base64")}`)
    );
    decryptSyncValue.mockImplementation((value) => {
      if (value.startsWith("bad-cipher:")) {
        return Promise.reject(new Error("decrypt failed"));
      }
      if (value.startsWith("cipher:")) {
        return Promise.resolve({
          value: Buffer.from(
            value.slice("cipher:".length),
            "base64"
          ).toString(),
          encrypted: true,
        });
      }
      return Promise.resolve({ value, encrypted: false });
    });
    jest.spyOn(Date, "now").mockReturnValue(1000);
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  test("skips sync when encryption passphrase is missing", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: "",
      syncMeta: {},
    });

    const result = await syncData(SETTING_KEY, { local: true });

    expect(result).toBeUndefined();
    expect(apiGetGist).not.toHaveBeenCalled();
    expect(encryptSyncValue).not.toHaveBeenCalled();
  });

  test("reuses the newest existing fixed-description gist when syncUrl is empty", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 100,
          syncAt: 1,
        },
      },
    });
    apiListGists.mockResolvedValue([
      {
        id: "legacy-timestamped",
        description: `${SYNC_DESCRIPTION}-1780891711256`,
        updated_at: "2026-06-08T01:00:00Z",
      },
      {
        id: "fixed-old",
        description: SYNC_DESCRIPTION,
        updated_at: "2026-06-08T02:00:00Z",
      },
      {
        id: "fixed-new",
        description: SYNC_DESCRIPTION,
        updated_at: "2026-06-08T03:00:00Z",
      },
    ]);
    apiGetGist.mockResolvedValue({
      files: {
        [SETTING_KEY]: {
          content: gistFileContent({ remote: true }, 200),
        },
      },
    });

    const result = await syncData(SETTING_KEY, { local: true });

    expect(apiCreateGist).not.toHaveBeenCalled();
    expect(apiGetGist).toHaveBeenCalledWith("fixed-new", SYNC_KEY);
    expect(putSync).toHaveBeenNthCalledWith(1, { syncUrl: "fixed-new" });
    expect(result).toEqual({ value: { remote: true }, isNew: true });
  });

  test("creates one fixed-description gist when syncUrl is empty and none exists", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {},
    });
    apiListGists.mockResolvedValue([]);
    apiCreateGist.mockResolvedValue({ id: "created-gist" });

    const result = await syncData(SETTING_KEY, { local: true });

    expect(apiCreateGist).toHaveBeenCalledWith(
      SYNC_KEY,
      {
        key: SETTING_KEY,
        content: JSON.stringify(
          {
            key: SETTING_KEY,
            value: `cipher:${Buffer.from(
              JSON.stringify({ local: true })
            ).toString("base64")}`,
            updateAt: 0,
          },
          null,
          2
        ),
      },
      SYNC_DESCRIPTION
    );
    expect(putSync).toHaveBeenNthCalledWith(1, { syncUrl: "created-gist" });
    expect(encryptSyncValue).toHaveBeenCalledWith(
      JSON.stringify({ local: true }),
      SYNC_ENCRYPT_KEY
    );
    expect(encryptSyncValue).not.toHaveBeenCalledWith(
      expect.any(String),
      SYNC_KEY
    );
    expect(result).toEqual({ value: { local: true }, isNew: false });
  });

  test("returns remote value when an existing gist file is newer", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "https://gist.github.com/fishjar/existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 10,
          syncAt: 1,
        },
      },
    });
    apiGetGist.mockResolvedValue({
      files: {
        [SETTING_KEY]: {
          content: encryptedGistFileContent({ remote: true }, 50),
        },
      },
    });

    const result = await syncData(SETTING_KEY, { local: true });

    expect(apiListGists).not.toHaveBeenCalled();
    expect(apiUpdateGistFile).not.toHaveBeenCalled();
    expect(result).toEqual({ value: { remote: true }, isNew: true });
  });

  test("decrypts encrypted remote value when an existing gist file is newer", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 10,
          syncAt: 1,
        },
      },
    });
    apiGetGist.mockResolvedValue({
      files: {
        [SETTING_KEY]: {
          content: encryptedGistFileContent({ remote: true }, 50),
        },
      },
    });

    const result = await syncData(SETTING_KEY, { local: true });

    expect(apiUpdateGistFile).not.toHaveBeenCalled();
    expect(decryptSyncValue).toHaveBeenCalledWith(
      expect.any(String),
      SYNC_ENCRYPT_KEY
    );
    expect(decryptSyncValue).not.toHaveBeenCalledWith(
      expect.any(String),
      SYNC_KEY
    );
    expect(result).toEqual({ value: { remote: true }, isNew: true });
  });

  test("migrates newer legacy plaintext gist data to encrypted content", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 10,
          syncAt: 1,
        },
      },
    });
    apiGetGist.mockResolvedValue({
      files: {
        [SETTING_KEY]: {
          content: gistFileContent({ remote: true }, 50),
        },
      },
    });

    const result = await syncData(SETTING_KEY, { local: true });

    expect(apiUpdateGistFile).toHaveBeenCalledWith(
      "existing-gist",
      SYNC_KEY,
      SETTING_KEY,
      JSON.stringify(
        {
          key: SETTING_KEY,
          value: `cipher:${Buffer.from(
            JSON.stringify({ remote: true })
          ).toString("base64")}`,
          updateAt: 50,
        },
        null,
        2
      )
    );
    expect(result).toEqual({ value: { remote: true }, isNew: true });
  });

  test("patches the existing gist file when local data is newer", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 200,
          syncAt: 1,
        },
      },
    });
    apiGetGist.mockResolvedValue({
      files: {
        [SETTING_KEY]: {
          content: gistFileContent({ remote: true }, 100),
        },
      },
    });

    const result = await syncData(SETTING_KEY, { local: true });

    expect(apiUpdateGistFile).toHaveBeenCalledWith(
      "existing-gist",
      SYNC_KEY,
      SETTING_KEY,
      JSON.stringify(
        {
          key: SETTING_KEY,
          value: `cipher:${Buffer.from(
            JSON.stringify({ local: true })
          ).toString("base64")}`,
          updateAt: 200,
        },
        null,
        2
      )
    );
    expect(result).toEqual({ value: { local: true }, isNew: false });
  });

  test("replaces older legacy plaintext gist data with encrypted local content", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 200,
          syncAt: 1,
        },
      },
    });
    apiGetGist.mockResolvedValue({
      files: {
        [SETTING_KEY]: {
          content: gistFileContent({ remote: true }, 100),
        },
      },
    });

    await syncData(SETTING_KEY, { local: true });

    const uploadedContent = apiUpdateGistFile.mock.calls[0][3];
    expect(uploadedContent).not.toContain('"local":true');
    expect(JSON.parse(uploadedContent).value).toMatch(/^cipher:/);
  });

  test("stops setting sync when encrypted remote data cannot be decrypted", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 10,
          syncAt: 1,
        },
      },
    });
    getSettingWithDefault.mockResolvedValue({ local: true });
    apiGetGist.mockResolvedValue({
      files: {
        [SETTING_KEY]: {
          content: JSON.stringify({
            key: SETTING_KEY,
            value: "bad-cipher:value",
            updateAt: 50,
          }),
        },
      },
    });

    await expect(syncSettingAndRules()).rejects.toThrow("decrypt failed");

    expect(setSetting).not.toHaveBeenCalled();
    expect(apiUpdateGistFile).not.toHaveBeenCalled();
  });

  test("changes encryption passphrase after re-encrypting personal sync data", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 200,
          syncAt: 1,
        },
        [RULES_KEY]: {
          updateAt: 201,
          syncAt: 1,
        },
        [WORDS_KEY]: {
          updateAt: 202,
          syncAt: 1,
        },
      },
    });
    getSettingWithDefault.mockResolvedValue({ setting: true });
    getRulesWithDefault.mockResolvedValue([{ pattern: "*" }]);
    getWordsWithDefault.mockResolvedValue({ hello: true });
    apiGetGist.mockResolvedValue({ files: {} });

    Date.now.mockReturnValue(9999);

    await changeSyncEncryptKey(NEW_SYNC_ENCRYPT_KEY);

    expect(encryptSyncValue).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ setting: true }),
      SYNC_ENCRYPT_KEY
    );
    expect(encryptSyncValue).toHaveBeenNthCalledWith(
      2,
      JSON.stringify([{ pattern: "*" }]),
      SYNC_ENCRYPT_KEY
    );
    expect(encryptSyncValue).toHaveBeenNthCalledWith(
      3,
      JSON.stringify({ hello: true }),
      SYNC_ENCRYPT_KEY
    );
    expect(encryptSyncValue).toHaveBeenNthCalledWith(
      4,
      JSON.stringify({ setting: true }),
      NEW_SYNC_ENCRYPT_KEY
    );
    expect(encryptSyncValue).toHaveBeenNthCalledWith(
      5,
      JSON.stringify([{ pattern: "*" }]),
      NEW_SYNC_ENCRYPT_KEY
    );
    expect(encryptSyncValue).toHaveBeenNthCalledWith(
      6,
      JSON.stringify({ hello: true }),
      NEW_SYNC_ENCRYPT_KEY
    );
    const uploadedSetting = JSON.parse(apiUpdateGistFile.mock.calls[3][3]);
    const uploadedRules = JSON.parse(apiUpdateGistFile.mock.calls[4][3]);
    const uploadedWords = JSON.parse(apiUpdateGistFile.mock.calls[5][3]);
    expect(uploadedSetting.updateAt).toBe(9999);
    expect(uploadedRules.updateAt).toBe(9999);
    expect(uploadedWords.updateAt).toBe(9999);
    expect(putSync).toHaveBeenCalledWith({
      syncMeta: expect.objectContaining({
        [SETTING_KEY]: {
          updateAt: 9999,
          syncAt: 9999,
        },
      }),
    });
    expect(putSync).toHaveBeenCalledWith({
      syncMeta: expect.objectContaining({
        [RULES_KEY]: {
          updateAt: 9999,
          syncAt: 9999,
        },
      }),
    });
    expect(putSync).toHaveBeenCalledWith({
      syncMeta: expect.objectContaining({
        [WORDS_KEY]: {
          updateAt: 9999,
          syncAt: 9999,
        },
      }),
    });
    expect(putSync).toHaveBeenLastCalledWith({
      syncEncryptKey: NEW_SYNC_ENCRYPT_KEY,
    });
  });

  test("keeps old encryption passphrase when re-encryption fails", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
      syncEncryptKey: SYNC_ENCRYPT_KEY,
      syncMeta: {
        [SETTING_KEY]: {
          updateAt: 200,
          syncAt: 1,
        },
      },
    });
    getSettingWithDefault.mockResolvedValue({ setting: true });
    apiGetGist.mockResolvedValue({ files: {} });
    apiUpdateGistFile.mockRejectedValue(new Error("upload failed"));

    await expect(changeSyncEncryptKey(NEW_SYNC_ENCRYPT_KEY)).rejects.toThrow(
      "upload failed"
    );

    expect(putSync).not.toHaveBeenCalledWith({
      syncEncryptKey: NEW_SYNC_ENCRYPT_KEY,
    });
  });
});
