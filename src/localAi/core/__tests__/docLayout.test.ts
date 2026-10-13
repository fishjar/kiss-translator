import { describe, expect, it } from "vitest";
import { decodeLayout, maskPolygon, orderRanks } from "../docLayout";
import { resolveModelTarget } from "../modelTarget";
import { DOC_MODEL_ID, getCatalogModel } from "../catalog";
import { fileUrl } from "../types";

describe("DOC decoding", () => {
  it("uses pairwise votes instead of row argmax", () => {
    const logits = new Float32Array([0, 10, 10, -10, 0, 10, -10, -10, 0]);
    expect(orderRanks(logits, 3)).toEqual([0, 1, 2]);
  });
  it("maps non-square page boxes and instance masks to source coordinates", () => {
    const logits = new Float32Array(50).fill(-20);
    logits[22] = 10;
    logits[25 + 6] = 9;
    const masks = new Float32Array(2 * 4 * 4).fill(10);
    const regions = decodeLayout(
      logits,
      new Float32Array([0.5, 0.5, 0.5, 0.5, 0.25, 0.2, 0.3, 0.2]),
      masks,
      new Float32Array([0, -10, 10, 0]),
      1000,
      500,
      2,
      4
    );
    expect(regions.map((r) => r.type)).toEqual(["heading", "paragraph"]);
    expect(regions[1].bbox).toEqual([250, 125, 750, 375]);
    expect(
      regions[1].polygon.every(
        ([x, y]) => x >= 0 && x <= 1000 && y >= 0 && y <= 500
      )
    ).toBe(true);
  });
  it("falls back to bbox for an empty segmentation mask", () => {
    expect(
      maskPolygon(
        new Float32Array(16).fill(-100),
        4,
        [10, 20, 30, 40],
        100,
        100,
        0.5
      )
    ).toEqual([
      [10, 20],
      [30, 20],
      [30, 40],
      [10, 40],
    ]);
  });
  it("pins download revision and rejects arbitrary external weights", () => {
    const model = getCatalogModel(DOC_MODEL_ID)!;
    expect(
      fileUrl(
        "huggingface",
        model.source,
        model.files[0].path,
        undefined,
        model.revision
      )
    ).toContain(`/resolve/${model.revision}/`);
    expect(
      resolveModelTarget("doc", { modelRef: model.id }).spec.dataFile
    ).toBe("PP-DocLayoutV3.onnx.data");
    expect(() =>
      resolveModelTarget("doc", {
        modelRef: model.id,
        loadSpec: { dataFile: "other" },
      })
    ).toThrow("不一致");
  });
});
