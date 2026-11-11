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
    id: '0063 a sender registers for the resumption before it sends',
    file: 'src/runtime/callers.ts',
    edits: [
      [
        '        const attempt = Effect.flatMap(awaitResumption(p, { name: program.name, id }, waiting), ({ resumed, forget }) =>\n          Effect.flatMap(\n            unlessCrashed(send(p, deployed, id, message, request), null),',
        '        const attempt = Effect.flatMap(unlessCrashed(send(p, deployed, id, message, request), null), (sent) =>\n          Effect.flatMap(awaitResumption(p, { name: program.name, id }, waiting), ({ resumed, forget }) =>\n          Effect.flatMap(\n            Effect.succeed(sent),',
      ],
      ['          ).pipe(Effect.ensuring(forget)))\n', '          ).pipe(Effect.ensuring(forget))))\n'],
    ],
    test: 'src/runtime/callers.test.ts',
    name: 'a sender answered Suspended is woken by the resumption, under prioritized schedules from its arrival',
  },
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
  {
    id: '0068 the waker looks for a poke and clears its flag in one step',
    file: 'src/runtime/waker.ts',
    edits: [
      [
        "      Effect.sync(() => {\n        if (Queue.sizeUnsafe(waker.poke) > 0) return 'poked' as const\n",
        "      Effect.flatMap(Effect.sync(() => Queue.sizeUnsafe(waker.poke) > 0), (poked) => Effect.sync(() => {\n        if (poked) return 'poked' as const\n",
      ],
      ['        return after\n      })\n    )\n', '        return after\n      }))\n    )\n'],
    ],
    test: 'src/runtime/waker.test.ts',
    name: 'settled never returns while the waker rests from a reading another entity left during, under bounded schedules',
  },
  {
    id: '0163 a reading\'s count is raised and lowered in one acquisition',
    file: 'src/runtime/readings.ts',
    edits: [
      [
        '      yield* Effect.acquireUseRelease(\n',
        '      yield* ((acquire: Effect.Effect<void>, use: () => Effect.Effect<unknown>, release: () => Effect.Effect<void>) =>\n        Effect.andThen(acquire, Effect.ensuring(use(), release())))(\n',
      ],
    ],
    test: 'src/runtime/readings.test.ts',
    name: 'a reading interrupted as it begins its wait leaves the watcher still, under every schedule of one deviation',
  },
  {
    id: '0163 the watcher\'s version is kept while no reading waits',
    file: 'src/runtime.ts',
    edits: [
      [
        '          yield* readings.waiting.await\n',
        '          if (readings.count === 0) {\n            yield* readings.waiting.await\n            seen = yield* read(seen)\n          }\n',
      ],
    ],
    test: 'src/runtime/readings.test.ts',
    name: 'a reading is woken by a commit of another runner between its page and its wait, under prioritized schedules',
  },
  {
    id: '0185 an inspection reads one snapshot',
    file: 'src/storage/entities.ts',
    edits: [['    snapshot(entity(id)).pipe(\n', '    entity(id).pipe(\n']],
    test: 'src/runtime.test.ts',
    name: 'an inspection reads one snapshot, so a step that commits meanwhile is read whole, under prioritized schedules',
  },
  {
    id: '0119 the drain takes the signal before it looks',
    file: 'src/runtime.ts',
    edits: [
      [
        '      const next = p.ended\n      return drained() ? Effect.void : Effect.flatMap(Deferred.await(next), () => emptied)\n',
        '      return Effect.flatMap(Effect.sync(drained), (empty) =>\n        empty ? Effect.void : Effect.flatMap(Effect.sync(() => p.ended), (next) => Effect.flatMap(Deferred.await(next), () => emptied)))\n',
      ],
    ],
    test: 'src/runtime.test.ts',
    name: 'the drain waits for the completion of an at-most-once operation, under prioritized schedules',
  },
  {
    id: '0142 a reading takes its topic\'s signal before it reads',
    file: 'src/runtime/readings.ts',
    edits: [
      [
        '      const commit = commitOf(p.readings, name, topic)\n      const page = yield* read\n',
        '      const page = yield* read\n      const commit = commitOf(p.readings, name, topic)\n',
      ],
    ],
    test: 'src/runtime.test.ts',
    name: 'a consumer that waits is given the row a step commits while it reads, under prioritized schedules',
  },
  {
    id: '0109 an entity that leaves is counted from before it leaves',
    file: 'src/runtime/loop.ts',
    edits: [
      [
        '      Effect.sync(() => {\n        p.leaving += 1\n      }),\n      () =>\n        Effect.gen(function*() {\n          yield* leave(p, deployed, loaded)\n',
        '      Effect.andThen(leave(p, deployed, loaded), Effect.sync(() => {\n        p.leaving += 1\n      })),\n      () =>\n        Effect.gen(function*() {\n',
      ],
    ],
    test: 'src/runtime/loop.test.ts',
    name: 'a process over its capacity unloads its least recently used idle entity, under prioritized schedules',
  },
  {
    id: '0079 an activation offers its caller\'s event under the same hold of the lock',
    file: 'src/runtime/loop.ts',
    edits: [
      [
        '  const loading = held(Effect.gen(function*() {\n    const loaded = deployed.loaded.get(id)\n    if (loaded !== undefined) return yield* found(loaded)\n    const stored = yield* deployed.storage.load(id)\n    return yield* found(stored === null ? null : yield* activate(p, deployed, stored))\n  }))\n',
        '  const loading = Effect.flatMap(held(Effect.gen(function*() {\n    const loaded = deployed.loaded.get(id)\n    if (loaded !== undefined) return loaded\n    const stored = yield* deployed.storage.load(id)\n    return stored === null ? null : yield* activate(p, deployed, stored)\n  })), found)\n',
      ],
    ],
    test: 'src/runtime/loop.test.ts',
    name: 'callers of two unloaded entities over a capacity of one are both answered, under prioritized schedules',
  },
  {
    id: '0079 what runs detached is counted from the uninterruptible step that forks it',
    file: 'src/runtime/loop.ts',
    edits: [
      [
        '    Effect.uninterruptible(Effect.gen(function*() {',
        '    Effect.andThen(Effect.sync(() => {\n      p.detachments += 1\n    }), Effect.gen(function*() {',
      ],
      ['      p.detachments += 1\n      const fiber', '      const fiber'],
    ],
    test: 'src/runtime/loop.test.ts',
    name: 'a caller interrupted anywhere as it activates its entity leaves the process able to settle',
  },
  {
    id: '0147 a caller takes its permit and offers its message in one uninterruptible region',
    file: 'src/runtime/callers.ts',
    edits: [
      [
        '      return Effect.uninterruptible(Effect.flatMap(loaded.callers.takeIfAvailable(1), offered))\n',
        '      return Effect.flatMap(Effect.tap(loaded.callers.takeIfAvailable(1), () => Effect.yieldNow), offered)\n',
      ],
    ],
    test: 'src/runtime/loop.test.ts',
    name: 'a caller interrupted anywhere as it sends leaves its entity’s bound whole, in every schedule within one deviation',
  },
  {
    id: '0067 the load is under the entity\'s lock',
    file: 'src/runtime/process.ts',
    edits: [['    (lock) => lock.semaphore.withPermits(1)(effect),\n', '    () => effect,\n']],
    test: 'src/runtime/loop.test.ts',
    name: 'two callers of an entity not loaded build one machine for it, under prioritized schedules',
  },
  {
    id: '0116 an end an earlier wait put in the queue is passed over',
    file: 'src/runtime/loop.ts',
    edits: [
      [
        "      (taken) => taken._tag === 'Passivate' && taken.wait !== wait ? take : Effect.succeed(taken),\n",
        '      (taken) => Effect.succeed(taken),\n',
      ],
    ],
    test: 'src/runtime/loop.test.ts',
    name: 'an entity whose wait runs out as an event arrives waits again from the event, under prioritized schedules',
  },
  {
    id: '0261 the drain counts the entities of a deployment still activating',
    file: 'src/runtime.ts',
    edits: [['      for (const deployed of p.made) {\n', '      for (const deployed of p.deployments.values()) {\n']],
    test: 'src/runtime.test.ts',
    name: 'a drain that looks while a deploy activates closes on no at-most-once operation the deploy stores, under every deviation',
  },
]
