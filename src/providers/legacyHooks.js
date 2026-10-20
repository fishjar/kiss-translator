import { getInterpreter } from "../libs/interpreter";
import { NATIVE_PRESET_OVERRIDES } from "../builtin-plugins/presets";
import { OPT_TRANS_CUSTOMIZE } from "../config/apiConstants";

// Only explicitly saved legacy user Hooks reach this adapter. Compiled vendor
// handlers and new script plugins do not create a second interpreter layer.
// Retain the shared legacy interpreter because existing Hooks may keep state
// between their request and response; new plugins own fresh task Workers instead.
export async function callLegacyRequestHook(source, args, request) {
  // The shipped instructional template only logs and returns undefined.
  // Preserve that behavior in compiled code; only edited user code needs Sval.
  if (source === NATIVE_PRESET_OVERRIDES[OPT_TRANS_CUSTOMIZE].reqHook) {
    const { url, body, headers, userMsg, method } = request;
    console.log("request hook args:", {
      args,
      url,
      body,
      headers,
      userMsg,
      method,
    });
    return;
  }
  const interpreter = await getInterpreter();
  interpreter.run(`exports.reqHook = ${source}`);
  return interpreter.exports.reqHook(args, request);
}

export async function callLegacyResponseHook(source, args) {
  if (source === NATIVE_PRESET_OVERRIDES[OPT_TRANS_CUSTOMIZE].resHook) {
    const { res, ...rest } = args;
    console.log("response hook args:", { res, args: rest });
    return;
  }
  const interpreter = await getInterpreter();
  interpreter.run(`exports.resHook = ${source}`);
  return interpreter.exports.resHook(args);
}
