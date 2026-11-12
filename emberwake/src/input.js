// Keyboard + gamepad + touch input, mapped to abstract actions.
const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ'],
  attack: ['KeyX', 'KeyJ'],
  dash: ['KeyC', 'KeyK', 'ShiftLeft', 'ShiftRight'],
  focus: ['KeyF', 'KeyV'],
  flare: ['KeyQ', 'KeyL'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space', 'KeyZ', 'KeyX'],
};

// Standard-mapping gamepad buttons.
const PADMAP = {
  jump: [0], // A / Cross
  attack: [2], // X / Square
  dash: [7, 5], // RT / RB
  focus: [1], // B / Circle
  flare: [3], // Y / Triangle
  pause: [9], // Start
  confirm: [0, 9],
  left: [14],
  right: [15],
  up: [12],
  down: [13],
};

const held = new Set();
const tapped = new Set(); // keys pressed since the last poll, so very short taps are never missed
const now = {};
const prev = {};
const touch = {};
let padConnected = false;
let lastDevice = 'keyboard';
const listeners = [];

for (const a of Object.keys(KEYMAP)) {
  now[a] = false;
  prev[a] = false;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  held.add(e.code);
  tapped.add(e.code);
  setDevice('keyboard');
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
window.addEventListener('gamepadconnected', () => {
  padConnected = true;
  setDevice('gamepad');
});
window.addEventListener('gamepaddisconnected', () => {
  padConnected = [...(navigator.getGamepads?.() || [])].some(Boolean);
  if (!padConnected) setDevice('keyboard');
});

function setDevice(d) {
  if (d === lastDevice) return;
  lastDevice = d;
  listeners.forEach((f) => f(d));
}

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

export const input = {
  axisX: 0,
  axisY: 0,
  get device() {
    return lastDevice;
  },
  onDevice(f) {
    listeners.push(f);
  },
  setTouch(action, v) {
    touch[action] = v;
    if (v) setDevice('touch');
  },
  poll() {
    const pad = readPad();
    let padAny = false;
    for (const a of Object.keys(KEYMAP)) {
      prev[a] = now[a];
      let v = KEYMAP[a].some((k) => held.has(k) || tapped.has(k)) || !!touch[a];
      if (pad && PADMAP[a]) {
        for (const b of PADMAP[a]) {
          if (pad.buttons[b] && (pad.buttons[b].pressed || pad.buttons[b].value > 0.5)) {
            v = true;
            padAny = true;
          }
        }
      }
      now[a] = v;
    }
    tapped.clear();
    let ax = 0;
    let ay = 0;
    if (pad) {
      const sx = pad.axes[0] || 0;
      const sy = pad.axes[1] || 0;
      if (Math.abs(sx) > 0.3) {
        ax = sx > 0 ? 1 : -1;
        padAny = true;
      }
      if (Math.abs(sy) > 0.55) {
        ay = sy > 0 ? -1 : 1;
        padAny = true;
      }
      if (ax < 0) now.left = true;
      if (ax > 0) now.right = true;
      if (ay > 0) now.up = true;
      if (ay < 0) now.down = true;
    }
    if (padAny) setDevice('gamepad');
    this.axisX = (now.right ? 1 : 0) - (now.left ? 1 : 0);
    this.axisY = (now.up ? 1 : 0) - (now.down ? 1 : 0);
  },
  down: (a) => now[a],
  hit: (a) => now[a] && !prev[a],
  released: (a) => !now[a] && prev[a],
  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    const pad = readPad();
    const act = pad && pad.vibrationActuator;
    if (act && act.playEffect) {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    }
  },
  // Human-readable label for an action on the current device.
  label(a) {
    const kb = {
      jump: 'Space', attack: 'X', dash: 'C', focus: 'F', flare: 'Q', up: '↑', down: '↓', pause: 'Esc', move: '← →', confirm: 'Enter',
    };
    const gp = {
      jump: 'Ⓐ', attack: 'Ⓧ', dash: 'RT', focus: 'Ⓑ', flare: 'Ⓨ', up: '↑', down: '↓', pause: 'Start', move: 'Stick', confirm: 'Ⓐ',
    };
    const tc = {
      jump: 'JUMP', attack: 'STRIKE', dash: 'DASH', focus: 'MEND', flare: 'FLARE', up: '▲', down: '▼', pause: 'II', move: '◀ ▶', confirm: 'tap',
    };
    return (lastDevice === 'gamepad' ? gp : lastDevice === 'touch' ? tc : kb)[a] || a;
  },
};
