import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

function itemAt(offsets, position) {
  let first = 0;
  let last = offsets.length - 1;
  while (first < last) {
    const middle = Math.floor((first + last + 1) / 2);
    if (offsets[middle] <= position) first = middle;
    else last = middle - 1;
  }
  return Math.min(first, Math.max(0, offsets.length - 2));
}

export function useDocumentWindow(
  count,
  scrollRef,
  contentRef,
  estimate,
  overscan = 1,
  {
    frameUpdates = false,
    retainAdjacent = false,
    documentKey,
    layoutKey,
    resetScroll = true,
  } = {}
) {
  const committed = useRef(null);
  const measurements = useMemo(() => {
    const previous = committed.current?.measurements;
    return {
      // Keep the last heights as estimates until the mounted items are measured again.
      measured: new Map(
        previous?.documentKey === documentKey ? previous?.measured : undefined
      ),
      changes: new Map(),
      documentKey,
      layoutKey,
    };
  }, [documentKey, layoutKey]);
  const { measured, changes } = measurements;
  const [revision, setRevision] = useState(0);
  const [viewport, setViewport] = useState({ start: 0, end: 600 });
  const offsets = useMemo(() => {
    const result = [0];
    for (let index = 0; index < count; index++)
      result.push(result[index] + (measured.get(index) || estimate));
    return result;
    // The revision invalidates the memo when a measurement changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, estimate, revision, measured]);
  const axis = useRef({ offsets, start: 0 });
  const frame = useRef(null);
  const settle = useRef(null);
  const scrollAdjustment = useRef(0);
  const pinned = useRef(null);
  const finishingJump = useRef(false);
  const scrolling = useRef(false);
  if (!committed.current) committed.current = { measurements, offsets };
  const currentMeasurements = useRef(measurements);
  currentMeasurements.current = measurements;
  axis.current.offsets = offsets;
  const update = useCallback(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content || pinned.current !== null) return;
    const start =
      scroll.getBoundingClientRect().top - content.getBoundingClientRect().top;
    axis.current.start = start;
    const end = start + (scroll.clientHeight || 600);
    const moved = scrolling.current;
    scrolling.current = false;
    setViewport((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      const current = axis.current.offsets;
      let retained = prev.retained;
      if (retainAdjacent && moved) {
        const before = itemAt(current, prev.start) - overscan;
        const after = itemAt(current, prev.end) + overscan;
        const nextBefore = itemAt(current, start) - overscan;
        const nextAfter = itemAt(current, end) + overscan;
        if (start > prev.start && before < nextBefore)
          retained = nextBefore - 1;
        if (start < prev.start && after > nextAfter) retained = nextAfter + 1;
        if (nextBefore > after + 1 || nextAfter < before - 1)
          retained = undefined;
      }
      return { start, end, retained };
    });
  }, [scrollRef, contentRef, overscan, retainAdjacent]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    const generation = currentMeasurements.current;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (currentMeasurements.current !== generation) return;
      const positioned = finishingJump.current;
      finishingJump.current = false;
      const { measured, changes: pending } = generation;
      if (pending.size) {
        const { offsets: currentOffsets } = axis.current;
        const scroll = scrollRef.current;
        const content = contentRef.current;
        const start =
          scroll && content
            ? scroll.getBoundingClientRect().top -
              content.getBoundingClientRect().top
            : axis.current.start;
        let adjustment = 0;
        for (const [index, height] of pending) {
          const previous = measured.get(index) || estimate;
          measured.set(index, height);
          // scrollTop can be rounded while a chapter edge is fractional.
          if (
            pinned.current === null &&
            !positioned &&
            currentOffsets[index + 1] <= start + 1 &&
            start < currentOffsets.at(-1)
          )
            adjustment += height - previous;
        }
        pending.clear();
        scrollAdjustment.current += adjustment;
        setRevision((value) => value + 1);
        if (adjustment) return;
      }
      update();
    });
  }, [estimate, scrollRef, contentRef, update]);
  useLayoutEffect(() => {
    const previous = committed.current;
    committed.current = { measurements, offsets };
    if (previous.measurements === measurements) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    clearTimeout(settle.current);
    scrollAdjustment.current = 0;
    scrolling.current = false;
    setViewport((view) => ({ ...view, retained: undefined }));
    const scroll = scrollRef.current;
    if (previous.measurements.documentKey !== documentKey) {
      pinned.current = null;
      if (scroll && resetScroll) scroll.scrollTop = 0;
      axis.current.start = 0;
      setViewport({ start: 0, end: scroll?.clientHeight || 600 });
    } else if (scroll && pinned.current === null && count) {
      const start = axis.current.start;
      const index = Math.min(itemAt(previous.offsets, start), count - 1);
      const within = Math.max(0, start - previous.offsets[index]);
      const next =
        offsets[index] +
        Math.min(within, offsets[index + 1] - offsets[index] - 1);
      scroll.scrollTop += next - start;
    }
    if (changes.size) schedule();
    update();
  }, [
    measurements,
    offsets,
    documentKey,
    count,
    scrollRef,
    update,
    changes,
    schedule,
    resetScroll,
  ]);
  useLayoutEffect(() => {
    const adjustment = scrollAdjustment.current;
    scrollAdjustment.current = 0;
    if (adjustment && scrollRef.current) {
      // The new placeholders must be on screen before scrollTop is clamped.
      scrollRef.current.scrollTop += adjustment;
      update();
    }
  }, [offsets, scrollRef, update]);
  useLayoutEffect(() => {
    update();
    const scroll = scrollRef.current;
    if (!scroll) return;
    const onScroll = () => {
      if (!frameUpdates) return update();
      scrolling.current = true;
      schedule();
      if (!retainAdjacent) return;
      clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        setViewport((prev) =>
          prev.retained === undefined ? prev : { ...prev, retained: undefined }
        );
      }, 150);
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    const observer =
      typeof ResizeObserver === "function" &&
      new ResizeObserver(frameUpdates ? schedule : update);
    observer && observer.observe(scroll);
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      observer && observer.disconnect();
    };
  }, [update, scrollRef, count, frameUpdates, retainAdjacent, schedule]);
  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      clearTimeout(settle.current);
    },
    []
  );

  const measure = useCallback(
    (index, height) => {
      if (height <= 0 || currentMeasurements.current !== measurements) return;
      const previous = measured.get(index) || estimate;
      if (frameUpdates) {
        if (previous !== height || changes.has(index)) {
          changes.set(index, height);
          schedule();
        }
        return;
      }
      if (previous === height) return;
      measured.set(index, height);
      const { offsets, start } = axis.current;
      if (
        pinned.current === null &&
        offsets[index + 1] <= start &&
        scrollRef.current
      )
        scrollRef.current.scrollTop += height - previous;
      setRevision((value) => value + 1);
    },
    [
      estimate,
      scrollRef,
      frameUpdates,
      schedule,
      measurements,
      measured,
      changes,
    ]
  );

  const jump = useCallback(
    (index, { pin = false } = {}) => {
      const scroll = scrollRef.current;
      const content = contentRef.current;
      const next = axis.current.offsets[index];
      if (!scroll || !content || next === undefined) return;
      clearTimeout(settle.current);
      scrolling.current = false;
      scrollAdjustment.current = 0;
      finishingJump.current = false;
      pinned.current = pin ? index : null;
      scroll.scrollTop +=
        next +
        content.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top;
      setViewport({ start: next, end: next + (scroll.clientHeight || 600) });
    },
    [scrollRef, contentRef]
  );
  const finishJump = useCallback(() => {
    // The mounted destination has already determined the scroll position.
    finishingJump.current ||= pinned.current !== null;
    pinned.current = null;
    schedule();
  }, [schedule]);

  const sameDocument =
    committed.current.measurements.documentKey === documentKey;
  const viewStart = sameDocument
    ? (offsets[pinned.current] ?? viewport.start)
    : 0;
  const viewEnd = viewStart + viewport.end - viewport.start;
  const visibleStart = itemAt(offsets, viewStart);
  const first = visibleStart - overscan;
  const last = itemAt(offsets, viewEnd) + overscan;
  const start = Math.max(
    0,
    viewport.retained === first - 1 ? first - 1 : first
  );
  const end = Math.min(
    count,
    viewport.retained === last + 1 ? last + 2 : last + 1
  );
  return {
    start,
    end,
    visibleStart,
    before: offsets[start],
    after: offsets[count] - offsets[end],
    measure,
    jump,
    finishJump,
  };
}

export function useMeasuredDocumentItem(ref, index, measure, box) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => measure(index, element.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(update);
    observer.observe(element, box ? { box } : undefined);
    return () => observer.disconnect();
  }, [ref, index, measure, box]);
}
