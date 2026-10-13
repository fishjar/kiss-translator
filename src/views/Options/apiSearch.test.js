import { supportsApiSearchTarget } from "./apiSearch";
import {
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_YANDEX,
  OPT_TRANS_BUILTINAI,
} from "../../config";

test.each([
  [OPT_TRANS_MICROSOFT, "http_timeout", true],
  [OPT_TRANS_MICROSOFT, "api_model", false],
  [OPT_TRANS_MICROSOFT, "use_stream", false],
  [OPT_TRANS_OPENAI, "api_model", true],
  [OPT_TRANS_OPENAI, "use_stream", true],
  [OPT_TRANS_OPENAI, "api_region", false],
  [OPT_TRANS_AZUREAI, "api_region", true],
  [OPT_TRANS_YANDEX, "api_folder_id", true],
  [OPT_TRANS_BUILTINAI, "api_key", false],
  [OPT_TRANS_BUILTINAI, "custom_header", false],
])(
  "selects a compatible service for %s field %s",
  (apiType, target, supported) => {
    expect(supportsApiSearchTarget({ apiType }, target)).toBe(supported);
  }
);
