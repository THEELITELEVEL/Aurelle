/* ==========================================================================
   AURELLE — Calibre 01
   Main application: Three.js scene, GSAP/ScrollTrigger scroll-driven
   animation, custom cursor, exploded-view choreography.
   ========================================================================== */

(() => {
  'use strict';

  /* -------------------------------------------------------------------------
     GLOBALS & GUARDS
     ------------------------------------------------------------------------- */
  const THREE = window.THREE;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;

  if (!THREE || !gsap || !ScrollTrigger) {
    console.error('Required libraries not loaded.');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------------------------
     RENDERER, SCENE, CAMERA
     ------------------------------------------------------------------------- */
  const canvas = document.getElementById('webgl');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0b0d, 9, 18);

  // Camera inside a holder for parallax + mobile offset
  const cameraHolder = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.25, 6.2);
  cameraHolder.add(camera);
  scene.add(cameraHolder);

  /* -------------------------------------------------------------------------
     PROCEDURAL ENVIRONMENT (PMREM) — gives metals something to reflect
     ------------------------------------------------------------------------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0b0b0d);

  const makePanel = (color, pos, rot) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 4),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.copy(pos);
    if (rot) m.rotation.set(...rot);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  makePanel(0xfff2dd, new THREE.Vector3(-5, 3, 4));              // warm key
  makePanel(0xc9a24b, new THREE.Vector3(5, 2, 4));               // gold fill
  makePanel(0x8aa4d8, new THREE.Vector3(0, -3, -5), [-0.5, 0, 0]); // cool bottom

  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  /* -------------------------------------------------------------------------
     LIGHTING — studio set (no envmap shadows, purely artistic)
     ------------------------------------------------------------------------- */
  const keyLight = new THREE.DirectionalLight(0xffe8c8, 1.4);
  keyLight.position.set(4, 3, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x9db4ff, 0.55);
  fillLight.position.set(-4, -1, 2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
  rimLight.position.set(0, 2, -4);
  scene.add(rimLight);

  const amb = new THREE.AmbientLight(0x222233, 0.6);
  scene.add(amb);

  /* -------------------------------------------------------------------------
     MATERIALS
     ------------------------------------------------------------------------- */
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc9a24b, metalness: 0.95, roughness: 0.22,
    envMapIntensity: 1.1
  });
  const caseMat = new THREE.MeshStandardMaterial({
    color: 0x7a5f2e, metalness: 0.9, roughness: 0.38,
    envMapIntensity: 1.0
  });
  const dialMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0c, metalness: 0.15, roughness: 0.55,
    envMapIntensity: 0.7
  });
  const markerMat = new THREE.MeshStandardMaterial({
    color: 0xd4b058, metalness: 1.0, roughness: 0.15,
    envMapIntensity: 1.2
  });
  const handMat = new THREE.MeshStandardMaterial({
    color: 0xf5ebd8, metalness: 1.0, roughness: 0.1,
    envMapIntensity: 1.3
  });
  const handMatGold = new THREE.MeshStandardMaterial({
    color: 0xc9a24b, metalness: 1.0, roughness: 0.12,
    envMapIntensity: 1.3
  });
  const movementMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a30, metalness: 0.85, roughness: 0.35,
    envMapIntensity: 1.0
  });
  const rubyMat = new THREE.MeshStandardMaterial({
    color: 0xb3122e, metalness: 0.0, roughness: 0.3,
    emissive: 0xb3122e, emissiveIntensity: 0.4
  });
  const chapterRingMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2e, metalness: 0.2, roughness: 0.4
  });

  /* -------------------------------------------------------------------------
     WATCH CONSTRUCTION — all primitives, named parts registry
     ------------------------------------------------------------------------- */
  const watchGroup = new THREE.Group();   // driven by ScrollTrigger timelines
  const floatGroup = new THREE.Group();   // idle bob/breath (rAF)
  watchGroup.add(floatGroup);
  scene.add(watchGroup);

  // Helper to store "home" transform for reassembly
  const home = (obj) => ({
    x: obj.position.x, y: obj.position.y, z: obj.position.z,
    rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z
  });

  const parts = {};

  // --- CASE (cylinder + 4 lugs) ---
  const caseGrp = new THREE.Group();
  const caseBody = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.25, 0.36, 64),
    caseMat
  );
  caseBody.rotation.x = Math.PI / 2;
  caseBody.receiveShadow = true;
  caseGrp.add(caseBody);

  // Lugs (4 small boxes)
  const lugGeo = new THREE.BoxGeometry(0.18, 0.35, 0.3);
  const lugMat = caseMat;
  [[-0.35, 1.25, 0], [0.35, 1.25, 0], [-0.35, -1.25, 0], [0.35, -1.25, 0]]
    .forEach(([x, y, z]) => {
      const lug = new THREE.Mesh(lugGeo, lugMat);
      lug.position.set(x, y, z);
      caseGrp.add(lug);
    });

  parts.case = caseGrp;
  floatGroup.add(caseGrp);

  // --- BEZEL ---
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(1.16, 0.09, 24, 96),
    goldMat
  );
  bezel.rotation.x = Math.PI / 2;
  bezel.position.z = 0.20;
  parts.bezel = bezel;
  floatGroup.add(bezel);

  // --- DIAL ---
  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.08, 0.06, 64),
    dialMat
  );
  dial.rotation.x = Math.PI / 2;
  dial.position.z = 0.16;
  parts.dial = dial;
  floatGroup.add(dial);

  // Chapter ring (thin torus)
  const chapterRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.98, 0.008, 16, 80),
    chapterRingMat
  );
  chapterRing.rotation.x = Math.PI / 2;
  chapterRing.position.z = 0.165;
  floatGroup.add(chapterRing);

  // --- MOVEMENT (visible when dial lifts) ---
  const movementGrp = new THREE.Group();
  const movementBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 0.12, 64),
    movementMat
  );
  movementBase.rotation.x = Math.PI / 2;
  movementBase.position.z = -0.02;
  movementGrp.add(movementBase);

  // Gear teeth ring
  const toothGeo = new THREE.BoxGeometry(0.035, 0.06, 0.06);
  const toothMat = new THREE.MeshStandardMaterial({
    color: 0x5a4a28, metalness: 0.9, roughness: 0.25
  });
  for (let i = 0; i < 60; i++) {
    const t = new THREE.Mesh(toothGeo, toothMat);
    const a = (i / 60) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.96, Math.sin(a) * 0.96, 0.05);
    t.rotation.z = a;
    movementGrp.add(t);
  }

  // Three ruby jewels
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 12),
      rubyMat
    );
    const a = (i / 3) * Math.PI * 2 + 0.5;
    r.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.08);
    movementGrp.add(r);
  }

  parts.movement = movementGrp;
  floatGroup.add(movementGrp);

  // --- HANDS (each offset so rotation pivots at center) ---
  const makeHand = (len, w, th, mat, offsetY) => {
    const g = new THREE.BoxGeometry(w, len, th);
    g.translate(0, len / 2 - offsetY, 0);
    return new THREE.Mesh(g, mat);
  };

  const handsGrp = new THREE.Group();
  handsGrp.position.z = 0.24;

  const hourHand = makeHand(0.45, 0.06, 0.02, handMat, 0.06);
  hourHand.rotation.z = -1.05; // ~10 o'clock
  handsGrp.add(hourHand);

  const minuteHand = makeHand(0.72, 0.045, 0.02, handMat, 0.04);
  minuteHand.rotation.z = 1.85; // ~35 min
  handsGrp.add(minuteHand);

  const secondHand = makeHand(0.85, 0.018, 0.018, handMatGold, 0.12);
  // secondHand.rotation.z updated per-frame for sweep
  handsGrp.add(secondHand);

  parts.hourHand = hourHand;
  parts.minuteHand = minuteHand;
  parts.secondHand = secondHand;
  parts.hands = handsGrp;
  floatGroup.add(handsGrp);

  // --- HOUR MARKERS (12) ---
  const markersGrp = new THREE.Group();
  markersGrp.position.z = 0.24;
  const markerGeo = new THREE.BoxGeometry(0.05, 0.16, 0.03);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(markerGeo, markerMat);
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = 0.88;
    m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    m.userData = { index: i, baseRadius: r, baseAngle: a };
    markersGrp.add(m);
  }
  parts.markers = markersGrp;
  floatGroup.add(markersGrp);

  // --- CROWN ---
  const crownGrp = new THREE.Group();
  const crownBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 32),
    goldMat
  );
  crownBody.rotation.z = Math.PI / 2;
  crownGrp.add(crownBody);
  const crownCap = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.018, 12, 24),
    goldMat
  );
  crownCap.rotation.z = Math.PI / 2;
  crownCap.position.x = 0.07;
  crownGrp.add(crownCap);
  crownGrp.position.set(1.42, 0, 0.05);
  parts.crown = crownGrp;
  floatGroup.add(crownGrp);

  // Store home transforms
  const homes = {};
  Object.keys(parts).forEach(k => {
    const o = parts[k];
    if (o && o.position) homes[k] = home(o);
  });
  // Also store case group home
  homes.caseGrp = home(caseGrp);

  /* -------------------------------------------------------------------------
     PARTICLE FIELD (gold dust)
     ------------------------------------------------------------------------- */
  const particleCount = 180;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 16;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    sizes[i] = Math.random() * 0.025 + 0.01;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const particleMat = new THREE.PointsMaterial({
    color: 0xc9a24b,
    size: 0.03,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  /* -------------------------------------------------------------------------
     CUSTOM CURSOR
     ------------------------------------------------------------------------- */
  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  let ringX = cursorX;
  let ringY = cursorY;

  const dotEl = document.querySelector('.cursor-dot');
  const ringEl = document.querySelector('.cursor-ring');
  const labelEl = document.querySelector('.cursor-label');

  if (!isTouch && !prefersReduced && dotEl && ringEl) {
    window.addEventListener('mousemove', e => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      dotEl.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
    });

    // Hover targets
    document.querySelectorAll('[data-cursor]').forEach(el => {
      el.addEventListener('mouseenter', () => {
        ringEl.classList.add('is-hover');
        labelEl.textContent = el.getAttribute('data-cursor');
      });
      el.addEventListener('mouseleave', () => {
        ringEl.classList.remove('is-hover');
        labelEl.textContent = '';
      });
    });
  } else if (dotEl) {
    dotEl.style.display = 'none';
    ringEl.style.display = 'none';
  }

  /* -------------------------------------------------------------------------
     MAGNETIC BUTTON
     ------------------------------------------------------------------------- */
  if (!prefersReduced) {
    document.querySelectorAll('.magnetic').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const rect = btn.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        gsap.to(btn, { x: relX * 0.35, y: relY * 0.35, duration: 0.4, ease: 'power2.out' });
      });
      btn.addEventListener('mouseleave', () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  /* -------------------------------------------------------------------------
     SCROLL-TRIGGERED CAMERA / WATCH ANIMATIONS
     Each section has its own ScrollTrigger so text and 3D stay perfectly synced.
     ------------------------------------------------------------------------- */

  // ---- CAMERA / WATCH HERO STATE (initial) ----
  const heroCam = { x: 0, y: 0.25, z: 6.2 };
  const heroWatch = { x: 0, y: -0.05, z: 0, rx: 0.15, ry: -0.5, rz: 0 };

  // We'll use a helper to create scrubbed section transitions
  function sectionTransition(triggerSel, start, end, build) {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: triggerSel,
        start,
        end,
        scrub: prefersReduced ? true : 1.2,
        invalidateOnRefresh: false
      },
      defaults: { ease: 'none', immediateRender: false }
    });
    build(tl);
    return tl;
  }

  // ========================================================================
  // SEGMENT 1 → 2 : HERO → PRECISION
  // Watch slides left, rotates to profile; camera orbits slightly left.
  // ========================================================================
  sectionTransition('#precision', 'top bottom', 'top top', tl => {
    tl.to(watchGroup.position, { x: -1.15, y: -0.05, z: 0, duration: 1 }, 0)
      .to(watchGroup.rotation, { x: 0.08, y: 1.15, z: 0, duration: 1 }, 0)
      .to(camera.position, { x: -0.6, y: 0.35, z: 5.4, duration: 1 }, 0);
  });

  // ========================================================================
  // SEGMENT 2 → 3 : PRECISION → CRAFT
  // Watch slides right, camera pushes in close on dial (hero angle).
  // ========================================================================
  sectionTransition('#craft', 'top bottom', 'top top', tl => {
    tl.to(watchGroup.position, { x: 1.15, y: -0.02, z: 0, duration: 1 }, 0)
      .to(watchGroup.rotation, { x: 0.05, y: -0.35, z: 0, duration: 1 }, 0)
      .to(camera.position, { x: 0.7, y: 0.15, z: 3.4, duration: 1 }, 0);
  });

  // ========================================================================
  // SEGMENT 3 → 4 : CRAFT → CALIBRE (front view, pre-explosion)
  // Watch centers, straightens; camera pulls back to front-on.
  // ========================================================================
  sectionTransition('#calibre', 'top bottom', 'top top', tl => {
    tl.to(watchGroup.position, { x: 0, y: -0.05, z: 0, duration: 1 }, 0)
      .to(watchGroup.rotation, { x: 0, y: 0, z: 0, duration: 1 }, 0)
      .to(camera.position, { x: 0, y: 0.1, z: 5.0, duration: 1 }, 0);
  });

  // ========================================================================
  // EXPLOSION SEQUENCE — runs while user scrolls THROUGH the 300vh #calibre.
  // Trigger covers the whole tall section; the extra 200vh is the runway.
  // ========================================================================
  const calloutProxy = { v: 0 };
  const explosionTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#calibre',
      start: 'top top',
      end: 'bottom bottom',
      scrub: prefersReduced ? true : 1.2,
      invalidateOnRefresh: false
    },
    defaults: { ease: 'none', immediateRender: false }
  });

  // Camera subtle push-in during explosion
  explosionTl.to(camera.position, { z: 4.7, duration: 6 }, 0);

  // ---- Crown unscrews & drifts right (+ spins on its axis) ----
  explosionTl.to(parts.crown.position, { x: 2.35, duration: 1.6 }, 0.3)
    .to(parts.crown.rotation, { x: parts.crown.rotation.x + Math.PI * 4, duration: 1.6 }, 0.3);

  // ---- Bezel lifts forward, slow rotation ----
  explosionTl.to(parts.bezel.position, { z: 1.65, duration: 2 }, 0.8)
    .to(parts.bezel.rotation, { z: parts.bezel.rotation.z + 1.2, duration: 2 }, 0.8);

  // ---- Hands fan apart in Z, hour/minute rotate slightly ----
  explosionTl.to(parts.hourHand.position, { z: 1.0, duration: 1.8 }, 1.6)
    .to(parts.minuteHand.position, { z: 1.35, duration: 1.8 }, 1.6)
    .to(parts.secondHand.position, { z: 1.7, duration: 1.8 }, 1.6)
    .to(parts.hourHand.rotation, { z: parts.hourHand.rotation.z - 0.35, duration: 1.8 }, 1.6)
    .to(parts.minuteHand.rotation, { z: parts.minuteHand.rotation.z + 0.5, duration: 1.8 }, 1.6);

  // ---- Dial lifts forward ----
  explosionTl.to(parts.dial.position, { z: 0.75, duration: 1.6 }, 2.2);

  // ---- Markers scatter radially + slight Z lift (staggered) ----
  parts.markers.children.forEach((m, i) => {
    const base = m.userData;
    const tx = Math.cos(base.baseAngle) * base.baseRadius * 1.45;
    const ty = Math.sin(base.baseAngle) * base.baseRadius * 1.45;
    explosionTl.to(m.position, {
      x: tx, y: ty, z: 1.15,
      duration: 1.2
    }, 2.6 + i * 0.06);
  });
  // Subtle group spin
  explosionTl.to(parts.markers.rotation, { z: 0.2, duration: 2 }, 2.6);

  // ---- Movement reveals & spins ----
  explosionTl.to(parts.movement.position, { z: -0.95, duration: 2 }, 3.0)
    .to(parts.movement.rotation, { z: parts.movement.rotation.z + 2.0, duration: 2 }, 3.0);

  // ---- Callout visibility proxy (fade in mid-explosion, fade out before end) ----
  explosionTl.to(calloutProxy, { v: 1, duration: 0.8 }, 1.2)
    .to(calloutProxy, { v: 0, duration: 0.8 }, 4.8);

  // ========================================================================
  // REASSEMBLY + RETREAT — as user scrolls INTO #cta
  // ========================================================================
  const reassemblyTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#cta',
      start: 'top bottom',
      end: 'top top',
      scrub: prefersReduced ? true : 1.2,
      invalidateOnRefresh: false
    },
    defaults: { ease: 'none', immediateRender: false }
  });

  // Parts return home (staggered for elegance)
  const partOrder = ['crown', 'bezel', 'hourHand', 'minuteHand', 'secondHand', 'dial', 'movement'];
  partOrder.forEach((key, i) => {
    const o = parts[key];
    const h = homes[key];
    if (!o || !h) return;
    reassemblyTl.to(o.position, { x: h.x, y: h.y, z: h.z, duration: 0.7 }, i * 0.04)
      .to(o.rotation, { x: h.rx, y: h.ry, z: h.rz, duration: 0.7 }, i * 0.04);
  });
  // Markers return
  parts.markers.children.forEach((m, i) => {
    const b = m.userData;
    const hx = Math.cos(b.baseAngle) * b.baseRadius;
    const hy = Math.sin(b.baseAngle) * b.baseRadius;
    reassemblyTl.to(m.position, { x: hx, y: hy, z: 0, duration: 0.5 }, 0.6 + i * 0.025);
  });
  reassemblyTl.to(parts.markers.rotation, { z: 0, duration: 0.5 }, 0.6);

  // Watch group back to hero pose
  reassemblyTl.to(watchGroup.position, { x: 0, y: -0.05, z: 0, duration: 1 }, 0)
    .to(watchGroup.rotation, { x: 0.12, y: -0.45, z: 0, duration: 1 }, 0)
    .to(camera.position, { x: 0, y: 0.3, z: 6.4, duration: 1 }, 0);

  // Fade callout proxy out (in case explosion didn't finish)
  reassemblyTl.to(calloutProxy, { v: 0, duration: 0.5 }, 0);

  /* -------------------------------------------------------------------------
     SECTION TEXT REVEALS (masked lines + fades)
     ------------------------------------------------------------------------- */
  gsap.utils.toArray('.section:not(#hero)').forEach(section => {
    const lines = section.querySelectorAll('.line > span');
    const fades = section.querySelectorAll('.reveal-fade');
    gsap.set(lines, { yPercent: 120 });
    gsap.set(fades, { opacity: 0, y: 24 });

    gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top 68%',
        toggleActions: 'play none none reverse'
      }
    })
      .to(lines, { yPercent: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12 })
      .to(fades, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', stagger: 0.08 }, '-=0.7');
  });

  /* -------------------------------------------------------------------------
     SPEC COUNTERS (Calibre section) — animate once when panel enters
     ------------------------------------------------------------------------- */
  ScrollTrigger.create({
    trigger: '#calibre',
    start: 'top 60%',
    once: true,
    onEnter: () => {
      document.querySelectorAll('.spec-num[data-count]').forEach(el => {
        const target = parseFloat(el.dataset.count);
        const decimals = parseInt(el.dataset.decimals || '0', 10);
        const group = el.dataset.group === '1';
        const suffix = el.dataset.suffix || '';
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: 'power2.out',
          onUpdate: () => {
            let str = obj.v.toFixed(decimals);
            if (group) str = str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            el.textContent = str + suffix;
          }
        });
      });
    }
  });

  /* -------------------------------------------------------------------------
     CALLOUT PROJECTION — runs every frame, positions HTML callouts over
     the projected 3D part positions. Opacity driven by calloutProxy.v.
     ------------------------------------------------------------------------- */
  const calloutItems = [
    { el: document.querySelector('[data-callout="bezel"]'), obj: parts.bezel, offset: { x: -160, y: -110 }, side: 'left' },
    { el: document.querySelector('[data-callout="crown"]'), obj: parts.crown, offset: { x: 60, y: -20 }, side: 'right' },
    { el: document.querySelector('[data-callout="movement"]'), obj: parts.movement, offset: { x: -180, y: 120 }, side: 'left' },
    { el: document.querySelector('[data-callout="hands"]'), obj: parts.hands, offset: { x: 80, y: -70 }, side: 'right' }
  ];

  // Cache element widths for left-aligned callouts
  let calloutWidths = {};
  function measureCallouts() {
    calloutItems.forEach(item => {
      if (item.el) calloutWidths[item.el.dataset.callout] = item.el.offsetWidth;
    });
  }
  // Fonts might not be ready immediately
  document.fonts.ready.then(measureCallouts);
  window.addEventListener('resize', measureCallouts);

  const v3 = new THREE.Vector3();
  function projectToScreen(obj, out) {
    obj.getWorldPosition(v3);
    v3.project(camera);
    out.x = (v3.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-v3.y * 0.5 + 0.5) * window.innerHeight;
  }

  /* -------------------------------------------------------------------------
     PRELOADER
     ------------------------------------------------------------------------- */
  function runPreloader() {
    const countEl = document.getElementById('preloaderCount');
    const barEl = document.getElementById('preloaderBar');
    const preloaderEl = document.getElementById('preloader');

    if (prefersReduced) {
      // Instant skip
      gsap.set(preloaderEl, { display: 'none' });
      document.body.classList.remove('is-loading');
      heroReveal();
      return;
    }

    const state = { v: 0 };
    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });

    tl.to(state, {
      v: 100,
      duration: 1.35,
      onUpdate: () => {
        const v = Math.round(state.v);
        countEl.textContent = v.toString().padStart(2, '0');
        barEl.style.transform = `scaleX(${state.v / 100})`;
      }
    })
      .to(preloaderEl, { yPercent: -100, duration: 1, ease: 'power3.inOut' }, '+=0.15')
      .set(preloaderEl, { display: 'none' })
      .add(() => document.body.classList.remove('is-loading'), '<')
      .add(heroReveal, '<');
  }

  /* -------------------------------------------------------------------------
     HERO REVEAL (after preloader)
     ------------------------------------------------------------------------- */
  function heroReveal() {
    const heroLines = document.querySelectorAll('#hero .line > span');
    const heroFades = document.querySelectorAll('#hero .reveal-fade');

    gsap.set(heroLines, { yPercent: 120 });
    gsap.set(heroFades, { opacity: 0, y: 24 });

    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.14 })
      .to(heroFades, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'power2.out' }, '-=0.6');
  }

  /* -------------------------------------------------------------------------
     SMOOTH SCROLL FOR HERO ANCHOR
     ------------------------------------------------------------------------- */
  document.querySelector('.scroll-hint').addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector('#precision');
    if (target) {
      window.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
    }
  });

  /* -------------------------------------------------------------------------
     RENDER LOOP — single rAF driving:
       - ring lerp
       - cameraHolder parallax
       - idle float on floatGroup
       - second hand sweep
       - particle drift
       - callout projection
     ------------------------------------------------------------------------- */
  let lastTime = performance.now();
  const floatAmp = prefersReduced ? 0 : 0.06;
  const parallaxAmount = prefersReduced ? 0 : 0.06;
  const holderParallaxX = prefersReduced ? 0 : 0.25;

  function renderLoop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    const t = now * 0.001;

    // --- Ring lerp ---
    if (ringEl) {
      ringX += (cursorX - ringX) * 0.16;
      ringY += (cursorY - ringY) * 0.16;
      ringEl.style.transform = `translate(${ringX}px, ${ringY}px)`;
    }

    // --- Camera holder parallax (mouse) ---
    if (!prefersReduced) {
      const px = (cursorX / window.innerWidth - 0.5) * 2;
      const py = (cursorY / window.innerHeight - 0.5) * 2;
      cameraHolder.rotation.y += (px * parallaxAmount - cameraHolder.rotation.y) * 0.08;
      cameraHolder.rotation.x += (-py * parallaxAmount * 0.6 - cameraHolder.rotation.x) * 0.08;
      cameraHolder.position.x += (px * holderParallaxX - cameraHolder.position.x) * 0.06;
    }

    // --- Idle float (breathing) ---
    if (floatAmp > 0) {
      floatGroup.position.y = Math.sin(t * 0.6) * floatAmp;
      floatGroup.rotation.z = Math.sin(t * 0.35) * 0.015;
    }

    // --- Second hand sweep (continuous) ---
    parts.secondHand.rotation.z = -t * (Math.PI / 30); // 1 rev per 60s

    // --- Particle drift ---
    particles.rotation.y = t * 0.008;
    particles.position.y = Math.sin(t * 0.4) * 0.15;

    // --- Callout projection ---
    if (calloutProxy.v > 0.001) {
      const screen = { x: 0, y: 0 };
      calloutItems.forEach((item, idx) => {
        if (!item.el || !item.obj) return;
        projectToScreen(item.obj, screen);
        let x = screen.x + item.offset.x;
        let y = screen.y + item.offset.y;
        if (item.side === 'left') {
          const w = calloutWidths[item.el.dataset.callout] || 0;
          x -= w + 20; // so text ends near the anchor
        }
        // Staggered opacity
        const itemOpacity = Math.max(0, Math.min(1, (calloutProxy.v - idx * 0.1) * 2.8));
        item.el.style.opacity = itemOpacity;
        if (itemOpacity > 0.01) {
          item.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      });
    } else {
      calloutItems.forEach(item => { if (item.el) item.el.style.opacity = 0; });
    }

    renderer.render(scene, camera);
    requestAnimationFrame(renderLoop);
  }

  /* -------------------------------------------------------------------------
     RESIZE HANDLER
     ------------------------------------------------------------------------- */
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;

    // Mobile: widen FOV, pull camera back slightly via holder, scale watch down
    const isMobile = w / h < 0.85;
    camera.fov = isMobile ? 48 : 40;
    camera.updateProjectionMatrix();

    // Extra camera Z offset for mobile (added in render loop via holder)
    window.__mobileBoost = isMobile ? 1.4 : 0;
    // Scale watch so it doesn't feel huge on portrait
    const scale = isMobile ? 0.88 : 1;
    watchGroup.scale.setScalar(scale);

    // Re-measure callout widths
    measureCallouts();

    ScrollTrigger.refresh();
  }
  window.addEventListener('resize', onResize);

  /* -------------------------------------------------------------------------
     BOOT
     ------------------------------------------------------------------------- */
  // Initial hero state (explicit, in case timelines haven't run)
  watchGroup.position.set(heroWatch.x, heroWatch.y, heroWatch.z);
  watchGroup.rotation.set(heroWatch.rx, heroWatch.ry, heroWatch.rz);
  camera.position.set(heroCam.x, heroCam.y, heroCam.z);

  // Kick off
  runPreloader();
  requestAnimationFrame(renderLoop);
})();