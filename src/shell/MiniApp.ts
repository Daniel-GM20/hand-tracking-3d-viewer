/**
 * Contrato de las mini-apps del hub: se montan en un contenedor
 * y deben limpiar todo (cámara, WebGL, listeners) al desmontarse.
 */
export interface MiniApp {
  mount(container: HTMLElement): Promise<void> | void;
  unmount(): void;
}
