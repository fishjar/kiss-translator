import { useEffect, useState } from "react";
import LocalServiceNotice from "./LocalServiceNotice";
import { openOptionsPage } from "../libs/navigation";

/** Subscribe to model state only in extension settings. */
export default function ExtensionLocalServiceNotice({
  apis = [],
  models,
  onDownload = () => openOptionsPage("/local-ai"),
  ...props
}) {
  const [records, setRecords] = useState(null);
  const hasLocal = apis.some((api) => api?.apiType === "LocalAI");
  useEffect(() => {
    if (!hasLocal || models !== undefined) return;
    let active = true;
    let unsubscribe;
    import("../localAi/core/modelManager")
      .then(async ({ sharedModelManager: manager }) => {
        if (!active) return;
        const refresh = () => {
          if (active)
            setRecords(
              manager.list().map((record) => ({
                id: record.manifest.id,
                state: record.state,
              }))
            );
        };
        unsubscribe = manager.subscribe(refresh);
        await manager.init();
        refresh();
      })
      .catch(() => {
        if (active) setRecords(null);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [hasLocal, models]);

  const available = models === undefined ? records : models;
  return (
    <LocalServiceNotice
      {...props}
      apis={apis}
      models={available}
      onDownload={onDownload}
    />
  );
}
