import { acquireProviderHost, providerHostBusy } from "./hostLease";

test("shared host stays busy until every task releases its lease, including repeated cleanup", () => {
  const first = acquireProviderHost();
  const second = acquireProviderHost();
  first();
  first();
  expect(providerHostBusy()).toBe(true);
  second();
  expect(providerHostBusy()).toBe(false);
});
