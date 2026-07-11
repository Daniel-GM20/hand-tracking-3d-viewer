import * as THREE from 'three';

function holoMaterial(color: number, emissiveIntensity = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.75,
    roughness: 0.3,
    emissive: new THREE.Color(color).multiplyScalar(0.5),
    emissiveIntensity,
  });
}

/**
 * Dron/nave multi-pieza generado con primitivas de Three.js.
 * Funciona sin red: garantiza que la demo siempre tenga un modelo explosionable.
 */
export function createProceduralDrone(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ProceduralDrone';

  const hull = holoMaterial(0x2a6f8f);
  const accent = holoMaterial(0x0fd6ff, 0.8);
  const dark = holoMaterial(0x1a2733, 0.15);
  const warm = holoMaterial(0xff9d3d, 0.6);

  // Cuerpo central
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 8, 24), hull);
  body.rotation.z = Math.PI / 2;
  body.name = 'Fuselaje central';
  body.userData = {
    componente: 'Fuselaje',
    material: 'Aleación de titanio',
    función: 'Chasis principal y soporte estructural',
    peso: '4.2 kg',
  };
  group.add(body);

  // Cabina
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), accent);
  cockpit.position.set(0.75, 0.18, 0);
  cockpit.name = 'Cúpula de sensores';
  cockpit.userData = {
    componente: 'Cúpula frontal',
    material: 'Policarbonato blindado',
    función: 'Alojamiento de cámara y LIDAR',
    peso: '0.8 kg',
  };
  group.add(cockpit);

  // Anillo central
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 12, 40), accent);
  ring.rotation.y = Math.PI / 2;
  ring.name = 'Anillo estabilizador';
  ring.userData = {
    componente: 'Anillo giroscópico',
    material: 'Fibra de carbono',
    función: 'Estabilización inercial de vuelo',
    peso: '0.6 kg',
  };
  group.add(ring);

  // Brazos + motores + hélices (4 esquinas)
  const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.15, 10);
  const motorGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 14);
  const propGeo = new THREE.BoxGeometry(0.85, 0.02, 0.09);
  const positions: Array<[number, number]> = [
    [0.85, 0.85], [0.85, -0.85], [-0.85, 0.85], [-0.85, -0.85],
  ];
  let n = 0;
  for (const [x, z] of positions) {
    n++;
    const arm = new THREE.Mesh(armGeo, dark);
    arm.position.set(x * 0.55, 0, z * 0.55);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = Math.atan2(z, x) + Math.PI / 2;
    arm.rotation.x = Math.PI / 2;
    arm.name = `Brazo ${n}`;
    arm.userData = {
      componente: `Brazo soporte ${n}`,
      material: 'Aluminio 7075',
      función: 'Unión fuselaje–motor',
    };
    group.add(arm);

    const motor = new THREE.Mesh(motorGeo, hull);
    motor.position.set(x, 0.1, z);
    motor.name = `Motor ${n}`;
    motor.userData = {
      componente: `Motor brushless ${n}`,
      potencia: '920 KV / 380 W',
      función: 'Propulsión y sustentación',
      peso: '0.3 kg',
    };
    group.add(motor);

    const prop = new THREE.Mesh(propGeo, warm);
    prop.position.set(x, 0.28, z);
    prop.rotation.y = Math.atan2(z, x);
    prop.name = `Hélice ${n}`;
    prop.userData = {
      componente: `Hélice ${n}`,
      material: 'Nylon reforzado',
      diámetro: '21 cm',
      función: 'Generación de empuje',
    };
    group.add(prop);
  }

  // Patas de aterrizaje (sin userData: demuestran el fallback de info)
  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8);
  let l = 0;
  for (const [x, z] of [[0.4, 0.35], [0.4, -0.35], [-0.4, 0.35], [-0.4, -0.35]] as Array<[number, number]>) {
    l++;
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(x, -0.55, z);
    leg.name = `Pata de aterrizaje ${l}`;
    group.add(leg);
  }

  // Sensores / antenas
  const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 8), warm);
  antenna.position.set(-0.6, 0.45, 0);
  antenna.name = 'Antena de comunicaciones';
  antenna.userData = {
    componente: 'Antena RF',
    banda: '2.4 / 5.8 GHz',
    función: 'Telemetría y control remoto',
  };
  group.add(antenna);

  const sensor = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), accent);
  sensor.position.set(0, -0.5, 0);
  sensor.name = 'Sensor ventral';
  sensor.userData = {
    componente: 'Módulo de sensores',
    tipo: 'Ultrasónico + flujo óptico',
    función: 'Altitud y posicionamiento',
  };
  group.add(sensor);

  // Placas laterales
  const plateGeo = new THREE.BoxGeometry(0.7, 0.35, 0.04);
  let s = 0;
  for (const side of [1, -1]) {
    s++;
    const plate = new THREE.Mesh(plateGeo, hull);
    plate.position.set(-0.15, 0.1, side * 0.5);
    plate.name = `Placa lateral ${s}`;
    plate.userData = {
      componente: `Blindaje lateral ${s}`,
      material: 'Compuesto de kevlar',
      función: 'Protección de electrónica interna',
    };
    group.add(plate);
  }

  return group;
}
