describe("Safari client detection", () => {
  const originalClient = process.env.REACT_APP_CLIENT;

  afterEach(() => {
    jest.resetModules();
    process.env.REACT_APP_CLIENT = originalClient;
  });

  test("treats Safari as a browser extension client", () => {
    process.env.REACT_APP_CLIENT = "safari";
    jest.resetModules();

    const { client, isExt } = require("./client");

    expect(client).toBe("safari");
    expect(isExt).toBe(true);
  });
});
