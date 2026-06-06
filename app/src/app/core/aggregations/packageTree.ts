import { NodeInfo } from '../models/NodeInfo';
import { PackageMetrics } from '../models/PackageMetrics';
import { aggregatePackageMetrics } from './packageMetrics';

const ROOT_PACKAGE_LABEL = '(root)';

export interface TreemapClass {
  readonly id: string;
  readonly simpleName: string;
  readonly loc: number;
  readonly cbo: number;
  readonly node: NodeInfo;
}

export interface TreemapPackage extends PackageMetrics {
  readonly classes: readonly TreemapClass[];
}

/**
 * Constrói a hierarquia pacote → classes para o treemap aninhado.
 * Reaproveita aggregatePackageMetrics para os agregados de pacote (ordenados por
 * LOC total) e anexa a lista de classes de cada pacote (ordenadas por LOC).
 */
export function buildPackageTree(nodes: readonly NodeInfo[]): TreemapPackage[] {
  const metrics = aggregatePackageMetrics(nodes);
  if (metrics.length === 0) return [];

  const classesByPackage = new Map<string, TreemapClass[]>();
  for (const n of nodes) {
    const key = n.packageName === '' ? ROOT_PACKAGE_LABEL : n.packageName;
    const cls: TreemapClass = {
      id: n.id,
      simpleName: n.simpleName,
      loc: n.metrics.linesOfCode,
      cbo: n.metrics.cbo,
      node: n,
    };
    const bucket = classesByPackage.get(key);
    if (bucket) bucket.push(cls);
    else classesByPackage.set(key, [cls]);
  }

  return metrics.map((m) => {
    const classes = (classesByPackage.get(m.name) ?? []).sort((a, b) => b.loc - a.loc);
    return { ...m, classes };
  });
}
