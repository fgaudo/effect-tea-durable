# 0195. The package is `@fgaudo/effect-tea-persistent`, a program's work is `work`, and a reader fetches

**Status:** accepted, 2026-11-08, with the step The name and the words of the [roadmap](../roadmap.md). Renames the
function `durable` of [decision 0003](archive/0003-durable-work-derived-from-state.md) and the method `feed` of
[decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md). The notes before this one keep the old
words, and the [glossary](../glossary.md) says which word each note used.

## Context

The package was named `effect-tea-durable`, and a program's work was returned by a function named `durable`.
Elsewhere "durable" names durable execution: `effect/workflow`, Temporal and Restate replay a history of what a
function did. This library replays nothing. The state is the only truth, and the work is derived from it. A reader
who knows those libraries would read in the name a promise the design does not make.

The quick start and the guide will fix the words a reader learns first. So the words are decided before either is
written. A rename after a release costs every user a change of code. Before the first release it costs the
repository a commit.

Three more words were weighed. `deploy` of a runtime reads as a deployment to production. `feed` of a handle does
not say who feeds whom, and the design used the verb in both directions: the handle feeding a reader, and a
consumer feeding a report's store.

## Decision

- **The package is `@fgaudo/effect-tea-persistent`.** It sits beside `@fgaudo/effect-tea` under the same scope, as
  an adjective of the same architecture. It names what the library adds to effect-tea: a state that outlives a
  crash, a restart and a deploy. It is the word of the nearest prior art of this shape, Lagom's `PersistentEntity`
  and Akka Persistence's persistent actor, and it says nothing of a replay. Its four entries are
  `@fgaudo/effect-tea-persistent`, `/program`, `/testing` and `/cluster`, as
  [decision 0193](0193-the-public-surface-is-four-entries.md) lists them. The keys of the library's symbols and
  services, and the names of its singletons on Cluster, start with the package's name, as effect-tea's keys start
  with `@fgaudo/effect-tea`.
- **The names of the singletons on Cluster are fixed from the first release.** A singleton's name is the prefix,
  the program's name and a number ([decision 0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)).
  A runner of a release with another prefix would run other singletons for the same shards. So a rename of the
  package after the first release keeps the old prefix.
- **A program's work is returned by `work`.** The glossary already called it work, and `noWork` and the type `Work`
  already existed. One piece of work, an operation or a timer, is the type `Piece`, which was `Durable`.
- **A reader calls `fetch`.** `handle.fetch(topic, consumer, limit, options)` gives a page of the topic past the
  consumer's cursors, and `ack` moves them. It is the pair of a pull consumer of NATS JetStream, a named consumer
  with stored positions that fetches a batch and acks it. The reader is the verb's subject. The design's prose says
  a consumer fills a report's store, where it said feeds.
- **`deploy` stays.** A process deploys a name once, and a new version is deployed by a new process. So
  `runtime.deploy(program)` happens at the deployment of a version, and only then: the two senses are one act. A
  rehearsal's `deploy` is the same act on the machine. The glossary says so.
- **Every other word stays.** `rehearse` stays, and so does every word shared with effect-tea: `program`, `init`,
  `update`, `flags`, `reject`, `defect`, `raise`, `child`, `each` and `part`.

## What it rests on

- That no package named `@fgaudo/effect-tea-persistent` or `effect-tea-persistent` is published: **seen** with
  `npm view` on 2026-11-08, which answered E404 for both. Only the owner of the scope `@fgaudo` publishes under it,
  so the scoped name stays free.
- That no export of Effect is named `fetch`, `work` or `Piece`, where a reader of Effect would read another sense:
  **read in a dependency's source**, `node_modules/effect/src` at 4.1.2. The module `http/FetchHttpClient.ts` has
  another name, and a method of a handle does not read as HTTP.
- That a rename of the singletons' prefix changes no row a test or a fixture holds: **tested**, since `bun test`
  passes with the new prefix, and the fixtures of Cluster in `spikes/fixtures` hold no singleton's name.
- That `effect/persistence`, Effect's module of key-value stores and persisted caches and queues, is not read as
  what the library is built on: **only reasoned**. The README's first sentence says the state is stored in SQL.

## Alternatives

- **`@fgaudo/effect-tea-entities`.** It names what the library holds, but the maintainer found that it does not
  call to mind what the library does.
- **`@fgaudo/effect-tea-server`.** Too generic, and read as a server-side rendering of effect-tea's programs.
- **`@fgaudo/effect-tea-stateful`, `-actors` or `-persisted`.** `stateful` fits effect-tea too, whose programs have
  a state, and does not say the state outlives the process. `actors` is the best known word for a thing with an id
  and a mailbox, but the design says entity, and Akka's sense carries a supervision the library does not promise.
  `persisted` says the same as `persistent`, and reads more passive.
- **`pull`** for a reader. It is Google Pub/Sub's pair with an acknowledgement. Effect's module `Pull` is the step
  of a stream's consumer, which a reader would read as Effect's type.
- **`receive`** for a reader, as SQS names it. An inbound message is received and handled in one event, so the
  word would name two things.
- **`host`, `register` or `mount`** for `deploy`. Each costs some 750 occurrences in the code and the documents,
  and the notes would keep `deploy` for good. `register` is Cluster's own word, `Sharding.registerEntity`, but the
  design already says a deploy registers its deployment, for an inner step. `serve` is `HttpServer.serve`'s.

## Consequences

- `package.json` is named `@fgaudo/effect-tea-persistent`, and the examples import its entries. The repository's
  folder and its address keep their name until the release, which writes `repository` and `homepage`.
- A program declares `work` in place of `durable`, and `Durable` is `Piece`. A handle has `fetch` in place of `feed`.
- The notes before this one, archived or not, keep `durable`, `Durable` and `feed`, since a note is never rewritten.
  The glossary's entries Work and Reader say so.
