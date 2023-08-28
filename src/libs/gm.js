export const injectScript = ({ eventName }) => {
  window.callGM = ({ action, args }, timeout = 5000) =>
    new Promise((resolve, reject) => {
      const handleEvent = (e) => {
        window.removeEventListener(eventName + "_pong", handleEvent);
        const { data, error } = e.detail;
        if (error) {
          reject(new Error(error));
        } else {
          resolve(data);
        }
      };

      window.addEventListener(eventName + "_pong", handleEvent);
      window.dispatchEvent(
        new CustomEvent(eventName + "_ping", { action, args })
      );

      setTimeout(() => {
        handleEvent({ detail: { error: "timeout" } });
      }, timeout);
    });
};
