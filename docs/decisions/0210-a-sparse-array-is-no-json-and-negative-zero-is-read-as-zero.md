# 0210. A sparse array is no JSON, and `-0` is read back as `0`

**Status:** accepted, 2026-11-09. Changes [decision 0040](archive/0040-what-is-stored-encodes-to-json-as-it-is.md),
whose check lets through what `JSON.stringify` writes and reads back as it is.

## Context

`encode` of [`src/program.ts`](../../src/program.ts) refuses a value that JSON would not give back as it is: a
number that is not finite, an object that is not plain, a function, `undefined`
([decision 0040](archive/0040-what-is-stored-encodes-to-json-as-it-is.md)). The test
`a value encode lets through is read back from its JSON as it was, and every value of JSON is let through` of
[`src/program.test.ts`](../../src/program.test.ts) generates values with fast-check, and found two that `encode`
let through and JSON gives back otherwise.

- **A sparse array.** The check read an array with `every`, which passes over a hole. `JSON.stringify` writes a
  hole as `null`, so `[, 1]` was stored and read back as `[null, 1]`.
- **`-0`.** The check reads a number by whether it is finite, and `-0` is. `JSON.stringify` writes it as `0`.

## Decision

- **A sparse array is no JSON.** The check reads every index of an array, and a hole is refused as `undefined` is.
  A step that stores one is a defect, and a message that encodes to one is its caller's defect, as decision 0040
  says of every value JSON does not hold.
- **`-0` is let through, and read back as `0`.** The two are equal under `===`, and the machine compares what it
  stores by its JSON, where they are one value. A step whose arithmetic gives `-0`, such as `-1 * 0`, would
  otherwise suspend its entity for a value no program means to tell from `0`. Only `Object.is` and a division by
  the value tell them apart.

## What it rests on

- That `Array.prototype.every` passes over a hole, and that `JSON.stringify` writes a hole as `null` and `-0` as
  `0`: **documented**, by ECMAScript's algorithms of `Array.prototype.every` and `SerializeJSONProperty`.
- That the check holds for every value fast-check generates, sparse arrays, objects with no prototype and keys such
  as `__proto__` among them: **tested**, by the test named above, which fails on `[,]` against the code before the
  change.

## Alternatives

- **`-0` refused.** It keeps the promise of decision 0040 to the letter, and makes a defect of a value every
  comparison of a program reads as `0`.
- **A hole written as `null`.** It changes the value a program stored without telling it, which decision 0040
  refuses for every other value.
