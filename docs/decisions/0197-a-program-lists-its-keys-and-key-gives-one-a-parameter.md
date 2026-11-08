# 0197. A program lists its keys, and `key` gives one a parameter

**Status:** accepted, 2026-11-08. Changes the first point of
[decision 0132](archive/0132-a-key-may-take-a-parameter.md): a program declared its keys as a record, with `null`
for a key without a parameter. Changes the point of [decision 0180](0180-a-program-leaves-out-what-it-does-not-have.md)
that says `keys` left out is `{}`: it is the empty list. Its first premise holds only of a list written in the call:
a list typed `string[]` does not compile, by [decision 0199](0199-a-list-of-keys-names-each-key-by-a-literal-type.md).

## Context

Decision 0132 declared a program's keys as a record, `keys: { fee: null, charge: Schema.String }`. It weighed the
shape of the record against a list of names beside a record of schemas. It did not weigh how a key without a
parameter is written, and `null` was the simplest value.

Every example declares only keys without a parameter, so every example writes `null` after each name. The quick start
reads `keys: { expiry: null }`. A reader must know that a key may take a parameter before the `null` means anything,
and the quick start has not said so. Keys with a parameter appear only in the tests of `src/`.

Every other piece a declaration holds is written with a constructor of the library: `operation(run)`,
`timer(at, message)`, `child(part, …)` and `each(part, …)`. `null` was the one piece written as a bare value.

## Decision

- **A declaration lists its keys.** A key without a parameter is its name: `keys: ['expiry']`. A key with a
  parameter is `key(name, schema)`: `keys: ['fee', key('charge', Schema.String)]`. The name and the schema of a key
  are still declared in one place, inside one entry of the list
  ([decision 0035](archive/0035-one-place-where-a-program-is-declared.md)).
- **`key` is exported by the program's entry.** It returns a `KeyWithParameter`, branded as a `Timer` is, so that
  `program` and `part` tell it from a name. `DeclaredKeys` is the type of the list.
- **A name listed twice is a defect where the program is declared.** A record could not hold a name twice, and a list
  can. `program` and `part` refuse a name listed twice, with or without a parameter, as they refuse a parent's name
  with a `.` ([decision 0133](archive/0133-an-entity-composes-children-as-effect-tea-does.md)). The types do not
  refuse it. A check in the types would be heavy, and the defect is raised where the module that declares the program
  is first loaded, before anything runs.
- **A program and a part still hold their keys as a record.** `program` and `part` make of the list the record that
  `Keys` types, with `null` for a key without a parameter. The machine, the storage, `rehearse` and the composition
  read that record, as before. So nothing stored changes, and a `Program` written as an object, as the tests of the
  machine write it, still holds a record.

## What it rests on

- That a `const` type parameter infers a list of string literals and `key` calls as a readonly tuple, so that the
  names are literal types: **tested** by every program of the examples and of `src/fixtures`, whose `work` compiles
  only under the keys it declares, and by
  `the work under a key with a parameter is a list of pairs typed by its schema, and pending takes the parameter` in
  [`src/program.test.ts`](../../src/program.test.ts).
- That a name listed twice is refused: **tested** by
  `a name listed twice among the keys is refused where it is declared, with or without a parameter` in
  [`src/program.test.ts`](../../src/program.test.ts).

## Alternatives

Each structure of Effect that could do the work was weighed.

- **`Schema.Void` for no parameter, as `Rpc.make` of `effect/rpc` gives to a payload left out.** A key is an entry of
  a record or a list, which cannot be left out as an option of `Rpc.make` is. `void` encodes to `undefined`, which
  JSON does not hold ([decision 0030](archive/0030-a-schema-encodes-to-json.md)).
- **`Schema.Null` for no parameter.** `null` is a parameter JSON holds, so the schema would declare a key whose
  parameter is `null`, which is another key.
- **`key()` in the record, as in `keys: { expiry: key(), charge: key(Schema.String) }`.** It keeps the record, which
  holds a name once. Every key without a parameter still carries an entry after its name, and that is every key the
  examples declare.
- **A constant, such as `plain`, or `true`, in place of `null`.** Either is as arbitrary as `null`, and a constant is
  one more word to define.
- **The names in `keys` and the schemas in a record `parameters` beside it.** A key with a parameter is then declared
  in two fields, which decision 0132 refused.
- **`null` kept.** It costs nothing, and the first program a reader sees is the one that needs a rule to read.

## Consequences

- Every declaration of `src/`, `src/fixtures`, the examples, the spikes and the README lists its keys.
- The design says how keys are declared, under A program and Keys with a parameter.
