# 0142. A consumer waits for a row of its topic

**Status:** accepted, 2026-11-05. Changes
[decision 0039](0039-a-consumer-of-the-outbox-keeps-its-cursor.md), whose `feed` gives at once what it reads.
Changed by [decision 0153](0153-a-reader-of-a-consumer-names-the-partitions-it-reads.md), which moves `wait` into an
object of `feed`'s options, beside the partitions a reader names. Changed by
[decision 0163](0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md): on Cluster a reading that waits is woken by another runner's commit, which the runner
learns from the file.

## Context

The runtime writes the log and does not deliver it: a consumer calls `feed`, and `feed` gives the rows past the
consumer's cursors at once, or none ([decision 0039](0039-a-consumer-of-the-outbox-keeps-its-cursor.md)).
Nothing tells a consumer that a row was written. So a consumer calls `feed` again and again, and learns of a step
as late as the time between two of its readings. A consumer that reads every second confirms a payment a second
late, and reads an empty page the rest of the time. A hundred consumers read a hundred empty pages a second, each
a statement of SQLite on the connection the entities' steps commit on. The runtime itself polls nothing
([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)), and its consumers had no way not to.

The library is meant for a backend of any size, where a consumer sends a notification or confirms a payment, and
the delay of a polling interval is the user's.

## Decision

- **`feed` takes a `wait`.** `feed(topic, consumer, limit, wait)` takes `wait` as `{ millis }`, an option. Without
  it, `feed` reads and gives what it read at once, as before. `wait.millis` is a non-negative integer, a safe one,
  and anything else is the caller's defect, as a limit is
  ([decision 0053](0053-what-a-handle-is-given-is-checked.md)).
- **A reading that finds no row waits for a commit in its topic.** Given `wait`, `feed` reads. A page with a row is
  given at once. An empty page waits until a step commits a row in the topic, then reads again, and so on until a
  page has a row or `wait.millis` have passed since the call. Once the time is over, the call gives the last page it
  read, which is empty. A limit of `0` gives no row at once, since no row could be given.
- **The signal is the topic's, told after the commit.** A step, a creation included, tells each topic it wrote a
  row in once its transaction has committed, so that the reading it wakes finds the row. A consumer of another topic
  is not woken. A topic's signal is made only by a reading that waits, and dropped by the commit that completes it,
  so a step that nobody waits for finds none.
- **The signal is taken before the reading.** A reading takes its topic's signal, then reads, then waits for the
  signal. A commit between the reading and the wait has completed the signal already, and the wait ends at once.
  Taken after the reading, such a commit would be missed, and the wait would run to its end with a row to give.
- **A wait ends when the runtime stops.** Once the scope the runtime was launched in closes, after the drain of
  [decision 0119](0119-a-planned-stop-drains-the-at-most-once-operations.md) and before the entities stop, a
  reading that waits is given no row, and reads nothing more. A row it would have read stays past its cursors.
- **`published` takes no wait.** Its cursors are the caller's, and it is the reading of a test or of an operator
  looking. A consumer that keeps cursors of its own reads with `feed` and drops what it has acted on, as
  [decision 0039](0039-a-consumer-of-the-outbox-keeps-its-cursor.md) says.
- **On Cluster, a commit of another runner is not told.** A wait there ends at its time, and the reading after it
  finds the row: a consumer on Cluster reads once per `wait.millis` at worst. Whether runners tell each other of
  their commits is decided with the step Effect Cluster of the [roadmap](../../roadmap.md).

## What it rests on

- That every commit of a topic's rows is made by the runtime the consumer calls: **documented**, by
  [decision 0080](0080-a-database-is-held-by-one-runtime.md), and **tested**, by the test `a runtime holds
  its database file alone: no other connection opens it, nor launches while one is open` in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts). A second process that wrote the database would wake none of
  this one's readings, which would then wait out their time.
- That a reading that starts after a step's transaction has committed reads its rows: **tested**, by the test `a
  consumer that waits is given the row a step commits while it reads, under prioritized schedules` in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts), whose clock never moves, so that a reading woken before the
  row could be read would wait for ever.
- That the signal taken after the reading misses a commit: **tested**, by the same test, which fails under the
  seeds of `bun test` with the two statements in the other order.
- That a `Deferred` completed stays completed, and that a wait for it then ends at once: **documented**, in the
  JSDoc of `Deferred` and of `Deferred.await` in `node_modules/effect/src/Deferred.ts`.
- That the runtime's scope runs its finalizers in the reverse order of their adding, so that the waits end after
  the drain and before `running` closes: **documented**, by the example of `Scope.addFinalizer` and the default
  strategy of `Scope.fork` in `node_modules/effect/src/Scope.ts`, which
  [decision 0120](0120-the-runtime-closes-a-sequential-scope-of-its-own.md) rests on too. That the waits end at
  all: **tested**, by the test `a consumer that waits is given nothing once the runtime stops` in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts), which waits out its minute without the finalizer.

## Alternatives

- **A wait with no bound**, ended by the caller's interruption. Effect lets a caller time out any call, but a call
  that never returns holds a fiber for the life of the process when its caller forgets to, and a boundary that
  serves a long poll over HTTP needs a time anyway. A `wait` required to say how long makes the bound the caller's,
  at the call.
- **A signal of its own on the handle**, an effect that ends at the next commit in a topic, which a consumer
  composes with `feed`. Every consumer would have to take the signal before its reading, the one rule a wait must
  keep, and a consumer that took it after would lose rows' worth of time in silence. `feed` keeps the rule once.
- **A stream of pages** over the wait. It holds a subscription for as long as the consumer reads, which the call
  does not, and a consumer acks a page before the next is read in any case. A stream is a loop over `feed` that a
  consumer writes in a line.
- **A `PubSub` per topic**, each reading subscribed before it reads. It tells the same, and makes a subscription
  per reading where a `Deferred` of the topic serves every reading waiting at once.
- **A signal of the step, not of the topic.** A step that publishes in one topic would wake the consumers of all
  the others, which would read an empty page each: what the wait is for is that they do not.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) takes `wait` in `feed`, tells the topics after each commit, and ends
  the waits as the runtime stops. [`src/storage.ts`](../../../src/storage.ts) does not change: the wait is the
  runtime's, around the storage's reading.
- `docs/design.md` says so under Consumers, and `docs/open-questions.md` no longer asks it.
- A consumer on Cluster reads at most once per its wait, which [`docs/cluster.md`](../../cluster.md) says.
