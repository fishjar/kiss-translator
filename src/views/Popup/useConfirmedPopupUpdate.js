import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Confirm only the changed fields, without replacing concurrent local edits. */
export function useConfirmedPopupUpdate({ value, setValue, onError }) {
  const confirmedRef = useRef({ ...value });
  const pendingRef = useRef({});
  const confirmedVersionsRef = useRef({});
  const sequenceRef = useRef(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    for (const name of Object.keys(value || {})) {
      if (!pendingRef.current[name]) confirmedRef.current[name] = value[name];
    }
  }, [value]);

  return useCallback(
    async (values, sendUpdate) => {
      const sequence = ++sequenceRef.current;
      const names = Object.keys(values);
      for (const name of names) pendingRef.current[name] = sequence;
      setValue((previous) => ({ ...previous, ...values }));

      let confirmed;
      let failure;
      try {
        confirmed = await sendUpdate();
      } catch (error) {
        failure = error;
      }
      if (!activeRef.current) return;

      // A readback can reveal a rejected/normalized value. Prefer that actual
      // state to the pre-action snapshot, and never apply an older operation
      // over a newer edit of the same field.
      const settledValues = {};
      let reportFailure = false;
      for (const name of names) {
        const hasNewConfirmation =
          confirmed &&
          Object.prototype.hasOwnProperty.call(confirmed, name) &&
          confirmed[name] !== undefined &&
          (confirmedVersionsRef.current[name] || 0) <= sequence;
        if (hasNewConfirmation) {
          confirmedRef.current[name] = confirmed[name];
          confirmedVersionsRef.current[name] = sequence;
        }
        if (pendingRef.current[name] === sequence) {
          delete pendingRef.current[name];
          // A newer edit may explain another field's mismatched readback.
          // Only reject fields that this request still owns.
          if (failure || !confirmed || confirmed[name] !== values[name]) {
            settledValues[name] = confirmedRef.current[name];
            reportFailure = true;
          }
        } else if (!pendingRef.current[name] && hasNewConfirmation) {
          // A newer request may have failed before this older one completed.
          // Its eventual confirmed state is the best available page snapshot.
          settledValues[name] = confirmedRef.current[name];
        }
      }
      if (Object.keys(settledValues).length) {
        setValue((previous) => ({ ...previous, ...settledValues }));
      }
      if (reportFailure) {
        onError(
          failure ||
            new Error("Page state did not confirm the requested update")
        );
      }
    },
    [onError, setValue]
  );
}
