# Storage consistency

User edits enter through `saveEdit`. The standalone function and
`transaction.saveEdit` share one implementation. The transaction reads the latest
stored value, applies a synchronous reducer, and stages the value and its sync
metadata together. Lower-level transaction methods remain available for
initialization, migrations, and accepted remote values; those methods do not
automatically create user-edit metadata. The settings provider normalizes legacy
schemas and boolean themes in memory on reads, including remote adoption and
refresh. Reading settings does not persist compatibility transforms, mark the
page dirty, advance edit timestamps, or schedule an upload. A real user edit
rebases against the latest normalized settings inside the transaction and saves
that format with its edit metadata. An edit that leaves the normalized value
unchanged preserves the original stored representation and metadata.

## Ownership

| Layer | Responsibility |
| --- | --- |
| `storage` and the platform coordinator | Ordered persistence, edit timestamps, destination metadata, and compensation |
| `storageState` | Confirmed page value, pending edit intents, projected UI value, and recovery |
| `storageSyncController` and `sync` | Network synchronization and guarded acceptance of remote results |
| React hooks | Subscription, rendering, and forwarding user operations |

`revision` invalidates asynchronous work when the visible scope changes.
`editVersion` advances when a user queues an intent, including before that intent
can acquire the lock. `committedEditVersion` advances only after a changed edit
is confirmed; an optimistic preview or a no-op must not manufacture an upload.

The page projects pending intents over its confirmed base. A queue task must
adopt its persistence receipt and remove its intent before the next mutation or
reload can run. Closing a React subscriber does not cancel an already queued
edit. Closing the entire document is a separate platform boundary; the extension
background retains commits it has already accepted.

## Edit contract

- Reducers are pure and synchronous. They may run for previews and rebasing.
  Capture timestamps, identifiers, and immutable input data before enqueueing.
- Each intent initiates at most one persistence attempt. Events, success
  messages, and network actions happen after the persistence promise succeeds.
- No-op comparison happens against the latest value inside the transaction.
  Object property order is ignored; array order is significant.
- A replacement remains a replacement. Clearing a synced collection saves an
  empty collection. Removing the storage key is a separate, local deletion.
- Missing data uses the same default as hydration, without persisting defaults
  merely because a read took place.
- `updateAt` is monotonic. The existing first-attempt and `pendingUpload` rules
  preserve edits after a first sync attempt without changing initial adoption
  of remote data.

Native storage notifications and in-page notifications invalidate the page
cache. They queue a coordinator-protected read rather than adopting event payloads
or initiating a new write. An event handler must not await a reload from inside
an active transaction.

## Failures and synchronization

A rejected request is not proof that nothing was written. A disconnect after
the extension submitted a commit, or an incomplete compensation, has an unknown
outcome. The page cancels unexecuted dependent intents and reads the authoritative
value and metadata through the coordinator before accepting another edit. It
never automatically replays the rejected operation. If recovery fails, writes
remain blocked until a later recovery read succeeds.

Network requests, decryption, subscription preparation, and user interactions
stay outside storage locks. A stale network response is rejected before commit.
An already accepted remote transaction finishes before a later queued reducer
is applied to its result. The later reducer must not restore an obsolete full
page snapshot.

The rule editor prepares subscription data outside the lock, then re-reads local
dependencies and checks conflicts within its edit transaction. It must not call
a network-capable rule resolver or enter another storage transaction while
holding that transaction.

## Platform boundaries

Extensions use the background coordinator. An accepted storage commit completes
before a subsequent writer receives the lock. Disconnect fencing is retained;
there is no fixed-time lease that releases an in-flight write.

Ordinary Web pages use Web Locks, with an IndexedDB mutex fallback. The fallback
is kept alive only for short storage work. Its performance is not claimed to
have been measured by unit tests.

Userscript storage retains its original keys and JSON values. Per-context
ordering, latest-value reads, compensation, and optional GM change listeners
improve sequential editing and refresh. They do not provide a global transaction
across arbitrary origins or legacy writers. A stronger guarantee requires a
shared write authority or a different persistence protocol.
