import { act } from "react";
import { createRoot } from "react-dom/client";
import PluginDirectory from "./PluginDirectory";
import {
  loadCommunityPluginMetadata,
  loadPluginDirectory,
  readDirectoryCache,
} from "../../providers/pluginDirectory";

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n(mockLanguage),
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: { uiLang: mockLanguage } }),
}));
jest.mock("../../providers/pluginDirectory", () => ({
  ...jest.requireActual("../../providers/pluginDirectory"),
  loadPluginDirectory: jest.fn(),
  loadCommunityPluginMetadata: jest.fn(),
  readDirectoryCache: jest.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
let mockLanguage;
const official = {
  id: "example-official",
  apiVersion: 1,
  name: "Official",
  version: "1.0.0",
  capabilities: ["translate"],
};
const repo = {
  full_name: "author/plugin",
  html_url: "https://github.com/author/plugin",
  description: "Community description",
};
const installOfficial = jest.fn(),
  installCommunity = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage = "zh";
  readDirectoryCache.mockReset();
  loadCommunityPluginMetadata.mockReset().mockResolvedValue(null);
  loadPluginDirectory.mockImplementation(async (kind) =>
    kind === "official"
      ? { plugins: [official] }
      : { items: [repo], total_count: 21 }
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const mountDirectory = async (installed = []) => {
  // React createRoot.render is not a Testing Library render helper.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () =>
    root.render(
      <PluginDirectory
        installed={installed}
        busy={false}
        onOfficialInstall={installOfficial}
        onCommunityInstall={installCommunity}
        renderInstalled={(entries, isOfficial) => (
          <span>
            {isOfficial ? "official-installed" : "community-installed"}
          </span>
        )}
        importControls={<button>导入插件</button>}
      />
    )
  );
};

test("official and community sections are stacked; opening only loads metadata", async () => {
  await mountDirectory();
  expect(
    [...container.querySelectorAll("section")].map((section) =>
      section.getAttribute("aria-label")
    )
  ).toEqual(["官方插件", "外部插件"]);
  expect(container.querySelector('[role="tab"]')).toBeNull();
  expect(installOfficial).not.toHaveBeenCalled();
  expect(installCommunity).not.toHaveBeenCalled();
  const buttons = [...container.querySelectorAll("button")];
  await act(async () =>
    buttons.find((button) => button.textContent === "安装插件").click()
  );
  expect(installOfficial).toHaveBeenCalledWith(official);
  await act(async () =>
    buttons.find((button) => button.textContent === "下载安装").click()
  );
  expect(installCommunity).toHaveBeenCalledWith(repo.html_url);
});

test.each([{ kind: "page" }, { minHostVersion: "999999.0.0" }])(
  "incompatible catalog entries remain visible but cannot be installed: %j",
  async (requirements) => {
    loadPluginDirectory.mockImplementation(async (kind) =>
      kind === "official"
        ? { plugins: [{ ...official, ...requirements }] }
        : { items: [], total_count: 0 }
    );
    await mountDirectory();
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "安装插件"
    );
    expect(button.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("Official");
    expect(installOfficial).not.toHaveBeenCalled();
  }
);

test("installed packages and repositories are not duplicated by discovered entries", async () => {
  await mountDirectory([
    { id: official.id },
    { id: "external", source: { repoUrl: repo.html_url } },
  ]);
  expect(container.textContent).not.toContain("Community description");
  expect(loadCommunityPluginMetadata).not.toHaveBeenCalled();
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "安装插件"
    )
  ).toBe(false);
  expect(container.textContent).toContain("official-installed");
  expect(container.textContent).toContain("community-installed");
});

test("only loads manifest metadata for each group of 10 and deduplicates pages", async () => {
  const repos = Array.from({ length: 19 }, (_, index) => ({
    full_name: `author/plugin-${index}`,
    html_url: `https://github.com/author/plugin-${index}`,
  }));
  loadPluginDirectory.mockImplementation(async (kind, { page }) =>
    kind === "official"
      ? { plugins: [] }
      : {
          items: page === 1 ? repos.slice(0, 10) : repos.slice(9),
          total_count: 20,
        }
  );
  await mountDirectory();
  expect(loadCommunityPluginMetadata.mock.calls.map(([name]) => name)).toEqual(
    repos.slice(0, 10).map(({ full_name }) => full_name)
  );
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "加载更多")
      .click()
  );
  expect(loadPluginDirectory).toHaveBeenCalledWith("community", {
    force: false,
    page: 2,
  });
  expect(loadCommunityPluginMetadata.mock.calls.map(([name]) => name)).toEqual(
    repos.map(({ full_name }) => full_name)
  );
  expect(
    container.querySelectorAll('section[aria-label="外部插件"] a')
  ).toHaveLength(19);
  expect(container.textContent).not.toContain("加载更多");
});

test("cached repositories render while discovery runs, with metadata fetched only for the resulting page", async () => {
  readDirectoryCache.mockImplementation((key) =>
    key === "community:stars:1"
      ? { data: { items: [repo], total_count: 1 } }
      : null
  );
  let resolveDiscovery;
  loadPluginDirectory.mockImplementation(async (kind) =>
    kind === "official"
      ? { plugins: [] }
      : new Promise((resolve) => {
          resolveDiscovery = resolve;
        })
  );
  await mountDirectory();
  expect(container.textContent).toContain(repo.full_name);
  expect(loadCommunityPluginMetadata).not.toHaveBeenCalled();
  const fresh = {
    full_name: "author/fresh",
    html_url: "https://github.com/author/fresh",
  };
  await act(async () => resolveDiscovery({ items: [fresh], total_count: 1 }));
  expect(loadCommunityPluginMetadata).toHaveBeenCalledTimes(1);
  expect(loadCommunityPluginMetadata).toHaveBeenCalledWith(fresh.full_name, {
    force: false,
  });
});

test("community cards show repository details first, then localize available manifest summaries", async () => {
  const missing = {
    full_name: "author/missing",
    html_url: "https://github.com/author/missing",
    description: "Missing manifest fallback",
  };
  loadPluginDirectory.mockImplementation(async (kind) =>
    kind === "official"
      ? { plugins: [] }
      : { items: [repo, missing], total_count: 2 }
  );
  let resolveSummary;
  loadCommunityPluginMetadata.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSummary = resolve;
      })
  );
  await mountDirectory();
  expect(container.textContent).toContain(repo.full_name);
  expect(container.textContent).toContain(repo.description);
  const fallback = container.querySelector(`a[href="${missing.html_url}"]`);
  expect(
    fallback.parentElement.parentElement.parentElement.textContent
  ).toContain("插件详情加载失败。");
  expect(container.textContent.match(/插件详情加载失败。/g)).toHaveLength(1);
  await act(async () =>
    resolveSummary({
      name: "示例插件",
      version: "1.0.0",
      description: "示例简介",
      nameI18n: { zh: "示例插件", en: "Example plugin" },
      descriptionI18n: { zh: "示例简介", en: "Example description" },
      capabilities: ["translate", "dictionary"],
    })
  );
  expect(container.textContent).toContain("示例插件 · 1.0.0");
  expect(container.textContent).toContain("示例简介");
  expect(container.textContent).toContain("AI 词典");
  expect(container.textContent).toContain(missing.description);
  expect(container.textContent).not.toContain(repo.description);
  expect(
    container.querySelector(`a[href="${repo.html_url}"]`).textContent
  ).toBe("示例插件");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "下载安装")
      .click()
  );
  expect(installCommunity).toHaveBeenCalledWith(repo.html_url);

  mockLanguage = "en";
  await mountDirectory();
  expect(container.textContent).toContain("Example plugin · 1.0.0");
  expect(container.textContent).toContain("Example description");
  expect(container.textContent).toContain("Could not load plugin details.");
  expect(loadCommunityPluginMetadata).toHaveBeenCalledTimes(2);

  await act(async () =>
    container
      .querySelector('section[aria-label="Community plugins"] button')
      .click()
  );
  expect(loadCommunityPluginMetadata).toHaveBeenCalledWith(repo.full_name, {
    force: true,
  });
  expect(container.textContent).toContain(repo.description);
});

test("refresh failures keep installed entries and import controls available", async () => {
  loadPluginDirectory.mockRejectedValue(new Error("GitHub unavailable"));
  await mountDirectory();
  expect(container.textContent).toContain("GitHub unavailable");
  expect(container.textContent).toContain("community-installed");
  expect(container.textContent).toContain("导入插件");
});
