# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

The first audit's findings whose fix was plain are done. A second review found the bugs below. Each fix changes a
rule of the machine or of the runtime, so each is decided in a note, with a test that fails without it. After
them comes one of the [open questions](open-questions.md), decided in a note.

- **Flags are not checked by their schema.** An inbound message that does not encode is its caller's defect and
  reaches no entity ([decision 0040](decisions/0040-what-is-stored-encodes-to-json-as-it-is.md)); the flags of a
  `create` reach `init` unchecked ([`src/runtime.ts`](../src/runtime.ts), `create`).

## Later

- Effect Cluster: sharding, rolling deploys, the state recording the last message it handled.
- The library's name, once there is code to publish.
