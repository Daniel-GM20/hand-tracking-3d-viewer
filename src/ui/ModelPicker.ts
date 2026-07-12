export interface SampleModel {
  name: string;
  /** URL del GLB, o 'procedural' para el modelo generado. */
  url: string;
}

export interface ModelPickerEvents {
  onSelectSample: (sample: SampleModel) => void;
  onSelectFile: (file: File) => void;
}

/** Dropdown de modelos de ejemplo + carga de GLB por botón o drag&drop. */
export class ModelPicker {
  private select = document.getElementById('model-select') as HTMLSelectElement;
  private fileBtn = document.getElementById('load-file-btn') as HTMLButtonElement;
  private fileInput = document.getElementById('file-input') as HTMLInputElement;
  private dropOverlay = document.getElementById('drop-overlay') as HTMLElement;
  private abort = new AbortController();

  constructor(
    private samples: SampleModel[],
    private events: ModelPickerEvents,
  ) {
    for (const s of samples) {
      const opt = document.createElement('option');
      opt.value = s.url;
      opt.textContent = s.name.toUpperCase();
      this.select.appendChild(opt);
    }

    this.select.addEventListener('change', () => {
      const sample = this.samples.find((s) => s.url === this.select.value);
      if (sample) this.events.onSelectSample(sample);
    });

    this.fileBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file) this.events.onSelectFile(file);
      this.fileInput.value = '';
    });

    // Drag & drop (con AbortController para poder limpiar al desmontar)
    const signal = this.abort.signal;
    let dragCount = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCount++;
      this.dropOverlay.classList.add('visible');
    }, { signal });
    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCount = Math.max(0, dragCount - 1);
      if (dragCount === 0) this.dropOverlay.classList.remove('visible');
    }, { signal });
    window.addEventListener('dragover', (e) => e.preventDefault(), { signal });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCount = 0;
      this.dropOverlay.classList.remove('visible');
      const file = e.dataTransfer?.files?.[0];
      if (file && /\.(glb|gltf)$/i.test(file.name)) {
        this.events.onSelectFile(file);
      }
    }, { signal });
  }

  /** Elimina los listeners globales al desmontar la mini-app. */
  dispose(): void {
    this.abort.abort();
  }

  /** Marca en el dropdown el modelo activo (p.ej. tras cargar archivo propio). */
  setCustomLabel(name: string): void {
    let custom = this.select.querySelector<HTMLOptionElement>('option[data-custom]');
    if (!custom) {
      custom = document.createElement('option');
      custom.dataset.custom = '1';
      custom.value = '__custom__';
      this.select.appendChild(custom);
    }
    custom.textContent = name.toUpperCase();
    this.select.value = '__custom__';
  }
}
