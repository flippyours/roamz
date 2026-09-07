import * as T from "three";
import { DASH_COOLDOWN, GATE, SIGNALS, SPAWN, WALK_SPEED, validPoint } from "./route-rules";

export type GameSnapshot = { count: number; seconds: number; dash: number; next: string; distance: number; heading: number; x: number; z: number };
export type GameOptions = { onReady: () => void; onSignal: (index: number) => void; onFinish: (seconds: number) => void; onUpdate: (state: GameSnapshot) => void; onHint: (message: string) => void; onError: () => void };
type Obstacle = { x: number; z: number; r: number; group: T.Group; fade: boolean };

// Real-time low-poly meshes, not a video or a static scene. All movement is in world space.
export function createRoamzGame(canvas: HTMLCanvasElement, options: GameOptions) {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new T.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.4 : 1.75));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  const scene = new T.Scene();
  scene.background = new T.Color("#3e5a52");
  const camera = new T.OrthographicCamera(-20, 20, 15, -15, .1, 150);
  const light = new T.DirectionalLight(0xfff3d4, 2.1);
  light.position.set(-15, 30, 20);
  scene.add(light, new T.AmbientLight(0xffffff, 1.25));
  const ramp = new T.DataTexture(new Uint8Array([100, 170, 235]), 3, 1, T.RedFormat);
  ramp.magFilter = ramp.minFilter = T.NearestFilter; ramp.needsUpdate = true;
  const materials = new Map<string, T.Material>();
  const ink = new T.MeshBasicMaterial({ color: "#19241f", side: T.BackSide });
  const black = new T.MeshBasicMaterial({ color: "#080a09" });
  const white = new T.MeshBasicMaterial({ color: "#fbfbef" });
  const lime = new T.MeshBasicMaterial({ color: "#ccf784" });
  const yellow = new T.MeshToonMaterial({ color: "#e5b93d", gradientMap: ramp });
  function mat(color: string) {
    if (!materials.has(color)) materials.set(color, new T.MeshToonMaterial({ color, gradientMap: ramp }));
    return materials.get(color)!;
  }
  function mesh(geo: T.BufferGeometry, material: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0, outline = false) {
    const m = new T.Mesh(geo, material); m.position.set(x, y, z); parent.add(m);
    if (outline) { const o = new T.Mesh(geo, ink); o.scale.setScalar(1.035); m.add(o); }
    return m;
  }
  function ellipsoid(parent: T.Object3D, color: T.Material, xyz: number[], scale: number[], outline = false, segments = 16) {
    const m = mesh(new T.SphereGeometry(1, segments, 12), color, parent, xyz[0], xyz[1], xyz[2], outline);
    m.scale.set(scale[0], scale[1], scale[2]); return m;
  }
  function line(points: T.Vector3[], color: string, parent: T.Object3D, radius = .025) {
    return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), 14, radius, 5, false), mat(color), parent);
  }
  function shadow(parent: T.Object3D, x: number, z: number, sx: number, sz: number, opacity = .12) {
    const m = mesh(new T.CircleGeometry(1, 20), new T.MeshBasicMaterial({ color: "#0e201a", transparent: true, opacity, depthWrite: false }), parent, x, .045, z);
    m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); return m;
  }
  let seed = 417;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  // A floating, cut-paper island with a bevelled rock bank and readable loop path.
  const water = mesh(new T.PlaneGeometry(180, 180), new T.MeshBasicMaterial({ color: "#3e5a52" }), scene, 0, -2.8, 0);
  water.rotation.x = -Math.PI / 2;
  const islandShape = new T.Shape();
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2, r = 1 + Math.sin(a * 5) * .022;
    const x = Math.cos(a) * 13.4 * r, y = Math.sin(a) * 11.4 * r;
    if (!i) islandShape.moveTo(x, y); else islandShape.lineTo(x, y);
  }
  islandShape.closePath();
  const island = new T.Mesh(new T.ExtrudeGeometry(islandShape, { depth: 2.2, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .28, bevelThickness: .25, curveSegments: 1 }), [mat("#839778"), mat("#687662")]);
  island.rotation.x = Math.PI / 2; island.position.y = -.23; scene.add(island);
  const contours: T.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new T.RingGeometry(1, 1.009, 80), new T.MeshBasicMaterial({ color: "#91b1a0", transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false }), scene, 0, -2.76 + i * .005, 0);
    ring.rotation.x = -Math.PI / 2; ring.scale.set(15 + i * 1.7, 13 + i * 1.7, 1); contours.push(ring);
  }
  function path(points: { x: number; z: number }[], width: number, color: string) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(p.x, .035, p.z)));
    const verts: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 90; i++) {
      const p = curve.getPoint(i / 90), tangent = curve.getTangent(i / 90);
      const side = new T.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
      verts.push(p.x + side.x, .035, p.z + side.z, p.x - side.x, .035, p.z - side.z);
      if (i < 90) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(verts, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    return mesh(geo, new T.MeshBasicMaterial({ color, side: T.DoubleSide }), scene);
  }
  path([SPAWN, ...SIGNALS, { x: 4, z: 1 }, GATE], 1.75, "#b2b698");
  path([{ x: -6, z: 4 }, { x: -2, z: 2 }, GATE], 1.2, "#a5ac8c");

  const obstacles: Obstacle[] = [];
  function pine(x: number, z: number, size: number, variant: number) {
    const group = new T.Group(); group.position.set(x, 0, z); group.scale.setScalar(size); scene.add(group);
    mesh(new T.CylinderGeometry(.13, .22, 2.6, 6), mat("#57533e"), group, 0, 1.2, 0);
    for (let j = 0; j < 3; j++) {
      const crown = mesh(new T.ConeGeometry(1.18 - j * .27, 1.85 - j * .26, 7), mat(variant ? "#4e7856" : "#345944"), group, 0, 1.8 + j * .78, 0, true);
      crown.rotation.y = j * .31;
    }
    shadow(scene, x + .5, z + .4, 1.25 * size, .65 * size);
    obstacles.push({ x, z, r: .48 * size, group, fade: true });
  }
  [[-10, -5, 1], [-7, -8, .9], [-4, -9, 1.1], [3, -8, .85], [9.7, -5.5, 1.1], [11, -1, .8], [-11, 0, 1.05], [-9, 5.7, .7], [-4.5, -3.3, .85], [4.5, 6, .72], [10.1, 4, .65]].forEach((p, i) => pine(p[0], p[1], p[2], i % 2));
  function rock(x: number, z: number, r: number, tall = .8, obstacle = true) {
    const group = new T.Group(); group.position.set(x, 0, z); scene.add(group);
    const m = mesh(new T.DodecahedronGeometry(r, 0), mat("#a9afa0"), group, 0, r * tall * .55, 0, r > .6);
    m.scale.set(1, tall, .8); m.rotation.set(.2, random() * 3, .12);
    if (obstacle) obstacles.push({ x, z, r: r * .7, group, fade: false });
  }
  [[-3, 5.5, .5], [-9.8, 2.2, .65], [-6.2, -5.6, .8], [3.3, -5.5, .65], [9.5, 1.1, .6], [3, 8.3, .7], [-2.5, -1, .65]].forEach(p => rock(p[0], p[1], p[2]));
  for (let i = 0; i < 28; i++) {
    const a = random() * Math.PI * 2, edge = .92 + random() * .14;
    rock(Math.cos(a) * 12.8 * edge, Math.sin(a) * 10.8 * edge, .2 + random() * .32, .6, false);
  }
  // Tiny grass clusters use one batched geometry instead of hundreds of objects.
  const grassVerts: number[] = [];
  for (let i = 0; i < 190; i++) {
    const x = (random() - .5) * 24, z = (random() - .5) * 20;
    if (!validPoint(x, z) || SIGNALS.some(p => Math.hypot(x - p.x, z - p.z) < 1.7)) continue;
    const h = .12 + random() * .22;
    grassVerts.push(x - .1, .04, z, x, h, z, x + .04, .04, z, x, .04, z - .07, x + .13, h * .8, z, x + .12, .04, z + .06);
  }
  const grassGeo = new T.BufferGeometry(); grassGeo.setAttribute("position", new T.Float32BufferAttribute(grassVerts, 3)); grassGeo.computeVertexNormals();
  mesh(grassGeo, new T.MeshBasicMaterial({ color: "#536b46", side: T.DoubleSide }), scene);

  function label(text: string, w: number, h: number, color = "#e6eadb", bg = "#26392c") {
    const c = document.createElement("canvas"); c.width = 512; c.height = 192;
    const g = c.getContext("2d")!;
    g.fillStyle = bg; g.fillRect(0, 0, 512, 192); g.strokeStyle = "#18271e"; g.lineWidth = 14; g.strokeRect(7, 7, 498, 178);
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 62px monospace"; g.fillText(text, 256, 101);
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace;
    return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }));
  }
  const sign = new T.Group(); sign.position.set(-2.8, 0, 7.2); sign.rotation.y = .36; scene.add(sign);
  mesh(new T.CylinderGeometry(.09, .12, 1.7, 7), mat("#786d4f"), sign, 0, .85, 0);
  const signText = label("NO ROUTE", 1.7, .62, "#26392c", "#c4b894"); signText.position.y = 1.6; sign.add(signText);

  // Gate 404: broken stone arch, not a luminous sci-fi rectangle.
  const gate = new T.Group(); gate.position.set(GATE.x, 0, GATE.z); scene.add(gate);
  const stone = mat("#b7bba7");
  for (const x of [-1.6, 1.6]) {
    for (let j = 0; j < 3; j++) {
      const pillar = mesh(new T.CylinderGeometry(.52 - j * .025, .57, .78, 5), stone, gate, x, .42 + j * .76, 0, true);
      pillar.rotation.y = j * .15;
    }
    mesh(new T.BoxGeometry(1.18, .24, 1.14), mat("#7c8a6b"), gate, x, 2.65, 0, true);
  }
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * i / 6;
    const m = mesh(new T.BoxGeometry(.8, .65, .83), stone, gate, Math.cos(a) * 1.6, 2.7 + Math.sin(a) * .85, 0, true); m.rotation.z = a - Math.PI / 2;
  }
  const gateText = label("GATE 404", 2.2, .62); gateText.position.set(0, 4.1, 0); gate.add(gateText);
  const portalMat = new T.MeshBasicMaterial({ color: "#c5f28b", transparent: true, opacity: .05, side: T.DoubleSide, depthWrite: false });
  const portal = mesh(new T.CircleGeometry(1.45, 40), portalMat, gate, 0, 1.5, .02); portal.scale.y = 1.05;
  const gateRunes: T.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const r = mesh(new T.OctahedronGeometry(.12), mat("#556247"), gate, (i - 2) * .41, 3.16 + Math.sin(i / 4 * Math.PI) * .31, .5); gateRunes.push(r); }
  shadow(scene, 0, GATE.z + .4, 2.4, 1.3);

  // Roamz proportions: large smooth oval black head, separated white oval eyes,
  // an oversized tapered tech jacket, canvas bucket, and ONLY rear-mounted pack.
  const player = new T.Group(); player.position.set(SPAWN.x, 0, SPAWN.z); scene.add(player);
  const body = new T.Group(); player.add(body);
  const jacket = mat("#818787");
  const torso = mesh(new T.CylinderGeometry(.47, .69, .95, 18), jacket, body, 0, .83, 0, true); torso.scale.z = .73;
  const sleeveL = ellipsoid(body, jacket, [-.55, .84, 0], [.23, .43, .3], true);
  const sleeveR = ellipsoid(body, jacket, [.55, .84, 0], [.23, .43, .3], true);
  ellipsoid(body, black, [-.24, .22, .08], [.19, .21, .28]); ellipsoid(body, black, [.24, .22, .08], [.19, .21, .28]);
  const collar = mesh(new T.CylinderGeometry(.43, .5, .22, 18), mat("#495653"), body, 0, 1.36, 0, true); collar.scale.z = .8;
  const skull = new T.Group(); skull.position.y = 1.92; body.add(skull);
  ellipsoid(skull, black, [0, 0, 0], [.73, .77, .63], false, 32);
  const eyes = new T.Group(); skull.add(eyes);
  ellipsoid(eyes, white, [-.265, -.04, .592], [.089, .178, .047], false, 16);
  ellipsoid(eyes, white, [.265, -.04, .592], [.089, .178, .047], false, 16);
  // Tapered soft bucket profile, downturned brim, ink seams.
  const hat = new T.Group(); hat.position.y = .56; hat.rotation.z = -.045; skull.add(hat);
  mesh(new T.CylinderGeometry(.57, .7, .46, 32), yellow, hat, 0, .2, 0, true);
  mesh(new T.CylinderGeometry(.72, .94, .18, 32, 1, true), yellow, hat, 0, -.09, 0, true);
  const brim = mesh(new T.TorusGeometry(.93, .025, 6, 40), black, hat, 0, -.18, 0); brim.rotation.x = Math.PI / 2;
  const band = mesh(new T.TorusGeometry(.69, .015, 5, 32), mat("#9b772b"), hat, 0, .045, 0); band.rotation.x = Math.PI / 2;
  line([new T.Vector3(0, 1.26, .383), new T.Vector3(.1, .98, .43), new T.Vector3(-.04, .5, .52)], "#34423f", body, .021);
  const pocket = mesh(new T.BoxGeometry(.23, .2, .035), mat("#697572"), body, -.31, .77, .46, true); pocket.rotation.z = -.1;
  mesh(new T.BoxGeometry(.14, .055, .028), lime, body, -.3, .82, .49);
  const backpack = new T.Group(); backpack.position.set(0, .91, -.48); body.add(backpack);
  ellipsoid(backpack, mat("#9a8252"), [0, 0, -.02], [.48, .5, .26], true);
  const bedroll = mesh(new T.CylinderGeometry(.19, .19, 1.06, 14), mat("#9daa82"), backpack, 0, .39, -.02, true); bedroll.rotation.z = Math.PI / 2;
  for (const x of [-.32, .32]) { const b = mesh(new T.TorusGeometry(.19, .025, 5, 14), mat("#495645"), backpack, x, .39, -.02); b.rotation.y = Math.PI / 2; }
  const blob = shadow(scene, SPAWN.x, SPAWN.z, .85, .54, .24);
  player.rotation.y = .28;

  const nodes: { group: T.Group; crystal: T.Mesh; ring: T.Mesh; beam: T.Mesh; number: T.Sprite }[] = [];
  SIGNALS.forEach((s, i) => {
    const group = new T.Group(); group.position.set(s.x, 0, s.z); scene.add(group);
    mesh(new T.CylinderGeometry(.5, .63, .16, 8), mat("#7b8869"), group, 0, .1, 0, true);
    const crystal = mesh(new T.OctahedronGeometry(.31), lime, group, 0, .9, 0, true);
    const ring = mesh(new T.TorusGeometry(.48, .028, 6, 28), lime, group, 0, .85, 0); ring.rotation.x = Math.PI / 2;
    const beam = mesh(new T.CylinderGeometry(.32, .52, 2.3, 12, 1, true), new T.MeshBasicMaterial({ color: "#c4f58a", transparent: true, opacity: .065, side: T.DoubleSide, depthWrite: false }), group, 0, 1.25, 0);
    const c = document.createElement("canvas"); c.width = c.height = 96; const g = c.getContext("2d")!;
    g.fillStyle = "#243a2c"; g.beginPath(); g.arc(48, 48, 38, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#d0efa3"; g.lineWidth = 3; g.stroke();
    g.fillStyle = "#eaffcf"; g.font = "bold 42px monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), 48, 51);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const number = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); number.position.y = 2; number.scale.set(.62, .62, .62); group.add(number);
    nodes.push({ group, crystal, ring, beam, number });
  });

  // Harmless roaming static slows the player. Dashing is a useful, forgiving skill.
  const wisps: { mesh: T.Mesh; ring: T.Mesh; phase: number; x: number; z: number }[] = [];
  [[-5, 0], [4, -4]].forEach((p, i) => {
    const m = mesh(new T.IcosahedronGeometry(.38, 0), mat("#c590b0"), scene, p[0], .65, p[1], true);
    const r = mesh(new T.TorusGeometry(.68, .035, 5, 26), mat("#d8afc4"), scene, p[0], .11, p[1]); r.rotation.x = Math.PI / 2;
    wisps.push({ mesh: m, ring: r, phase: i * 2.8, x: p[0], z: p[1] });
  });
  const motesGeo = new T.BufferGeometry(); const motesData = new Float32Array(36 * 3);
  for (let i = 0; i < 36; i++) { motesData[i * 3] = (random() - .5) * 26; motesData[i * 3 + 1] = .5 + random() * 3; motesData[i * 3 + 2] = (random() - .5) * 23; }
  motesGeo.setAttribute("position", new T.BufferAttribute(motesData, 3));
  const motes = new T.Points(motesGeo, new T.PointsMaterial({ color: "#e5efb4", size: .05, transparent: true, opacity: .55, depthWrite: false })); scene.add(motes);
  const bursts: { m: T.Mesh; v: T.Vector3; life: number; max: number }[] = [];
  const burstGeo = new T.OctahedronGeometry(.08); const burstMaterial = lime;
  function burst(x: number, z: number, many = 12) {
    for (let i = 0; i < many; i++) { const m = mesh(burstGeo, burstMaterial, scene, x, 1, z); const a = random() * Math.PI * 2; bursts.push({ m, v: new T.Vector3(Math.cos(a) * 2, 1 + random() * 2, Math.sin(a) * 2), life: .7, max: .7 }); }
  }

  let playing = false, paused = false, finished = false, disposed = false, count = 0, elapsed = 0;
  let dashTime = 0, dashCooldown = 0, slowTime = 0, noticeTime = 0, raf = 0, lastTime = 0, uiTime = 0;
  let activeTime = 0, cameraSize = 28, heading = .28, sound = false;
  let audio: AudioContext | null = null;
  const keys = new Set<string>(); const input = { x: 0, y: 0 };
  const velocity = new T.Vector2(); const direction = new T.Vector2(0, 1);
  let target: T.Vector3 | null = null;
  const ray = new T.Raycaster(), pointer = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const focus = new T.Vector3(0, 0, 0), cameraAim = new T.Vector3(0, 0, 0);
  const cameraOffset = new T.Vector3(18, 24, 28);
  const clickRing = mesh(new T.RingGeometry(.21, .26, 24), lime, scene, 0, .07, 0); clickRing.rotation.x = -Math.PI / 2; clickRing.visible = false;
  function tone(freq: number, duration = .12, delay = 0) {
    if (!sound || !audio) return;
    const o = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime + delay;
    o.type = "sine"; o.frequency.setValueAtTime(freq, now); gain.gain.setValueAtTime(.055, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    o.connect(gain); gain.connect(audio.destination); o.start(now); o.stop(now + duration);
  }
  function toggleSound(enabled: boolean) { sound = enabled; if (enabled) { audio ??= new AudioContext(); void audio.resume().catch(() => {}); tone(440, .08); } }
  function dash() {
    if (!playing || paused || dashCooldown > 0 || finished) return;
    dashTime = .23; dashCooldown = DASH_COOLDOWN; slowTime = 0; tone(170, .11); burst(player.position.x, player.position.z, 5);
  }
  function resetInput() { keys.clear(); input.x = input.y = 0; velocity.set(0, 0); target = null; clickRing.visible = false; }
  function keyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input, textarea, [role=dialog]")) return;
    if ((e.target as HTMLElement)?.closest("button") && [" ", "Enter"].includes(e.key)) return;
    if (!playing || paused) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    if (e.code === "Space" || e.key === "Shift") { if (!e.repeat) dash(); }
  }
  function keyUp(e: KeyboardEvent) { keys.delete(e.key.toLowerCase()); }
  function click(e: PointerEvent) {
    if (!playing || paused || e.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera); const p = new T.Vector3();
    if (ray.ray.intersectPlane(plane, p) && validPoint(p.x, p.z)) { target = p; clickRing.position.set(p.x, .07, p.z); clickRing.visible = true; }
  }
  function onVisibility() { if (document.hidden) { resetInput(); } lastTime = performance.now(); }
  function contextLost(e: Event) { e.preventDefault(); playing = false; options.onError(); }
  window.addEventListener("keydown", keyDown, { passive: false }); window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", resetInput); document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("pointerdown", click); canvas.addEventListener("webglcontextlost", contextLost);
  let renderedWidth = 0, renderedHeight = 0;
  const resize = () => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    if (width !== renderedWidth || height !== renderedHeight) {
      renderer.setSize(width, height, false); renderedWidth = width; renderedHeight = height;
    }
    const aspect = width / height; camera.left = -cameraSize * aspect / 2; camera.right = cameraSize * aspect / 2; camera.top = cameraSize / 2; camera.bottom = -cameraSize / 2; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  function canMove(x: number, z: number) { return validPoint(x, z) && !obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + .3) && !(Math.abs(z - GATE.z) < .57 && Math.abs(Math.abs(x) - 1.6) < .65); }
  function emit() {
    const next = count < 5 ? SIGNALS[count] : GATE;
    const vec = new T.Vector3(next.x, 0, next.z).sub(player.position);
    const projected = new T.Vector3(next.x, .1, next.z).project(camera), origin = player.position.clone().project(camera);
    options.onUpdate({ count, seconds: elapsed, dash: Math.max(0, 1 - dashCooldown / DASH_COOLDOWN), next: count < 5 ? SIGNALS[count].name : "Gate 404 is open", distance: Math.round(vec.length()), heading: Math.atan2(projected.x - origin.x, projected.y - origin.y) * 180 / Math.PI, x: player.position.x, z: player.position.z });
  }
  function frame(time: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((time - lastTime) / 1000 || .016, .04); lastTime = time;
    if (document.hidden) return;
    activeTime += dt;
    const t = activeTime;
    if (playing && !paused && !finished) {
      elapsed += dt; dashCooldown = Math.max(0, dashCooldown - dt); dashTime = Math.max(0, dashTime - dt); slowTime = Math.max(0, slowTime - dt); noticeTime = Math.max(0, noticeTime - dt);
      let sx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + input.x;
      let sy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0) + input.y;
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize();
      const forward = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1); forward.y = 0; forward.normalize();
      let desired = new T.Vector2(right.x * sx - forward.x * sy, right.z * sx - forward.z * sy);
      if (Math.hypot(sx, sy) > .12) { target = null; clickRing.visible = false; }
      else if (target) { desired.set(target.x - player.position.x, target.z - player.position.z); if (desired.length() < .24) { target = null; clickRing.visible = false; desired.set(0, 0); } }
      if (desired.length() > 1) desired.normalize();
      if (desired.length() > .1) direction.copy(desired).normalize();
      if (dashTime > 0) desired.copy(direction);
      const speed = (dashTime > 0 ? 10 : WALK_SPEED) * (slowTime > 0 ? .48 : 1);
      velocity.lerp(desired.multiplyScalar(speed), 1 - Math.exp(-dt * 15));
      const nx = player.position.x + velocity.x * dt, nz = player.position.z + velocity.y * dt;
      if (canMove(nx, player.position.z)) player.position.x = nx;
      if (canMove(player.position.x, nz)) player.position.z = nz;
      const moving = velocity.length() > .15;
      if (moving) {
        const desiredAngle = Math.atan2(velocity.x, velocity.y);
        heading += Math.atan2(Math.sin(desiredAngle - heading), Math.cos(desiredAngle - heading)) * (1 - Math.exp(-dt * 12));
      }
      player.rotation.y = heading;
      body.position.y = moving && !reduced ? Math.abs(Math.sin(t * 15)) * .065 : 0;
      body.rotation.z = moving && !reduced ? Math.sin(t * 15) * .035 : 0;
      sleeveL.rotation.z = moving ? Math.sin(t * 15) * .08 : .03; sleeveR.rotation.z = -sleeveL.rotation.z;
      if (count < 5 && Math.hypot(player.position.x - SIGNALS[count].x, player.position.z - SIGNALS[count].z) < .9) {
        const i = count; nodes[i].group.visible = false; gateRunes[i].material = lime; count++; burst(player.position.x, player.position.z);
        tone(440 + i * 65, .13); tone(660 + i * 70, .18, .09); options.onSignal(i); emit();
        if (count === 5) options.onHint("All signals found. Gate 404 is open!");
      }
      if (count === 5 && Math.hypot(player.position.x - GATE.x, player.position.z - GATE.z) < .85) {
        finished = true; resetInput(); burst(GATE.x, GATE.z, 28); [440, 554, 659, 880].forEach((f, i) => tone(f, .32, i * .1)); options.onFinish(elapsed);
      }
      wisps.forEach(w => {
        if (dashTime <= 0 && Math.hypot(player.position.x - w.mesh.position.x, player.position.z - w.mesh.position.z) < .85 && slowTime <= 0) {
          slowTime = .7; if (!noticeTime) { options.onHint("A little static. Dash through with Space or Shift."); noticeTime = 6; } tone(140, .08);
        }
      });
    } else if (!playing && !finished) { player.rotation.y = .28 + (reduced ? 0 : Math.sin(t * .5) * .08); body.position.y = reduced ? 0 : Math.sin(t * 2) * .027; }
    blob.position.set(player.position.x + .07, .046, player.position.z + .08);
    const blink = t % 4.6; eyes.scale.y = blink > 4.44 ? Math.max(.08, Math.abs(blink - 4.52) / .08) : 1;
    nodes.forEach((n, i) => {
      const active = i === count; n.crystal.rotation.y = t * 1.1; n.crystal.position.y = .88 + (reduced ? 0 : Math.sin(t * 2 + i) * .13);
      n.ring.rotation.z = t * .3; n.beam.visible = active; n.number.visible = active;
      n.crystal.material = active ? lime : mat("#b5c4a1"); n.ring.visible = active;
    });
    wisps.forEach(w => { if (!paused) { w.mesh.position.x = w.x + Math.sin(t * .65 + w.phase) * 1.35; w.mesh.position.z = w.z + Math.cos(t * .65 + w.phase) * .85; } w.mesh.position.y = .6 + Math.sin(t * 2 + w.phase) * .09; w.mesh.rotation.y = t * .8; w.ring.position.set(w.mesh.position.x, .1, w.mesh.position.z); });
    portalMat.opacity = count === 5 ? .35 + Math.sin(t * 3) * .08 : .035;
    for (let i = bursts.length - 1; i >= 0; i--) { const p = bursts[i]; p.life -= dt; p.m.position.addScaledVector(p.v, dt); p.v.y -= dt * 4; p.m.scale.setScalar(Math.max(0, p.life / p.max)); if (p.life <= 0) { scene.remove(p.m); bursts.splice(i, 1); } }
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const targetSize = playing ? (aspect < .8 ? 12.5 : 17) : Math.max(28, 32 / aspect);
    cameraSize = T.MathUtils.lerp(cameraSize, targetSize, 1 - Math.exp(-dt * 2.7));
    if (playing) focus.set(player.position.x, .65, player.position.z - .5); else focus.set(0, .4, .3);
    cameraAim.lerp(focus, 1 - Math.exp(-dt * 4)); camera.position.copy(cameraAim).add(cameraOffset); camera.lookAt(cameraAim);
    resize();
    // Fade foreground tree canopies, never the player. Only small trunks collide.
    obstacles.forEach(o => { if (!o.fade) return; const from = o.group.position.clone().sub(player.position); const cameraSide = from.x * cameraOffset.x + from.z * cameraOffset.z > 0;
      const fade = playing && cameraSide && Math.hypot(from.x, from.z) < 2.5;
      o.group.children.slice(1).forEach(crown => { crown.visible = !fade; });
    });
    if (!reduced) { motes.position.y = Math.sin(t * .4) * .15; contours.forEach((r, i) => { (r.material as T.MeshBasicMaterial).opacity = .12 + Math.sin(t + i) * .035; }); }
    renderer.render(scene, camera);
    uiTime += dt; if (uiTime > .12) { uiTime = 0; emit(); }
  }
  resize(); camera.position.copy(cameraOffset); camera.lookAt(0, 0, 0); raf = requestAnimationFrame(frame); options.onReady();
  return {
    start(savedCount = 0) {
      count = Math.min(5, Math.max(0, savedCount)); playing = true; finished = false; paused = false; elapsed = 0; dashCooldown = 0; resetInput();
      const p = count > 0 ? SIGNALS[count - 1] : SPAWN; player.position.set(p.x, 0, p.z); heading = .28;
      nodes.forEach((n, i) => n.group.visible = i >= count); gateRunes.forEach((r, i) => r.material = i < count ? lime : mat("#556247")); emit();
    },
    setPaused(value: boolean) { paused = value; resetInput(); },
    setJoystick(x: number, y: number) { input.x = x; input.y = y; },
    dash, setSound: toggleSound,
    destroy() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", resetInput); document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", click); canvas.removeEventListener("webglcontextlost", contextLost);
      const geometries = new Set<T.BufferGeometry>(), mats = new Set<T.Material>(), textures = new Set<T.Texture>();
      scene.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Points || o instanceof T.Sprite) { if ("geometry" in o) geometries.add(o.geometry); const list = Array.isArray(o.material) ? o.material : [o.material]; list.forEach(m => { mats.add(m); Object.values(m).forEach(v => { if (v instanceof T.Texture) textures.add(v); }); }); } });
      geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); ramp.dispose(); renderer.dispose(); void audio?.close();
    },
  };
}
export type RoamzGame = ReturnType<typeof createRoamzGame>;
