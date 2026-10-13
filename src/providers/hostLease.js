let active = 0;

export function acquireProviderHost() {
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active--;
  };
}

export function providerHostBusy() {
  return active > 0;
}
