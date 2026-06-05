window.addEventListener('DOMContentLoaded', () => {

    const AudioSys = {
        ctx: null,
        play(f1, f2, type, vol, dur) {
            if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            if(this.ctx.state === 'suspended') this.ctx.resume();
            let osc = this.ctx.createOscillator(), gn = this.ctx.createGain();
            osc.type = type; osc.connect(gn); gn.connect(this.ctx.destination);
            let t = this.ctx.currentTime;
            osc.frequency.setValueAtTime(f1, t); osc.frequency.exponentialRampToValueAtTime(f2, t+dur);
            gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.01, t+dur);
            osc.start(t); osc.stop(t+dur);
        },
        hit() { this.play(150, 40, 'square', 0.5, 0.15); },
        swing() { this.play(250, 100, 'sine', 0.2, 0.15); },
        pickup() { this.play(800, 1600, 'sine', 0.1, 0.15); },
        craft() { this.play(300, 800, 'square', 0.2, 0.3); },
        equip() { this.play(500, 400, 'sine', 0.3, 0.2); },
        quest() { this.play(600, 1200, 'square', 0.3, 0.5); }
    };

    const MathU = { dist: (a, b) => Math.hypot(a.x - b.x, a.z - b.z) || 0.001, clamp: (v, min, max) => Math.max(min, Math.min(v, max)) };

    const DB = {
        resources: {
            'wood':  { id:'wood', type:'resource', title:'Древесина', icon:'🪵' },
            'metal': { id:'metal', type:'resource', title:'Металл', icon:'🔩' },
            'ore':   { id:'ore', type:'resource', title:'Руда', icon:'💎' },
            'cloth': { id:'cloth', type:'resource', title:'Ткань', icon:'🕸️' }
        },
        weapons: {
            'hands':   { id:'hands', type:'weapon', title:'Кулаки', icon:'👊', dmg: 8, req: {} },
            'pipe':    { id:'pipe', type:'weapon', title:'Ржавая Труба', icon:'🪠', dmg: 15, req: { metal: 2 } },
            'bat':     { id:'bat', type:'weapon', title:'Бита с гвоздями', icon:'🏏', dmg: 22, req: { wood: 3, metal: 1 } },
            'knife':   { id:'knife', type:'weapon', title:'Охотничий нож', icon:'🔪', dmg: 28, req: { metal: 2, cloth: 1 } },
            'machete': { id:'machete', type:'weapon', title:'Мачете', icon:'🗡️', dmg: 40, req: { metal: 4, cloth: 2 } },
            'axe':     { id:'axe', type:'weapon', title:'Пожарный топор', icon:'🪓', dmg: 55, req: { metal: 4, wood: 2 } },
            'spear':   { id:'spear', type:'weapon', title:'Стальное копье', icon:'🔱', dmg: 45, req: { wood: 4, metal: 3 } },
            'katana':  { id:'katana', type:'weapon', title:'Катана Сталкера', icon:'⚔️', dmg: 75, req: { metal: 8, ore: 5, cloth: 3 } }
        },
        gear: {
            'rags':     { id:'rags', type:'gear', title:'Старые обноски', icon:'👕', def: 0, req: {}, color: 0x1e3a8a }, 
            'jacket':   { id:'jacket', type:'gear', title:'Плотная Куртка', icon:'🧥', def: 15, req: { cloth: 5 }, color: 0x4a3018 }, 
            'leather':  { id:'leather', type:'gear', title:'Косуха', icon:'🧥', def: 30, req: { cloth: 8, metal: 2 }, color: 0x111111 }, 
            'tactical': { id:'tactical', type:'gear', title:'Тактический Жилет', icon:'🦺', def: 55, req: { cloth: 10, metal: 8 }, color: 0x1e293b }, 
            'kevlar':   { id:'kevlar', type:'gear', title:'Тяжелый Кевлар', icon:'🛡️', def: 80, req: { cloth: 15, metal: 15, ore: 10 }, color: 0x3f6212 } 
        }
    };

    const RES = { wood: 0, ore: 0, metal: 0, cloth: 0 };
    // Добавлены переменные для Журнала
    const STATE = { hp: 100, maxHp: 100, stam: 100, xp: 0, lvl: 1, wId: 'hands', wDmg: 8, gId: 'rags', gDef: 0, invItems: [], isDead: false, isInvOpen: false, isQuestOpen: false, isDialog: false, timeOfDay: 12.0, questStep: 0, kills: 0 };
    
    let Mobs = [], Statics = [], Loots = [], Npcs = [], Particles = [];

    // --- ОБНОВЛЕННАЯ СИСТЕМА КВЕСТОВ (С Журналом и Отменой) ---
    const QUESTS = [
        {
            id: 0, npc: 'Сталкер Новак', color: 0xfacc15, pos: {x: 8, z: -8},
            title: 'Первое оружие',
            text: 'Добро пожаловать в Пустоши. Голыми руками тут не выжить. Скрафти Ржавую Трубу и перетащи её в слот "В РУКАХ".',
            objTxt: () => STATE.wId === 'pipe' ? 'Экипировано!' : 'Экипировать: Ржавая Труба',
            check: () => STATE.wId === 'pipe',
            completeTxt: 'Отличная работа. Теперь ты не беззащитна. Иди на север, найди Охотницу Елену по радару.',
            status: 'active', // active, cancelled, completed
            onComplete: () => { Quests.spawnNext(1, 'Охотница Елена', 0xd946ef, 100, -100); }
        },
        {
            id: 1, npc: 'Охотница Елена', color: 0xd946ef, pos: {x: 100, z: -100},
            title: 'Доказательство силы',
            text: 'Новак сказал, ты новичок. Докажи обратное. Убей 3 мутантов и приходи ко мне.',
            objTxt: () => `Убито мутантов: ${Math.min(STATE.kills, 3)} / 3`,
            check: () => STATE.kills >= 3,
            completeTxt: 'Неплохо для начала. Механик Док ищет помощь на востоке. Найди его.',
            status: 'locked',
            onComplete: () => { Quests.spawnNext(2, 'Механик Док', 0x06b6d4, -150, 50); }
        },
        {
            id: 2, npc: 'Механик Док', color: 0x06b6d4, pos: {x: -150, z: 50},
            title: 'Починка генератора',
            text: 'Генератор сломался. Принеси мне 5 единиц руды. Убедись, что они лежат в твоем рюкзаке.',
            objTxt: () => { let o = STATE.invItems.filter(i=>i==='ore').length; return `Собрать Руду: ${Math.min(o, 5)} / 5`; },
            check: () => STATE.invItems.filter(i => i === 'ore').length >= 5,
            completeTxt: 'Спасибо! Я забираю руду. Слышал, на западе разбили лагерь военные. Найди Сержанта.',
            status: 'locked',
            onComplete: () => { 
                for(let i=0; i<5; i++) { let idx = STATE.invItems.indexOf('ore'); if(idx > -1) STATE.invItems.splice(idx, 1); }
                Quests.spawnNext(3, 'Сержант Рекс', 0xdc2626, -200, -200); 
            }
        },
        {
            id: 3, npc: 'Сержант Рекс', color: 0xdc2626, pos: {x: -200, z: -200},
            title: 'Подготовка к рейду',
            text: 'Сектор не безопасен. Сшей Тактический Жилет в инвентаре и надень его в слот "НА ТЕЛЕ".',
            objTxt: () => STATE.gId === 'tactical' ? 'Броня надета!' : 'Экипировать: Тактический Жилет',
            check: () => STATE.gId === 'tactical',
            completeTxt: 'Теперь ты настоящий боец. Твой путь только начинается. Исследуй этот бесконечный мир!',
            status: 'locked',
            onComplete: () => { Quests.activeNpc = null; Npcs = []; }
        }
    ];

    const Quests = {
        activeNpc: null,
        init() { this.spawnNext(0, QUESTS[0].npc, QUESTS[0].color, QUESTS[0].pos.x, QUESTS[0].pos.z); window.UI.updateHUD(); },
        spawnNext(id, name, color, x, z) {
            if(QUESTS[id]) QUESTS[id].status = 'active';
            if(this.activeNpc && this.activeNpc.mesh) scene.remove(this.activeNpc.mesh);
            Npcs = []; 
            let npcGroup = Models.buildAlexa(); npcGroup.torso.material = new THREE.MeshStandardMaterial({color: color, roughness: 0.8}); 
            npcGroup.root.position.set(x, 0, z); scene.add(npcGroup.root);
            this.activeNpc = { x: x, z: z, mesh: npcGroup.root, active: true, name: name };
            Npcs.push(this.activeNpc); Statics.push({ x: x, z: z, rad: 1.2 });
        },
        interact() {
            let q = QUESTS[STATE.questStep];
            if(!q) return;
            document.getElementById('dia-author').innerText = q.npc;

            if (q.status === 'cancelled') {
                document.getElementById('dia-text').innerText = "Ты вернулась? Отлично. " + q.text;
                q.status = 'active';
            } else if (q.status === 'active') {
                if (q.check()) {
                    document.getElementById('dia-text').innerText = q.completeTxt;
                    q.status = 'completed'; STATE.questStep++; STATE.xp += 50; AudioSys.quest();
                    if(q.onComplete) q.onComplete();
                } else {
                    document.getElementById('dia-text').innerText = "Задание еще не выполнено. " + q.text;
                }
            }
            STATE.isDialog = true; keys.w = keys.a = keys.s = keys.d = 0; keys.lkm = false; 
            document.getElementById('dialog-window').style.display = 'flex';
            window.UI.updateHUD();
        }
    };

    const scene = new THREE.Scene(); 
    scene.background = new THREE.Color(0x1a2530); scene.fog = new THREE.Fog(0x1a2530, 20, 120);
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 400);
    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const clock = new THREE.Clock();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.2); dirLight.castShadow = true; dirLight.position.set(-30, 60, -20);
    dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100; dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.mapSize.width = 1024; dirLight.shadow.mapSize.height = 1024; scene.add(dirLight);

    const radarCtx = document.getElementById('radar-canvas').getContext('2d');
    const keys = { w:0, a:0, s:0, d:0, shift:false, lkm:false };
    const mouseVec = new THREE.Vector2(); const raycaster = new THREE.Raycaster(); const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const aimPoint = new THREE.Vector3();

    window.addEventListener('keydown', e => {
        let code = e.code;
        if (code === 'KeyI' || code === 'KeyШ') { if(!STATE.isDialog && !STATE.isDead && !STATE.isQuestOpen) window.UI.toggleInv(); return; }
        if (code === 'KeyJ' || code === 'KeyО') { if(!STATE.isDialog && !STATE.isDead && !STATE.isInvOpen) window.UI.toggleQuest(); return; }
        if (code === 'KeyE' || code === 'KeyУ') { if(!STATE.isDialog && !STATE.isInvOpen && !STATE.isQuestOpen && !STATE.isDead) window.UI.tryInteract(); return; }
        
        if(STATE.isInvOpen || STATE.isDead || STATE.isDialog || STATE.isQuestOpen) return;
        if (code === 'KeyW' || e.key === 'ArrowUp') keys.w = 1;
        if (code === 'KeyS' || e.key === 'ArrowDown') keys.s = 1;
        if (code === 'KeyA' || e.key === 'ArrowLeft') keys.a = 1;
        if (code === 'KeyD' || e.key === 'ArrowRight') keys.d = 1;
        if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
    });

    window.addEventListener('keyup', e => {
        let code = e.code;
        if (code === 'KeyW' || e.key === 'ArrowUp') keys.w = 0;
        if (code === 'KeyS' || e.key === 'ArrowDown') keys.s = 0;
        if (code === 'KeyA' || e.key === 'ArrowLeft') keys.a = 0;
        if (code === 'KeyD' || e.key === 'ArrowRight') keys.d = 0;
        if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
    });

    window.addEventListener('mousemove', e => { mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1; mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1; });
    window.addEventListener('mousedown', () => keys.lkm = true); window.addEventListener('mouseup', () => keys.lkm = false);
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    const Mats = {
        skin: new THREE.MeshStandardMaterial({ color: 0xffd3b6, roughness: 0.6 }),
        cloth: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 }), 
        hair: new THREE.MeshStandardMaterial({ color: 0xdc2626 }), 
        mob: new THREE.MeshStandardMaterial({ color: 0x1a2e1a, roughness: 0.9 }),
        resWood: new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }),
        resMetal: new THREE.MeshStandardMaterial({ color: 0xa1a1aa, metalness: 0.8, roughness: 0.3 }),
        resOre: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 1.0, flatShading: true }),
        resCloth: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.9 }),
        ruins: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }),
        groundCity: new THREE.MeshStandardMaterial({ color: 0x1e2229, roughness: 0.8 }),
        groundForest: new THREE.MeshStandardMaterial({ color: 0x0a120c, roughness: 1.0 })
    };

    const Models = {
        buildAlexa() {
            const root = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 8), Mats.cloth); torso.position.y = 2.2; torso.castShadow = true; root.add(torso);
            const backpack = new THREE.Group(); const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), new THREE.MeshStandardMaterial({color: 0x1e293b})); packBody.position.set(0, 0, -0.6); backpack.add(packBody); 
            const neon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.55), new THREE.MeshBasicMaterial({color: 0x00e5ff})); neon.position.set(0, 0.3, -0.6); backpack.add(neon); 
            const flashLight = new THREE.PointLight(0x00e5ff, 0, 30); flashLight.position.set(0, 0.5, -0.8); backpack.add(flashLight); torso.add(backpack);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), Mats.skin); head.position.y = 1.5; head.castShadow = true; torso.add(head);
            const hair = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 10, 0, Math.PI*2, 0, Math.PI/1.8), Mats.hair); hair.position.y = 0.1; head.add(hair);
            const shR = new THREE.Group(); shR.position.set(0.9, 0.7, 0); torso.add(shR); const shL = new THREE.Group(); shL.position.set(-0.9, 0.7, 0); torso.add(shL); 
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.6, 6), Mats.skin); arm.position.y = -0.8; arm.castShadow = true; shR.add(arm); shL.add(arm.clone()); 
            const anc = new THREE.Group(); anc.position.y = -0.8; shR.add(anc);
            const hipR = new THREE.Group(); hipR.position.set(0.3, -1.1, 0); torso.add(hipR); const hipL = new THREE.Group(); hipL.position.set(-0.3, -1.1, 0); torso.add(hipL); 
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 1.6, 6), Mats.cloth); leg.position.y = -0.8; leg.castShadow = true; hipR.add(leg); hipL.add(leg.clone());
            scene.add(root); return { root, torso, sr: shR, sl: shL, lr: hipR, ll: hipL, anc, neon, flashLight };
        },
        buildWeapon(wId) {
            const grp = new THREE.Group(); grp.rotation.x = Math.PI / 2; grp.position.z = 0.8; const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0), Mats.resWood); grp.add(hilt);
            if (wId === 'pipe') { let b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8), Mats.resMetal); b.position.y = 0.4; grp.add(b); }
            else if (wId === 'bat') { let b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.5), Mats.resWood); b.position.y = 0.7; grp.add(b); }
            else if (wId === 'knife') { let b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.2), Mats.resMetal); b.position.y = 0.8; grp.add(b); } 
            else if (wId === 'axe') { hilt.scale.set(1, 2, 1); let b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.1), Mats.resMetal); b.position.set(0.2, 1.0, 0); grp.add(b); } 
            else if (wId === 'machete') { let b = new Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.3), Mats.resMetal); b.position.y=1.2; grp.add(b); }
            else if (wId === 'spear') { hilt.scale.set(1, 3.5, 1); let b = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 4), Mats.resMetal); b.position.y = 2.2; grp.add(b); }
            else if (wId === 'katana') { let b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.0, 0.15), Mats.resMetal); b.position.y=1.8; grp.add(b); }
            return grp;
        },
        equipWeapon(wId, anchor) { anchor.clear(); if(wId !== 'hands') { let mesh = this.buildWeapon(wId); anchor.add(mesh); } },
        buildResource(type) {
            let m;
            if(type === 'wood') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.0, 6), Mats.resWood); m.rotation.z = Math.PI/2; m.position.y = 0.3; } 
            else if(type === 'metal') { m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.5), Mats.resMetal); m.position.y = 0.05; m.rotation.y = Math.random(); } 
            else if(type === 'ore') { m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), Mats.resOre); m.position.y = 0.5; } 
            else if(type === 'cloth') { m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.8), Mats.resCloth); m.position.y = 0.15; }
            m.castShadow = true; return m;
        },
        buildMob(type) {
            const root = new THREE.Group();
            if (type === 'dog') { 
                let t = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 2.0), Mats.mob); t.position.y = 1.0; t.castShadow=true; root.add(t); let h = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), Mats.mob); h.position.set(0, 1.4, 1.2); root.add(h); scene.add(root); return { root, torso: t, sr: root, sl: root, lr: root, ll: root }; 
            } else { 
                let t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.8), Mats.mob); t.position.y = 2.0; t.castShadow=true; root.add(t); 
                let eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.1), new THREE.MeshBasicMaterial({color:0xff0000})); eye.position.set(0, 0.6, 0.41); t.add(eye);
                let sr = new THREE.Group(); sr.position.set(0.8, 0.6, 0); t.add(sr); let sl = new THREE.Group(); sl.position.set(-0.8, 0.6, 0); t.add(sl); let arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), Mats.mob); arm.position.y=-0.8; sr.add(arm); sl.add(arm.clone()); 
                let lr = new THREE.Group(); lr.position.set(0.3, -1.0, 0); t.add(lr); let ll = new THREE.Group(); ll.position.set(-0.3, -1.0, 0); t.add(ll); let leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), Mats.mob); leg.position.y=-0.8; lr.add(leg); ll.add(leg.clone()); scene.add(root); return { root, torso: t, sr, sl, lr, ll }; 
            }
        }
    };

    function spawnVFX(x, y, z, colorHex, count) {
        for(let i=0; i<count; i++) {
            let p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({color: colorHex}));
            p.position.set(x, y, z); scene.add(p);
            Particles.push({mesh: p, vx: (Math.random()-0.5)*15, vy: Math.random()*10+5, vz: (Math.random()-0.5)*15, life: 1.0});
        }
    }

    class Entity { 
        constructor(x, z, r) { this.x = x; this.z = z; this.rad = r; this.vx = 0; this.vz = 0; } 
        push(fx, fz) { this.vx += fx; this.vz += fz; } 
        applyKnockback(dt) { this.x += this.vx * dt; this.z += this.vz * dt; this.vx *= Math.pow(0.0001, dt); this.vz *= Math.pow(0.0001, dt); } 
    }

    class PlayerHero extends Entity {
        constructor() { super(0, 5, 1.0); this.rig = Models.buildAlexa(); this.wT = 0; this.atkCD = 0; this.iframe = 0; }
        update(dt) {
            if (STATE.isDead || STATE.isDialog || STATE.isInvOpen || STATE.isQuestOpen) return;
            let dx = keys.d - keys.a; let dz = keys.s - keys.w; 
            let speed = (keys.shift && STATE.stam > 0) ? 9.0 : 4.5; 
            
            if (keys.shift && STATE.stam > 0 && (dx !== 0 || dz !== 0)) { STATE.stam -= dt * 25; } else if (!keys.shift && STATE.stam < 100) { STATE.stam += dt * 15; }
            if (STATE.stam < 0) STATE.stam = 0;

            if (dx !== 0 || dz !== 0) { 
                let len = Math.hypot(dx, dz); this.x += (dx / len) * speed * dt; this.z += (dz / len) * speed * dt;
                if (this.atkCD <= 0) this.rig.root.rotation.y = Math.atan2(dx, dz); 
                this.wT += dt * (keys.shift ? 15 : 8); this.rig.ll.rotation.x = Math.sin(this.wT) * 1.0; this.rig.lr.rotation.x = -Math.sin(this.wT) * 1.0; 
            } else { this.rig.ll.rotation.x *= Math.pow(0.01, dt); this.rig.lr.rotation.x *= Math.pow(0.01, dt); this.wT = 0; }
            
            this.applyKnockback(dt); GameWorld.resolveWalls(this); this.rig.root.position.set(this.x, 0, this.z);
            if (this.iframe > 0) this.iframe -= dt; 
            if (this.atkCD > 0) { this.atkCD -= dt; this.rig.sr.rotation.x = -2.0 * (this.atkCD / 0.5); } else { this.rig.sr.rotation.x = (dx !== 0 || dz !== 0) ? -Math.sin(this.wT)*0.5 : 0; }
            
            if (keys.lkm && this.atkCD <= 0) {
                this.atkCD = 0.5; AudioSys.swing(); 
                let aimA = Math.atan2(aimPoint.x - this.x, aimPoint.z - this.z); 
                this.rig.root.rotation.y = aimA; this.push(Math.sin(aimA)*15, Math.cos(aimA)*15); 
                let closeMobs = Mobs.filter(m => Math.abs(m.x - this.x) < 10 && Math.abs(m.z - this.z) < 10);
                closeMobs.forEach(m => { 
                    if (MathU.dist(this, m) < 5.0) { 
                        let diff = Math.abs(Math.atan2(m.x - this.x, m.z - this.z) - aimA); if (diff > Math.PI) diff = 2 * Math.PI - diff; 
                        if (diff < 1.2) { m.hp -= STATE.wDmg; m.stun = 0.4; m.push(Math.sin(aimA) * 30, Math.cos(aimA) * 30); AudioSys.hit(); spawnVFX(m.x, 1.5, m.z, 0xdc2626, 6); } 
                    } 
                });
            }
        }
    }

    class MobActor extends Entity {
        constructor(x, z, type) { 
            super(x, z, 1.2); this.type = type; this.hp = type === 'dog' ? 30 : 60; this.sp = type === 'dog' ? 5.5 : 3.0; 
            this.rig = Models.buildMob(type); this.rig.root.position.set(x, 0, z); this.stun = 0; this.rest = 0; this.wT = Math.random()*10; 
        }
        update(dt) {
            if (this.stun > 0) { this.stun -= dt; this.rig.torso.material.color.setHex(0xdc2626); this.applyKnockback(dt); GameWorld.resolveWalls(this); this.rig.root.position.set(this.x, 0, this.z); return; } 
            else { this.rig.torso.material.color.setHex(this.type === 'dog' ? 0x1a2e1a : 0x2d1a1a); }
            
            if (this.rest > 0) this.rest -= dt;
            let dist = MathU.dist(this, GameWorld.player);
            let aggroRad = (STATE.timeOfDay > 20 || STATE.timeOfDay < 6) ? 35 : 18; 
            
            if (dist < aggroRad && dist > 2.5 && this.rest <= 0) { 
                let a = Math.atan2(GameWorld.player.x - this.x, GameWorld.player.z - this.z); 
                this.rig.root.rotation.y = a; this.x += Math.sin(a) * this.sp * dt; this.z += Math.cos(a) * this.sp * dt;
                this.wT += dt * 10; this.rig.ll.rotation.x = Math.sin(this.wT); this.rig.lr.rotation.x = -Math.sin(this.wT); 
            } else if (dist <= 2.5 && this.rest <= 0 && GameWorld.player.iframe <= 0) { 
                let rawDmg = 15; let actualDmg = Math.max(2, rawDmg - (STATE.gDef * 0.15)); STATE.hp -= actualDmg; 
                GameWorld.player.iframe = 0.5; this.rest = 1.2; GameWorld.player.push(((GameWorld.player.x - this.x) / dist) * 20, ((GameWorld.player.z - this.z) / dist) * 20); 
                let fx = document.getElementById('dmg-fx'); if(fx) { fx.style.boxShadow='inset 0 0 150px rgba(239,68,68,0.8)'; setTimeout(()=>fx.style.boxShadow='none', 150); spawnVFX(GameWorld.player.x, 1.5, GameWorld.player.z, 0xdc2626, 6); } 
            } else { this.rig.ll.rotation.x *= Math.pow(0.01, dt); this.rig.lr.rotation.x *= Math.pow(0.01, dt); }
            this.applyKnockback(dt); GameWorld.resolveWalls(this); this.rig.root.position.set(this.x, 0, this.z);
        }
    }

    const WorldGen = {
        chunkSize: 100, active: new Set(),
        update(px, pz) {
            let cx = Math.floor(px / this.chunkSize); let cz = Math.floor(pz / this.chunkSize);
            for(let x = cx - 1; x <= cx + 1; x++) {
                for(let z = cz - 1; z <= cz + 1; z++) {
                    let key = `${x}_${z}`;
                    if(!this.active.has(key)) { this.generate(x, z); this.active.add(key); }
                }
            }
        },
        generate(cx, cz) {
            let dist = Math.hypot(cx, cz); let isCity = dist < 2; 
            let plane = new THREE.Mesh(new THREE.PlaneGeometry(this.chunkSize, this.chunkSize), isCity ? Mats.groundCity : Mats.groundForest);
            plane.rotation.x = -Math.PI / 2; plane.position.set(cx * this.chunkSize + this.chunkSize/2, -0.1, cz * this.chunkSize + this.chunkSize/2);
            scene.add(plane);

            let obsCount = isCity ? 8 : 12;
            for(let i=0; i<obsCount; i++) {
                let lx = cx * this.chunkSize + Math.random() * this.chunkSize; let lz = cz * this.chunkSize + Math.random() * this.chunkSize;
                if (cx === 0 && cz === 0 && Math.hypot(lx-8, lz+8) < 15) continue; 
                let mesh, rad;
                if(isCity) { mesh = new THREE.Mesh(new THREE.BoxGeometry(4, Math.random()*8+2, 4), Mats.ruins); mesh.position.y = mesh.geometry.parameters.height/2; rad = 2.5; } 
                else {
                    let isTree = Math.random() > 0.3; let grp = new THREE.Group(); 
                    if(isTree) { let log = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 5, 5), Mats.resWood); log.position.y = 2.5; grp.add(log); let leaves = new THREE.Mesh(new THREE.ConeGeometry(3.5, 8, 5), new THREE.MeshStandardMaterial({color:0x0b2413, flatShading:true})); leaves.position.y = 8; grp.add(leaves); rad = 1.2;} 
                    else { let rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2, 0), Mats.ruins); rock.position.y = 1; grp.add(rock); rad = 2.0;} mesh = grp;
                }
                mesh.position.set(lx, 0, lz); scene.add(mesh); Statics.push({ x: lx, z: lz, rad: rad });
            }

            for(let i=0; i<6; i++) {
                let lx = cx * this.chunkSize + Math.random() * this.chunkSize; let lz = cz * this.chunkSize + Math.random() * this.chunkSize;
                let type = ['wood', 'ore', 'metal', 'cloth'][Math.floor(Math.random() * 4)];
                let m = Models.buildResource(type); m.position.set(lx, m.position.y, lz); scene.add(m); 
                Loots.push({ x: lx, z: lz, type: type, mesh: m, active: true });
            }

            if(cx !== 0 || cz !== 0) { 
                for(let i=0; i<4; i++) {
                    let lx = cx * this.chunkSize + Math.random() * this.chunkSize; let lz = cz * this.chunkSize + Math.random() * this.chunkSize;
                    Mobs.push(new MobActor(lx, lz, Math.random() > 0.6 ? 'dog' : 'humanoid'));
                }
            }
        }
    };

    const GameWorld = {
        player: null,
        init() {
            this.player = new PlayerHero(); 
            Models.equipWeapon('hands', this.player.rig.anc);
            WorldGen.update(this.player.x, this.player.z);
            Quests.init(); 
        },
        resolveWalls(obj) { 
            let closeStatics = Statics.filter(s => Math.abs(s.x - obj.x) < 15 && Math.abs(s.z - obj.z) < 15);
            closeStatics.forEach(s => { 
                let d = MathU.dist(obj, s); let lim = obj.rad + s.rad; 
                if (d < lim) { let overlap = lim - d; obj.x += ((obj.x - s.x) / d) * overlap; obj.z += ((obj.z - s.z) / d) * overlap; } 
            }); 
        },
        resolveOverlaps() { 
            let closeMobs = Mobs.filter(m => Math.abs(m.x - this.player.x) < 20 && Math.abs(m.z - this.player.z) < 20);
            let entities = [this.player, ...closeMobs]; 
            for (let i = 0; i < entities.length; i++) { 
                for (let j = i + 1; j < entities.length; j++) { 
                    let a = entities[i], b = entities[j]; let d = MathU.dist(a, b); let lim = a.rad + b.rad; 
                    if (d < lim) { let overlap = (lim - d) / 2; a.x += ((a.x - b.x) / d) * overlap; a.z += ((a.z - b.z) / d) * overlap; b.x -= ((a.x - b.x) / d) * overlap; b.z -= ((a.z - b.z) / d) * overlap; } 
                } 
            } 
        },
        respawn() { 
            STATE.hp = STATE.maxHp; STATE.xp = 0; STATE.isDead = false; STATE.timeOfDay = 12; this.player.x = 0; this.player.z = 5; 
            document.getElementById('dead-screen').style.display = 'none'; 
            WorldGen.update(0,0);
        }
    };

    const UI = {
        toggleInv() { 
            if (STATE.isDead || STATE.isDialog || STATE.isQuestOpen) return; 
            STATE.isInvOpen = !STATE.isInvOpen; 
            document.getElementById('inventory-screen').style.display = STATE.isInvOpen ? 'flex' : 'none'; 
            if (STATE.isInvOpen) { keys.w = keys.s = keys.a = keys.d = 0; keys.lkm = false; this.renderUI(); AudioSys.craft(); } 
        },
        toggleQuest() {
            if (STATE.isDead || STATE.isDialog || STATE.isInvOpen) return; 
            STATE.isQuestOpen = !STATE.isQuestOpen; 
            document.getElementById('quest-screen').style.display = STATE.isQuestOpen ? 'flex' : 'none'; 
            if (STATE.isQuestOpen) { keys.w = keys.s = keys.a = keys.d = 0; keys.lkm = false; this.renderQuestJournal(); AudioSys.craft(); }
        },
        renderQuestJournal() {
            let listHTML = '';
            QUESTS.forEach((q, idx) => {
                if (idx > STATE.questStep) return; // Не показываем будущие
                let sClass = ''; let sTxt = '';
                if (q.status === 'completed') { sClass = 'completed'; sTxt = 'ВЫПОЛНЕНО'; }
                else if (q.status === 'active') { sClass = 'active'; sTxt = 'ТЕКУЩАЯ'; }
                else if (q.status === 'cancelled') { sTxt = 'ОТМЕНЕНО'; }
                
                listHTML += `
                <div class="ql-card ${sClass}" onclick="window.UI.showQuestDetails(${idx})">
                    <div class="ql-title">${q.title}</div>
                    <div class="ql-status">${sTxt}</div>
                </div>`;
            });
            document.getElementById('ql-list').innerHTML = listHTML;
            this.showQuestDetails(STATE.questStep); // Показываем текущий по умолчанию
        },
        showQuestDetails(idx) {
            let q = QUESTS[idx];
            if(!q) return;
            
            let btnHTML = '';
            if (q.status === 'active') {
                btnHTML = `<button class="btn btn-danger" onclick="window.UI.cancelQuest(${idx})">ОТМЕНИТЬ ЗАДАЧУ</button>`;
            }

            document.getElementById('ql-details').innerHTML = `
                <div style="font-family:'Press Start 2P'; font-size:14px; color:#facc15; margin-bottom:15px; line-height:1.4;">${q.title}</div>
                <div style="font-size:10px; color:#00e5ff; margin-bottom:15px;">ЗАКАЗЧИК: ${q.npc}</div>
                <div style="font-size:14px; color:#cbd5e1; line-height:1.6; margin-bottom:20px; text-align:justify;">${q.text}</div>
                <div style="font-size:12px; color:#10b981; font-weight:bold; margin-bottom:30px;">ЦЕЛЬ: ${typeof q.objTxt === 'function' ? q.objTxt() : q.objTxt}</div>
                <div style="display:flex; flex-direction:column; height:100%;">
                    ${btnHTML}
                </div>
            `;
        },
        cancelQuest(idx) {
            QUESTS[idx].status = 'cancelled';
            AudioSys.hit();
            this.renderQuestJournal();
        },
        renderUI() { 
            RES.wood = STATE.invItems.filter(i => i === 'wood').length; RES.metal = STATE.invItems.filter(i => i === 'metal').length;
            RES.ore = STATE.invItems.filter(i => i === 'ore').length; RES.cloth = STATE.invItems.filter(i => i === 'cloth').length;
            ['wood', 'metal', 'ore', 'cloth'].forEach(r => document.getElementById(`res-${r}`).innerText = RES[r]);
            
            let cList = document.getElementById('craft-list'); cList.innerHTML = ''; 
            Object.values(DB.weapons).forEach(w => { 
                if(w.id === 'hands') return; let canCraft = true; let reqStr = ''; 
                for (let k in w.req) { if (RES[k] < w.req[k]) canCraft = false; reqStr += `${k==='wood'?'🪵':k==='metal'?'🔩':k==='ore'?'💎':'🕸️'} ${w.req[k]} `; } 
                cList.innerHTML += `<div class="craft-card" onclick="window.UI.tryCraft('${w.id}', 'weapon', ${canCraft})"> <div style="font-size:20px; margin-right:10px;">${w.icon}</div> <div style="text-align:left; flex:1;"> <div style="font-family:'Russo One'; font-size:10px; color:#fff;">${w.title}</div> <div style="font-size:9px; color:#10b981; margin-top:4px;">УРОН: ${w.dmg} | ${reqStr}</div> </div> </div>`; 
            }); 
            Object.values(DB.gear).forEach(g => { 
                if(g.id === 'rags') return; let canCraft = true; let reqStr = ''; 
                for (let k in g.req) { if (RES[k] < g.req[k]) canCraft = false; reqStr += `${k==='wood'?'🪵':k==='metal'?'🔩':k==='ore'?'💎':'🕸️'} ${g.req[k]} `; } 
                cList.innerHTML += `<div class="craft-card" onclick="window.UI.tryCraft('${g.id}', 'gear', ${canCraft})"> <div style="font-size:20px; margin-right:10px;">${g.icon}</div> <div style="text-align:left; flex:1;"> <div style="font-family:'Russo One'; font-size:10px; color:#fff;">${g.title}</div> <div style="font-size:9px; color:#3b82f6; margin-top:4px;">ЗАЩИТА: ${g.def} | ${reqStr}</div> </div> </div>`; 
            }); 

            let bpGrid = document.getElementById('backpack-grid'); bpGrid.innerHTML = '';
            STATE.invItems.forEach((itemId, idx) => {
                let item = DB.weapons[itemId] || DB.gear[itemId] || DB.resources[itemId];
                if(item) { bpGrid.innerHTML += `<div class="inv-item" draggable="true" ondragstart="window.UI.dragStart(event, '${itemId}', ${idx})"> <span class="item-icon">${item.icon}</span> <span class="item-title">${item.title}</span> </div>`; }
            });

            let wSlot = document.getElementById('slot-weapon'); let wItem = DB.weapons[STATE.wId];
            wSlot.className = STATE.wId === 'hands' ? 'equip-slot' : 'equip-slot filled';
            wSlot.innerHTML = `<div class="slot-label">В РУКАХ</div> <span style="font-size:24px; margin-right:10px;">${wItem.icon}</span> <div style="font-size:10px; font-family:'Russo One';">${wItem.title}<br><span style="color:#10b981">УРОН: ${wItem.dmg}</span></div>`;

            let gSlot = document.getElementById('slot-gear'); let gItem = DB.gear[STATE.gId];
            gSlot.className = STATE.gId === 'rags' ? 'equip-slot' : 'equip-slot filled';
            gSlot.innerHTML = `<div class="slot-label">НА ТЕЛЕ</div> <span style="font-size:24px; margin-right:10px;">${gItem.icon}</span> <div style="font-size:10px; font-family:'Russo One';">${gItem.title}<br><span style="color:#3b82f6">ЗАЩИТА: ${gItem.def}</span></div>`;
        },
        tryCraft(id, type, can) { 
            if (can) { 
                let item = type === 'weapon' ? DB.weapons[id] : DB.gear[id];
                for (let k in item.req) { for(let i = 0; i < item.req[k]; i++) { let idx = STATE.invItems.indexOf(k); if(idx > -1) STATE.invItems.splice(idx, 1); } } 
                STATE.invItems.push(id); AudioSys.pickup(); this.renderUI(); 
            } 
        },
        dragStart(ev, id, index) { ev.dataTransfer.setData("id", id); ev.dataTransfer.setData("index", index); },
        allowDrop(ev) { ev.preventDefault(); },
        dropEquip(ev, slotType) {
            ev.preventDefault(); let id = ev.dataTransfer.getData("id"); let index = ev.dataTransfer.getData("index");
            let itemW = DB.weapons[id]; let itemG = DB.gear[id];
            if (slotType === 'weapon' && itemW) {
                STATE.invItems.splice(index, 1); if (STATE.wId !== 'hands') STATE.invItems.push(STATE.wId); 
                STATE.wId = id; STATE.wDmg = itemW.dmg; Models.equipWeapon(id, GameWorld.player.rig.anc); AudioSys.equip();
            } else if (slotType === 'gear' && itemG) {
                STATE.invItems.splice(index, 1); if (STATE.gId !== 'rags') STATE.invItems.push(STATE.gId); 
                STATE.gId = id; STATE.gDef = itemG.def; Mats.cloth.color.setHex(itemG.color); AudioSys.equip();
            }
            this.renderUI();
        },
        dropTrash(ev) { ev.preventDefault(); let index = ev.dataTransfer.getData("index"); STATE.invItems.splice(index, 1); AudioSys.hit(); this.renderUI(); },

        tryInteract() {
            let closeLoots = Loots.filter(l => l.active && Math.abs(l.x - GameWorld.player.x) < 10 && Math.abs(l.z - GameWorld.player.z) < 10);
            let tL = null; closeLoots.forEach(l => { if (MathU.dist(GameWorld.player, l) < 4.0) tL = l; }); 
            let tN = null; Npcs.forEach(n => { if (n.active && MathU.dist(GameWorld.player, n) < 5.0) tN = n; }); 
            
            if (tN) { Quests.interact(); } 
            else if (tL) { tL.active = false; scene.remove(tL.mesh); STATE.invItems.push(tL.type); STATE.xp += 5; spawnVFX(tL.x, 1.5, tL.z, 0x3b82f6, 12); AudioSys.pickup(); } 
        },
        updateTooltips() {
            let tL = null; Loots.filter(l=>l.active && Math.abs(l.x - GameWorld.player.x) < 10).forEach(l => { if (MathU.dist(GameWorld.player, l) < 4.0) tL = l; }); 
            let tN = null; Npcs.forEach(n => { if (n.active && MathU.dist(GameWorld.player, n) < 5.0) tN = n; }); 
            let tip = document.getElementById('action-tip'); 
            if (!STATE.isInvOpen && !STATE.isDialog && !STATE.isDead && !STATE.isQuestOpen) { 
                if (tN) { tip.style.display = 'block'; tip.innerText = '[ E ] ГОВОРИТЬ'; } 
                else if (tL) { tip.style.display = 'block'; tip.innerText = '[ E ] СОБРАТЬ'; } 
                else { tip.style.display = 'none'; }
            } else { tip.style.display = 'none'; }
        },
        updateHUD() { 
            document.getElementById('ui-hp-val').innerText = `${Math.floor(STATE.hp)} / ${STATE.maxHp}`; document.getElementById('bar-hp').style.width = (STATE.hp / STATE.maxHp) * 100 + '%'; 
            document.getElementById('bar-st').style.width = STATE.stam + '%'; 
            document.getElementById('ui-dmg').innerText = `УРОН: ${STATE.wDmg}`; document.getElementById('ui-def').innerText = `ЗАЩИТА: ${STATE.gDef}`;

            // ДИНАМИЧЕСКИЙ ЖУРНАЛ КВЕСТОВ В HUD
            let actQ = QUESTS[STATE.questStep];
            if (actQ && actQ.status === 'active') {
                document.getElementById('hud-quest-box').style.display = 'block';
                document.getElementById('q-txt').innerText = typeof actQ.objTxt === 'function' ? actQ.objTxt() : actQ.objTxt;
            } else { document.getElementById('hud-quest-box').style.display = 'none'; }

            if (STATE.xp >= STATE.lvl * 100) { STATE.xp -= STATE.lvl * 100; STATE.lvl++; STATE.maxHp += 20; STATE.hp = STATE.maxHp; spawnVFX(GameWorld.player.x, 1, GameWorld.player.z, 0xfacc15, 30); AudioSys.craft(); } 
            document.getElementById('ui-xp-val').innerText = `${STATE.xp} / ${STATE.lvl * 100}`; document.getElementById('bar-xp').style.width = (STATE.xp / (STATE.lvl * 100)) * 100 + '%'; document.getElementById('ui-lvl').innerText = `УР. ${STATE.lvl}`; 
            
            let hh = Math.floor(STATE.timeOfDay); let mm = Math.floor((STATE.timeOfDay - hh) * 60); document.getElementById('time-display').innerText = `ВРЕМЯ ${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`;
            if (STATE.hp <= 0 && !STATE.isDead) { STATE.hp = 0; STATE.isDead = true; document.getElementById('dead-screen').style.display = 'flex'; keys.lkm = false; } 
            
            if (radarCtx && GameWorld.player) { 
                let px = GameWorld.player.x, pz = GameWorld.player.z; radarCtx.clearRect(0, 0, 160, 160); radarCtx.save(); radarCtx.translate(80, 80); 
                Statics.filter(s=>Math.abs(s.x-px)<60 && Math.abs(s.z-pz)<60).forEach(s => { radarCtx.fillStyle = '#334155'; radarCtx.beginPath(); radarCtx.arc((s.x - px) / 4, (s.z - pz) / 4, 2, 0, 7); radarCtx.fill(); }); 
                Loots.filter(l=>l.active && Math.abs(l.x-px)<60).forEach(l => { radarCtx.fillStyle = '#3b82f6'; radarCtx.beginPath(); radarCtx.arc((l.x - px) / 4, (l.z - pz) / 4, 2, 0, 7); radarCtx.fill(); }); 
                Npcs.forEach(n => { radarCtx.fillStyle = '#facc15'; radarCtx.beginPath(); radarCtx.arc((n.x - px) / 4, (n.z - pz) / 4, 3, 0, 7); radarCtx.fill(); }); 
                Mobs.filter(m=>Math.abs(m.x-px)<60).forEach(m => { radarCtx.fillStyle = '#ef4444'; radarCtx.beginPath(); radarCtx.arc((m.x - px) / 4, (m.z - pz) / 4, 2, 0, 7); radarCtx.fill(); }); 
                radarCtx.fillStyle = '#ffffff'; radarCtx.beginPath(); radarCtx.arc(0, 0, 3, 0, 7); radarCtx.fill(); radarCtx.strokeStyle = 'rgba(255,255,255,0.3)'; radarCtx.lineWidth = 2; radarCtx.moveTo(0, 0); radarCtx.lineTo(Math.sin(GameWorld.player.rig.root.rotation.y) * 10, Math.cos(GameWorld.player.rig.root.rotation.y) * 10); radarCtx.stroke(); radarCtx.restore(); 
            } 
        }
    };

    window.UI = UI; 

    document.getElementById('btn-inv').onclick = () => window.UI.toggleInv();
    document.getElementById('btn-quest').onclick = () => window.UI.toggleQuest();
    document.getElementById('btn-close-inv').onclick = () => window.UI.toggleInv();
    document.getElementById('btn-close-quest').onclick = () => window.UI.toggleQuest();
    document.getElementById('btn-respawn').onclick = () => GameWorld.respawn();
    document.getElementById('btn-next-dialog').onclick = () => { document.getElementById('dialog-window').style.display = 'none'; STATE.isDialog = false; };

    GameWorld.init();

    function MainGameLoop() {
        requestAnimationFrame(MainGameLoop);
        let dt = MathU.clamp(clock.getDelta(), 0.005, 0.05);

        STATE.timeOfDay += dt * 0.015; if (STATE.timeOfDay >= 24) STATE.timeOfDay = 0;
        let cycle = Math.sin((STATE.timeOfDay / 24) * Math.PI); let isNight = cycle < 0.2;
        dirLight.intensity = Math.max(0.05, cycle * 1.5); ambientLight.intensity = Math.max(0.1, cycle * 0.5);
        
        if (isNight) { scene.fog.color.setHex(0x020305); scene.background.setHex(0x020305); GameWorld.player.rig.flashLight.intensity = 1.0; } 
        else { scene.fog.color.setHex(0x1a2530); scene.background.setHex(0x1a2530); GameWorld.player.rig.flashLight.intensity = 0; }

        raycaster.setFromCamera(mouseVec, camera); raycaster.ray.intersectPlane(floorPlane, aimPoint);

        if (!STATE.isInvOpen && !STATE.isDialog && !STATE.isQuestOpen && !STATE.isDead) {
            GameWorld.player.update(dt);
            WorldGen.update(GameWorld.player.x, GameWorld.player.z); 
            
            for (let i = Mobs.length - 1; i >= 0; i--) { 
                let m = Mobs[i]; 
                if (MathU.dist(GameWorld.player, m) > 200) { scene.remove(m.rig.root); Mobs.splice(i, 1); continue; } 
                if (m.hp <= 0) { scene.remove(m.rig.root); Mobs.splice(i, 1); STATE.xp += 10; STATE.kills++; continue; } 
                m.update(dt); 
            }
            GameWorld.resolveOverlaps(); window.UI.updateTooltips();
        }

        for (let i = Particles.length - 1; i >= 0; i--) {
            let p = Particles[i]; p.life -= dt * 1.5; p.vy -= dt * 20; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.mesh.scale.setScalar(Math.max(0, p.life));
            if (p.life <= 0 || p.mesh.position.y < -1) { scene.remove(p.mesh); Particles.splice(i, 1); }
        }

        window.UI.updateHUD();

        if (GameWorld.player && GameWorld.player.rig) {
            camera.position.x += (GameWorld.player.x - camera.position.x) * 3.0 * dt;
            camera.position.z += (GameWorld.player.z + 25 - camera.position.z) * 3.0 * dt;
            camera.position.y += (22 - camera.position.y) * 2.0 * dt;
            camera.lookAt(GameWorld.player.rig.root.position);
        }

        renderer.render(scene, camera);
    }
    MainGameLoop();
});