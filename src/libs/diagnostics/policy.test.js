/** @jest-environment node */
import { createDetailPolicy, DETAIL_TTL } from "./policy";
it("session policy expires, survives worker recreation, and resets for a new browser session", async () => {
  let time = 100;
  let session = {};
  const browser = {
    storage: {
      session: {
        get: jest.fn(async () => session),
        set: jest.fn(async (values) => Object.assign(session, values)),
      },
    },
  };
  const policy = createDetailPolicy(browser, () => time);
  expect((await policy.status()).enabled).toBe(false);
  await policy.set(true);
  expect((await createDetailPolicy(browser, () => time).status()).enabled).toBe(
    true
  );
  time += DETAIL_TTL;
  expect((await policy.status()).enabled).toBe(false);
  await policy.set(true);
  await policy.set(false);
  expect((await policy.status()).enabled).toBe(false);
  await policy.set(true);
  session = {};
  expect((await createDetailPolicy(browser, () => time).status()).enabled).toBe(
    false
  );
});
