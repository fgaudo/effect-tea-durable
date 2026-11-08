/**
 * The bike's migrations, checked against the cases recorded when each was written. A migration once deployed is
 * never changed, since it is how the rows its version wrote are read, so a case holds for as long as the bike
 * carries the migration.
 */
import { expect, test } from 'bun:test'
import { type MigrationCase, migrationViolations } from '@fgaudo/effect-tea-persistent/testing'
import { bike } from './bike.ts'

// What version 1 wrote, and what version 2 reads of it: a bike of version 1 has had no ride counted.
const cases: ReadonlyArray<MigrationCase> = [
  {
    from: 1,
    of: 'state',
    written: { _tag: 'Docked', centsPerMinute: 20 },
    read: { _tag: 'Docked', centsPerMinute: 20, rides: 0 },
  },
  {
    from: 1,
    of: 'state',
    written: { _tag: 'Ridden', centsPerMinute: 20, ride: 'ride-1' },
    read: { _tag: 'Ridden', centsPerMinute: 20, rides: 0, ride: 'ride-1' },
  },
  {
    from: 1,
    of: 'projection',
    written: { status: 'Ridden', centsPerMinute: 20, canUnlock: false },
    read: { status: 'Ridden', centsPerMinute: 20, rides: 0, canUnlock: false },
  },
]

test('the bike reads what each version before it wrote', () => {
  expect(migrationViolations(bike, cases)).toEqual([])
})
