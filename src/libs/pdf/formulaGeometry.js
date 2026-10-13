export const formulaContainsSpan = (span, formula) => {
  const area = Math.max(0, span[2] - span[0]) * Math.max(0, span[3] - span[1]);
  const overlap = Math.max(0, Math.min(span[2], formula[2]) - Math.max(span[0], formula[0])) *
    Math.max(0, Math.min(span[3], formula[3]) - Math.max(span[1], formula[1]));
  return area > 0 && overlap / area >= 0.8;
};

export const regionContainsText = (box, region) => {
  const x = (box[0] + box[2]) / 2, y = (box[1] + box[3]) / 2;
  return (x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3]) ||
    formulaContainsSpan(box, region);
};

export function textRegion(box, regions) {
  const rank = (region) => region.type === "formula_number" ? 0 :
    ["formula", "inline-formula"].includes(region.type) ? 1 : 2;
  const area = (region) => (region.bbox[2] - region.bbox[0]) * (region.bbox[3] - region.bbox[1]);
  return regions.filter((region) => regionContainsText(box, region.bbox))
    .sort((a, b) => rank(a) - rank(b) || area(a) - area(b))[0];
}

export const sourceAnchor = (page, region) => region && !region.paragraphFallback && ({
  id: `p${page}:${encodeURIComponent(String(region.id))}`,
  page, regionId: region.id, type: region.type, bbox: [...region.bbox],
});
