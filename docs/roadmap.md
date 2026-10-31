# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

The bugs of the third audit are fixed: a creation and a message under one request id are answered apart
([decision 0050](decisions/0050-a-creation-is-answered-apart-from-a-message.md)), and a deploy that fails
leaves nothing running ([decision 0051](decisions/0051-a-deploy-that-fails-leaves-nothing-running.md)). What it
found to make the project purer and more rigid is below, in order. Its first two steps are done: the machine
gives what an event writes, and the storage decides nothing
([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)), and work is compared by what is stored
([decision 0058](decisions/0058-work-is-compared-by-what-is-stored.md)); so are the next three: a request is a
value ([decision 0059](decisions/0059-a-request-is-a-value.md)), `send` and `create` take no key
([decision 0060](decisions/0060-send-and-create-take-no-key.md)), and only what the program does is its defect
([decision 0061](decisions/0061-only-what-the-program-does-is-its-defect.md)). Each step is decided in a note
before it is made.

1. **The program is not the machine's state.** `Machine` holds its program, and `Resume` replaces it, which the
   runtime does not follow ([a fixed program brought by `resume`](open-questions.md#running)). `step` takes the
   program as an argument, and the stored entity says which version of it runs: a fixed program is then a deploy,
   or something stored, but never a value the machine and the runtime see differently.
2. **Only a step changes the machine.** `forget` in the runtime removes replies from a loaded machine outside any
   event. Now that the machine says which work ended, whose replies are deleted, it either holds no replies at all
   and reads the one a request asks for ([the replies an entity holds](open-questions.md#storage-and-reading)), or
   forgets them through an event of its own.
3. **A row is read through a schema, or not at all.** `load` gives a missing key as `''`, an
   incarnation as `0` and a cause as `''`, reads a reply of any tag but `Accepted` as a rejection and a queued
   message of any tag but `Inbound` as internal, and casts `delivery` and an outbox row's kind unchecked. Each
   table's row has a schema, and a row it refuses fails the call that meets it, as a row no version reads does
   ([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)).
4. **The runtime waits for what it waits for, and polls nothing.** `settled` looks every millisecond, `deployedAs`
   every few, and a sender sends again to a suspended receiver every few too. Each becomes a signal: a count of
   what is under way with a latch for `settled`, a deploy that wakes the operations waiting for its program, a
   resumption that wakes the senders waiting for it ([suspended entities](open-questions.md#running)).
5. **The tests run on a clock they control.** The runtime's tests sleep for real time, up to 80 milliseconds at
   once, which a loaded machine can outlast. The runtime reads time with `DateTime.now` and waits with
   `Effect.sleep`, which `TestClock` drives: the tests move time instead of waiting for it, and the random
   sequences, 25 runs today, can run many more.

The open questions that bear on cost — [a mailbox under a burst](open-questions.md#storage-and-reading),
[the replies an entity holds](open-questions.md#storage-and-reading) and
[one permit for the process](open-questions.md#running) — are decided after step 2, which changes what a machine
holds: what an event writes is already the machine's, and only what it changed
([decision 0057](decisions/0057-the-machine-gives-what-is-written.md)).

## Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
