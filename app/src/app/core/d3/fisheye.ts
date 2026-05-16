export interface FisheyePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FisheyeLens {
  (x: number, y: number): FisheyePoint;
  focus(focus: readonly [number, number]): FisheyeLens;
  radius(r: number): FisheyeLens;
  distortion(d: number): FisheyeLens;
  getFocus(): readonly [number, number];
  getRadius(): number;
  getDistortion(): number;
}

export function circularFisheye(): FisheyeLens {
  let radius = 200;
  let distortion = 2;
  let focus: readonly [number, number] = [0, 0];
  let k0 = 0;
  let k1 = 0;

  function project(x: number, y: number): FisheyePoint {
    const dx = x - focus[0];
    const dy = y - focus[1];
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd === 0) return { x, y, z: Math.min(k0, 10) };
    if (dd >= radius) return { x, y, z: 1 };
    const k = ((k0 * (1 - Math.exp(-dd * k1))) / dd) * 0.75 + 0.25;
    return { x: focus[0] + dx * k, y: focus[1] + dy * k, z: Math.min(k, 10) };
  }

  function rescale(): FisheyeLens {
    k0 = Math.exp(distortion);
    k0 = (k0 / (k0 - 1)) * radius;
    k1 = distortion / radius;
    return lens;
  }

  const lens = project as FisheyeLens;
  lens.focus = (f: readonly [number, number]) => {
    focus = f;
    return lens;
  };
  lens.radius = (r: number) => {
    radius = r;
    return rescale();
  };
  lens.distortion = (d: number) => {
    distortion = d;
    return rescale();
  };
  lens.getFocus = () => focus;
  lens.getRadius = () => radius;
  lens.getDistortion = () => distortion;

  return rescale();
}
