// Painted textures for the hero, creatures and interactive objects.
import { canvasTex } from './art.js';

const cache = new Map();
const COLD = '#bfe4ff';
const WARM = '#ffb45a';

function jag(g, x0, y0, x1, y1, n, amp, seed = 1) {
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const s = Math.sin(i * 12.9898 * seed) * 43758.5453;
    const o = ((s - Math.floor(s)) - 0.5) * 2 * amp * (i === n ? 0 : 1);
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const l = Math.hypot(nx, ny) || 1;
    g.lineTo(x0 + (x1 - x0) * t + (nx / l) * o, y0 + (y1 - y0) * t + (ny / l) * o);
  }
}

function glowStroke(g, color, blur, width, fn) {
  g.save();
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.lineWidth = width;
  g.lineCap = 'round';
  fn();
  g.stroke();
  g.stroke();
  g.restore();
}

const PAINT = {
  // ───────── hero ─────────
  cloak: () =>
    canvasTex(128, 152, (g) => {
      const gr = g.createLinearGradient(0, 8, 0, 150);
      gr.addColorStop(0, '#39437c');
      gr.addColorStop(0.35, '#1f2650');
      gr.addColorStop(1, '#0b0e22');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(64, 8);
      g.bezierCurveTo(30, 18, 14, 82, 8, 130);
      g.lineTo(24, 118);
      g.lineTo(36, 146);
      g.lineTo(52, 122);
      g.lineTo(64, 150);
      g.lineTo(78, 122);
      g.lineTo(92, 146);
      g.lineTo(104, 118);
      g.lineTo(120, 130);
      g.bezierCurveTo(114, 82, 98, 18, 64, 8);
      g.closePath();
      g.fill();
      g.save();
      g.clip();
      const hl = g.createRadialGradient(64, 6, 2, 64, 6, 80);
      hl.addColorStop(0, 'rgba(255,190,110,0.75)');
      hl.addColorStop(0.5, 'rgba(255,150,80,0.18)');
      hl.addColorStop(1, 'rgba(255,150,80,0)');
      g.fillStyle = hl;
      g.fillRect(0, 0, 128, 152);
      g.strokeStyle = 'rgba(150,170,255,0.28)';
      g.lineWidth = 2;
      for (const x of [40, 64, 88]) {
        g.beginPath();
        g.moveTo(64 + (x - 64) * 0.2, 30);
        g.quadraticCurveTo(x, 80, x + (x - 64) * 0.3, 130);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = '#0a0c1c';
      g.lineWidth = 3;
      g.stroke();
    }),
  head: () =>
    canvasTex(128, 128, (g) => {
      // collar
      g.fillStyle = '#3d2e22';
      g.beginPath();
      g.ellipse(64, 112, 26, 8, 0, 0, 7);
      g.fill();
      // glass globe
      const gr = g.createRadialGradient(64, 70, 6, 64, 66, 46);
      gr.addColorStop(0, 'rgba(255,236,170,0.55)');
      gr.addColorStop(0.55, 'rgba(255,170,80,0.38)');
      gr.addColorStop(1, 'rgba(120,70,40,0.6)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(64, 66, 44, 0, 7);
      g.fill();
      g.strokeStyle = '#2a1f17';
      g.lineWidth = 5;
      g.stroke();
      // cage ribs
      g.strokeStyle = 'rgba(42,31,23,0.75)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(64, 66, 22, 44, 0, 0, 7);
      g.stroke();
      // cap + ring
      g.fillStyle = '#3d2e22';
      g.beginPath();
      g.moveTo(42, 28);
      g.lineTo(50, 12);
      g.lineTo(78, 12);
      g.lineTo(86, 28);
      g.closePath();
      g.fill();
      g.strokeStyle = '#5a4532';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(64, 8, 6, 0, 7);
      g.stroke();
      // eyes
      g.fillStyle = '#1c0d06';
      g.beginPath();
      g.ellipse(49, 70, 6, 11, 0, 0, 7);
      g.ellipse(79, 70, 6, 11, 0, 0, 7);
      g.fill();
      // glass highlight
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(64, 66, 35, Math.PI * 1.08, Math.PI * 1.36);
      g.stroke();
    }),
  flame: () =>
    canvasTex(96, 144, (g) => {
      const gr = g.createRadialGradient(48, 100, 4, 48, 86, 62);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.25, 'rgba(255,225,130,0.95)');
      gr.addColorStop(0.6, 'rgba(255,140,50,0.6)');
      gr.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(48, 6);
      g.bezierCurveTo(60, 44, 88, 70, 80, 104);
      g.bezierCurveTo(74, 132, 22, 132, 16, 104);
      g.bezierCurveTo(8, 70, 40, 46, 48, 6);
      g.fill();
    }),
  coldflame: () =>
    canvasTex(96, 144, (g) => {
      const gr = g.createRadialGradient(48, 100, 4, 48, 86, 62);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(190,230,255,0.9)');
      gr.addColorStop(0.65, 'rgba(90,150,255,0.5)');
      gr.addColorStop(1, 'rgba(60,80,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(48, 6);
      g.bezierCurveTo(60, 44, 88, 70, 80, 104);
      g.bezierCurveTo(74, 132, 22, 132, 16, 104);
      g.bezierCurveTo(8, 70, 40, 46, 48, 6);
      g.fill();
    }),
  blade: () =>
    canvasTex(192, 48, (g) => {
      g.shadowColor = '#9fe8ff';
      g.shadowBlur = 10;
      const gr = g.createLinearGradient(30, 0, 190, 0);
      gr.addColorStop(0, '#8fd0e6');
      gr.addColorStop(0.6, '#e9fbff');
      gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(30, 18);
      g.lineTo(120, 14);
      g.lineTo(150, 17);
      g.lineTo(188, 24);
      g.lineTo(146, 30);
      g.lineTo(30, 30);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(60,120,150,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(34, 24);
      g.lineTo(180, 24);
      g.stroke();
      g.fillStyle = '#241a14';
      g.fillRect(4, 19, 28, 10);
      g.fillStyle = '#6b523a';
      g.fillRect(28, 12, 5, 24);
      for (let x = 8; x < 28; x += 6) g.fillRect(x, 19, 2, 10);
    }),
  leg: () =>
    canvasTex(24, 44, (g) => {
      g.fillStyle = '#0b0d1e';
      g.beginPath();
      g.roundRect(6, 0, 12, 38, 6);
      g.fill();
      g.beginPath();
      g.ellipse(14, 38, 10, 6, 0, 0, 7);
      g.fill();
    }),
  slash: () =>
    canvasTex(256, 256, (g) => {
      // a thin crescent with a soft trailing smear
      const crescent = (r1, cx2, r2, alpha, blur) => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const k = c.getContext('2d');
        k.fillStyle = '#fff';
        k.beginPath();
        k.arc(128, 128, r1, 0, 7);
        k.fill();
        k.globalCompositeOperation = 'destination-out';
        k.beginPath();
        k.arc(cx2, 128, r2, 0, 7);
        k.fill();
        g.globalAlpha = alpha;
        g.filter = `blur(${blur}px)`;
        g.drawImage(c, 0, 0);
      };
      crescent(118, 60, 150, 0.28, 6);
      crescent(120, 92, 136, 1, 1.5);
      g.filter = 'none';
      g.globalAlpha = 1;
      // fade the tips
      g.globalCompositeOperation = 'destination-in';
      const gr = g.createRadialGradient(200, 128, 30, 170, 128, 135);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.6, 'rgba(0,0,0,0.85)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }),
  // ───────── objects ─────────
  pot: () =>
    canvasTex(96, 112, (g) => {
      const gr = g.createRadialGradient(36, 50, 4, 48, 66, 54);
      gr.addColorStop(0, '#8a6450');
      gr.addColorStop(0.5, '#523a33');
      gr.addColorStop(1, '#241819');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(30, 12);
      g.lineTo(66, 12);
      g.lineTo(62, 26);
      g.bezierCurveTo(98, 44, 92, 96, 68, 110);
      g.lineTo(28, 110);
      g.bezierCurveTo(4, 96, -2, 44, 34, 26);
      g.closePath();
      g.fill();
      g.strokeStyle = '#1a1112';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#140d0e';
      g.beginPath();
      g.ellipse(48, 13, 18, 5, 0, 0, 7);
      g.fill();
      g.strokeStyle = 'rgba(255,190,120,0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(14, 62);
      g.quadraticCurveTo(48, 74, 82, 62);
      g.stroke();
      g.beginPath();
      g.moveTo(16, 74);
      g.quadraticCurveTo(48, 86, 80, 74);
      g.stroke();
    }),
  hearth: () =>
    canvasTex(192, 144, (g) => {
      g.strokeStyle = '#1b1f2e';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(52, 70);
      g.lineTo(30, 140);
      g.moveTo(140, 70);
      g.lineTo(162, 140);
      g.moveTo(96, 80);
      g.lineTo(96, 140);
      g.stroke();
      const gr = g.createLinearGradient(0, 40, 0, 96);
      gr.addColorStop(0, '#4a5270');
      gr.addColorStop(1, '#141826');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(22, 44);
      g.bezierCurveTo(30, 108, 162, 108, 170, 44);
      g.closePath();
      g.fill();
      g.fillStyle = '#0d0f18';
      g.beginPath();
      g.ellipse(96, 44, 74, 12, 0, 0, 7);
      g.fill();
      g.strokeStyle = '#7f8cb4';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(96, 44, 74, 12, 0, Math.PI, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#232838';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.ellipse(52 + i * 17, 44 + (i % 2) * 3, 10, 6, 0, 0, 7);
        g.fill();
      }
    }),
  tablet: () =>
    canvasTex(112, 160, (g) => {
      const gr = g.createLinearGradient(0, 0, 112, 0);
      gr.addColorStop(0, '#39425e');
      gr.addColorStop(1, '#161a2a');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(16, 160);
      g.lineTo(12, 44);
      g.quadraticCurveTo(14, 10, 52, 6);
      g.quadraticCurveTo(96, 6, 100, 50);
      g.lineTo(98, 160);
      g.closePath();
      g.fill();
      glowStroke(g, 'rgba(255,190,110,0.9)', 8, 3, () => {
        g.beginPath();
        for (let y = 44; y < 130; y += 18) {
          g.moveTo(30, y);
          g.lineTo(30 + 20 + ((y * 7) % 34), y);
        }
        g.moveTo(56, 22);
        g.arc(56, 26, 6, -1.5, 4.7);
      });
    }),
  plinth: () =>
    canvasTex(224, 96, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 96);
      gr.addColorStop(0, '#4b5676');
      gr.addColorStop(1, '#121522');
      g.fillStyle = gr;
      g.fillRect(8, 64, 208, 32);
      g.fillRect(34, 36, 156, 30);
      g.fillRect(64, 10, 96, 28);
      g.fillStyle = 'rgba(200,220,255,0.35)';
      g.fillRect(8, 64, 208, 3);
      g.fillRect(34, 36, 156, 3);
      g.fillRect(64, 10, 96, 3);
    }),
  ring: () =>
    canvasTex(160, 160, (g) => {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(80, 80, 68, 0, 7);
      g.stroke();
      g.lineWidth = 2;
      g.setLineDash([14, 9]);
      g.beginPath();
      g.arc(80, 80, 58, 0, 7);
      g.stroke();
      g.setLineDash([]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(80 + Math.cos(a) * 68, 80 + Math.sin(a) * 68);
        g.lineTo(80 + Math.cos(a) * 78, 80 + Math.sin(a) * 78);
        g.stroke();
      }
    }),
  kiln: () =>
    canvasTex(512, 512, (g) => {
      const gr = g.createLinearGradient(0, 60, 0, 512);
      gr.addColorStop(0, '#2c3856');
      gr.addColorStop(1, '#0c1020');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(30, 512);
      g.lineTo(30, 330);
      g.bezierCurveTo(30, 90, 482, 90, 482, 330);
      g.lineTo(482, 512);
      g.closePath();
      g.fill();
      g.fillRect(214, 30, 84, 130);
      g.fillStyle = '#3a4868';
      g.fillRect(202, 22, 108, 20);
      // brick courses
      g.strokeStyle = 'rgba(8,10,20,0.55)';
      g.lineWidth = 3;
      g.save();
      g.clip();
      g.restore();
      for (let y = 190; y < 512; y += 30) {
        g.beginPath();
        g.moveTo(30, y);
        g.lineTo(482, y);
        g.stroke();
        for (let x = 40 + ((y / 30) % 2) * 30; x < 482; x += 60) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 30);
          g.stroke();
        }
      }
      // mouth
      g.fillStyle = '#04050b';
      g.beginPath();
      g.moveTo(176, 512);
      g.lineTo(176, 370);
      g.arc(256, 370, 80, Math.PI, 0);
      g.lineTo(336, 512);
      g.closePath();
      g.fill();
      g.strokeStyle = '#51618a';
      g.lineWidth = 12;
      g.stroke();
      g.strokeStyle = 'rgba(160,190,240,0.35)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(30, 330);
      g.bezierCurveTo(30, 90, 482, 90, 482, 330);
      g.stroke();
      // cracks
      g.strokeStyle = '#05060c';
      g.lineWidth = 4;
      jag(g, 120, 180, 150, 330, 7, 14, 1.3);
      g.stroke();
      jag(g, 400, 200, 380, 400, 8, 16, 2.1);
      g.stroke();
    }),
  gate: () =>
    canvasTex(64, 288, (g) => {
      for (let i = 0; i < 3; i++) {
        const x = 12 + i * 20;
        const gr = g.createLinearGradient(x - 5, 0, x + 5, 0);
        gr.addColorStop(0, '#6e7fae');
        gr.addColorStop(1, '#161b2e');
        g.fillStyle = gr;
        g.fillRect(x - 5, 14, 10, 274);
        g.beginPath();
        g.moveTo(x - 8, 16);
        g.lineTo(x, 0);
        g.lineTo(x + 8, 16);
        g.fill();
      }
      g.fillStyle = '#232a44';
      for (const y of [50, 150, 250]) g.fillRect(2, y, 60, 9);
    }),
  glint: () =>
    canvasTex(48, 48, (g) => {
      g.shadowColor = WARM;
      g.shadowBlur = 10;
      const gr = g.createLinearGradient(12, 8, 36, 40);
      gr.addColorStop(0, '#fff6d8');
      gr.addColorStop(1, '#ff9d3a');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(24, 6);
      g.lineTo(38, 24);
      g.lineTo(24, 42);
      g.lineTo(10, 24);
      g.closePath();
      g.fill();
    }),
  lantern: () =>
    canvasTex(128, 320, (g) => {
      g.strokeStyle = '#141826';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(40, 320);
      g.lineTo(40, 60);
      g.quadraticCurveTo(40, 22, 84, 26);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(84, 26);
      g.lineTo(84, 52);
      g.stroke();
      g.fillStyle = '#141826';
      g.fillRect(24, 300, 32, 20);
      g.fillRect(66, 50, 36, 8);
      g.fillRect(66, 108, 36, 8);
      const gr = g.createRadialGradient(84, 84, 2, 84, 84, 30);
      gr.addColorStop(0, '#fffbe6');
      gr.addColorStop(0.5, '#ffc266');
      gr.addColorStop(1, '#c2661e');
      g.fillStyle = gr;
      g.shadowColor = '#ffb040';
      g.shadowBlur = 18;
      g.fillRect(70, 58, 28, 50);
      g.shadowBlur = 0;
      g.strokeStyle = '#141826';
      g.lineWidth = 3;
      g.strokeRect(70, 58, 28, 50);
      g.beginPath();
      g.moveTo(84, 58);
      g.lineTo(84, 108);
      g.stroke();
    }),
  ember: () =>
    canvasTex(80, 112, (g) => {
      g.shadowColor = '#ff9a3c';
      g.shadowBlur = 16;
      const gr = g.createLinearGradient(20, 0, 60, 112);
      gr.addColorStop(0, '#fff3c4');
      gr.addColorStop(0.5, '#ff9a3c');
      gr.addColorStop(1, '#b0401a');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(40, 6);
      g.lineTo(64, 50);
      g.lineTo(52, 100);
      g.lineTo(28, 100);
      g.lineTo(16, 50);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.moveTo(40, 6);
      g.lineTo(16, 50);
      g.lineTo(38, 56);
      g.closePath();
      g.fill();
    }),
  // ───────── creatures ─────────
  potling: () =>
    canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(46, 58, 4, 64, 76, 62);
      gr.addColorStop(0, '#80594a');
      gr.addColorStop(0.55, '#4a322e');
      gr.addColorStop(1, '#1e1416');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(38, 22);
      g.lineTo(52, 30);
      g.lineTo(64, 20);
      g.lineTo(76, 32);
      g.lineTo(90, 22);
      g.lineTo(86, 40);
      g.bezierCurveTo(124, 56, 120, 106, 92, 118);
      g.lineTo(36, 118);
      g.bezierCurveTo(8, 106, 4, 56, 42, 40);
      g.closePath();
      g.fill();
      g.strokeStyle = '#120b0d';
      g.lineWidth = 3.5;
      g.stroke();
      // dark gash with eyes
      g.fillStyle = '#07060a';
      g.beginPath();
      g.moveTo(54, 62);
      g.lineTo(70, 54);
      g.lineTo(98, 58);
      g.lineTo(108, 72);
      g.lineTo(92, 86);
      g.lineTo(66, 84);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.shadowColor = COLD;
      g.shadowBlur = 12;
      g.beginPath();
      g.ellipse(76, 70, 5, 7, 0.2, 0, 7);
      g.ellipse(95, 71, 4, 6, 0.2, 0, 7);
      g.fill();
      g.shadowBlur = 0;
      glowStroke(g, COLD, 8, 2, () => {
        jag(g, 30, 60, 46, 104, 5, 6, 1.7);
      });
      glowStroke(g, COLD, 8, 2, () => {
        jag(g, 60, 92, 84, 114, 4, 5, 2.9);
      });
    }),
  stub: () =>
    canvasTex(32, 40, (g) => {
      g.fillStyle = '#17100f';
      g.beginPath();
      g.roundRect(8, 0, 16, 34, 7);
      g.fill();
      g.beginPath();
      g.ellipse(18, 34, 13, 6, 0, 0, 7);
      g.fill();
    }),
  wisp: () =>
    canvasTex(128, 192, (g) => {
      // ragged tails
      for (let i = 0; i < 5; i++) {
        const x = 34 + i * 15;
        const gr = g.createLinearGradient(0, 110, 0, 188);
        gr.addColorStop(0, 'rgba(90,120,180,0.9)');
        gr.addColorStop(1, 'rgba(60,80,140,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x - 9, 108);
        g.quadraticCurveTo(x + (i % 2 ? 8 : -8), 150, x + (i % 2 ? -4 : 4), 186 - (i % 3) * 14);
        g.quadraticCurveTo(x + 4, 150, x + 9, 108);
        g.fill();
      }
      const gr = g.createRadialGradient(64, 72, 4, 64, 70, 56);
      gr.addColorStop(0, 'rgba(245,252,255,1)');
      gr.addColorStop(0.45, 'rgba(150,195,245,0.95)');
      gr.addColorStop(1, 'rgba(38,52,96,0.95)');
      g.fillStyle = gr;
      g.shadowColor = COLD;
      g.shadowBlur = 14;
      g.beginPath();
      g.moveTo(40, 26);
      g.bezierCurveTo(8, 44, 8, 100, 36, 118);
      g.lineTo(92, 118);
      g.bezierCurveTo(120, 100, 120, 44, 88, 26);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(20,28,60,0.55)';
      g.lineWidth = 2.5;
      for (const y of [48, 72, 96]) {
        g.beginPath();
        g.moveTo(22, y);
        g.quadraticCurveTo(64, y + 9, 106, y);
        g.stroke();
      }
      g.fillStyle = '#131a36';
      g.fillRect(38, 14, 52, 14);
      g.strokeStyle = '#131a36';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(64, 10, 7, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#0a0e22';
      g.beginPath();
      g.ellipse(50, 76, 7, 12, -0.35, 0, 7);
      g.ellipse(80, 76, 7, 12, 0.35, 0, 7);
      g.fill();
    }),
  spitter: () =>
    canvasTex(144, 144, (g) => {
      // leaves
      g.fillStyle = '#0c2a26';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(72, 140);
        g.quadraticCurveTo(72 + s * 50, 104, 72 + s * 68, 132);
        g.quadraticCurveTo(72 + s * 40, 144, 72, 140);
        g.fill();
      }
      const gr = g.createRadialGradient(58, 70, 4, 72, 84, 54);
      gr.addColorStop(0, '#6a3a72');
      gr.addColorStop(0.6, '#371d40');
      gr.addColorStop(1, '#130a18');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(72, 30);
      g.bezierCurveTo(124, 46, 122, 124, 72, 138);
      g.bezierCurveTo(22, 124, 20, 46, 72, 30);
      g.fill();
      g.strokeStyle = '#0d0710';
      g.lineWidth = 3;
      g.stroke();
      // thorn crown
      g.fillStyle = '#1a0f20';
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(72 + i * 14 - 8, 44 + Math.abs(i) * 5);
        g.lineTo(72 + i * 20, 8 + Math.abs(i) * 10);
        g.lineTo(72 + i * 14 + 8, 44 + Math.abs(i) * 5);
        g.fill();
      }
      g.fillStyle = '#ffd0f4';
      g.shadowColor = '#ff7ad9';
      g.shadowBlur = 16;
      g.beginPath();
      g.ellipse(72, 50, 15, 6, 0, 0, 7);
      g.fill();
      g.beginPath();
      g.arc(54, 82, 4, 0, 7);
      g.arc(90, 82, 4, 0, 7);
      g.arc(72, 100, 3, 0, 7);
      g.fill();
    }),
  seed: () =>
    canvasTex(48, 48, (g) => {
      g.shadowColor = '#ff7ad9';
      g.shadowBlur = 12;
      g.fillStyle = '#ffd6f6';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 ? 9 : 17;
        g.lineTo(24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }),
  brute: () =>
    canvasTex(256, 224, (g) => {
      // chimney
      g.fillStyle = '#1b2233';
      g.save();
      g.translate(64, 64);
      g.rotate(-0.25);
      g.fillRect(-20, -52, 40, 70);
      g.fillStyle = '#39486a';
      g.fillRect(-25, -58, 50, 12);
      g.restore();
      const gr = g.createRadialGradient(100, 96, 8, 128, 128, 120);
      gr.addColorStop(0, '#55648c');
      gr.addColorStop(0.55, '#262f49');
      gr.addColorStop(1, '#0b0e1a');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(40, 208);
      g.bezierCurveTo(-4, 150, 20, 50, 128, 44);
      g.bezierCurveTo(236, 50, 258, 150, 216, 208);
      g.closePath();
      g.fill();
      g.strokeStyle = '#070912';
      g.lineWidth = 5;
      g.stroke();
      // plates
      g.strokeStyle = 'rgba(7,9,18,0.7)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(22, 120);
      g.quadraticCurveTo(128, 96, 236, 120);
      g.moveTo(24, 168);
      g.quadraticCurveTo(128, 150, 232, 168);
      g.stroke();
      g.fillStyle = '#7384b0';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(40 + i * 18, 126 - i * 2.4, 3.5, 0, 7);
        g.fill();
      }
      // furnace mouth
      g.fillStyle = '#04050a';
      g.beginPath();
      g.roundRect(146, 112, 78, 58, 14);
      g.fill();
      const fg = g.createRadialGradient(186, 146, 2, 186, 146, 40);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.4, COLD);
      fg.addColorStop(1, 'rgba(60,100,220,0)');
      g.fillStyle = fg;
      g.shadowColor = COLD;
      g.shadowBlur = 20;
      g.beginPath();
      g.roundRect(154, 120, 62, 42, 10);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#0b0e1a';
      for (let i = 0; i < 4; i++) g.fillRect(160 + i * 16, 112, 6, 58);
      // eye slit
      g.fillStyle = '#ffffff';
      g.shadowColor = COLD;
      g.shadowBlur = 14;
      g.beginPath();
      g.moveTo(170, 84);
      g.lineTo(214, 92);
      g.lineTo(172, 98);
      g.closePath();
      g.fill();
    }),
  bruteLeg: () =>
    canvasTex(56, 64, (g) => {
      g.fillStyle = '#0c0f1b';
      g.beginPath();
      g.roundRect(10, 0, 36, 56, 12);
      g.fill();
      g.beginPath();
      g.ellipse(30, 54, 26, 10, 0, 0, 7);
      g.fill();
    }),
  wardenBody: () =>
    canvasTex(384, 416, (g) => {
      const gr = g.createLinearGradient(60, 0, 340, 0);
      gr.addColorStop(0, '#4b5a84');
      gr.addColorStop(0.45, '#252d49');
      gr.addColorStop(1, '#0a0d19');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(70, 416);
      g.lineTo(46, 250);
      g.bezierCurveTo(30, 120, 90, 40, 192, 34);
      g.bezierCurveTo(294, 40, 354, 120, 338, 250);
      g.lineTo(314, 416);
      g.closePath();
      g.fill();
      g.strokeStyle = '#05060c';
      g.lineWidth = 6;
      g.stroke();
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(5,6,12,0.55)';
      g.lineWidth = 4;
      for (let y = 90; y < 416; y += 34) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(384, y);
        g.stroke();
        for (let x = 20 + ((y / 34) % 2) * 34; x < 384; x += 68) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 34);
          g.stroke();
        }
      }
      g.restore();
      // furnace door
      g.fillStyle = '#03040a';
      g.beginPath();
      g.arc(192, 250, 78, 0, 7);
      g.fill();
      g.strokeStyle = '#6a7cab';
      g.lineWidth = 12;
      g.stroke();
      const fg = g.createRadialGradient(192, 250, 4, 192, 250, 70);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.35, COLD);
      fg.addColorStop(1, 'rgba(50,80,220,0.1)');
      g.fillStyle = fg;
      g.shadowColor = COLD;
      g.shadowBlur = 30;
      g.beginPath();
      g.arc(192, 250, 62, 0, 7);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = '#0a0d19';
      g.lineWidth = 10;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(192 + i * 26, 176);
        g.lineTo(192 + i * 26, 324);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(116, 250);
      g.lineTo(268, 250);
      g.stroke();
      // shoulder plates
      g.fillStyle = '#56679a';
      g.beginPath();
      g.ellipse(84, 96, 62, 40, -0.5, Math.PI, 0);
      g.fill();
      g.fillStyle = '#1a2036';
      g.beginPath();
      g.ellipse(300, 96, 62, 40, 0.5, Math.PI, 0);
      g.fill();
    }),
  wardenHead: () =>
    canvasTex(224, 208, (g) => {
      g.fillStyle = '#1b2236';
      g.fillRect(92, 0, 40, 60);
      g.fillStyle = '#44547e';
      g.fillRect(84, 0, 56, 14);
      const gr = g.createLinearGradient(20, 0, 204, 0);
      gr.addColorStop(0, '#5a6b9c');
      gr.addColorStop(0.5, '#2a3352');
      gr.addColorStop(1, '#0c0f1c');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(22, 200);
      g.lineTo(22, 130);
      g.bezierCurveTo(22, 20, 202, 20, 202, 130);
      g.lineTo(202, 200);
      g.closePath();
      g.fill();
      g.strokeStyle = '#05060c';
      g.lineWidth = 6;
      g.stroke();
      // visor
      g.fillStyle = '#03040a';
      g.beginPath();
      g.roundRect(50, 104, 150, 46, 10);
      g.fill();
      g.fillStyle = '#ffffff';
      g.shadowColor = COLD;
      g.shadowBlur = 24;
      g.beginPath();
      g.moveTo(96, 118);
      g.lineTo(188, 122);
      g.lineTo(188, 134);
      g.lineTo(100, 138);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#0c0f1c';
      for (let i = 0; i < 6; i++) g.fillRect(64 + i * 24, 104, 8, 46);
      g.strokeStyle = 'rgba(170,195,245,0.4)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(30, 110);
      g.bezierCurveTo(40, 40, 110, 28, 150, 40);
      g.stroke();
    }),
  wardenArm: () =>
    canvasTex(160, 352, (g) => {
      const gr = g.createLinearGradient(30, 0, 130, 0);
      gr.addColorStop(0, '#4d5d8a');
      gr.addColorStop(1, '#10142a');
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(50, 10, 60, 130, 26);
      g.fill();
      g.beginPath();
      g.roundRect(46, 120, 68, 120, 24);
      g.fill();
      g.fillStyle = '#6d7fb0';
      g.beginPath();
      g.arc(80, 130, 22, 0, 7);
      g.fill();
      // great brick fist
      const fg = g.createLinearGradient(10, 220, 150, 350);
      fg.addColorStop(0, '#5f709f');
      fg.addColorStop(1, '#0a0d19');
      g.fillStyle = fg;
      g.beginPath();
      g.roundRect(12, 224, 136, 122, 22);
      g.fill();
      g.strokeStyle = '#05060c';
      g.lineWidth = 6;
      g.stroke();
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(12, 284);
      g.lineTo(148, 284);
      g.moveTo(58, 224);
      g.lineTo(58, 284);
      g.moveTo(104, 284);
      g.lineTo(104, 346);
      g.stroke();
      glowStroke(g, COLD, 12, 3, () => {
        jag(g, 30, 240, 120, 330, 7, 12, 1.9);
      });
    }),
  shock: () =>
    canvasTex(160, 192, (g) => {
      g.filter = 'blur(3px)';
      const gr = g.createLinearGradient(0, 192, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.4, 'rgba(170,215,255,0.75)');
      gr.addColorStop(1, 'rgba(90,130,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(10, 192);
      g.bezierCurveTo(30, 120, 80, 40, 150, 6);
      g.bezierCurveTo(120, 80, 110, 140, 120, 192);
      g.closePath();
      g.fill();
    }),
  // ───────── expansion: forge / rime creatures and bosses ─────────
  emberling: () =>
    canvasTex(128, 112, (g) => {
      const gr = g.createRadialGradient(64, 70, 4, 64, 66, 56);
      gr.addColorStop(0, '#5a2a1c');
      gr.addColorStop(0.6, '#2a1210');
      gr.addColorStop(1, '#0c0505');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(10, 106);
      g.bezierCurveTo(-2, 60, 30, 22, 64, 20);
      g.bezierCurveTo(98, 22, 130, 60, 118, 106);
      g.closePath();
      g.fill();
      g.strokeStyle = '#050202';
      g.lineWidth = 4;
      g.stroke();
      glowStroke(g, '#ffb040', 10, 3, () => {
        jag(g, 26, 96, 50, 44, 5, 8, 1.4);
      });
      glowStroke(g, '#ffb040', 10, 3, () => {
        jag(g, 80, 100, 100, 58, 4, 7, 2.6);
      });
      g.fillStyle = '#fff3c4';
      g.shadowColor = '#ff8a3c';
      g.shadowBlur = 14;
      g.beginPath();
      g.ellipse(52, 66, 7, 10, 0, 0, 7);
      g.ellipse(80, 66, 7, 10, 0, 0, 7);
      g.fill();
      g.beginPath();
      g.moveTo(48, 88);
      g.quadraticCurveTo(66, 98, 84, 88);
      g.quadraticCurveTo(66, 92, 48, 88);
      g.fill();
    }),
  dripper: () =>
    canvasTex(128, 176, (g) => {
      g.strokeStyle = '#120a08';
      g.lineWidth = 6;
      for (let y = 0; y < 56; y += 14) {
        g.beginPath();
        g.ellipse(64, y + 8, 5, 8, 0, 0, 7);
        g.stroke();
      }
      const gr = g.createLinearGradient(20, 0, 108, 0);
      gr.addColorStop(0, '#5a3a30');
      gr.addColorStop(1, '#140a08');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(14, 60);
      g.lineTo(114, 60);
      g.lineTo(98, 150);
      g.quadraticCurveTo(64, 172, 30, 150);
      g.closePath();
      g.fill();
      g.strokeStyle = '#080403';
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = '#ffd98a';
      g.shadowColor = '#ff8a3c';
      g.shadowBlur = 18;
      g.beginPath();
      g.ellipse(64, 62, 46, 8, 0, 0, 7);
      g.fill();
      g.beginPath();
      g.arc(46, 104, 6, 0, 7);
      g.arc(82, 104, 6, 0, 7);
      g.fill();
      g.beginPath();
      g.moveTo(58, 150);
      g.quadraticCurveTo(64, 176, 70, 150);
      g.fill();
    }),
  drop: () =>
    canvasTex(48, 80, (g) => {
      const gr = g.createRadialGradient(24, 54, 2, 24, 50, 26);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.4, '#ffd070');
      gr.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(24, 2);
      g.bezierCurveTo(30, 30, 46, 44, 42, 60);
      g.bezierCurveTo(38, 78, 10, 78, 6, 60);
      g.bezierCurveTo(2, 44, 18, 30, 24, 2);
      g.fill();
    }),
  orb: () =>
    canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.35, '#ffd070');
      gr.addColorStop(0.7, 'rgba(255,110,30,0.7)');
      gr.addColorStop(1, 'rgba(255,60,10,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    }),
  lancer: () =>
    canvasTex(224, 96, (g) => {
      g.shadowColor = '#bfe8ff';
      g.shadowBlur = 14;
      const gr = g.createLinearGradient(0, 20, 0, 76);
      gr.addColorStop(0, '#f2fbff');
      gr.addColorStop(0.5, '#9cd0ee');
      gr.addColorStop(1, '#3c6a94');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(218, 48);
      g.lineTo(150, 24);
      g.lineTo(40, 30);
      g.lineTo(6, 48);
      g.lineTo(40, 66);
      g.lineTo(150, 72);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.moveTo(218, 48);
      g.lineTo(150, 24);
      g.lineTo(40, 30);
      g.lineTo(60, 46);
      g.closePath();
      g.fill();
      g.fillStyle = '#0a1830';
      g.beginPath();
      g.ellipse(150, 48, 13, 9, 0, 0, 7);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(154, 48, 5, 5, 0, 0, 7);
      g.fill();
      // trailing shards
      g.fillStyle = '#9cd0ee';
      for (const [x, y, l] of [[30, 16, 26], [22, 80, 22], [60, 10, 18], [56, 86, 16]]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - l, y + (y < 48 ? -6 : 6));
        g.lineTo(x - 4, y + (y < 48 ? 8 : -8));
        g.fill();
      }
    }),
  briar: () =>
    canvasTex(384, 384, (g) => {
      // thorned vines
      g.lineCap = 'round';
      for (const [sx, ex, ey, w] of [[150, 30, 200, 16], [234, 356, 190, 16], [170, 70, 320, 12], [214, 320, 310, 12]]) {
        g.strokeStyle = '#0a1c18';
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(sx, 380);
        g.quadraticCurveTo((sx + ex) / 2, ey - 80, ex, ey);
        g.stroke();
        g.fillStyle = '#17362e';
        for (let t = 0.25; t < 1; t += 0.2) {
          const mx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * ((sx + ex) / 2) + t * t * ex;
          const my = (1 - t) * (1 - t) * 380 + 2 * (1 - t) * t * (ey - 80) + t * t * ey;
          g.beginPath();
          g.moveTo(mx - 6, my);
          g.lineTo(mx + (ex < 192 ? -22 : 22), my - 18);
          g.lineTo(mx + 6, my + 4);
          g.fill();
        }
      }
      // petals
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.36;
        g.save();
        g.translate(192, 230);
        g.rotate(a);
        const pg = g.createLinearGradient(0, -190, 0, 0);
        pg.addColorStop(0, '#ff9ae0');
        pg.addColorStop(0.35, '#7a2f6a');
        pg.addColorStop(1, '#1c0c20');
        g.fillStyle = pg;
        g.beginPath();
        g.moveTo(-26, 0);
        g.quadraticCurveTo(-44, -110, 0, -196);
        g.quadraticCurveTo(44, -110, 26, 0);
        g.closePath();
        g.fill();
        g.strokeStyle = '#12060f';
        g.lineWidth = 3;
        g.stroke();
        g.restore();
      }
      // bulb
      const gr = g.createRadialGradient(170, 240, 8, 192, 262, 120);
      gr.addColorStop(0, '#6e3a76');
      gr.addColorStop(0.6, '#33183c');
      gr.addColorStop(1, '#0f0714');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(192, 150);
      g.bezierCurveTo(320, 180, 316, 350, 192, 384);
      g.bezierCurveTo(68, 350, 64, 180, 192, 150);
      g.fill();
      g.strokeStyle = '#0b0510';
      g.lineWidth = 5;
      g.stroke();
      // the eye
      g.fillStyle = '#0a040c';
      g.beginPath();
      g.ellipse(192, 258, 54, 40, 0, 0, 7);
      g.fill();
      const eg = g.createRadialGradient(192, 258, 2, 192, 258, 40);
      eg.addColorStop(0, '#ffffff');
      eg.addColorStop(0.4, '#ffb0ea');
      eg.addColorStop(1, 'rgba(255,90,200,0.15)');
      g.fillStyle = eg;
      g.shadowColor = '#ff7ad9';
      g.shadowBlur = 30;
      g.beginPath();
      g.ellipse(192, 258, 40, 28, 0, 0, 7);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#1a0618';
      g.beginPath();
      g.ellipse(192, 258, 8, 24, 0, 0, 7);
      g.fill();
      g.fillStyle = '#ffd0f4';
      for (const [x, y] of [[120, 300], [264, 300], [150, 340], [234, 340]]) {
        g.beginPath();
        g.arc(x, y, 5, 0, 7);
        g.fill();
      }
    }),
  briarSpike: () =>
    canvasTex(96, 256, (g) => {
      const gr = g.createLinearGradient(0, 256, 0, 0);
      gr.addColorStop(0, '#0a1c18');
      gr.addColorStop(0.6, '#3a1640');
      gr.addColorStop(0.9, '#ff9ae0');
      gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr;
      g.shadowColor = '#ff7ad9';
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(14, 256);
      g.quadraticCurveTo(40, 120, 48, 4);
      g.quadraticCurveTo(56, 120, 82, 256);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#3a1640';
      for (const [y, s] of [[200, -1], [160, 1], [110, -1], [70, 1]]) {
        g.beginPath();
        g.moveTo(48, y - 10);
        g.lineTo(48 + s * 34, y - 26);
        g.lineTo(48, y + 10);
        g.fill();
      }
    }),
  bellowsBody: () =>
    canvasTex(320, 320, (g) => {
      // chains
      g.strokeStyle = '#140a08';
      g.lineWidth = 6;
      for (const x of [110, 210]) {
        for (let y = 262; y < 316; y += 15) {
          g.beginPath();
          g.ellipse(x, y + 7, 5, 8, 0, 0, 7);
          g.stroke();
        }
      }
      const gr = g.createRadialGradient(124, 124, 10, 160, 160, 140);
      gr.addColorStop(0, '#7a4a3a');
      gr.addColorStop(0.55, '#3a1e18');
      gr.addColorStop(1, '#100706');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(160, 156, 122, 0, 7);
      g.fill();
      g.strokeStyle = '#070303';
      g.lineWidth = 7;
      g.stroke();
      // riveted bands
      g.strokeStyle = 'rgba(7,3,3,0.7)';
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(160, 156, 122, 44, 0, 0, 7);
      g.stroke();
      g.fillStyle = '#b07a5a';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.arc(160 + Math.cos(a) * 110, 156 + Math.sin(a) * 110, 4.5, 0, 7);
        g.fill();
      }
      // crown stack
      g.fillStyle = '#241210';
      g.fillRect(132, 6, 56, 44);
      g.fillStyle = '#5a3628';
      g.fillRect(122, 0, 76, 14);
      // furnace grate
      g.fillStyle = '#050202';
      g.beginPath();
      g.roundRect(84, 150, 152, 84, 22);
      g.fill();
      const fg = g.createRadialGradient(160, 196, 4, 160, 192, 80);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.35, '#ffcf70');
      fg.addColorStop(1, 'rgba(255,90,20,0.1)');
      g.fillStyle = fg;
      g.shadowColor = '#ff8a3c';
      g.shadowBlur = 30;
      g.beginPath();
      g.roundRect(94, 160, 132, 64, 16);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#100706';
      for (let i = 0; i < 6; i++) g.fillRect(102 + i * 22, 150, 9, 84);
      // eyes
      g.fillStyle = '#fff3c4';
      g.shadowColor = '#ff8a3c';
      g.shadowBlur = 18;
      g.beginPath();
      g.moveTo(92, 104);
      g.lineTo(140, 118);
      g.lineTo(96, 128);
      g.closePath();
      g.moveTo(228, 104);
      g.lineTo(180, 118);
      g.lineTo(224, 128);
      g.closePath();
      g.fill();
    }),
  bellowsWing: () =>
    canvasTex(256, 192, (g) => {
      // accordion bellows fanning out from the left edge
      for (let i = 0; i < 6; i++) {
        const a0 = -0.62 + i * 0.21;
        const a1 = a0 + 0.21;
        const R = 236;
        g.fillStyle = i % 2 ? '#4a2a20' : '#22110d';
        g.beginPath();
        g.moveTo(8, 96);
        g.lineTo(8 + Math.cos(a0) * R, 96 + Math.sin(a0) * R * 0.78);
        g.lineTo(8 + Math.cos(a1) * R, 96 + Math.sin(a1) * R * 0.78);
        g.closePath();
        g.fill();
        g.strokeStyle = '#070303';
        g.lineWidth = 3;
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,176,90,0.55)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(8, 96);
      g.lineTo(8 + Math.cos(-0.62) * 236, 96 + Math.sin(-0.62) * 236 * 0.78);
      g.stroke();
    }),
};

export function sprite(name) {
  if (!cache.has(name)) cache.set(name, PAINT[name]());
  return cache.get(name);
}
