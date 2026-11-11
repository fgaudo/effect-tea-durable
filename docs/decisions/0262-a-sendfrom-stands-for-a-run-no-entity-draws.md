# 0262. A `sendFrom` stands for a run no entity draws

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 82. It changes
[decision 0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md): a world's `sendFrom` stands for a
run under an incarnation below 1, and no longer for a run under the world's counter of drawn requests.

## Context

A reply is keyed by the request: the sender's address, the key, the incarnation and the name of the send
([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). No one in the runtime sends under
another entity's address, so two runs never share a request. A world's `sendFrom` builds a request of another
entity's operation under any address the test gives, under the key `rehearsal` and the name `request`. Its incarnation
was drawn from the world's counter of requests, which gives 1, 2, and on. An entity's incarnations are drawn from 1 up
too ([decision 0132](archive/0132-a-key-may-take-a-parameter.md)). So under the address of an entity of the world, a `sendFrom`
could forge the request of one of the entity's own runs, under a key `rehearsal` and a send named `request`. The run's
send was then answered from the forged request's reply, and its message was never applied. The other way round, a
`sendFrom` after the run's send was answered from the run's reply, and was not applied either. The world also deleted
the forged request's reply when the entity's work at that incarnation ended. The maintainer chose this fix on
2026-11-11, after the opinion of a Fable 5.2 agent.

## Decision

- **A world's `sendFrom` stands for a run under an incarnation below 1**, drawn down from 0 by a counter of its own:
  -1, then -2, and on. No entity draws an incarnation below 1, so the run is none of an entity's own, under any
  address, and whether the entity is created before the `sendFrom` or after it.
- **A `sendFrom` under the address of an entity of the world is lawful.** Its message and the message of the entity's
  own send are each applied once, in either order, as the runtime applies two runs' sends.
- **The world's counter of drawn requests gives only the ids of a caller's requests** that the test does not name.

## Alternatives

- **`sendFrom` refuses the address of an entity the world holds.** It forbids a use a test of a world has, and it
  needs three guards: in `sendFrom`, in the world's `create`, and in a creation an operation asks for. A guard
  missed opens the bug again.
- **`sendFrom` sends under a key no program can declare**, as a name holding U+0000. It rests on what a database
  holds as text ([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)), which may change, and
  a test reads the key in a message of a defect.
- **A request of a tag of its own for `sendFrom`.** It changes `Request` and its codec, which are the runtime's
  semantics, for a case of the rehearsal alone.
- **The world keeps no reply of a `sendFrom`**, as it keeps no reply of a caller's request the test does not name
  ([decision 0200](0200-a-rehearsal-sends-under-a-request-id-the-test-names.md)). The Fable 5.2 agent proposed it in
  addition. Each `sendFrom` is a new request, so no one reads its reply again, and the reply kept costs memory alone.
  Once no incarnation is shared, the change is not needed.

## What it rests on

- That every incarnation an entity draws is 1 or more: **tested** by `every incarnation an entity draws is 1 or more,
  through creation, steps, deploys and restarts`, in `src/machine.test.ts`, on the histories fast-check generates. It
  fails with the machine's counter starting at -1.
- That a `sendFrom` under the address of an entity of the world, before or after the entity's own send, leaves both
  messages applied: **tested** by the tests of `a sendFrom under the address of an entity of the world`, in
  `src/rehearse.test.ts`. The first two fail against the code before the change, which drew the incarnation from the
  world's counter of requests.
- That an incarnation below 1 encodes in a request and in its key: **tested** by the same tests, which encode it in
  `Machine.requestKey`. The codec of an operation's request holds an incarnation as `Schema.Int`, with no bound.
