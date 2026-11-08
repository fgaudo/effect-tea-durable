# 0123. An idempotent runner may be given the digest of its key, as its delivery

**Status:** accepted, 2026-11-04. Decides the open question on idempotency keys that services cap. Adds a fourth
delivery to the three of [decision 0011](0011-an-operation-declares-what-a-crash-does.md), and a second form
to the idempotency key of [decision 0015](0015-a-request-belongs-to-its-sender.md). `digestOf` is a function of
`src/machine.ts`, and `src/program.ts` imports no module of Node, since
[decision 0192](../0192-the-digest-of-a-key-is-computed-by-the-machine.md).

## Context

An idempotency key is readable JSON: the entity's program name and id, the work's key and its incarnation
([decision 0015](0015-a-request-belongs-to-its-sender.md)). An entity's id may be long, and a payment
provider caps the length of a key (Stripe at 255 characters). The question was who turns the key into one a
service takes, with what function, and how it stays the same across versions and deploys. A key that changed
between two deploys would run an operation under way again under a new key, and charge twice.

A runner could hash the key inside its own `run`. A deploy that adds that hash to a runner already in use would
then change the key of every operation under way, and nothing would see it. It is the hole
[decision 0022](0022-a-new-program-keeps-what-work-started-with.md) closed for how an operation is
delivered: a property of the work under way was held in code, and not in what is stored.

## Decision

- **A runner declared with `operation.digest(run)` is given the digest of the idempotency key**, and not the
  readable key. Its delivery is `IdempotentDigest`. A crash does to it what it does to an idempotent operation: it
  runs again, under the same key. `operation(run)` gives the readable key, as before.
- **The digest is the SHA-256 of the readable key's UTF-8 bytes, in unpadded base64url**: 43 characters of
  `[A-Za-z0-9_-]`, whatever the length of the id. `digestOf` in [`src/program.ts`](../../../src/program.ts) computes it,
  and the library exports it. It is fixed by this note, and never changes: a different function or encoding would be
  a new delivery.
- **The key's form is part of the delivery the runtime stores with each operation under way**
  ([decision 0022](0022-a-new-program-keeps-what-work-started-with.md)). A new program that declares the
  digest of an operation under way, or drops it, is a defect at activation, as one that changes its delivery is.
  A deploy that changes the form waits for the operations of that kind to complete.
- **What the runtime gives a runner is a pure function of what is stored.** The machine computes the key a runner is
  given, from the entity's address, the work's key, its incarnation and its stored delivery, and puts it on
  `Started`. So a restart gives the same key, and a rehearsal's `pending` gives the key the runner is given.
- **The digest is computed synchronously**, with `createHash` of `node:crypto`. Effect's `Digest` runs SHA-256
  only on `crypto.subtle`, which answers with a promise: the machine is synchronous, and the scheduler of the tests
  resolves no promise. Anything a runner needs that waits on I/O is done inside its `run`, which the runtime
  already awaits.

## What it rests on

- That SHA-256 gives the same bytes for the same input on every platform and release: **documented**, by
  FIPS 180-4, which fixes the function. `createHash('sha256')` is Node's API, which Bun implements.
- That `digestOf` computes that function, in that encoding: **tested**, `the digest of an idempotency key is the
  SHA-256 of its JSON, in unpadded base64url`, in [`src/program.test.ts`](../../../src/program.test.ts). Its digests
  were computed apart from the code, with Python's `hashlib`. A change of the function, of the encoding or of
  Bun's `node:crypto` fails it.
- That `Base64Url.encode` gives unpadded base64url, with `-` and `_`: **documented**, in its JSDoc in
  `node_modules/effect/src/encoding/Base64Url.ts`, marked `@stability stable`.
- That the readable key's bytes stay the same: **documented**, by ECMA-262. `JSON.stringify` of strings and an
  integer is fixed, and since ES2019 it escapes a lone surrogate as `\uXXXX`, which UTF-8 would otherwise turn
  into U+FFFD. **Tested** by the same test: two ids made of different lone surrogates keep different digests.
- That a key's stored delivery makes a change of form under way a defect at activation: **tested**, `declaring the
  digest of an operation under way is a defect, as changing its delivery is`, in
  [`src/machine.test.ts`](../../../src/machine.test.ts).
- That an operation declared with its digest is started with it, and with the same one after a restart: **tested**,
  `an operation declared with its digest is started with the digest of its idempotency key`, which fails without
  this note.
- That the storage reads the new delivery back: **tested**, `an operation given the digest of its idempotency key is
  loaded as delivered so`, in [`src/storage.test.ts`](../../../src/storage.test.ts).
- That a release from before this note fails the load of an entity whose operation under way has the new delivery,
  instead of running it with the readable key: **read in the code**. The storage decodes a delivery with
  `Schema.Literals`, which rejects a value it does not list, and a row no version reads fails what reads it
  ([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)). The test of the storage above fails
  when the literal is taken out of the schema.
- That a promise is never resolved under the scheduler of the tests: **read in the code**, the JSDoc of
  `scheduled` in [`src/testing.ts`](../../../src/testing.ts).
- That 43 characters fit the services a program calls: **only reasoned**. Stripe's cap of 255 is the open
  question's, not looked up again, and some services may cap a key lower.
- That two keys never share a digest: **only reasoned**, from the 256 bits of SHA-256.

## Alternatives

- **The digest for every idempotent runner.** It bounds every key, and sends no id to a service outside. A
  service would show only opaque keys, and a program that wants them readable could not have them.
- **A helper that a runner calls inside its `run`.** Adding it to a runner in use would change the key of the
  operations under way, and run them again under a new key, in silence.
- **Effect's `Digest`, taken from the deployment's context.** The key would be computed by the runtime and by the
  rehearsal, each with its own copy, and not by the machine. The deployment would have to give a layer, and the
  tests a synchronous one. It would also open a place where an effect computes what a runner is given, from
  something that is not stored.
- **Hex.** It gives 64 characters of letters and digits, which fits fewer caps than 43.
- **A separate stored column for the key's form.** A release from before it would not read the column. It would
  run the operation with the readable key, and charge twice, in silence.

## Consequences

- A rollback to a release from before this note fails the load of an entity whose operation under way is given
  the digest, until the operation completes or the newer release returns. So does an older runner of a rolling
  deploy on Cluster. The failure is loud, and runs nothing twice.
- A service that caps a key below 43 characters, or takes another alphabet, gets a key the runner turns into its
  own. That form is the runner's, and the library does not keep it: the runner fixes it at its first deploy, and a
  change of it is a change of key.
- A key with a secret in it, an HMAC, would hold the secret's version in what is stored. It would be a decision of
  its own.
- `src/program.ts` is the first module of `src/` that imports from `node:`. The library runs on Bun, which
  implements `node:crypto`.
- The order example gives the payment provider the digest, for its charges and its refunds.
