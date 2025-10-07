import { genEventName } from "../libs/utils";
import { MSG_GLOBAL_VAR_BACK, MSG_GLOBAL_VAR_FETCH } from "../config";

export function getGlobalVariable(varName, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const requestId = genEventName();
    let timeoutId = null;

    const responseHandler = (event) => {
      if (
        event.source === window &&
        event.data &&
        event.data.type === MSG_GLOBAL_VAR_BACK &&
        event.data.requestId === requestId
      ) {
        clearTimeout(timeoutId);
        window.removeEventListener("message", responseHandler);
        resolve(event.data.payload);
      }
    };

    window.addEventListener("message", responseHandler);

    timeoutId = setTimeout(() => {
      window.removeEventListener("message", responseHandler);
      reject(new Error(`Read "${varName}" timeout: ${timeout}ms`));
    }, timeout);

    window.postMessage(
      {
        type: MSG_GLOBAL_VAR_FETCH,
        varName: varName,
        requestId: requestId,
      },
      window.location.origin
    );
  });
}
