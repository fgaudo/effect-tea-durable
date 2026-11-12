# 0277. A sum is refused by a count of its magnitudes that both dialects make alike

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 40. It changes
[decision 0209](0209-a-sum-is-refused-past-the-largest-double-alike-on-both-dialects.md): a sum is no longer refused
by its total of magnitudes read as a double, but by a count of those magnitudes in units of 2^980, which both
dialects compute exactly. The maintainer chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

Decision 0209 refused a sum when the total of its magnitudes was past the largest double. PostgreSQL added that
total exactly, as `NUMERIC`, and read it back as the nearest double. SQLite added it with `TOTAL`, a compensated sum
of doubles. Decision 0209 held that both dialects then refuse the same sums. That is false at the edge, which is bug
40 of the roadmap.

Over the amounts `Number.MAX_VALUE - 2^971`, `0.6 * 2^971` and `0.6 * 2^971`, PGlite read back `Number.MAX_VALUE`,
and SQLite refused the sum. A partial total of `TOTAL` overflows before its compensation corrects it. The exact total
is 0.2 of an ulp past the largest double, which rounds back to it.

No rule on a total of doubles makes both dialects refuse alike at its edge. PostgreSQL adds the decimals that JSON
wrote, and SQLite adds the doubles they read as, and each decimal is up to half an ulp from its double. Scaling
SQLite's numbers by a quarter holds the case above, but the opinion found sums near the edge that the two dialects
still read apart, and it loses the low bits of the numbers under the least normal double.

## Decision

- **A sum counts its magnitudes in units of 2^980.** Each number of the index, taken without its sign, is read as a
  double, multiplied by 2^-980, and cut to an integer toward zero. The statement adds those integers, and counts the
  rows that hold a number.
- **A sum is refused once the units and the count of numbers reach 2^44.** The call dies with an `InvariantDefect`
  that names the index and says its total may pass the largest double, and gives no total. Both dialects compute the
  units and the count exactly, so both refuse the same sums.
- **Below that bound no partial total overflows.** A cut loses less than a unit, so the magnitudes add up to less
  than `units + numbers` units, which is at most `2^1024 - numbers * 2^980`. Each addition rounds by at most half an
  ulp of the largest doubles, which is 2^970, so no partial total of either dialect reaches the point where a double
  overflows, `2^1024 - 2^970`.
- **The top of the range is refused.** A sum whose magnitudes lie within `numbers * 2^980` of 2^1024 is refused,
  where decision 0209 answered it. `sum` over one row of `Number.MAX_VALUE` is refused, since its units are
  `2^44 - 1`.
- **PostgreSQL counts no unit for a magnitude under 1e290.** Such a number would count no unit on SQLite either, and
  its product by 2^-980 under the least double fails the statement on PostgreSQL. The statement tests the magnitude
  before it multiplies.
- **The total is added as decision 0209 says.** PostgreSQL adds exactly and rounds once, SQLite adds with `TOTAL`,
  and the two may differ in the last digits by a few units of the last place of the total of magnitudes.
- **2^-980 is bound as a parameter.** A decimal of it written in the statement would not be read back exactly.

## What it rests on

- That both dialects give the same units and the same refusal at the bound: **tested**, by `a sum is answered one
  unit under the bound of its magnitudes, and refused at it` in [`src/storage.test.ts`](../../src/storage.test.ts), on
  SQLite and on PGlite, which fails against the code before the change. Its cases cut fractions of a unit, and mix
  signs. On a server of PostgreSQL, it runs in the job of PostgreSQL of the push of `main` that takes this note.
- That the amounts of bug 40 are refused alike: **tested**, by `a sum whose exact total of magnitudes reads back as
  the largest double is answered alike on both dialects` in [`src/contract.test.ts`](../../src/contract.test.ts),
  which failed before the change.
- That a cast of a `jsonb` number to `DOUBLE PRECISION` gives the double JavaScript wrote: **tested**, by the cases at
  the bound above, whose units differ by one where the double differs.
- That SQLite's cast of a real to an integer cuts toward zero: **documented**, by SQLite's page on `CAST`
  expressions.
- That a sum of integers under 2^53 is exact in doubles, so `TOTAL` gives the units exactly while they stay under
  the bound: **documented**, by IEEE 754, under which the sum of two doubles is the exact sum where a double holds
  it. Units past 2^53 may round, but stay past 2^44, so the sum is refused on both dialects.
- That a multiplication by 2^-980 of a double of at least 1e290 is exact: **documented**, by IEEE 754, since the
  product is a normal double.
- That PostgreSQL fails the statement on a product under the least double, so the statement must test the
  magnitude first: **seen**, on PGlite, by the script of the Fable 5.2 agent's opinion. The case of
  `Number.MIN_VALUE` in the test above runs the statement on such a magnitude.
- That no partial total of `TOTAL` overflows below the bound, by a margin of `numbers * (2^980 - 2^970)`: **documented**,
  by IEEE 754 for each addition, which rounds by at most half an ulp of its result. SQLite does not document the
  order of the additions of its compensated sum. The rule rests on each partial total staying under the magnitudes
  plus a rounding for each row, and the cases of the test at the bound are where it is **seen**.
- That the decimal JSON wrote and the double SQLite reads may stand on two sides of the edge, so a rule on the total
  read as a double differs between the dialects: **seen**, by the opinion's script, where `[Number.MAX_VALUE, 2^970]`
  is `Number.MAX_VALUE` on PGlite and refused by SQLite scaled by a quarter.
- That refusing the top `numbers * 2^980` of the range costs a caller nothing that matters: **chosen**, by the
  maintainer.

## Alternatives

- **SQLite scales its numbers by a quarter.** It holds the amounts of bug 40. The rounding of the compensated sum
  and the half an ulp between a decimal and its double still read some sums apart, and the numbers under the least
  normal double lose their low bits, which breaks the bound of the test of the dialects.
- **Both refuse once the total of magnitudes reaches 2^1023.** The same rounding stands at the new threshold, and
  half the range is lost.
- **The rule says the dialects may differ at the edge.** No code changes, and a caller of SQLite and a caller of
  PostgreSQL meet a refusal at different sums.
