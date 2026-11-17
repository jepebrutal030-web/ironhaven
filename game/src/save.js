// Save / load via localStorage. One job: persist a run.
import { TUNING } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      v: 1, savedAt: Date.now(),
      money: Math.floor(state.money),
      missionIndex: state.missionIndex,
      completed: [...state.completed],
      player: { x: state.player.x, z: state.player.z, yaw: state.yaw },
      health: state.health,
      wanted: state.wanted,
      kills: state.kills,
      playTime: state.playTime,
    };
    localStorage.setItem(TUNING.saveKey, JSON.stringify(data));
    return true;
  } catch { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(TUNING.saveKey);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return d;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(TUNING.saveKey); } catch { /* ignore */ } }
export function hasSave() { return loadGame() != null; }
