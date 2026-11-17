// IRONHAVEN — world layout, palettes and tuning. One job: constants.
export const CITY = {
  BLOCK: 40, ROAD: 14, PITCH: 54, BLOCKS: 7,
  HALF: 196, // city spans -196..196 in x and z
};
// Road centre lines (8 each way).
export const ROADS = [-189, -135, -81, -27, 27, 81, 135, 189];
export const BLOCK_CENTERS = [-162, -108, -54, 0, 54, 108, 162];

// Named places (x, z) — all original to Ironhaven.
export const PLACES = {
  hideout: { x: -162, z: -162, name: 'Hideout' },
  hospital: { x: 162, z: -162, name: 'Mercy General' },
  market: { x: 108, z: -108, name: 'Sable Market' },
  safehouse: { x: -108, z: 108, name: 'Safehouse' },
  plaza: { x: 0, z: 0, name: 'Founders Plaza' },
  harbor: { x: 216, z: 60, name: 'Harbor Docks' },
  containerYard: { x: 216, z: -70, name: 'Container Yard' },
  vultureTurf: { x: 150, z: 130, name: 'Vulture Turf' },
};

// Sun-soaked coastal palette (late afternoon).
export const PALETTE = {
  skyTop: 0x4a86c8, skyHorizon: 0xffc98a, fog: 0xf2b878,
  sun: 0xffd9a0, hemiSky: 0xbfd9ff, hemiGround: 0x8a6a4a,
  ground: 0x9a938a, sidewalk: 0xb8b0a2, road: 0x3a3a40,
  laneYellow: 0xd8b13c, laneWhite: 0xd8d8d0, crosswalk: 0xcfc8b8,
  building: [0xe8dcc8, 0xd9a06a, 0xc96f4a, 0x7fb3a8, 0xe8b4a0, 0x8a9ab0, 0xf0e0b8, 0xb98a6a, 0x9ab88a, 0xd98a8a],
  windowLit: 0xffd27a, windowDark: 0x2a3542,
  water: 0x2a6f8a, sand: 0xd9c49a,
  grass: 0x6a9a5a, treeTrunk: 0x6a4a30, treeTop: 0x4a7a3a,
};

export const CAR_MODELS = [
  { name: 'Marlin', kind: 'sedan', top: 34, accel: 15, grip: 2.4, colors: [0x8a2f2f, 0x2f4a6a, 0x6a6a6a, 0xb8a888] },
  { name: 'Falcon', kind: 'sedan', top: 38, accel: 17, grip: 2.7, colors: [0x3a6a8a, 0xc8c8c8, 0x1a1a1a, 0x7a2f4a] },
  { name: 'Tortuga', kind: 'van', top: 28, accel: 11, grip: 2.0, colors: [0xd8d0c0, 0x5a6a7a, 0x8a6a3a] },
  { name: 'Bison', kind: 'truck', top: 30, accel: 12, grip: 2.1, colors: [0x4a5a3a, 0x8a3a2f, 0x3a3a3a] },
  { name: 'Comet GT', kind: 'sport', top: 48, accel: 22, grip: 3.1, colors: [0xd42a1e, 0xffc21e, 0x1e6ad4, 0x222222] },
  { name: 'Rhino', kind: 'suv', top: 32, accel: 13, grip: 2.3, colors: [0x2a4a2a, 0x6a5a8a, 0x9a9a9a] },
  { name: 'Taxi', kind: 'taxi', top: 36, accel: 16, grip: 2.5, colors: [0xf2c21e] },
  { name: 'Manta GT', kind: 'sport', top: 52, accel: 24, grip: 3.3, colors: [0xd4af1e] }, // the golden Vulture, mission 5
];

export const TUNING = {
  walkSpeed: 6, sprintSpeed: 10, jumpVel: 7.5, gravity: 22,
  playerRadius: 0.55, playerHealth: 100,
  pistolDamage: 34, pistolRange: 90, pistolAmmo: 12, reloadTime: 1.1, fireInterval: 0.22,
  carEnterDist: 4.5, carDamageRam: 8,
  wantedDecaySight: 8, wantedDecayStep: 8,
  policeRamDamage: 6, copArrestRange: 1.8, copArrestTime: 2.0,
  pedCount: 36, trafficCount: 22, parkedCount: 14,
  missionReward: [300, 500, 700, 1000, 1500],
  fine: 200,
  saveKey: 'ironhaven-save-v1',
};
