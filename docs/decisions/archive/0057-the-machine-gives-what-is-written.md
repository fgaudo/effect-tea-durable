# 0057. The machine gives what is written

**Status:** accepted, 2026-10-31.

## Context

The machine gave the next `Stored`, and the storage worked out what to write by comparing it with the one before.
Two rules lived there, where no property of the machine checked them:

- **when a step publishes** ([decision 0038](0038-what-happened-is-published-through-an-outbox.md)): the storage
  compared the states by reference and the projections as text, and called `project` twice to do it;
- **which replies to other entities are deleted** ([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md)):
  a query over every reply the entity's work had asked for, and the parsing of request ids to know which work
  asked.

It also did again what the machine had done: a step that changed the state called `project` three times and
encoded the projection three times, encoded the state and the work twice and computed the indexes twice, and the
runtime relied on `project` and the indexes giving the same value when called again. The keys and the mailbox
were written whole at every event, each envelope encoded again.

## Decision

- **A transition gives, besides the next machine and its outputs, what the event writes**, already encoded, or
  `null` when it writes nothing: the state's JSON with the request that created the entity, when the state
  changed; the suspension; the rows of the keys that changed; how many messages leave the head of the mailbox
  and the ones queued at its end; the replies added, each with the work of another entity that asked for it; the
  work that ended, whose requests' replies are deleted; the read model's row, when the state changed; and the
  row of the outbox, when what callers read changed.
- **The storage writes it and decides nothing.** The one condition it applies is the one only it can see: a reply
  asked by another entity's work whose work no longer holds is deleted as it is stored, since that work is
  another entity's keys.
- **Each value is encoded once, and each projection computed once.** The encodings and the projection of a
  value are kept by the value, which is never mutated
  ([decision 0052](0052-what-crosses-the-library-is-never-mutated.md)): what the checks of a step encoded is what
  is written, and the projection of the state before a step is the one the step before computed.
- What a step writes is checked by a property: applied to the rows of the machine before the event, it gives the
  rows of the machine after it.

## Alternatives

- **Writing the whole `Stored` at every event, encoded by the machine.** The storage would decide nothing, but
  every envelope and every key would be encoded again at every event, as before.
- **Storing the projection's text with the entity and publishing against it.** A step after a deploy that
  changed `project` would publish though the step changed nothing callers read under the new program, where a
  deploy publishes nothing of itself.

## Consequences

- A row is written at the program's version when an event writes it, and only then: after a deploy, a key whose
  work is kept, a message still queued and a state no step has changed are read through their migrations until
  something writes them.
- An activation that changes nothing stored writes nothing, and its points of the crash table are not reached.
- The mailbox's rows are numbered as they are queued, and read in that order.
