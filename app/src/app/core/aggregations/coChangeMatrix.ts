import { NodeInfo } from '../models/NodeInfo';
import { EdgeInfo } from '../models/EdgeInfo';
import { CoChangeCell, CoChangeMatrix } from '../models/CoChangeMatrix';

const ROOT_PACKAGE_LABEL = '(root)';
const EMPTY_MATRIX: CoChangeMatrix = { packages: [], cells: [], maxWeight: 0 };

export function buildCoChangeMatrix(
  nodes: readonly NodeInfo[],
  edges: readonly EdgeInfo[],
): CoChangeMatrix {
  if (nodes.length === 0 || edges.length === 0) return EMPTY_MATRIX;

  const idToPackage = new Map<string, string>();
  for (const node of nodes) {
    idToPackage.set(node.id, node.packageName === '' ? ROOT_PACKAGE_LABEL : node.packageName);
  }

  type MutableCell = {
    rowPackage: string;
    colPackage: string;
    totalWeight: number;
    edgeCount: number;
  };
  const cellMap = new Map<string, MutableCell>();

  for (const edge of edges) {
    if (edge.category !== 'LOGICAL') continue;
    const srcPkg = idToPackage.get(edge.source);
    const tgtPkg = idToPackage.get(edge.target);
    if (srcPkg === undefined || tgtPkg === undefined) continue;

    const [rowPackage, colPackage] = srcPkg <= tgtPkg ? [srcPkg, tgtPkg] : [tgtPkg, srcPkg];
    const key = `${rowPackage}|${colPackage}`;
    const existing = cellMap.get(key);
    if (existing) {
      existing.totalWeight += edge.weight;
      existing.edgeCount += 1;
    } else {
      cellMap.set(key, { rowPackage, colPackage, totalWeight: edge.weight, edgeCount: 1 });
    }
  }

  if (cellMap.size === 0) return EMPTY_MATRIX;

  const packagesSet = new Set<string>();
  for (const cell of cellMap.values()) {
    packagesSet.add(cell.rowPackage);
    packagesSet.add(cell.colPackage);
  }
  const packages = [...packagesSet].sort();

  let maxWeight = 0;
  const cells: CoChangeCell[] = [];
  for (const c of cellMap.values()) {
    const totalWeight = round3(c.totalWeight);
    if (totalWeight > maxWeight) maxWeight = totalWeight;
    cells.push({
      rowPackage: c.rowPackage,
      colPackage: c.colPackage,
      totalWeight,
      edgeCount: c.edgeCount,
    });
  }

  return { packages, cells, maxWeight };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
