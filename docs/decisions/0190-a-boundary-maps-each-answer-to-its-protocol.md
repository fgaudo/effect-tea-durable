# 0190. A boundary maps each answer to its protocol, with one entry for each tag

**Status:** accepted, 2026-11-08, with the step The API before the release of the [roadmap](../roadmap.md).

## Context

A boundary over HTTP answers a caller with a status for each `Creation`, `Answer` and `Operated`.
[`examples/server/server.ts`](../../examples/server/server.ts) held the map as a `Record<string, number>` with a
default of `200`. The map left out `AlreadyExists` and `Full`, so a create of an order that existed was answered
`200`. The example runs on Cluster, where a caller is never answered `Full`
([decision 0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)). A
boundary on one process is answered `Full`, and its copy of the map would have answered it `200`. An application
copies the map from the example, so each copy would have held the same two holes.

## Decision

- **The library gives no map of an answer to a status.** The status is a choice of the boundary's protocol. One
  protocol answers a rejection `409` and another `422`, and a boundary may not speak HTTP at all: a queue, a socket,
  a call of RPC. The library exports the three unions as types, `Creation`, `Answer` and `Operated`, and a boundary
  matches on their `_tag`.
- **A boundary's map has one entry for each tag, checked by the compiler.** The example writes the map as an
  object that `satisfies Record<Answered['_tag'], HttpStatus.Literal>`, where `Answered` is the union of the three.
  A tag the map leaves out fails to compile, and so does a tag that no union holds. So a tag the library adds
  fails to compile in every boundary that copied the map, and is not answered with a default.
- **The example is the template, and answers a full entity `503`.** `Full` asks the caller to retry later under
  the same request id, and `503` is a status an HTTP client retries as transient. The answer carries
  `Retry-After`. The example never gives that answer on Cluster, and keeps the entry for the boundaries that copy
  it. A suspended entity stays `409`, since it waits for an operator and a retry does not help it.
  `AlreadyExists` is `409`.

## What it rests on

- That a create under another request id of an order that exists is answered `409` and `AlreadyExists`:
  **tested** by `an order whose process is killed during its charge is paid once by the process started again` in
  [`examples/server/server.test.ts`](../../examples/server/server.test.ts). The test failed with `200` against the
  map before this note.
- That `satisfies` on an object literal rejects a key left out of the `Record` and a key the `Record` does not
  have: **documented** by TypeScript, and **seen** by taking `Full` out of the map and adding a key `Extra`, each
  of which failed `bun run typecheck`.
- That `HttpClient.retryTransient` retries a `503` and not a `409`: **documented** in the JSDoc of
  `isTransientResponse` in `node_modules/effect/src/http/HttpClient.ts` at 4.1.2, which lists 408, 429, 500, 502,
  503 and 504. The module is `@stability unstable`, and only the example rests on it.
- That `HttpStatus.fromLiteral` gives the number of a status's name: **documented** in its JSDoc in
  `node_modules/effect/src/http/HttpStatus.ts` at 4.1.2, `@stability unstable`. Only the example imports it.

## Alternatives

Each structure of Effect that gives a status to an answer was weighed.

- **A function of the library from an answer to a status, as a number.** It needs no import of `effect/http`, but
  it decides a protocol's choice for every application, and a boundary that disagrees writes its own map anyway.
- **`HttpServerRespondable` on the answers.** An answer would turn itself into a response, as the example's
  `Refused` does. The answers are plain data that the machine and the storage write, and `src/` would import
  `effect/http`, an unstable module it does not import yet, for a choice of protocol.
- **`HttpApi` with `HttpApiSchema.status` on each member of a union of schemas.** It declares the statuses with the
  routes, and gives a client and OpenAPI. It needs a schema of each answer, which the library does not export, and
  it is a choice of how an application builds its API, not of the runtime. An application that uses `HttpApi`
  writes the same map as schemas.
- **`ProblemDetails` for the answers that are not a success.** It is a format of the body, and the example's
  callers read the answer's `_tag`. It changes no status, so it decides nothing here.
- **`HttpStatus.fromLiteral` in the map.** Taken in the example: the map names `Conflict` and `ServiceUnavailable`
  rather than `409` and `503`, so a reader checks it without a table of statuses.

## Consequences

- The design says, under The public surface, that the library gives no map of an answer to a status, and that a
  boundary's map has one entry for each tag.
- [`examples/server/server.ts`](../../examples/server/server.ts) holds the map, whose comment cites this note, and
  renames the schema of a create's body `NewOrder`, so that it no longer shares a name with the type `Creation`.
