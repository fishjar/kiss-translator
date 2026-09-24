import { STOKEY_WORDS, STOKEY_SYNC, KV_WORDS_KEY } from "../config";

jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));
jest.mock("./gm", () => ({
  getGmMethod: () => {
    throw new Error("The extension test must not access GM storage");
  },
}));

function createEvent() {
  const listeners = new Set();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => [...listeners].forEach((listener) => listener(...args)),
  };
}

function createRuntime() {
  const values = {};
  const onChanged = createEvent();
  const runtime = {
    values,
    onConnect: createEvent(),
    storage: {
      onChanged,
      local: {
        get: jest.fn(async (keys) =>
          Object.fromEntries(
            keys.filter((key) => key in values).map((key) => [key, values[key]])
          )
        ),
        set: jest.fn(async (entries) => {
          const changes = Object.fromEntries(
            Object.entries(entries).map(([key, newValue]) => [
              key,
              { oldValue: values[key], newValue },
            ])
          );
          Object.assign(values, entries);
          if (!runtime.pauseEvents) onChanged.emit(changes, "local");
        }),
        remove: jest.fn(async (keys) => {
          keys.forEach((key) => delete values[key]);
        }),
      },
    },
  };
  runtime.connect = ({ name }) => {
    let disconnected = false;
    const front = {
      name,
      onMessage: createEvent(),
      onDisconnect: createEvent(),
    };
    const back = {
      name,
      onMessage: createEvent(),
      onDisconnect: createEvent(),
    };
    const disconnect = () => {
      if (disconnected) return;
      disconnected = true;
      front.onDisconnect.emit(front);
      back.onDisconnect.emit(back);
    };
    front.disconnect = disconnect;
    back.disconnect = disconnect;
    front.postMessage = (message) => {
      if (disconnected) throw new Error("Port disconnected");
      Promise.resolve().then(() => {
        if (!disconnected) back.onMessage.emit(message, back);
      });
    };
    back.postMessage = (message) => {
      if (disconnected) throw new Error("Port disconnected");
      Promise.resolve().then(() => {
        if (!disconnected) front.onMessage.emit(message, front);
      });
    };
    Promise.resolve().then(() => runtime.onConnect.emit(back));
    return front;
  };
  return runtime;
}

function loadContext(runtime, background = false) {
  let context;
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({ isExt: true, isGm: false }));
    jest.doMock("./browser", () => ({
      browser: { runtime, storage: runtime.storage },
      isBg: () => background,
    }));
    context = {
      ...require("./storageCoordination"),
      ...require("./storage"),
      ...require("./storageState"),
      ...require("../subtitle/favoriteWords"),
    };
  });
  return context;
}

let cleanups;

beforeEach(() => {
  cleanups = [];
  jest.spyOn(Date, "now").mockReturnValue(300);
});

afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  jest.restoreAllMocks();
  jest.dontMock("./client");
  jest.dontMock("./browser");
});

async function setup() {
  const runtime = createRuntime();
  runtime.values[STOKEY_WORDS] = JSON.stringify({ original: {} });
  const background = loadContext(runtime, true);
  background.installStorageCoordinator();
  const first = loadContext(runtime);
  const second = loadContext(runtime);
  return { runtime, first, second };
}

async function mountState(page) {
  const state = page.getStorageState(STOKEY_WORDS, {});
  state.configureSync(KV_WORDS_KEY);
  cleanups.push(state.subscribe(() => {}));
  await state.ensureLoaded();
  return state;
}

test("two independent page states preserve sequential edits to different words", async () => {
  const { runtime, first, second } = await setup();
  runtime.pauseEvents = true;
  const firstState = await mountState(first);
  const secondState = await mountState(second);
  expect(firstState).not.toBe(secondState);
  await firstState.save((previous) => ({ ...previous, first: {} }));
  expect(await first.getWords()).toEqual({ original: {}, first: {} });
  await secondState.save((previous) => ({ ...previous, second: {} }));
  const actual = await second.getWords();
  expect(runtime.storage.local.set).toHaveBeenCalledTimes(2);
  expect(actual).toEqual({ original: {}, first: {}, second: {} });
  expect(secondState.snapshot.data).toEqual(actual);
});

test("control: a single page state preserves both sequential edits", async () => {
  const { first } = await setup();
  const state = await mountState(first);
  await state.save((previous) => ({ ...previous, first: {} }));
  await state.save((previous) => ({ ...previous, second: {} }));
  expect(await first.getWords()).toEqual({
    original: {},
    first: {},
    second: {},
  });
});

test("control: independent pages passing updater functions directly to saveEdit preserve both edits", async () => {
  const { first, second } = await setup();
  await first.saveEdit(
    STOKEY_WORDS,
    (previous) => ({ ...previous, first: {} }),
    KV_WORDS_KEY
  );
  await second.saveEdit(
    STOKEY_WORDS,
    (previous) => ({ ...previous, second: {} }),
    KV_WORDS_KEY
  );
  expect(await second.getWords()).toEqual({
    original: {},
    first: {},
    second: {},
  });
});

test("concurrent independent page reducers merge against the coordinated value", async () => {
  const { runtime, first, second } = await setup();
  runtime.pauseEvents = true;
  const firstState = await mountState(first);
  const secondState = await mountState(second);
  await Promise.all([
    firstState.save((previous) => ({ ...previous, first: {} })),
    secondState.save((previous) => ({ ...previous, second: {} })),
  ]);
  expect(await first.getWords()).toEqual({
    original: {},
    first: {},
    second: {},
  });
  expect(secondState.snapshot.data).toEqual({
    original: {},
    first: {},
    second: {},
  });
});

test("a storage change refreshes another mounted page without a manual reload", async () => {
  const { first, second } = await setup();
  const firstState = await mountState(first);
  const secondState = await mountState(second);
  await firstState.save((previous) => ({ ...previous, first: {} }));
  let stop;
  const observed = new Promise((resolve) => {
    stop = firstState.subscribe(({ data }) => {
      if (data?.second) resolve(data);
    });
  });
  cleanups.push(() => stop());
  await secondState.save((previous) => ({ ...previous, second: {} }));
  expect(await observed).toEqual({ original: {}, first: {}, second: {} });
});

test("an explicit replacement is checked against storage rather than a stale preview", async () => {
  const { runtime, first, second } = await setup();
  runtime.pauseEvents = true;
  const firstState = await mountState(first);
  const secondState = await mountState(second);
  await firstState.save((previous) => ({ ...previous, first: {} }));
  const result = await secondState.save({ original: {} });
  expect(result.changed).toBe(true);
  expect(await second.getWords()).toEqual({ original: {} });
});

test("favorite completion includes a single data and metadata commit", async () => {
  const { runtime, first } = await setup();
  runtime.values[STOKEY_SYNC] = JSON.stringify({
    syncMeta: { [KV_WORDS_KEY]: { updateAt: 100, syncAt: 110 } },
  });
  expect(
    await first.saveFavoriteWordIfMissing("first", { definition: "first word" })
  ).toBe(true);
  expect((await first.getSync()).syncMeta[KV_WORDS_KEY].updateAt).toBe(300);
  expect(runtime.storage.local.set).toHaveBeenCalledTimes(1);
  expect(
    Object.keys(runtime.storage.local.set.mock.calls[0][0]).sort()
  ).toEqual([STOKEY_WORDS, STOKEY_SYNC].sort());
});

test("an explicit removal remains null after real storage invalidations", async () => {
  const { first } = await setup();
  const state = await mountState(first);
  await state.remove();
  await state.load();
  expect(await first.getWords()).toBeNull();
  expect(state.snapshot.data).toBeNull();
  expect(state.dirty).toBe(false);
});

test("hydration waits for a replacement read when an event invalidates its first read", async () => {
  const { runtime, first } = await setup();
  let releaseFirstRead;
  const firstRead = new Promise((resolve) => {
    releaseFirstRead = resolve;
  });
  const getValues = runtime.storage.local.get.getMockImplementation();
  let reads = 0;
  runtime.storage.local.get.mockImplementation(async (keys) => {
    const values = await getValues(keys);
    if (keys.includes(STOKEY_WORDS) && reads++ === 0) await firstRead;
    return values;
  });
  const state = first.getStorageState(STOKEY_WORDS, {});
  cleanups.push(state.subscribe(() => {}));
  const hydrated = state.ensureLoaded();
  for (let step = 0; step < 20; step += 1) await Promise.resolve();
  runtime.values[STOKEY_WORDS] = JSON.stringify({ latest: {} });
  runtime.storage.onChanged.emit({ [STOKEY_WORDS]: {} }, "local");
  for (let step = 0; step < 20; step += 1) await Promise.resolve();
  releaseFirstRead();
  await hydrated;
  expect(state.snapshot.isLoading).toBe(false);
  expect(state.snapshot.data).toEqual({ latest: {} });
});
