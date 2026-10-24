import browser from "webextension-polyfill";
import { CLIENT_CHROME, CLIENT_EDGE, CLIENT_FIREFOX } from "../config/client";
import { logger } from "./log";

const ID = "kiss-youtube-subtitle-bridge";
let pending;

// Uses existing scripting/host permissions; foreground injection remains the fallback.
export function ensureYoutubeBridgeRegistered() {
  const client = process.env.REACT_APP_CLIENT;
  if (![CLIENT_CHROME, CLIENT_EDGE, CLIENT_FIREFOX].includes(client))
    return Promise.resolve(false);
  if (pending) return pending;

  let phase = "capability";
  pending = Promise.resolve()
    .then(async () => {
      const scripting = browser.scripting;
      if (
        typeof scripting?.getRegisteredContentScripts !== "function" ||
        typeof scripting?.registerContentScripts !== "function"
      ) {
        logger.child("youtube-bridge-registration").warn("YouTube subtitle registration", {
          phase,
          code: "UNSUPPORTED",
        });
        return false;
      }
      const definition = {
        id: ID,
        matches: ["https://www.youtube.com/*"],
        js: [
          client === CLIENT_FIREFOX
            ? "subtitle-bootstrap.js"
            : "injector-subtitle.js",
        ],
        runAt: "document_start",
        allFrames: false,
        persistAcrossSessions: true,
        ...(client === CLIENT_FIREFOX ? {} : { world: "MAIN" }),
      };
      phase = "query";
      const scripts = await scripting.getRegisteredContentScripts({
        ids: [ID],
      });
      const current = scripts.find((script) => script.id === ID);
      if (!current) {
        phase = "register";
        await scripting.registerContentScripts([definition]);
      } else {
        const same =
          JSON.stringify(current.matches) ===
            JSON.stringify(definition.matches) &&
          JSON.stringify(current.js) === JSON.stringify(definition.js) &&
          current.runAt === definition.runAt &&
          (current.allFrames ?? false) === false &&
          (current.persistAcrossSessions ?? true) === true &&
          (current.world || "ISOLATED") === (definition.world || "ISOLATED");
        if (same) return true;
        phase = "update";
        if (typeof scripting.updateContentScripts !== "function") {
          logger.child("youtube-bridge-registration").warn("YouTube subtitle registration", {
            phase,
            code: "UNSUPPORTED",
          });
          return false;
        }
        await scripting.updateContentScripts([definition]);
      }
      return true;
    })
    .catch(() => {
      // Browser errors may contain URLs; log only the operation and a fixed category.
      logger.child("youtube-bridge-registration").warn("YouTube subtitle registration", {
        phase,
        code: "REGISTRATION_FAILED",
      });
      return false;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
