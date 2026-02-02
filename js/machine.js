/**
 * 3D Lottery Machine — Three.js + cannon-es
 *
 * A transparent spherical drum filled with colorful balls.
 * Spins with real physics; selection uses crypto randomness.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import * as CANNON from "cannon-es";
import { countryColor } from "./countries.js";

/* ---------------------------------------------------------- */
/*  Constants                                                  */
/* ---------------------------------------------------------- */
const DRUM_RADIUS = 3.0;
const BALL_RADIUS = 0.22;
const WALL_COUNT = 28;
const SPIN_AXIS = new CANNON.Vec3(0, 0, 1);    // drum rotates around Z
const GRAVITY = new CANNON.Vec3(0, -12, 0);
const SPIN_PEAK = 8;          // rad/s at full speed
const SPIN_RAMP = 1.8;        // seconds to reach peak
const SPIN_HOLD = 2.5;        // seconds at peak
const SPIN_DECAY = 2.5;       // seconds to slow down
const SETTLE_TIME = 1.0;      // seconds to let balls settle

export class LotteryMachine {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this._canvas = canvas;
    this._balls = [];          // { body, mesh, country }
    this._spinning = false;
    this._spinTime = 0;
    this._spinOmega = 0;
    this._onSelectCb = null;
    this._selectedIdx = -1;
    this._disposed = false;
    this._clock = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initPhysics();
    this._initDrum();
    this._animate = this._animate.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener("resize", this._onResize);
    this._animate();
  }

  /* ======================================================== */
  /*  Renderer & Scene                                         */
  /* ======================================================== */
  _initRenderer() {
    const r = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer = r;
    this._onResize();
  }

  _initScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090e);
    scene.fog = new THREE.Fog(0x08090e, 14, 22);
    this._scene = scene;

    /* Camera */
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    cam.position.set(0, 2.5, 9.5);
    this._camera = cam;

    /* Controls */
    const ctrl = new OrbitControls(cam, this._canvas);
    ctrl.target.set(0, 0.4, 0);
    ctrl.enablePan = false;
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.06;
    ctrl.minDistance = 5;
    ctrl.maxDistance = 16;
    ctrl.maxPolarAngle = Math.PI * 0.58;
    ctrl.minPolarAngle = Math.PI * 0.2;
    ctrl.update();
    this._controls = ctrl;

    /* Environment (procedural) */
    this._buildEnvironment(scene);

    /* Lights */
    const ambient = new THREE.AmbientLight(0x8899bb, 0.4);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffeedd, 1.6);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.002;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xaaccff, 0.5);
    fill.position.set(-3, 4, -3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd6aa, 0.4);
    rim.position.set(0, 2, -6);
    scene.add(rim);

    /* Selection spot light (off by default) */
    const spot = new THREE.SpotLight(0xffe8b0, 0, 12, Math.PI * 0.15, 0.6, 1.5);
    spot.position.set(0, 7, 0);
    spot.castShadow = false;
    scene.add(spot);
    scene.add(spot.target);
    this._spotLight = spot;

    /* Ground plane */
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(12, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0c0d14,
        roughness: 0.35,
        metalness: 0.6,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -DRUM_RADIUS - 0.6;
    ground.receiveShadow = true;
    scene.add(ground);

    /* Post-processing */
    const composer = new EffectComposer(this._renderer);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35, 0.4, 0.88,
    );
    composer.addPass(bloom);
    this._composer = composer;
    this._bloom = bloom;
  }

  _buildEnvironment(scene) {
    const pmrem = new THREE.PMREMGenerator(this._renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x111122);

    // Bright accent spheres for nice reflections
    const accents = [
      { pos: [5, 8, 3], color: 0xffeedd, size: 1.5 },
      { pos: [-5, 6, -4], color: 0xaaccff, size: 1.0 },
      { pos: [0, -4, 6], color: 0x332211, size: 2.0 },
      { pos: [3, 3, -6], color: 0xffd6aa, size: 0.8 },
    ];
    for (const a of accents) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(a.size, 8, 8),
        new THREE.MeshBasicMaterial({ color: a.color }),
      );
      m.position.set(...a.pos);
      envScene.add(m);
    }

    const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
    scene.environment = envMap;
    pmrem.dispose();
    envScene.clear();
  }

  /* ======================================================== */
  /*  Physics                                                  */
  /* ======================================================== */
  _initPhysics() {
    const world = new CANNON.World({ gravity: GRAVITY });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 6;

    /* Ball-ball contact material: bouncy */
    const ballMat = new CANNON.Material("ball");
    const contact = new CANNON.ContactMaterial(ballMat, ballMat, {
      friction: 0.25,
      restitution: 0.45,
    });
    world.addContactMaterial(contact);

    this._world = world;
    this._ballMat = ballMat;
  }

  /* ======================================================== */
  /*  Drum (visual)                                            */
  /* ======================================================== */
  _initDrum() {
    const group = new THREE.Group();

    /* Glass sphere */
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.92,
      thickness: 0.4,
      ior: 1.45,
      envMapIntensity: 0.8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(DRUM_RADIUS, 64, 48),
      glassMat,
    );
    sphere.castShadow = false;
    sphere.receiveShadow = false;
    group.add(sphere);
    this._drumGlass = sphere;

    /* Wire-frame accent ring (equator) */
    const ringGeo = new THREE.TorusGeometry(DRUM_RADIUS + 0.02, 0.03, 8, 120);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xd4a04a,
      roughness: 0.25,
      metalness: 0.9,
    });
    group.add(new THREE.Mesh(ringGeo, ringMat));

    /* Vertical ring */
    const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat);
    ring2.rotation.y = Math.PI / 2;
    group.add(ring2);

    /* Axle (Z axis) */
    const axleGeo = new THREE.CylinderGeometry(0.06, 0.06, DRUM_RADIUS * 2.6, 16);
    const axleMat = new THREE.MeshStandardMaterial({
      color: 0xc0985a,
      roughness: 0.3,
      metalness: 0.85,
    });
    const axle = new THREE.Mesh(axleGeo, axleMat);
    axle.rotation.x = Math.PI / 2;
    group.add(axle);

    /* Stand / cradle */
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      roughness: 0.4,
      metalness: 0.7,
    });
    // Two upright arms
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, DRUM_RADIUS * 1.2, 0.12),
        standMat,
      );
      arm.position.set(0, -DRUM_RADIUS * 0.15, side * (DRUM_RADIUS + 0.5));
      arm.castShadow = true;
      group.add(arm);
    }
    // Base bar
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, DRUM_RADIUS * 2.8),
      standMat,
    );
    base.position.y = -DRUM_RADIUS * 0.75;
    base.castShadow = true;
    group.add(base);
    // Base plate
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.0, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.3, metalness: 0.8 }),
    );
    plate.position.y = -DRUM_RADIUS - 0.5;
    plate.receiveShadow = true;
    group.add(plate);

    this._drumGroup = group;
    this._scene.add(group);
  }

  /* ======================================================== */
  /*  Balls                                                    */
  /* ======================================================== */
  /**
   * Populate the drum with country balls.
   * @param {{ code: string, name: string, continent: string }[]} countries
   */
  addBalls(countries) {
    // Shared geometry — stored so we can dispose it once in dispose()
    const geo = this._ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 20, 16);

    for (let i = 0; i < countries.length; i++) {
      const c = countries[i];
      const hsl = countryColor(c.code, c.continent);

      // Three.js mesh
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().setHSL(hsl.h / 360, hsl.s / 100, hsl.l / 100),
        roughness: 0.25,
        metalness: 0.05,
        clearcoat: 0.8,
        clearcoatRoughness: 0.15,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._scene.add(mesh);

      // cannon-es body — random starting position inside drum
      const spawn = this._randomInsideSphere(DRUM_RADIUS * 0.75);
      const body = new CANNON.Body({
        mass: 0.15,
        shape: new CANNON.Sphere(BALL_RADIUS),
        position: new CANNON.Vec3(spawn.x, spawn.y, spawn.z),
        material: this._ballMat,
        linearDamping: 0.15,
        angularDamping: 0.3,
      });
      this._world.addBody(body);

      this._balls.push({ body, mesh, country: c });
    }
  }

  /** Remove a ball by country code */
  removeBall(code) {
    const idx = this._balls.findIndex((b) => b.country.code === code);
    if (idx === -1) return;
    const b = this._balls[idx];
    this._world.removeBody(b.body);
    this._scene.remove(b.mesh);
    b.mesh.material?.dispose(); // geometry is shared, don't dispose it here
    this._balls.splice(idx, 1);
  }

  /* ======================================================== */
  /*  Spin                                                     */
  /* ======================================================== */
  /** @param {(country: {code:string, name:string, continent:string}) => void} cb */
  onSelect(cb) { this._onSelectCb = cb; }

  spin() {
    if (this._spinning || this._balls.length === 0) return;
    this._spinning = true;
    this._spinTime = 0;
    this._selectedIdx = -1;

    // Wake all bodies
    for (const b of this._balls) b.body.wakeUp();
  }

  get isSpinning() { return this._spinning; }
  get ballCount() { return this._balls.length; }

  /* ======================================================== */
  /*  Animation loop                                           */
  /* ======================================================== */
  _animate() {
    if (this._disposed) return;
    requestAnimationFrame(this._animate);
    const dt = Math.min(this._clock.getDelta(), 0.05);

    /* --- physics step --- */
    this._stepSpin(dt);
    this._constrainBalls();
    this._world.step(1 / 60, dt, 3);

    /* --- sync meshes --- */
    for (const b of this._balls) {
      b.mesh.position.copy(b.body.position);
      b.mesh.quaternion.copy(b.body.quaternion);
    }

    /* --- drum visual rotation --- */
    if (this._spinOmega !== 0) {
      this._drumGlass.rotation.z += this._spinOmega * dt;
    }

    this._controls.update();
    this._composer.render();
  }

  _stepSpin(dt) {
    if (!this._spinning) return;
    this._spinTime += dt;
    const t = this._spinTime;
    const totalDuration = SPIN_RAMP + SPIN_HOLD + SPIN_DECAY + SETTLE_TIME;

    if (t < SPIN_RAMP) {
      // Ramp up
      this._spinOmega = SPIN_PEAK * (t / SPIN_RAMP);
    } else if (t < SPIN_RAMP + SPIN_HOLD) {
      // Full speed
      this._spinOmega = SPIN_PEAK;
    } else if (t < SPIN_RAMP + SPIN_HOLD + SPIN_DECAY) {
      // Decay
      const decay = (t - SPIN_RAMP - SPIN_HOLD) / SPIN_DECAY;
      this._spinOmega = SPIN_PEAK * (1 - decay * decay); // ease-out
    } else if (t < totalDuration) {
      // Settle
      this._spinOmega = 0;
    } else {
      // Done — select
      this._spinOmega = 0;
      this._spinning = false;
      this._selectBall();
      return;
    }

    // Apply tangential force to simulate drum wall friction
    const omega = this._spinOmega;
    if (omega === 0) return;
    for (const b of this._balls) {
      const p = b.body.position;
      // tangential direction = spinAxis × position (normalized)
      const tangent = new CANNON.Vec3();
      SPIN_AXIS.cross(p, tangent);
      const len = tangent.length();
      if (len > 0.001) {
        tangent.scale(1 / len, tangent);
        // Force proportional to omega and how close to the wall
        const distRatio = p.length() / DRUM_RADIUS;
        const strength = omega * 1.5 * distRatio * b.body.mass;
        b.body.applyForce(tangent.scale(strength));
      }
    }
  }

  _constrainBalls() {
    const maxR = DRUM_RADIUS - BALL_RADIUS - 0.02;
    for (const b of this._balls) {
      const p = b.body.position;
      const dist = p.length();
      if (dist > maxR) {
        // Push back inside
        const n = new CANNON.Vec3(p.x / dist, p.y / dist, p.z / dist);
        p.copy(n.scale(maxR));
        // Reflect velocity
        const v = b.body.velocity;
        const dot = v.dot(n);
        if (dot > 0) {
          v.x -= 2 * dot * n.x;
          v.y -= 2 * dot * n.y;
          v.z -= 2 * dot * n.z;
          v.scale(0.65, v); // energy loss on wall hit
        }
      }
    }
  }

  /* ======================================================== */
  /*  Selection (crypto-fair)                                  */
  /* ======================================================== */
  _selectBall() {
    if (this._balls.length === 0) return;

    // Perfectly uniform random index via rejection sampling
    const idx = this._cryptoRandomIndex(this._balls.length);
    this._selectedIdx = idx;
    const selected = this._balls[idx];

    // Visual highlight
    this._highlightBall(selected);

    if (this._onSelectCb) {
      this._onSelectCb(selected.country);
    }
  }

  /** Uniform random integer in [0, max) using crypto, rejection sampling */
  _cryptoRandomIndex(max) {
    if (max <= 0) return 0;
    // Find the smallest power of 2 >= max
    const mask = (1 << Math.ceil(Math.log2(max))) - 1 || 1;
    const arr = new Uint32Array(1);
    while (true) {
      crypto.getRandomValues(arr);
      const val = arr[0] & mask;
      if (val < max) return val;
    }
  }

  _highlightBall(ball) {
    // Enlarge & glow
    ball.mesh.scale.setScalar(1.6);
    ball.mesh.material.emissive = new THREE.Color(0xffffff);
    ball.mesh.material.emissiveIntensity = 0.35;

    // Spot light on it
    this._spotLight.intensity = 3;
    this._spotLight.target = ball.mesh;

    // Boost bloom briefly
    this._bloom.strength = 0.8;
    setTimeout(() => { if (!this._disposed) this._bloom.strength = 0.35; }, 600);
  }

  /** Reset highlight (call after skip/accept) */
  clearHighlight() {
    if (this._selectedIdx >= 0 && this._selectedIdx < this._balls.length) {
      const ball = this._balls[this._selectedIdx];
      ball.mesh.scale.setScalar(1);
      ball.mesh.material.emissiveIntensity = 0;
    }
    this._spotLight.intensity = 0;
    this._selectedIdx = -1;
  }

  /* ======================================================== */
  /*  Helpers                                                  */
  /* ======================================================== */
  _randomInsideSphere(radius) {
    // Uniform distribution inside sphere
    while (true) {
      const x = (Math.random() * 2 - 1) * radius;
      const y = (Math.random() * 2 - 1) * radius;
      const z = (Math.random() * 2 - 1) * radius;
      if (x * x + y * y + z * z < radius * radius) {
        return { x, y, z };
      }
    }
  }

  _onResize() {
    const parent = this._canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this._renderer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._composer) this._composer.setSize(w, h);
  }

  dispose() {
    this._disposed = true;
    window.removeEventListener("resize", this._onResize);
    this._controls.dispose();
    this._renderer.dispose();
    if (this._ballGeo) this._ballGeo.dispose();
  }
}
