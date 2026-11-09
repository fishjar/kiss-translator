import { downloadImageBlob } from "./downloadImage";

test("starts a PNG download and releases its URL after the browser consumes it", () => {
  jest.useFakeTimers();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:test-download");
  URL.revokeObjectURL = jest.fn();
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function () {
      expect(this.download).toMatch(/^kiss-screenshot-\d+\.png$/);
      expect(this.href).toBe("blob:test-download");
      expect(this.isConnected).toBe(true);
    });
  try {
    const blob = new Blob(["png"], { type: "image/png" });
    downloadImageBlob(blob, "screenshot");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-download");
  } finally {
    click.mockRestore();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    jest.useRealTimers();
  }
});
