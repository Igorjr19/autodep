import { describe, it, expect } from 'vitest';
import { buildPackageTree } from './packageTree';
import { NodeInfo } from '../models/NodeInfo';

function makeNode(id: string, packageName: string, loc: number, cbo = 0): NodeInfo {
  return {
    id,
    simpleName: id.split('.').pop()!,
    packageName,
    filePath: '',
    type: 'CLASS',
    isInterface: false,
    isAbstract: false,
    metrics: {
      cbo,
      lcom: 0,
      dit: 0,
      noc: 0,
      rfc: 0,
      numberOfMethods: 0,
      numberOfAttributes: 0,
      linesOfCode: loc,
    },
  };
}

describe('buildPackageTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildPackageTree([])).toEqual([]);
  });

  it('groups classes under their package', () => {
    const tree = buildPackageTree([
      makeNode('a.X', 'a', 50),
      makeNode('a.Y', 'a', 70),
      makeNode('b.Z', 'b', 30),
    ]);

    expect(tree).toHaveLength(2);
    const a = tree.find((p) => p.name === 'a')!;
    expect(a.classes.map((c) => c.id)).toEqual(['a.Y', 'a.X']); // sorted by LOC desc
    expect(a.totalLoc).toBe(120);
    expect(tree.find((p) => p.name === 'b')!.classes).toHaveLength(1);
  });

  it('orders packages by total LOC descending', () => {
    const tree = buildPackageTree([
      makeNode('small.A', 'small', 10),
      makeNode('big.B', 'big', 500),
    ]);
    expect(tree.map((p) => p.name)).toEqual(['big', 'small']);
  });

  it('labels empty package as (root) and attaches its classes', () => {
    const tree = buildPackageTree([makeNode('X', '', 10)]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('(root)');
    expect(tree[0].classes[0].id).toBe('X');
  });

  it('keeps the original NodeInfo reference on each class', () => {
    const node = makeNode('a.X', 'a', 5);
    const tree = buildPackageTree([node]);
    expect(tree[0].classes[0].node).toBe(node);
  });
});
