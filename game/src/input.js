// Keyboard + mouse + pointer lock. One job: raw input state.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed each frame
    this.mouseDX = 0; this.mouseDY = 0;
    this.locked = false;
    this.onFirstGesture = null;
    this._gestured = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this._gesture();
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    document.addEventListener('mousedown', (e) => { if (e.button === 0) { this.pressed.add('Mouse0'); this._gesture(); } });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === document.body || document.pointerLockElement != null;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.pressed.delete('Mouse0'); });
  }
  _gesture() { if (!this._gestured) { this._gestured = true; if (this.onFirstGesture) this.onFirstGesture(); } }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  consumeMouse() { const r = { dx: this.mouseDX, dy: this.mouseDY }; this.mouseDX = 0; this.mouseDY = 0; return r; }
  endFrame() { this.pressed.clear(); }
  lockPointer() {
    const el = document.body;
    if (el.requestPointerLock) el.requestPointerLock();
  }
  unlockPointer() { if (document.exitPointerLock) document.exitPointerLock(); }
  axis() { // WASD as x (strafe) / y (forward)
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, y };
  }
}
