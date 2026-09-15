# Browser synchronization verification

These fixtures load the regular Options application and exercise its production
React hooks, storage functions, sync dispatcher, Web Crypto implementation, and
HTTP requests. They do not replace application modules or expose test-only
production entry points.

`sync-fixture-server.mjs` serves two isolated Worker/WebDAV targets (`/a` and
`/b`) and proxies the normal development server. It imports the actual
`src/libs/syncCrypto.js` implementation to create encrypted fixture packets and
decode received packets for assertions. It binds to loopback only. All test
credentials are synthetic.

## Start the services in PowerShell

Start the development server on port 3133 with `REACT_APP_CLIENT=web`,
`BROWSER=none`, and `PORT=3133`. This repository's pnpm layout may require
`NODE_PATH` to point to `node_modules/.pnpm/node_modules` because the webpack
override references transitive build dependencies.

```powershell
$env:REACT_APP_CLIENT = 'web'
$env:BROWSER = 'none'
$env:PORT = '3133'
$env:HOST = '127.0.0.1'
$env:NODE_PATH = (Resolve-Path 'node_modules/.pnpm/node_modules').Path
node node_modules/react-app-rewired/bin/index.js start
```

In a second shell:

```powershell
$env:FIXTURE_PORT = '3135'
$env:APP_PORT = '3133'
node testdata/browser/sync-fixture-server.mjs
```

For manual inspection, open `http://127.0.0.1:3135/__fixture__/start` and select
the reset/open button. `http://127.0.0.1:3135/__fixture__/inspect` displays local
storage and decrypted remote evidence without changing either.

## Run automated browser checks

The runner uses an installed Google Chrome in headless mode by default. Set
`PLAYWRIGHT_PATH` to an installed Playwright package and optionally
`BROWSER_CHANNEL` to another available Playwright channel.

```powershell
$env:FIXTURE_ORIGIN = 'http://127.0.0.1:3135'
$env:PLAYWRIGHT_PATH = 'C:/path/to/node_modules/playwright'
node testdata/browser/run-sync-browser-tests.mjs route-unmount immediate-sync webdav metadata-rollback first-sync-failure destination-switch concurrent-tabs same-tab-multiple-keys interaction-fallback
```

The runner saves screenshots and the full local/remote evidence to
`testdata/browser/evidence/report.json`. Its native storage fault injection
throws once at the metadata commit for the rollback scenario. All other storage
operations use ordinary browser localStorage. The concurrent-tab scenario uses
two actual tabs and the browser's native Web Locks manager.
The interaction scenario removes the DOM `inert` attribute during a held startup
request to exercise the JavaScript event/focus fallback, then verifies that
normal editing resumes once the request completes.

These checks cover the web Options target. They do not substitute for a packaged
extension or legacy Thunderbird compatibility test.

To exercise the native IndexedDB fallback instead of Web Locks, run the same
concurrent-page case with these settings:

```powershell
$env:DISABLE_WEB_LOCKS = '1'
$env:BROWSER_EVIDENCE_DIR = 'testdata/browser/evidence/idb-fallback'
node testdata/browser/run-sync-browser-tests.mjs concurrent-tabs
```

The runner removes `navigator.locks` before application scripts load, verifies
the real `kiss-storage-transaction` database exists, and checks both metadata
keys across five simultaneous edit pairs.

## Packaged Chrome extension

Build the regular Chrome webpack target into a dedicated fixture output folder:

```powershell
$env:REACT_APP_CLIENT = 'chrome'
$env:BUILD_PATH = './testdata/browser/extension-build'
$env:GENERATE_SOURCEMAP = 'false'
$env:NODE_PATH = (Resolve-Path 'node_modules/.pnpm/node_modules').Path
node node_modules/react-app-rewired/bin/index.js build
```

Run the packaged extension check with an unbranded Chromium executable that
supports extension side-loading:

```powershell
$env:FIXTURE_ORIGIN = 'http://127.0.0.1:3136'
$env:CHROMIUM_EXECUTABLE = 'C:/path/to/chromium/chrome.exe'
$env:BROWSER_EVIDENCE_DIR = 'testdata/browser/evidence/extension'
node testdata/browser/run-extension-sync-tests.mjs
```

The extension runner creates a separate temporary profile under the ignored
`profiles` folder. It loads the production manifest and bundles, observes
coordinator messages in the real service worker, edits two real Options tabs,
and reads `chrome.storage.local` plus decrypted remote packets. It records
bundle SHA-256 hashes and screenshots. No existing browser profile is opened or
modified. This does not test legacy Thunderbird.

## Remote controls

`GET /__fixture__/state` returns encrypted packets, decoded values, timestamps,
request history, active gates, and queued fault plans.

`POST /__fixture__/control` accepts:

- `reset: true` to clear only fixture remote state and request history.
- `seed: [{ target, key, value, updateAt }]` to encrypt a business value.
- `plans: [{ target, key, method, delayMs, hold, status }]` to apply a one-time
  response delay, named gate, or HTTP failure. Omitted matching fields are
  wildcards.
- `release: [name]` to complete a named gate.

A delayed response captures its remote value when the request arrives, allowing
deterministic stale-response tests. Separate fixture ports should be used for
manual and automated sessions because automated cases reset their own remote
state.
