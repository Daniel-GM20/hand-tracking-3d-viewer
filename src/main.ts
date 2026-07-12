import './style.css';
import { Menu } from './shell/Menu';
import type { MiniApp } from './shell/MiniApp';
import { ExplodedApp } from './apps/exploded/ExplodedApp';
import { WhiteboardApp } from './apps/whiteboard/WhiteboardApp';
import { LegoApp } from './apps/lego/LegoApp';

const registry: Record<string, () => MiniApp> = {
  exploded: () => new ExplodedApp(),
  whiteboard: () => new WhiteboardApp(),
  lego: () => new LegoApp(),
};

const container = document.getElementById('app-container') as HTMLElement;
const backBtn = document.getElementById('back-btn') as HTMLButtonElement;

let current: MiniApp | null = null;

async function openApp(id: string): Promise<void> {
  const factory = registry[id];
  if (!factory || current) return;
  menu.hide();
  backBtn.hidden = false;
  current = factory();
  await current.mount(container);
}

function closeApp(): void {
  if (!current) return;
  current.unmount();
  current = null;
  container.innerHTML = '';
  backBtn.hidden = true;
  menu.show();
}

const menu = new Menu(openApp);
backBtn.addEventListener('click', closeApp);

// Hook de debug para pruebas: __hub.openApp('whiteboard'), __hub.current()
(window as unknown as Record<string, unknown>).__hub = {
  openApp,
  closeApp,
  current: () => current,
};
