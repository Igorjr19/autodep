import { NodeInfo } from '../models/NodeInfo';
import { PackageMetrics } from '../models/PackageMetrics';

const ROOT_PACKAGE_LABEL = '(root)';

export function aggregatePackageMetrics(nodes: readonly NodeInfo[]): PackageMetrics[] {
  if (nodes.length === 0) return [];

  const groups = new Map<string, NodeInfo[]>();
  for (const node of nodes) {
    const key = node.packageName === '' ? ROOT_PACKAGE_LABEL : node.packageName;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(node);
    } else {
      groups.set(key, [node]);
    }
  }

  const result: PackageMetrics[] = [];
  for (const [name, classes] of groups) {
    const classCount = classes.length;
    let totalLoc = 0;
    let sumCbo = 0;
    let sumLcom = 0;
    let sumDit = 0;
    let sumRfc = 0;

    for (const c of classes) {
      totalLoc += c.metrics.linesOfCode;
      sumCbo += c.metrics.cbo;
      sumLcom += c.metrics.lcom;
      sumDit += c.metrics.dit;
      sumRfc += c.metrics.rfc;
    }

    result.push({
      name,
      classCount,
      totalLoc,
      meanCbo: round2(sumCbo / classCount),
      meanLcom: round2(sumLcom / classCount),
      meanDit: round2(sumDit / classCount),
      meanRfc: round2(sumRfc / classCount),
    });
  }

  result.sort((a, b) => b.totalLoc - a.totalLoc);
  return result;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
