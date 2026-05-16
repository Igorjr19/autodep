import { describe, it, expect } from 'vitest';
import { circularFisheye } from './fisheye';

describe('circularFisheye', () => {
  it('returns the same coordinates with z=1 for points outside the radius', () => {
    const lens = circularFisheye().focus([0, 0]).radius(100).distortion(3);
    const p = lens(200, 0);
    expect(p.x).toBe(200);
    expect(p.y).toBe(0);
    expect(p.z).toBe(1);
  });

  it('maps the focus point itself with high magnification', () => {
    const lens = circularFisheye().focus([50, 50]).radius(100).distortion(3);
    const p = lens(50, 50);
    expect(p.x).toBe(50);
    expect(p.y).toBe(50);
    expect(p.z).toBeGreaterThan(1);
  });

  it('pushes points near the focus outward (magnification > 1)', () => {
    const lens = circularFisheye().focus([0, 0]).radius(100).distortion(3);
    const p = lens(10, 0);
    expect(p.x).toBeGreaterThan(10);
    expect(p.z).toBeGreaterThan(1);
  });

  it('updating focus moves the magnified region', () => {
    const lens = circularFisheye().radius(100).distortion(3).focus([0, 0]);
    const inside = lens(20, 0).z;
    lens.focus([200, 0]);
    const outside = lens(20, 0).z;
    expect(inside).toBeGreaterThan(1);
    expect(outside).toBe(1);
  });

  it('exposes current configuration via getters', () => {
    const lens = circularFisheye().radius(150).distortion(2.5).focus([10, 20]);
    expect(lens.getRadius()).toBe(150);
    expect(lens.getDistortion()).toBe(2.5);
    expect(lens.getFocus()).toEqual([10, 20]);
  });
});
