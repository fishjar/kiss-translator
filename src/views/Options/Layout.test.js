import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "./Layout";

jest.mock("@mui/material/useMediaQuery", () => jest.fn(() => true));
jest.mock("./Header", () => ({
  __esModule: true,
  default: function HeaderMock() {
    return <div>Header</div>;
  },
}));
jest.mock("./Navigator", () => ({
  __esModule: true,
  default: function NavigatorMock() {
    return <div>Navigator</div>;
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Screen() {
  return <div>Screen</div>;
}

function renderUI() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Screen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("Options Layout", () => {
  test("renders the options shell with navigation and page content", () => {
    const { container, unmount } = renderUI();

    expect(container.textContent).toContain("Header");
    expect(container.textContent).toContain("Navigator");
    expect(container.textContent).toContain("Screen");
    expect(container.querySelector("main")).toBeTruthy();

    unmount();
  });
});
