import './style.css';
import { mountHub } from './shell/mountHub';
import { readTheme, storeTheme } from './shell/theme';
import type { MiniApp } from './shell/MiniApp';
import { ExplodedApp } from './apps/exploded/ExplodedApp';
import { WhiteboardApp } from './apps/whiteboard/WhiteboardApp';
import { LegoApp } from './apps/lego/LegoApp';

const registry: Record<string, () => MiniApp> = {
  exploded: () => new ExplodedApp(),
  whiteboard: () => new WhiteboardApp(),
  lego: () => new LegoApp(),
};

const TITLES: Record<string, string> = {
  exploded: 'Exploded View',
  whiteboard: 'Whiteboard',
  lego: 'Lego Lab',
};

const container = document.getElementById('app-container') as HTMLElement;
const appBar = document.getElementById('app-bar') as HTMLElement;
const appTitle = document.getElementById('app-title') as HTMLElement;
const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
const themeBtn = document.getElementById('app-theme') as HTMLButtonElement;

let current: MiniApp | null = null;

function syncThemeButton(): void {
  const dark = (document.documentElement.dataset.theme ?? readTheme()) === 'dark';
  themeBtn.setAttribute(
    'aria-label',
    dark ? 'Switch to light appearance' : 'Switch to dark appearance',
  );
}

async function openApp(id: string): Promise<void> {
  const factory = registry[id];
  if (!factory || current) return;
  menu.hide();
  appTitle.textContent = TITLES[id] ?? '';
  appBar.hidden = false;
  syncThemeButton();
  current = factory();
  await current.mount(container);
}

function closeApp(): void {
  if (!current) return;
  current.unmount();
  current = null;
  container.innerHTML = '';
  appBar.hidden = true;
  menu.show();
}

const menu = mountHub(openApp);
backBtn.addEventListener('click', closeApp);
themeBtn.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  storeTheme(dark ? 'light' : 'dark');
  syncThemeButton();
});
syncThemeButton();

// Hook de debug para pruebas: __hub.openApp('whiteboard'), __hub.current()
(window as unknown as Record<string, unknown>).__hub = {
  openApp,
  closeApp,
  current: () => current,
};
