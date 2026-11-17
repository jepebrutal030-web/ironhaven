// Story missions for IRONHAVEN: five jobs, beginning / middle / end.
import { PLACES, TUNING } from './config.js';

export const MISSIONS = [
  {
    id: 'homecoming', title: 'Mission 1 — Homecoming', reward: TUNING.missionReward[0],
    briefing: 'Mara is waiting at the hideout. Get wheels and get there.',
    steps: [
      { type: 'enterCar', text: 'Steal a car — any car. Walk up to one and press E.' },
      { type: 'drive', text: 'Drive to the hideout.', marker: PLACES.hideout, radius: 12 },
    ],
  },
  {
    id: 'pickup', title: 'Mission 2 — The Pickup', reward: TUNING.missionReward[1],
    briefing: 'A package is waiting at Sable Market. Pick it up and run it to the safehouse.',
    steps: [
      { type: 'reach', text: 'Pick up the package at Sable Market.', marker: PLACES.market, radius: 10 },
      { type: 'deliver', text: 'Deliver the package to the safehouse.', marker: PLACES.safehouse, radius: 12, timer: 100 },
    ],
  },
  {
    id: 'getaway', title: 'Mission 3 — The Getaway', reward: TUNING.missionReward[2],
    briefing: 'The job went sideways. The IHPD is on you — lose them, then get to the safehouse.',
    onStart: (G) => G.wanted.setWanted(3),
    steps: [
      { type: 'loseWanted', text: 'Lose the cops — get your wanted level to zero.' },
      { type: 'reach', text: 'Reach the safehouse.', marker: PLACES.safehouse, radius: 12 },
    ],
  },
  {
    id: 'shakedown', title: 'Mission 4 — The Shakedown', reward: TUNING.missionReward[3],
    briefing: 'The Vultures took Mara\'s cut. Take it back — all of it — and bring their car home.',
    steps: [
      { type: 'reach', text: 'Get to the Vultures\' turf by the harbor.', marker: PLACES.vultureTurf, radius: 16 },
      { type: 'eliminate', text: 'Clear out the Vultures.', marker: PLACES.vultureTurf, radius: 30, count: 5,
        onStart: (G) => G.spawnHostiles(PLACES.vultureTurf.x, PLACES.vultureTurf.z, 5) },
      { type: 'enterCar', text: 'Take their red Comet GT.', carName: 'Comet GT',
        onStart: (G) => G.spawnMissionCar('Comet GT', 0xd42a1e, PLACES.vultureTurf.x + 8, PLACES.vultureTurf.z + 6, Math.PI / 2) },
      { type: 'deliver', text: 'Bring the Comet GT to the hideout.', marker: PLACES.hideout, radius: 12, carName: 'Comet GT' },
    ],
  },
  {
    id: 'harbor', title: 'Mission 5 — The Harbor Job', reward: TUNING.missionReward[4],
    briefing: 'One last job: the golden Vulture is sitting at the docks. Steal it, run the blockade, deliver it to the Container Yard.',
    steps: [
      { type: 'reach', text: 'Get to the Harbor Docks.', marker: PLACES.harbor, radius: 16 },
      { type: 'enterCar', text: 'Steal the golden Vulture.', carName: 'Manta GT',
        onStart: (G) => G.spawnMissionCar('Manta GT', 0xd4af1e, PLACES.harbor.x - 6, PLACES.harbor.z + 4, -Math.PI / 2) },
      { type: 'deliver', text: 'Deliver the Vulture to the Container Yard.', marker: PLACES.containerYard, radius: 14, carName: 'Manta GT',
        onStart: (G) => G.wanted.setWanted(4) },
    ],
  },
];

export class MissionManager {
  constructor(G) {
    this.G = G; // game context: wanted, spawnHostiles, spawnMissionCar, toast, sound, money hooks
    this.index = 0; this.step = 0; this.timer = null; this.active = false; this.finished = false;
    this.completed = new Set();
  }
  current() { return MISSIONS[this.index] || null; }
  start(i) {
    this.index = i; this.step = 0; this.timer = null; this.active = true;
    const m = this.current();
    if (!m) { this.active = false; return; }
    if (m.onStart) m.onStart(this.G);
    this.G.toast(m.title, m.briefing, 5);
    this.G.sound.missionComplete && 0; // no-op, keeps the shape obvious
    this.beginStep();
  }
  restart() { this.start(this.index); }
  beginStep() {
    const s = this.current()?.steps[this.step];
    if (!s) return;
    this.timer = s.timer != null ? s.timer : null;
    if (s.onStart) s.onStart(this.G);
  }
  currentMarker() {
    const s = this.current()?.steps[this.step];
    return s?.marker || null;
  }
  objective() {
    if (this.finished) return { title: 'Free Roam', text: 'Ironhaven is yours. Cruise, steal, and stay out of trouble.', dist: null, timer: null };
    const m = this.current();
    if (!m || !this.active) return { title: 'Ironhaven', text: 'Welcome to the city.', dist: null, timer: null };
    const s = m.steps[this.step];
    let dist = null;
    if (s?.marker) {
      const p = this.G.playerPos();
      dist = Math.round(Math.hypot(s.marker.x - p.x, s.marker.z - p.z));
    }
    return { title: m.title, text: s.text, dist, timer: this.timer };
  }
  update(dt) {
    if (!this.active || this.finished) return;
    const m = this.current();
    if (!m) return;
    if (this.timer != null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = null;
        this.G.toast('Too slow', 'The window closed. The job is back on — try again.', 4);
        this.G.sound.busted();
        this.restart();
        return;
      }
    }
    const s = m.steps[this.step];
    if (!s) return;
    const G = this.G;
    const p = G.playerPos();
    const near = (mk, r) => mk && Math.hypot(mk.x - p.x, mk.z - p.z) < r;
    let done = false;
    switch (s.type) {
      case 'enterCar': done = G.justEnteredCar === s.carName || (G.justEnteredCar && !s.carName); break;
      case 'drive': done = G.driving && near(s.marker, s.radius); break;
      case 'reach': done = near(s.marker, s.radius); break;
      case 'deliver': done = G.driving && (!s.carName || G.playerCar?.name === s.carName) && near(s.marker, s.radius); break;
      case 'loseWanted': done = G.wanted.wanted === 0; break;
      case 'eliminate': done = G.hostilesAlive() === 0; break;
    }
    if (done) this.advanceStep();
  }
  advanceStep() {
    const m = this.current();
    this.step++;
    this.G.sound.pickup();
    if (this.step >= m.steps.length) {
      this.completeMission();
    } else {
      this.beginStep();
      const s = m.steps[this.step];
      this.G.toast(m.title, s.text, 4);
    }
  }
  completeMission() {
    const m = this.current();
    this.completed.add(m.id);
    this.G.addMoney(m.reward);
    this.G.toast('Mission complete', `${m.title} — $${m.reward}`, 4);
    this.G.sound.missionComplete();
    this.G.autosave();
    this.index++;
    if (this.index >= MISSIONS.length) {
      this.finished = true; this.active = false;
      this.G.onStoryComplete();
    } else {
      this.step = 0; this.timer = null;
      const next = this.current();
      if (next.onStart) next.onStart(this.G);
      this.G.toast(next.title, next.briefing, 5);
      this.beginStep();
    }
  }
}
