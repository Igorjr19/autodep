import { describe, it, expect } from 'vitest';
import { aggregatePackageMetrics } from './packageMetrics';
import { NodeInfo } from '../models/NodeInfo';

function makeNode(overrides: Partial<NodeInfo> & { id: string }): NodeInfo {
  return {
    id: overrides.id,
    simpleName: overrides.simpleName ?? overrides.id.split('.').pop()!,
    packageName: overrides.packageName ?? '',
    filePath: overrides.filePath ?? '',
    type: overrides.type ?? 'CLASS',
    isInterface: overrides.isInterface ?? false,
    isAbstract: overrides.isAbstract ?? false,
    metrics: {
      cbo: 0,
      lcom: 0,
      dit: 0,
      noc: 0,
      rfc: 0,
      numberOfMethods: 0,
      numberOfAttributes: 0,
      linesOfCode: 0,
      ...overrides.metrics,
    },
  };
}

describe('aggregatePackageMetrics', () => {
  it('returns empty array for empty input', () => {
    expect(aggregatePackageMetrics([])).toEqual([]);
  });

  it('aggregates a single class as one package entry', () => {
    const nodes = [
      makeNode({
        id: 'a.B',
        packageName: 'a',
        metrics: { cbo: 5, lcom: 0.4, dit: 1, noc: 0, rfc: 10, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 100 },
      }),
    ];
    const result = aggregatePackageMetrics(nodes);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'a',
      classCount: 1,
      totalLoc: 100,
      meanCbo: 5,
      meanLcom: 0.4,
      meanDit: 1,
      meanRfc: 10,
    });
  });

  it('groups classes by package and computes correct means', () => {
    const nodes = [
      makeNode({
        id: 'a.X',
        packageName: 'a',
        metrics: { cbo: 4, lcom: 0.2, dit: 1, noc: 0, rfc: 8, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 50 },
      }),
      makeNode({
        id: 'a.Y',
        packageName: 'a',
        metrics: { cbo: 6, lcom: 0.4, dit: 2, noc: 0, rfc: 12, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 70 },
      }),
      makeNode({
        id: 'b.Z',
        packageName: 'b',
        metrics: { cbo: 1, lcom: 0, dit: 0, noc: 0, rfc: 2, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 30 },
      }),
    ];
    const result = aggregatePackageMetrics(nodes);

    expect(result).toHaveLength(2);
    const a = result.find((p) => p.name === 'a')!;
    const b = result.find((p) => p.name === 'b')!;

    expect(a.classCount).toBe(2);
    expect(a.totalLoc).toBe(120);
    expect(a.meanCbo).toBe(5);
    expect(a.meanLcom).toBe(0.3);
    expect(a.meanDit).toBe(1.5);
    expect(a.meanRfc).toBe(10);

    expect(b.classCount).toBe(1);
    expect(b.totalLoc).toBe(30);
  });

  it('labels empty package name as (root)', () => {
    const nodes = [
      makeNode({
        id: 'X',
        packageName: '',
        metrics: { cbo: 0, lcom: 0, dit: 0, noc: 0, rfc: 0, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 10 },
      }),
    ];
    const result = aggregatePackageMetrics(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('(root)');
  });

  it('orders result by totalLoc descending', () => {
    const nodes = [
      makeNode({ id: 'small.A', packageName: 'small', metrics: { cbo: 0, lcom: 0, dit: 0, noc: 0, rfc: 0, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 10 } }),
      makeNode({ id: 'big.B', packageName: 'big', metrics: { cbo: 0, lcom: 0, dit: 0, noc: 0, rfc: 0, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 500 } }),
      makeNode({ id: 'mid.C', packageName: 'mid', metrics: { cbo: 0, lcom: 0, dit: 0, noc: 0, rfc: 0, numberOfMethods: 0, numberOfAttributes: 0, linesOfCode: 100 } }),
    ];
    const result = aggregatePackageMetrics(nodes);

    expect(result.map((p) => p.name)).toEqual(['big', 'mid', 'small']);
  });
});
