# 0035. One place where a program is declared

**Status:** accepted, 2026-10-30. [Decision 0180](../0180-a-program-leaves-out-what-it-does-not-have.md) lets a
program leave out the schemas, records and `durable` it does not have.

## Context

A program was an object literal typed `Program<T>`, with `T` written by hand: eleven types in the annotation,
and the same types again in the schemas below it. Two things the pieces know could not be held there — the keys
`durable` uses and the messages each kind of operation answers — and `runnerOf` recovered the second with a cast.
The first step of the [roadmap](../../roadmap.md) was a constructor that takes the pieces and infers them.

## Decision

- A program is declared by `program(schemas)(…)`: the schemas, which give every type the program is written in,
  and then what it does — `name`, `keys`, `init`, `update`, `durable`, `operations`, `project`, `indexes`.
  Nothing is written twice, and all of `Types` is inferred: the state, the flags, the messages, the operations,
  the rejections, the senders and the projection from the schemas; `key` from `keys`
  ([decision 0033](0033-a-program-declares-its-keys.md)); `index` from `indexes`
  ([decision 0032](0032-a-projection-is-a-row.md)); and `services` from the runners, each of which also says
  which messages its operation answers ([decision 0034](0034-an-operation-answers-the-messages-of-its-runner.md)).
- **The schemas come first, in a call of their own.** They are what everything that leaves the process is written
  with ([decision 0025](0025-operations-and-projections-have-schemas.md)), and applying them first makes every
  type concrete where the pieces are written: `init` returns a state, `project` a projection, with no annotation
  and with a wrong tag naming itself in the error. With one call, the pieces are checked against type parameters
  that are not resolved yet, every fresh literal widens — a `_tag: 'AwaitingPayment'` becomes `string` — and
  `init`, `durable` and `project` would each need their return written out.
- `Program<T>` stays an interface anyone may write by hand. The machine's own tests declare programs whose
  schemas are never used, and a deploy takes a `Program<T>`, so the constructor is a way to declare one, not the
  only type a program has.

## Alternatives

- **One call with all the pieces.** It reads better, and it costs a return annotation on `init`, `durable` and
  `project`, because of the widening above.
- **A builder** — `program('Order').schemas(…).update(…)`. Each step would carry the types inferred so far, and
  a piece that does not fit is found where the chain is closed, not where it is written.
- **Inferring the types from `init`, `update` and `project`**, with the schemas checked against them. The schemas
  are what must be right: they are what is stored and what callers read, and a state inferred from `init` would
  store whatever it happens to build.
- **A class to extend.** A program has nothing to carry at runtime but its pieces, and `Program<T>` is already
  the interface the machine reads.

## Consequences

- Each example lost its `Program<{…}>` annotation and declares its program once. If a piece does not fit, the
  error names the piece.
- `Match.value(message).pipe(Match.withReturnType<State | Rejected>(), …)` stays as it was in `update`: a
  `Match` branch's result is inferred, not read from the type the pipe ends in.
- The pieces that TypeScript cannot relate through a mapped type — the work by key, and the services of the
  runners together — are cast once, inside the constructor, where `runnerOf` and `indexesOf` already cast what a
  tag or a name cannot index ([decision 0018](0018-operations-are-data.md)).
- A program declared this way is a `Program<T>` of an inferred `T`, which `rehearse`, `launch` and `deploy` take
  as before.
