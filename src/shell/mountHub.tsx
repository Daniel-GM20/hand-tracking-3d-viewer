import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Hub } from './Hub';
import { applyTheme, readTheme } from './theme';

export interface HubHandle {
  show(): void;
  hide(): void;
}

export function mountHub(onSelect: (appId: string) => void): HubHandle {
  const el = document.getElementById('menu') as HTMLElement;
  applyTheme(readTheme());

  const root = createRoot(el);
  let setHidden: (hidden: boolean) => void = () => {};

  function Root() {
    const [hidden, set] = useState(false);
    setHidden = set;
    return hidden ? null : <Hub onSelect={onSelect} />;
  }

  root.render(<Root />);

  return {
    show() {
      setHidden(false);
      el.classList.remove('hidden');
    },
    hide() {
      setHidden(true);
      el.classList.add('hidden');
    },
  };
}
