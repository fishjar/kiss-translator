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

import { syncData } from "./sync";
import {
  apiCreateGist,
  apiGetGist,
  apiListGists,
  apiUpdateGistFile,
} from "../apis";
import { getSyncWithDefault, putSync } from "./storage";

const SYNC_DESCRIPTION = "kiss translator sync files";
const SYNC_KEY = "github-token";
const SETTING_KEY = "kiss-setting_v2.json";

const gistFileContent = (value, updateAt) =>
  JSON.stringify({
    key: SETTING_KEY,
    value: JSON.stringify(value),
    updateAt,
  });

describe("GitHub Gist sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(1000);
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  test("reuses the newest existing fixed-description gist when syncUrl is empty", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "",
      syncKey: SYNC_KEY,
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
            value: JSON.stringify({ local: true }),
            updateAt: 0,
          },
          null,
          2
        ),
      },
      SYNC_DESCRIPTION
    );
    expect(putSync).toHaveBeenNthCalledWith(1, { syncUrl: "created-gist" });
    expect(result).toEqual({ value: { local: true }, isNew: false });
  });

  test("returns remote value when an existing gist file is newer", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "https://gist.github.com/fishjar/existing-gist",
      syncKey: SYNC_KEY,
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

    expect(apiListGists).not.toHaveBeenCalled();
    expect(apiUpdateGistFile).not.toHaveBeenCalled();
    expect(result).toEqual({ value: { remote: true }, isNew: true });
  });

  test("patches the existing gist file when local data is newer", async () => {
    getSyncWithDefault.mockResolvedValue({
      syncType: "GitHub Gist",
      syncUrl: "existing-gist",
      syncKey: SYNC_KEY,
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
          value: JSON.stringify({ local: true }),
          updateAt: 200,
        },
        null,
        2
      )
    );
    expect(result).toEqual({ value: { local: true }, isNew: false });
  });
});
