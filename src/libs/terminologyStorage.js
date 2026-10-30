import { storage } from "./storage";
import {
  normalizeTerminologyTable,
  terminologySourceList,
  compileTerminology,
  EMPTY_TERMINOLOGY_TABLES,
} from "./terminology";

export const TERMINOLOGY_INDEX = "kiss_terminology_index_v1";
export const TERMINOLOGY_SYNC_KEY = "kiss-terminology_v1.json";
const bodyKey = (id) => `kiss_terminology_table:${id}`;
export const readTableDirectory = async () =>
  (await storage.getObj(TERMINOLOGY_INDEX)) || [];
export const readTerminologyTable = (id) => storage.getObj(bodyKey(id));
const directoryEntry = ({ terms, aiTerms, ...table }) => ({
  ...table,
  normalCount: terms.split(/\n|;/).filter((line) => line.trim()).length,
  aiCount: aiTerms.split(/\n|;/).filter((line) => line.trim()).length,
});

export async function saveTerminologyTable(input) {
  const table = normalizeTerminologyTable(input);
  await storage.withTransaction(async (transaction) => {
    await transaction.saveEdit(bodyKey(table.id), table, TERMINOLOGY_SYNC_KEY, {
      defaultValue: null,
    });
    const directory = (await transaction.getObj(TERMINOLOGY_INDEX)) || [];
    const next = directory.filter((item) => item.id !== table.id);
    const index = directory.findIndex((item) => item.id === table.id);
    next.splice(index < 0 ? next.length : index, 0, directoryEntry(table));
    await transaction.setObj(TERMINOLOGY_INDEX, next);
  });
  globalThis.window?.dispatchEvent(new Event("kiss-terminology-changed"));
  return table;
}

export async function deleteTerminologyTable(id) {
  await storage.withTransaction(async (transaction) => {
    const directory = (await transaction.getObj(TERMINOLOGY_INDEX)) || [];
    await transaction.saveEdit(
      TERMINOLOGY_INDEX,
      directory.filter((item) => item.id !== id),
      TERMINOLOGY_SYNC_KEY,
      { defaultValue: [] }
    );
    await transaction.del(bodyKey(id));
  });
  globalThis.window?.dispatchEvent(new Event("kiss-terminology-changed"));
}

export async function loadTerminologySnapshot(sources) {
  const ids = [
    ...new Set(
      sources.filter(Boolean).flatMap((source) => source.termsList || [])
    ),
  ];
  if (!ids.length) return EMPTY_TERMINOLOGY_TABLES;
  return storage.withTransaction(async (transaction) =>
    (
      await Promise.all(ids.map((id) => transaction.getObj(bodyKey(id))))
    ).filter(Boolean)
  );
}

export async function resolveTerminology(scene = {}, api = {}, tables) {
  const sources = [...terminologySourceList(scene), api];
  return compileTerminology(
    sources,
    tables || (await loadTerminologySnapshot(sources))
  );
}

export function validateTerminologyDataset(value) {
  if (value?.formatVersion !== 1 || !Array.isArray(value.tables))
    throw new Error("Invalid terminology dataset");
  const tables = value.tables.map(normalizeTerminologyTable);
  if (new Set(tables.map((table) => table.id)).size !== tables.length)
    throw new Error("Duplicate terminology table ID");
  return { formatVersion: 1, tables };
}

export async function exportTerminologyDataset(transaction = storage) {
  const directory = (await transaction.getObj(TERMINOLOGY_INDEX)) || [];
  const tables = await Promise.all(
    directory.map(({ id }) => transaction.getObj(bodyKey(id)))
  );
  return validateTerminologyDataset({ formatVersion: 1, tables });
}

export async function applyTerminologyDataset(value, transaction) {
  const { tables } = validateTerminologyDataset(value);
  const previous = (await transaction.getObj(TERMINOLOGY_INDEX)) || [];
  for (const { id } of previous)
    if (!tables.some((table) => table.id === id))
      await transaction.del(bodyKey(id));
  for (const table of tables)
    await transaction.setObj(bodyKey(table.id), table);
  await transaction.setObj(TERMINOLOGY_INDEX, tables.map(directoryEntry));
}
