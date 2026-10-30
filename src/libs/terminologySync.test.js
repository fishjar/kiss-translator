import { syncTerminology } from "./terminologySync";
import { syncData } from "./sync";
import { storage } from "./storage";
import {
  TERMINOLOGY_SYNC_KEY,
  saveTerminologyTable,
  exportTerminologyDataset,
} from "./terminologyStorage";

jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("webextension-polyfill", () => ({}));
jest.mock("./sync", () => ({ syncData: jest.fn() }));
const table = (id) => ({
  id,
  name: id,
  description: "",
  terms: "act,行动",
  aiTerms: "",
  normalMatchMode: "auto",
});
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("only explicit synchronization exports and adopts the full validated dataset", async () => {
  await saveTerminologyTable(table("local"));
  expect(syncData).not.toHaveBeenCalled();
  const remote = { formatVersion: 1, tables: [table("remote")] };
  syncData.mockResolvedValue({
    value: remote,
    isNew: true,
    commit: async ({ applyValue }) => {
      await storage.withTransaction(applyValue);
      return true;
    },
    migrateLegacy: jest.fn(),
  });
  await syncTerminology();
  expect(syncData).toHaveBeenCalledWith(
    TERMINOLOGY_SYNC_KEY,
    { formatVersion: 1, tables: [table("local")] },
    expect.objectContaining({ deferCommit: true })
  );
  expect(await exportTerminologyDataset()).toEqual(remote);
});

test("network errors and invalid remote versions leave local tables intact", async () => {
  await saveTerminologyTable(table("local"));
  const before = await exportTerminologyDataset();
  syncData.mockRejectedValueOnce(new Error("offline"));
  await expect(syncTerminology()).rejects.toThrow("offline");
  const commit = jest.fn();
  syncData.mockResolvedValueOnce({
    value: { formatVersion: 9, tables: [] },
    isNew: true,
    commit,
  });
  await expect(syncTerminology()).rejects.toThrow("dataset");
  expect(commit).not.toHaveBeenCalled();
  expect(await exportTerminologyDataset()).toEqual(before);
});

test("a rejected concurrent commit reports failure instead of reporting success", async () => {
  await saveTerminologyTable(table("local"));
  syncData.mockResolvedValueOnce({
    value: { formatVersion: 1, tables: [] },
    isNew: true,
    commit: async () => false,
  });
  await expect(syncTerminology()).rejects.toThrow("changed");
  expect((await exportTerminologyDataset()).tables).toEqual([table("local")]);
});
