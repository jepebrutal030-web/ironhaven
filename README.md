# IRONHAVEN

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/jepebrutal030-web/ironhaven/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/jepebrutal030-web/ironhaven/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game in the spirit of GTA 6, built with three.js for make.fun's "Make GTA 6" bounty ($1,666). Everything — the city, characters, vehicles, names, story, art, sound and music — is its own. Nothing from Rockstar Games.

**IRONHAVEN** is a sun-soaked port city on the Sun Coast. Dario Reyes is back after five years away — broke, wanted, and owed one last job by Mara Voss, the woman who runs this city from the shadows. Steal cars, outrun the IHPD, and run five story missions from a hot homecoming to the Harbor Job that will either make him a legend or put him in the ground.

## How to play

Serve the game and open it in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

- **Mouse** — look & aim (click to lock the pointer)
- **W A S D** — move on foot / drive
- **Shift** — sprint / boost
- **Left click** — shoot, **R** — reload
- **E** — enter / exit a car (steal it)
- **Space** — handbrake while driving, jump on foot
- **P** — pause & save, **M** — mute music

## The game

- **Open world**: a 392×392 m city of 49 blocks — roads, sidewalks, crosswalks, a plaza with a fountain, a market, a hospital, and a working harbor with docks, containers and a crane. All procedural, all its own.
- **On foot and by car**: third-person on-foot movement with jumping and pistol combat, plus arcade driving (8 car models: Marlin, Falcon, Tortuga, Bison, Comet GT, Rhino, Taxi, and the golden Manta GT).
- **Traffic & pedestrians**: 22 traffic cars that follow the road grid and stop for each other, 36 pedestrians who stroll the sidewalks and flee from gunfire, and 14 parked cars waiting to be stolen.
- **Cars to steal**: any car can be taken. Stealing in front of a witness brings the heat; stealing a cop car brings more.
- **Wanted level & police**: 0–5 stars. The IHPD responds with patrol cars that chase and ram, and foot cops who run you down and arrest you. Get out of sight to cool off — or get boxed in and busted.
- **Missions & story**: five missions with a beginning, middle and end — Homecoming, The Pickup, The Getaway, The Shakedown, and The Harbor Job — with markers, timers, a gang shootout, and a finale that ends in a "Legend of Ironhaven" screen. Free roam after the story.
- **Combat**: pistol with ammo and reload, hitmarkers, tracers, muzzle flash, explosions, and gang members who shoot back.
- **HUD & minimap**: health, money, wanted stars, mission objective with distance and timer, speedometer, ammo, and a live 2D minimap showing you, the police, traffic, hostiles, and the mission beacon.
- **Start & save**: title screen with New Game / Continue, pause menu, and localStorage saves (autosave on every mission complete).
- **Sound & music**: fully synthesized WebAudio — a 100 BPM groove, engine hum, two-tone sirens, gunshots, skids, and mission jingles. No audio files.
- **Polish**: late-afternoon sun, ACES tone mapping, soft shadows, drifting clouds, a gradient sky, a damage vignette, and a flashing wanted overlay.

## Entry

- Competition: [gta6-01](https://make.fun/bounty/gta6-01) on make.fun
- Entrypoint: `main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json`.
- three.js 0.187.0 vendored byte-for-byte under `game/vendor/`; no network requests at runtime.
- Screenshots in `screenshots/` are real renders of the game's own code.
- License: MIT
