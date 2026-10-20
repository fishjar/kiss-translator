import { hasCompleteCoordinates } from "./recognition";

const check = (signal) => {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
};
const polygon = ([left, top, right, bottom]) => [
  [left, top],
  [right, top],
  [right, bottom],
  [left, bottom],
];
const bounds = (poly) =>
  poly.reduce(
    ([left, top, right, bottom], [x, y]) => [
      Math.min(left, x),
      Math.min(top, y),
      Math.max(right, x),
      Math.max(bottom, y),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
const area = ([left, top, right, bottom]) =>
  Math.max(0, right - left) * Math.max(0, bottom - top);
const validSize = (size) =>
  Number.isFinite(size?.width) &&
  size.width > 0 &&
  Number.isFinite(size?.height) &&
  size.height > 0;

function regionsForImage(layout, size) {
  if (!validSize(layout?.imageSize) || !validSize(size)) return [];
  const sx = size.width / layout.imageSize.width;
  const sy = size.height / layout.imageSize.height;
  const clamp = (value, axis) =>
    Math.max(0, Math.min(axis % 2 ? size.height : size.width, value));
  const order = new Map(
    (layout.readingOrder || []).map((id, index) => [id, index])
  );
  return (layout.regions || [])
    .map((region, index) => {
      const box = region.bbox.map((value, axis) =>
        clamp(value * (axis % 2 ? sy : sx), axis)
      );
      return {
        box,
        type: region.type,
        label: region.label,
        poly:
          region.polygon?.length >= 3
            ? region.polygon.map(([x, y]) => [
                clamp(x * sx, 0),
                clamp(y * sy, 1),
              ])
            : polygon(box),
        order: order.get(region.id) ?? region.order ?? index,
      };
    })
    .filter((region) => area(region.box) > 0)
    .sort((a, b) => a.order - b.order);
}

// OCR coordinates describe lines; layout coordinates describe translation units.
export function groupImageTextByLayout(recognized, layout) {
  const regions = regionsForImage(layout, recognized.imageSize);
  if (!regions.length) return { ...recognized, layoutApplied: false };
  const groups = regions.map(() => []);
  const unmatched = [];
  for (const item of recognized.items || []) {
    if (!item.text?.trim()) continue;
    if (!hasCompleteCoordinates([item])) {
      unmatched.push(item);
      continue;
    }
    const box = bounds(item.poly);
    let best = -1,
      overlap = 0;
    regions.forEach((region, index) => {
      const intersection =
        area([
          Math.max(box[0], region.box[0]),
          Math.max(box[1], region.box[1]),
          Math.min(box[2], region.box[2]),
          Math.min(box[3], region.box[3]),
        ]) / area(box);
      if (
        intersection >= 0.5 &&
        (intersection > overlap ||
          (intersection === overlap &&
            area(region.box) <
              area(regions[best]?.box || [0, 0, Infinity, Infinity])))
      ) {
        best = index;
        overlap = intersection;
      }
    });
    if (best < 0) unmatched.push(item);
    else groups[best].push(item);
  }
  const items = groups.flatMap((group, index) => {
    if (!group.length) return [];
    group.sort((a, b) => {
      const aa = bounds(a.poly),
        bb = bounds(b.poly);
      // Sort words on the same line left-to-right, then lines top-to-bottom.
      return Math.abs(aa[1] - bb[1]) <
        Math.min(aa[3] - aa[1], bb[3] - bb[1]) / 2
        ? aa[0] - bb[0]
        : aa[1] - bb[1];
    });
    return [
      {
        text: group
          .map((item) => item.text.trim())
          .join(" ")
          .replace(/([\u3400-\u9fff]) (?=[\u3400-\u9fff])/g, "$1"),
        poly: regions[index].poly,
        box: regions[index].box,
        type: regions[index].type,
        label: regions[index].label,
      },
    ];
  });
  // Never discard text missed by the layout detector or lacking coordinates.
  items.push(...unmatched);
  return {
    ...recognized,
    items,
    text: items.map((item) => item.text).join("\n\n"),
  };
}

export async function recognizeImageWithLayout(
  file,
  { client, selection, layoutApi, coordinates, signal, ...options }
) {
  const layout = await client.analyzeLayout(
    file,
    layoutApi.modelRef,
    layoutApi.device || "wasm",
    signal,
    layoutApi.apiSlug,
    options.cacheMode
  );
  check(signal);
  if (coordinates || !validSize(layout?.imageSize) || !layout.regions?.length) {
    const recognized = await client.recognize(file, selection, signal, options);
    check(signal);
    return groupImageTextByLayout(recognized, layout);
  }
  // Text-only services cannot map a whole-image response back to layout regions.
  const image = await createImageBitmap(file);
  try {
    const regions = regionsForImage(layout, image);
    if (!regions.length) {
      check(signal);
      const recognized = await client.recognize(
        file,
        selection,
        signal,
        options
      );
      check(signal);
      return { ...recognized, layoutApplied: false };
    }
    const items = [],
      inputAdjustments = [];
    for (const region of regions) {
      check(signal);
      const [left, top, right, bottom] = region.box;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(right - left));
      canvas.height = Math.max(1, Math.ceil(bottom - top));
      canvas
        .getContext("2d")
        .drawImage(
          image,
          left,
          top,
          right - left,
          bottom - top,
          0,
          0,
          canvas.width,
          canvas.height
        );
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("图片区域裁剪失败")),
          "image/png"
        )
      );
      check(signal);
      const result = await client.recognize(blob, selection, signal, options);
      check(signal);
      if (result.text?.trim())
        items.push({
          text: result.text.trim(),
          poly: region.poly,
          box: region.box,
          type: region.type,
          label: region.label,
        });
      inputAdjustments.push(...(result.inputAdjustments || []));
    }
    return {
      imageSize: { width: image.width, height: image.height },
      items,
      text: items.map((item) => item.text).join("\n\n"),
      inputAdjustments,
    };
  } finally {
    image.close();
  }
}
