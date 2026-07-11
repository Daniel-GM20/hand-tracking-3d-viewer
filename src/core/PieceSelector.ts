import * as THREE from 'three';
import type { ExplodedModel } from './ExplodedModel';

interface Snapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

const HOVER_COLOR = 0x00d4ff;
const SELECT_COLOR = 0xffc14d;

/**
 * "Láser invisible": raycast desde la punta del índice hacia la escena.
 * Ilumina la pieza bajo el cursor, la selecciona, y permite rotarla/escalarla
 * en torno a su centro geométrico. Al deseleccionar restaura la transformación
 * que tenía al momento de seleccionarla (posición original o explosionada).
 */
export class PieceSelector {
  selected: THREE.Mesh | null = null;

  private raycaster = new THREE.Raycaster();
  private hovered: THREE.Mesh | null = null;
  private savedMaterial = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private snapshot: Snapshot | null = null;
  private zoomBaseScale = new THREE.Vector3(1, 1, 1);

  constructor(
    private camera: THREE.Camera,
    private model: ExplodedModel,
  ) {}

  /** Apunta con coords de video (0..1, sin espejar); espeja para pantalla. */
  pointAt(videoX: number, videoY: number): void {
    const ndc = new THREE.Vector2((1 - videoX) * 2 - 1, -(videoY * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.model.root, true);
    const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh);
    this.setHover((hit?.object as THREE.Mesh) ?? null);
  }

  clearPointer(): void {
    this.setHover(null);
  }

  /** Selecciona la pieza bajo el cursor. Devuelve la pieza o null. */
  select(): THREE.Mesh | null {
    if (!this.hovered || this.selected) return null;
    const mesh = this.hovered;
    this.setHover(null);

    this.selected = mesh;
    this.snapshot = {
      position: mesh.position.clone(),
      quaternion: mesh.quaternion.clone(),
      scale: mesh.scale.clone(),
    };
    this.model.excluded = mesh;
    this.applyHighlight(mesh, SELECT_COLOR, 0.85);
    return mesh;
  }

  /** Deselecciona y restaura la transformación previa de la pieza. */
  deselect(): void {
    if (!this.selected) return;
    const mesh = this.selected;
    if (this.snapshot) {
      mesh.position.copy(this.snapshot.position);
      mesh.quaternion.copy(this.snapshot.quaternion);
      mesh.scale.copy(this.snapshot.scale);
    }
    this.restoreMaterial(mesh);
    this.model.excluded = null;
    this.selected = null;
    this.snapshot = null;
  }

  /** Rota la pieza seleccionada en torno a su centro (ejes de mundo Y/X). */
  rotateSelected(yaw: number, pitch: number): void {
    const mesh = this.selected;
    if (!mesh) return;
    this.preserveCenter(mesh, () => {
      this.rotateWorld(mesh, new THREE.Vector3(0, 1, 0), yaw);
      this.rotateWorld(mesh, new THREE.Vector3(1, 0, 0), pitch);
    });
  }

  /** Guarda la escala base al iniciar un gesto de zoom sobre la pieza. */
  beginZoom(): void {
    if (this.selected) this.zoomBaseScale.copy(this.selected.scale);
  }

  /** Escala la pieza (mult relativo al inicio del gesto), centro fijo. */
  scaleSelected(mult: number): void {
    const mesh = this.selected;
    if (!mesh) return;
    const m = THREE.MathUtils.clamp(mult, 0.4, 4);
    this.preserveCenter(mesh, () => {
      mesh.scale.copy(this.zoomBaseScale).multiplyScalar(m);
    });
  }

  // --- Highlight ---

  private setHover(mesh: THREE.Mesh | null): void {
    if (mesh === this.hovered) return;
    if (this.hovered) this.restoreMaterial(this.hovered);
    this.hovered = mesh;
    if (mesh) this.applyHighlight(mesh, HOVER_COLOR, 0.6);
  }

  private applyHighlight(mesh: THREE.Mesh, color: number, intensity: number): void {
    if (this.savedMaterial.has(mesh)) return;
    this.savedMaterial.set(mesh, mesh.material);
    const clone = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      const std = c as THREE.MeshStandardMaterial;
      if (std.emissive !== undefined) {
        std.emissive = new THREE.Color(color);
        std.emissiveIntensity = intensity;
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(clone)
      : clone(mesh.material);
  }

  private restoreMaterial(mesh: THREE.Mesh): void {
    const original = this.savedMaterial.get(mesh);
    if (!original) return;
    const clones = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const c of clones) c.dispose();
    mesh.material = original;
    this.savedMaterial.delete(mesh);
  }

  // --- Transformaciones en torno al centro geométrico ---

  private geometryCenter(mesh: THREE.Mesh): THREE.Vector3 {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
  }

  /** Ejecuta fn y recoloca la pieza para que su centro no se desplace. */
  private preserveCenter(mesh: THREE.Mesh, fn: () => void): void {
    const c = this.geometryCenter(mesh);
    mesh.updateMatrixWorld(true);
    const before = mesh.localToWorld(c.clone());
    fn();
    mesh.updateMatrixWorld(true);
    const after = mesh.localToWorld(c.clone());

    const deltaWorld = before.sub(after);
    const parent = mesh.parent!;
    const parentInv = new THREE.Matrix3().setFromMatrix4(
      new THREE.Matrix4().copy(parent.matrixWorld).invert(),
    );
    mesh.position.add(deltaWorld.applyMatrix3(parentInv));
  }

  /** Rotación sobre un eje de MUNDO real (soporta padres rotados). */
  private rotateWorld(mesh: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const parentQ = new THREE.Quaternion();
    mesh.parent!.getWorldQuaternion(parentQ);
    const worldQ = parentQ.clone().multiply(mesh.quaternion);
    const newWorldQ = q.multiply(worldQ);
    mesh.quaternion.copy(parentQ.invert().multiply(newWorldQ));
  }
}
