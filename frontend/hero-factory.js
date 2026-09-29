// ===== InciCare — Hero Factory Flow (hero-factory.js) =====
// Self-contained decorative animation for the Overview page.
// One glowing ball travels a closed circuit through the machines;
// each machine lights up as the ball passes near it.

const HERO_MACHINES = [
    { id: 'm1', name: 'CNC Machine',     icon: '⚙️', x: 6,  y: 50 },
    { id: 'm2', name: 'Assembly Robot',  icon: '🤖', x: 24, y: 24 },
    { id: 'm3', name: 'Conveyor System', icon: '🏭', x: 43, y: 60 },
    { id: 'm4', name: 'Packaging Unit',  icon: '📦', x: 61, y: 24 },
    { id: 'm5', name: 'Quality Scanner', icon: '🔍', x: 79, y: 50 },
    { id: 'm6', name: 'HVAC System',     icon: '❄️', x: 94, y: 24 },
];

const HERO_RETURN_Y = 86;     // bottom return rail (percent of stage height)
const HERO_SPEED = 0.085;     // px per ms (~85px/s)
const HERO_GLOW_RADIUS = 90;  // px — how close the ball must be to light a machine

let heroPts = [];       // pixel vertices of the closed circuit
let heroSegs = [];      // segment lengths
let heroTotal = 0;      // total circuit length
let heroMachPx = {};    // id -> {x,y} pixel center
let heroMachEls = {};   // id -> DOM node
let heroProgress = 0;   // current arc-length along the circuit
let heroRaf = null;
let heroLast = 0;
let heroVisible = true;

window.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('hero-factory-stage');
    if (!stage) return;

    heroBuild(stage);
    heroResize(stage);

    window.addEventListener('resize', () => heroResize(stage));
    setupHeroVisibility(stage);

    heroRaf = requestAnimationFrame(heroAnimate);
});

// ===== BUILD MACHINE NODES =====
function heroBuild(stage) {
    const machinesDiv = stage.querySelector('#hero-factory-machines');
    if (!machinesDiv) return;

    machinesDiv.innerHTML = '';
    HERO_MACHINES.forEach(m => {
        const node = document.createElement('div');
        node.className = 'hfm-node';
        node.style.left = m.x + '%';
        node.style.top = m.y + '%';
        node.innerHTML = `
            <div class="hfm-circle">
                <span class="hfm-icon">${m.icon}</span>
                <span class="hfm-ring"></span>
            </div>
            <div class="hfm-label">${m.name}</div>
        `;
        machinesDiv.appendChild(node);
        heroMachEls[m.id] = node;
    });
}

// ===== COMPUTE PIXEL LAYOUT + DRAW SVG PATHS =====
function heroResize(stage) {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;

    const px = p => (p / 100) * w;
    const py = p => (p / 100) * h;

    // Forward path: through each machine in order.
    const fwd = HERO_MACHINES.map(m => ({ x: px(m.x), y: py(m.y) }));
    const first = fwd[0];
    const last = fwd[fwd.length - 1];

    // Return path: drop to the bottom rail, run left, rise back to the first machine.
    const lastMachine = HERO_MACHINES[HERO_MACHINES.length - 1];
    const bottomRight = { x: px(lastMachine.x), y: py(HERO_RETURN_Y) };
    const bottomLeft  = { x: px(HERO_MACHINES[0].x), y: py(HERO_RETURN_Y) };

    // Store pixel centers for glow detection.
    HERO_MACHINES.forEach(m => { heroMachPx[m.id] = { x: px(m.x), y: py(m.y) }; });

    // Closed circuit for the ball: forward + bottom rail (closes back to first).
    heroPts = fwd.concat([bottomRight, bottomLeft]);
    heroSegs = [];
    heroTotal = 0;
    const n = heroPts.length;
    for (let i = 0; i < n; i++) {
        const a = heroPts[i];
        const b = heroPts[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        heroSegs.push(len);
        heroTotal += len;
    }

    // Draw the two visible paths.
    const svg = stage.querySelector('#hero-factory-svg');
    if (!svg) return;

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);

    // Forward path (through machines)
    const fwdD = polylineD(fwd);
    // Return path (bottom rail)
    const retPts = [last, { x: bottomRight.x, y: py(HERO_RETURN_Y) }, { x: bottomLeft.x, y: py(HERO_RETURN_Y) }, first];
    const retD = polylineD(retPts);

    setPath(svg, 'hero-path-fwd', 'hfm-path-fwd', fwdD);
    setPath(svg, 'hero-path-ret', 'hfm-path-ret', retD);
}

function polylineD(pts) {
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
    }
    return d;
}

function setPath(svg, id, cls, d) {
    let path = svg.getElementById(id);
    if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('id', id);
        path.setAttribute('class', cls);
        svg.appendChild(path);
    }
    path.setAttribute('d', d);
}

// ===== POINT AT ARC-LENGTH =====
function heroPointAt(dist) {
    if (heroTotal <= 0) return { x: 0, y: 0 };
    let d = ((dist % heroTotal) + heroTotal) % heroTotal;
    for (let i = 0; i < heroSegs.length; i++) {
        if (d <= heroSegs[i]) {
            const a = heroPts[i];
            const b = heroPts[(i + 1) % heroPts.length];
            const t = heroSegs[i] ? d / heroSegs[i] : 0;
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        d -= heroSegs[i];
    }
    return heroPts[0];
}

// ===== ANIMATION LOOP =====
function heroAnimate(ts) {
    if (heroLast === 0) heroLast = ts;
    const dt = Math.min(ts - heroLast, 64); // clamp long pauses
    heroLast = ts;

    const ball = document.getElementById('hero-factory-ball');
    if (heroTotal > 0 && ball) {
        heroProgress = (heroProgress + dt * HERO_SPEED) % heroTotal;
        const p = heroPointAt(heroProgress);
        ball.style.transform = `translate(${p.x}px, ${p.y}px)`;

        // Light up machines near the ball.
        for (const m of HERO_MACHINES) {
            const node = heroMachEls[m.id];
            const c = heroMachPx[m.id];
            if (!node || !c) continue;
            const dist = Math.hypot(p.x - c.x, p.y - c.y);
            const glow = Math.max(0, 1 - dist / HERO_GLOW_RADIUS);
            node.style.setProperty('--glow', glow.toFixed(3));
            node.dataset.active = glow > 0.35 ? 'true' : 'false';
        }
    }

    heroRaf = requestAnimationFrame(heroAnimate);
}

// ===== PAUSE WHEN OFF-SCREEN =====
function setupHeroVisibility(stage) {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
        heroVisible = entries[0].isIntersecting;
        if (heroVisible) {
            if (!heroRaf) {
                heroLast = 0;
                heroRaf = requestAnimationFrame(heroAnimate);
            }
        } else if (heroRaf) {
            cancelAnimationFrame(heroRaf);
            heroRaf = null;
        }
    }, { threshold: 0 });
    io.observe(stage);
}
