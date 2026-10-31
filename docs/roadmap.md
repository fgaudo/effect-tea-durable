# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

The bugs of the third audit are fixed: a creation and a message under one request id are answered apart
([decision 0050](decisions/0050-a-creation-is-answered-apart-from-a-message.md)), and a deploy that fails
leaves nothing running ([decision 0051](decisions/0051-a-deploy-that-fails-leaves-nothing-running.md)). What it
found to make the project purer and more rigid is below, in order: the first steps move rules into the machine,
which the later ones build on. Each step is decided in a note before it is made.

1. **The machine gives what is written.** A step returns, besides the next `Stored`, what an event writes, already
   encoded: the state's JSON, the projection's and the indexes' values, the row of the outbox, the replies added
   and the ones deleted, the keys and the mailbox. The storage writes it and decides nothing. Two rules now outside
   the machine move into it, where its properties check them: when a step publishes ([decision
   0038](decisions/0038-what-happened-is-published-through-an-outbox.md)), today decided in `storage.ts` by
   comparing the states by reference and the projections as text, and which replies to other entities are deleted
   ([decision 0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)), today a query and the
   parsing of request ids. It also ends the work done again at each step that changes the state — `project` called
   and the projection encoded three times, the state and the work encoded twice, the indexes computed twice — and
   the runtime's reliance on `project` and the indexes giving the same value when called again.
2. **Work is compared by what is stored.** `isSame` compares operations and timers' messages with `Equal.equals`,
   while the storage compares projections as text. At an activation one side was decoded from the store, and the
   two can disagree: an operation built with a property its schema does not declare, which the types let through a
   spread, is equal to itself in memory, is stored without it, and after a restart is no longer equal to what
   `durable` builds — the entity is suspended at every activation, as a program that changed the operation.
   Comparing the encoded JSON is one notion of "the same", the one a crash sees. It comes with step 1, which has
   the encoding at hand.
3. **Requests are typed, not strings of JSON.** A request key, an idempotency key and an operation's request id are
   JSON inside JSON, which `askedBy` and `rekey` parse back and tell apart by the length of an array. A request
   becomes a value — a caller's, with its sender and id; an operation's, with its entity, key, incarnation and
   name; the entity's own — stored in columns of its own. The deletion of replies (step 1) reads them, and a
   migrated sender is rewritten without guessing what a row holds.
4. **`send` and `create` take no idempotency key.** The runtime gives each run of an operation its own `Entities`,
   and knows its key: `send(program, id, message, name)` cannot be given another operation's key, or one written by
   hand. Today only an idempotent runner is given its key, so an at-least-once or at-most-once operation can send
   only under a key it makes up. `create` takes a name too, as `send` does ([decision
   0047](decisions/0047-a-request-of-an-operation-has-a-name.md)).
5. **What the program does is caught, and nothing else.** `handle` catches every exception of the step, so a bug of
   the machine itself — a `TypeError` in `renew` — suspends the entity as the program's defect. Each call of the
   program (`update`, `durable`, `project`, an index, a runner's `unknown`, the schemas) is wrapped on its own; an
   exception elsewhere is the runtime's, and crashes the entity ([decision
   0042](decisions/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). Whether `update` returns a
   defect as a value, as it returns a rejection, is decided with it.
6. **The program is not the machine's state.** `Machine` holds its program, and `Resume` replaces it, which the
   runtime does not follow ([a fixed program brought by `resume`](open-questions.md#running)). `step` takes the
   program as an argument, and the stored entity says which version of it runs: a fixed program is then a deploy,
   or something stored, but never a value the machine and the runtime see differently.
7. **Only a step changes the machine.** `forget` in the runtime removes replies from a loaded machine outside any
   event. Once step 1 deletes them, the machine either holds no replies at all and reads the one a request asks for
   ([the replies an entity holds](open-questions.md#storage-and-reading)), or forgets them through an event of its
   own.
8. **A row is read through a schema, or not at all.** `load` gives a missing request id or key as `''`, an
   incarnation as `0` and a cause as `''`, reads a reply of any tag but `Accepted` as a rejection and a queued
   message of any tag but `Inbound` as internal, and casts `delivery` and an outbox row's kind unchecked. Each
   table's row has a schema, and a row it refuses fails the call that meets it, as a row no version reads does
   ([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)).
9. **Nothing waits for an operation under the registry's permit.** `crash` interrupts the entity's operations
   while it holds the one permit of the process, and an interruption waits for the operation's finalizers: while a
   request to a slow service closes, every `send` and `create` to any entity of any program waits, and so does
   every load and unload. The interruption is made once the permit is released, or forked ([one permit for the
   process](open-questions.md#running)).
10. **The runtime waits for what it waits for, and polls nothing.** `settled` looks every millisecond, `deployedAs`
    every few, and a sender sends again to a suspended receiver every few too. Each becomes a signal: a count of
    what is under way with a latch for `settled`, a deploy that wakes the operations waiting for its program, a
    resumption that wakes the senders waiting for it ([suspended entities](open-questions.md#running)).
11. **The tests run on a clock they control.** The runtime's tests sleep for real time, up to 80 milliseconds at
    once, which a loaded machine can outlast. The runtime reads time with `DateTime.now` and waits with
    `Effect.sleep`, which `TestClock` drives: the tests move time instead of waiting for it, and the random
    sequences, 25 runs today, can run many more.

The open questions that bear on cost — [a mailbox under a burst](open-questions.md#storage-and-reading),
[the replies an entity holds](open-questions.md#storage-and-reading) and
[one permit for the process](open-questions.md#running) — are decided after steps 1 and 7, which change what
an event writes and what a machine holds.

## Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
