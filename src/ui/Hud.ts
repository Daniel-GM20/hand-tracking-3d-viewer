/** HUD holográfico: manos detectadas, estado del agarre y nivel de explosión. */
export class Hud {
  private handsEl = document.getElementById('hud-hands') as HTMLElement;
  private gestureEl = document.getElementById('hud-gesture') as HTMLElement;
  private pieceEl = document.getElementById('hud-piece') as HTMLElement;
  private modelEl = document.getElementById('hud-model') as HTMLElement;
  private fillEl = document.getElementById('explosion-fill') as HTMLElement;
  private statusEl = document.getElementById('status-message') as HTMLElement;

  setHands(count: number): void {
    this.handsEl.textContent = String(count);
    this.handsEl.className = count > 0 ? 'value ok' : 'value';
  }

  setGesture(label: string | null): void {
    this.gestureEl.textContent = label ?? '—';
    this.gestureEl.className = label ? 'value active' : 'value';
  }

  setPiece(name: string | null): void {
    this.pieceEl.textContent = name ?? '—';
    this.pieceEl.className = name ? 'value ok' : 'value';
  }

  setModelName(name: string): void {
    this.modelEl.textContent = name;
  }

  setExplosion(factor: number): void {
    this.fillEl.style.width = `${(factor * 100).toFixed(1)}%`;
  }

  showStatus(message: string): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.add('visible');
  }

  hideStatus(): void {
    this.statusEl.classList.remove('visible');
  }
}
