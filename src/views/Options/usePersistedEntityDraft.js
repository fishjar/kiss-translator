import { useCallback, useLayoutEffect, useRef, useState } from "react";

function normalizeEntity(entity) {
  return entity ?? {};
}

function areEntitiesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      areEntitiesEqual(left[key], right[key])
  );
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function rebaseLocalChanges(baseline, draft, persisted) {
  if (areEntitiesEqual(baseline, draft)) return persisted;
  if (!isPlainObject(baseline) || !isPlainObject(draft)) return draft;

  const next = isPlainObject(persisted) ? { ...persisted } : {};
  const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
  keys.forEach((key) => {
    const baselineHasKey = Object.prototype.hasOwnProperty.call(baseline, key);
    const draftHasKey = Object.prototype.hasOwnProperty.call(draft, key);
    if (
      baselineHasKey === draftHasKey &&
      areEntitiesEqual(baseline[key], draft[key])
    ) {
      return;
    }
    if (!draftHasKey) {
      delete next[key];
      return;
    }
    next[key] = rebaseLocalChanges(
      baselineHasKey ? baseline[key] : undefined,
      draft[key],
      next[key]
    );
  });
  return next;
}

/**
 * Keeps an editor draft separate from incoming persisted snapshots.
 * Clean drafts follow persisted changes, while dirty drafts are rebased onto
 * the latest persisted entity.
 */
export function usePersistedEntityDraft(
  entity,
  entityIdentity,
  normalize = normalizeEntity
) {
  const persistedEntity = normalize(entity);
  const identityRef = useRef(entityIdentity);
  const [baseline, setBaseline] = useState(() => persistedEntity);
  const [draft, setDraft] = useState(() => persistedEntity);

  useLayoutEffect(() => {
    if (identityRef.current !== entityIdentity) {
      identityRef.current = entityIdentity;
      setBaseline(persistedEntity);
      setDraft(persistedEntity);
      return;
    }

    if (areEntitiesEqual(baseline, persistedEntity)) return;

    const hasLocalChanges = !areEntitiesEqual(baseline, draft);
    setBaseline(persistedEntity);
    if (hasLocalChanges) {
      setDraft(rebaseLocalChanges(baseline, draft, persistedEntity));
    } else {
      setDraft(persistedEntity);
    }
  }, [baseline, draft, entityIdentity, persistedEntity]);

  const discardDraft = useCallback(() => {
    setBaseline(persistedEntity);
    setDraft(persistedEntity);
  }, [persistedEntity]);

  return {
    draft,
    setDraft,
    discardDraft,
    isDirty: !areEntitiesEqual(baseline, draft),
  };
}
