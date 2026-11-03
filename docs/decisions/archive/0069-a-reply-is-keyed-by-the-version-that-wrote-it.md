# 0069. A reply is keyed by the version that wrote it

**Status:** accepted, 2026-10-31. Decides [a sender migrated onto another's
text](../../open-questions.md#storage-and-reading).

## Context

A reply's row was keyed by its entity and its request's text, as the version that wrote it encoded it, and a
caller's request a version before stored was found once read through the migrations
([decision 0065](0065-the-machine-holds-no-replies.md)). A migration of the sender that gives one caller's old
JSON to another — a rename, a swap — gave the second caller's request, at the new version, the text of the first
one's stored row. The second caller's request was not answered by that row, since the row read through the
migration is the first caller's; but its reply was then written under the same key, and replaced the row. The
first caller's retry found nothing, and its message was applied again.

## Decision

- **A reply's row is keyed by its request's text and by the version that wrote it.** A version encodes each
  request to one text, so within a version a text is one request; two versions never share a row, and a reply
  written at one version replaces nothing another wrote.
- A reply is found as before: by its text at any version, compared once read through the migrations, and for a
  caller's request then by its request id among the rows of other versions
  ([decision 0065](0065-the-machine-holds-no-replies.md)).

## Alternatives

- **Keying a reply by what no migration changes.** A caller's request id is the caller's own, and two callers
  may choose the same one ([decision 0048](0048-a-callers-request-belongs-to-its-sender.md)): only the sender
  tells them apart, and the sender is what the program migrates.
- **Writing the rows again at a deploy.** A deploy would read and write every reply kept, which a caller's are
  for ever, before the program serves anything.
- **Refusing such a migration.** A migration is a function on the JSON, and whether it gives a caller's old JSON
  to another cannot be checked for.

## Consequences

- [`src/storage.ts`](../../../src/storage.ts) keys `replies` by `(name, id, request, version)`, and deletes a reply
  whose asker's work has ended by the row it has just written, of its version.
- [`src/storage.test.ts`](../../../src/storage.test.ts) migrates a sender onto the text of another caller's row, and
  checks that both callers keep their replies.
- A request whose text two versions wrote, and that both read as one request, has a row of each version only if a
  version stored a reply without finding the other's, which a reading by text at every version does not let
  happen.
