/**
 * Genera IronMan-MarkVII.glb: traje estilizado multi-pieza con información
 * técnica por pieza (extras glTF ← userData). Para probar la carga de
 * modelos del usuario en la app (drag&drop / CARGAR GLB).
 *
 * Uso: node scripts/generate-ironman.mjs
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Polyfill mínimo para Node (GLTFExporter usa FileReader para el GLB binario).
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };
}

// --- Materiales ---
// Con algo de emissive para que luzcan con el bloom de la app (sin envMap
// los metales puros se ven negros).
const rojo = new THREE.MeshStandardMaterial({
  color: 0xc4102f, metalness: 0.75, roughness: 0.3,
  emissive: 0x4a0410, emissiveIntensity: 0.8,
});
const oro = new THREE.MeshStandardMaterial({
  color: 0xe8b437, metalness: 0.85, roughness: 0.22,
  emissive: 0x5c4008, emissiveIntensity: 0.8,
});
const oscuro = new THREE.MeshStandardMaterial({
  color: 0x3a4552, metalness: 0.8, roughness: 0.45,
  emissive: 0x101820, emissiveIntensity: 0.6,
});
const energia = new THREE.MeshStandardMaterial({
  color: 0x9ffcff, emissive: 0x7df9ff, emissiveIntensity: 1.0,
  metalness: 0.2, roughness: 0.15,
});

const suit = new THREE.Group();
suit.name = 'IronMan_MarkVII';

function piece(name, geometry, material, { pos, rot, scale, info }) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (pos) mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  mesh.userData = info;
  suit.add(mesh);
  return mesh;
}

// --- Cabeza ---
piece('Casco', new THREE.SphereGeometry(0.16, 32, 24), rojo, {
  pos: [0, 1.85, 0], scale: [1, 1.15, 1.05],
  info: {
    componente: 'Casco Mark VII',
    material: 'Aleación oro-titanio',
    sistema: 'HUD holográfico + J.A.R.V.I.S.',
    función: 'Protección craneal y centro de mando',
    blindaje: 'Clase X — impacto balístico',
  },
});
piece('Placa facial', new THREE.SphereGeometry(0.145, 32, 24), oro, {
  pos: [0, 1.84, 0.05], scale: [0.85, 1.05, 0.75],
  info: {
    componente: 'Máscara facial retráctil',
    material: 'Oro-titanio pulido',
    función: 'Sellado hermético y visión aumentada',
    despliegue: 'Servo-actuadores 0.3 s',
  },
});
piece('Visor ocular', new THREE.BoxGeometry(0.17, 0.028, 0.04), energia, {
  pos: [0, 1.88, 0.14],
  info: {
    componente: 'Lentes de proyección',
    sistema: 'Visión térmica / nocturna / espectral',
    función: 'Interfaz visual del HUD',
    consumo: '12 W',
  },
});

// --- Torso ---
piece('Coraza pectoral', new THREE.BoxGeometry(0.5, 0.42, 0.28), rojo, {
  pos: [0, 1.45, 0],
  info: {
    componente: 'Coraza pectoral',
    material: 'Nanocompuesto de titanio',
    función: 'Protección de órganos vitales y soporte del reactor',
    blindaje: 'Clase XII — antitanque',
  },
});
piece('Placa dorada pectoral', new THREE.BoxGeometry(0.3, 0.22, 0.03), oro, {
  pos: [0, 1.48, 0.15],
  info: {
    componente: 'Carenado frontal',
    material: 'Oro-titanio',
    función: 'Disipación térmica del reactor',
  },
});
piece('Reactor Arc', new THREE.CylinderGeometry(0.07, 0.07, 0.035, 24), energia, {
  pos: [0, 1.5, 0.17], rot: [Math.PI / 2, 0, 0],
  info: {
    componente: 'Reactor Arc de paladio v2',
    potencia: '3 GW continuos / 8 GW pico',
    función: 'Fuente de energía principal del traje',
    autonomía: 'Ilimitada (fusión fría)',
  },
});
piece('Anillo del reactor', new THREE.TorusGeometry(0.085, 0.018, 12, 32), oro, {
  pos: [0, 1.5, 0.165],
  info: {
    componente: 'Anillo de contención magnética',
    material: 'Superconductor de niobio',
    función: 'Confinamiento del plasma del reactor',
  },
});
piece('Placa abdominal', new THREE.BoxGeometry(0.36, 0.28, 0.24), rojo, {
  pos: [0, 1.13, 0],
  info: {
    componente: 'Sección abdominal articulada',
    material: 'Escamas de titanio superpuestas',
    función: 'Flexibilidad del torso con blindaje continuo',
  },
});
piece('Placa pélvica', new THREE.BoxGeometry(0.4, 0.17, 0.26), oscuro, {
  pos: [0, 0.97, 0],
  info: {
    componente: 'Cinturón estructural',
    material: 'Carburo de tungsteno',
    función: 'Núcleo de carga: une torso y tren inferior',
  },
});

// --- Espalda ---
for (const [side, sx] of [['izquierda', -1], ['derecha', 1]]) {
  piece(`Aleta dorsal ${side}`, new THREE.BoxGeometry(0.05, 0.4, 0.16), oscuro, {
    pos: [sx * 0.15, 1.5, -0.19], rot: [0.15, 0, sx * -0.2],
    info: {
      componente: `Estabilizador de vuelo ${side}`,
      material: 'Fibra de carbono-titanio',
      función: 'Control aerodinámico supersónico',
      velocidadMáx: 'Mach 1.8',
    },
  });
}

// --- Brazos ---
for (const [side, sx] of [['izquierdo', -1], ['derecho', 1]]) {
  piece(`Hombrera ${side.replace('o', 'a')}`, new THREE.SphereGeometry(0.13, 24, 16), rojo, {
    pos: [sx * 0.34, 1.62, 0], scale: [1.2, 0.8, 1.1],
    info: {
      componente: `Hombrera ${side.replace('o', 'a')}`,
      material: 'Aleación oro-titanio',
      función: 'Articulación blindada del hombro',
      armamento: 'Micro-misiles antipersona (×6)',
    },
  });
  piece(`Brazo superior ${side}`, new THREE.CapsuleGeometry(0.09, 0.25, 8, 16), rojo, {
    pos: [sx * 0.42, 1.42, 0], rot: [0, 0, sx * -0.12],
    info: {
      componente: `Bíceps blindado ${side}`,
      material: 'Titanio nanoestructurado',
      función: 'Amplificación de fuerza ×40',
      servos: 'Hidráulica de alta presión',
    },
  });
  piece(`Guantelete ${side}`, new THREE.CapsuleGeometry(0.085, 0.24, 8, 16), oro, {
    pos: [sx * 0.46, 1.1, 0], rot: [0, 0, sx * -0.08],
    info: {
      componente: `Guantelete ${side}`,
      material: 'Oro-titanio reforzado',
      función: 'Protección del antebrazo y control fino',
      sistema: 'Lanzallamas + interfaz táctil',
    },
  });
  piece(`Repulsor palmar ${side}`, new THREE.CylinderGeometry(0.05, 0.05, 0.025, 20), energia, {
    pos: [sx * 0.48, 0.92, 0.03], rot: [Math.PI / 2, 0, 0],
    info: {
      componente: `Repulsor de palma ${side}`,
      potencia: '2 GJ por descarga',
      función: 'Propulsión vectorial y arma de energía',
      cadencia: '1 disparo / 0.8 s',
    },
  });
}

// --- Piernas ---
for (const [side, sx] of [['izquierdo', -1], ['derecho', 1]]) {
  const sideA = side.replace('o', 'a');
  piece(`Muslo ${side}`, new THREE.CapsuleGeometry(0.11, 0.3, 8, 16), rojo, {
    pos: [sx * 0.14, 0.72, 0],
    info: {
      componente: `Muslo blindado ${side}`,
      material: 'Titanio nanoestructurado',
      función: 'Soporte de carga y absorción de impacto',
      compartimento: 'Bengalas + kit de supervivencia',
    },
  });
  piece(`Espinilla ${sideA}`, new THREE.CapsuleGeometry(0.095, 0.3, 8, 16), rojo, {
    pos: [sx * 0.15, 0.36, 0],
    info: {
      componente: `Espinillera ${sideA}`,
      material: 'Aleación oro-titanio',
      función: 'Protección tibial y conducto de refrigeración',
    },
  });
  piece(`Bota ${sideA}`, new THREE.BoxGeometry(0.16, 0.12, 0.3), oro, {
    pos: [sx * 0.15, 0.08, 0.05],
    info: {
      componente: `Bota ${sideA}`,
      material: 'Compuesto de tungsteno',
      función: 'Aterrizaje de alto impacto',
      amortiguación: 'Absorbe caídas de 30 m',
    },
  });
  piece(`Propulsor de bota ${side}`, new THREE.CylinderGeometry(0.055, 0.07, 0.05, 20), energia, {
    pos: [sx * 0.15, 0.015, -0.02],
    info: {
      componente: `Turbina de vuelo ${sideA}`,
      potencia: '650 kg de empuje',
      función: 'Sustentación y vuelo supersónico',
      velocidadMáx: 'Mach 1.8 a nivel del mar',
    },
  });
}

// --- Exportar GLB ---
const scene = new THREE.Scene();
scene.add(suit);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (result) => {
    const outPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../IronMan-MarkVII.glb',
    );
    writeFileSync(outPath, Buffer.from(result));
    const pieces = suit.children.length;
    console.log(`OK: ${outPath} (${(result.byteLength / 1024).toFixed(1)} KB, ${pieces} piezas)`);
  },
  (err) => {
    console.error('Error exportando:', err);
    process.exit(1);
  },
  { binary: true },
);
