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

  setupTouch() {
    const root = $('touch');
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!coarse && !('ontouchstart' in window)) return;
    const mk = (action, label, css, size = 64) => {
      const b = document.createElement('div');
      b.className = 'tbtn';
      b.textContent = label;
      b.style.cssText = `width:${size}px;height:${size}px;${css}`;
      const set = (v) => (e) => {
        e.preventDefault();
        audio.init();
        b.classList.toggle('down', v);
        input.setTouch(action, v);
        if (action === 'jump' || action === 'attack') input.setTouch('confirm', v);
      };
      b.addEventListener('pointerdown', set(true));
      b.addEventListener('pointerup', set(false));
      b.addEventListener('pointercancel', set(false));
      b.addEventListener('pointerleave', set(false));
      root.appendChild(b);
    };
    mk('left', '◀', 'left:18px;bottom:54px;', 70);
    mk('right', '▶', 'left:104px;bottom:54px;', 70);
    mk('up', '▲', 'left:64px;bottom:128px;', 54);
    mk('down', '▼', 'left:64px;bottom:2px;', 54);
    mk('jump', 'JUMP', 'right:22px;bottom:40px;', 76);
    mk('attack', 'STRIKE', 'right:108px;bottom:70px;', 70);
    mk('dash', 'DASH', 'right:26px;bottom:128px;', 58);
    mk('focus', 'MEND', 'right:184px;bottom:28px;', 54);
    mk('flare', 'FLARE', 'right:96px;bottom:150px;', 54);
    mk('pause', 'II', 'right:50%;top:14px;margin-right:-20px;', 40);
    const show = () => root.classList.add('on');
    window.addEventListener('touchstart', show, { once: true, passive: true });
    if (coarse) show();
  }
}
