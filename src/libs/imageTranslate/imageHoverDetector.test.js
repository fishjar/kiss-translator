/* eslint-disable testing-library/no-unnecessary-act -- Tests drive native overlay events. */
import { act } from "react";
import { ImageHoverDetector } from "./imageHoverDetector";
import { readImageAsBlob } from "./imageReader";
import { downloadImageBlob } from "./downloadImage";

jest.mock("./imageReader", () => ({ readImageAsBlob: jest.fn() }));
jest.mock("./downloadImage", () => ({ downloadImageBlob: jest.fn() }));
jest.mock("../msg", () => ({ sendBgMsg: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("page image download", () => {
  let detector;
  let image;
  let onOpenBox;
  const download = () => document.querySelector(".kt-image-dual-btn--download");

  beforeEach(() => {
    image = document.createElement("img");
    image.src = "https://example.com/source.png";
    Object.defineProperty(image, "complete", { value: true });
    Object.defineProperty(image, "naturalWidth", { value: 4096 });
    Object.defineProperty(image, "naturalHeight", { value: 3072 });
    image.getBoundingClientRect = () => ({
      top: 100,
      bottom: 400,
      left: 100,
      right: 500,
      width: 400,
      height: 300,
    });
    document.body.appendChild(image);
    onOpenBox = jest.fn();
    detector = new ImageHoverDetector({ setting: {}, rule: {}, onOpenBox });
    readImageAsBlob.mockResolvedValue({
      blob: new Blob(["png"], { type: "image/png" }),
    });
    act(() => detector.resume(image));
  });

  afterEach(() => {
    act(() => detector.destroy());
    image.remove();
  });

  test("downloads unscaled image pixels without opening translation", async () => {
    await act(async () => download().click());
    expect(readImageAsBlob).toHaveBeenCalledWith(image, { maxEdge: Infinity });
    expect(downloadImageBlob).toHaveBeenCalledWith(expect.any(Blob));
    expect(onOpenBox).not.toHaveBeenCalled();
  });

  test.each(["hide", "source change"])(
    "discards an old result after %s",
    async (change) => {
      let finish;
      readImageAsBlob.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      act(() => download().click());
      act(() => {
        if (change === "hide") detector.suspend();
        else image.src = "https://example.com/replacement.png";
      });
      await act(async () => finish({ blob: new Blob(["stale"]) }));
      expect(downloadImageBlob).not.toHaveBeenCalled();
    }
  );
});
