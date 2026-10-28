/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
// 入口接线守卫：fileTranslate 独立入口只承载页面本体——根树为
// StrictMode → FileTranslatePage，不挂全页 SettingProvider。页面视图树
// 不含分发器图标（图标直连 MUI 静态导入），仅依赖用户主题色；快照写入点
// 在 FileTranslationProvider（State.js，本页生产唯一写入点），由
// State.test.js 守护「写色彩、不写风格」契约。
import { act } from "react";
import React from "react";
import FileTranslatePage from "./views/FileTranslate";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockRenderedTrees = [];

jest.mock("react-dom/client", () => {
  const actual = jest.requireActual("react-dom/client");
  const createRootSpy = (container) => {
    const root = actual.createRoot(container);
    return {
      render: (node) => {
        mockRenderedTrees.push(node);
        root.render(node);
      },
      unmount: () => root.unmount(),
    };
  };
  return {
    __esModule: true,
    default: { createRoot: createRootSpy, hydrateRoot: actual.hydrateRoot },
    createRoot: createRootSpy,
  };
});

jest.mock("./config/i18n", () => ({ registerI18n: jest.fn() }));
jest.mock("./config/locales/fileTranslate", () => ({
  FILE_TRANSLATE_I18N: {},
}));
jest.mock("./config/locales/localAi", () => ({ LOCAL_AI_I18N: {} }));
jest.mock("./views/FileTranslate", () => ({
  __esModule: true,
  default: function FileTranslatePageStub() {
    return null;
  },
}));

describe("fileTranslate entry wiring", () => {
  beforeEach(() => {
    // 树捕获数组逐用例清空：新增用例时断言恒读当前用例的渲染根，
    // 不受先前用例 require 残留的树元素影响。
    mockRenderedTrees.length = 0;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders the page directly under StrictMode without a whole-page SettingProvider", () => {
    document.body.innerHTML = '<div id="root"></div>';

    act(() => {
      // 首次 require 触发入口模块顶层代码：注册 i18n、createRoot、render。
      require("./fileTranslate");
    });

    // 树形：StrictMode → FileTranslatePage。主题色写入点在页内的
    // FileTranslationProvider，入口层不包 SettingProvider。
    const strictElement = mockRenderedTrees[0];
    expect(strictElement.type).toBe(React.StrictMode);
    const pageElement = strictElement.props.children;
    expect(pageElement.type).toBe(FileTranslatePage);
  });
});
