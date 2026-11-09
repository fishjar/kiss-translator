import metadata from "./localModelTasks.json";
import { CATALOG, OCR_GROUPS } from "../localAi/core/catalog";

test("frontend task metadata stays in sync with the authoritative native catalogue", () => {
  expect(metadata).toEqual({
    asrTimestamps: Object.fromEntries(
      CATALOG.filter(
        (model) => model.task === "asr" && model.wordTimestamps === true
      ).map((model) => [model.id, true])
    ),
    backends: Object.fromEntries(
      CATALOG.map((model) => [model.id, model.backend])
    ),
    models: Object.fromEntries(CATALOG.map((model) => [model.id, model.task])),
    ocrGroups: OCR_GROUPS.map(({ id, detId, recId }) => ({ id, detId, recId })),
  });
});
