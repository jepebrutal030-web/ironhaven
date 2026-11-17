// HUD: status panels, objective, toasts, and the 2D minimap canvas.
import { ROADS, PLACES } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      healthFill: $('health-fill'), healthNum: $('health-num'),
      moneyNum: $('money-num'), stars: [...document.querySelectorAll('#stars .st')],
      objective: $('objective'), objTitle: $('obj-title'), objText: $('obj-text'),
      objDist: $('obj-dist'), objTimer: $('obj-timer'),
      drive: $('drive'), speed: $('speed'), carName: $('car-name'), carHealth: $('car-health-fill'),
      ammo: $('ammo'), ammoNum: $('ammo-num'),
      prompt: $('prompt'), toast: $('toast'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      damage: $('damage'), wantedFlash: $('wanted-flash'),
      map: $('minimap'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.toastT = null;
    this._flashT = 0;
    this.screens = {
      start: $('screen-start'), pause: $('screen-pause'),
      busted: $('screen-busted'), wasted: $('screen-wasted'), complete: $('screen-complete'),
    };
  }
  showScreen(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    document.getElementById('hud').style.visibility = name ? 'hidden' : 'visible';
    if (!name) document.getElementById('hud').style.visibility = 'visible';
  }
  hideScreens() { for (const el of Object.values(this.screens)) el.classList.add('hidden'); document.getElementById('hud').style.visibility = 'visible'; }
  toast(title, sub = '', secs = 3.5) {
    this.el.toast.innerHTML = `${title}${sub ? `<span class="sub">${sub}</span>` : ''}`;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.el.toast.classList.remove('show'), secs * 1000);
  }
  prompt(html) {
    if (!html) { this.el.prompt.style.display = 'none'; return; }
    this.el.prompt.innerHTML = html;
    this.el.prompt.style.display = 'block';
  }
  hitmarker() {
    this.el.hitmarker.classList.add('on');
    setTimeout(() => this.el.hitmarker.classList.remove('on'), 110);
  }
  damageFlash() {
    this.el.damage.classList.add('on');
    setTimeout(() => this.el.damage.classList.remove('on'), 160);
  }
  update(s) {
    // s: {health, money, wanted, driving, speed, carName, carHealth, ammo, reloading, objective, prompt, crosshair}
    this.el.healthFill.style.width = `${Math.max(0, s.health)}%`;
    this.el.healthNum.textContent = Math.ceil(Math.max(0, s.health));
    this.el.moneyNum.textContent = Math.floor(s.money).toLocaleString('en-US');
    this.el.stars.forEach((el, i) => el.classList.toggle('on', i < s.wanted));
    const o = s.objective;
    this.el.objTitle.textContent = o.title;
    this.el.objText.textContent = o.text;
    this.el.objDist.textContent = o.dist != null ? `${o.dist} m — follow the yellow beacon` : '';
    if (o.timer != null) {
      this.el.objTimer.style.display = 'block';
      this.el.objTimer.textContent = `⏱ ${Math.ceil(o.timer)}s`;
    } else this.el.objTimer.style.display = 'none';
    if (s.driving) {
      this.el.drive.style.display = 'block';
      this.el.ammo.style.display = 'none';
      this.el.speed.innerHTML = `${Math.round(Math.abs(s.speed) * 2.237)} <small>mph</small>`;
      this.el.carName.textContent = s.carName || '';
      this.el.carHealth.style.width = `${Math.max(0, s.carHealth)}%`;
    } else {
      this.el.drive.style.display = 'none';
      this.el.ammo.style.display = 'block';
      this.el.ammoNum.innerHTML = s.reloading ? '—' : `${s.ammo} <small>/ ∞</small>`;
    }
    this.el.crosshair.style.display = s.crosshair ? 'block' : 'none';
    this.prompt(s.prompt || '');
    if (s.wanted > 0) {
      this._flashT += 0.016;
      const ph = Math.floor(this._flashT * 1.6) % 2 === 0;
      this.el.wantedFlash.style.opacity = ph ? '0.5' : '0';
    } else this.el.wantedFlash.style.opacity = '0';
  }
  drawMinimap(d) {
    // d: {player:{x,z,angle}, driving, police:[{x,z}], traffic:[{x,z}], hostiles:[{x,z}], marker:{x,z}|null, missionCar:{x,z}|null}
    const g = this.mapCtx, W = 200;
    const toPx = (x) => (x + 200) / 480 * W;
    const toPy = (z) => (z + 240) / 480 * W;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#101418'; g.fillRect(0, 0, W, W);
    // water strip
    g.fillStyle = '#1d4a5e'; g.fillRect(toPx(224), 0, W - toPx(224), W);
    g.fillStyle = '#c9b489'; g.fillRect(toPx(196), 0, toPx(224) - toPx(196), W);
    // roads
    g.fillStyle = '#3a3f46';
    for (const r of ROADS) {
      g.fillRect(toPx(r - 7), toPy(-196), 14 / 480 * W, 392 / 480 * W);
      g.fillRect(toPx(-196), toPy(r - 7), 392 / 480 * W, 14 / 480 * W);
    }
    // plaza
    g.fillStyle = '#4a7a3a'; g.fillRect(toPx(-20), toPy(-20), 40 / 480 * W, 40 / 480 * W);
    // mission marker (pulsing)
    if (d.marker) {
      const pulse = 5 + Math.sin(performance.now() / 200) * 2;
      g.fillStyle = '#f5b942';
      g.beginPath(); g.arc(toPx(d.marker.x), toPy(d.marker.z), pulse, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff7e8'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(toPx(d.marker.x), toPy(d.marker.z), pulse + 3, 0, Math.PI * 2); g.stroke();
    }
    if (d.missionCar) {
      g.fillStyle = '#ffd700';
      g.beginPath(); g.arc(toPx(d.missionCar.x), toPy(d.missionCar.z), 3.5, 0, Math.PI * 2); g.fill();
    }
    // traffic (gray)
    g.fillStyle = '#8a8a8a';
    for (const t of d.traffic) { g.fillRect(toPx(t.x) - 1, toPy(t.z) - 1, 2, 2); }
    // hostiles (red)
    g.fillStyle = '#ff4d3d';
    for (const h of d.hostiles) { g.beginPath(); g.arc(toPx(h.x), toPy(h.z), 3, 0, Math.PI * 2); g.fill(); }
    // police (blue/red)
    for (const p of d.police) {
      g.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff2a1e' : '#2a6aff';
      g.beginPath(); g.arc(toPx(p.x), toPy(p.z), 3.5, 0, Math.PI * 2); g.fill();
    }
    // player arrow
    const px = toPx(d.player.x), py = toPy(d.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(d.player.angle), Math.cos(d.player.angle)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.strokeStyle = '#111111'; g.lineWidth = 1; g.stroke();
    g.restore();
  }
}
