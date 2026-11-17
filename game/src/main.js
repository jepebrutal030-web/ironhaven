// IRONHAVEN — game orchestration: loop, modes, driving, combat, wanted, missions, save.
import * as THREE from 'three';
import { PLACES, TUNING, CAR_MODELS } from './config.js';
import { makeRng, hashSeed } from './rng.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { buildCity, collideCircle } from './world.js';
import { createCar, stepCar, nearestCar, Traffic, spawnParked } from './vehicles.js';
import { PedSystem } from './peds.js';
import { Player } from './player.js';
import { WantedSystem } from './police.js';
import { MissionManager, MISSIONS } from './missions.js';
import { HUD } from './hud.js';
import { Effects } from './effects.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot') || '';

class Game {
  constructor() {
    this.rng = makeRng(hashSeed('ironhaven-' + SEED));
    // adaptive quality: headless/software renderers get a lighter pipeline
    // (SwiftShader rasterizes ~3M px/s here, so the shadow pass alone costs
    // ~200ms/frame — real GPUs are unaffected, this only kicks in headless)
    const headless = navigator.webdriver === true;
    this.renderer = new THREE.WebGLRenderer({ antialias: !headless, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(headless ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !headless;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
    this.camera.position.set(-140, 40, -140);
    this.clock = new THREE.Clock();
    this.time = 0;

    const { colliders, water, sun } = buildCity(this.scene, this.rng);
    this.colliders = colliders; this.water = water; this.sun = sun;
    this.scene.add(sun.target);
    this.audio = new AudioEngine();
    this.input = new Input();
    this.input.onFirstGesture = () => { this.audio.ensure(); this.audio.startMusic(); };
    this.hud = new HUD();
    this.effects = new Effects(this.scene);
    this.player = new Player(this.scene);
    this.traffic = new Traffic(this.scene, this.rng, this.colliders);
    this.parked = spawnParked(this.scene, this.rng);
    this.peds = new PedSystem(this.scene, this.rng);
    this.wanted = new WantedSystem(this.scene, this.rng);
    this.cars = [...this.traffic.cars, ...this.parked];
    this.wrecks = [];
    this.missionCar = null;

    // game context handed to missions + police
    this.G = {
      playerPos: () => ({ x: this.player.pos.x, z: this.player.pos.z }),
      wanted: this.wanted, driving: false, playerCar: null, justEnteredCar: null,
      spawnHostiles: (x, z, n) => { for (let i = 0; i < n; i++) this.peds.spawnHostile(x + this.rng.range(-12, 12), z + this.rng.range(-12, 12)); },
      spawnMissionCar: (name, color, x, z, angle) => this.spawnMissionCar(name, color, x, z, angle),
      hostilesAlive: () => this.peds.hostiles.filter((h) => h.state !== 'fallen').length,
      addMoney: (n) => { this.money += n; },
      toast: (t, s, sec) => this.hud.toast(t, s, sec),
      sound: this.audio,
      autosave: () => this.autosave(),
      onStoryComplete: () => this.onStoryComplete(),
    };
    this.missions = new MissionManager(this.G);

    this.mode = 'title';
    this.money = 0; this.kills = 0; this.playTime = 0;
    this.driving = false; this.playerCar = null;
    this.camPos = new THREE.Vector3(-140, 40, -140);
    this.mapT = 0;

    this.bindUI();
    this.bindWorldEvents();
    this.makeBeacon();
    this.player.reset(PLACES.hideout.x, PLACES.hideout.z + 6, Math.PI);
    this.updateMissionList();
    this.hud.showScreen('start');
    document.getElementById('btn-continue').disabled = !hasSave();
    this.wanted.onWantedChange = (n, prev) => {
      if (n > prev) { this.hud.toast('Wanted level up', `${'★'.repeat(n)} — the IHPD is on you`, 3); this.audio.wantedUp(); }
    };
    this.wanted.onBusted = (reason) => this.busted(reason);
    this.wanted.onCopKilled = () => {};
    this.peds.onPedDown = (ped, byPlayerCar) => {
      if (byPlayerCar) { this.kills++; this.wanted.addHeat(1); this.hud.toast('Pedestrian down', 'The IHPD is coming', 3); }
    };
    this.peds.onHostileShot = (from, hit) => {
      const target = this.player.pos.clone(); target.y += 1.2;
      this.effects.tracer(from.clone().setY(1.2), target, 0xff6a5a);
      this.audio.enemyShoot();
      if (hit) this.damagePlayer(8);
    };
    this.setupShotMode();
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.mode === 'playing' && !this.driving && !this.input.locked) this.input.lockPointer();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.mode === 'playing' && !this.driving && !SHOT) this.pause();
    });
    this.loop();
  }

  bindUI() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { this.audio.ensure(); this.audio.uiClick(); fn(); });
    on('btn-new', () => this.newGame());
    on('btn-continue', () => this.continueGame());
    on('btn-resume', () => this.resume());
    on('btn-save', () => { const ok = this.saveNow(); document.getElementById('save-note').textContent = ok ? 'Saved ✓ — progress is in this browser.' : 'Save failed in this browser.'; });
    on('btn-restart-mission', () => { this.missions.restart(); this.resume(); this.hud.toast(this.missions.current().title, 'Mission restarted.', 3); });
    on('btn-quit', () => this.quitToTitle());
    on('btn-busted', () => this.respawn('busted'));
    on('btn-wasted', () => this.respawn('wasted'));
    on('btn-freeroam', () => { this.mode = 'playing'; this.hud.hideScreens(); });
    on('btn-again', () => this.newGame());
  }

  bindWorldEvents() {
    this.onCrash = (car, speed) => {
      if (car.isPlayer) {
        this.audio.thud();
        if (speed > 18) this.damagePlayer(5);
        const p = car.group.position;
        this.effects.burst(new THREE.Vector3(p.x, 1, p.z), 0xaaaaaa, 6, 4, 0.5, 4, 2);
      }
    };
    this.onWreck = (car) => this.wreckCar(car);
  }

  makeBeacon() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 34, 20, 1, true), mat);
    this.beacon.position.y = 17;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 28),
      new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
    this.beaconRing = ring;
    this.beacon.visible = false; ring.visible = false;
    this.scene.add(this.beacon); this.scene.add(ring);
  }

  updateMissionList() {
    const el = document.getElementById('mission-list');
    el.innerHTML = MISSIONS.map((m, i) => {
      const cls = this.missions.completed.has(m.id) ? 'done' : (i === this.missions.index ? 'cur' : '');
      const mark = this.missions.completed.has(m.id) ? '✓ ' : (i === this.missions.index ? '▸ ' : '· ');
      return `<div class="${cls}">${mark}${m.title} — $${m.reward}</div>`;
    }).join('');
  }

  // ---------- modes ----------
  newGame() {
    this.money = 0; this.kills = 0; this.playTime = 0;
    this.clearMissionCars();
    this.peds.hostiles.forEach((h) => this.scene.remove(h.group));
    this.peds.hostiles = [];
    this.wanted.setWanted(0, true);
    this.player.reset(PLACES.hideout.x, PLACES.hideout.z + 6, Math.PI);
    this.missions.completed.clear();
    this.missions.finished = false;
    this.mode = 'playing';
    this.hud.hideScreens();
    this.missions.start(0);
    this.updateMissionList();
    this.audio.ensure(); this.audio.startMusic();
  }
  continueGame() {
    const s = loadGame();
    if (!s) return;
    this.money = s.money; this.kills = s.kills || 0; this.playTime = s.playTime || 0;
    this.player.reset(s.player.x, s.player.z, s.player.yaw || 0);
    this.player.health = s.health || 100;
    this.missions.completed = new Set(s.completed || []);
    this.missions.finished = s.missionIndex >= MISSIONS.length;
    this.mode = 'playing';
    this.hud.hideScreens();
    if (this.missions.finished) { this.missions.index = MISSIONS.length; this.missions.active = false; }
    else this.missions.start(s.missionIndex || 0);
    this.wanted.setWanted(s.wanted || 0, true);
    this.updateMissionList();
    this.audio.ensure(); this.audio.startMusic();
  }
  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.unlockPointer();
    this.updateMissionList();
    this.hud.showScreen('pause');
  }
  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.hud.hideScreens();
  }
  quitToTitle() {
    this.mode = 'title';
    this.autosave();
    this.input.unlockPointer();
    document.getElementById('btn-continue').disabled = !hasSave();
    this.hud.showScreen('start');
  }
  busted(reason) {
    if (this.mode !== 'playing') return;
    this.mode = 'busted';
    this.audio.busted();
    this.exitCar(true);
    const fine = Math.min(this.money, TUNING.fine);
    document.getElementById('busted-fine').textContent = `$${fine}`;
    this._pendingFine = fine;
    this.input.unlockPointer();
    this.hud.showScreen('busted');
  }
  wasted() {
    if (this.mode !== 'playing') return;
    this.mode = 'wasted';
    this.audio.busted();
    this.exitCar(true);
    const fine = Math.min(this.money, TUNING.fine);
    document.getElementById('wasted-fine').textContent = `$${fine}`;
    this._pendingFine = fine;
    this.input.unlockPointer();
    this.hud.showScreen('wasted');
  }
  respawn() {
    this.money = Math.max(0, this.money - (this._pendingFine || 0));
    this.player.reset(PLACES.hospital.x, PLACES.hospital.z + 8, Math.PI);
    this.wanted.setWanted(0, true);
    this.missions.restart();
    this.mode = 'playing';
    this.hud.hideScreens();
    this.hud.toast('Back on the streets', 'Mara still has work for you.', 3);
  }
  onStoryComplete() {
    this.mode = 'complete';
    document.getElementById('end-money').textContent = `$${Math.floor(this.money).toLocaleString('en-US')}`;
    const m = Math.floor(this.playTime / 60), s = Math.floor(this.playTime % 60);
    document.getElementById('end-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
    document.getElementById('end-kills').textContent = String(this.kills);
    this.input.unlockPointer();
    this.hud.showScreen('complete');
  }
  damagePlayer(n) {
    if (this.mode !== 'playing') return;
    this.player.health -= n;
    this.hud.damageFlash();
    if (this.player.health <= 0) { this.player.health = 0; this.wasted(); }
  }
  addMoney(n) { this.money += n; }
  saveNow() {
    return saveGame({
      money: this.money, missionIndex: this.missions.index, completed: this.missions.completed,
      player: this.player.pos, yaw: this.player.yaw, health: this.player.health,
      wanted: this.wanted.wanted, kills: this.kills, playTime: this.playTime,
    });
  }
  autosave() { if (this.mode === 'playing' || this.mode === 'paused') this.saveNow(); }
  clearMissionCars() {
    if (this.missionCar) {
      this.scene.remove(this.missionCar.group);
      const i = this.cars.indexOf(this.missionCar);
      if (i >= 0) this.cars.splice(i, 1);
      this.missionCar = null;
    }
  }
  spawnMissionCar(name, color, x, z, angle) {
    this.clearMissionCars();
    const model = CAR_MODELS.find((m) => m.name === name);
    const car = createCar(model, color, x, z, angle);
    car.isParked = true;
    car.group.userData = { kind: 'car', ref: car };
    this.scene.add(car.group);
    this.cars.push(car);
    this.missionCar = car;
    return car;
  }

  // ---------- driving / combat ----------
  enterCar() {
    const car = nearestCar({ x: this.player.pos.x, z: this.player.pos.z }, TUNING.carEnterDist, this.cars);
    if (!car) return;
    // witness check for stealing
    let witnessed = false;
    for (const c of this.wanted.policeCars) {
      const dx = c.group.position.x - car.group.position.x, dz = c.group.position.z - car.group.position.z;
      if (dx * dx + dz * dz < 45 * 45) witnessed = true;
    }
    if (!witnessed) for (const p of this.peds.peds) {
      const dx = p.group.position.x - car.group.position.x, dz = p.group.position.z - car.group.position.z;
      if (dx * dx + dz * dz < 25 * 25) witnessed = true;
    }
    if (car.isTraffic) {
      const i = this.traffic.cars.indexOf(car);
      if (i >= 0) this.traffic.cars.splice(i, 1);
      // the driver bails and runs
      const d = this.peds.spawnPed();
      d.group.position.set(car.group.position.x + 2, 0, car.group.position.z + 2);
      d.state = 'flee';
      d.target = { x: car.group.position.x + 40, z: car.group.position.z + 40 };
      if (witnessed) this.wanted.addHeat(1);
      this.hud.toast('Car stolen', witnessed ? 'Someone saw that — the IHPD is coming' : 'Clean getaway. For now.', 3);
    } else if (car.isPolice) {
      if (witnessed) this.wanted.addHeat(2);
      this.hud.toast('You stole a cop car', 'Bold. Very bold.', 3);
    } else if (car === this.missionCar) {
      this.hud.toast(car.name, 'This is the one.', 3);
    }
    car.isTraffic = false; car.isParked = false; car.isPlayer = true;
    this.playerCar = car; this.driving = true;
    this.player.group.visible = false;
    this.G.justEnteredCar = car.name;
    this.audio.setEngine(0, true);
  }
  exitCar(silent = false) {
    if (!this.driving || !this.playerCar) return;
    const car = this.playerCar;
    car.isPlayer = false;
    car.speed *= 0.2;
    const a = car.angle;
    const px = car.group.position.x + Math.cos(a) * 2.6;
    const pz = car.group.position.z - Math.sin(a) * 2.6;
    this.player.pos.set(px, 0, pz);
    this.player.yaw = a;
    this.player.group.visible = true;
    this.playerCar = null; this.driving = false;
    this.audio.setEngine(0, false);
    if (!silent) this.hud.toast('On foot', 'Press E near a car to get back in.', 2.5);
  }
  wreckCar(car) {
    if (car._wrecked) return;
    car._wrecked = true;
    const p = car.group.position.clone(); p.y = 1;
    this.effects.explosion(p);
    this.audio.explosion();
    this.wrecks.push({ car, t: 0 });
    const wasPlayer = car.isPlayer;
    if (wasPlayer) {
      this.exitCar(true);
      this.player.pos.set(p.x + 3, 0, p.z + 3);
      this.damagePlayer(30);
      this.wanted.addHeat(1);
    }
    if (car.isPolice) this.wanted.addHeat(2);
    if (car.isTraffic) {
      const i = this.traffic.cars.indexOf(car);
      if (i >= 0) this.traffic.cars.splice(i, 1);
    }
    // leave the husk smoking in the world
    car.group.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: 0x1c1a18 }); });
  }
  shoot(muzzle, end, hitObj) {
    this.effects.tracer(muzzle, end);
    this.effects.muzzle(muzzle);
    this.audio.shoot();
    this.peds.fleeFrom(this.player.pos.x, this.player.pos.z, 30);
    if (this._lastShotHeat == null || this.time - this._lastShotHeat > 12) {
      this._lastShotHeat = this.time;
      if (this.wanted.wanted < 5) this.wanted.addHeat(1);
    }
    let obj = hitObj;
    while (obj && !(obj.userData && obj.userData.kind)) obj = obj.parent;
    if (!obj || !obj.userData) {
      if (end) this.effects.burst(end, 0xcccccc, 5, 3, 0.35, 5, 1);
      return;
    }
    const { kind, ref } = obj.userData;
    if (kind === 'ped' || kind === 'hostile') {
      this.hud.hitmarker();
      this.peds.damage(ref, TUNING.pistolDamage);
      if (ref.state === 'fallen') {
        this.kills++;
        if (kind === 'ped') this.wanted.addHeat(1);
      }
    } else if (kind === 'car') {
      this.hud.hitmarker();
      ref.health -= TUNING.pistolDamage;
      this.effects.burst(end, 0xffc860, 6, 5, 0.3, 5, 1);
      if (ref.isPolice) this.wanted.addHeat(1);
      if (ref.health <= 0 && !ref.dead) { ref.dead = true; this.onWreck(ref); }
    }
  }

  // ---------- shot mode (deterministic scenes for screenshots) ----------
  setupShotMode() {
    if (!SHOT) return;
    if (SHOT === 'start') return; // title screen stays
    this.newGame();
    const placeCar = (name, x, z, angle, speed = 0) => {
      const model = CAR_MODELS.find((m) => m.name === name);
      const car = createCar(model, model.colors[0], x, z, angle);
      car.isParked = true; car.group.userData = { kind: 'car', ref: car };
      this.scene.add(car.group); this.cars.push(car);
      return car;
    };
    if (SHOT === 'drive') {
      const car = placeCar('Falcon', -81, -24, Math.PI / 2);
      this.player.pos.set(-81, 0, -20);
      this.enterCarAt(car); this.playerCar.speed = 22;
      this.input.keys.add('KeyW'); // hold the throttle so the car keeps its speed
    } else if (SHOT === 'chase') {
      const car = placeCar('Comet GT', 27, 24, 0);
      this.player.pos.set(27, 0, 20);
      this.enterCarAt(car); this.playerCar.speed = 26;
      this.wanted.setWanted(3, true);
      for (let i = 0; i < 2; i++) {
        const pc = this.wanted.spawnPoliceCar(this.player.pos);
        pc.group.position.set(27 + (i ? 8 : -8), 0, 24 - 14 - i * 6);
        pc.angle = 0; pc.speed = 24;
      }
      this.missions.start(2); // getaway in progress
    } else if (SHOT === 'foot') {
      this.player.reset(6, 8, Math.PI * 0.9);
      this.missions.start(3);
      this.missions.step = 1; this.missions.beginStep(); // eliminate step
      this.peds.spawnHostile(-6, 14, 'Vulture'); this.peds.spawnHostile(10, 18, 'Vulture');
      this.peds.spawnHostile(16, 4, 'Vulture');
    } else if (SHOT === 'mission') {
      this.missions.start(4); // the Harbor Job
      this.missions.step = 1; this.missions.beginStep(); // spawns the golden Manta GT at the docks
      const car = this.missionCar;
      this.player.pos.set(210, 0, 60);
      this.enterCarAt(car); this.playerCar.speed = 14;
      this.missions.step = 2; this.missions.beginStep(); // wanted 4, beacon at the Container Yard
    }
    this.mode = 'playing';
    this.hud.hideScreens();
  }
  enterCarAt(car) {
    car.isTraffic = false; car.isParked = false; car.isPlayer = true;
    this.playerCar = car; this.driving = true;
    this.player.group.visible = false;
    this.G.justEnteredCar = car.name;
    // snap the chase camera behind the car: no lerp lag, so the first frames
    // already frame the car (matters for screenshots; also feels responsive)
    const a = car.angle, fx = Math.sin(a), fz = Math.cos(a);
    this.camPos.set(car.group.position.x - fx * 10.5, 3.8, car.group.position.z - fz * 10.5);
  }

  // ---------- main loop ----------
  loop() {
    this.renderer.setAnimationLoop(() => this.frame());
  }
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (this.mode === 'title') {
      // slow cinematic orbit over the city behind the title screen
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 190, 85, Math.cos(a) * 190);
      this.camera.lookAt(0, 10, 0);
    }
    if (this.mode === 'playing') {
      this.playTime += dt;
      this.update(dt);
    }
    // sun + shadows follow the player so the shadow map stays dense
    const px = this.player.pos.x, pz = this.player.pos.z;
    this.sun.position.set(px + 120, 180, pz + 60);
    this.sun.target.position.set(px, 0, pz);
    // water shimmer
    this.water.position.y = 0.15 + Math.sin(this.time * 0.8) * 0.06;
    this.effects.update(dt);
    // beacon pulse
    const mk = this.missions.currentMarker();
    if (mk && this.mode === 'playing') {
      this.beacon.visible = true; this.beaconRing.visible = true;
      this.beacon.position.set(mk.x, 17 + Math.sin(this.time * 2) * 1.5, mk.z);
      this.beaconRing.position.set(mk.x, 0.12, mk.z);
      const s = 1 + Math.sin(this.time * 3) * 0.12;
      this.beaconRing.scale.set(s, s, 1);
    } else { this.beacon.visible = false; this.beaconRing.visible = false; }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
  update(dt) {
    const input = this.input;
    if (input.wasPressed('KeyP')) { this.pause(); return; }
    if (input.wasPressed('KeyM')) { this.audio.setMuted(!this.audio.muted); this.hud.toast(this.audio.muted ? 'Music muted' : 'Music on', '', 1.5); }
    // while driving, the player's position IS the car's — everything downstream
    // (missions, police, minimap, sun) reads player.pos, so keep it in sync.
    if (this.driving && this.playerCar) this.player.pos.set(this.playerCar.group.position.x, 0, this.playerCar.group.position.z);
    const playerPos = { x: this.player.pos.x, z: this.player.pos.z };
    // keep the master car list in sync with police spawns/despawns
    for (const c of this.wanted.policeCars) if (!this.cars.includes(c)) this.cars.push(c);
    this.cars = this.cars.filter((c) => !c.isPolice || this.wanted.policeCars.includes(c));
    const ctx = {
      colliders: this.colliders, cars: this.cars, onCrash: this.onCrash, onWreck: this.onWreck,
      playerPos, playerInCar: this.driving, playerCar: this.playerCar, time: this.time,
      onSiren: (d) => this.audio.setSiren(d),
    };
    // --- enter / exit car ---
    if (input.wasPressed('KeyE')) {
      if (this.driving) this.exitCar();
      else this.enterCar();
    }
    // --- player / driving ---
    if (this.driving && this.playerCar) {
      const ax = input.axis();
      const boost = input.down('ShiftLeft') || input.down('ShiftRight');
      stepCar(this.playerCar, dt, {
        throttle: ax.y * (boost ? 1.25 : 1),
        steer: -ax.x,
        handbrake: input.down('Space'),
      }, ctx);
      this.audio.setEngine(Math.abs(this.playerCar.speed) / this.playerCar.model.top, true);
      this.audio.setSkid(this.playerCar.skid);
      if (this.playerCar.skid && Math.random() < 0.5) {
        this.effects.smokePuff(new THREE.Vector3(this.playerCar.group.position.x, 0.3, this.playerCar.group.position.z));
      }
      // chase camera
      const car = this.playerCar, a = car.angle;
      const fx = Math.sin(a), fz = Math.cos(a);
      const want = new THREE.Vector3(car.group.position.x - fx * 10.5, 3.8, car.group.position.z - fz * 10.5);
      this.camPos.lerp(want, Math.min(1, dt * 5));
      const sh = this.effects.shakeOffset();
      this.camera.position.set(this.camPos.x + sh.x, this.camPos.y + sh.y, this.camPos.z);
      this.camera.lookAt(car.group.position.x + fx * 7, 1.4, car.group.position.z + fz * 7);
      if (this.playerCar.dead) this.exitCar(true);
    } else {
      this.audio.setEngine(0, false);
      this.audio.setSkid(false);
      this.player.update(dt, input, {
        camera: this.camera, colliders: this.colliders, shootables: this.scene.children,
        onReload: () => this.audio.reload(),
        onShoot: (muzzle, end, hitObj) => this.shoot(muzzle, end, hitObj),
      });
      const sh = this.effects.shakeOffset();
      this.camera.position.x += sh.x; this.camera.position.y += sh.y;
    }
    // --- world systems ---
    this.traffic.update(dt, ctx);
    this.peds.update(dt, { playerPos, cars: this.cars, colliders: this.colliders });
    this.wanted.update(dt, ctx);
    // wreck smoke
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      if (w.t < 12 && Math.random() < dt * 6) {
        this.effects.smokePuff(new THREE.Vector3(w.car.group.position.x, 1.2, w.car.group.position.z));
      }
      if (w.t > 30) this.wrecks.splice(i, 1);
    }
    // --- missions ---
    this.G.driving = this.driving;
    this.G.playerCar = this.playerCar;
    this.missions.update(dt);
    this.G.justEnteredCar = null;
    // --- HUD ---
    const obj = this.missions.objective();
    let prompt = '';
    if (!this.driving) {
      const near = nearestCar(playerPos, TUNING.carEnterDist, this.cars);
      if (near) prompt = `<b>E</b> ${near.isPolice ? 'Steal the IHPD Interceptor' : near === this.missionCar ? `Take the ${near.name}` : `Get in the ${near.name}`}`;
      else if (!this.input.locked) prompt = '<b>Click</b> to lock the mouse and aim';
    } else prompt = '<b>E</b> exit car &nbsp;·&nbsp; <b>Space</b> handbrake';
    this.hud.update({
      health: this.player.health, money: this.money, wanted: this.wanted.wanted,
      driving: this.driving, speed: this.playerCar ? this.playerCar.speed : 0,
      carName: this.playerCar ? this.playerCar.name : '', carHealth: this.playerCar ? this.playerCar.health : 100,
      ammo: this.player.ammo, reloading: this.player.reloading > 0,
      objective: obj, prompt, crosshair: !this.driving && this.input.locked,
    });
    this.mapT += dt;
    if (this.mapT > 0.1) {
      this.mapT = 0;
      this.hud.drawMinimap({
        player: { x: playerPos.x, z: playerPos.z, angle: this.driving ? this.playerCar.angle : this.player.yaw },
        police: this.wanted.policeCars.map((c) => ({ x: c.group.position.x, z: c.group.position.z })),
        traffic: this.traffic.cars.map((c) => ({ x: c.group.position.x, z: c.group.position.z })),
        hostiles: this.peds.hostiles.filter((h) => h.state !== 'fallen').map((h) => ({ x: h.group.position.x, z: h.group.position.z })),
        marker: this.missions.currentMarker(),
        missionCar: this.missionCar && !this.missionCar.isPlayer ? { x: this.missionCar.group.position.x, z: this.missionCar.group.position.z } : null,
      });
    }
  }
}

// ---------- boot + debug API ----------
const game = new Game();
window.IRONHAVEN = {
  version: '1.0.0', ready: true, game,
  state: () => ({
    mode: game.mode, money: Math.floor(game.money), kills: game.kills,
    health: game.player.health, wanted: game.wanted.wanted,
    mission: game.missions.index, missionStep: game.missions.step,
    driving: game.driving, speed: game.playerCar ? game.playerCar.speed : 0,
    player: { x: game.player.pos.x, z: game.player.pos.z },
    police: game.wanted.policeCars.length, traffic: game.traffic.cars.length,
    hostiles: game.peds.hostiles.filter((h) => h.state !== 'fallen').length,
  }),
  teleport: (x, z) => { game.player.pos.set(x, 0, z); if (game.playerCar) { game.playerCar.group.position.set(x, 0, z); game.playerCar.speed = 0; } },
  setWanted: (n) => game.wanted.setWanted(n),
  startMission: (i) => game.missions.start(i),
  newGame: () => game.newGame(),
  aimAt: (x, y, z) => {
    const dx = x - game.player.pos.x, dz = z - game.player.pos.z;
    game.player.yaw = Math.atan2(-dx, -dz);
    game.player.pitch = 0.08;
  },
  shoot: () => { game.player.shoot({ camera: game.camera, shootables: game.scene.children, onShoot: (m, e, h) => game.shoot(m, e, h), onReload: () => {} }); },
  save: () => game.saveNow(),
  load: () => loadGame(),
  damagePlayer: (n) => game.damagePlayer(n),
};
