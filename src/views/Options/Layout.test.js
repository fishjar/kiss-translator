import { fetchLatestVersion } from "./Layout";

describe("fetchLatestVersion", () => {
  const originalVersionUrl = process.env.REACT_APP_VERSION_URL;
  const originalGithubVersionUrl = process.env.REACT_APP_VERSION_URL_GITHUB;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.REACT_APP_VERSION_URL = "https://primary.example/version.txt";
    process.env.REACT_APP_VERSION_URL_GITHUB =
      "https://github.example/version.txt";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalVersionUrl === undefined) {
      delete process.env.REACT_APP_VERSION_URL;
    } else {
      process.env.REACT_APP_VERSION_URL = originalVersionUrl;
    }
    if (originalGithubVersionUrl === undefined) {
      delete process.env.REACT_APP_VERSION_URL_GITHUB;
    } else {
      process.env.REACT_APP_VERSION_URL_GITHUB = originalGithubVersionUrl;
    }
    global.fetch = originalFetch;
  });

  test("retries the GitHub URL once when the primary URL fails", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, text: async () => " 2.0.29\n" });

    await expect(fetchLatestVersion()).resolves.toBe("2.0.29");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toMatch(
      /^https:\/\/primary\.example\/version\.txt\?t=/
    );
    expect(global.fetch.mock.calls[1][0]).toMatch(
      /^https:\/\/github\.example\/version\.txt\?t=/
    );
  });
});
