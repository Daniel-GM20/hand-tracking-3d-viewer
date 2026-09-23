import { useState } from 'react';
import { BorderBeam } from 'border-beam';
import { BotAvatar, type BotAvatarType } from 'bot-avatars';
import { Liquid } from 'liquid-gooey';
import { ThinkingOrb } from 'thinking-orbs';
import { readTheme, storeTheme, type Theme } from './theme';

interface Space {
  id: string;
  title: string;
  blurb: string;
  meta: string;
  bot: BotAvatarType;
  disabled?: boolean;
}

const SPACES: Space[] = [
  {
    id: 'exploded',
    title: 'Exploded View',
    blurb: 'Pull a model apart with your hands. Rotate, zoom, and read each part.',
    meta: 'Hands · 3D',
    bot: 'mech',
  },
  {
    id: 'whiteboard',
    title: 'Whiteboard',
    blurb: 'Draw in the air. Pinch to sketch, point to pick a color, two fingers to erase.',
    meta: 'Hands · Draw',
    bot: 'flower',
  },
  {
    id: 'lego',
    title: 'Lego Lab',
    blurb: 'Stack bricks on a baseplate. Choose a piece, pinch to place it, and twist to turn it.',
    meta: 'Beta · 12 pieces',
    bot: 'square',
  },
  {
    id: 'memes',
    title: 'Meme Mirror',
    blurb: 'Hold a pose and see which meme you match.',
    meta: 'Coming soon',
    bot: 'ghost',
    disabled: true,
  },
];

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.5 2.4a9.2 9.2 0 1 0 7.1 14.4A8 8 0 0 1 14.5 2.4z"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="chevron" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
      <path
        d="M1 1.2 6.6 7 1 12.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AppearanceControl({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const dark = theme === 'dark';
  return (
    <Liquid
      className="appearance-liquid"
      blur={7}
      contrast={20}
      fill={dark ? '#2c2c2e' : '#ffffff'}
      shadow={
        dark
          ? '0 8px 22px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.1)'
          : '0 8px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)'
      }
    >
      <Liquid.Item>
        <button
          type="button"
          className="theme-btn"
          aria-label={next === 'dark' ? 'Switch to dark appearance' : 'Switch to light appearance'}
          onClick={() => onChange(next)}
        >
          {next === 'dark' ? <MoonIcon /> : <SunIcon />}
          {next === 'dark' ? 'Dark' : 'Light'}
        </button>
      </Liquid.Item>
    </Liquid>
  );
}

export function Hub({ onSelect }: { onSelect: (appId: string) => void }) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  function choose(next: Theme) {
    setTheme(next);
    storeTheme(next);
  }

  return (
    <div className="hub" data-theme={theme}>
      <main className="hub-main">
        <div className="hub-toolbar">
          <AppearanceControl theme={theme} onChange={choose} />
        </div>
        <div className="mast">
          <BotAvatar
            type="clover"
            size={52}
            theme={theme}
            state="default"
            turn={0.35}
            jumpEvery={0}
          />
          <div>
            <h1>Jarvis</h1>
            <p>Look, draw, and build with your hands.</p>
          </div>
        </div>

        <BorderBeam
          className="hero-beam"
          size="md"
          colorVariant="ice"
          theme={theme}
          strength={0.62}
          duration={9}
          brightness={1.05}
          borderRadius={28}
        >
          <div className="hero">
            <ThinkingOrb
              state="listening"
              size={64}
              theme={theme}
              aria-label="Listening for your hands"
            />
            <div className="hero-copy">
              <p className="eyebrow">Ready when you are</p>
              <h2>Move with your hands</h2>
              <p>
                Open a space below. The camera stays on this device and is only
                asked for after you go in.
              </p>
            </div>
          </div>
        </BorderBeam>

        <h2 className="section-label">Spaces</h2>
        <div className="app-group">
          {SPACES.map((space) => (
            <button
              key={space.id}
              type="button"
              className="app-row"
              disabled={space.disabled}
              onClick={() => onSelect(space.id)}
            >
              <span className="app-avatar">
                <BotAvatar
                  type={space.bot}
                  size={48}
                  theme={theme}
                  state={space.disabled ? 'sleeping' : 'default'}
                  face="eyes"
                  interactive={false}
                  turn={0.2}
                  jumpEvery={0}
                />
              </span>
              <span className="app-copy">
                <span className="app-title-line">
                  <span className="app-title">{space.title}</span>
                  <span className="app-meta">{space.meta}</span>
                </span>
                <span className="app-blurb">{space.blurb}</span>
              </span>
              {space.disabled ? <span className="chevron chevron-spacer" /> : <Chevron />}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
