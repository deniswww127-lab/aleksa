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
            let npcGroup = Models.buildAlexa(); npcGroup.torso.material = new THREE.MeshStandardMaterial({color: color, roughness: 0.85, map: Mats.cloth.map, side: THREE.DoubleSide}); Surf.apply(npcGroup.torso.material, 'cloth');
            npcGroup.root.position.set(x, 0, z); scene.add(npcGroup.root);
            this.activeNpc = { x: x, z: z, mesh: npcGroup.root, rig: npcGroup, active: true, name: name };
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
    scene.background = new THREE.Color(0x1a2530); scene.fog = new THREE.Fog(0x1a2530, 28, 165);
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 2200);
    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Кинематографический конвейер: корректное sRGB-пространство + филмик-тонмаппинг (ACES)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    // ===== ПОСТОБРАБОТКА: Bloom + кинематографическая цветокоррекция (с безопасным фолбэком) =====
    let composer = null, bloomPass = null;
    (function setupPost() {
        if (typeof THREE.EffectComposer === 'undefined' || typeof THREE.UnrealBloomPass === 'undefined' ||
            typeof THREE.RenderPass === 'undefined' || typeof THREE.ShaderPass === 'undefined') return;
        try {
            composer = new THREE.EffectComposer(renderer);
            composer.addPass(new THREE.RenderPass(scene, camera));
            // Свечение ярких источников (солнце/звёзды/неон/глаза мутантов)
            bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.55, 0.6);
            composer.addPass(bloomPass);
            // Цветокоррекция: контраст, насыщенность, teal/orange, виньетка, лёгкая аберрация, финальный sRGB
            const GradeShader = {
                uniforms: { tDiffuse: { value: null }, uVig: { value: 0.34 }, uContrast: { value: 1.07 }, uSat: { value: 1.10 }, uAberr: { value: 0.0016 } },
                vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                fragmentShader: [
                    'uniform sampler2D tDiffuse; uniform float uVig, uContrast, uSat, uAberr; varying vec2 vUv;',
                    'void main(){',
                    '  vec2 d = vUv - 0.5;',
                    '  float r = texture2D(tDiffuse, vUv - d * uAberr).r;',          // хроматическая аберрация к краям
                    '  float g = texture2D(tDiffuse, vUv).g;',
                    '  float b = texture2D(tDiffuse, vUv + d * uAberr).b;',
                    '  vec3 c = vec3(r, g, b);',
                    '  c = (c - 0.5) * uContrast + 0.5;',                            // контраст
                    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
                    '  c = mix(vec3(l), c, uSat);',                                  // насыщенность
                    '  c *= mix(vec3(0.95, 1.0, 1.07), vec3(1.07, 1.0, 0.92), clamp(l, 0.0, 1.0));', // холодные тени / тёплые света
                    '  float vig = smoothstep(0.9, 0.32, length(d));',
                    '  c *= mix(1.0, vig, uVig);',                                   // виньетка
                    '  c = clamp(c, 0.0, 1.0);',
                    '  gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);',          // линейное → sRGB (единственная гамма в конце)
                    '}'
                ].join('\n')
            };
            const gradePass = new THREE.ShaderPass(GradeShader); gradePass.renderToScreen = true;
            composer.addPass(gradePass);
            if (composer.setPixelRatio) composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            composer.setSize(window.innerWidth, window.innerHeight);
        } catch (e) { composer = null; if (window.console) console.warn('Постобработка отключена:', e); }
    })();
    const clock = new THREE.Clock();

    // ===== ОСВЕЩЕНИЕ: натуральная полусфера (небо/земля) + направленное солнце =====
    const hemiLight = new THREE.HemisphereLight(0x9fc8f0, 0x40392f, 0.9); scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.4); dirLight.castShadow = true; dirLight.position.set(-40, 80, -30);
    dirLight.shadow.camera.left = -70; dirLight.shadow.camera.right = 70; dirLight.shadow.camera.top = 70; dirLight.shadow.camera.bottom = -70;
    dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 340;
    dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0004; dirLight.shadow.normalBias = 0.04; dirLight.shadow.radius = 3.5;
    scene.add(dirLight); scene.add(dirLight.target);

    // ===== ДИНАМИЧЕСКОЕ НЕБО: градиентный купол + солнце/луна/звёзды, управляется суточным циклом =====
    const Sky = {
        group: null, dome: null, sun: null, moon: null, stars: null,
        sunVec: new THREE.Vector3(), moonVec: new THREE.Vector3(),
        _c0: new THREE.Color(), _c1: new THREE.Color(),
        // Палитра суток: верх/горизонт/низ неба, цвет солнца, свечение, цвета и сила света, туман
        KF: [
            { t:0,  top:0x05070e, mid:0x0a0f18, bot:0x121620, sun:0x223044, sunI:0.0,  hSky:0x18283f, hGround:0x05060a, hI:0.30, dCol:0x3a4a6a, dI:0.16, fog:0x080c14 },
            { t:5,  top:0x12203e, mid:0x3a3450, bot:0x4e3c4c, sun:0x7a5a6a, sunI:0.25, hSky:0x44546e, hGround:0x1a1820, hI:0.45, dCol:0x6a6a8a, dI:0.30, fog:0x3a3450 },
            { t:7,  top:0x2c4d80, mid:0xe98a4c, bot:0xc06848, sun:0xffb060, sunI:1.0,  hSky:0x8aa2c2, hGround:0x4a3a2a, hI:0.72, dCol:0xffb070, dI:1.05, fog:0xe08a52 },
            { t:10, top:0x3a78c0, mid:0x9ec2e2, bot:0xc0d4e4, sun:0xfff0d0, sunI:0.5,  hSky:0x9cc4ee, hGround:0x6a6555, hI:0.88, dCol:0xfff2d8, dI:1.40, fog:0xaac6de },
            { t:13, top:0x2f6cc2, mid:0x8fb8de, bot:0xc6d8e6, sun:0xffffff, sunI:0.4,  hSky:0x9fc8f0, hGround:0x72705e, hI:0.98, dCol:0xffffff, dI:1.50, fog:0xa8c4dc },
            { t:17, top:0x3a68a8, mid:0xc99a68, bot:0xd2a070, sun:0xffd070, sunI:0.75, hSky:0x9ab0c8, hGround:0x5a4a32, hI:0.80, dCol:0xffca73, dI:1.20, fog:0xc99a68 },
            { t:19, top:0x233a66, mid:0xd4683a, bot:0xa83a2e, sun:0xff7a40, sunI:1.0,  hSky:0x6a6a8a, hGround:0x3a2820, hI:0.58, dCol:0xff7a44, dI:0.80, fog:0xc6582f },
            { t:21, top:0x0e1428, mid:0x2a2440, bot:0x382840, sun:0x5a3a52, sunI:0.25, hSky:0x2a3a5a, hGround:0x12101a, hI:0.40, dCol:0x4a4a6a, dI:0.30, fog:0x1e1830 },
            { t:24, top:0x05070e, mid:0x0a0f18, bot:0x121620, sun:0x223044, sunI:0.0,  hSky:0x18283f, hGround:0x05060a, hI:0.30, dCol:0x3a4a6a, dI:0.16, fog:0x080c14 }
        ],
        init() {
            this.group = new THREE.Group(); scene.add(this.group);
            // Купол неба — градиент + халоу солнца, согласованный с тонмаппингом сцены
            const domeMat = new THREE.ShaderMaterial({
                side: THREE.BackSide, depthWrite: false, fog: false,
                uniforms: {
                    topColor: { value: new THREE.Color(0x2f6cc2) }, midColor: { value: new THREE.Color(0x8fb8de) },
                    botColor: { value: new THREE.Color(0xc6d8e6) }, sunColor: { value: new THREE.Color(0xffffff) },
                    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunGlow: { value: 0.4 }
                },
                vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                fragmentShader: `
                    uniform vec3 topColor, midColor, botColor, sunColor, sunDir; uniform float sunGlow; varying vec3 vDir;
                    void main(){
                        vec3 d = normalize(vDir); float h = d.y;
                        vec3 col = (h < 0.0) ? mix(midColor, botColor, clamp(-h*1.6, 0.0, 1.0))
                                             : mix(midColor, topColor, pow(clamp(h, 0.0, 1.0), 0.42));
                        float s = max(dot(d, normalize(sunDir)), 0.0);
                        col += sunColor * (pow(s, 200.0)*0.9 + pow(s, 9.0)*0.30) * (0.25 + sunGlow);
                        gl_FragColor = vec4(col, 1.0);
                        #include <tonemapping_fragment>
                        #include <encodings_fragment>
                    }`
            });
            this.dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), domeMat);
            this.dome.renderOrder = -10; this.group.add(this.dome);

            // Звёздное поле (верхняя полусфера), проявляется ночью
            const N = 1800, pos = new Float32Array(N*3), col = new Float32Array(N*3);
            for (let i=0; i<N; i++) {
                let th = Math.random()*Math.PI*2, ph = Math.acos(Math.random()), r = 560;
                pos[i*3] = r*Math.sin(ph)*Math.cos(th); pos[i*3+1] = r*Math.cos(ph)+15; pos[i*3+2] = r*Math.sin(ph)*Math.sin(th);
                let tnt = Math.random(); let c = tnt<0.15 ? this._c0.setHex(0xaad4ff) : tnt>0.85 ? this._c0.setHex(0xffd9b0) : this._c0.setHex(0xffffff);
                let b = 0.55 + Math.random()*0.45; col[i*3]=c.r*b; col[i*3+1]=c.g*b; col[i*3+2]=c.b*b;
            }
            const sg = new THREE.BufferGeometry();
            sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
            this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size:2.0, sizeAttenuation:false, vertexColors:true, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
            this.stars.renderOrder = -9; this.group.add(this.stars);

            // Солнце (аддитивное свечение) и Луна (мягкий диск)
            this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map:this._glowTex(), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, opacity:0 }));
            this.sun.scale.set(85,85,1); this.sun.renderOrder = -8; this.group.add(this.sun);
            this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map:this._discTex(), transparent:true, depthWrite:false, fog:false, opacity:0 }));
            this.moon.scale.set(52,52,1); this.moon.renderOrder = -8; this.group.add(this.moon);
        },
        _glowTex() {
            const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
            const g = x.createRadialGradient(64,64,0,64,64,64);
            g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.16,'rgba(255,246,224,0.95)');
            g.addColorStop(0.45,'rgba(255,200,150,0.45)'); g.addColorStop(1,'rgba(255,180,120,0)');
            x.fillStyle = g; x.fillRect(0,0,128,128);
            const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
        },
        _discTex() {
            const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
            const g = x.createRadialGradient(58,58,6,64,64,60);
            g.addColorStop(0,'rgba(236,242,255,1)'); g.addColorStop(0.7,'rgba(202,212,232,0.96)');
            g.addColorStop(0.92,'rgba(150,162,190,0.5)'); g.addColorStop(1,'rgba(120,132,165,0)');
            x.fillStyle = g; x.beginPath(); x.arc(64,64,60,0,7); x.fill();
            x.fillStyle = 'rgba(150,160,186,0.45)';
            [[52,50,9],[80,72,12],[60,84,7],[86,54,5]].forEach(m => { x.beginPath(); x.arc(m[0],m[1],m[2],0,7); x.fill(); });
            const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
        },
        _smooth(a, b, v) { let t = MathU.clamp((v-a)/(b-a), 0, 1); return t*t*(3-2*t); },
        _lerpHex(h0, h1, f, out) { this._c0.setHex(h0); this._c1.setHex(h1); return out.lerpColors(this._c0, this._c1, f); },
        update(t, px, pz, dt) {
            const K = this.KF; let i = 0;
            for (; i < K.length-1; i++) { if (t >= K[i].t && t < K[i+1].t) break; }
            const a = K[i], b = K[i+1] || K[i], f = (t - a.t) / ((b.t - a.t) || 1);

            // Положение солнца по дуге (восход ~6ч, зенит ~12ч, закат ~18ч) и луна напротив
            const ang = ((t - 6) / 24) * Math.PI * 2;
            this.sunVec.set(Math.cos(ang), Math.sin(ang), 0.34).normalize();
            this.moonVec.copy(this.sunVec).multiplyScalar(-1);
            const elev = this.sunVec.y;
            const nightF = 1 - this._smooth(-0.04, 0.16, elev);

            // Небо следует за камерой (бесконечный горизонт)
            this.group.position.copy(camera.position);
            this.stars.rotation.y += dt * 0.006;
            this.stars.material.opacity = nightF;

            const u = this.dome.material.uniforms;
            this._lerpHex(a.top, b.top, f, u.topColor.value);
            this._lerpHex(a.mid, b.mid, f, u.midColor.value);
            this._lerpHex(a.bot, b.bot, f, u.botColor.value);
            this._lerpHex(a.sun, b.sun, f, u.sunColor.value);
            u.sunDir.value.copy(this.sunVec);
            u.sunGlow.value = a.sunI + (b.sunI - a.sunI) * f;

            this.sun.position.copy(this.sunVec).multiplyScalar(480);
            this.moon.position.copy(this.moonVec).multiplyScalar(480);
            this.sun.material.opacity = this._smooth(-0.10, 0.05, elev);
            this.sun.material.color.copy(u.sunColor.value);
            this.moon.material.opacity = this._smooth(-0.08, 0.06, -elev) * 0.95;

            hemiLight.color.copy(this._lerpHex(a.hSky, b.hSky, f, this._c1));
            hemiLight.groundColor.copy(this._lerpHex(a.hGround, b.hGround, f, this._c0));
            hemiLight.intensity = a.hI + (b.hI - a.hI) * f;
            ambientLight.intensity = 0.08 + nightF * 0.05;
            dirLight.color.copy(this._lerpHex(a.dCol, b.dCol, f, this._c1));
            dirLight.intensity = a.dI + (b.dI - a.dI) * f;
            const L = elev > -0.04 ? this.sunVec : this.moonVec;
            const ly = Math.max(L.y, 0.22);
            dirLight.position.set(px + L.x * 150, ly * 170 + 25, pz + L.z * 150);
            dirLight.target.position.set(px, 0, pz);

            // Туман и фон — в цвет горизонта, чтобы геометрия растворялась в небе
            this._lerpHex(a.fog, b.fog, f, this._c0);
            scene.fog.color.copy(this._c0);
            if (scene.background) scene.background.copy(this._c0);

            return { isNight: nightF > 0.5, nightF: nightF };
        }
    };
    Sky.init();

    // ===== ПОГОДА: дождь / пыльная буря / пепел — частицы + туман + свет + экранный тинт =====
    function makeSoftDisc() {
        const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
        const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, S, S); return new THREE.CanvasTexture(c);
    }
    const Weather = {
        group: null, rain: null, dust: null, ash: null, tint: null,
        cur: 'clear', label: '☀️ ЯСНО', timer: 0, dur: 30, flash: 0,
        rainLvl: 0, dustLvl: 0, ashLvl: 0, _baseFar: 165,
        cRain: new THREE.Color(0x2a3340), cDust: new THREE.Color(0x6e5230), cAsh: new THREE.Color(0x40342c), _tmp: new THREE.Color(),
        STATES: ['clear', 'clear', 'clear', 'rain', 'rain', 'dust', 'ash'],
        LABELS: { clear: '☀️ ЯСНО', rain: '🌧️ ДОЖДЬ', dust: '🌪️ БУРЯ', ash: '🌫️ ПЕПЕЛ' },
        init() {
            this._baseFar = scene.fog.far;
            this.group = new THREE.Group(); scene.add(this.group);
            const disc = makeSoftDisc();
            // дождь — линии-струи
            const RN = 1200, rg = new THREE.BufferGeometry(), rp = new Float32Array(RN * 6);
            for (let i = 0; i < RN; i++) { const x = (Math.random() - 0.5) * 72, z = (Math.random() - 0.5) * 72, y = Math.random() * 34, o = i * 6; rp[o] = x; rp[o + 1] = y + 0.7; rp[o + 2] = z; rp[o + 3] = x + 0.12; rp[o + 4] = y; rp[o + 5] = z; }
            rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
            this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaebfd6, transparent: true, opacity: 0 })); this.rain.frustumCulled = false; this.rain.visible = false; this.group.add(this.rain);
            // пыль — дрейфующие точки
            const DN = 600, dg = new THREE.BufferGeometry(), dp = new Float32Array(DN * 3);
            for (let i = 0; i < DN; i++) { dp[i * 3] = (Math.random() - 0.5) * 80; dp[i * 3 + 1] = Math.random() * 14; dp[i * 3 + 2] = (Math.random() - 0.5) * 80; }
            dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
            this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.8, map: disc, color: 0x9a7848, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })); this.dust.frustumCulled = false; this.dust.visible = false; this.group.add(this.dust);
            // пепел — медленные хлопья (часть — тлеющие угли)
            const AN = 520, ag = new THREE.BufferGeometry(), ap = new Float32Array(AN * 3), aco = new Float32Array(AN * 3);
            for (let i = 0; i < AN; i++) { ap[i * 3] = (Math.random() - 0.5) * 64; ap[i * 3 + 1] = Math.random() * 28; ap[i * 3 + 2] = (Math.random() - 0.5) * 64; const c = (Math.random() < 0.12) ? new THREE.Color(0xff6a2a) : new THREE.Color(0xb4ab9c); aco[i * 3] = c.r; aco[i * 3 + 1] = c.g; aco[i * 3 + 2] = c.b; }
            ag.setAttribute('position', new THREE.BufferAttribute(ap, 3)); ag.setAttribute('color', new THREE.BufferAttribute(aco, 3));
            this.ash = new THREE.Points(ag, new THREE.PointsMaterial({ size: 0.5, map: disc, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })); this.ash.frustumCulled = false; this.ash.visible = false; this.group.add(this.ash);
            // экранный тинт настроения
            this.tint = document.createElement('div'); this.tint.style.cssText = 'position:absolute;inset:0;z-index:86;pointer-events:none;background:rgba(0,0,0,0);'; document.body.appendChild(this.tint);
        },
        pick() { this.cur = this.STATES[Math.floor(Math.random() * this.STATES.length)]; this.label = this.LABELS[this.cur]; this.dur = 45 + Math.random() * 55; this.timer = 0; },
        update(dt, px, pz) {
            this.timer += dt; if (this.timer > this.dur) this.pick();
            const ease = Math.min(1, dt * 0.5);
            this.rainLvl += ((this.cur === 'rain' ? 1 : 0) - this.rainLvl) * ease;
            this.dustLvl += ((this.cur === 'dust' ? 1 : 0) - this.dustLvl) * ease;
            this.ashLvl += ((this.cur === 'ash' ? 1 : 0) - this.ashLvl) * ease;
            this.group.position.set(px, 0, pz);

            if (this.rainLvl > 0.01) {
                this.rain.visible = true; this.rain.material.opacity = 0.5 * this.rainLvl;
                const arr = this.rain.geometry.attributes.position.array, n = arr.length / 6, sp = 55 * dt, wx = 4 * dt;
                for (let i = 0; i < n; i++) { const o = i * 6; arr[o + 1] -= sp; arr[o + 4] -= sp; arr[o] += wx; arr[o + 3] += wx; if (arr[o + 4] < -2) { const x = (Math.random() - 0.5) * 72, z = (Math.random() - 0.5) * 72, y = 30 + Math.random() * 6; arr[o] = x; arr[o + 1] = y + 0.7; arr[o + 2] = z; arr[o + 3] = x + 0.12; arr[o + 4] = y; arr[o + 5] = z; } }
                this.rain.geometry.attributes.position.needsUpdate = true;
            } else this.rain.visible = false;

            if (this.dustLvl > 0.01) {
                this.dust.visible = true; this.dust.material.opacity = 0.5 * this.dustLvl;
                const arr = this.dust.geometry.attributes.position.array, n = arr.length / 3;
                for (let i = 0; i < n; i++) { const o = i * 3; arr[o] += 14 * dt + Math.sin((arr[o + 1] + this.timer) * 0.5) * 6 * dt; arr[o + 1] += Math.sin(arr[o] * 0.3 + this.timer) * 2 * dt; if (arr[o] > 40) { arr[o] = -40; arr[o + 2] = (Math.random() - 0.5) * 80; arr[o + 1] = Math.random() * 14; } }
                this.dust.geometry.attributes.position.needsUpdate = true;
            } else this.dust.visible = false;

            if (this.ashLvl > 0.01) {
                this.ash.visible = true; this.ash.material.opacity = 0.8 * this.ashLvl;
                const arr = this.ash.geometry.attributes.position.array, n = arr.length / 3, sp = 2.2 * dt;
                for (let i = 0; i < n; i++) { const o = i * 3; arr[o + 1] -= sp; arr[o] += Math.sin((arr[o + 1] + this.timer) * 0.6) * 1.2 * dt; if (arr[o + 1] < -1) { arr[o + 1] = 26 + Math.random() * 4; arr[o] = (Math.random() - 0.5) * 64; arr[o + 2] = (Math.random() - 0.5) * 64; } }
                this.ash.geometry.attributes.position.needsUpdate = true;
            } else this.ash.visible = false;

            if (this.rainLvl > 0.5 && Math.random() < dt * 0.12) this.flash = 0.18;
            if (this.flash > 0) this.flash -= dt;

            // туман гуще, свет тусклее
            const storm = this.rainLvl * 0.35 + this.dustLvl * 0.6 + this.ashLvl * 0.12;
            scene.fog.far = this._baseFar * (1 - storm);
            const dim = 1 - (this.rainLvl * 0.45 + this.dustLvl * 0.3 + this.ashLvl * 0.18);
            dirLight.intensity *= dim; hemiLight.intensity *= (dim * 0.5 + 0.5);

            const w = this.rainLvl + this.dustLvl + this.ashLvl;
            if (w > 0.01) {
                this._tmp.setRGB((this.cRain.r * this.rainLvl + this.cDust.r * this.dustLvl + this.cAsh.r * this.ashLvl) / w,
                                 (this.cRain.g * this.rainLvl + this.cDust.g * this.dustLvl + this.cAsh.g * this.ashLvl) / w,
                                 (this.cRain.b * this.rainLvl + this.cDust.b * this.dustLvl + this.cAsh.b * this.ashLvl) / w);
                const k = Math.min(1, w) * 0.6;
                scene.fog.color.lerp(this._tmp, k); if (scene.background) scene.background.lerp(this._tmp, k);
            }

            let oR = 30 * this.rainLvl + 132 * this.dustLvl + 70 * this.ashLvl;
            let oG = 42 * this.rainLvl + 92 * this.dustLvl + 55 * this.ashLvl;
            let oB = 62 * this.rainLvl + 46 * this.dustLvl + 48 * this.ashLvl;
            let oA = 0.20 * this.rainLvl + 0.26 * this.dustLvl + 0.13 * this.ashLvl;
            if (w > 0.01) { oR /= w; oG /= w; oB /= w; }
            if (this.flash > 0) { oR = 235; oG = 242; oB = 255; oA = Math.max(oA, this.flash * 2.0); }
            this.tint.style.background = 'rgba(' + (oR | 0) + ',' + (oG | 0) + ',' + (oB | 0) + ',' + Math.min(0.5, oA).toFixed(3) + ')';
        }
    };
    Weather.init();

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
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); if (composer) { composer.setSize(window.innerWidth, window.innerHeight); if (bloomPass) bloomPass.setSize(window.innerWidth, window.innerHeight); } });

    // Процедурная тканевая текстура (нити + потёртости) — тонирование цветом брони сохраняется
    function makeFabricTexture() {
        const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
        x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 64; i += 2) { x.fillStyle = (i % 4) ? 'rgba(150,150,150,0.35)' : 'rgba(200,200,200,0.30)'; x.fillRect(i, 0, 1, 64); x.fillRect(0, i, 64, 1); }
        for (let i = 0; i < 700; i++) { const v = Math.random() < 0.5 ? 45 : 235; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.05)'; x.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, 1, 1); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.encoding = THREE.sRGBEncoding; return t;
    }
    const FABRIC = makeFabricTexture();

    // Процедурные текстуры земли по биому: деталь (нити трещин/плит/мха) в яркости, цвет даёт vertex color
    function makeGroundTex(kind) {
        const S = 256, c = document.createElement('canvas'), bc = document.createElement('canvas');
        c.width = c.height = bc.width = bc.height = S;
        const x = c.getContext('2d'), bx = bc.getContext('2d');
        x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, S, S);
        bx.fillStyle = '#808080'; bx.fillRect(0, 0, S, S);
        for (let i = 0; i < 9000; i++) { let v = 150 + (Math.random() * 90 | 0); x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.10)'; x.fillRect(Math.random() * S | 0, Math.random() * S | 0, 1 + (Math.random() * 2 | 0), 1 + (Math.random() * 2 | 0)); }
        if (kind === 'city') {
            const tile = 64; x.strokeStyle = 'rgba(60,60,68,0.85)'; x.lineWidth = 3; bx.strokeStyle = 'rgba(15,15,15,1)'; bx.lineWidth = 5;
            for (let i = 0; i <= S; i += tile) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); bx.beginPath(); bx.moveTo(i, 0); bx.lineTo(i, S); bx.stroke(); bx.beginPath(); bx.moveTo(0, i); bx.lineTo(S, i); bx.stroke(); }
            for (let gy = 0; gy < S; gy += tile) for (let gx = 0; gx < S; gx += tile) { let s = (Math.random() - 0.5) * 2, v = s > 0 ? 235 : 30; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (Math.abs(s) * 0.08) + ')'; x.fillRect(gx + 2, gy + 2, tile - 4, tile - 4); }
        } else {
            for (let i = 0; i < 28; i++) { let px = Math.random() * S, py = Math.random() * S, r = 12 + Math.random() * 42, dark = Math.random() > 0.5; let g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, dark ? 'rgba(80,90,68,0.5)' : 'rgba(175,175,160,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }
        }
        const crack = (ctx, col, w, n) => { ctx.strokeStyle = col; ctx.lineWidth = w; for (let i = 0; i < n; i++) { ctx.beginPath(); let px = Math.random() * S, py = Math.random() * S; ctx.moveTo(px, py); for (let s = 0; s < 5; s++) { px += (Math.random() - 0.5) * 50; py += (Math.random() - 0.5) * 50; ctx.lineTo(px, py); } ctx.stroke(); } };
        crack(x, 'rgba(35,35,40,0.7)', 1.5, kind === 'city' ? 10 : 6); crack(bx, 'rgba(8,8,8,1)', 2, kind === 'city' ? 10 : 6);
        for (let i = 0; i < 400; i++) { let v = 150 + (Math.random() * 90 | 0); bx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; bx.fillRect(Math.random() * S | 0, Math.random() * S | 0, 2, 2); }
        const rep = kind === 'city' ? 7 : 6;
        const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(rep, rep); map.encoding = THREE.sRGBEncoding;
        const bump = new THREE.CanvasTexture(bc); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(rep, rep);
        return { map: map, bump: bump };
    }
    const GROUND_CITY = makeGroundTex('city'), GROUND_FOREST = makeGroundTex('forest');

    const Mats = {
        skin:   new THREE.MeshStandardMaterial({ color: 0xe7b49a, roughness: 0.72 }),
        cloth:  new THREE.MeshStandardMaterial({ color: 0x2f4a7a, roughness: 0.9, map: FABRIC, bumpMap: FABRIC, bumpScale: 0.012, side: THREE.DoubleSide }),
        hair:   new THREE.MeshStandardMaterial({ color: 0xb6402a, roughness: 0.55 }),
        sleeve: new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.88 }),
        pants:  new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.92 }),
        boots:  new THREE.MeshStandardMaterial({ color: 0x1b1a1e, roughness: 0.55, metalness: 0.15 }),
        strap:  new THREE.MeshStandardMaterial({ color: 0x3a291b, roughness: 0.7 }),
        pad:    new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.45, metalness: 0.3 }),
        glove:  new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.7 }),
        pack:   new THREE.MeshStandardMaterial({ color: 0x3a3730, roughness: 0.9, map: FABRIC, bumpMap: FABRIC, bumpScale: 0.01 }),
        bedroll: new THREE.MeshStandardMaterial({ color: 0x6e5538, roughness: 0.95 }),
        metalDark: new THREE.MeshStandardMaterial({ color: 0x50545d, roughness: 0.4, metalness: 0.7 }),
        neon:   new THREE.MeshStandardMaterial({ color: 0x062a30, emissive: 0x00e5ff, emissiveIntensity: 2.4, roughness: 0.4 }),
        lens:   new THREE.MeshStandardMaterial({ color: 0x10242a, roughness: 0.2, metalness: 0.6, emissive: 0x00343a, emissiveIntensity: 0.7 }),
        mob: new THREE.MeshStandardMaterial({ color: 0x1a2e1a, roughness: 0.9 }),
        mobHide: new THREE.MeshStandardMaterial({ color: 0x232a22, roughness: 0.95 }),
        mobBone: new THREE.MeshStandardMaterial({ color: 0xada58c, roughness: 0.6 }),
        mobEye:  new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 3.0, roughness: 0.4 }),
        resWood: new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }),
        resMetal: new THREE.MeshStandardMaterial({ color: 0xa1a1aa, metalness: 0.8, roughness: 0.3 }),
        resOre: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 1.0, flatShading: true }),
        resCloth: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.9 }),
        ruins: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }),
        groundCity: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97, map: GROUND_CITY.map, bumpMap: GROUND_CITY.bump, bumpScale: 0.35 }),
        groundForest: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1.0, map: GROUND_FOREST.map, bumpMap: GROUND_FOREST.bump, bumpScale: 0.28 }),
        concrete:  new THREE.MeshStandardMaterial({ color: 0x5b5e64, roughness: 0.96 }),
        concreteD: new THREE.MeshStandardMaterial({ color: 0x393c42, roughness: 0.96 }),
        rust:      new THREE.MeshStandardMaterial({ color: 0x6e4128, roughness: 0.82, metalness: 0.25 }),
        rebar:     new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7, metalness: 0.4 }),
        glassD:    new THREE.MeshStandardMaterial({ color: 0x0e151b, roughness: 0.25, metalness: 0.5 }),
        barkDead:  new THREE.MeshStandardMaterial({ color: 0x3f3328, roughness: 0.95 }),
        foliageD:  new THREE.MeshStandardMaterial({ color: 0x2a3a1e, roughness: 1.0, flatShading: true })
    };
    const CARPAINTS = [0x5e3a33, 0x35434f, 0x53492f, 0x6a6a64].map(h => new THREE.MeshStandardMaterial({ color: h, roughness: 0.8, metalness: 0.2 }));

    // ===== ПОВЕРХНОСТИ ПЕРСОНАЖЕЙ: процедурные normal-карты + френель-rim (контровой свет) =====
    function makeHeight(kind) {
        const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
        const base = { skin: 140, fabric: 128, leather: 128, hair: 128, metal: 150, flesh: 120 }[kind] || 128;
        const px = v => 'rgb(' + (v | 0) + ',' + (v | 0) + ',' + (v | 0) + ')';
        x.fillStyle = px(base); x.fillRect(0, 0, S, S);
        if (kind === 'fabric') {
            for (let i = 0; i < S; i += 4) { x.fillStyle = 'rgba(165,165,165,0.5)'; x.fillRect(i, 0, 2, S); x.fillRect(0, i, S, 2); x.fillStyle = 'rgba(85,85,85,0.5)'; x.fillRect(i + 2, 0, 1, S); x.fillRect(0, i + 2, S, 1); }
        } else if (kind === 'leather') {
            for (let i = 0; i < 70; i++) { let rx = Math.random() * S, ry = Math.random() * S, r = 6 + Math.random() * 16, g = x.createRadialGradient(rx, ry, 0, rx, ry, r); g.addColorStop(0, px(Math.random() < 0.5 ? 100 : 160)); g.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = g; x.beginPath(); x.arc(rx, ry, r, 0, 7); x.fill(); }
        } else if (kind === 'hair') {
            for (let i = 0; i < S; i += 2) { x.fillStyle = px(100 + Math.random() * 60); x.fillRect(i, 0, 1, S); }
        } else if (kind === 'metal') {
            for (let y = 0; y < S; y++) { x.fillStyle = px(138 + Math.random() * 30); x.fillRect(0, y, S, 1); }
            for (let i = 0; i < 12; i++) { x.strokeStyle = 'rgba(80,80,80,0.6)'; x.beginPath(); x.moveTo(0, Math.random() * S); x.lineTo(S, Math.random() * S); x.stroke(); }
        } else if (kind === 'flesh') {
            for (let i = 0; i < 55; i++) { let rx = Math.random() * S, ry = Math.random() * S, r = 8 + Math.random() * 24, g = x.createRadialGradient(rx, ry, 0, rx, ry, r); g.addColorStop(0, px(Math.random() < 0.5 ? 95 : 152)); g.addColorStop(1, 'rgba(120,120,120,0)'); x.fillStyle = g; x.beginPath(); x.arc(rx, ry, r, 0, 7); x.fill(); }
        } else {
            for (let i = 0; i < 2600; i++) { let v = Math.random() < 0.5 ? 120 : 162; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.22)'; x.fillRect(Math.random() * S | 0, Math.random() * S | 0, 1, 1); }
        }
        return c;
    }
    function heightToNormal(srcCanvas, strength) {
        const S = srcCanvas.width, src = srcCanvas.getContext('2d').getImageData(0, 0, S, S).data;
        const out = document.createElement('canvas'); out.width = out.height = S; const ox = out.getContext('2d');
        const img = ox.createImageData(S, S), d = img.data;
        const H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
            const len = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
            d[i] = (dx / len * 0.5 + 0.5) * 255; d[i + 1] = (dy / len * 0.5 + 0.5) * 255; d[i + 2] = (1 / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
        }
        ox.putImageData(img, 0, 0);
        const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    }
    const skinN = heightToNormal(makeHeight('skin'), 1.2); skinN.repeat.set(1.5, 1.5);
    const fabricN = heightToNormal(makeHeight('fabric'), 2.4); fabricN.repeat.set(3, 3);
    const leatherN = heightToNormal(makeHeight('leather'), 2.2); leatherN.repeat.set(2, 2);
    const hairN = heightToNormal(makeHeight('hair'), 2.0); hairN.repeat.set(2, 3);
    const metalN = heightToNormal(makeHeight('metal'), 1.8); metalN.repeat.set(2, 2);
    const fleshN = heightToNormal(makeHeight('flesh'), 2.6); fleshN.repeat.set(2, 2);

    const Surf = {
        rim(mat, hex, power, strength) {
            if (mat.userData._rim) return; mat.userData._rim = true;
            const c = new THREE.Color(hex);
            mat.onBeforeCompile = (shader) => {
                shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
                    '#include <emissivemap_fragment>\n\tfloat _rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), ' + power.toFixed(2) + ');\n\ttotalEmissiveRadiance += vec3(' + c.r.toFixed(3) + ', ' + c.g.toFixed(3) + ', ' + c.b.toFixed(3) + ') * _rimF * ' + strength.toFixed(2) + ';');
            };
        },
        apply(mat, kind) {
            const cfg = { skin: [skinN, 0.35], cloth: [fabricN, 0.5], fabric: [fabricN, 0.45], leather: [leatherN, 0.5], hair: [hairN, 0.4], metal: [metalN, 0.4], flesh: [fleshN, 0.55], bone: [null, 0] }[kind] || [null, 0];
            if (cfg[0]) { mat.normalMap = cfg[0]; mat.normalScale = new THREE.Vector2(cfg[1], cfg[1]); }
            this.rim(mat, 0x7aa0c8, 2.6, 0.5); mat.needsUpdate = true;
        }
    };
    [['skin', 'skin'], ['cloth', 'cloth'], ['hair', 'hair'], ['sleeve', 'fabric'], ['pants', 'fabric'], ['boots', 'leather'],
     ['strap', 'leather'], ['pad', 'leather'], ['glove', 'leather'], ['pack', 'cloth'], ['bedroll', 'fabric'],
     ['metalDark', 'metal'], ['mobHide', 'flesh'], ['mobBone', 'bone']].forEach(p => { if (Mats[p[0]]) Surf.apply(Mats[p[0]], p[1]); });

    // Мягкая контактная тень-«пятно» под персонажами (грунтовка силуэта)
    function makeShadowTex() {
        const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
        const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.55, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, S, S);
        return new THREE.CanvasTexture(c);
    }
    const SHADOW_MAT = new THREE.MeshBasicMaterial({ map: makeShadowTex(), transparent: true, depthWrite: false }); SHADOW_MAT.toneMapped = false;
    const SHADOW_GEO = new THREE.PlaneGeometry(2.4, 2.4);

    const Models = {
        buildAlexa() {
            const root = new THREE.Group();
            const M = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; };

            // ===== СКЕЛЕТ: hips (низ тела) и chest (верх, пивот на талии) =====
            const hips = new THREE.Group(); root.add(hips);
            const chest = new THREE.Group(); chest.position.set(0, 2.0, 0); root.add(chest);

            // ===== ТОРС: приталенная куртка (под chest со смещением -2.0 → визуально на месте) =====
            const prof = [[0.30,1.55],[0.47,1.72],[0.33,2.22],[0.49,2.66],[0.43,2.98],[0.30,3.16],[0.20,3.26]].map(p => new THREE.Vector2(p[0], p[1]));
            const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), Mats.cloth);
            torso.scale.z = 0.82; torso.position.y = -2.0; torso.castShadow = true; chest.add(torso);
            const armorChest = new THREE.Group(); torso.add(armorChest);                                  // анкер брони на торсе
            const collar = M(new THREE.CylinderGeometry(0.27, 0.33, 0.18, 16, 1, true), Mats.strap, 0, 3.1, 0); collar.scale.z = 0.82; torso.add(collar);
            const belt = M(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 16, 1, true), Mats.strap, 0, 1.95, 0); belt.scale.z = 0.82; torso.add(belt);
            torso.add(M(new THREE.BoxGeometry(0.16, 0.12, 0.06), Mats.metalDark, 0, 1.95, 0.42));
            [-1, 1].forEach(s => { const st = M(new THREE.BoxGeometry(0.09, 1.05, 0.05), Mats.strap, s * 0.18, 2.55, 0.4); st.rotation.z = s * 0.5; torso.add(st); });
            torso.add(M(new THREE.BoxGeometry(0.26, 0.2, 0.06), Mats.pad, -0.22, 2.42, 0.36));

            // ===== РЮКЗАК =====
            const backpack = new THREE.Group(); backpack.position.set(0, 2.55, -0.42); torso.add(backpack);
            backpack.add(M(new THREE.BoxGeometry(0.72, 1.0, 0.42), Mats.pack, 0, 0, 0));
            backpack.add(M(new THREE.BoxGeometry(0.5, 0.34, 0.14), Mats.pack, 0, -0.28, 0.22));
            backpack.add(M(new THREE.BoxGeometry(0.18, 0.6, 0.3), Mats.pack, 0.42, 0, 0.02));
            backpack.add(M(new THREE.BoxGeometry(0.18, 0.6, 0.3), Mats.pack, -0.42, 0, 0.02));
            const bedroll = M(new THREE.CylinderGeometry(0.15, 0.15, 0.78, 12), Mats.bedroll, 0, 0.56, 0.05); bedroll.rotation.z = Math.PI / 2; backpack.add(bedroll);
            const neon = M(new THREE.BoxGeometry(0.5, 0.08, 0.04), Mats.neon, 0, 0.18, 0.22); backpack.add(neon);
            backpack.add(M(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5), Mats.metalDark, 0.28, 0.5, -0.1));
            backpack.add(M(new THREE.SphereGeometry(0.04, 8, 8), Mats.neon, 0.28, 0.82, -0.1));
            const flashLight = new THREE.PointLight(0x9fe6ff, 0, 26, 1.6); flashLight.position.set(0, 0.2, -0.4); backpack.add(flashLight);
            [-1, 1].forEach(s => torso.add(M(new THREE.BoxGeometry(0.08, 1.0, 0.06), Mats.strap, s * 0.2, 2.55, 0.46)));

            // ===== ШЕЯ + ГОЛОВА + ХВОСТ (спринг-кость) + ОЧКИ =====
            torso.add(M(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 10), Mats.skin, 0, 3.3, 0));
            const head = M(new THREE.SphereGeometry(0.3, 20, 16), Mats.skin, 0, 3.62, 0.02); head.scale.set(0.95, 1.06, 1.0); torso.add(head);
            head.add(M(new THREE.ConeGeometry(0.05, 0.12, 6), Mats.skin, 0, -0.02, 0.3));
            head.add(M(new THREE.SphereGeometry(0.33, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), Mats.hair, 0, 0.06, -0.02));
            head.add(M(new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), Mats.hair, 0, 0.14, 0.08));
            const pony = new THREE.Group(); pony.position.set(0, 0.12, -0.26); pony.rotation.x = 0.7; head.add(pony);
            pony.add(M(new THREE.CylinderGeometry(0.12, 0.09, 0.42, 8), Mats.hair, 0, -0.2, 0));
            const ponyB = new THREE.Group(); ponyB.position.set(0, -0.42, 0); ponyB.rotation.x = 0.25; pony.add(ponyB);
            ponyB.add(M(new THREE.CylinderGeometry(0.09, 0.04, 0.5, 8), Mats.hair, 0, -0.25, 0.04));
            const band = M(new THREE.TorusGeometry(0.3, 0.04, 8, 18), Mats.strap, 0, 0.16, 0); band.rotation.x = 1.3; head.add(band);
            [-0.12, 0.12].forEach(gx => head.add(M(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), Mats.lens, gx, 0.2, 0.24)));

            // ===== РУКИ: плечо → локоть (под torso → chest) =====
            const buildArm = (side) => {
                const sh = new THREE.Group(); sh.position.set(side * 0.46, 2.92, 0); torso.add(sh);
                const armor = new THREE.Group(); sh.add(armor);                                          // анкер брони (наплечник)
                sh.add(M(new THREE.SphereGeometry(0.18, 12, 10), Mats.pad, 0, 0.04, 0));
                sh.add(M(new THREE.CylinderGeometry(0.13, 0.115, 0.7, 10), Mats.sleeve, 0, -0.42, 0));
                const el = new THREE.Group(); el.position.set(0, -0.78, 0); sh.add(el);
                el.add(M(new THREE.SphereGeometry(0.1, 10, 8), Mats.sleeve, 0, 0, 0));
                el.add(M(new THREE.CylinderGeometry(0.105, 0.095, 0.62, 10), Mats.sleeve, 0, -0.27, 0.02));
                el.add(M(new THREE.BoxGeometry(0.16, 0.14, 0.2), Mats.glove, 0, -0.62, 0.05));            // ладонь
                for (let f = 0; f < 3; f++) el.add(M(new THREE.BoxGeometry(0.035, 0.13, 0.045), Mats.glove, -0.05 + f * 0.05, -0.74, 0.11)); // пальцы
                const thumb = M(new THREE.BoxGeometry(0.045, 0.1, 0.05), Mats.glove, side * 0.08, -0.66, 0.08); thumb.rotation.z = -side * 0.5; el.add(thumb); // большой палец
                return { sh, el, armor };
            };
            const armR = buildArm(1), armL = buildArm(-1);
            const anc = new THREE.Group(); anc.position.set(0.04, -0.67, 0.16); armR.el.add(anc);         // оружие = правая кисть (под локтем, гнётся с предплечьем)

            // ===== ТАЗ + НОГИ: бедро → колено (под hips) =====
            hips.add(M(new THREE.CylinderGeometry(0.42, 0.36, 0.4, 14), Mats.pants, 0, 1.62, 0));
            hips.add(M(new THREE.BoxGeometry(0.18, 0.24, 0.14), Mats.strap, 0.34, 1.55, 0.18));
            const buildLeg = (side) => {
                const hip = new THREE.Group(); hip.position.set(side * 0.2, 1.6, 0); hips.add(hip);
                hip.add(M(new THREE.CylinderGeometry(0.19, 0.15, 0.82, 10), Mats.pants, 0, -0.42, 0));    // бедро
                const kn = new THREE.Group(); kn.position.set(0, -0.82, 0); hip.add(kn);                  // колено
                kn.add(M(new THREE.SphereGeometry(0.13, 10, 8), Mats.pad, 0, 0, 0.12));                   // наколенник (кап)
                kn.add(M(new THREE.CylinderGeometry(0.13, 0.11, 0.66, 10), Mats.pants, 0, -0.33, 0.01));  // голень
                kn.add(M(new THREE.BoxGeometry(0.22, 0.24, 0.46), Mats.boots, 0, -0.68, 0.08));           // ботинок
                kn.add(M(new THREE.BoxGeometry(0.24, 0.08, 0.5), Mats.boots, 0, -0.78, 0.09));            // подошва
                return { hip, kn };
            };
            const legR = buildLeg(1), legL = buildLeg(-1);

            const shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.05; shadow.renderOrder = 1; root.add(shadow);
            scene.add(root);
            return { root, torso, hips, chest, head, pony, ponyB,
                     sr: armR.sh, srEl: armR.el, sl: armL.sh, slEl: armL.el,
                     lr: legR.hip, lrKnee: legR.kn, ll: legL.hip, llKnee: legL.kn,
                     armorChest, armorShR: armR.armor, armorShL: armL.armor, shadow,
                     anc, neon, flashLight };
        },
        buildWeapon(wId) {
            const grp = new THREE.Group(); grp.rotation.x = Math.PI / 2; grp.position.z = 0.8; const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0), Mats.resWood); grp.add(hilt);
            if (wId === 'pipe') { let b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8), Mats.resMetal); b.position.y = 0.4; grp.add(b); }
            else if (wId === 'bat') { let b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.5), Mats.resWood); b.position.y = 0.7; grp.add(b); }
            else if (wId === 'knife') { let b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.2), Mats.resMetal); b.position.y = 0.8; grp.add(b); } 
            else if (wId === 'axe') { hilt.scale.set(1, 2, 1); let b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.1), Mats.resMetal); b.position.set(0.2, 1.0, 0); grp.add(b); } 
            else if (wId === 'machete') { let b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.3), Mats.resMetal); b.position.y=1.2; grp.add(b); }
            else if (wId === 'spear') { hilt.scale.set(1, 3.5, 1); let b = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 4), Mats.resMetal); b.position.y = 2.2; grp.add(b); }
            else if (wId === 'katana') { let b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.0, 0.15), Mats.resMetal); b.position.y=1.8; grp.add(b); }
            return grp;
        },
        equipWeapon(wId, anchor) { anchor.clear(); if(wId !== 'hands') { let mesh = this.buildWeapon(wId); anchor.add(mesh); } },
        equipArmor(gId, rig) {
            if (!rig || !rig.armorChest) return;
            [rig.armorChest, rig.armorShR, rig.armorShL].forEach(g => { while (g.children.length) g.remove(g.children[0]); });
            const M = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; };
            const plate = Mats.metalDark, pad = Mats.pad, strap = Mats.strap;
            if (gId === 'jacket') {
                rig.armorChest.add(M(new THREE.BoxGeometry(0.5, 0.34, 0.1), pad, 0, 2.6, 0.42));
                rig.armorChest.add(M(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 12, 1, true), strap, 0, 3.14, 0)); // приподнятый воротник
            } else if (gId === 'leather') {
                rig.armorShR.add(M(new THREE.SphereGeometry(0.2, 10, 8), pad, 0, 0.1, 0));
                rig.armorShL.add(M(new THREE.SphereGeometry(0.2, 10, 8), pad, 0, 0.1, 0));
                rig.armorChest.add(M(new THREE.BoxGeometry(0.56, 0.72, 0.12), pad, 0, 2.5, 0.4));
            } else if (gId === 'tactical') {
                rig.armorShR.add(M(new THREE.BoxGeometry(0.36, 0.26, 0.44), plate, 0, 0.14, 0));
                rig.armorShL.add(M(new THREE.BoxGeometry(0.36, 0.26, 0.44), plate, 0, 0.14, 0));
                rig.armorChest.add(M(new THREE.BoxGeometry(0.64, 0.86, 0.16), plate, 0, 2.5, 0.42));
                rig.armorChest.add(M(new THREE.CylinderGeometry(0.3, 0.34, 0.24, 12, 1, true), plate, 0, 3.14, 0)); // горжет
                rig.armorChest.add(M(new THREE.BoxGeometry(0.5, 0.16, 0.14), strap, 0, 2.05, 0.4));
            } else if (gId === 'kevlar') {
                rig.armorShR.add(M(new THREE.BoxGeometry(0.46, 0.36, 0.52), plate, 0.05, 0.16, 0));
                rig.armorShR.add(M(new THREE.BoxGeometry(0.46, 0.14, 0.52), pad, 0.05, -0.02, 0));
                rig.armorShL.add(M(new THREE.BoxGeometry(0.46, 0.36, 0.52), plate, -0.05, 0.16, 0));
                rig.armorShL.add(M(new THREE.BoxGeometry(0.46, 0.14, 0.52), pad, -0.05, -0.02, 0));
                rig.armorChest.add(M(new THREE.BoxGeometry(0.74, 1.0, 0.2), plate, 0, 2.48, 0.42));
                rig.armorChest.add(M(new THREE.BoxGeometry(0.44, 0.5, 0.16), pad, 0, 2.55, 0.5));
                rig.armorChest.add(M(new THREE.CylinderGeometry(0.33, 0.37, 0.3, 12, 1, true), plate, 0, 3.14, 0)); // тяжёлый воротник
                rig.armorChest.add(M(new THREE.BoxGeometry(0.62, 0.82, 0.16), plate, 0, 2.5, -0.42));          // наспинная пластина
            }
        },
        buildResource(type) {
            let m;
            if(type === 'wood') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.0, 6), Mats.resWood); m.rotation.z = Math.PI/2; m.position.y = 0.3; } 
            else if(type === 'metal') { m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.5), Mats.resMetal); m.position.y = 0.05; m.rotation.y = Math.random(); } 
            else if(type === 'ore') { m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), Mats.resOre); m.position.y = 0.5; } 
            else if(type === 'cloth') { m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.8), Mats.resCloth); m.position.y = 0.15; }
            m.castShadow = true; return m;
        },
        buildProp(isCity) {
            const M = (geo, mat, x, y, z, sh) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = (sh !== false); m.receiveShadow = true; return m; };
            const g = new THREE.Group(); const R = Math.random();
            if (isCity) {
                if (R < 0.34) {
                    // === РАЗРУШЕННОЕ ЗДАНИЕ: фундамент + ломаные стены с проёмами, арматура, обломки ===
                    const w = 4 + Math.random() * 5, d = 4 + Math.random() * 4, h = 4 + Math.random() * 8;
                    g.add(M(new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8), Mats.concreteD, 0, 0.2, 0));
                    const wall = (len, px, pz, rot, full) => {
                        const holder = new THREE.Group(); holder.position.set(px, 0, pz); holder.rotation.y = rot; g.add(holder);
                        const sw = 1.4, n = Math.max(2, Math.round(len / sw));
                        for (let i = 0; i < n; i++) {
                            if (Math.random() < (full ? 0.1 : 0.5)) continue;
                            const hh = h * (full ? 0.55 + Math.random() * 0.45 : 0.3 + Math.random() * 0.4), wx = (i - (n - 1) / 2) * sw;
                            holder.add(M(new THREE.BoxGeometry(sw * 0.97, hh, 0.4), Math.random() < 0.5 ? Mats.concrete : Mats.ruins, wx, hh / 2, 0));
                            if (hh > 2.4 && Math.random() < 0.6) holder.add(M(new THREE.BoxGeometry(sw * 0.5, 1.0, 0.52), Mats.glassD, wx, 1.2 + Math.random() * (hh - 2.4), 0, false));
                            if (Math.random() < 0.3) { const rb = M(new THREE.CylinderGeometry(0.03, 0.03, 0.4 + Math.random() * 0.6, 4), Mats.rebar, wx + (Math.random() - 0.5) * 0.4, hh + 0.25, 0, false); rb.rotation.z = (Math.random() - 0.5); holder.add(rb); }
                        }
                    };
                    wall(w, 0, -d / 2, 0, true); wall(w, 0, d / 2, 0, Math.random() < 0.6);
                    wall(d, -w / 2, 0, Math.PI / 2, Math.random() < 0.7); wall(d, w / 2, 0, Math.PI / 2, Math.random() < 0.4);
                    if (Math.random() < 0.5) g.add(M(new THREE.BoxGeometry(w * 0.7, 0.3, d * 0.7), Mats.concreteD, (Math.random() - 0.5) * w * 0.2, h * 0.45, (Math.random() - 0.5) * d * 0.2));
                    for (let i = 0; i < 4; i++) { const rs = 0.4 + Math.random() * 0.7; g.add(M(new THREE.DodecahedronGeometry(rs, 0), Mats.concrete, (Math.random() - 0.5) * w, rs * 0.4, d / 2 + (Math.random() - 0.3) * 2, false)); }
                    return { group: g, rad: Math.max(w, d) * 0.55 };
                } else if (R < 0.54) {
                    // === ЛОМАНАЯ СТЕНА ===
                    const w = 3 + Math.random() * 3, h = 3 + Math.random() * 4, n = Math.max(2, Math.round(w / 1.2));
                    for (let i = 0; i < n; i++) { if (Math.random() < 0.15) continue; const hh = h * (0.5 + Math.random() * 0.5), wx = (i - (n - 1) / 2) * 1.2; g.add(M(new THREE.BoxGeometry(1.18, hh, 0.5), Mats.concrete, wx, hh / 2, 0)); if (Math.random() < 0.4) { const rb = M(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), Mats.rebar, wx, hh + 0.3, 0, false); rb.rotation.z = (Math.random() - 0.5); g.add(rb); } }
                    return { group: g, rad: w * 0.5 };
                } else if (R < 0.7) {
                    // === РАЗБИТЫЙ АВТОМОБИЛЬ ===
                    const paint = CARPAINTS[Math.floor(Math.random() * CARPAINTS.length)];
                    g.add(M(new THREE.BoxGeometry(2.0, 0.7, 4.2), paint, 0, 0.7, 0));
                    g.add(M(new THREE.BoxGeometry(1.8, 0.7, 2.0), paint, 0, 1.35, -0.2));
                    g.add(M(new THREE.BoxGeometry(1.7, 0.55, 1.8), Mats.glassD, 0, 1.4, -0.2, false));
                    [[-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]].forEach(p => { const wl = M(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 10), Mats.concreteD, p[0] * 0.9, 0.45, p[1], false); wl.rotation.z = Math.PI / 2; g.add(wl); });
                    g.rotation.y = Math.random() * Math.PI;
                    return { group: g, rad: 2.4 };
                } else if (R < 0.85) {
                    // === БОЧКИ (часть опрокинута, токсичные крышки) ===
                    const n = 2 + Math.floor(Math.random() * 3);
                    for (let i = 0; i < n; i++) { const tip = Math.random() < 0.3, b = M(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), Math.random() < 0.5 ? Mats.rust : Mats.resMetal, (Math.random() - 0.5) * 2.2, tip ? 0.5 : 0.6, (Math.random() - 0.5) * 2.2); if (tip) b.rotation.z = Math.PI / 2; g.add(b); b.add(M(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12), Math.random() < 0.4 ? Mats.foliageD : Mats.rust, 0, 0.62, 0, false)); }
                    return { group: g, rad: 1.7 };
                } else {
                    // === ПОГНУТЫЙ ФОНАРНЫЙ СТОЛБ (погасший) ===
                    g.add(M(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 8), Mats.concreteD, 0, 0.2, 0));
                    const pole = M(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), Mats.resMetal, 0, 3, 0); pole.rotation.z = (Math.random() - 0.5) * 0.18; g.add(pole);
                    const arm = M(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), Mats.resMetal, 0.55, 5.7, 0); arm.rotation.z = Math.PI / 2.4; g.add(arm);
                    g.add(M(new THREE.BoxGeometry(0.5, 0.18, 0.3), Mats.concreteD, 1.05, 5.5, 0, false));
                    return { group: g, rad: 0.6 };
                }
            }
            // ===== ПУСТОШИ / МЁРТВЫЙ ЛЕС =====
            if (R < 0.45) {
                // === МЁРТВОЕ ДЕРЕВО (коряга с голыми ветвями) ===
                const h = 4 + Math.random() * 4;
                const trunk = M(new THREE.CylinderGeometry(0.25, 0.55, h, 7), Mats.barkDead, 0, h / 2, 0); trunk.rotation.z = (Math.random() - 0.5) * 0.14; g.add(trunk);
                const nb = 3 + Math.floor(Math.random() * 3);
                for (let i = 0; i < nb; i++) { const piv = new THREE.Group(); piv.position.set(0, h * (0.5 + Math.random() * 0.45), 0); piv.rotation.y = Math.random() * 7; piv.rotation.z = 0.6 + Math.random() * 0.6; piv.add(M(new THREE.CylinderGeometry(0.06, 0.14, 1 + Math.random() * 1.6, 5), Mats.barkDead, 0, 0.7, 0)); g.add(piv); }
                return { group: g, rad: 1.2 };
            } else if (R < 0.62) {
                // === ПОЛУМЁРТВАЯ ХВОЯ ===
                const h = 5 + Math.random() * 3; g.add(M(new THREE.CylinderGeometry(0.3, 0.6, h * 0.5, 6), Mats.barkDead, 0, h * 0.25, 0));
                for (let i = 0; i < 3; i++) g.add(M(new THREE.ConeGeometry(2.2 - i * 0.5, h * 0.34, 6), Mats.foliageD, 0, h * 0.35 + i * h * 0.2, 0));
                return { group: g, rad: 1.4 };
            } else if (R < 0.82) {
                // === СКАЛЬНАЯ ГРУППА ===
                const n = 2 + Math.floor(Math.random() * 3); let mr = 0;
                for (let i = 0; i < n; i++) { const rs = 1 + Math.random() * 1.8; mr = Math.max(mr, rs); const rk = M(new THREE.DodecahedronGeometry(rs, 0), Mats.ruins, (Math.random() - 0.5) * 2.5, rs * 0.5, (Math.random() - 0.5) * 2.5); rk.rotation.set(Math.random(), Math.random(), Math.random()); g.add(rk); }
                return { group: g, rad: mr * 1.1 };
            } else if (R < 0.92) {
                // === ПОВАЛЕННОЕ БРЕВНО + ПЕНЬ ===
                const log = M(new THREE.CylinderGeometry(0.45, 0.5, 3.5 + Math.random() * 2, 8), Mats.barkDead, 0, 0.5, 0); log.rotation.z = Math.PI / 2; log.rotation.y = Math.random() * 7; g.add(log);
                g.add(M(new THREE.CylinderGeometry(0.5, 0.62, 0.8, 8), Mats.barkDead, 1.6, 0.4, 0.6));
                return { group: g, rad: 1.6 };
            } else {
                // === СУХОЙ КУСТ ===
                for (let i = 0; i < 5; i++) { const tw = M(new THREE.CylinderGeometry(0.02, 0.05, 0.8 + Math.random() * 0.6, 4), Mats.barkDead, (Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6, false); tw.rotation.set((Math.random() - 0.5), 0, (Math.random() - 0.5)); g.add(tw); }
                g.add(M(new THREE.SphereGeometry(0.7, 8, 6), Mats.foliageD, 0, 0.7, 0, false));
                return { group: g, rad: 0.9 };
            }
        },

        buildMob(type) {
            const root = new THREE.Group();
            const M = (geo, mat, x, y, z, sh) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = (sh !== false); return m; };

            if (type === 'dog') {
                // === МУТИРОВАВШИЙ ПЁС: корпус-галоп, голова-пивот, челюсть, хвост-спринг ===
                const hide = new THREE.MeshStandardMaterial({ color: 0x1a2e1a, roughness: 0.95 }); Surf.apply(hide, 'flesh');
                const core = new THREE.Group(); root.add(core);
                const body = M(new THREE.CylinderGeometry(0.42, 0.34, 1.7, 10), hide, 0, 0.95, -0.1); body.rotation.x = Math.PI / 2; body.scale.x = 1.1; core.add(body);
                core.add(M(new THREE.SphereGeometry(0.5, 12, 10), hide, 0, 1.0, 0.5));
                core.add(M(new THREE.SphereGeometry(0.46, 12, 10), hide, 0, 1.02, -0.7));
                for (let i = 0; i < 3; i++) core.add(M(new THREE.TorusGeometry(0.4 - i * 0.03, 0.04, 6, 10), Mats.mobBone, 0, 1.0, 0.18 - i * 0.32, false));
                const neck = M(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 8), hide, 0, 1.15, 0.85); neck.rotation.x = 1.1; core.add(neck);
                const head = new THREE.Group(); head.position.set(0, 1.3, 1.05); core.add(head);
                const headM = M(new THREE.BoxGeometry(0.4, 0.42, 0.7), hide, 0, 0, 0.2); headM.rotation.x = 0.15; head.add(headM);
                const jaw = new THREE.Group(); jaw.position.set(0, -0.08, 0); headM.add(jaw);
                jaw.add(M(new THREE.BoxGeometry(0.34, 0.18, 0.42), hide, 0, -0.08, 0.18, false));
                jaw.add(M(new THREE.ConeGeometry(0.05, 0.16, 4), Mats.mobBone, 0.1, -0.12, 0.36, false));
                jaw.add(M(new THREE.ConeGeometry(0.05, 0.16, 4), Mats.mobBone, -0.1, -0.12, 0.36, false));
                [-1, 1].forEach(s => { const e = M(new THREE.ConeGeometry(0.1, 0.28, 5), hide, s * 0.16, 0.28, -0.05, false); e.rotation.x = -0.3; headM.add(e); });
                [-1, 1].forEach(s => headM.add(M(new THREE.SphereGeometry(0.07, 8, 8), Mats.mobEye, s * 0.13, 0.06, 0.34, false)));
                const tail = new THREE.Group(); tail.position.set(0, 1.1, -0.7); tail.rotation.x = -0.7; core.add(tail);
                tail.add(M(new THREE.CylinderGeometry(0.08, 0.02, 0.7, 6), hide, 0, -0.3, 0, false));
                const paw = (parent) => { [-1, 1].forEach(s => { parent.add(M(new THREE.CylinderGeometry(0.1, 0.07, 0.85, 7), Mats.mobHide, s * 0.3, -0.42, 0)); parent.add(M(new THREE.BoxGeometry(0.16, 0.1, 0.26), Mats.mobHide, s * 0.3, -0.85, 0.08, false)); }); };
                const ll = new THREE.Group(); ll.position.set(0, 0.92, 0.62); root.add(ll); paw(ll);
                const lr = new THREE.Group(); lr.position.set(0, 0.92, -0.55); root.add(lr); paw(lr);
                scene.add(root);
                return { root, torso: body, core, head, jaw, tail, lr, ll };
            }

            // === МУТАНТ-ГРОМИЛА: суставы (плечо->локоть, бедро->колено), торс-пивот ===
            const flesh = new THREE.MeshStandardMaterial({ color: 0x2d1a1a, roughness: 0.9 }); Surf.apply(flesh, 'flesh');
            const torso = M(new THREE.CylinderGeometry(0.5, 0.72, 1.5, 12), flesh, 0, 2.15, 0); torso.scale.set(1.25, 1, 0.95); torso.rotation.x = 0.18; root.add(torso);
            torso.add(M(new THREE.SphereGeometry(0.6, 14, 12), flesh, 0, -0.55, 0.1));
            torso.add(M(new THREE.SphereGeometry(0.5, 12, 10), flesh, 0.16, 0.58, -0.05));
            for (let i = 0; i < 4; i++) { const sp = M(new THREE.ConeGeometry(0.1, 0.34, 5), Mats.mobBone, (i % 2 ? 0.12 : -0.12), 0.55 - i * 0.32, -0.34, false); sp.rotation.x = -0.5; torso.add(sp); }
            const head = M(new THREE.SphereGeometry(0.34, 14, 12), flesh, 0, 0.78, 0.38); head.scale.set(1, 0.9, 1.1); torso.add(head);
            head.add(M(new THREE.BoxGeometry(0.4, 0.26, 0.42), flesh, 0, -0.17, 0.16, false));
            [0.13, -0.13].forEach(gx => head.add(M(new THREE.SphereGeometry(0.075, 8, 8), Mats.mobEye, gx, 0.05, 0.3, false)));
            head.add(M(new THREE.ConeGeometry(0.04, 0.12, 4), Mats.mobBone, 0.06, -0.3, 0.34, false));
            head.add(M(new THREE.ConeGeometry(0.04, 0.12, 4), Mats.mobBone, -0.06, -0.3, 0.34, false));
            const buildArm = (side, big) => {
                const sh = new THREE.Group(); sh.position.set(side * 0.62, 0.55, 0); torso.add(sh);
                const r = big ? 0.2 : 0.15;
                sh.add(M(new THREE.SphereGeometry(r + 0.04, 10, 8), Mats.mobHide, 0, 0.05, 0));
                sh.add(M(new THREE.CylinderGeometry(r, r * 0.85, 0.95, 8), Mats.mobHide, side * 0.05, -0.5, 0.05));
                const el = new THREE.Group(); el.position.set(0, -0.95, 0.05); sh.add(el);
                const fore = M(new THREE.CylinderGeometry(r * 0.85, r * 0.7, 0.9, 8), Mats.mobHide, side * 0.12, -0.3, 0.13); fore.rotation.x = 0.3; el.add(fore);
                el.add(M(new THREE.SphereGeometry(r, 8, 8), Mats.mobHide, side * 0.18, -0.67, 0.27, false));
                [-1, 0, 1].forEach(c => { const cl = M(new THREE.ConeGeometry(0.04, 0.3, 4), Mats.mobBone, side * 0.18 + c * 0.08, -0.83, 0.39, false); cl.rotation.x = 1.4; el.add(cl); });
                return { sh, el };
            };
            const armR = buildArm(1, true), armL = buildArm(-1, false);
            root.add(M(new THREE.CylinderGeometry(0.5, 0.42, 0.5, 12), Mats.mobHide, 0, 1.45, 0));
            const buildLeg = (side) => {
                const hip = new THREE.Group(); hip.position.set(side * 0.26, 1.4, 0); root.add(hip);
                hip.add(M(new THREE.CylinderGeometry(0.24, 0.18, 0.82, 9), Mats.mobHide, 0, -0.42, 0));
                const kn = new THREE.Group(); kn.position.set(0, -0.83, 0); hip.add(kn);
                kn.add(M(new THREE.CylinderGeometry(0.17, 0.13, 0.74, 9), Mats.mobHide, 0, -0.29, 0.04));
                kn.add(M(new THREE.BoxGeometry(0.3, 0.18, 0.5), Mats.mobHide, 0, -0.67, 0.12, false));
                [-1, 1].forEach(c => { const cl = M(new THREE.ConeGeometry(0.04, 0.18, 4), Mats.mobBone, c * 0.09, -0.69, 0.4, false); cl.rotation.x = 1.5; kn.add(cl); });
                return { hip, kn };
            };
            const legR = buildLeg(1), legL = buildLeg(-1);
            scene.add(root);
            return { root, torso, head, sr: armR.sh, srEl: armR.el, sl: armL.sh, slEl: armL.el, lr: legR.hip, lrKnee: legR.kn, ll: legL.hip, llKnee: legL.kn };
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

    // ===== ПРОЦЕДУРНАЯ АНИМАЦИЯ ПЕРСОНАЖЕЙ (общая для Алексы и NPC) =====
    const Anim = {
        bind(rig) { rig._a = { t: Math.random() * 6, wT: 0, move: 0, lastYaw: rig.root.rotation.y, pX: 0.7, pXv: 0, pZ: 0, pZv: 0 }; },
        update(rig, p, dt) {
            if (!rig._a) this.bind(rig);
            const a = rig._a; a.t += dt;
            a.move += ((p.move || 0) - a.move) * Math.min(1, dt * 9);
            const stride = p.run ? 13 : 8;
            if (a.move > 0.02) a.wT += dt * stride;
            const sw = Math.sin(a.wT) * a.move, co = Math.cos(a.wT) * a.move;
            const br = Math.sin(a.t * 1.8) * 0.5 + 0.5;
            // ноги: мах бедра + сгиб колена на заднем замахе
            rig.lr.rotation.x = sw * 0.85; rig.ll.rotation.x = -sw * 0.85;
            rig.lrKnee.rotation.x = Math.max(0, -Math.sin(a.wT)) * 1.1 * a.move + 0.05;
            rig.llKnee.rotation.x = Math.max(0, Math.sin(a.wT)) * 1.1 * a.move + 0.05;
            // таз: подскок + крен + твист
            rig.hips.position.y = Math.abs(Math.sin(a.wT)) * 0.06 * a.move;
            rig.hips.rotation.z = co * 0.04; rig.hips.rotation.y = sw * 0.05;
            // корпус: наклон вперёд по скорости + дыхание
            const leanF = a.move * (p.run ? 0.17 : 0.09);
            rig.chest.rotation.x = leanF + br * 0.02; rig.chest.scale.y = 1 + br * 0.012;
            // левая рука контр-машет; правая — контр-мах либо удар
            rig.sl.rotation.x = sw * 0.7; rig.slEl.rotation.x = 0.35 + Math.max(0, -Math.cos(a.wT)) * 0.5 * a.move;
            const atk = (p.atk !== undefined && p.atk >= 0) ? p.atk : -1;
            if (atk >= 0) {
                rig.sr.rotation.x = -2.1 * atk; rig.srEl.rotation.x = 0.3 + 1.1 * atk;
                rig.chest.rotation.y = -0.55 * atk; rig.chest.rotation.x = leanF + 0.16 * atk; rig.sl.rotation.x = 0.4 * atk;
            } else {
                rig.sr.rotation.x = -sw * 0.7; rig.srEl.rotation.x = 0.35 + Math.max(0, Math.cos(a.wT)) * 0.5 * a.move;
                const aim = MathU.clamp(p.aimRel || 0, -0.7, 0.7);
                rig.chest.rotation.y += (aim * 0.45 - rig.chest.rotation.y) * Math.min(1, dt * 8);
            }
            const aimH = MathU.clamp(p.aimRel || 0, -0.8, 0.8);
            rig.head.rotation.y += (aimH * 0.55 - rig.head.rotation.y) * Math.min(1, dt * 10);
            this._pony(rig, a, dt);
        },
        idle(rig, dt, lookRel) {
            if (!rig._a) this.bind(rig);
            const a = rig._a; a.t += dt;
            const br = Math.sin(a.t * 1.6) * 0.5 + 0.5;
            rig.chest.rotation.x += (br * 0.03 - 0.012 - rig.chest.rotation.x) * Math.min(1, dt * 4);
            rig.chest.scale.y = 1 + br * 0.014;
            rig.lr.rotation.x *= Math.pow(0.05, dt); rig.ll.rotation.x *= Math.pow(0.05, dt);
            rig.sr.rotation.x *= Math.pow(0.1, dt); rig.sl.rotation.x *= Math.pow(0.1, dt);
            if (lookRel !== undefined) {
                const l = MathU.clamp(lookRel, -0.8, 0.8);
                rig.head.rotation.y += (l * 0.6 - rig.head.rotation.y) * Math.min(1, dt * 5);
                rig.chest.rotation.y += (l * 0.25 - rig.chest.rotation.y) * Math.min(1, dt * 3);
            } else { rig.chest.rotation.y *= Math.pow(0.2, dt); rig.head.rotation.y *= Math.pow(0.2, dt); }
            this._pony(rig, a, dt);
        },
        _pony(rig, a, dt) {
            let yaw = rig.root.rotation.y, dy = yaw - a.lastYaw;
            if (dy > Math.PI) dy -= 2 * Math.PI; else if (dy < -Math.PI) dy += 2 * Math.PI;
            a.lastYaw = yaw;
            const tX = 0.7 - a.move * 0.28 + Math.sin(a.wT * 2) * 0.07 * a.move;
            const tZ = MathU.clamp(-dy / Math.max(dt, 0.001) * 0.05, -0.5, 0.5);
            a.pXv += ((tX - a.pX) * 55 - a.pXv * 11) * dt; a.pX += a.pXv * dt;
            a.pZv += ((tZ - a.pZ) * 45 - a.pZv * 10) * dt; a.pZ += a.pZv * dt;
            a.pX = MathU.clamp(a.pX, 0.2, 1.25); a.pZ = MathU.clamp(a.pZ, -0.6, 0.6);
            rig.pony.rotation.x = a.pX; rig.pony.rotation.z = a.pZ;
            rig.ponyB.rotation.x = 0.25 + (a.pX - 0.7) * 0.55; rig.ponyB.rotation.z = a.pZ * 0.55;
        },
        mob(rig, type, p, dt) {
            if (!rig._a) rig._a = { wT: Math.random() * 6, move: 0, t: Math.random() * 6, tX: -0.7, tXv: 0, tZ: 0, tZv: 0, lastYaw: rig.root.rotation.y };
            const a = rig._a; a.t += dt;
            if (p.dead) return this._mobDeath(rig, type, p.deadT);
            a.move += ((p.move || 0) - a.move) * Math.min(1, dt * 9);
            if (a.move > 0.02) a.wT += dt * (type === 'dog' ? 16 : 9);
            const sw = Math.sin(a.wT) * a.move, atk = (p.atk !== undefined && p.atk >= 0) ? p.atk : -1, hurt = p.hurt ? 1 : 0, br = Math.sin(a.t * 1.5) * 0.5 + 0.5;
            if (type === 'dog') {
                rig.ll.rotation.x = sw * 0.95; rig.lr.rotation.x = -sw * 0.95;
                rig.core.position.y = Math.abs(Math.sin(a.wT)) * 0.12 * a.move;
                rig.core.rotation.x = -sw * 0.12 - (atk >= 0 ? 0.3 * atk : 0) - hurt * 0.15;
                rig.head.rotation.x = Math.sin(a.wT) * 0.12 * a.move + (atk >= 0 ? 0.45 * atk : 0) - hurt * 0.3;
                rig.jaw.rotation.x = (atk >= 0 ? 0.7 * atk : 0.05) + br * 0.05 * a.move;
                this._tail(rig, a, dt);
            } else {
                rig.lr.rotation.x = sw * 0.7; rig.ll.rotation.x = -sw * 0.7;
                rig.lrKnee.rotation.x = Math.max(0, -Math.sin(a.wT)) * 0.9 * a.move + 0.1;
                rig.llKnee.rotation.x = Math.max(0, Math.sin(a.wT)) * 0.9 * a.move + 0.1;
                rig.torso.position.y = 2.15 + Math.abs(Math.sin(a.wT)) * 0.08 * a.move;
                if (atk >= 0) {
                    rig.sr.rotation.x = -1.7 * atk - 0.15; rig.sl.rotation.x = -1.5 * atk - 0.15;
                    rig.srEl.rotation.x = 0.3 + 0.9 * atk; rig.slEl.rotation.x = 0.3 + 0.9 * atk;
                    rig.torso.rotation.x = 0.18 + 0.55 * atk;
                } else {
                    rig.sr.rotation.x = -sw * 0.5 - 0.1; rig.sl.rotation.x = sw * 0.5 - 0.1;
                    rig.srEl.rotation.x = 0.45; rig.slEl.rotation.x = 0.45;
                    rig.torso.rotation.x = 0.18 + a.move * 0.1 - hurt * 0.35 + br * 0.02;
                }
                rig.head.rotation.x = -hurt * 0.4 + Math.sin(a.t * 1.5) * 0.05;
            }
        },
        _tail(rig, a, dt) {
            let yaw = rig.root.rotation.y, dy = yaw - a.lastYaw;
            if (dy > Math.PI) dy -= 2 * Math.PI; else if (dy < -Math.PI) dy += 2 * Math.PI;
            a.lastYaw = yaw;
            const tZ = MathU.clamp(-dy / Math.max(dt, 0.001) * 0.04, -0.6, 0.6) + Math.sin(a.wT) * 0.18 * a.move;
            const tX = -0.7 + a.move * 0.35;
            a.tXv += ((tX - a.tX) * 50 - a.tXv * 10) * dt; a.tX += a.tXv * dt;
            a.tZv += ((tZ - a.tZ) * 45 - a.tZv * 9) * dt; a.tZ += a.tZv * dt;
            a.tX = MathU.clamp(a.tX, -1.2, 0.4); a.tZ = MathU.clamp(a.tZ, -0.7, 0.7);
            rig.tail.rotation.x = a.tX; rig.tail.rotation.z = a.tZ;
        },
        _mobDeath(rig, type, t) {
            const k = Math.min(1, t / 0.6);
            if (type === 'dog') {
                rig.core.rotation.z = k * 1.4; rig.core.position.y = -k * 0.45;
                rig.head.rotation.x = k * 0.6; rig.jaw.rotation.x = 0.3 * k;
                rig.ll.rotation.x = k * 0.8; rig.lr.rotation.x = -k * 0.6;
            } else {
                rig.torso.rotation.z = k * 1.5; rig.torso.rotation.x = 0.18 + k * 0.2; rig.torso.position.y = 2.15 - k * 1.3;
                rig.lr.rotation.x = k * 0.5; rig.ll.rotation.x = -k * 0.4;
            }
        }
    };

    class PlayerHero extends Entity {
        constructor() { super(0, 5, 1.0); this.rig = Models.buildAlexa(); this.wT = 0; this.atkCD = 0; this.iframe = 0; }
        update(dt) {
            if (STATE.isDead || STATE.isDialog || STATE.isInvOpen || STATE.isQuestOpen) return;
            let dx = keys.d - keys.a, dz = keys.s - keys.w, moving = (dx !== 0 || dz !== 0);
            let speed = (keys.shift && STATE.stam > 0) ? 9.0 : 4.5;

            if (keys.shift && STATE.stam > 0 && moving) { STATE.stam -= dt * 25; } else if (!keys.shift && STATE.stam < 100) { STATE.stam += dt * 15; }
            if (STATE.stam < 0) STATE.stam = 0;

            if (moving) { let len = Math.hypot(dx, dz); this.x += (dx / len) * speed * dt; this.z += (dz / len) * speed * dt; if (this.atkCD <= 0) this.rig.root.rotation.y = Math.atan2(dx, dz); }
            this.applyKnockback(dt); GameWorld.resolveWalls(this); this.rig.root.position.set(this.x, 0, this.z);
            if (this.iframe > 0) this.iframe -= dt;
            if (this.atkCD > 0) this.atkCD -= dt;

            if (keys.lkm && this.atkCD <= 0) {
                this.atkCD = 0.5; AudioSys.swing();
                let aimA = Math.atan2(aimPoint.x - this.x, aimPoint.z - this.z);
                this.rig.root.rotation.y = aimA; this.push(Math.sin(aimA) * 15, Math.cos(aimA) * 15);
                let closeMobs = Mobs.filter(m => Math.abs(m.x - this.x) < 10 && Math.abs(m.z - this.z) < 10);
                closeMobs.forEach(m => {
                    if (MathU.dist(this, m) < 5.0) {
                        let diff = Math.abs(Math.atan2(m.x - this.x, m.z - this.z) - aimA); if (diff > Math.PI) diff = 2 * Math.PI - diff;
                        if (diff < 1.2) { m.hp -= STATE.wDmg; m.stun = 0.4; m.push(Math.sin(aimA) * 30, Math.cos(aimA) * 30); AudioSys.hit(); spawnVFX(m.x, 1.5, m.z, 0xdc2626, 6); }
                    }
                });
            }

            // доворот корпуса/головы к прицелу + полная процедурная анимация тела
            let aimRel = Math.atan2(aimPoint.x - this.x, aimPoint.z - this.z) - this.rig.root.rotation.y;
            while (aimRel > Math.PI) aimRel -= 2 * Math.PI; while (aimRel < -Math.PI) aimRel += 2 * Math.PI;
            this.rig.shadow.position.y = terrainHeight(this.x, this.z) + 0.05;
            Anim.update(this.rig, { move: moving ? 1 : 0, run: keys.shift && STATE.stam > 0, aimRel: aimRel, atk: this.atkCD > 0 ? (this.atkCD / 0.5) : -1 }, dt);
        }
    }

    class MobActor extends Entity {
        constructor(x, z, type) {
            super(x, z, 1.2); this.type = type; this.hp = type === 'dog' ? 30 : 60; this.sp = type === 'dog' ? 5.5 : 3.0;
            this.rig = Models.buildMob(type); this.rig.root.position.set(x, 0, z); this.stun = 0; this.rest = 0; this.wT = Math.random() * 10;
            this.atkAnim = 0; this.dead = false; this.deadT = 0;
        }
        update(dt) {
            if (this.dead) { this.deadT += dt; Anim.mob(this.rig, this.type, { dead: true, deadT: this.deadT }, dt); this.applyKnockback(dt); this.rig.root.position.set(this.x, 0, this.z); return; }
            const hurt = this.stun > 0;
            if (hurt) { this.stun -= dt; this.rig.torso.material.color.setHex(0xdc2626); }
            else { this.rig.torso.material.color.setHex(this.type === 'dog' ? 0x1a2e1a : 0x2d1a1a); }
            if (this.rest > 0) this.rest -= dt;
            if (this.atkAnim > 0) this.atkAnim -= dt;
            let dist = MathU.dist(this, GameWorld.player), moving = 0;
            let aggroRad = (STATE.timeOfDay > 20 || STATE.timeOfDay < 6) ? 35 : 18;
            if (!hurt && dist < aggroRad && dist > 2.5 && this.rest <= 0) {
                let a = Math.atan2(GameWorld.player.x - this.x, GameWorld.player.z - this.z);
                this.rig.root.rotation.y = a; this.x += Math.sin(a) * this.sp * dt; this.z += Math.cos(a) * this.sp * dt; moving = 1;
            } else if (!hurt && dist <= 2.5 && this.rest <= 0 && GameWorld.player.iframe <= 0) {
                let rawDmg = 15, actualDmg = Math.max(2, rawDmg - (STATE.gDef * 0.15)); STATE.hp -= actualDmg;
                GameWorld.player.iframe = 0.5; this.rest = 1.2; this.atkAnim = 0.5;
                GameWorld.player.push(((GameWorld.player.x - this.x) / dist) * 20, ((GameWorld.player.z - this.z) / dist) * 20);
                let fx = document.getElementById('dmg-fx'); if (fx) { fx.style.boxShadow = 'inset 0 0 150px rgba(239,68,68,0.8)'; setTimeout(() => fx.style.boxShadow = 'none', 150); spawnVFX(GameWorld.player.x, 1.5, GameWorld.player.z, 0xdc2626, 6); }
            }
            this.applyKnockback(dt); GameWorld.resolveWalls(this); this.rig.root.position.set(this.x, 0, this.z);
            Anim.mob(this.rig, this.type, { move: moving, run: this.sp > 4, atk: this.atkAnim > 0 ? (this.atkAnim / 0.5) : -1, hurt: hurt }, dt);
        }
    }

    // Детерминированный value-noise рельефа — бесшовный между чанками (высота из мировых координат)
    function _hash2(x, z) { let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
    function _vnoise(x, z) { let xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi; let u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); let a = _hash2(xi, zi), b = _hash2(xi + 1, zi), c = _hash2(xi + 1, zi + 1), d = _hash2(xi, zi + 1); return a + (b - a) * u + (d - a) * v + (a - b - d + c) * u * v; }
    function terrainHeight(wx, wz) { let n = _vnoise(wx * 0.018, wz * 0.018) * 0.65 + _vnoise(wx * 0.06, wz * 0.06) * 0.27 + _vnoise(wx * 0.17, wz * 0.17) * 0.08; return -0.13 + (n - 0.5) * 0.45; }

    // Общие ресурсы мелкой детализации земли (копоть/трещины + щебень)
    function makeDecalTex() { const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); let g = x.createRadialGradient(S/2, S/2, 4, S/2, S/2, S/2); g.addColorStop(0, 'rgba(10,10,12,0.6)'); g.addColorStop(0.6, 'rgba(10,10,12,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(8,8,9,0.55)'; x.lineWidth = 2; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(S/2, S/2); let a = Math.random() * 7, px = S/2, py = S/2; for (let s = 0; s < 4; s++) { px += Math.cos(a) * 12; py += Math.sin(a) * 12; a += (Math.random() - 0.5); x.lineTo(px, py); } x.stroke(); } return new THREE.CanvasTexture(c); }
    const DECAL_MAT = new THREE.MeshBasicMaterial({ map: makeDecalTex(), transparent: true, depthWrite: false, opacity: 0.55 });
    const DECAL_GEO = new THREE.PlaneGeometry(1, 1);
    const RUBBLE_GEO = new THREE.DodecahedronGeometry(0.35, 0);

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
            // ===== РЕЛЬЕФНЫЙ ТЕКСТУРИРОВАННЫЙ ТЕРРЕЙН (vertex-цвета + лёгкое смещение, принимает тени) =====
            const cs = this.chunkSize, cxW = cx * cs + cs / 2, czW = cz * cs + cs / 2, SEG = 18;
            const geo = new THREE.PlaneGeometry(cs, cs, SEG, SEG); geo.rotateX(-Math.PI / 2);
            const pa = geo.attributes.position, cols = new Float32Array(pa.count * 3);
            const cBase = new THREE.Color(isCity ? 0x2c323b : 0x1b271d), cAlt = new THREE.Color(isCity ? 0x383f4a : 0x2b3520), tmp = new THREE.Color();
            for (let i = 0; i < pa.count; i++) {
                const wx = cxW + pa.getX(i), wz = czW + pa.getZ(i), hy = terrainHeight(wx, wz);
                pa.setY(i, hy);
                const tt = MathU.clamp(_vnoise(wx * 0.04 + 7, wz * 0.04 + 3) * 1.4 - 0.2, 0, 1);
                const shd = MathU.clamp(0.78 + (hy + 0.13) * 1.1, 0.6, 1.18);
                tmp.copy(cBase).lerp(cAlt, tt).multiplyScalar(shd);
                cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
            const plane = new THREE.Mesh(geo, isCity ? Mats.groundCity : Mats.groundForest);
            plane.position.set(cxW, 0, czW); plane.receiveShadow = true; scene.add(plane);

            // мелкая детализация земли: щебень + декали (копоть/трещины), ложатся на рельеф
            for (let i = 0; i < (isCity ? 14 : 10); i++) {
                let rx = cx * cs + Math.random() * cs, rz = cz * cs + Math.random() * cs, rsz = 0.3 + Math.random() * 0.85;
                let rb = new THREE.Mesh(RUBBLE_GEO, Mats.ruins); rb.scale.set(rsz, rsz * 0.6, rsz);
                rb.position.set(rx, terrainHeight(rx, rz) + 0.04, rz); rb.rotation.set(Math.random(), Math.random(), Math.random()); scene.add(rb);
            }
            for (let i = 0; i < 4; i++) {
                let dx = cx * cs + Math.random() * cs, dz = cz * cs + Math.random() * cs, dsz = 3 + Math.random() * 5;
                let dc = new THREE.Mesh(DECAL_GEO, DECAL_MAT); dc.rotation.x = -Math.PI / 2; dc.rotation.z = Math.random() * 7;
                dc.scale.set(dsz, dsz, 1); dc.position.set(dx, terrainHeight(dx, dz) + 0.03, dz); dc.renderOrder = 1; scene.add(dc);
            }

            let obsCount = isCity ? 8 : 12;
            for(let i=0; i<obsCount; i++) {
                let lx = cx * this.chunkSize + Math.random() * this.chunkSize; let lz = cz * this.chunkSize + Math.random() * this.chunkSize;
                if (cx === 0 && cz === 0 && Math.hypot(lx-8, lz+8) < 15) continue; 
                let p = Models.buildProp(isCity);
                p.group.position.set(lx, terrainHeight(lx, lz), lz); scene.add(p.group);
                Statics.push({ x: lx, z: lz, rad: p.rad });
            }

            for(let i=0; i<6; i++) {
                let lx = cx * this.chunkSize + Math.random() * this.chunkSize; let lz = cz * this.chunkSize + Math.random() * this.chunkSize;
                let type = ['wood', 'ore', 'metal', 'cloth'][Math.floor(Math.random() * 4)];
                let m = Models.buildResource(type); m.position.set(lx, m.position.y + terrainHeight(lx, lz), lz); scene.add(m);
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
            Models.equipArmor(STATE.gId, this.player.rig);
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
                STATE.gId = id; STATE.gDef = itemG.def; Mats.cloth.color.setHex(itemG.color); Models.equipArmor(id, GameWorld.player.rig); AudioSys.equip();
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
            
            let hh = Math.floor(STATE.timeOfDay); let mm = Math.floor((STATE.timeOfDay - hh) * 60); document.getElementById('time-display').innerText = `${Weather.label} ${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`;
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

        STATE.timeOfDay += dt * 0.02; if (STATE.timeOfDay >= 24) STATE.timeOfDay = 0;
        const skyInfo = Sky.update(STATE.timeOfDay, GameWorld.player.x, GameWorld.player.z, dt);
        GameWorld.player.rig.flashLight.intensity = skyInfo.isNight ? 1.0 : 0.0;
        Weather.update(dt, GameWorld.player.x, GameWorld.player.z);

        raycaster.setFromCamera(mouseVec, camera); raycaster.ray.intersectPlane(floorPlane, aimPoint);

        if (!STATE.isInvOpen && !STATE.isDialog && !STATE.isQuestOpen && !STATE.isDead) {
            GameWorld.player.update(dt);
            WorldGen.update(GameWorld.player.x, GameWorld.player.z); 
            
            for (let i = Mobs.length - 1; i >= 0; i--) { 
                let m = Mobs[i]; 
                if (MathU.dist(GameWorld.player, m) > 200) { scene.remove(m.rig.root); Mobs.splice(i, 1); continue; } 
                if (m.hp <= 0 && !m.dead) { m.dead = true; m.deadT = 0; STATE.xp += 10; STATE.kills++; spawnVFX(m.x, 1.4, m.z, 0x5a2d20, 12); } if (m.dead && m.deadT > 0.9) { scene.remove(m.rig.root); Mobs.splice(i, 1); continue; } 
                m.update(dt); 
            }
            GameWorld.resolveOverlaps(); window.UI.updateTooltips();
            // оживление NPC: дыхание + взгляд на игрока вблизи
            for (let n = 0; n < Npcs.length; n++) {
                const np = Npcs[n]; if (!np.rig || !np.rig.chest) continue;
                const dd = Math.hypot(np.x - GameWorld.player.x, np.z - GameWorld.player.z); if (dd > 45) continue;
                let lr;
                if (dd < 14) { lr = Math.atan2(GameWorld.player.x - np.x, GameWorld.player.z - np.z) - np.rig.root.rotation.y; while (lr > Math.PI) lr -= 2 * Math.PI; while (lr < -Math.PI) lr += 2 * Math.PI; }
                if (np.rig.shadow) np.rig.shadow.position.y = terrainHeight(np.x, np.z) + 0.05;
                Anim.idle(np.rig, dt, lr);
            }
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

        if (composer) composer.render(); else renderer.render(scene, camera);
    }
    MainGameLoop();
});