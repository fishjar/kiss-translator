// The extension UI uses the remote host. In-page inference is bundled only in offscreen.js.
export function getInPageRuntimeManager() {
  throw new Error(
    "In-page local AI runtime is unavailable in extension settings"
  );
}
