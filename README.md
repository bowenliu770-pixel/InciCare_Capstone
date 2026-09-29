# InciCare — AI-Powered Incident Response & Monitoring Console

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0.0-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--Time-010101?logo=socketdotio&logoColor=white)](https://socket.io/)
[![Ollama](https://img.shields.io/badge/Ollama-qwen2.5%3A3b-black?logo=ollama&logoColor=white)](https://ollama.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**InciCare** is an autonomous, real-time Incident Management & Monitoring Console designed for modern IT Operations (ITOps), DevOps, and Site Reliability Engineering (SRE) teams.

It continuously ingests alert data across multiple input vectors (Gmail IMAP, Datadog Webhooks, Generic JSON Webhooks, and RFC 3164 Syslog UDP), automatically classifies severity and impact using a private, local Large Language Model (`qwen2.5:3b` via Ollama), computes SLA countdown windows, extracts geographic incident locations for interactive mapping, and alerts engineers across web, audio, and Telegram.

---

## Table of Contents

- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Where & How Qwen AI Is Used](#where--how-qwen-ai-is-used)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Directory Structure](#project-directory-structure)
- [Prerequisites](#prerequisites)
- [Quick Installation Guide](#quick-installation-guide)
- [Configuration (.env)](#configuration-env)
- [Running the Application](#running-the-application)
- [Fast-Track Demo & Simulation Mode](#fast-track-demo--simulation-mode)
- [Webhook & Integration Endpoints](#webhook--integration-endpoints)
- [Severity Tiers & SLA Rules](#severity-tiers--sla-rules)
- [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Key Features

- **🤖 100% Free & Private Local AI Triage:** Runs entirely on your hardware via Ollama with `qwen2.5:3b`. No external API calls, no third-party data transmission, and zero recurring token costs.
- **⚡ Real-Time WebSocket Feeds:** Live bidirectional updates via Flask-SocketIO. Incidents appear on the dashboard instantly with audio chimes, glowing card animations, and browser desktop notifications.
- **⏱️ Second-by-Second SLA Timers:** Enforces dynamic SLA deadlines depending on incident severity, alerting operators before response windows lapse.
- **🗺️ Interactive Geographic Mapping:** Leaflet-powered global incident map with automatic entity geocoding, clustering, and dark-theme OpenStreetMap tiles (100% free with no API keys required).
- **🧪 Fast-Track Demo & Simulation:** Single-click demo bypass into the console (no Google 2FA or App Passwords required) plus an interactive **Simulate Alert** modal to test live alert pipelines on demand.
- **📲 Multi-Channel Alert Ingestion:**
  - **Email:** Polls Gmail inboxes over secure IMAP SSL with automatic body decoding.
  - **Webhooks:** Native endpoints for Datadog alerts and custom JSON webhooks.
  - **Syslog:** Integrated RFC 3164 UDP listener on port 515.
- **🔔 Telegram Escalation:** Automatically dispatches critical (Tier 1) alerts directly to mobile devices via Telegram Bot API.

---

## How It Works

```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ Gmail (IMAP) │     │ Datadog / API│     │  Syslog UDP  │     │ UI Simulator │
  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
         │                    │                    │                    │
         └────────────────────┼────────────────────┴────────────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │  Unified Ingestion Bus  │ (backend/app.py)
                 └────────────┬────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │ Fast Regex Pre-Triage   │ (Deterministic high-confidence filter)
                 └────────────┬────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │ Ollama (qwen2.5:3b) LLM │ (Semantic CoT classification & NER)
                 └────────────┬────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │ Location Geocoding      │ (City/Region coordinates mapping)
                 └────────────┬────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │ Storage & Socket.IO     │
                 └────────────┬────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ Live Feed UI │     │ Leaflet Map  │     │ Telegram Bot │
  │ + Audio Tone │     │ Coordinates  │     │ Push Alert   │
  └──────────────┘     └──────────────┘     └──────────────┘
```

1. **Ingest:** An alert arrives via Gmail, Webhook, Syslog UDP, or the Dashboard Simulator.
2. **Pre-Triage:** Fast deterministic regex filters classify obvious alerts instantly to save compute.
3. **AI Classification:** Ambiguous alerts are passed to local `qwen2.5:3b`, which analyzes operational impact and outputs structured JSON (Tier, Confidence, Reason, and Locations).
4. **Geocode:** Named places (e.g., *Singapore*, *Jurong*, *Changi*) are converted to coordinates and cached.
5. **Broadcast:** The incident is stored locally, broadcast via Socket.IO, and routed to Telegram if Critical.

---

## Where & How Qwen AI Is Used

The `qwen2.5:3b` model is the primary intelligence engine powering InciCare. It is used across several core components:

1. **Semantic Impact Reasoning (`backend/app.py` -> `classify_alert()`):**
   Unlike simple keyword-matchers that mistake "test alert" for critical events, Qwen evaluates semantic context. It determines whether service impact is *confirmed and ongoing* (Critical) vs *detected / potential* (Medium) vs *routine / informational* (Low).
2. **Named Entity Recognition for Geography:**
   Qwen extracts geographic locations, airports (SIN, LHR), cloud regions (`ap-southeast-1`), and data centers mentioned in alert descriptions to place map markers automatically.
3. **Confidence Scoring & Flagging:**
   Qwen produces a certainty score (0–100%). When an alert is ambiguous (confidence < 65%), it flags `needs_review: true` so human operators can inspect it.
4. **Interactive Re-classification:**
   Operators can trigger on-demand re-classification with custom temperature or manual notes directly from any incident card.
5. **Startup Memory Warmup (`_ollama_warmup()`):**
   On application launch, a background thread preloads `qwen2.5:3b` into memory with `keep_alive: -1` so the very first incident classification executes immediately without latency.

---

## Architecture & Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend** | Python 3.11 / Flask | REST API, WebSocket server, Syslog UDP daemon |
| **Real-Time** | Flask-SocketIO & Eventlet | Low-latency bidirectional event broadcasting |
| **AI Model** | Ollama (`qwen2.5:3b`) | Local Small Language Model for semantic triage |
| **Frontend** | Vanilla HTML5, CSS3, ES6 JS | Fast, responsive, dependency-free client UI |
| **Mapping** | Leaflet.js & OpenStreetMap | Free geographic visualization & marker clustering |
| **Icons** | Lucide Icons | Clean, modern vector UI iconography |
| **Audio** | HTML5 Web Audio API | Synthesized alert chimes with severity-based tones |

---

## Project Directory Structure

```text
InciCare/
├── backend/
│   ├── app.py              # Main Flask & Socket.IO server, AI pipeline, API routes
│   └── requirements.txt    # Python package dependencies
├── frontend/
│   ├── index.html          # Primary incident overview feed and simulation controls
│   ├── app.js              # Real-time WebSocket handlers, audio alerts, and UI logic
│   ├── map.html / map.js   # Interactive Leaflet incident geographic tracker
│   ├── settings.html       # Runtime AI model and notification preferences
│   ├── dispatch.html       # Operator triage and dispatch station
│   ├── factory.html        # Interactive simulated topology view
│   ├── completed.html      # Historical log of resolved / finished incidents
│   ├── nav.js / nav.css    # Unified collapsible sidebar navigation
│   └── style.css           # Premium dark-mode glassmorphic design system
├── data/                   # Persistent local incident JSON data
├── .env                    # Active local environment configuration (git-ignored)
├── .env.example            # Documented environment configuration template
├── .gitignore              # Git ignore rules for .env and cache files
├── run_backend.bat         # 1-click Windows CMD launcher with custom title
└── README.md               # Project documentation
```

---

## Prerequisites

Before setting up InciCare, ensure your machine has:

1. **Python 3.11.x (Recommended):** [Download Python 3.11](https://www.python.org/downloads/)
2. **Git:** [Download Git](https://git-scm.com/)
3. **Ollama:** [Download Ollama](https://ollama.com/) (Required for local AI triage)

---

## Quick Installation Guide

### Step 1: Clone the Repository
```bash
git clone https://github.com/bowenliu770-pixel/InciCare_Capstone.git InciCare
cd InciCare
```

### Step 2: Set Up Python Virtual Environment
```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies
```bash
pip install -r backend/requirements.txt
```

### Step 4: Pull and Start the Ollama AI Model
Ensure Ollama is running, then pull the `qwen2.5:3b` model:
```bash
ollama run qwen2.5:3b
```
*(Once downloaded, you can close the interactive chat; Ollama keeps the model ready in the background).*

### Step 5: Configure Environment Variables
Create your local `.env` from the template:
```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

---

## Configuration (.env)

Edit `.env` to customize ports, models, or credentials:

```ini
# ==============================================================================
# InciCare — Local Environment Configuration
# ==============================================================================

# --- Server Configuration ---
PORT=5262
HOST=0.0.0.0

# --- Telegram Alert Notifications (Optional) ---
# Automatically sends a push message when a Critical (Tier 1) alert occurs
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# --- Ollama AI Configuration ---
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=qwen2.5:3b

# --- Incident Map Tile Provider ---
# 100% Free OpenStreetMap default (No API key needed)
MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
MAP_ATTRIBUTION=&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
MAP_API_KEY=
```

---

## Running the Application

### Option A: Using the Windows Launcher (Easiest)
Double-click **`run_backend.bat`** in the project root folder. It will configure the terminal title and boot the server.

### Option B: Using the Terminal
```bash
# Activate your virtual environment first
.\venv\Scripts\activate

# Run the server
python backend/app.py
```

Once running, access the dashboard in your browser:
- **Local Access:** [http://localhost:5262](http://localhost:5262)
- **Local Network Access:** `http://<your-lan-ip>:5262` (e.g. `http://172.20.146.254:5262`)

---

## Fast-Track Demo & Simulation Mode

InciCare includes built-in demo utilities so you can evaluate the platform without configuring external Gmail accounts or 2FA passwords:

### 1. One-Click Demo Entry
1. Open [http://localhost:5262](http://localhost:5262).
2. On the welcome dialog, click the purple **"🚀 Launch Live Demo Directly"** button.
3. This bypasses Gmail authentication, loads realistic pre-seeded incidents, and opens the monitoring console immediately.

### 2. Live Alert Simulation
1. In the Incident Feed header, click **"⚡ Simulate Alert"**.
2. Select one of the 1-click presets:
   - 🔴 **Tier 1 (Critical):** `Primary DB Cluster Failover Timeout` *(Jurong Data Center)*
   - 🟡 **Tier 2 (Medium):** `High API Latency & Memory Degradation` *(Woodlands Hub)*
   - 🟢 **Tier 3 (Low):** `SSL Certificate Automated Renewal Notice` *(Changi Node)*
3. Click **"🚀 Inject & Trigger Alert"**.
4. Observe the full alert lifecycle:
   - Audio chime rings through your speakers.
   - Severity toast notification pops up.
   - Pulsing card appears dynamically at the top of the feed.
   - SLA countdown begins ticking down second-by-second.
   - Incident location pins directly onto the **Map View**.

---

## Webhook & Integration Endpoints

InciCare exposes standard integration endpoints to ingest incidents from external monitoring platforms:

### 1. Generic JSON Webhook
```http
POST /api/webhook/generic?user_id=<user_id>
Content-Type: application/json

{
  "title": "API Gateway High Error Rate",
  "body": "5xx error rate exceeded 15% on Singapore Edge Router over a 5-minute rolling window.",
  "hostname": "prod-sg-gateway-01"
}
```

### 2. Datadog Monitor Webhook
```http
POST /api/webhook/datadog?user_id=<user_id>
Content-Type: application/json

{
  "title": "Monitor Alert: [P1] Payment Service Deadlock",
  "body": "Deadlock detected in transaction processor in Jurong Data Center.",
  "hostname": "payment-db-prod"
}
```

### 3. Syslog UDP Listener
Send standard RFC 3164 Syslog messages over UDP to port `515`:
```text
<11>Sep 29 10:00:00 prod-gw-01 kernel: Out of memory: Kill process 1248 (java)
```

---

## Severity Tiers & SLA Rules

| Tier | Severity | SLA Window | Description & Trigger Criteria | Action Taken |
| :---: | :---: | :---: | :--- | :--- |
| **Tier 1** | **Critical** | **8 Minutes** | Total service outage, active security breach, confirmed data corruption affecting all users. | Urgent triple chime, red pulse card, Telegram mobile alert. |
| **Tier 2** | **Medium** | **40 Minutes** | Service degraded, elevated latency, memory pressure, suspicious activity requiring investigation. | Single audio tone, yellow alert card, queue priority. |
| **Tier 3** | **Low** | **4 Hours** | Routine operational notice, scheduled backup, automated certificate rotation, or resolved notice. | Silent logging, green informational badge. |

---

## Troubleshooting & FAQ

#### 1. Why is the Incident Map blank?
InciCare uses OpenStreetMap tiles by default (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`). If your network or firewall restricts tile downloads, verify your internet connection or supply a custom tile provider / API key in `.env`.

#### 2. How do I fix "Failed to connect to backend server"?
Ensure `python backend/app.py` is actively running in your terminal and that port `5262` is not blocked by another application.

#### 3. What if Ollama is not installed or model is missing?
If Ollama is not running on `http://localhost:11434`, InciCare gracefully falls back to deterministic regex triage so the dashboard remains functional even without an active GPU. To run full AI triage, install Ollama and run `ollama run qwen2.5:3b`.

#### 4. Can I use my real Gmail inbox?
Yes! Click **"Sign In"** in the sidebar, enter your Gmail address, and paste a 16-character **Google App Password** (generated from your Google Account under *Security → 2-Step Verification → App passwords*).

---

## License

This project is licensed under the MIT License — see the LICENSE file for details.
