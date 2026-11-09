/** Preserves [DONE] and event names for provider parsers. Handles split CRLF. */
export function createSSEParser() {
  let buffer = "";
  let previousCR = false;
  return {
    push(chunk) {
      for (const character of chunk) {
        if (character === "\n" && previousCR) {
          previousCR = false;
          continue;
        }
        previousCR = character === "\r";
        buffer += previousCR ? "\n" : character;
      }
      const events = [];
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const lines = buffer.slice(0, boundary).split("\n");
        buffer = buffer.slice(boundary + 2);
        const data = [];
        let event = "message";
        for (const line of lines) {
          if (line.startsWith(":")) continue;
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          let value = colon < 0 ? "" : line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "data") data.push(value);
          if (field === "event") event = value;
        }
        if (data.length) events.push({ event, data: data.join("\n") });
      }
      return events;
    },
    finish() {
      if (buffer.trim() && !buffer.trim().startsWith(":"))
        throw new Error("Incomplete SSE frame.");
    },
  };
}
