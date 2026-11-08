# 0192. The digest of an idempotency key is computed by the machine, and `src/program.ts` reaches no module of Node

**Status:** proposed, 2026-11-08, for the step The API before the release of the [roadmap](../roadmap.md). Changes
[decision 0123](archive/0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md), whose `digestOf` made
`src/program.ts` the first module of `src/` to import from `node:`.

## Context

A program is declared in [`src/program.ts`](../../src/program.ts), with its schemas. A module that shares those
schemas with a browser, such as the messages a view sends, imports `src/program.ts`. That module imported
`createHash` from `node:crypto` for `digestOf`, so a bundler for the browser would fail on it, or ship a polyfill.

Nothing in a program calls `digestOf`. The machine calls it when it gives a runner declared with `operation.digest`
the key of an operation it starts. `rehearse` and the runtime read that key from the machine.

## Decision

- **`digestOf` is a function of [`src/machine.ts`](../../src/machine.ts).** The machine computes the key each runner
  is given, readable or as its digest, where the operation starts. The digest is the same SHA-256 in unpadded
  base64url as before, so no key of an operation under way changes.
- **`digestOf` stays exported by [`src/index.ts`](../../src/index.ts),** from the machine, for a test that checks
  the key a service received.
- **`src/program.ts` reaches no module of Node or of Bun.** A test reads what it imports, then what each module of
  `src/` and of Effect it reaches imports, and fails on a specifier of the platform. A rule of the form of the code
  is kept by a test that reads the code, as [decision 0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md)
  keeps two others.

## What it rests on

- That `src/program.ts`, and every module of `src/` and of Effect it reaches, imports no module of Node or of Bun:
  **tested** by `src/program.ts reaches no module of Node or of Bun, through src and Effect` in
  [`src/form.test.ts`](../../src/form.test.ts). Before the change the test found `node:crypto`. The walk reads
  Effect's modules in `node_modules/effect/dist`, as `Bun.resolveSync` resolves them, which is what a bundler loads.
- That Effect resolves a module to the same file for every platform: **read in a dependency's source**, the
  `exports` of `node_modules/effect/package.json` at 4.1.2. Each entry is a path, or `null` for the internal
  modules, and none has a condition of `browser` or `node`. A release of Effect that adds such a condition would let the test read a file the browser does not.
- That the digest a runner is given is the same after the move: **tested** by `the digest of an idempotency key is
  the SHA-256 of its JSON, in unpadded base64url`, moved to [`src/machine.test.ts`](../../src/machine.test.ts), whose
  digests were computed apart from this code.
- That the machine runs only where `node:crypto` is: **only reasoned**. `rehearse` and the runtime import the
  machine, and both run on Bun, which implements `node:crypto`. A rehearsal run in a browser would need the
  module, and none is planned.

## Alternatives

Each structure of Effect that gives a digest was weighed.

- **`Digest` of `effect/crypto`.** Its JSDoc at 4.1.2 says the SHA algorithms run on `crypto.subtle`, which answers
  with a promise, and the service is given by a layer. The key a runner is given is a pure function of what is
  stored, computed by the machine, which runs no effect. Decision 0123 rejected it for that reason, and it still
  holds. The module is also `@stability unstable`.
- **`Hash` of `effect/Hash`.** It gives a small number for the buckets of Effect's structures, which its JSDoc at
  4.1.2 says is not a cryptographic digest. A key needs a digest of a fixed algorithm, since a key that changed
  would run an operation under way again.
- **A SHA-256 written in TypeScript in `src/program.ts`, as Effect vendors MD5.** It keeps `digestOf` portable,
  at the price of a hash to keep correct by hand. Effect exports no SHA-256 in TypeScript, only MD5. A program in a
  browser has no use for a digest.
- **The runtime and `rehearse` compute the digest from the readable key the machine gives.** The machine is the
  oracle the runtime's tests compare with. Its output would no longer be the key a runner is given, and two copies
  would compute it.
- **An entry point of the package for the browser.** The package has no `exports` yet, and is private. The entry
  points are the release's, and `src/program.ts` is the module such an entry would name.
