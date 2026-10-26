import { act } from "react";
import { createRoot } from "react-dom/client";
import PluginDirectory from "./PluginDirectory";
import { loadPluginDirectory } from "../../providers/pluginDirectory";

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
jest.mock("../../hooks/ProviderI18n", () => ({
  useProviderI18n: () => (value) => value,
}));
jest.mock("../../providers/pluginDirectory", () => ({
  loadPluginDirectory: jest.fn(),
  readDirectoryCache: () => null,
  validateOfficialDirectory: () => {
    throw new Error("no cache");
  },
  validateCommunityDirectory: () => {
    throw new Error("no cache");
  },
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
const official = {
  id: "example-official",
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
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "安装插件"
    )
  ).toBe(false);
  expect(container.textContent).toContain("official-installed");
  expect(container.textContent).toContain("community-installed");
});

test("load more requests a second page and appends results without duplicates", async () => {
  await mountDirectory();
  loadPluginDirectory.mockResolvedValue({
    items: [
      repo,
      {
        ...repo,
        full_name: "b/second",
        html_url: "https://github.com/b/second",
      },
    ],
    total_count: 21,
  });
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "加载更多")
      .click()
  );
  expect(loadPluginDirectory).toHaveBeenCalledWith("community", {
    force: false,
    page: 2,
  });
  expect(container.textContent.match(/author\/plugin/g)).toHaveLength(1);
  expect(container.textContent).toContain("b/second");
});

test("refresh failures keep installed entries and import controls available", async () => {
  loadPluginDirectory.mockRejectedValue(new Error("GitHub unavailable"));
  await mountDirectory();
  expect(container.textContent).toContain("GitHub unavailable");
  expect(container.textContent).toContain("community-installed");
  expect(container.textContent).toContain("导入插件");
});
