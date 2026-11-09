import { sha256 } from "../libs/utils";
/** Only normalized execution content participates; GitHub's outer folder and ZIP bytes do not. */
export const packageFingerprint = (pack) =>
  sha256(
    JSON.stringify([
      pack.manifest,
      pack.implementations,
      ...(pack.resources ? [pack.resources] : []),
      ...(pack.icon ? [pack.icon] : []),
    ])
  );
