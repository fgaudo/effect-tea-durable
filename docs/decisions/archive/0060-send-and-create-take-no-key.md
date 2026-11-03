# 0060. `send` and `create` take no key

**Status:** accepted, 2026-10-31.

## Context

An operation sent to another entity with `send(program, id, message, key, name)`, and created one with
`create(program, id, flags, requestId)`, passing an idempotency key it held. Only an idempotent runner was given
its key ([decision 0011](0011-an-operation-declares-what-a-crash-does.md)), so an at-least-once or at-most-once
operation could send only under a key it made up, and any operation could pass another operation's key, or a
string written by hand. `create` took no name, so an operation could create one entity once.

## Decision

- **The runtime gives each run of an operation its own `Entities`**, which knows the run's entity, key and
  incarnation: `send(program, id, message, name)` and `create(program, id, flags, name)` make the request of that
  run under `name` ([decision 0059](0059-a-request-is-a-value.md)).
- **A name is used once per receiver by a run**, for a message and apart for a creation, which are stored apart
  ([decision 0050](0050-a-creation-is-answered-apart-from-a-message.md)): a second use is the operation's defect, as
  it was for `send` ([decision 0047](0047-a-request-of-an-operation-has-a-name.md)).

## Alternatives

- **Giving every runner its key**, and keeping the argument. The key would still be a string an operation could
  replace, and the runtime would still have to parse it to know which work asked.

## Consequences

- Any operation may talk to other entities. One that runs again after a crash sends the same requests and gets
  their stored replies, so an operation that talks only to entities runs at least once and acts exactly once:
  the booking's runners are declared so.
- The idempotency key stays the idempotent runner's, for services outside.
