import { expect, test } from 'bun:test'

import { environment } from './mutate.ts'

test('the first pass runs without SCHEDULES and SEED, and the second under SCHEDULES=all alone', () => {
  const shell = { PATH: '/bin', SCHEDULES: 'all', SEED: '7' }
  expect(environment('some', shell)).toEqual({ PATH: '/bin' })
  expect(environment('all', shell)).toEqual({ PATH: '/bin', SCHEDULES: 'all' })
})
