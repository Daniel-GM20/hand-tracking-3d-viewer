import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface ExplodedPiece {
  object: THREE.Object3D;
  originalPosition: THREE.Vector3;
  /** Dirección de explosión en el espacio local del padre de la pieza. */
  direction: THREE.Vector3;
}

/**
 * Carga un GLB/GLTF, calcula por pieza un vector de explosión radial desde el
 * centro del modelo y anima setExplosion(factor 0..1) con interpolación suave.
 */
export class ExplodedModel {
  readonly root = new THREE.Group();
  /** Grupo pivote centrado en el modelo: destino de rotación/zoom globales. */
  readonly pivot = new THREE.Group();
  /** Pieza excluida de la animación de explosión (pieza seleccionada). */
  excluded: THREE.Object3D | null = null;

  private pieces: ExplodedPiece[] = [];
  private currentFactor = 0;
  private targetFactor = 0;
  private explosionDistance = 1.5;
  private loader = new GLTFLoader();
  private current?: THREE.Object3D;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.root.add(this.pivot);
  }

  get factor(): number {
    return this.currentFactor;
  }

  async loadUrl(url: string): Promise<void> {
    const gltf = await this.loader.loadAsync(url);
    this.setModel(gltf.scene);
  }

  async loadFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const gltf = await this.loader.parseAsync(buffer, '');
    this.setModel(gltf.scene);
  }

  /** Usa un Object3D ya construido (p.ej. modelo procedural de fallback). */
  setModel(model: THREE.Object3D): void {
    if (this.current) {
      this.pivot.remove(this.current);
      this.disposeObject(this.current);
    }
    this.current = model;
    this.currentFactor = 0;
    this.targetFactor = 0;
    this.excluded = null;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.scale.setScalar(1);

    this.fitModel(model);
    this.pivot.add(model);
    this.computePieces(model);
  }

  setExplosion(factor: number): void {
    this.targetFactor = THREE.MathUtils.clamp(factor, 0, 1);
  }

  /** Llamar cada frame: interpola hacia el factor objetivo. */
  update(dt: number): void {
    const diff = this.targetFactor - this.currentFactor;
    if (Math.abs(diff) < 0.0005) return;
    this.currentFactor += diff * Math.min(1, dt * 10);
    this.applyFactor(this.currentFactor);
  }

  private applyFactor(f: number): void {
    for (const p of this.pieces) {
      if (p.object === this.excluded) continue;
      p.object.position
        .copy(p.originalPosition)
        .addScaledVector(p.direction, f * this.explosionDistance);
    }
  }

  /**
   * Escala y centra el modelo en el origen del pivote; el pivote se eleva
   * para que el modelo quede sobre el grid. Así rotación/zoom giran en torno
   * al centro del modelo.
   */
  private fitModel(model: THREE.Object3D): void {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.5 / maxDim;
    model.scale.setScalar(scale);

    model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(model);
    const center = box2.getCenter(new THREE.Vector3());
    model.position.sub(center); // centro del modelo en el origen del pivote
    this.pivot.position.set(0, (box2.max.y - box2.min.y) / 2 + 0.4, 0);
  }

  /**
   * Identifica piezas: Meshes individuales del modelo. Para cada una calcula
   * la dirección radial (centro de pieza − centro del modelo) en espacio
   * mundo, convertida al espacio local de su padre.
   */
  private computePieces(model: THREE.Object3D): void {
    this.pieces = [];
    model.updateMatrixWorld(true);

    const modelBox = new THREE.Box3().setFromObject(model);
    const modelCenter = modelBox.getCenter(new THREE.Vector3());
    const modelSize = modelBox.getSize(new THREE.Vector3()).length() || 1;

    const meshes: THREE.Mesh[] = [];
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
    });

    let index = 0;
    for (const mesh of meshes) {
      const pieceBox = new THREE.Box3().setFromObject(mesh);
      if (pieceBox.isEmpty()) continue;
      const pieceCenter = pieceBox.getCenter(new THREE.Vector3());

      let dirWorld = pieceCenter.clone().sub(modelCenter);
      if (dirWorld.lengthSq() < 1e-8 * modelSize * modelSize) {
        // Pieza en el centro exacto: offset radial determinista.
        const angle = (index / Math.max(meshes.length, 1)) * Math.PI * 2;
        dirWorld = new THREE.Vector3(Math.cos(angle), 0.3, Math.sin(angle));
      }
      dirWorld.normalize();

      // Convertir dirección de mundo → espacio local del padre aplicando la
      // parte lineal de la inversa. NO se normaliza: su magnitud compensa la
      // escala del padre, de modo que explosionDistance son unidades de mundo.
      const parent = mesh.parent ?? model;
      const parentWorldInv = new THREE.Matrix4()
        .copy(parent.matrixWorld)
        .invert();
      const linear = new THREE.Matrix3().setFromMatrix4(parentWorldInv);
      const dirLocal = dirWorld.clone().applyMatrix3(linear);

      this.pieces.push({
        object: mesh,
        originalPosition: mesh.position.clone(),
        direction: dirLocal,
      });
      index++;
    }
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
  }
}
