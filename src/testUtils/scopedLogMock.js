/* global jest */
/** Keep existing spies while exercising callers migrated to scoped loggers. */
export function withScopedLogMock(mock) {
  const descriptor = Object.getOwnPropertyDescriptor(mock, "logger");
  const fallback = {};
  Object.defineProperty(mock, "logger", {
    enumerable: true,
    configurable: true,
    get() {
      // Some factories defer the spy until imports have completed (TDZ).
      const supplied = descriptor?.get
        ? descriptor.get()
        : descriptor?.value || fallback;
      const logger =
        Object.getPrototypeOf(supplied) === Object.prototype
          ? supplied
          : fallback;
      for (const level of ["debug", "info", "warn", "error"])
        logger[level] ||= mock.kissLog || jest.fn();
      logger.child ||= () => logger;
      logger.event ||= (level, event, context, error) =>
        logger[level](event, context, error);
      return logger;
    },
  });
  return mock;
}
