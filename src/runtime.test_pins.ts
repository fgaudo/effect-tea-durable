/**
 * The seeds pinned in the explored tests, each with the rule it holds, written as a mutation that takes the rule out
 * (decision 0254). `bun run test:pins` runs each test under its pinned seeds alone, on the code as it is and with the
 * mutation made, and fails unless the test passes on the first and fails on the second. So a change that moves a
 * yield, and draws from a pinned seed a schedule that no longer reaches its interleaving, fails the job of the CI
 * that runs it, and the seed is found again as `AGENTS.md` says.
 *
 * A test of `src/form.test.ts` checks that every explored test with a seed pinned has a pin here, and that every pin
 * names a test that exists and pins a seed.
 */

/** A replacement of `find`, which occurs once in the file, by `replace`, as `scripts/mutate.ts` makes it. */
export type Edit = readonly [find: string, replace: string]

export type Pin = Readonly<{
  /** The rule the mutation takes out, as the decision that decides it and a few words. */
  id: string
  /** The file the edits apply to, from the root of the repository. */
  file: string
  edits: ReadonlyArray<Edit>
  /** The file of the test, from the root of the repository. */
  test: string
  /** The name of the test, whole. */
  name: string
}>

export const pins: ReadonlyArray<Pin> = [
  {
    id: '0067 a lock is dropped by its last user only',
    file: 'src/runtime/process.ts',
    edits: [['        if (lock.users === 0) p.locks.delete(address)', '        p.locks.delete(address)']],
    test: 'src/runtime/callers.test.ts',
    name: 'callers of an unloaded entity build one machine for it, under prioritized schedules from their arrival',
  },
  {
    id: '0068 an entity leaves and pokes the waker in one step',
    file: 'src/runtime/loop.ts',
    edits: [
      [
        '    forgetUse(p, loaded)\n    deployed.waker.busy = true',
        '    forgetUse(p, loaded)\n  }).pipe(Effect.andThen(Effect.sync(() => {\n    deployed.waker.busy = true',
      ],
      ['    Queue.offerUnsafe(deployed.waker.poke, undefined)\n    end(p)\n  })\n', '    Queue.offerUnsafe(deployed.waker.poke, undefined)\n    end(p)\n  })))\n'],
    ],
    test: 'src/runtime/loop.test.ts',
    name: 'settled never returns between a crash and the activation its due timer brings, under prioritized schedules',
  },
]
