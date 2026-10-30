# 0034. An operation answers the messages of its runner

**Status:** accepted, 2026-10-30.

## Context

`Runners<T>` gave, for each tag of the operations, a runner whose message was widened to every internal message
of the program. So nothing said which messages a kind of operation ever delivers: a charge's runner could answer
`RenewalDue`, and an at-most-once runner's `unknown` any message at all, where the point of declaring it is to
say what the state is told when a crash left the operation's effect unknown
([decision 0011](0011-an-operation-declares-what-a-crash-does.md)). Whether the message an operation answers
belongs to its type was an [open question](../open-questions.md), asked by the first step of the
[roadmap](../roadmap.md) with the keys ([decision 0033](0033-a-program-declares-its-keys.md)).

## Decision

- The messages a kind of operation answers are its **runner's**, read off the effect it returns, and they must
  be messages of the program's internal union. A runner that answers anything else does not compile, and the
  `unknown` of an at-most-once operation is answered by the same runner, so it is checked with it.
- They are not part of the operation's data. An operation is a value with a schema, stored with the state
  ([decision 0018](0018-operations-are-data.md), [decision 0025](0025-operations-and-projections-have-schemas.md)):
  a type that never encodes has no place in it.
- `Program<T>`'s `operations` stays `Runners<T>`, with the internal union. A runner that answers less is one of
  them, and the program's interface holds what the machine needs: the machine delivers an internal message,
  whichever runner sent it.

## Alternatives

- **`Types` gaining the messages per tag**, so that `Runners<T>` is exact in the interface too. Every hand-written
  `Program<T>` would carry a second map beside `operation`, and a new version of the program answering an
  operation otherwise would not typecheck — which no decision forbids: what a deploy may not change is how an
  operation under way is **delivered**
  ([decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md)).
- **The answer in the operation's schema**, as a field that is never read. It would be stored, and read back by
  a version that no longer has it.
- **Leaving it widened**, as it was. Then a program's only statement of what an operation delivers is `update`'s
  defect for a message whose key the state does not hold, found when a test sends it.

## Consequences

- The runners are now the place that says what each operation delivers, in the declaration, with no annotation:
  `EmailShipment` answers `ShipmentEmailed` or, when a crash left it unknown, `ShipmentEmailUnsure`.
- `update` is unchanged: an internal message is any of the program's, and the ones whose key the state does not
  hold are defects ([decision 0014](0014-rules-the-machine-settled.md)).
- A rehearsal's `answer(pending, message)` still takes any internal message. `pending` finds work by key at
  runtime, so there is no kind for a type to narrow the message to.
