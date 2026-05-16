import { describe, it, expect } from 'vitest';
import { buildCoChangeMatrix } from './coChangeMatrix';
import { NodeInfo } from '../models/NodeInfo';
import { EdgeInfo } from '../models/EdgeInfo';
import { RelationCategory, RelationType } from '../models/types';

function node(id: string, packageName: string): NodeInfo {
  return {
    id,
    simpleName: id.split('.').pop()!,
    packageName,
    filePath: '',
    type: 'CLASS',
    isInterface: false,
    isAbstract: false,
    metrics: {
      cbo: 0,
      lcom: 0,
      dit: 0,
      noc: 0,
      rfc: 0,
      numberOfMethods: 0,
      numberOfAttributes: 0,
      linesOfCode: 0,
    },
  };
}

function edge(
  source: string,
  target: string,
  category: RelationCategory,
  weight: number,
  type: RelationType = 'CO_CHANGE',
): EdgeInfo {
  return { source, target, type, category, weight };
}

describe('buildCoChangeMatrix', () => {
  it('returns empty matrix when nodes or edges are empty', () => {
    expect(buildCoChangeMatrix([], [])).toEqual({ packages: [], cells: [], maxWeight: 0 });
    expect(buildCoChangeMatrix([node('a.A', 'a')], [])).toEqual({
      packages: [],
      cells: [],
      maxWeight: 0,
    });
  });

  it('ignores non-LOGICAL edges', () => {
    const nodes = [node('a.A', 'a'), node('b.B', 'b')];
    const edges = [edge('a.A', 'b.B', 'STRUCTURAL', 1, 'METHOD_CALL')];
    expect(buildCoChangeMatrix(nodes, edges)).toEqual({ packages: [], cells: [], maxWeight: 0 });
  });

  it('aggregates a single inter-package logical edge', () => {
    const nodes = [node('a.A', 'a'), node('b.B', 'b')];
    const edges = [edge('a.A', 'b.B', 'LOGICAL', 0.6)];
    const matrix = buildCoChangeMatrix(nodes, edges);

    expect(matrix.packages).toEqual(['a', 'b']);
    expect(matrix.cells).toHaveLength(1);
    expect(matrix.cells[0]).toEqual({
      rowPackage: 'a',
      colPackage: 'b',
      totalWeight: 0.6,
      edgeCount: 1,
    });
    expect(matrix.maxWeight).toBe(0.6);
  });

  it('produces a diagonal cell for intra-package co-changes', () => {
    const nodes = [node('a.A', 'a'), node('a.B', 'a')];
    const edges = [edge('a.A', 'a.B', 'LOGICAL', 0.4)];
    const matrix = buildCoChangeMatrix(nodes, edges);

    expect(matrix.packages).toEqual(['a']);
    expect(matrix.cells).toHaveLength(1);
    expect(matrix.cells[0]).toMatchObject({ rowPackage: 'a', colPackage: 'a', edgeCount: 1 });
  });

  it('aggregates multiple edges between same package pair', () => {
    const nodes = [node('a.A', 'a'), node('a.B', 'a'), node('b.X', 'b'), node('b.Y', 'b')];
    const edges = [edge('a.A', 'b.X', 'LOGICAL', 0.3), edge('a.B', 'b.Y', 'LOGICAL', 0.5)];
    const matrix = buildCoChangeMatrix(nodes, edges);

    expect(matrix.cells).toHaveLength(1);
    expect(matrix.cells[0]).toEqual({
      rowPackage: 'a',
      colPackage: 'b',
      totalWeight: 0.8,
      edgeCount: 2,
    });
    expect(matrix.maxWeight).toBe(0.8);
  });

  it('normalizes pair order (a→b and b→a fold into the same cell)', () => {
    const nodes = [node('a.A', 'a'), node('b.B', 'b')];
    const edges = [edge('a.A', 'b.B', 'LOGICAL', 0.2), edge('b.B', 'a.A', 'LOGICAL', 0.3)];
    const matrix = buildCoChangeMatrix(nodes, edges);

    expect(matrix.cells).toHaveLength(1);
    expect(matrix.cells[0]).toMatchObject({
      rowPackage: 'a',
      colPackage: 'b',
      edgeCount: 2,
    });
    expect(matrix.cells[0].totalWeight).toBeCloseTo(0.5, 3);
  });

  it('labels empty package as (root)', () => {
    const nodes = [node('X', ''), node('Y', '')];
    const edges = [edge('X', 'Y', 'LOGICAL', 0.1)];
    const matrix = buildCoChangeMatrix(nodes, edges);

    expect(matrix.packages).toEqual(['(root)']);
    expect(matrix.cells[0]).toMatchObject({ rowPackage: '(root)', colPackage: '(root)' });
  });
});
