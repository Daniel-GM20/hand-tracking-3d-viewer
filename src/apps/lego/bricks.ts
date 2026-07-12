import * as THREE from 'three';

/** Pitch entre studs (unidades de mundo). */
export const STUD = 0.5;
/** Altura de ladrillo y de placa. */
export const BRICK_H = 0.6;
export const PLATE_H = 0.2;

export interface BrickDef {
  id: string;
  /** Studs en X. */
  w: number;
  /** Studs en Z. */
  l: number;
  /** 'brick' o 'plate'. */
  kind: 'brick' | 'plate';
  color: number;
  label: string;
}

/** Catálogo beta: 12 piezas. */
export const BRICK_CATALOG: BrickDef[] = [
  { id: 'b1x1', w: 1, l: 1, kind: 'brick', color: 0xd11f2f, label: '1×1' },
  { id: 'b1x2', w: 1, l: 2, kind: 'brick', color: 0xff8a3d, label: '1×2' },
  { id: 'b1x3', w: 1, l: 3, kind: 'brick', color: 0xffd34d, label: '1×3' },
  { id: 'b1x4', w: 1, l: 4, kind: 'brick', color: 0xa8e05f, label: '1×4' },
  { id: 'b1x6', w: 1, l: 6, kind: 'brick', color: 0x2bd88f, label: '1×6' },
  { id: 'b2x2', w: 2, l: 2, kind: 'brick', color: 0x35d1c3, label: '2×2' },
  { id: 'b2x3', w: 2, l: 3, kind: 'brick', color: 0x6ee7ff, label: '2×3' },
  { id: 'b2x4', w: 2, l: 4, kind: 'brick', color: 0x2b6cff, label: '2×4' },
  { id: 'b2x6', w: 2, l: 6, kind: 'brick', color: 0xc26bff, label: '2×6' },
  { id: 'b2x8', w: 2, l: 8, kind: 'brick', color: 0xff5d9e, label: '2×8' },
  { id: 'p2x4', w: 2, l: 4, kind: 'plate', color: 0xf2f5f7, label: 'P 2×4' },
  { id: 'p4x4', w: 4, l: 4, kind: 'plate', color: 0x8a97a5, label: 'P 4×4' },
];

export function brickHeight(def: BrickDef): number {
  return def.kind === 'plate' ? PLATE_H : BRICK_H;
}

/**
 * Construye la malla de un ladrillo: caja + studs cilíndricos.
 * El origen queda en el centro de la base (y=0 → apoyo).
 */
export function createBrickMesh(def: BrickDef, opacity = 1): THREE.Group {
  const group = new THREE.Group();
  const h = brickHeight(def);
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    metalness: 0.1,
    roughness: 0.35,
    emissive: new THREE.Color(def.color).multiplyScalar(0.18),
    transparent: opacity < 1,
    opacity,
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(def.w * STUD, h, def.l * STUD),
    mat,
  );
  body.position.y = h / 2;
  group.add(body);

  const studGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 14);
  for (let i = 0; i < def.w; i++) {
    for (let j = 0; j < def.l; j++) {
      const stud = new THREE.Mesh(studGeo, mat);
      stud.position.set(
        (i - (def.w - 1) / 2) * STUD,
        h + 0.06,
        (j - (def.l - 1) / 2) * STUD,
      );
      group.add(stud);
    }
  }
  return group;
}

export function disposeBrick(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
}
