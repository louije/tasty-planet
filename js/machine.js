/**
 * 3D Lottery Machine — Three.js + cannon-es
 *
 * Glass bowl filled with low-poly balls. Shake (accelerometer or button)
 * to tumble them, then a trapdoor opens and the first ball to fall out
 * is the winner. Physics determines selection — no RNG overlay.
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
const BOWL_RADIUS      = 3.2;
const BALL_RADIUS      = 0.19;
const TRAPDOOR_WIDTH   = 0.55;    // half-width of the trapdoor hole
const TRAPDOOR_Y       = -BOWL_RADIUS + 0.1; // bottom of the bowl
const CHUTE_LEN        = 2.5;
const CHUTE_EXIT_Y     = TRAPDOOR_Y - CHUTE_LEN;
const GRAVITY          = -14;
const SHAKE_FORCE      = 18;
const ACCEL_THRESHOLD  = 18;      // m/s² to register a shake
const ACCEL_SCALE      = 1.8;

export class LotteryMachine {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this._canvas  = canvas;
    this._balls   = [];           // { body, mesh, country }
    this._state   = "idle";       // idle | shaking | draining | selected
    this._onSelectCb = null;
    this._winner     = null;
    this._trapdoorOpen = false;
    this._disposed = false;
    this._clock    = new THREE.Clock();
    this._shakeAccum = new THREE.Vector3();
    this._accelEnabled = false;

    this._initRenderer();
    this._initScene();
    this._initPhysics();
    this._buildBowl();
    this._buildChute();

    this._animate = this._animate.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onResize();
    window.addEventListener("resize", this._onResize);
    this._animate();
  }

  /* ======================================================== */
  /*  Renderer                                                 */
  /* ======================================================== */
  _initRenderer() {
    const r = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    this._renderer = r;
  }

  /* ======================================================== */
  /*  Scene, camera, lights                                    */
  /* ======================================================== */
  _initScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090e);
    scene.fog = new THREE.FogExp2(0x08090e, 0.04);
    this._scene = scene;

    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    cam.position.set(0, 4, 10);
    this._camera = cam;

    const ctrl = new OrbitControls(cam, this._canvas);
    ctrl.target.set(0, -0.5, 0);
    ctrl.enablePan = false;
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.07;
    ctrl.minDistance = 6;
    ctrl.maxDistance = 18;
    ctrl.maxPolarAngle = Math.PI * 0.55;
    ctrl.minPolarAngle = Math.PI * 0.15;
    ctrl.update();
    this._controls = ctrl;

    /* Environment map (procedural) */
    const pmrem = new THREE.PMREMGenerator(this._renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0e1020);
    for (const [px, py, pz, col, sz] of [
      [5,8,3,0xffeedd,1.5],[-5,6,-4,0xaaccff,1],
      [0,-4,6,0x332211,2],[3,3,-6,0xffd6aa,0.8],
    ]) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(sz, 0),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      m.position.set(px, py, pz);
      envScene.add(m);
    }
    scene.environment = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
    pmrem.dispose();

    /* Lights */
    scene.add(new THREE.AmbientLight(0x8899bb, 0.5));

    const key = new THREE.DirectionalLight(0xffeedd, 1.8);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.003;
    key.shadow.radius = 4;
    scene.add(key);

    scene.add(Object.assign(new THREE.DirectionalLight(0xaaccff, 0.4), {
      position: new THREE.Vector3(-3, 4, -3),
    }));

    /* Spotlight for winner */
    const spot = new THREE.SpotLight(0xffe8b0, 0, 14, Math.PI * 0.18, 0.7, 1.2);
    spot.position.set(0, 8, 0);
    scene.add(spot);
    scene.add(spot.target);
    this._spotLight = spot;

    /* Ground */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x0c0d14, roughness: 0.4, metalness: 0.5 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = CHUTE_EXIT_Y - 1;
    ground.receiveShadow = true;
    scene.add(ground);

    /* Post-processing */
    const composer = new EffectComposer(this._renderer);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(256, 256), 0.3, 0.5, 0.9,
    );
    composer.addPass(bloom);
    this._composer = composer;
    this._bloom = bloom;
  }

  /* ======================================================== */
  /*  Physics                                                  */
  /* ======================================================== */
  _initPhysics() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 4;

    const ballMat = new CANNON.Material("ball");
    const wallMat = new CANNON.Material("wall");
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, ballMat, {
      friction: 0.3, restitution: 0.35,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, wallMat, {
      friction: 0.2, restitution: 0.3,
    }));

    this._world   = world;
    this._ballMat = ballMat;
    this._wallMat = wallMat;
  }

  /* ======================================================== */
  /*  Bowl                                                     */
  /* ======================================================== */
  _buildBowl() {
    const group = new THREE.Group();

    /* Glass bowl — hemisphere */
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.0,
      transmission: 0.9,
      thickness: 0.3,
      ior: 1.45,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const bowlGeo = new THREE.SphereGeometry(BOWL_RADIUS, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const bowl = new THREE.Mesh(bowlGeo, glassMat);
    bowl.rotation.x = Math.PI; // flip so open side faces up
    group.add(bowl);

    /* Gold rim at top of bowl */
    const rimGeo = new THREE.TorusGeometry(
      BOWL_RADIUS * Math.sin(Math.PI * 0.6), 0.04, 8, 64,
    );
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4a04a, roughness: 0.25, metalness: 0.9,
    });
    const rim = new THREE.Mesh(rimGeo, goldMat);
    rim.position.y = BOWL_RADIUS * Math.cos(Math.PI * 0.6);
    group.add(rim);

    /* Base / pedestal */
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22, roughness: 0.35, metalness: 0.75,
    });
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 1.5, 16), baseMat,
    );
    stem.position.y = -BOWL_RADIUS - 0.75;
    stem.castShadow = true;
    group.add(stem);

    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.8, 0.15, 32), baseMat,
    );
    plate.position.y = -BOWL_RADIUS - 1.5;
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    this._bowlGroup = group;
    this._scene.add(group);
  }

  /* ======================================================== */
  /*  Chute & Trapdoor                                         */
  /* ======================================================== */
  _buildChute() {
    /* Visual chute tube */
    const chuteMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22, roughness: 0.3, metalness: 0.8,
      side: THREE.DoubleSide,
    });
    const chuteGeo = new THREE.CylinderGeometry(
      TRAPDOOR_WIDTH + 0.08, TRAPDOOR_WIDTH + 0.15, CHUTE_LEN, 16, 1, true,
    );
    const chute = new THREE.Mesh(chuteGeo, chuteMat);
    chute.position.y = TRAPDOOR_Y - CHUTE_LEN / 2;
    this._scene.add(chute);

    /* Trapdoor flaps (visual) — two half-circles that swing open */
    const flapGeo = new THREE.CircleGeometry(TRAPDOOR_WIDTH + 0.05, 16, 0, Math.PI);
    const flapMat = new THREE.MeshStandardMaterial({
      color: 0xd4a04a, roughness: 0.3, metalness: 0.85,
    });
    this._flapL = new THREE.Mesh(flapGeo, flapMat);
    this._flapR = new THREE.Mesh(flapGeo, flapMat);
    this._flapL.rotation.x = -Math.PI / 2;
    this._flapR.rotation.x = -Math.PI / 2;
    this._flapR.rotation.z = Math.PI;
    this._flapL.position.y = TRAPDOOR_Y;
    this._flapR.position.y = TRAPDOOR_Y;

    /* Pivot groups so they swing from the edge */
    this._flapPivotL = new THREE.Group();
    this._flapPivotR = new THREE.Group();
    this._flapPivotL.position.set(0, TRAPDOOR_Y, 0);
    this._flapPivotR.position.set(0, TRAPDOOR_Y, 0);
    this._flapL.position.y = 0;
    this._flapR.position.y = 0;
    this._flapPivotL.add(this._flapL);
    this._flapPivotR.add(this._flapR);
    this._scene.add(this._flapPivotL);
    this._scene.add(this._flapPivotR);

    /* Chute walls — physics (always present, static) */
    const chuteBody = new CANNON.Body({
      mass: 0, material: this._wallMat,
    });
    // 4 walls forming a square chute
    const hw = TRAPDOOR_WIDTH;
    const hh = CHUTE_LEN / 2;
    const wallShape = new CANNON.Box(new CANNON.Vec3(hw, hh, 0.05));
    const wallShape2 = new CANNON.Box(new CANNON.Vec3(0.05, hh, hw));
    chuteBody.addShape(wallShape,  new CANNON.Vec3(0, TRAPDOOR_Y - hh, -hw));
    chuteBody.addShape(wallShape,  new CANNON.Vec3(0, TRAPDOOR_Y - hh,  hw));
    chuteBody.addShape(wallShape2, new CANNON.Vec3(-hw, TRAPDOOR_Y - hh, 0));
    chuteBody.addShape(wallShape2, new CANNON.Vec3( hw, TRAPDOOR_Y - hh, 0));
    this._world.addBody(chuteBody);

    /* Trapdoor floor — a kinematic body we remove to open */
    this._trapdoorBody = new CANNON.Body({
      mass: 0, material: this._wallMat,
      position: new CANNON.Vec3(0, TRAPDOOR_Y, 0),
    });
    this._trapdoorBody.addShape(
      new CANNON.Box(new CANNON.Vec3(hw, 0.05, hw)),
    );
    this._world.addBody(this._trapdoorBody);
    this._trapdoorOpen = false;

    /* Catch floor at bottom of chute to detect the winner */
    this._catchY = CHUTE_EXIT_Y;
  }

  /* ======================================================== */
  /*  Balls                                                    */
  /* ======================================================== */
  addBalls(countries) {
    // Low-poly icosahedron — like d12 lottery balls
    const geo = this._ballGeo = new THREE.IcosahedronGeometry(BALL_RADIUS, 1);
    const sphereShape = new CANNON.Sphere(BALL_RADIUS);

    for (let i = 0; i < countries.length; i++) {
      const c = countries[i];
      const hsl = countryColor(c.code, c.continent);

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hsl.h / 360, hsl.s / 100, hsl.l / 100),
        roughness: 0.35,
        metalness: 0.1,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      this._scene.add(mesh);

      // Random spawn inside upper bowl
      const spawn = this._randomInBowl();
      const body = new CANNON.Body({
        mass: 0.1,
        shape: sphereShape,
        position: new CANNON.Vec3(spawn.x, spawn.y, spawn.z),
        material: this._ballMat,
        linearDamping: 0.15,
        angularDamping: 0.4,
      });
      this._world.addBody(body);
      this._balls.push({ body, mesh, country: c });
    }
  }

  removeBall(code) {
    const idx = this._balls.findIndex(b => b.country.code === code);
    if (idx === -1) return;
    const b = this._balls[idx];
    this._world.removeBody(b.body);
    this._scene.remove(b.mesh);
    b.mesh.material.dispose();
    this._balls.splice(idx, 1);
  }

  /* ======================================================== */
  /*  Shake / Spin API                                         */
  /* ======================================================== */
  onSelect(cb) { this._onSelectCb = cb; }

  /** Start shaking (from button or first accelerometer event) */
  startShake() {
    if (this._state !== "idle" || this._balls.length === 0) return;
    this._state = "shaking";
    this._closeTrapdoor();
    for (const b of this._balls) b.body.wakeUp();
  }

  /** Stop shaking → open trapdoor → wait for first ball out */
  release() {
    if (this._state !== "shaking") return;
    this._state = "draining";
    this._openTrapdoor();
  }

  /** Apply a directional shake impulse (from accelerometer or random) */
  applyShake(x, y, z) {
    if (this._state !== "shaking") return;
    const force = new CANNON.Vec3(x * SHAKE_FORCE, y * SHAKE_FORCE, z * SHAKE_FORCE);
    for (const b of this._balls) {
      b.body.wakeUp();
      b.body.applyImpulse(force);
    }
  }

  /** Button-triggered spin: auto-shake then release */
  spin() {
    if (this._state !== "idle" || this._balls.length === 0) return;
    this.startShake();

    let shakes = 0;
    const maxShakes = 30;
    const interval = setInterval(() => {
      if (this._state !== "shaking" || this._disposed) {
        clearInterval(interval);
        return;
      }
      // Random impulses
      this.applyShake(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.3) * 1.5,
        (Math.random() - 0.5) * 2,
      );
      shakes++;
      if (shakes >= maxShakes) {
        clearInterval(interval);
        this.release();
      }
    }, 100);
  }

  get isSpinning() { return this._state !== "idle"; }
  get ballCount() { return this._balls.length; }

  /* ======================================================== */
  /*  Accelerometer                                            */
  /* ======================================================== */
  async enableAccelerometer() {
    if (typeof DeviceMotionEvent === "undefined") return false;
    // iOS 13+ requires permission
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== "granted") return false;
      } catch { return false; }
    }
    window.addEventListener("devicemotion", (e) => this._onDeviceMotion(e));
    this._accelEnabled = true;
    return true;
  }

  _onDeviceMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

    if (mag > ACCEL_THRESHOLD) {
      if (this._state === "idle") {
        this.startShake();
        this._lastShakeTime = performance.now();
      }
      if (this._state === "shaking") {
        this.applyShake(
          a.x * ACCEL_SCALE / mag,
          a.y * ACCEL_SCALE / mag,
          a.z * ACCEL_SCALE / mag,
        );
        this._lastShakeTime = performance.now();
      }
    }

    // Auto-release after 0.6s of calm
    if (this._state === "shaking" && this._lastShakeTime &&
        performance.now() - this._lastShakeTime > 600) {
      this.release();
    }
  }

  /* ======================================================== */
  /*  Trapdoor                                                 */
  /* ======================================================== */
  _openTrapdoor() {
    if (this._trapdoorOpen) return;
    this._trapdoorOpen = true;
    this._world.removeBody(this._trapdoorBody);
  }

  _closeTrapdoor() {
    if (!this._trapdoorOpen) return;
    this._trapdoorOpen = false;
    this._world.addBody(this._trapdoorBody);
  }

  clearHighlight() {
    if (this._winner) {
      this._winner.mesh.scale.setScalar(1);
      this._winner.mesh.material.emissiveIntensity = 0;
      this._winner = null;
    }
    this._spotLight.intensity = 0;
  }

  /* ======================================================== */
  /*  Animation loop                                           */
  /* ======================================================== */
  _animate() {
    if (this._disposed) return;
    requestAnimationFrame(this._animate);
    const dt = Math.min(this._clock.getDelta(), 0.04);

    this._constrainBalls();
    this._world.step(1 / 60, dt, 3);

    // Sync meshes
    for (const b of this._balls) {
      b.mesh.position.copy(b.body.position);
      b.mesh.quaternion.copy(b.body.quaternion);
    }

    // Animate trapdoor flaps
    this._animateFlaps(dt);

    // Check if a ball fell through
    if (this._state === "draining") {
      this._checkWinner();
    }

    this._controls.update();
    this._composer.render();
  }

  _animateFlaps(dt) {
    const target = this._trapdoorOpen ? Math.PI * 0.45 : 0;
    const speed = 4;
    const lx = this._flapPivotL.rotation.z;
    this._flapPivotL.rotation.z += (target - lx) * Math.min(1, speed * dt);
    this._flapPivotR.rotation.z += (-target - this._flapPivotR.rotation.z) * Math.min(1, speed * dt);
  }

  _constrainBalls() {
    const maxR = BOWL_RADIUS - BALL_RADIUS - 0.01;
    for (const b of this._balls) {
      const p = b.body.position;

      // If draining and ball is near the trapdoor hole, let it through
      if (this._trapdoorOpen) {
        const horizDist = Math.sqrt(p.x * p.x + p.z * p.z);
        if (horizDist < TRAPDOOR_WIDTH && p.y < TRAPDOOR_Y + BALL_RADIUS) {
          continue; // don't constrain — let it fall
        }
      }

      // Spherical bowl constraint
      const dist = p.length();
      if (dist > maxR) {
        const scale = maxR / dist;
        p.x *= scale;
        p.y *= scale;
        p.z *= scale;
        // Reflect velocity outward component
        const v = b.body.velocity;
        const nx = p.x / maxR, ny = p.y / maxR, nz = p.z / maxR;
        const dot = v.x * nx + v.y * ny + v.z * nz;
        if (dot > 0) {
          v.x -= 1.6 * dot * nx;
          v.y -= 1.6 * dot * ny;
          v.z -= 1.6 * dot * nz;
        }
      }
    }
  }

  _checkWinner() {
    for (const b of this._balls) {
      if (b.body.position.y < this._catchY) {
        // This ball fell out — it's the winner!
        this._state = "selected";
        this._winner = b;
        this._highlightWinner(b);
        this._closeTrapdoor();
        if (this._onSelectCb) this._onSelectCb(b.country);
        return;
      }
    }
  }

  _highlightWinner(ball) {
    ball.mesh.scale.setScalar(1.8);
    ball.mesh.material.emissive = ball.mesh.material.color;
    ball.mesh.material.emissiveIntensity = 0.4;
    this._spotLight.intensity = 4;
    this._spotLight.target = ball.mesh;
    this._bloom.strength = 0.6;
    setTimeout(() => { if (!this._disposed) this._bloom.strength = 0.3; }, 800);
  }

  /** Called after skip/accept to return to idle */
  resetAfterSelection() {
    this.clearHighlight();
    this._state = "idle";
  }

  /* ======================================================== */
  /*  Helpers                                                  */
  /* ======================================================== */
  _randomInBowl() {
    while (true) {
      const x = (Math.random() - 0.5) * BOWL_RADIUS * 1.2;
      const z = (Math.random() - 0.5) * BOWL_RADIUS * 1.2;
      const y = (Math.random() - 0.3) * BOWL_RADIUS * 0.8;
      if (x * x + y * y + z * z < (BOWL_RADIUS * 0.7) ** 2) {
        return { x, y, z };
      }
    }
  }

  _onResize() {
    const parent = this._canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this._renderer.setSize(w, h);
    if (this._camera) {
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    }
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
