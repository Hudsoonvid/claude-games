// DOM overlay: vitals, prompts, title cards, menus and touch controls.
import { input } from './input.js';
import { audio } from './audio.js';
import { CINDER_COST } from './player.js';

const $ = (id) => document.getElementById(id);
const FLAME_SVG =
  '<svg class="flame" viewBox="0 0 26 34"><path class="fill" d="M13 1 C15 9 24 14 23 23 C22 30 17 33 13 33 C9 33 4 30 3 23 C2 16 9 12 13 1 Z"/><path d="M13 14 C14 19 18 21 17.5 26 C17 30 15 31 13 31 C11 31 9 30 8.5 26 C8 22 11.5 20 13 14 Z" fill="rgba(255,255,255,0.55)"/></svg>';

export class HUD {
  constructor() {
    this.el = $('hud');
    this.flames = $('flames');
    this.cinder = $('cinder');
    this.glints = $('glints');
    this.area = $('area');
    this.promptEl = $('prompt');
    this.hintEl = $('hint');
    this.lore = $('lore');
    this.banner = $('banner');
    this.cinder.innerHTML = '<div class="seg"><i></i></div><div class="seg"><i></i></div><div class="seg"><i></i></div>';
    this.last = {};
    this.loreT = 0;
    this.areaT = 0;
    this.menuState = null;
    this.setupTouch();
  }

  show(on) {
    this.el.classList.toggle('on', on);
  }

  update(p, dt) {
    if (this.last.maxHp !== p.maxHp) {
      this.flames.innerHTML = FLAME_SVG.repeat(p.maxHp);
      this.last.maxHp = p.maxHp;
      this.last.hp = -1;
    }
    if (this.last.hp !== p.hp) {
      [...this.flames.children].forEach((f, i) => {
        const on = i < p.hp;
        f.classList.toggle('on', on);
        f.classList.toggle('off', !on);
      });
      this.last.hp = p.hp;
    }
    if (this.last.cinder !== p.cinder) {
      [...this.cinder.children].forEach((s, i) => {
        const v = Math.max(0, Math.min(1, (p.cinder - i * CINDER_COST) / CINDER_COST));
        s.firstChild.style.width = v * 100 + '%';
        s.classList.toggle('full', v >= 1);
      });
      this.last.cinder = p.cinder;
    }
    if (this.last.glints !== p.glints) {
      this.glints.lastElementChild.textContent = p.glints;
      this.glints.classList.remove('bump');
      void this.glints.offsetWidth;
      this.glints.classList.add('bump');
      this.last.glints = p.glints;
    }
    if (this.loreT > 0) {
      this.loreT -= dt;
      if (this.loreT <= 0) this.lore.classList.remove('on');
    }
    if (this.areaT > 0) {
      this.areaT -= dt;
      if (this.areaT <= 0) this.area.classList.remove('on');
    }
  }

  pulse() {
    [...this.flames.children].forEach((f) => {
      f.classList.remove('pop');
      void f.offsetWidth;
      f.classList.add('pop');
    });
  }

  areaCard(title, sub = '', time = 3.6) {
    this.area.querySelector('h2').textContent = title.toUpperCase();
    this.area.querySelector('p').textContent = sub;
    this.area.classList.add('on');
    this.areaT = time;
  }

  prompt(html) {
    if (this.last.prompt === html) return;
    this.last.prompt = html;
    if (html) this.promptEl.innerHTML = html;
    this.promptEl.classList.toggle('on', !!html);
  }
  hint(html) {
    if (this.last.hint === html) return;
    this.last.hint = html;
    if (html) this.hintEl.innerHTML = html;
    this.hintEl.classList.toggle('on', !!html);
  }
  showLore(text, time = 9) {
    this.lore.textContent = text;
    this.lore.classList.add('on');
    this.loreT = time;
  }
  hideLore() {
    this.loreT = 0;
    this.lore.classList.remove('on');
  }
  get loreOpen() {
    return this.loreT > 0;
  }

  showBanner(kicker, title, body) {
    this.banner.querySelector('small').textContent = kicker;
    this.banner.querySelector('h2').textContent = title;
    this.banner.querySelector('p').innerHTML = body;
    this.banner.querySelector('em').textContent = '';
    this.banner.classList.add('on');
  }
  bannerReady() {
    this.banner.querySelector('em').textContent = `— ${input.label('confirm')} to continue —`;
  }
  hideBanner() {
    this.banner.classList.remove('on');
  }

  // ── simple vertical menus ──
  openMenu(screenId, menuId, items) {
    $(screenId).classList.add('on');
    const el = $(menuId);
    el.innerHTML = '';
    this.menuState = { screenId, el, items, sel: 0 };
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.addEventListener('pointerenter', () => this.select(i));
      b.addEventListener('click', () => {
        this.select(i);
        this.choose();
      });
      el.appendChild(b);
    });
    this.select(0, true);
  }
  select(i, quiet) {
    const m = this.menuState;
    if (!m) return;
    m.sel = (i + m.items.length) % m.items.length;
    [...m.el.children].forEach((b, k) => b.classList.toggle('sel', k === m.sel));
    if (!quiet) audio.sfx('ui');
  }
  choose() {
    const m = this.menuState;
    if (!m) return;
    audio.init();
    audio.sfx('uiOk');
    m.items[m.sel].action();
  }
  relabel(i, label) {
    const m = this.menuState;
    if (m) m.el.children[i].textContent = label;
  }
  closeMenu() {
    if (!this.menuState) return;
    $(this.menuState.screenId).classList.remove('on');
    this.menuState = null;
  }
  menuInput() {
    if (!this.menuState) return;
    if (input.hit('up')) this.select(this.menuState.sel - 1);
    if (input.hit('down')) this.select(this.menuState.sel + 1);
    if (input.hit('confirm')) this.choose();
  }

  keysHtml() {
    const L = (a) => `<b>${input.label(a)}</b>`;
    return [
      [L('move'), 'Move'], [L('jump'), 'Jump'], [L('attack'), 'Strike (with ↑ / ↓ to aim)'], [L('dash'), 'Gust Step'],
      [L('focus'), 'Hold to mend'], [L('flare'), 'Cast flare'], [L('up'), 'Rest · Read'], [L('pause'), 'Pause'],
    ].map(([k, v]) => `${k}<span>${v}</span>`).join('');
  }
  refreshKeys() {
    for (const id of ['titleKeys', 'pauseKeys']) $(id).innerHTML = this.keysHtml();
  }

  showEnding(stats) {
    const el = $('ending');
    el.querySelector('.stats').textContent = stats;
    el.querySelector('em').textContent = `— ${input.label('confirm')} —`;
    el.classList.add('on');
  }
  hideEnding() {
    $('ending').classList.remove('on');
  }
  loaded() {
    const l = $('loading');
    l.classList.add('off');
    setTimeout(() => l.classList.remove('on'), 900);
  }

  // ── touch controls ──
  // Left thumb: a stick that appears wherever you touch. Right thumb: action buttons you can
  // roll across without lifting. All pointers are tracked on one root so multi-touch is exact.
  setupTouch() {
    const root = (this.touchRoot = $('touch'));
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.touchCapable = coarse || 'ontouchstart' in window;
    this.touchMode = 'off';
    const mk = (cls, text) => {
      const el = document.createElement('div');
      el.className = cls;
      if (text) el.textContent = text;
      root.appendChild(el);
      return el;
    };
    this.stickBase = mk('tstick');
    this.stickKnob = mk('tknob');
    this.stickHint = mk('thint', 'MOVE');
    // [action, label, right, bottom, size] in units of the main button size
    const spec = [
      ['jump', 'JUMP', 0.35, 0.45, 1.15],
      ['attack', 'STRIKE', 1.7, 0.3, 1.0],
      ['dash', 'DASH', 0.25, 1.8, 0.9],
      ['flare', 'FLARE', 1.55, 1.5, 0.78],
      ['focus', 'MEND', 2.85, 0.35, 0.78],
      ['up', 'REST', 2.7, 1.45, 0.85],
    ];
    this.tbtns = spec.map(([action, label, r, b, size]) => ({ action, r, b, size, el: mk('tbtn t-' + action, label), on: true, x: 0, y: 0, rad: 0 }));
    this.pauseBtn = { action: 'pause', el: mk('tbtn t-pause', 'II'), on: true, x: 0, y: 0, rad: 0 };
    this.tapCatch = mk('tcatch');
    const stick = { id: null, bx: 0, by: 0, R: 50 };
    const ptrs = new Map();

    const layout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const u = Math.max(50, Math.min(92, Math.min(w, h) * 0.2, w * 0.165));
      const cs = getComputedStyle(document.documentElement);
      const safeR = parseFloat(cs.getPropertyValue('--sar')) || 0;
      const safeB = parseFloat(cs.getPropertyValue('--sab')) || 0;
      stick.R = u * 0.72;
      for (const b of this.tbtns) {
        const d = b.size * u;
        b.rad = d / 2;
        b.x = w - safeR - b.r * u - b.rad;
        b.y = h - safeB - b.b * u - b.rad;
        b.el.style.cssText = `width:${d}px;height:${d}px;left:${b.x - b.rad}px;top:${b.y - b.rad}px;font-size:${Math.max(9, d * 0.17)}px;`;
      }
      const pb = this.pauseBtn;
      pb.rad = 22;
      pb.x = w / 2;
      pb.y = 30 + (parseFloat(cs.getPropertyValue('--sat')) || 0);
      pb.el.style.cssText = `width:44px;height:44px;left:${pb.x - 22}px;top:${pb.y - 22}px;font-size:13px;`;
      this.stickBase.style.width = this.stickBase.style.height = stick.R * 2 + 'px';
      this.stickKnob.style.width = this.stickKnob.style.height = stick.R * 0.95 + 'px';
      // resting position, so players can see where the stick lives
      stick.restX = Math.max(stick.R + 22, w * 0.13);
      stick.restY = h - safeB - stick.R - Math.max(26, h * 0.1);
      if (stick.id === null) place(stick.restX, stick.restY, 0, 0);
      this.stickHint.style.left = stick.restX + 'px';
      this.stickHint.style.top = stick.restY - stick.R - 18 + 'px';
    };
    const place = (bx, by, kx, ky) => {
      this.stickBase.style.transform = `translate(${bx - stick.R}px, ${by - stick.R}px)`;
      const k = stick.R * 0.475;
      this.stickKnob.style.transform = `translate(${bx + kx - k}px, ${by + ky - k}px)`;
    };
    const press = (b, v) => {
      b.el.classList.toggle('down', v);
      input.setTouch(b.action, v);
    };
    const buttonAt = (x, y) => {
      let best = null;
      let bd = 1e9;
      for (const b of [...this.tbtns, this.pauseBtn]) {
        if (!b.on) continue;
        const d = Math.hypot(x - b.x, y - b.y) / b.rad;
        if (d < 1.28 && d < bd) {
          bd = d;
          best = b;
        }
      }
      return best;
    };
    const setStick = (x, y) => {
      let dx = x - stick.bx;
      let dy = y - stick.by;
      const d = Math.hypot(dx, dy);
      // the base follows a thumb that drifts past the rim, so the stick is never lost
      if (d > stick.R * 1.25) {
        const over = d - stick.R * 1.25;
        stick.bx += (dx / d) * over;
        stick.by += (dy / d) * over;
        dx = x - stick.bx;
        dy = y - stick.by;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / stick.R);
      const a = Math.atan2(dy, dx);
      const nx = Math.cos(a) * m;
      const ny = Math.sin(a) * m;
      place(stick.bx, stick.by, nx * stick.R, ny * stick.R);
      input.setTouch('left', nx < -0.28);
      input.setTouch('right', nx > 0.28);
      input.setTouch('down', ny > 0.58);
      // 'up' from the stick only aims strikes and looks; resting or reading uses the REST button
      this.stickUp = ny < -0.58;
      input.setTouch('up', this.stickUp || this.btnUp);
    };
    const releaseStick = () => {
      stick.id = null;
      this.stickUp = false;
      for (const a of ['left', 'right', 'down']) input.setTouch(a, false);
      input.setTouch('up', !!this.btnUp);
      this.stickBase.classList.remove('live');
      place(stick.restX, stick.restY, 0, 0);
    };
    this.releaseTouches = () => {
      for (const p of ptrs.values()) if (p.btn) press(p.btn, false);
      ptrs.clear();
      this.btnUp = false;
      releaseStick();
      input.setTouch('confirm', false);
    };

    const down = (e) => {
      if (this.touchMode === 'off') return;
      e.preventDefault();
      audio.init();
      if (root.setPointerCapture) {
        try {
          root.setPointerCapture(e.pointerId);
        } catch (err) {
          /* synthetic pointers cannot be captured */
        }
      }
      if (this.touchMode === 'tap') {
        ptrs.set(e.pointerId, { tap: true });
        input.setTouch('confirm', true);
        return;
      }
      const b = buttonAt(e.clientX, e.clientY);
      if (b) {
        ptrs.set(e.pointerId, { btn: b });
        if (b.action === 'up') this.btnUp = true;
        press(b, true);
        this.stickHint.classList.add('seen');
      } else if (stick.id === null && e.clientX < window.innerWidth * 0.55) {
        stick.id = e.pointerId;
        stick.bx = Math.max(stick.R + 8, e.clientX);
        stick.by = Math.min(window.innerHeight - stick.R - 8, Math.max(stick.R + 8, e.clientY));
        ptrs.set(e.pointerId, { stick: true });
        this.stickBase.classList.add('live');
        this.stickHint.classList.add('seen');
        setStick(e.clientX, e.clientY);
      }
    };
    const move = (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      if (p.stick) setStick(e.clientX, e.clientY);
      else if (p.btn !== undefined) {
        const nb = buttonAt(e.clientX, e.clientY);
        if (nb !== p.btn) {
          if (p.btn) {
            if (p.btn.action === 'up') this.btnUp = false;
            press(p.btn, false);
          }
          p.btn = nb;
          if (nb) {
            if (nb.action === 'up') this.btnUp = true;
            press(nb, true);
          }
        }
      }
    };
    const up = (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      ptrs.delete(e.pointerId);
      if (p.stick) releaseStick();
      else if (p.tap) input.setTouch('confirm', false);
      else if (p.btn) {
        if (p.btn.action === 'up') {
          this.btnUp = false;
          input.setTouch('up', !!this.stickUp);
          p.btn.el.classList.remove('down');
        } else press(p.btn, false);
      }
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 250));
    this.layoutTouch = layout;
    layout();
    // controls appear the first time the screen is touched (or straight away on a phone)
    window.addEventListener('touchstart', () => (this.touchSeen = true), { passive: true });
    this.touchSeen = coarse;
  }

  // Called every frame: show the right touch layer for the game state and what the player can do.
  touchSync(state, p, interact) {
    if (!this.touchCapable) return;
    const want = !this.touchSeen || input.device === 'gamepad' ? 'off' : state === 'play' ? 'play' : state === 'banner' || state === 'ending' ? 'tap' : 'off';
    if (want !== this.touchMode) {
      this.releaseTouches();
      this.touchMode = want;
      this.touchRoot.className = 'layer ' + (want === 'off' ? '' : 'on ' + want);
      if (want === 'play') this.layoutTouch();
    }
    if (want !== 'play') return;
    const set = (action, on, dim) => {
      const b = this.tbtns.find((k) => k.action === action);
      if (b.on !== on) {
        b.on = on;
        b.el.style.display = on ? '' : 'none';
        if (!on && b.el.classList.contains('down')) {
          b.el.classList.remove('down');
          input.setTouch(action, false);
        }
      }
      b.el.classList.toggle('dim', !!dim);
    };
    set('dash', p.abilities.dash, false);
    set('focus', true, p.cinder < CINDER_COST || p.hp >= p.maxHp);
    set('flare', true, p.cinder < CINDER_COST);
    set('up', !!interact, false);
    if (interact) {
      const b = this.tbtns.find((k) => k.action === 'up');
      if (b.label !== interact) {
        b.label = interact;
        b.el.textContent = interact.toUpperCase();
      }
    }
  }
}
