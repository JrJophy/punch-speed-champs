import * as THREE from "three";

const _u = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Two-bone analytic IK.
 * `upper` sits at the origin of its parent and its geometry points down local -Y.
 * `lower` is parented to `upper` at (0, -l1, 0) and also points down local -Y.
 * `target` and `pole` are expressed in the space of `upper.parent`.
 */
export function solveLimb(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  l1: number,
  l2: number,
) {
  const maxLen = (l1 + l2) * 0.995;
  const minLen = Math.abs(l1 - l2) + 0.02;
  _u.copy(target);
  const d = THREE.MathUtils.clamp(_u.length(), minLen, maxLen);
  if (_u.lengthSq() < 1e-8) _u.set(0, -1, 0);
  _u.normalize();
  _t.copy(_u).multiplyScalar(d);

  const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));

  _n.copy(_u).cross(pole);
  if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0);
  _n.normalize();

  _d1.copy(_u).applyAxisAngle(_n, a);
  _y.copy(_d1).negate();
  _x.copy(_n);
  _z.copy(_x).cross(_y).normalize();
  _x.copy(_y).cross(_z).normalize();
  _m.makeBasis(_x, _y, _z);
  upper.quaternion.setFromRotationMatrix(_m);

  _elbow.copy(_d1).multiplyScalar(l1);
  _d2.copy(_t).sub(_elbow);
  if (_d2.lengthSq() < 1e-8) _d2.copy(_d1);
  else _d2.normalize();
  const theta = Math.acos(THREE.MathUtils.clamp(_d1.dot(_d2), -1, 1));
  lower.rotation.set(-theta, 0, 0);
}

/** Frame-rate independent approach toward a target vector. */
export function dampV3(current: THREE.Vector3, target: THREE.Vector3, lambda: number, delta: number) {
  const k = 1 - Math.exp(-lambda * delta);
  current.x += (target.x - current.x) * k;
  current.y += (target.y - current.y) * k;
  current.z += (target.z - current.z) * k;
}

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** Small deterministic noise generator so each fighter fidgets differently. */
export function noise1(t: number, seed: number) {
  return (
    Math.sin(t * 1.13 + seed * 3.7) * 0.5 +
    Math.sin(t * 0.47 + seed * 8.1) * 0.32 +
    Math.sin(t * 2.31 + seed * 1.9) * 0.18
  );
}
