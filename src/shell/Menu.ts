interface CardDef {
  id: string;
  icon: string;
  title: string;
  description: string;
  tag: string;
  disabled?: boolean;
}

const CARDS: CardDef[] = [
  {
    id: 'exploded',
    icon: '3D',
    title: 'EXPLODED VIEW',
    description:
      'Explora modelos 3D multi-pieza con las manos: explota, rota, haz zoom y consulta la información técnica de cada pieza.',
    tag: 'GESTOS · 3D',
  },
  {
    id: 'whiteboard',
    icon: 'DW',
    title: 'PIZARRA',
    description:
      'Dibuja en el aire con el gesto pinch, elige colores apuntando con el índice y borra con dos dedos.',
    tag: 'GESTOS · DIBUJO',
  },
  {
    id: 'lego',
    icon: 'LG',
    title: 'LEGO LAB',
    description:
      'Construye con piezas tipo LEGO usando las manos: elige un ladrillo, colócalo con pinch y apila sobre la base.',
    tag: 'BETA · 12 PIEZAS',
  },
  {
    id: 'memes',
    icon: 'MM',
    title: 'MEME MIRROR',
    description:
      'Haz un gesto frente a la cámara y descubre a qué meme te pareces. En desarrollo.',
    tag: 'PRÓXIMAMENTE',
    disabled: true,
  },
];

export class Menu {
  private el = document.getElementById('menu') as HTMLElement;

  constructor(onSelect: (appId: string) => void) {
    this.el.innerHTML = `
      <div class="hub-title">
        <h1>J.A.R.V.I.S // HUB</h1>
        <p>SELECCIONA UNA APLICACIÓN</p>
      </div>
      <div class="cards"></div>
    `;
    const cards = this.el.querySelector('.cards')!;
    for (const def of CARDS) {
      const card = document.createElement('div');
      card.className = `card glass${def.disabled ? ' disabled' : ''}`;
      card.dataset.app = def.id;
      card.innerHTML = `
        <div class="card-icon">${def.icon}</div>
        <h3>${def.title}</h3>
        <p>${def.description}</p>
        <span class="card-tag">${def.tag}</span>
      `;
      if (!def.disabled) {
        card.addEventListener('click', () => onSelect(def.id));
      }
      cards.appendChild(card);
    }
  }

  show(): void {
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
