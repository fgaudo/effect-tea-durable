/**
 * The entry of a launcher on Effect Cluster: `sharding`, the layer of a runner's `Sharding`, and `launch`, the
 * runtime of a runner. `Recorded` is exported as a type alone, so that a launcher names the layer's output and builds
 * no `Recorded` without `sharding` (decisions 0174, 0193).
 *
 * @module @fgaudo/effect-tea-persistent/cluster
 */
export { launch, type Recorded, sharding } from './cluster.ts'
