/*
 * Arcade input layer — one script that gives every bundled game the same
 * device coverage: gamepad (Steam Deck / SteamOS / any controller), trackpad
 * two-finger swipes, and on-screen touch controls (iPhone / iPad / Android).
 *
 * It works by translating those inputs into the keyboard events each game
 * already understands, and by exposing analog values for games patched to
 * read them (ArcadeInput.axis(), ArcadeInput.aim()).
 *
 * Configure per game before loading this file:
 *   window.ARCADE = {
 *     id: 'game-id',
 *     hub: '../../',                 // where "back to arcade" goes
 *     hubPos: 'tl' | 'tr' | 'bl' | 'br',
 *     pad:  { up, down, left, right, a, b, x, y, lb, rb, start },  // keyCodes
 *     stickKeys: false,              // left stick is analog-only (no key presses)
 *     wheel: '4way' | 'lr' | null,   // trackpad swipe -> arrow-style keys
 *     keys: { up, down, left, right },   // keyCodes used by wheel + touch stick
 *     touch: 'stick' | 'twin' | null,    // virtual sticks
 *     buttons: [{ label, key }],         // extra on-screen buttons
 *   };
 */
(function () {
  'use strict';
  var cfg = window.ARCADE || {};
  var pad = cfg.pad || {};
  var stickKeys = cfg.stickKeys !== false;   // left stick also presses direction keys
  var dirKeys = cfg.keys || { up: 38, down: 40, left: 37, right: 39 };
  var KEY_NAMES = {
    13: ['Enter', 'Enter'], 27: ['Escape', 'Escape'], 32: [' ', 'Space'],
    37: ['ArrowLeft', 'ArrowLeft'], 38: ['ArrowUp', 'ArrowUp'],
    39: ['ArrowRight', 'ArrowRight'], 40: ['ArrowDown', 'ArrowDown']
  };

  // ---- synthetic keyboard ---------------------------------------------------
  var held = {};
  function sendKey(code, down) {
    if (!code) return;
    if (down && held[code]) return;
    if (!down && !held[code]) return;
    held[code] = down;
    var names = KEY_NAMES[code] ||
      [String.fromCharCode(code).toLowerCase(), 'Key' + String.fromCharCode(code)];
    var ev = new KeyboardEvent(down ? 'keydown' : 'keyup', {
      key: names[0], code: names[1], bubbles: true, cancelable: true
    });
    Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
    Object.defineProperty(ev, 'which', { get: function () { return code; } });
    (document.body || document).dispatchEvent(ev);
  }
  function tapKey(code) {
    sendKey(code, true);
    setTimeout(function () { sendKey(code, false); }, 50);
  }

  // Directional state from several sources (pad stick, d-pad, touch stick) is
  // OR-ed together so releasing one source never cancels another.
  var dirSources = {};
  function setDirs(source, d) {
    dirSources[source] = d;
    ['up', 'down', 'left', 'right'].forEach(function (k) {
      var on = false;
      for (var s in dirSources) if (dirSources[s] && dirSources[s][k]) on = true;
      sendKey(pad[k] || dirKeys[k], on);
    });
  }

  // ---- analog state -----------------------------------------------------------
  var padAxis = [0, 0], padAim = null, touchAxis = [0, 0], touchAim = null;
  var lastDevice = 'keyboard';
  function setDevice(d) {
    if (d === lastDevice) return;
    lastDevice = d;
    document.documentElement.setAttribute('data-arcade-device', d);
    window.dispatchEvent(new CustomEvent('arcade-device', { detail: d }));
  }
  function dead(v) { return Math.abs(v) < 0.18 ? 0 : v; }

  // ---- gamepad -----------------------------------------------------------------
  var BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, start: 9 };
  var prevBtn = {}, selectHeld = 0;
  function pollPad() {
    requestAnimationFrame(pollPad);
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    if (!gp) {
      if (dirSources.pad) { setDirs('pad', null); padAxis = [0, 0]; padAim = null; }
      return;
    }
    var b = function (n) { return !!(gp.buttons[n] && gp.buttons[n].pressed); };
    var lx = dead(gp.axes[0] || 0), ly = dead(gp.axes[1] || 0);
    var rx = dead(gp.axes[2] || 0), ry = dead(gp.axes[3] || 0);
    padAxis = [lx, ly];
    var rm = Math.hypot(rx, ry);
    padAim = rm > 0.3 ? [rx / rm, ry / rm] : null;
    var d = {
      up: b(12) || (stickKeys && ly < -0.5), down: b(13) || (stickKeys && ly > 0.5),
      left: b(14) || (stickKeys && lx < -0.5), right: b(15) || (stickKeys && lx > 0.5)
    };
    var any = d.up || d.down || d.left || d.right || padAim;
    setDirs('pad', d);
    for (var name in BTN) {
      var on = b(BTN[name]);
      if (on) any = true;
      if (on !== !!prevBtn[name]) {
        prevBtn[name] = on;
        if (pad[name]) sendKey(pad[name], on);
        window.dispatchEvent(new CustomEvent('arcade-button', { detail: { name: name, down: on } }));
      }
    }
    // Hold Select/View for half a second to return to the arcade.
    if (b(8)) { any = true; if (++selectHeld === 30) goHub(); } else selectHeld = 0;
    if (any) setDevice('gamepad');
  }
  requestAnimationFrame(pollPad);

  // ---- trackpad / wheel swipes -------------------------------------------------
  if (cfg.wheel) {
    var accX = 0, accY = 0, fired = false, idle = null;
    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey) { e.preventDefault(); return; }   // pinch-zoom gesture
      e.preventDefault();
      accX += e.deltaX; accY += e.deltaY;
      clearTimeout(idle);
      idle = setTimeout(function () { accX = accY = 0; fired = false; }, 140);
      if (fired) return;
      var ax = Math.abs(accX), ay = Math.abs(accY), T = 40;
      if (ax < T && ay < T) return;
      fired = true;
      // Content follows the fingers: fingers moving left => deltaX > 0 => "left".
      if (ax >= ay) tapKey(accX > 0 ? dirKeys.left : dirKeys.right);
      else if (cfg.wheel === '4way') tapKey(accY > 0 ? dirKeys.up : dirKeys.down);
      else tapKey(dirKeys.down);
    }, { passive: false });
  }

  // ---- hub button + touch overlay ----------------------------------------------
  function goHub() { location.href = cfg.hub || '../../'; }

  var css =
    '.arc-hub{position:fixed;z-index:99990;font:600 13px/1 system-ui,sans-serif;' +
    'color:#fff;background:rgba(20,22,30,.55);border:1px solid rgba(255,255,255,.25);' +
    'border-radius:999px;padding:8px 12px;text-decoration:none;opacity:.55;' +
    '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);cursor:pointer;' +
    'user-select:none;-webkit-user-select:none;touch-action:manipulation}' +
    '.arc-hub:hover,.arc-hub:focus{opacity:1}' +
    '.arc-hub.tl{top:calc(8px + env(safe-area-inset-top));left:calc(8px + env(safe-area-inset-left))}' +
    '.arc-hub.tr{top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right))}' +
    '.arc-hub.bl{bottom:calc(8px + env(safe-area-inset-bottom));left:calc(8px + env(safe-area-inset-left))}' +
    '.arc-hub.br{bottom:calc(8px + env(safe-area-inset-bottom));right:calc(8px + env(safe-area-inset-right))}' +
    '.arc-touch{position:fixed;inset:0;z-index:99980;pointer-events:none;display:none}' +
    'html.arc-has-touch .arc-touch{display:block}' +
    '.arc-stick{position:absolute;bottom:calc(22px + env(safe-area-inset-bottom));width:128px;height:128px;' +
    'border-radius:50%;background:rgba(255,255,255,.10);border:2px solid rgba(255,255,255,.28);' +
    'pointer-events:auto;touch-action:none}' +
    '.arc-stick.l{left:calc(22px + env(safe-area-inset-left))}' +
    '.arc-stick.r{right:calc(22px + env(safe-area-inset-right))}' +
    '.arc-nub{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;' +
    'border-radius:50%;background:rgba(255,255,255,.45);pointer-events:none}' +
    '.arc-btns{position:absolute;right:calc(22px + env(safe-area-inset-right));' +
    'bottom:calc(22px + env(safe-area-inset-bottom));display:flex;gap:12px;pointer-events:auto}' +
    '.arc-btns.above{bottom:calc(170px + env(safe-area-inset-bottom))}' +
    '.arc-btn{width:62px;height:62px;border-radius:50%;border:2px solid rgba(255,255,255,.35);' +
    'background:rgba(255,255,255,.14);color:#fff;font:700 13px/1 system-ui,sans-serif;' +
    'touch-action:none;user-select:none;-webkit-user-select:none}' +
    '.arc-btn.on{background:rgba(255,255,255,.4)}';

  function makeStick(side, onMove) {
    var el = document.createElement('div');
    el.className = 'arc-stick ' + side;
    var nub = document.createElement('div');
    nub.className = 'arc-nub';
    el.appendChild(nub);
    var id = null;
    function update(e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      var m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      nub.style.transform = 'translate(' + x * 40 + 'px,' + y * 40 + 'px)';
      onMove(x, y, true);
    }
    el.addEventListener('pointerdown', function (e) {
      id = e.pointerId; el.setPointerCapture(id); e.preventDefault(); update(e);
    });
    el.addEventListener('pointermove', function (e) { if (e.pointerId === id) update(e); });
    function end(e) {
      if (e.pointerId !== id) return;
      id = null; nub.style.transform = ''; onMove(0, 0, false);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return el;
  }

  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    if (cfg.hub !== false) {
      var hub = document.createElement('a');
      hub.className = 'arc-hub ' + (cfg.hubPos || 'tl');
      hub.href = cfg.hub || '../../';
      hub.textContent = '‹ Arcade';
      hub.setAttribute('aria-label', 'Back to arcade');
      // Keep the game from treating this tap as game input.
      ['mousedown', 'touchstart', 'pointerdown'].forEach(function (t) {
        hub.addEventListener(t, function (e) { e.stopPropagation(); });
      });
      document.body.appendChild(hub);
    }

    if (cfg.touch || (cfg.buttons && cfg.buttons.length)) {
      var layer = document.createElement('div');
      layer.className = 'arc-touch';
      if (cfg.touch === 'stick' || cfg.touch === 'twin') {
        layer.appendChild(makeStick('l', function (x, y, active) {
          touchAxis = [x, y];
          setDirs('touch', active ? {
            up: y < -0.45, down: y > 0.45, left: x < -0.45, right: x > 0.45
          } : null);
        }));
      }
      if (cfg.touch === 'twin') {
        layer.appendChild(makeStick('r', function (x, y, active) {
          var m = Math.hypot(x, y);
          touchAim = active && m > 0.2 ? [x / m, y / m] : null;
        }));
      }
      if (cfg.buttons && cfg.buttons.length) {
        var wrap = document.createElement('div');
        wrap.className = 'arc-btns' + (cfg.touch === 'twin' ? ' above' : '');
        cfg.buttons.forEach(function (bt) {
          var b = document.createElement('button');
          b.className = 'arc-btn';
          b.textContent = bt.label;
          b.addEventListener('pointerdown', function (e) {
            e.preventDefault(); b.classList.add('on'); sendKey(bt.key, true);
          });
          var up = function () { b.classList.remove('on'); sendKey(bt.key, false); };
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('pointerleave', up);
          wrap.appendChild(b);
        });
        layer.appendChild(wrap);
      }
      document.body.appendChild(layer);
    }

    // Show touch controls on touch-first devices, or as soon as a finger lands.
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse) document.documentElement.classList.add('arc-has-touch');
    window.addEventListener('touchstart', function () {
      document.documentElement.classList.add('arc-has-touch');
      setDevice('touch');
    }, { passive: true, capture: true });
    window.addEventListener('mousemove', function (e) {
      if (e.movementX || e.movementY) setDevice('mouse');
    }, { passive: true });

    // iOS: stop pinch / double-tap zoom from hijacking play.
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    var lastEnd = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastEnd < 300 && !(e.target.closest && e.target.closest('a,button,input'))) e.preventDefault();
      lastEnd = now;
    }, { passive: false });
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);

  window.ArcadeInput = {
    /** Left-stick style movement, x/y in -1..1 (y down is positive). */
    axis: function () {
      return (touchAxis[0] || touchAxis[1]) ? touchAxis : padAxis;
    },
    /** Unit aim vector from the right stick, or null when idle. */
    aim: function () { return touchAim || padAim; },
    device: function () { return lastDevice; },
    key: sendKey,
    tap: tapKey,
    hub: goHub
  };
})();
