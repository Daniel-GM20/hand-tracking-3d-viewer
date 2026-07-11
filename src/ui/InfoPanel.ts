import type * as THREE from 'three';

/**
 * Panel de información técnica de la pieza seleccionada. La info viene de
 * los "extras" del glTF (userData). Si la pieza no tiene datos, muestra
 * "INFORMACIÓN NO DISPONIBLE".
 */
export class InfoPanel {
  private panel = document.getElementById('info-panel') as HTMLElement;
  private titleEl = document.getElementById('info-title') as HTMLElement;
  private bodyEl = document.getElementById('info-body') as HTMLElement;

  visible = false;

  show(mesh: THREE.Mesh): void {
    this.titleEl.textContent = (mesh.name || 'PIEZA SIN NOMBRE').toUpperCase();
    this.bodyEl.innerHTML = '';

    const entries = Object.entries(mesh.userData).filter(
      ([, v]) =>
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );

    if (entries.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'info-empty';
      msg.textContent = 'INFORMACIÓN NO DISPONIBLE';
      this.bodyEl.appendChild(msg);
    } else {
      for (const [key, value] of entries) {
        const row = document.createElement('div');
        row.className = 'info-row';
        const k = document.createElement('span');
        k.className = 'info-key';
        k.textContent = key.toUpperCase();
        const v = document.createElement('span');
        v.className = 'info-value';
        v.textContent = String(value);
        row.append(k, v);
        this.bodyEl.appendChild(row);
      }
    }

    this.panel.classList.add('visible');
    this.visible = true;
  }

  hide(): void {
    this.panel.classList.remove('visible');
    this.visible = false;
  }

  toggle(mesh: THREE.Mesh): void {
    if (this.visible) this.hide();
    else this.show(mesh);
  }
}
