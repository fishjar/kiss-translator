import { openOptionsPage } from "./navigation";
import { sendBgMsg } from "./msg";
import { MSG_OPEN_OPTIONS } from "../config/msg";

let mockIsExt = true;
jest.mock("./client", () => ({
  get isExt() {
    return mockIsExt;
  },
}));
jest.mock("./msg", () => ({ sendBgMsg: jest.fn() }));

describe("settings navigation from a website", () => {
  let open;
  const optionsPage = process.env.REACT_APP_OPTIONSPAGE;

  beforeEach(() => {
    mockIsExt = true;
    jest.clearAllMocks();
    open = jest.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    open.mockRestore();
    if (optionsPage === undefined) delete process.env.REACT_APP_OPTIONSPAGE;
    else process.env.REACT_APP_OPTIONSPAGE = optionsPage;
  });

  test.each(["/subtitle", "#/apis", ""])(
    "delegates extension navigation for %s to the background",
    async (path) => {
      sendBgMsg.mockResolvedValueOnce(true);

      await expect(openOptionsPage(path)).resolves.toBe(true);

      expect(sendBgMsg).toHaveBeenCalledWith(MSG_OPEN_OPTIONS, {
        path: path && (path.startsWith("#") ? path : `#${path}`),
      });
      expect(open).not.toHaveBeenCalled();
    }
  );

  test("uses the configured settings URL for userscripts", async () => {
    mockIsExt = false;
    process.env.REACT_APP_OPTIONSPAGE = "https://kiss.example/options";

    await openOptionsPage("/subtitle");

    expect(open).toHaveBeenCalledWith(
      "https://kiss.example/options#/subtitle",
      "_blank",
      "noopener,noreferrer"
    );
    expect(sendBgMsg).not.toHaveBeenCalled();
  });
});
