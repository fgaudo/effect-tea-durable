# 0059. A request is a value

**Status:** accepted, 2026-10-31.

## Context

A request was a string of JSON holding other strings of JSON. The machine's request key was
`JSON.stringify([name, id, requestId])` for another entity, `[sender, requestId]` for a caller and `[requestId]`
for the entity itself; another entity's request id was `JSON.stringify([idempotencyKey, name])`, whose idempotency
key was `JSON.stringify([name, id, key, incarnation])`. Two places parsed them back and told them apart by the
length of an array:

- the machine's `askerOf`, to find which work of another entity asked for a reply
  ([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md)), which gave none for a request id
  written by hand;
- the storage's `rekey`, to migrate a caller's sender in a stored key
  ([decision 0048](0048-a-callers-request-belongs-to-its-sender.md)), which guessed that an array of two whose second
  item is a string was a caller's.

## Decision

- **A request is a tagged value**, `Request<Sender>`: a caller's, with its sender and the request id it chose; an
  operation's, with the entity, key and incarnation of the run that sent it and the name it gave
  ([decision 0047](0047-a-request-of-an-operation-has-a-name.md)); the entity's own, which the rehearsal creates its
  entity with. The events, the mailbox, the replies and the creation hold it, and `meta.from` is read off it.
- **It is stored as its schema writes it**, in a column of its own — the mailbox's `request`, the entity's
  `creation`, the reply's `request` — and read through that schema. Only a caller's sender is the program's, and a
  migration reads it there, found by the tag.
- **The machine deduplicates requests by their JSON as text**, with the fields of each object in order. The text
  is an index the machine keys its replies by, and nothing parses it back.
- **The work that asked for a reply is read off its request**: an operation's request is its run.

## Alternatives

- **One column per field of a request**, with a uniqueness for each kind. The columns would hold nulls for the
  kinds that have no such field, and a uniqueness over them would need an index per kind; the request read through
  its schema says the same with one column, and the reply keeps the columns of the work that asked, which the
  deletion of its replies needs.
- **Keeping the strings and parsing them with a schema.** The nesting would stay, and so would two notions of a
  request: the one written and the one parsed.

## Consequences

- An idempotency key is what an idempotent runner passes on to a service outside, and nothing of the library reads
  it back.
- A request of another entity is always a run of one of its operations: a request id it chose by hand is not a
  request ([decision 0060](0060-send-and-create-take-no-key.md)).
- A reply's row keeps the request as the version that stored it wrote it: a caller's retry after a deploy that
  migrates its sender finds the reply, since the load keys it as the program's version does.
