import { storage, getSyncWithDefault } from "./storage";
import {
  saveTerminologyTable,
  readTableDirectory,
  readTerminologyTable,
  deleteTerminologyTable,
  loadTerminologySnapshot,
  exportTerminologyDataset,
  applyTerminologyDataset,
  TERMINOLOGY_SYNC_KEY,
} from "./terminologyStorage";
jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("webextension-polyfill", () => ({}));

const table = (id, terms = "act,行动") => ({
  id,
  name: id,
  description: "",
  terms,
  aiTerms: "component,组件",
  normalMatchMode: "auto",
});
beforeEach(() => localStorage.clear());

test("directory excludes bodies; edits update only terminology sync metadata", async () => {
  await saveTerminologyTable(table("a"));
  expect(await readTableDirectory()).toEqual([
    {
      id: "a",
      name: "a",
      description: "",
      normalMatchMode: "auto",
      normalCount: 1,
      aiCount: 1,
    },
  ]);
  expect(await readTerminologyTable("a")).toEqual(table("a"));
  expect(Object.keys((await getSyncWithDefault()).syncMeta)).toEqual([
    TERMINOLOGY_SYNC_KEY,
  ]);
});

test("snapshot loads only selected IDs, and later edits cannot change it", async () => {
  await saveTerminologyTable(table("a"));
  await saveTerminologyTable(table("b", "private,secret"));
  const snapshot = await loadTerminologySnapshot([
    { termsList: ["a", "a", "missing"] },
  ]);
  await saveTerminologyTable(table("a", "act,new"));
  expect(snapshot).toEqual([table("a")]);
});

test("dataset adoption validates first, replaces all tables and preserves identity", async () => {
  await saveTerminologyTable(table("a"));
  await expect(
    storage.withTransaction((transaction) =>
      applyTerminologyDataset({ formatVersion: 2, tables: [] }, transaction)
    )
  ).rejects.toThrow();
  expect(await readTerminologyTable("a")).toEqual(table("a"));
  await storage.withTransaction((transaction) =>
    applyTerminologyDataset(
      { formatVersion: 1, tables: [table("b")] },
      transaction
    )
  );
  expect(await readTerminologyTable("a")).toBeFalsy();
  expect(await exportTerminologyDataset()).toEqual({
    formatVersion: 1,
    tables: [table("b")],
  });
});

test("local deletion changes the dataset without recreating any referenced table", async () => {
  await saveTerminologyTable(table("a"));
  const before = (await getSyncWithDefault()).syncMeta[TERMINOLOGY_SYNC_KEY]
    .updateAt;
  await deleteTerminologyTable("a");
  expect(await readTableDirectory()).toEqual([]);
  expect(
    (await getSyncWithDefault()).syncMeta[TERMINOLOGY_SYNC_KEY].updateAt
  ).toBeGreaterThan(before);
});
