// ===== InciCare — Smart Factory Topology (factory.js) =====

// STORAGE_KEY_* constants are declared in nav.js (loaded before this file)

// ===== MACHINE CONFIGURATION (static, editable) =====
// Positions are percentages (0-100) relative to the container
// Add or remove machines freely — connections auto-update
const MACHINES = [
    { id: 'm1', name: 'CNC Machine',      x: 18, y: 25, icon: '⚙️' },
    { id: 'm2', name: 'Assembly Robot',    x: 48, y: 15, icon: '🤖' },
    { id: 'm3', name: 'Conveyor System',   x: 78, y: 25, icon: '🏭' },
    { id: 'm4', name: 'Packaging Unit',    x: 82, y: 60, icon: '📦' },
    { id: 'm5', name: 'Quality Scanner',   x: 50, y: 72, icon: '🔍' },
    { id: 'm6', name: 'HVAC System',       x: 18, y: 68, icon: '❄️' },
];

// Connections define which machines are linked (by id)
const CONNECTIONS = [
    ['m1', 'm2'], ['m2', 'm3'],
    ['m3', 'm4'], ['m4', 'm5'],
    ['m5', 'm6'], ['m6', 'm1'],
    ['m1', 'm3'], ['m2', 'm5'],
    ['m3', 'm5'], ['m4', 'm6'],
];

// ===== STATE =====
let incidents = [];
let machineIncidents = {};    // machineId → filtered incidents array
let machineElements = {};     // machineId → DOM element
let socket = null;
let currentUserId = null;
let currentUserEmail = null;
let selectedMachineId = null;
let resizeObserver = null;

// ===== INITIALIZATION =====
window.addEventListener('DOMContentLoaded', async () => {
    currentUserId    = localStorage.getItem(STORAGE_KEY_USER_ID);
    currentUserEmail = localStorage.getItem(STORAGE_KEY_EMAIL);

    // Always build the topology (works in demo mode without login)
    buildTopology();
    updateMachineCount();
    startParticleAnimation();

    // Check login
    if (!currentUserId) {
        const loadingEl = document.getElementById('factory-loading');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px 32px;text-align:center;">
                    <p style="color:#fbbf24;font-size:16px;font-weight:600;margin:0 0 8px;">⚠ Demo Mode — Not Signed In</p>
                    <p style="color:var(--text-secondary);font-size:13px;margin:0 0 16px;">Sign in from the Dashboard to see real incident data.</p>
                    <button onclick="window.location.href='/'" style="background:var(--accent);color:#000;border:none;padding:8px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Go to Dashboard →</button>
                </div>
            `;
            loadingEl.style.display = 'flex';
            loadingEl.style.alignItems = 'center';
            loadingEl.style.justifyContent = 'center';
        }
        updateAllMachineStatusesDemo();
        // Auto-hide loading after 5s
        setTimeout(() => {
            if (loadingEl) loadingEl.style.opacity = '0';
            setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 500);
        }, 5000);
        return;
    }

    // Logged in: fetch real incident data + enable real-time updates
    await loadIncidents();
    setupSocket();
    setupResizeObserver();

    // Set up click-outside to close popup
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('machine-popup');
        const backdrop = document.getElementById('popup-backdrop');
        if (!popup || !backdrop) return;
        if (!popup.contains(e.target) && !e.target.closest('.machine-node')) {
            hidePopup();
        }
    });

    // Hide loading
    const loadingEl = document.getElementById('factory-loading');
    if (loadingEl) loadingEl.style.display = 'none';

    // Update connection status
    const statusEl = document.getElementById('factory-connection-status');
    if (statusEl) statusEl.innerHTML = '● Connected';
});

// ===== BUILD SVG + DOM TOPOLOGY =====
function buildTopology() {
    const container = document.getElementById('factory-container');
    const svg = document.getElementById('factory-svg');
    const machinesDiv = document.getElementById('factory-machines');
    if (!container || !svg || !machinesDiv) return;

    // --- Draw SVG connection lines ---
    svg.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';

    // Create defs for gradient lines (flow effect)
    const defs = document.createElementNS(svgNS, 'defs');
    CONNECTIONS.forEach(([fromId, toId], i) => {
        const gradient = document.createElementNS(svgNS, 'linearGradient');
        gradient.setAttribute('id', `line-gradient-${i}`);
        gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        // Will be updated on draw
        const stop1 = document.createElementNS(svgNS, 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', 'var(--accent)');
        stop1.setAttribute('stop-opacity', '0.3');
        const stop2 = document.createElementNS(svgNS, 'stop');
        stop2.setAttribute('offset', '50%');
        stop2.setAttribute('stop-color', 'var(--accent)');
        stop2.setAttribute('stop-opacity', '0.9');
        const stop3 = document.createElementNS(svgNS, 'stop');
        stop3.setAttribute('offset', '100%');
        stop3.setAttribute('stop-color', 'var(--accent)');
        stop3.setAttribute('stop-opacity', '0.3');
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        gradient.appendChild(stop3);
        defs.appendChild(gradient);
    });
    svg.appendChild(defs);

    // Create a group for the connection lines
    const linesGroup = document.createElementNS(svgNS, 'g');
    linesGroup.setAttribute('id', 'connections-group');

    CONNECTIONS.forEach(([fromId, toId], i) => {
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('id', `line-${i}`);
        line.setAttribute('data-from', fromId);
        line.setAttribute('data-to', toId);
        line.classList.add('factory-line', 'animated');
        linesGroup.appendChild(line);
    });

    // Create a group for flow particles (small glowing dots)
    const particlesGroup = document.createElementNS(svgNS, 'g');
    particlesGroup.setAttribute('id', 'particles-group');

    // Add 2 particles per connection
    CONNECTIONS.forEach((_, i) => {
        for (let p = 0; p < 2; p++) {
            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('r', '4');
            circle.setAttribute('id', `particle-${i}-${p}`);
            circle.classList.add('flow-particle');
            circle.style.animationDelay = `-${p * 1.5}s`;
            particlesGroup.appendChild(circle);
        }
    });

    svg.appendChild(linesGroup);
    svg.appendChild(particlesGroup);

    // --- Render machine DOM nodes ---
    machinesDiv.innerHTML = '';
    MACHINES.forEach(machine => {
        const node = document.createElement('div');
        node.id = `machine-${machine.id}`;
        node.className = 'machine-node';
        node.style.left = `${machine.x}%`;
        node.style.top = `${machine.y}%`;
        node.title = machine.name;
        node.onclick = (e) => {
            e.stopPropagation();
            showPopup(machine);
        };

        node.innerHTML = `
            <div class="machine-circle">
                <span class="machine-icon">${machine.icon}</span>
                <span class="machine-status-dot" id="status-${machine.id}"></span>
            </div>
            <div class="machine-label">${machine.name}</div>
            <div class="machine-count" id="count-${machine.id}">No incidents</div>
        `;

        machinesDiv.appendChild(node);
        machineElements[machine.id] = node;
    });

    // Initial draw of lines
    updateConnectionPositions();
}

// ===== UPDATE SVG LINE POSITIONS =====
function updateConnectionPositions() {
    const container = document.getElementById('factory-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    CONNECTIONS.forEach(([fromId, toId], i) => {
        const line = document.getElementById(`line-${i}`);
        if (!line) return;

        const fromMachine = MACHINES.find(m => m.id === fromId);
        const toMachine = MACHINES.find(m => m.id === toId);
        if (!fromMachine || !toMachine) return;

        const x1 = (fromMachine.x / 100) * width;
        const y1 = (fromMachine.y / 100) * height;
        const x2 = (toMachine.x / 100) * width;
        const y2 = (toMachine.y / 100) * height;

        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);

        // Update gradient coordinates
        const gradient = document.getElementById(`line-gradient-${i}`);
        if (gradient) {
            gradient.setAttribute('x1', x1);
            gradient.setAttribute('y1', y1);
            gradient.setAttribute('x2', x2);
            gradient.setAttribute('y2', y2);
        }
    });

    // Update particle positions along lines
    updateParticlePositions();
}

// ===== UPDATE FLOW PARTICLE POSITIONS =====
// Particles are animated via CSS offset-path, but we need to
// use a JS-based approach since SVG <circle> doesn't support offset-path well.
// Instead we create the illusion of flow using CSS animation on dashoffset
// for the lines, and use small animated circles that travel along paths.
function updateParticlePositions() {
    const container = document.getElementById('factory-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    let particleIdx = 0;
    CONNECTIONS.forEach(([fromId, toId], i) => {
        const fromMachine = MACHINES.find(m => m.id === fromId);
        const toMachine = MACHINES.find(m => m.id === toId);
        if (!fromMachine || !toMachine) return;

        const x1 = (fromMachine.x / 100) * width;
        const y1 = (fromMachine.y / 100) * height;
        const x2 = (toMachine.x / 100) * width;
        const y2 = (toMachine.y / 100) * height;

        for (let p = 0; p < 2; p++) {
            const circle = document.getElementById(`particle-${i}-${p}`);
            if (circle) {
                const t = p === 0 ? 0.25 : 0.75; // starting positions along the line
                const cx = x1 + (x2 - x1) * t;
                const cy = y1 + (y2 - y1) * t;
                circle.setAttribute('cx', cx);
                circle.setAttribute('cy', cy);

                // Store line endpoints as data attributes for animation
                circle.setAttribute('data-x1', x1);
                circle.setAttribute('data-y1', y1);
                circle.setAttribute('data-x2', x2);
                circle.setAttribute('data-y2', y2);
            }
            particleIdx++;
        }
    });
}

// ===== PARTICLE ANIMATION LOOP =====
let animationId = null;
let particlePhases = []; // per-particle phase offset (0-1)

function startParticleAnimation() {
    // Initialize random phases per particle
    const totalParticles = CONNECTIONS.length * 2;
    particlePhases = Array.from({ length: totalParticles }, () => Math.random());

    function animate() {
        const container = document.getElementById('factory-container');
        if (!container || !document.getElementById('particles-group')) {
            animationId = requestAnimationFrame(animate);
            return;
        }

        let particleIdx = 0;
        const speed = 0.002; // phase advance per frame

        CONNECTIONS.forEach(([fromId, toId], i) => {
            for (let p = 0; p < 2; p++) {
                const circle = document.getElementById(`particle-${i}-${p}`);
                if (circle) {
                    const x1 = parseFloat(circle.getAttribute('data-x1')) || 0;
                    const y1 = parseFloat(circle.getAttribute('data-y1')) || 0;
                    const x2 = parseFloat(circle.getAttribute('data-x2')) || 0;
                    const y2 = parseFloat(circle.getAttribute('data-y2')) || 0;

                    // Advance phase
                    particlePhases[particleIdx] = (particlePhases[particleIdx] + speed) % 1;
                    const t = particlePhases[particleIdx];

                    // Use easing for smoother look: slow at ends, fast in middle
                    const tEased = t < 0.15 ? (t / 0.15) * 1 :
                                   t > 0.85 ? (1 - t) / 0.15 * 1 :
                                   1;

                    const cx = x1 + (x2 - x1) * t;
                    const cy = y1 + (y2 - y1) * t;

                    circle.setAttribute('cx', cx);
                    circle.setAttribute('cy', cy);

                    // Fade at endpoints
                    const fadeInEnd = 0.15;
                    const fadeOutStart = 0.85;
                    let opacity = 1;
                    if (t < fadeInEnd) opacity = t / fadeInEnd;
                    else if (t > fadeOutStart) opacity = (1 - t) / (1 - fadeOutStart);
                    opacity = Math.max(0, Math.min(1, opacity));
                    circle.setAttribute('opacity', opacity);
                }
                particleIdx++;
            }
        });

        animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);
}

function stopParticleAnimation() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// ===== FETCH INCIDENTS =====
async function loadIncidents() {
    try {
        const resp = await fetch(`/api/incidents?user_id=${encodeURIComponent(currentUserId)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        incidents = data.incidents || [];
        console.log(`🏭 Loaded ${incidents.length} incidents`);

        // Compute machine-incident mapping
        recomputeAllMachineStatuses();

        // Start particle animation now that everything is ready
        startParticleAnimation();

        // Update header stats
        updateHeaderStats();
    } catch (err) {
        console.error('Failed to load incidents:', err);
        const statusEl = document.getElementById('factory-connection-status');
        if (statusEl) statusEl.innerHTML = '⚠ Offline';
    }
}

// ===== INCIDENT MATCHING =====
function machineHasIncident(machineName, incident) {
    const searchText = [
        incident.title || '',
        incident.full_body || '',
        incident.description || '',
        ...(incident.location_names || [])
    ].join(' ').toLowerCase();
    return searchText.includes(machineName.toLowerCase());
}

// ===== RECOMPUTE ALL MACHINE STATUSES =====
function recomputeAllMachineStatuses() {
    const activeIncidents = incidents.filter(inc => !inc.finished);

    MACHINES.forEach(machine => {
        const matched = activeIncidents.filter(inc => machineHasIncident(machine.name, inc));
        machineIncidents[machine.id] = matched;
        updateMachineVisual(machine, matched);
    });
}

// ===== UPDATE SINGLE MACHINE VISUAL =====
function updateMachineVisual(machine, matchedIncidents) {
    const node = machineElements[machine.id];
    if (!node) return;

    const statusDot = document.getElementById(`status-${machine.id}`);
    const countEl = document.getElementById(`count-${machine.id}`);

    // Determine status
    const hasCritical = matchedIncidents.some(inc => inc.tier === 1);
    const hasMedium = matchedIncidents.some(inc => inc.tier === 2);
    const count = matchedIncidents.length;

    // Update node class
    node.classList.remove('critical', 'medium');
    if (hasCritical) {
        node.classList.add('critical');
    } else if (hasMedium) {
        node.classList.add('medium');
    }

    // Update status dot
    if (statusDot) {
        statusDot.classList.remove('critical', 'medium', 'low');
        if (hasCritical) {
            statusDot.classList.add('critical');
        } else if (hasMedium) {
            statusDot.classList.add('medium');
        } else {
            statusDot.classList.add('low');
        }
    }

    // Update count label
    if (countEl) {
        if (count > 0) {
            countEl.textContent = `${count} incident${count > 1 ? 's' : ''}`;
            countEl.classList.add('has-incidents');
            if (hasCritical) countEl.style.color = 'var(--tier1)';
            else if (hasMedium) countEl.style.color = 'var(--tier2)';
            else countEl.style.color = 'var(--tier3)';
        } else {
            countEl.textContent = 'No incidents';
            countEl.classList.remove('has-incidents');
            countEl.style.color = '';
        }
    }

    // Update connection lines touching this machine
    updateConnectionLineStyles(machine.id, hasCritical, hasMedium);
}

// ===== UPDATE CONNECTION LINE STYLES =====
function updateConnectionLineStyles(machineId, hasCritical, hasMedium) {
    // Find all connections that involve this machine
    CONNECTIONS.forEach(([fromId, toId], i) => {
        if (fromId !== machineId && toId !== machineId) return;

        const line = document.getElementById(`line-${i}`);
        if (!line) return;

        line.classList.remove('critical-path', 'medium-path');

        // Style based on the worst status of BOTH connected machines
        const otherId = fromId === machineId ? toId : fromId;
        const thisMachineCritical = hasCritical;
        const otherMachineCritical = machineIncidents[otherId]?.some(inc => inc.tier === 1) || false;
        const thisMachineMedium = hasMedium;
        const otherMachineMedium = machineIncidents[otherId]?.some(inc => inc.tier === 2) || false;

        if (thisMachineCritical || otherMachineCritical) {
            line.classList.add('critical-path');
        } else if (thisMachineMedium || otherMachineMedium) {
            line.classList.add('medium-path');
        }
    });
}

// ===== UPDATE ALL CONNECTION LINES =====
function updateAllConnectionLines() {
    CONNECTIONS.forEach(([fromId, toId], i) => {
        const fromIncidents = machineIncidents[fromId] || [];
        const toIncidents = machineIncidents[toId] || [];
        const fromCritical = fromIncidents.some(inc => inc.tier === 1);
        const toCritical = toIncidents.some(inc => inc.tier === 1);
        const fromMedium = fromIncidents.some(inc => inc.tier === 2);
        const toMedium = toIncidents.some(inc => inc.tier === 2);

        const line = document.getElementById(`line-${i}`);
        if (!line) return;

        line.classList.remove('critical-path', 'medium-path');
        if (fromCritical || toCritical) {
            line.classList.add('critical-path');
        } else if (fromMedium || toMedium) {
            line.classList.add('medium-path');
        }
    });
}

// ===== DEMO MODE — show all machines as green/ok =====
function updateAllMachineStatusesDemo() {
    MACHINES.forEach(machine => {
        machineIncidents[machine.id] = [];
        const node = machineElements[machine.id];
        if (!node) return;

        const statusDot = document.getElementById(`status-${machine.id}`);
        const countEl = document.getElementById(`count-${machine.id}`);

        node.classList.remove('critical', 'medium');
        if (statusDot) {
            statusDot.classList.remove('critical', 'medium');
            statusDot.classList.add('low');
        }
        if (countEl) {
            countEl.textContent = 'No incidents';
            countEl.classList.remove('has-incidents');
            countEl.style.color = '';
        }
    });
}

// ===== SHOW POPUP =====
function showPopup(machine) {
    const popup = document.getElementById('machine-popup');
    const backdrop = document.getElementById('popup-backdrop');
    const titleEl = document.getElementById('popup-machine-name');
    const listEl = document.getElementById('popup-incident-list');
    const node = machineElements[machine.id];
    const container = document.getElementById('factory-container');
    if (!popup || !backdrop || !titleEl || !listEl || !node || !container) return;

    selectedMachineId = machine.id;

    // Set title with icon
    const matched = machineIncidents[machine.id] || [];
    const criticalCount = matched.filter(inc => inc.tier === 1).length;
    titleEl.innerHTML = `${machine.icon} ${machine.name} <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(${matched.length} incident${matched.length !== 1 ? 's' : ''}${criticalCount > 0 ? `, ${criticalCount} critical` : ''})</span>`;

    // Build incident list
    if (matched.length === 0) {
        listEl.innerHTML = '<div class="factory-popup-empty">✅ No incidents found for this machine.<br><small style="color:var(--text-muted);">All systems operating normally.</small></div>';
    } else {
        listEl.innerHTML = matched.map(inc => `
            <div class="popup-incident tier${inc.tier}" onclick="window.location.href='/?highlight=${encodeURIComponent(inc.id)}'" title="Click to view in Dashboard">
                <div class="popup-incident-header">
                    <span class="popup-incident-id">${escHtml(inc.id)}</span>
                    <span class="popup-incident-tier t${inc.tier}">${escHtml(inc.tier_label)}</span>
                    ${inc.acknowledged ? '<span style="font-size:10px;color:#22c55e;">✓ ACK</span>' : ''}
                </div>
                <div class="popup-incident-title">${escHtml(inc.title)}</div>
                <div class="popup-incident-meta">
                    ${escHtml(inc.source)} · ${escHtml(inc.created_at)} · SLA: ${formatSla(inc.sla_countdown)}
                    ${inc.confidence ? ` · AI: ${inc.confidence}%` : ''}
                </div>
            </div>
        `).join('');
    }

    // Position popup near the machine node
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const popupWidth = 380;

    let left = nodeRect.left - containerRect.left + (nodeRect.width / 2) - (popupWidth / 2);
    let top = nodeRect.top - containerRect.top + nodeRect.height + 16;

    // Clamp within container
    if (left < 10) left = 10;
    if (left + popupWidth > containerRect.width - 10) left = containerRect.width - popupWidth - 10;
    if (top + 420 > containerRect.height) {
        // Show above the machine instead
        top = nodeRect.top - containerRect.top - 430;
        if (top < 10) top = 10;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.classList.add('active');
    backdrop.classList.add('active');

    // Highlight the selected machine
    Object.values(machineElements).forEach(el => el.style.filter = '');
    node.style.filter = 'brightness(1.3) drop-shadow(0 0 12px var(--accent))';
}

// ===== HIDE POPUP =====
function hidePopup() {
    const popup = document.getElementById('machine-popup');
    const backdrop = document.getElementById('popup-backdrop');
    if (popup) popup.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    selectedMachineId = null;

    // Remove highlight from all machines
    Object.values(machineElements).forEach(el => el.style.filter = '');
}

// ===== SOCKET.IO REAL-TIME =====
function setupSocket() {
    try {
        socket = io();
        socket.on('connect', () => {
            console.log('🏭 Factory socket connected');
            socket.emit('bind_user', currentUserId);
            const statusEl = document.getElementById('factory-connection-status');
            if (statusEl) statusEl.innerHTML = '● Connected';
        });

        socket.on('new_incident', (payload) => {
            const msgUserId = payload.client_user_id;
            if (msgUserId && currentUserId && msgUserId !== currentUserId) return;

            const inc = payload.incident || payload;
            // Add to local state
            incidents.unshift(inc);

            // Check which machines match
            let anyMachineMatched = false;
            MACHINES.forEach(machine => {
                if (machineHasIncident(machine.name, inc)) {
                    machineIncidents[machine.id].unshift(inc);
                    updateMachineVisual(machine, machineIncidents[machine.id]);
                    anyMachineMatched = true;
                }
            });

            if (anyMachineMatched) {
                updateAllConnectionLines();
                updateHeaderStats();

                // If popup is open for a machine, refresh it
                if (selectedMachineId) {
                    const machine = MACHINES.find(m => m.id === selectedMachineId);
                    if (machine) showPopup(machine);
                }
            }

            console.log(`🏭 Real-time: ${inc.id} matched ${anyMachineMatched ? 'some' : 'no'} machines`);
        });

        socket.on('incident_updated', (payload) => {
            const msgUserId = payload.client_user_id;
            if (msgUserId && currentUserId && msgUserId !== currentUserId) return;

            const updatedInc = payload.incident || payload;
            // Replace in local state
            const idx = incidents.findIndex(inc => inc.id === updatedInc.id);
            if (idx !== -1) {
                incidents[idx] = updatedInc;
            }

            // Recompute for all machines
            recomputeAllMachineStatuses();
            updateAllConnectionLines();
            updateHeaderStats();

            if (selectedMachineId) {
                const machine = MACHINES.find(m => m.id === selectedMachineId);
                if (machine) showPopup(machine);
            }
        });

        socket.on('disconnect', () => {
            console.log('🏭 Factory socket disconnected');
            const statusEl = document.getElementById('factory-connection-status');
            if (statusEl) statusEl.innerHTML = '⚠ Offline';
        });

        socket.on('connect_error', () => {
            console.warn('Factory: socket offline');
            const statusEl = document.getElementById('factory-connection-status');
            if (statusEl) statusEl.innerHTML = '⚠ Offline';
        });
    } catch (e) {
        console.warn('Factory: Socket.IO not available');
    }
}

// ===== RESIZE HANDLING =====
function setupResizeObserver() {
    const container = document.getElementById('factory-container');
    if (!container) return;

    // Use ResizeObserver for smooth responsive updates
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
            updateConnectionPositions();
            updateParticlePositions();
        });
        resizeObserver.observe(container);
    } else {
        // Fallback to window resize
        window.addEventListener('resize', () => {
            updateConnectionPositions();
            updateParticlePositions();
        });
    }

    // Initial position
    setTimeout(() => {
        updateConnectionPositions();
        updateParticlePositions();
    }, 100);
}

// ===== HEADER STATS =====
function updateMachineCount() {
    const el = document.getElementById('machine-count');
    if (el) el.textContent = MACHINES.length;
}

function updateHeaderStats() {
    const activeIncidents = incidents.filter(inc => !inc.finished);
    const el = document.getElementById('factory-incident-count');
    if (el) el.textContent = activeIncidents.length;

    const criticalCount = activeIncidents.filter(inc => inc.tier === 1).length;
    const mediumCount = activeIncidents.filter(inc => inc.tier === 2).length;
    const breakdownEl = document.getElementById('status-tier-breakdown');
    if (breakdownEl) {
        breakdownEl.textContent = `${criticalCount} Critical · ${mediumCount} Medium · ${activeIncidents.length - criticalCount - mediumCount} Low`;
    }
}

// ===== HELPER: ESCAPE HTML =====
function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== HELPER: FORMAT SLA =====
function formatSla(seconds) {
    if (!seconds && seconds !== 0) return '—';
    if (seconds <= 0) return 'Expired';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// ===== CLEANUP =====
window.addEventListener('beforeunload', () => {
    stopParticleAnimation();
    if (resizeObserver) resizeObserver.disconnect();
    if (socket) socket.disconnect();
});
