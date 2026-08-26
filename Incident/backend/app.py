import os
import sys
import warnings
import requests



# ======================================================
# TELEGRAM CRITICAL ALERT CONFIGURATION
# Sends a Telegram notification whenever a Critical
# (Tier 1) incident is detected.
# ======================================================

BOT_TOKEN = "8696134301:AAEjs46Uqote89h4wQShKbN5rbiHxXpuumo"
CHAT_ID = "6856567076"


def send_telegram(message):
    """
    Send a Telegram message to the configured chat.
    """

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

    try:
        response = requests.post(
            url,
            json={
                "chat_id": CHAT_ID,
                "text": message
            },
            timeout=10
        )

        if response.status_code == 200:
            print("✅ Telegram notification sent successfully")
        else:
            print(f"❌ Telegram Error: {response.text}")

    except Exception as e:
        print(f"❌ Telegram Exception: {e}")

# ======================================================
# END TELEGRAM CONFIGURATION
# ======================================================
# ===== FIX WINDOWS CONSOLE UNICODE PRINTING =====
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# ===== SUPPRESS ALL WARNINGS =====
warnings.filterwarnings("ignore")
os.environ["EVENTLET_NO_GREENDNS"] = "yes"
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["GREENLET_DEBUG"] = "0"
os.environ["PYTHONTHREADDEBUG"] = "0"

import threading
import time
import json
import hashlib
import re
import socket as _sock_module
import imaplib
import email
from email.header import decode_header

from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, join_room, leave_room
from flask_cors import CORS
import requests

app = Flask(__name__)
app.config['SECRET_KEY'] = "comhub-2026-secret-assignment"
CORS(app)

# ===== FIX: SocketIO with threading mode =====
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ===== LLM CONFIGURATION (100% FREE, UNLIMITED, OFFLINE) =====
# All models run locally via Ollama — no API keys, no rate limits, no internet needed.
# Install: https://ollama.com
# Pull a model:  ollama pull llama3.1:8b
# Switch models: set OLLAMA_MODEL env var or edit the default below.
#
# Recommended free models for email classification (best → good):
#   llama3.1:8b    ← Meta, best overall accuracy
#   qwen2.5:7b     ← Alibaba, best at structured JSON output
#   gemma2:9b      ← Google open model, very accurate
#   mistral:7b     ← lighter, faster, less accurate
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")  # fast, good at structured output
SLA_CONFIG = {1: 480, 2: 2400, 3: 14400}
SERVER_START_TIME = time.time()  # used by frontend to detect server restarts

# ===== LLM CLASSIFICATION — Multi-Strategy (CoT + Regex + Escalation) =====
# Confidence threshold below which an incident is flagged for human review.
CONF_REVIEW_THRESHOLD = 65

# Model escalation: when the small model is uncertain (confidence < threshold),
# automatically re-classify with a larger, more capable model.
OLLAMA_FALLBACK_MODEL = os.environ.get("OLLAMA_FALLBACK_MODEL", "qwen2.5:7b")
ESCALATION_THRESHOLD = 75  # confidence below this → escalate to fallback model

# Regex triage: fast deterministic patterns handle the obvious cases.
# Only ambiguous alerts reach the LLM, saving token budget for hard cases.
REGEX_TRIAGE_CONFIDENCE = 85  # confidence assigned to regex-only classifications

def _regex_triage(title: str, body: str) -> dict | None:
    """Fast deterministic pre-filter using regex patterns (not just keywords).

    Catches obvious Tier-1 (total outage / breach) and Tier-3 (routine notices)
    so the LLM only sees genuinely ambiguous alerts. Returns None when the
    patterns don't give a clear signal — the caller should fall through to LLM.

    Patterns are weighted (±3 points each). High-confidence when:
      - Tier-1 score ≥ 6 AND Tier-3 score == 0 → Tier 1
      - Tier-3 score ≥ 6 AND Tier-1 score == 0 → Tier 3

    Returns: {"tier", "tier_label", "reason", "confidence", "locations": [], "classification_flags": ["regex_triage"]}
    or None if uncertain.
    """
    text = (title + " " + body).lower()

    # --- Tier 1 patterns (weighted: strong=6pts, moderate=3pts) ---
    t1_strong = [
        r'\b(?:ransomware|ddos|data\s+(?:breach|loss|leak|stolen)|(?:security|cyber)\s*attack|computer\s+virus|virus|hacker|hackers|hacking)\b',
        r'\b(?:total\s+(?:outage|failure|blackout)|complete\s+(?:outage|failure|loss)|major\s+(?:incident|outage|breach))\b',
        r'\b(?:oom|out\s+of\s+memory|kernel\s+panic|system\s+crash|memory\s+exhaustion)\b',
        r'\b(?:data\s+(?:corruption|wipe|destroyed)|database\s+(?:corrupt|destroyed|gone))\b',
        r'\b(?:critical|emergency|p0|severity\s*(?:1|critical))\b',
        # "100% ... failing" — % is non-word char so skip \b after %
        r'(?:^|\s)(?:100%|all\s+(?:traffic|users?|requests?|endpoints?|services?|customers?)).{0,30}?\b(?:fail(?:ing|ed)?|down|error|outage|loss)\b',
    ]
    t1_moderate = [
        r'\b(?:service|system|cluster|database|server|api|gateway|platform|site|app(?:lication)?)\b.{0,30}?\b(?:down|dead|offline|unresponsive|unavailable|unreachable|outage|crash|failure|breach|hack)\b',
        r'\b(?:complet(?:e|ely)|totally|entirely)\b.{0,20}?\b(?:down|dead|offline|unresponsive|unavailable|fail(?:ing|ed)?|out(?:age)?|broken|bricked)\b',
        r'\b(?:is|went|gone|stopped|became)\s+(?:down|dead|offline|unresponsive|unavailable)\b',
        r'\b(?:cannot|can\'?t|unable\s+to)\s+(?:connect|access|reach|login|use|start)\b',
        r'\b(?:stopped\s+(?:responding|working|functioning)|not\s+(?:responding|working|functional))\b',
    ]

    # --- Tier 2 patterns (weighted: 3pts each, for tracking only — no direct triage) ---
    t2_patterns = [
        r'\b(?:slow|slowness|degrad(?:ed|ation)|latency|lag(?:gy|ing)?|timeout|retry|retries|intermittent)\b',
        r'\b(?:high\s+(?:cpu|memory|disk|load)|disk\s+(?:full|usage|space)|(?:cpu|memory)\s+(?:usage|spike))\b',
        r'\b(?:elevated|increase[d]?\s+error|spike[d]?\s+(?:in\s+)?(?:error|latency))\b',
        r'\b(?:warning|warn|alert|threshold|breach(?:ed)?|exceed(?:ed|ing)?)\b',
        r'\b(?:partial|some\s+users?|minority|subset)\b.{0,20}?\b(?:impact|affected|error|issue|outage)\b',
        r'\b(?:error\s+rate|failure\s+rate|\d+%\s+(?:error|fail|loss))\b',
        r'\b(?:p1|severity\s*(?:2|medium|warning))\b',
        r'\b(?:unstable|flaky|flapping|oscillating)\b',
    ]

    # --- Tier 3 patterns (weighted: strong=6pts, moderate=3pts) ---
    t3_strong = [
        r'\b(?:no\s+(?:action|issue|problem|error|incident)\s+(?:required|needed|necessary|found|detected))\b',
        r'\b(?:all\s+(?:clear|good|normal|operational|systems?\s+(?:normal|operational)))\b',
        r'\b(?:everything\s+(?:normal|fine|ok|operational)|no\s+(?:issues|problems|errors|anomalies))\b',
        r'\b(?:p3|p4|severity\s*(?:3|4|low|info(?:rmational)?))\b',
    ]
    t3_moderate = [
        r'\b(?:backup|maintenance|deployment|release|update|upgrade)\b.{0,20}?\b(?:completed|successful|finished|done|ok|succeed)\b',
        r'\b(?:scheduled|planned|routine|regular|weekly|monthly|daily|annual)\s+(?:maintenance|backup|report|update)\b',
        r'\b(?:summary|digest|newsletter|notification|reminder)\b',
        r'\b(?:informational|info\s+only|for\s+your\s+information|fyi)\b',
    ]

    # --- Location extraction patterns ---
    _locations_found = set()

    # Cloud region codes (AWS/Azure/GCP style)
    _cloud_region_pattern = re.compile(
        r'\b((?:us|eu|ap|sa|ca|af|me)-(?:east|west|north|south|central'
        r'|northeast|northwest|southeast|southwest)-\d+)\b',
        re.IGNORECASE
    )
    for m in _cloud_region_pattern.finditer(text):
        _locations_found.add(m.group(1).lower())

    # Major IT hub cities (top ~60 cities for data centers / tech ops)
    _city_list = [
        "Singapore", "London", "Frankfurt", "Tokyo", "Sydney", "Mumbai",
        "Seoul", "Paris", "Amsterdam", "Dublin", "Stockholm", "Milan",
        "Zurich", "Madrid", "Berlin", "Munich", "Vienna", "Brussels",
        "Toronto", "Montreal", "Vancouver", "New York", "Chicago", "Dallas",
        "Atlanta", "Seattle", "Portland", "Phoenix", "Denver", "Miami",
        "San Francisco", "Los Angeles", "Ashburn", "San Jose", "Boston",
        "Hong Kong", "Shanghai", "Beijing", "Shenzhen", "Taipei", "Osaka",
        "Bangalore", "Chennai", "Hyderabad", "Pune", "Jakarta", "Kuala Lumpur",
        "Bangkok", "Manila", "Ho Chi Minh", "Dubai", "Tel Aviv", "Moscow",
        "São Paulo", "Rio de Janeiro", "Santiago", "Buenos Aires", "Mexico City",
        "Lagos", "Nairobi", "Cape Town", "Johannesburg", "Auckland", "Wellington",
        # Singapore neighborhoods & districts
        "Hougang", "Punggol", "Sengkang", "Jurong", "Tampines", "Bedok",
        "Woodlands", "Yishun", "Ang Mo Kio", "Bishan", "Bukit Batok",
        "Bukit Merah", "Bukit Panjang", "Bukit Timah", "Changi", "Choa Chu Kang",
        "Clementi", "Geylang", "Kallang", "Marine Parade", "Novena", "Pasir Ris",
        "Queenstown", "Rochor", "Serangoon", "Toa Payoh", "Ubi", "Orchard",
        "River Valley", "Tanjong Pagar", "Outram", "Little India", "Chinatown",
        "Jurong East", "Jurong West", "Sembawang", "Mandai", "Lim Chu Kang",
        "Tengah", "Paya Lebar", "MacPherson", "Potong Pasir", "Mountbatten",
        # Malaysia neighborhoods
        "Kuala Lumpur", "Petaling Jaya", "Subang Jaya", "Shah Alam", "Cyberjaya",
        "Putrajaya", "Penang", "George Town", "Johor Bahru", "Kota Kinabalu",
        "Kuching", "Ipoh", "Malacca",
    ]
    text_lower = text.lower()
    for city in _city_list:
        if city.lower() in text_lower:
            _locations_found.add(city)

    # Generic address pattern: catch "X Block YYY", "X Street", "X Road", etc.
    # Looks for capitalized words immediately before address keywords
    _address_pattern = re.compile(
        r'\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+'
        r'(?:Block|Blk|Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Drive|Dr\.?|'
        r'Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Crescent|Circle|Loop|'
        r'Boulevard|Blvd\.?|Highway|Hwy\.?|Park|Plaza|Square|Sq\.?)\b'
    )
    for m in _address_pattern.finditer(title + " " + body):
        candidate = m.group(1).strip()
        # Filter out generic words that aren't place names
        if candidate.lower() not in ('the', 'new', 'old', 'main', 'north', 'south',
                                      'east', 'west', 'upper', 'lower', 'first',
                                      'second', 'third', 'central', 'park', 'data',
                                      'server', 'system', 'service', 'network'):
            _locations_found.add(candidate)

    # Country names (common in IT alerts)
    _country_list = [
        "Singapore", "Malaysia", "Indonesia", "Thailand", "Vietnam", "Philippines",
        "India", "Japan", "China", "Korea", "Taiwan", "Australia", "New Zealand",
        "United States", "Canada", "Mexico", "Brazil", "Argentina", "Chile",
        "United Kingdom", "Ireland", "France", "Germany", "Netherlands", "Belgium",
        "Switzerland", "Sweden", "Norway", "Finland", "Denmark", "Italy", "Spain",
        "Portugal", "Austria", "Poland", "Czech", "Romania", "Greece", "Turkey",
        "Russia", "Israel", "UAE", "Saudi Arabia", "South Africa", "Nigeria", "Kenya",
    ]
    for country in _country_list:
        if country.lower() in text_lower:
            _locations_found.add(country)

    # Airport codes: 3 uppercase letters, exclude obvious non-airport codes
    _airport_blacklist = {'API', 'CPU', 'RAM', 'SSD', 'HDD', 'DNS', 'SSL', 'TLS', 'TCP',
                          'UDP', 'HTTP', 'SQL', 'AWS', 'GCP', 'AMD', 'INT', 'VPN', 'LAN',
                          'WAN', 'SLA', 'SLO', 'SRE', 'CEO', 'CTO', 'PDF', 'URL', 'URI',
                          'DOM', 'CSS', 'JS', 'PHP', 'XML', 'JSON', 'CSV', 'YML', 'CLI',
                          'SDK', 'IDE', 'VCS', 'CI', 'CD', 'PR', 'OK', 'PM', 'DB', 'OS',
                          'VM', 'K8S', 'NFS', 'S3', 'EC2', 'RDS', 'VPC', 'IAM', 'SQS',
                          'SNS', 'EBS', 'ELB', 'ALB', 'NLB', 'CMS', 'CRM', 'ERP'}
    _airport_pattern = re.compile(r'\b([A-Z]{3})\b')
    for m in _airport_pattern.finditer(title + " " + body):  # search original case
        code = m.group(1)
        if code not in _airport_blacklist:
            _locations_found.add(code)

    # Singapore postal codes: 6-digit numbers (e.g., 123456)
    # Extract when: (a) Singapore context present, OR (b) a 6-digit number
    # follows a location preposition like "in", "at", "near", "from", "to"
    _sg_aware = any(kw in text_lower for kw in [
        'singapore', 'sg', 's\'pore', 'singapura',
        'hougang', 'punggol', 'sengkang', 'jurong', 'tampines', 'bedok',
        'woodlands', 'yishun', 'ang mo kio', 'bishan', 'bukit', 'changi',
        'choa chu kang', 'clementi', 'geylang', 'kallang', 'orchard',
        'serangoon', 'toa payoh', 'ubi', 'paya lebar', 'tanjong pagar',
        'marina', 'sentosa', 'tuas', 'kranji', 'seletar', 'tengah'
    ])

    # Check for 6-digit numbers following location prepositions
    _prep_check = re.compile(
        r'(?:^|\s)(?:in|at|near|from|to)\s+(\d{6})\b',
        re.IGNORECASE
    )
    _prep_match = _prep_check.search(title + " " + body)

    if _sg_aware or _prep_match:
        _postal_pattern = re.compile(r'\b(\d{6})\b')
        for m in _postal_pattern.finditer(title + " " + body):
            code = m.group(1)
            # Validate Singapore postal sector range (01-82)
            first_two = int(code[:2])
            if first_two < 1 or first_two > 82:
                continue  # Outside valid Singapore postal sector range
            # Exclude years (19xxxx, 20xxxx) to avoid date-like false positives
            if code.startswith('19') or code.startswith('20'):
                continue
            # Exclude zero-filled placeholder
            if code == '000000':
                continue
            _locations_found.add(code)

    extracted_locations = sorted(_locations_found)

    t1_score = sum(6 for pat in t1_strong if re.search(pat, text)) + sum(3 for pat in t1_moderate if re.search(pat, text))
    _t2_score = sum(3 for pat in t2_patterns if re.search(pat, text))  # tracked for diagnostics, not used in decision logic
    t3_score = sum(6 for pat in t3_strong if re.search(pat, text)) + sum(3 for pat in t3_moderate if re.search(pat, text))

    # --- Decision logic ---
    # Clear Tier 1: at least one strong T1 signal with no contradictory T3 signals
    if t1_score >= 3 and t3_score == 0:
        return {
            "tier": 1, "tier_label": "Critical",
            "reason": "Regex triage: clear critical outage/breach signals detected",
            "confidence": REGEX_TRIAGE_CONFIDENCE,
            "locations": extracted_locations,
            "classification_flags": ["regex_triage"]
        }

    # Clear Tier 3: at least one strong routine signal with no contradictory T1 signals
    if t3_score >= 3 and t1_score == 0:
        return {
            "tier": 3, "tier_label": "Low",
            "reason": "Regex triage: clear routine/informational pattern detected",
            "confidence": REGEX_TRIAGE_CONFIDENCE,
            "locations": extracted_locations,
            "classification_flags": ["regex_triage"]
        }

    # Ambiguous — fall through to LLM, but preserve extracted locations
    if extracted_locations:
        return {"_regex_locations": extracted_locations}
    return None


def classify_alert(title: str, body: str, source_type: str = "generic", model: str = None,
                   escalation_depth: int = 0, prior_result: dict = None) -> dict:
    """Classify any alert (email, webhook, syslog) using local Ollama LLM.

    Multi-strategy approach:
    1. Regex triage — fast deterministic patterns for obvious cases
    2. Chain-of-Thought LLM — semantic reasoning without signal-word bias
    3. Model escalation — larger model re-checks low-confidence results

    Returns: {
        "tier": int,
        "tier_label": str,
        "reason": str,
        "confidence": int,
        "locations": list[str],
        "classification_flags": list[str]   # e.g. ["low_confidence", "regex_triage", "escalated", "keyword_fallback"]
    }
    """
    # Resolve model for this attempt
    if model is None:
        model = OLLAMA_MODEL

    # ===== Step 0: Regex triage (skip LLM for obvious cases) =====
    _regex_locations = []
    if escalation_depth == 0 and prior_result is None:
        triage = _regex_triage(title, body)
        if triage is not None:
            if "tier" in triage:
                print(f"⚡ Regex triage: {triage['tier_label']} (conf={triage['confidence']}%) — skipping LLM")
                return triage
            # Ambiguous triage — preserve regex-extracted locations for merging
            _regex_locations = triage.get("_regex_locations", [])

    # ===== Step 1: Build Chain-of-Thought prompt (no signal words!) =====
    # Tier definitions are purely descriptive — the model must reason semantically,
    # not keyword-match against a provided word list.
    escalation_context = ""
    if prior_result is not None:
        escalation_context = f"""=== CONTEXT FROM PRELIMINARY ANALYSIS ===
A smaller model was uncertain about this alert (confidence {prior_result.get('confidence', '?')}%).
It tentatively classified as Tier {prior_result.get('tier', '?')} with reasoning: "{prior_result.get('reason', '')}".
You are a more capable model. Re-evaluate independently and provide your own classification.
"""

    prompt = f"""You are an expert incident severity classifier for an IT operations center.
Classify the following {source_type} alert by reasoning about its operational impact.
Respond with ONLY a single JSON object — no explanation, no markdown, no extra text.

=== TIER DEFINITIONS (by operational impact, not keywords) ===
Tier 1 (Critical — 8 min SLA): Core business service is completely non-functional.
  All users are affected. Revenue, safety, or data integrity is at immediate risk.
  Examples: complete outage, confirmed data breach, active ongoing attack, ransomware,
  total system crash, confirmed data loss, critical infrastructure compromise.
  IMPORTANT: Only classify as Tier 1 if the damage is CONFIRMED and ongoing.
  Suspicious activity, potential threats, or "detected" events without confirmed
  impact are Tier 2 — not Tier 1.

Tier 2 (Medium — 40 min SLA): Service is functioning but degraded OR a potential
  threat requires investigation. Some users may be affected.
  Resources are under pressure and may worsen without intervention.
  Examples: latency spikes, elevated error rates, disk/memory warnings,
  partial outages, suspicious login attempts, potential security events,
  malware alerts (not yet confirmed), unusual traffic patterns,
  hacker/intrusion DETECTION (not confirmed breach).

Tier 3 (Low — 4 hr SLA): Informational or routine with no operational impact.
  No user-facing degradation. Requires no immediate action.
  Examples: backup reports, scheduled maintenance notices, weekly summaries, confirmed resolutions.

=== CLASSIFICATION INSTRUCTIONS ===
1. First, think about what actually happened — is a service broken, slow, or operating normally?
2. Identify WHO is affected (all users, some users, nobody) and HOW SEVERE the impact is.
3. Match against the tier DESCRIPTIONS above (NOT specific keywords — use your semantic understanding).
4. Extract geographic locations that indicate WHERE the incident occurred.
   Look for: city names (e.g., "Singapore", "London"), country names,
   cloud region codes (e.g., "us-east-1", "eu-west-1", "ap-southeast-1"),
   airport codes (e.g., "SIN", "FRA", "LHR"),
   postal codes (e.g., Singapore 6-digit codes like "529538"),
   data center names tied to a known city (e.g., "Equinix Ashburn").
   IMPORTANT RULES:
   - Only extract if a real geographic place is clearly named in the alert.
   - Do NOT extract: timezones ("UTC", "SGT", "PST"), vague terms
     ("the cloud", "global", "the data center"), service names,
     hostnames ("prod-db-03"), or organizational units.
   - If no geographic location is mentioned, return an empty list [].
   - Normalize abbreviations to full names when possible.
5. Output a confidence score (0-100) reflecting how certain you are.
   - 90-100: very clear, unambiguous case
   - 70-89: reasonably confident but some ambiguity
   - 50-69: uncertain, could go either way
   - 0-49: guessing — flag for human review

=== FEW-SHOT EXAMPLES (illustrative, not exhaustive) ===
Input | Title: "Production database cluster completely unreachable"
       Body:  "All three DB replicas stopped responding. 100% of write traffic failing."
Output: {{"tier":1,"tier_label":"Critical","reason":"Complete database outage affecting all write traffic — core service non-functional","confidence":97,"locations":[]}}

Input | Title: "API latency increased to 4200ms for EU region"
       Body:  "p99 latency spike in eu-west-1 affecting ~15% of users in Ireland. Investigation ongoing."
Output: {{"tier":2,"tier_label":"Medium","reason":"Partial degradation with latency spike affecting subset of users in Ireland region","confidence":88,"locations":["eu-west-1"]}}

Input | Title: "Disk usage at 87% on prod-db-03 Singapore"
       Body:  "Growth rate 2%/day. Will fill in ~6 days if unchecked."
Output: {{"tier":2,"tier_label":"Medium","reason":"Resource pressure warning on production database in Singapore requiring attention","confidence":85,"locations":["Singapore"]}}

Input | Title: "Weekly backup completed successfully"
       Body:  "All 12 database snapshots completed at 02:00 UTC. No errors."
Output: {{"tier":3,"tier_label":"Low","reason":"Routine successful backup notification with no operational impact","confidence":96,"locations":[]}}

Input | Title: "Frankfurt data center cooling issue"
       Body:  "Temperature rising in eu-central-1 (Frankfurt) facility. HVAC team dispatched."
Output: {{"tier":2,"tier_label":"Medium","reason":"Cooling issue at Frankfurt data center — potential resource risk if unresolved","confidence":82,"locations":["Frankfurt","eu-central-1"]}}

Input | Title: "Suspicious login activity detected in Punggol"
       Body:  "IDS flagged 15 unusual SSH attempts from unknown IP. No breach confirmed. Investigation required."
Output: {{"tier":2,"tier_label":"Medium","reason":"Potential security threat detected but not confirmed — unusual login attempts require investigation","confidence":88,"locations":["Punggol"]}}

Input | Title: "Quarterly security audit report"
       Body:  "All systems passed audit. No findings to report. Next review in 3 months."
Output: {{"tier":3,"tier_label":"Low","reason":"Routine audit report with no findings — informational only","confidence":95,"locations":[]}}

=== ALERT TO CLASSIFY ===
{escalation_context}
Source type: {source_type}
Title: {title}
Body: {body[:1200]}

JSON: {{"tier":<1|2|3>,"tier_label":"<Critical|Medium|Low>","reason":"<one precise sentence citing the operational impact>","confidence":<0-100>,"locations":["place1",...]}}"""

    try:
        for attempt in range(2):
            try:
                payload = {
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "keep_alive": -1,  # keep model loaded in memory between requests
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 350  # CoT reasoning needs more tokens than direct JSON
                    }
                }
                resp = requests.post(OLLAMA_URL, json=payload, timeout=(10, 120))
                response_data = resp.json()
                raw_response = response_data.get("response", "").strip()
                if not raw_response:
                    if attempt == 0:
                        print(f"⚠️ Ollama empty response, retrying in 2s... ({title[:60]})")
                        time.sleep(2)
                        continue
                    print(f"⚠️ Ollama returned empty response (2 attempts): {title[:60]}")
                    raise ValueError("Ollama returned empty response after retry")

                # Parse JSON — model may wrap in markdown, truncate, or inject extra text
                def _parse_json(text):
                    # 0) Strip markdown code fences if present
                    stripped = re.sub(r'^```[\w]*\n?|\n?```$', '', text.strip())
                    # 1) Direct parse
                    try:
                        return json.loads(stripped)
                    except json.JSONDecodeError:
                        pass
                    # 2) Extract first {...} block
                    brace_match = re.search(r'\{[^{}]*\}', stripped, re.DOTALL)
                    if brace_match:
                        try:
                            return json.loads(brace_match.group(0))
                        except json.JSONDecodeError:
                            pass
                    # 3) Try to close truncated JSON
                    repaired = stripped.rstrip()
                    if not repaired.endswith('}') and not repaired.endswith('"') and not repaired.endswith(']'):
                        for closer in ['"}', '}]', '"}]', '"]}']:
                            try:
                                return json.loads(repaired + closer)
                            except json.JSONDecodeError:
                                continue
                    # 4) Regex extract tier+label+reason+confidence
                    m = re.search(
                        r'"tier"\s*:\s*(\d).*?"tier_label"\s*:\s*"([^"]*)".*?"confidence"\s*:\s*(\d+)',
                        text, re.DOTALL
                    )
                    if m:
                        locs = re.findall(r'"locations"\s*:\s*\[(.*?)\]', text, re.DOTALL)
                        loc_list = []
                        if locs:
                            loc_list = re.findall(r'"([^"]+)"', locs[0])
                        reason_match = re.search(r'"reason"\s*:\s*"([^"]+)"', text)
                        reason_str = reason_match.group(1) if reason_match else "Parsed from truncated response"
                        return {
                            "tier": int(m.group(1)),
                            "tier_label": m.group(2),
                            "reason": reason_str,
                            "confidence": int(m.group(3)),
                            "locations": loc_list
                        }
                    # 5) Minimal: just tier
                    m2 = re.search(r'"tier"\s*:\s*(\d)', text)
                    if m2:
                        return {"tier": int(m2.group(1)), "tier_label": "Unknown",
                                "reason": "Minimal parse", "confidence": 40, "locations": []}
                    return None

                result = _parse_json(raw_response)
                if result is None:
                    print(f"⚠️ Ollama unparseable ({len(raw_response)} chars): {raw_response[:200]}")
                    raise ValueError("Cannot parse Ollama response")

                # Normalize result
                result["tier"] = max(1, min(3, int(result["tier"])))
                tier_labels = {1: "Critical", 2: "Medium", 3: "Low"}
                if result.get("tier_label") not in ("Critical", "Medium", "Low"):
                    result["tier_label"] = tier_labels[result["tier"]]
                if "confidence" not in result or result["confidence"] is None:
                    result["confidence"] = 50
                else:
                    result["confidence"] = max(0, min(100, int(result["confidence"])))
                if "locations" not in result or not isinstance(result.get("locations"), list):
                    result["locations"] = []

                # ===== Confidence Calibration (CoT consistency check) =====
                # Check if the reason text contradicts the assigned tier.
                # e.g., saying "complete outage" but classifying Tier 2 → reduce confidence.
                reason_lower = result.get("reason", "").lower()
                tier = result["tier"]
                # Critical language in a non-Critical classification
                critical_phrases = ["complete outage", "total failure", "all users", "data breach",
                                    "system crash", "100%", "non-functional", "halted", "down",
                                    "unreachable", "unavailable", "emergency", "critical"]
                routine_phrases = ["completed successfully", "no action", "routine", "scheduled",
                                   "maintenance", "backup", "report", "newsletter", "informational"]
                if tier != 1 and any(p in reason_lower for p in critical_phrases):
                    result["confidence"] = max(0, result["confidence"] - 20)
                if tier != 3 and any(p in reason_lower for p in routine_phrases):
                    result["confidence"] = max(0, result["confidence"] - 15)
                # Clamp after calibration
                result["confidence"] = max(0, min(100, int(result["confidence"])))

                # Build classification flags
                flags = []
                if result["confidence"] < CONF_REVIEW_THRESHOLD:
                    flags.append("low_confidence")
                result["classification_flags"] = flags

                # ===== Model Escalation: low confidence → larger model =====
                if (escalation_depth == 0 and
                    result["confidence"] < ESCALATION_THRESHOLD and
                    model != OLLAMA_FALLBACK_MODEL):
                    print(f"🔼 Escalating to {OLLAMA_FALLBACK_MODEL} (conf={result['confidence']}% < {ESCALATION_THRESHOLD}%)")
                    try:
                        escalated = classify_alert(
                            title, body, source_type,
                            model=OLLAMA_FALLBACK_MODEL,
                            escalation_depth=1,
                            prior_result=result
                        )
                        if escalated and escalated.get("confidence", 0) > 0:
                            flags = escalated.get("classification_flags", [])
                            if "escalated" not in flags:
                                flags.append("escalated")
                            escalated["classification_flags"] = flags
                            # Merge regex-extracted locations
                            if _regex_locations:
                                esc_locs = set(escalated.get("locations", []))
                                for loc in _regex_locations:
                                    if loc.lower() not in (l.lower() for l in esc_locs):
                                        esc_locs.add(loc)
                                        escalated.setdefault("locations", []).append(loc)
                            print(f"✅ Escalated: {escalated['tier_label']} (conf={escalated['confidence']}%) — {escalated.get('reason','')[:60]}")
                            return escalated
                    except Exception as e:
                        print(f"⚠️ Escalation failed ({e}), keeping original classification")

                conf_indicator = "✅" if result["confidence"] >= 80 else ("⚠️" if result["confidence"] >= 65 else "🔴")
                model_label = model.replace(":","_")
                print(f"🤖 {model_label}: {result.get('tier_label','?')} (conf={result.get('confidence','?')}% {conf_indicator}) — {result.get('reason', '')[:60]}")
                if result["locations"]:
                    print(f"📍 Locations detected: {result['locations']}")
                if flags:
                    print(f"🚩 Flags: {flags}")
                # Merge regex-extracted locations into LLM result
                if _regex_locations:
                    existing = set(l.lower() for l in result.get("locations", []))
                    for loc in _regex_locations:
                        if loc.lower() not in existing:
                            existing.add(loc.lower())
                            result.setdefault("locations", []).append(loc)
                    if _regex_locations:
                        print(f"📍 Regex locations merged: {_regex_locations}")
                return result

            except Exception as e:
                if attempt == 0:
                    print(f"⚠️ Ollama attempt 1 failed ({e}), retrying in 2s...")
                    time.sleep(2)
                    continue
                raise

        raise RuntimeError("Ollama classification failed after 2 attempts")

    except Exception as e:
        print(f"❌ LLM failed ({model}): {e}")
        # Safety net: regex triage fallback with 0 confidence
        triage = _regex_triage(title, body)
        if triage is not None:
            if "tier" in triage:
                triage["confidence"] = 0
                triage["classification_flags"] = ["keyword_fallback"]
                triage["reason"] = f"LLM unavailable — regex fallback: {triage['reason']}"
                print(f"⚡ Regex fallback: {triage['tier_label']}")
                return triage
            # Ambiguous triage with locations — merge and default to Low
            _regex_locations = triage.get("_regex_locations", [])
        # Last resort: default to Low, include any regex locations
        locs = _regex_locations if _regex_locations else []
        return {"tier": 3, "tier_label": "Low",
                "reason": "LLM unavailable — defaulted to Low (no regex patterns matched)",
                "confidence": 0, "locations": locs, "classification_flags": ["keyword_fallback"]}

# Backward-compatible wrapper for existing email processing
def classify_email(subject: str, body: str) -> dict:
    """Classify an email (legacy wrapper — calls classify_alert)."""
    return classify_alert(subject, body, source_type="email")


# ===== GEOCODING — Nominatim (OpenStreetMap, free, no API key) =====

# Cache for geocoding results to avoid repeated Nominatim calls
GEOCODE_CACHE = {}          # name_lower → {"lat": ..., "lon": ..., "display_name": ...} or None (negative cache)
GEOCODE_CACHE_TTL = 86400   # 24-hour TTL for negative cache entries
_geocode_cache_timestamps = {}  # name_lower → Unix timestamp of cache entry

# Static coordinate lookup for cloud regions (no API call needed)
CLOUD_REGION_COORDS = {
    # AWS
    "us-east-1":      (39.0438, -77.4875),   # N. Virginia
    "us-east-2":      (40.0, -83.0),          # Ohio
    "us-west-1":      (37.7749, -122.4194),   # N. California
    "us-west-2":      (45.5235, -122.6762),   # Oregon
    "eu-west-1":      (53.3498, -6.2603),     # Ireland
    "eu-west-2":      (51.5074, -0.1278),     # London
    "eu-west-3":      (48.8566, 2.3522),      # Paris
    "eu-central-1":   (50.1109, 8.6821),      # Frankfurt
    "eu-central-2":   (47.3769, 8.5417),      # Zurich
    "eu-north-1":     (59.3293, 18.0686),     # Stockholm
    "eu-south-1":     (45.4642, 9.1900),      # Milan
    "eu-south-2":     (40.4168, -3.7038),     # Madrid
    "ap-southeast-1": (1.3521, 103.8198),     # Singapore
    "ap-southeast-2": (-33.8688, 151.2093),    # Sydney
    "ap-southeast-3": (-6.2088, 106.8456),    # Jakarta
    "ap-northeast-1": (35.6762, 139.6503),    # Tokyo
    "ap-northeast-2": (37.5665, 126.9780),    # Seoul
    "ap-northeast-3": (34.6937, 135.5023),    # Osaka
    "ap-south-1":     (19.0760, 72.8777),     # Mumbai
    "ap-south-2":     (12.9716, 77.5946),     # Bangalore
    "ap-east-1":      (22.3193, 114.1694),    # Hong Kong
    "sa-east-1":      (-23.5505, -46.6333),   # São Paulo
    "me-south-1":     (26.0667, 50.5577),     # Bahrain
    "me-central-1":   (25.2048, 55.2708),     # UAE/Dubai
    "af-south-1":     (-26.2041, 28.0473),    # Cape Town
    "ca-central-1":   (45.5017, -73.5673),    # Montreal
    "ca-west-1":      (49.2827, -123.1207),   # Vancouver
    # GCP
    "us-central1":    (41.2586, -95.9378),    # Iowa
    "us-east4":       (39.0438, -77.4875),    # N. Virginia
    "europe-west1":   (50.8503, 4.3517),      # Belgium
    "europe-west4":   (53.4386, -6.3956),     # Netherlands
    "europe-north1":  (60.5693, 27.1878),     # Finland
    "asia-east1":     (25.0330, 121.5654),    # Taiwan
    "asia-southeast1":(1.3521, 103.8198),     # Singapore
    "asia-south1":    (19.0760, 72.8777),     # Mumbai
    "australia-southeast1": (-33.8688, 151.2093),  # Sydney
    # Azure
    "eastus":         (39.0438, -77.4875),    # Virginia
    "westus":         (37.7749, -122.4194),   # California
    "westeurope":     (52.3667, 4.8945),      # Amsterdam
    "northeurope":    (53.3498, -6.2603),     # Ireland
    "southeastasia":  (1.3521, 103.8198),     # Singapore
    "eastasia":       (22.3193, 114.1694),    # Hong Kong
    "japaneast":      (35.6762, 139.6503),    # Tokyo
    "australiaeast":  (-33.8688, 151.2093),   # Sydney
    "brazilsouth":    (-23.5505, -46.6333),   # São Paulo
    "uksouth":        (51.5074, -0.1278),     # London
}

# Major data center cities with pre-cached coordinates
MAJOR_DC_CITIES = {
    "frankfurt":        (50.1109, 8.6821, "Frankfurt, Germany"),
    "london":           (51.5074, -0.1278, "London, United Kingdom"),
    "singapore":        (1.3521, 103.8198, "Singapore"),
    "tokyo":            (35.6762, 139.6503, "Tokyo, Japan"),
    "sydney":           (-33.8688, 151.2093, "Sydney, Australia"),
    "mumbai":           (19.0760, 72.8777, "Mumbai, India"),
    "seoul":            (37.5665, 126.9780, "Seoul, South Korea"),
    "paris":            (48.8566, 2.3522, "Paris, France"),
    "amsterdam":        (52.3676, 4.9041, "Amsterdam, Netherlands"),
    "dublin":           (53.3498, -6.2603, "Dublin, Ireland"),
    "stockholm":        (59.3293, 18.0686, "Stockholm, Sweden"),
    "toronto":          (43.6532, -79.3832, "Toronto, Canada"),
    "new york":         (40.7128, -74.0060, "New York, United States"),
    "chicago":          (41.8781, -87.6298, "Chicago, United States"),
    "dallas":           (32.7767, -96.7970, "Dallas, United States"),
    "atlanta":          (33.7490, -84.3880, "Atlanta, United States"),
    "seattle":          (47.6062, -122.3321, "Seattle, United States"),
    "portland":         (45.5152, -122.6784, "Portland, United States"),
    "phoenix":          (33.4484, -112.0740, "Phoenix, United States"),
    "san francisco":    (37.7749, -122.4194, "San Francisco, United States"),
    "los angeles":      (34.0522, -118.2437, "Los Angeles, United States"),
    "ashburn":          (39.0438, -77.4875, "Ashburn, Virginia, United States"),
    "san jose":         (37.3382, -121.8863, "San Jose, United States"),
    "hong kong":        (22.3193, 114.1694, "Hong Kong"),
    "shanghai":         (31.2304, 121.4737, "Shanghai, China"),
    "beijing":          (39.9042, 116.4074, "Beijing, China"),
    "taipei":           (25.0330, 121.5654, "Taipei, Taiwan"),
    "bangalore":        (12.9716, 77.5946, "Bangalore, India"),
    "jakarta":          (-6.2088, 106.8456, "Jakarta, Indonesia"),
    "dubai":            (25.2048, 55.2708, "Dubai, UAE"),
    "são paulo":        (-23.5505, -46.6333, "São Paulo, Brazil"),
    "cape town":        (-26.2041, 28.0473, "Cape Town, South Africa"),
    "auckland":         (-36.8485, 174.7633, "Auckland, New Zealand"),
    # Singapore neighborhoods & districts
    "hougang":          (1.3715, 103.8931, "Hougang, Singapore"),
    "punggol":          (1.4054, 103.9100, "Punggol, Singapore"),
    "sengkang":         (1.3910, 103.8950, "Sengkang, Singapore"),
    "jurong":           (1.3328, 103.7216, "Jurong, Singapore"),
    "jurong east":      (1.3338, 103.7390, "Jurong East, Singapore"),
    "jurong west":      (1.3400, 103.7070, "Jurong West, Singapore"),
    "tampines":         (1.3533, 103.9440, "Tampines, Singapore"),
    "bedok":            (1.3236, 103.9303, "Bedok, Singapore"),
    "woodlands":        (1.4382, 103.7899, "Woodlands, Singapore"),
    "yishun":           (1.4300, 103.8360, "Yishun, Singapore"),
    "ang mo kio":       (1.3691, 103.8454, "Ang Mo Kio, Singapore"),
    "bishan":           (1.3513, 103.8490, "Bishan, Singapore"),
    "bukit batok":      (1.3486, 103.7638, "Bukit Batok, Singapore"),
    "bukit merah":      (1.2830, 103.8210, "Bukit Merah, Singapore"),
    "bukit panjang":    (1.3810, 103.7714, "Bukit Panjang, Singapore"),
    "bukit timah":      (1.3297, 103.7946, "Bukit Timah, Singapore"),
    "changi":           (1.3560, 103.9874, "Changi, Singapore"),
    "choa chu kang":    (1.3841, 103.7464, "Choa Chu Kang, Singapore"),
    "clementi":         (1.3149, 103.7646, "Clementi, Singapore"),
    "geylang":          (1.3182, 103.8880, "Geylang, Singapore"),
    "kallang":          (1.3113, 103.8730, "Kallang, Singapore"),
    "marine parade":    (1.3030, 103.9100, "Marine Parade, Singapore"),
    "novena":           (1.3206, 103.8443, "Novena, Singapore"),
    "pasir ris":        (1.3720, 103.9480, "Pasir Ris, Singapore"),
    "queenstown":       (1.2940, 103.8030, "Queenstown, Singapore"),
    "serangoon":        (1.3500, 103.8700, "Serangoon, Singapore"),
    "toa payoh":        (1.3346, 103.8500, "Toa Payoh, Singapore"),
    "ubi":              (1.3305, 103.8992, "Ubi, Singapore"),
    "orchard":          (1.3048, 103.8318, "Orchard, Singapore"),
    "rochor":           (1.3040, 103.8540, "Rochor, Singapore"),
    "sembawang":        (1.4492, 103.8203, "Sembawang, Singapore"),
    "paya lebar":       (1.3570, 103.8860, "Paya Lebar, Singapore"),
    "tanjong pagar":    (1.2760, 103.8440, "Tanjong Pagar, Singapore"),
}

# Singapore postal sector → approximate coordinates (first 2 digits of 6-digit postal code)
# Falls back to these when Nominatim returns inaccurate results
SG_POSTAL_SECTOR_COORDS = {
    "01": (1.2820, 103.8510, "Raffles Place / Marina, Singapore"),
    "02": (1.2820, 103.8510, "Raffles Place / Marina, Singapore"),
    "03": (1.2820, 103.8510, "Raffles Place / Marina, Singapore"),
    "04": (1.2720, 103.8270, "Telok Blangah / Harbourfront, Singapore"),
    "05": (1.2720, 103.8270, "Telok Blangah / Harbourfront, Singapore"),
    "06": (1.2880, 103.8470, "Clarke Quay / City Hall, Singapore"),
    "07": (1.2760, 103.8440, "Tanjong Pagar / Chinatown, Singapore"),
    "08": (1.2760, 103.8440, "Tanjong Pagar / Chinatown, Singapore"),
    "09": (1.3048, 103.8318, "Orchard / River Valley, Singapore"),
    "10": (1.3048, 103.8318, "Orchard / River Valley, Singapore"),
    "11": (1.3206, 103.8443, "Novena / Balestier, Singapore"),
    "12": (1.3346, 103.8500, "Toa Payoh / Balestier, Singapore"),
    "13": (1.3400, 103.8700, "Braddell / MacPherson, Singapore"),
    "14": (1.3182, 103.8880, "Geylang / Eunos, Singapore"),
    "15": (1.3100, 103.9000, "Katong / Joo Chiat, Singapore"),
    "16": (1.3236, 103.9303, "Bedok / Upper East Coast, Singapore"),
    "17": (1.3560, 103.9874, "Changi / Flora, Singapore"),
    "18": (1.3533, 103.9440, "Tampines / Pasir Ris, Singapore"),
    "19": (1.3910, 103.8950, "Hougang / Sengkang / Punggol, Singapore"),
    "20": (1.3691, 103.8454, "Ang Mo Kio / Bishan, Singapore"),
    "21": (1.3297, 103.7946, "Clementi / Bukit Timah, Singapore"),
    "22": (1.3328, 103.7216, "Jurong / Tuas, Singapore"),
    "23": (1.3841, 103.7464, "Choa Chu Kang / Hillview, Singapore"),
    "24": (1.4000, 103.7200, "Lim Chu Kang / Tengah, Singapore"),
    "25": (1.4382, 103.7899, "Woodlands / Admiralty, Singapore"),
    "26": (1.4382, 103.7899, "Woodlands / Admiralty, Singapore"),
    "27": (1.4492, 103.8203, "Sembawang, Singapore"),
    "28": (1.4300, 103.8360, "Yishun, Singapore"),
    "29": (1.3910, 103.8950, "Sengkang / Seletar, Singapore"),
    "30": (1.3500, 103.8700, "Serangoon / Hougang, Singapore"),
    "31": (1.3305, 103.8992, "Ubi / Paya Lebar, Singapore"),
    "32": (1.3305, 103.8992, "Ubi / Paya Lebar, Singapore"),
    "33": (1.3305, 103.8992, "Ubi / Paya Lebar, Singapore"),
    "34": (1.3570, 103.8860, "Paya Lebar / MacPherson, Singapore"),
    "35": (1.3570, 103.8860, "Paya Lebar / MacPherson, Singapore"),
    "36": (1.3400, 103.8700, "MacPherson / Potong Pasir, Singapore"),
    "37": (1.3400, 103.8700, "MacPherson / Potong Pasir, Singapore"),
    "38": (1.3100, 103.9000, "Katong / Joo Chiat, Singapore"),
    "39": (1.3100, 103.9000, "Katong / Joo Chiat, Singapore"),
    "40": (1.3100, 103.9000, "Katong / Joo Chiat, Singapore"),
    "41": (1.3100, 103.9000, "Katong / Joo Chiat, Singapore"),
    "42": (1.3533, 103.9440, "Tampines / Simei, Singapore"),
    "43": (1.3533, 103.9440, "Tampines / Simei, Singapore"),
    "44": (1.3533, 103.9440, "Tampines / Simei, Singapore"),
    "45": (1.3400, 103.9600, "Simei / Upper Changi, Singapore"),
    "46": (1.3236, 103.9303, "Bedok / Upper East Coast, Singapore"),
    "47": (1.3236, 103.9303, "Bedok / Upper East Coast, Singapore"),
    "48": (1.3236, 103.9303, "Bedok / Upper East Coast, Singapore"),
    "49": (1.3910, 103.8950, "Hougang / Sengkang, Singapore"),
    "50": (1.3910, 103.8950, "Hougang / Sengkang, Singapore"),
    "51": (1.3720, 103.9480, "Pasir Ris / Loyang, Singapore"),
    "52": (1.3800, 103.9200, "Sengkang / Punggol, Singapore"),
    "53": (1.3910, 103.8950, "Hougang / Sengkang, Singapore"),
    "54": (1.3910, 103.8950, "Sengkang / Buangkok, Singapore"),
    "55": (1.3910, 103.8950, "Sengkang / Buangkok, Singapore"),
    "56": (1.3691, 103.8454, "Ang Mo Kio / Serangoon, Singapore"),
    "57": (1.3691, 103.8454, "Ang Mo Kio / Bishan, Singapore"),
    "58": (1.3691, 103.8454, "Ang Mo Kio / Bishan, Singapore"),
    "59": (1.3800, 103.8500, "Serangoon Gardens, Singapore"),
    "60": (1.3328, 103.7216, "Jurong / Clementi, Singapore"),
    "61": (1.3328, 103.7216, "Jurong / Clementi, Singapore"),
    "62": (1.3328, 103.7216, "Jurong / Clementi, Singapore"),
    "63": (1.3328, 103.7216, "Jurong / Clementi, Singapore"),
    "64": (1.3328, 103.7216, "Jurong / Clementi, Singapore"),
    "65": (1.3841, 103.7464, "Choa Chu Kang / Bukit Panjang, Singapore"),
    "66": (1.3841, 103.7464, "Choa Chu Kang / Bukit Panjang, Singapore"),
    "67": (1.3810, 103.7714, "Bukit Panjang / Hillview, Singapore"),
    "68": (1.3810, 103.7714, "Bukit Panjang / Hillview, Singapore"),
    "69": (1.4382, 103.7899, "Woodlands / Mandai, Singapore"),
    "70": (1.4382, 103.7899, "Woodlands / Mandai, Singapore"),
    "71": (1.4382, 103.7899, "Woodlands / Mandai, Singapore"),
    "72": (1.4382, 103.7899, "Woodlands / Mandai, Singapore"),
    "73": (1.4382, 103.7899, "Woodlands / Mandai, Singapore"),
    "74": (1.4300, 103.8360, "Yishun / Sembawang, Singapore"),
    "75": (1.4300, 103.8360, "Yishun / Sembawang, Singapore"),
    "76": (1.4300, 103.8360, "Yishun / Sembawang, Singapore"),
    "77": (1.3500, 103.8700, "Thomson / Upper Serangoon, Singapore"),
    "78": (1.3500, 103.8700, "Thomson / Upper Serangoon, Singapore"),
    "79": (1.3500, 103.8700, "Thomson / Upper Serangoon, Singapore"),
    "80": (1.3500, 103.8700, "Thomson / Upper Serangoon, Singapore"),
    "81": (1.4054, 103.9100, "Seletar / Yio Chu Kang, Singapore"),
    "82": (1.4054, 103.9100, "Seletar / Yio Chu Kang, Singapore"),
}


def _is_valid_location(name: str) -> bool:
    """Reject strings that are clearly not geographic locations."""
    name_stripped = name.strip()
    if len(name_stripped) < 2:
        return False
    # Allow Singapore 6-digit postal codes (pass through to geocoding)
    if name_stripped.isdigit() and len(name_stripped) == 6:
        return True
    if name_stripped.isdigit():
        return False
    if not any(c.isalpha() for c in name_stripped):
        return False
    # Blacklist: actual garbage strings found in production data
    name_lower = name_stripped.lower()
    invalid = {
        'unknown', 'n/a', 'none', 'all', 'everyone', 'global',
        'place1', 'dc', 'the database', 'server room', 'the server',
        'all users', 'the network', 'the system', 'the cluster',
        'localhost', 'production', 'staging', 'development',
        'the cloud', "user's computer", 'the office', 'datacenter',
        'on-prem', 'headquarters', 'main office', 'branch office',
        'null', 'undefined', 'nil', 'true', 'false', 'test',
        'example', 'placeholder', 'todo', 'fixme', 'alarm',
        'warning', 'critical', 'alert', 'notification', 'message',
    }
    if name_lower in invalid:
        return False
    return True


def geocode_locations(location_names: list[str]) -> list[dict]:
    """Convert a list of location name strings to [{name, lat, lon, display_name}].

    Uses a multi-tier strategy:
    1. Validate names — reject obvious non-location strings
    2. Check static lookup tables (cloud regions, major DC cities)
    3. Check in-memory cache
    4. Fall back to Nominatim (OpenStreetMap) with rate limiting

    Failures are silently skipped — geocoding is best-effort.
    """
    now = time.time()
    geocoded = []
    seen = set()

    # Pre-filter: validate and deduplicate
    valid_names = []
    for name in location_names:
        name = name.strip()
        if not name or name.lower() in seen:
            continue
        if not _is_valid_location(name):
            print(f"📍 Skipped invalid location name: '{name}'")
            continue
        seen.add(name.lower())
        valid_names.append(name)

    for name in valid_names:
        name_lower = name.lower()

        # --- Tier 1: Check negative cache (previous failed lookups) ---
        if name_lower in GEOCODE_CACHE and GEOCODE_CACHE[name_lower] is None:
            ts = _geocode_cache_timestamps.get(name_lower, 0)
            if now - ts < GEOCODE_CACHE_TTL:
                continue  # still cached as "not found", skip
            else:
                # TTL expired, remove from cache and retry
                del GEOCODE_CACHE[name_lower]
                del _geocode_cache_timestamps[name_lower]

        # --- Tier 2: Check positive cache ---
        if name_lower in GEOCODE_CACHE and GEOCODE_CACHE[name_lower] is not None:
            cached = GEOCODE_CACHE[name_lower]
            geocoded.append({
                "name": name,
                "lat": cached["lat"],
                "lon": cached["lon"],
                "display_name": cached["display_name"]
            })
            print(f"📍 Cache hit: '{name}' → ({cached['lat']}, {cached['lon']})")
            continue

        # --- Tier 3: Check cloud region lookup ---
        if name_lower in CLOUD_REGION_COORDS:
            lat, lon = CLOUD_REGION_COORDS[name_lower]
            display = f"{name} (Cloud Region)"
            geocoded.append({
                "name": name, "lat": lat, "lon": lon, "display_name": display
            })
            GEOCODE_CACHE[name_lower] = {"lat": lat, "lon": lon, "display_name": display}
            _geocode_cache_timestamps[name_lower] = now
            print(f"📍 Cloud region: '{name}' → ({lat}, {lon})")
            continue

        # --- Tier 4: Check major DC cities ---
        if name_lower in MAJOR_DC_CITIES:
            lat, lon, display = MAJOR_DC_CITIES[name_lower]
            geocoded.append({
                "name": name, "lat": lat, "lon": lon, "display_name": display
            })
            GEOCODE_CACHE[name_lower] = {"lat": lat, "lon": lon, "display_name": display}
            _geocode_cache_timestamps[name_lower] = now
            print(f"📍 DC city: '{name}' → ({lat}, {lon})")
            continue

        # --- Tier 4.5: Singapore postal sector lookup ---
        # Free, no API key — uses pre-cached sector coordinates (first 2 digits).
        # Accuracy: neighbourhood level (much better than Nominatim for SG codes).
        if name.isdigit() and len(name) == 6:
            sector = name[:2]
            if sector in SG_POSTAL_SECTOR_COORDS:
                lat, lon, display = SG_POSTAL_SECTOR_COORDS[sector]
                geocoded.append({
                    "name": name, "lat": lat, "lon": lon, "display_name": display
                })
                GEOCODE_CACHE[name_lower] = {"lat": lat, "lon": lon, "display_name": display}
                _geocode_cache_timestamps[name_lower] = now
                print(f"📍 Postal sector {sector}: '{name}' → ({lat}, {lon}) — {display}")
                continue

        # --- Tier 5: Nominatim API ---
        try:
            # Append "Singapore" for postal codes so Nominatim has country context
            query = f"{name} Singapore" if (name.isdigit() and len(name) == 6) else name
            resp = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "InciCare-IncidentMap/1.0"},
                timeout=8
            )
            results = resp.json()
            if results:
                lat = float(results[0]["lat"])
                lon = float(results[0]["lon"])
                display = results[0].get("display_name", name)
                geocoded.append({
                    "name": name, "lat": lat, "lon": lon, "display_name": display
                })
                GEOCODE_CACHE[name_lower] = {"lat": lat, "lon": lon, "display_name": display}
                _geocode_cache_timestamps[name_lower] = now
                print(f"📍 Geocoded '{name}' → ({lat}, {lon})")
            else:
                # Negative cache: remember that this name has no results
                GEOCODE_CACHE[name_lower] = None
                _geocode_cache_timestamps[name_lower] = now
                print(f"📍 Could not geocode '{name}' — no results (cached for {GEOCODE_CACHE_TTL}s)")
            time.sleep(1.1)  # Nominatim rate limit: max 1 req/sec
        except Exception as e:
            print(f"📍 Geocoding error for '{name}': {e}")
    return geocoded

# ===== AUTO LOGOUT CONFIG =====
INACTIVITY_TIMEOUT = 1800  # seconds — auto-logout after 30 minutes of no user activity

# ===== GLOBAL STORAGE =====
online_users = {}         # user_id → {email, app_pwd, stop_flag, thread, last_activity}
socket_sid_to_user = {}   # sid → user_id
user_locks = {}
user_locks_lock = threading.Lock()

# ===== NOTIFICATION GATEWAY CONFIG =====
# Supports three providers: 'simulate' (demo/no-cost), 'twilio', 'pagerduty'
# Edit via the Dispatch page ⚙️ Notifications panel — no server restart needed.
NOTIFICATION_CONFIG = {
    "provider": "simulate",          # 'simulate' | 'twilio' | 'pagerduty'
    "auto_notify_tier": 1,           # Notify automatically for tier <= this value (0 = manual only)
    # Twilio
    "twilio_account_sid": "",
    "twilio_auth_token": "",
    "twilio_from_number": "",
    "twilio_voice_enabled": True,    # Also make a voice call for Tier 1
    # PagerDuty
    "pagerduty_routing_key": "",     # 32-char Events API v2 integration key
}


def _mask_secret(val: str) -> str:
    """Return a masked version of a secret — show first 4 chars then asterisks."""
    if not val:
        return ""
    return val[:4] + "*" * (len(val) - 4) if len(val) > 4 else "****"


def send_sms_twilio(to_number: str, message: str) -> dict:
    """Send an SMS via Twilio Messages API.
    Returns {"ok": bool, "sid": str, "error": str|None}
    """
    cfg = NOTIFICATION_CONFIG
    sid   = cfg["twilio_account_sid"]
    token = cfg["twilio_auth_token"]
    from_ = cfg["twilio_from_number"]
    if not all([sid, token, from_]):
        return {"ok": False, "error": "Twilio credentials not configured"}
    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        resp = requests.post(
            url,
            auth=(sid, token),
            data={"To": to_number, "From": from_, "Body": message},
            timeout=15
        )
        data = resp.json()
        if resp.status_code in (200, 201):
            print(f"📱 Twilio SMS → {to_number} | SID: {data.get('sid')}")
            return {"ok": True, "sid": data.get("sid"), "error": None}
        else:
            err = data.get("message", str(resp.status_code))
            print(f"❌ Twilio SMS error → {to_number}: {err}")
            return {"ok": False, "error": err}
    except Exception as e:
        print(f"❌ Twilio SMS exception: {e}")
        return {"ok": False, "error": str(e)}


def send_voice_call_twilio(to_number: str, message: str) -> dict:
    """Place an automated voice call via Twilio Calls API (TwiML <Say>).
    Returns {"ok": bool, "sid": str, "error": str|None}
    """
    cfg = NOTIFICATION_CONFIG
    sid   = cfg["twilio_account_sid"]
    token = cfg["twilio_auth_token"]
    from_ = cfg["twilio_from_number"]
    if not all([sid, token, from_]):
        return {"ok": False, "error": "Twilio credentials not configured"}
    # Build TwiML inline — no external URL needed
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">{message}</Say><Pause length="1"/></Response>'
    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json"
        resp = requests.post(
            url,
            auth=(sid, token),
            data={
                "To": to_number,
                "From": from_,
                "Twiml": twiml,
            },
            timeout=15
        )
        data = resp.json()
        if resp.status_code in (200, 201):
            print(f"📞 Twilio Voice → {to_number} | SID: {data.get('sid')}")
            return {"ok": True, "sid": data.get("sid"), "error": None}
        else:
            err = data.get("message", str(resp.status_code))
            print(f"❌ Twilio Voice error → {to_number}: {err}")
            return {"ok": False, "error": err}
    except Exception as e:
        print(f"❌ Twilio Voice exception: {e}")
        return {"ok": False, "error": str(e)}


def trigger_pagerduty(staff_name: str, staff_pd_email: str, incident_id: str, incident_title: str, tier: int) -> dict:
    """Trigger a PagerDuty incident via Events API v2.
    Tier 1 → high urgency, Tier 2 → low urgency.
    Returns {"ok": bool, "dedup_key": str, "error": str|None}
    """
    cfg = NOTIFICATION_CONFIG
    routing_key = cfg.get("pagerduty_routing_key", "")
    if not routing_key:
        return {"ok": False, "error": "PagerDuty routing key not configured"}

    urgency = "high" if tier == 1 else "low"
    payload = {
        "routing_key": routing_key,
        "event_action": "trigger",
        "dedup_key": f"comhub-{incident_id}",
        "payload": {
            "summary": f"[InciCare {incident_id}] {incident_title}",
            "severity": "critical" if tier == 1 else ("warning" if tier == 2 else "info"),
            "source": "InciCare",
            "component": "IncidentDispatch",
            "custom_details": {
                "assigned_to": staff_name,
                "assigned_pd_email": staff_pd_email,
                "incident_id": incident_id,
                "urgency": urgency,
            }
        },
        "client": "InciCare",
    }
    try:
        resp = requests.post(
            "https://events.pagerduty.com/v2/enqueue",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        data = resp.json()
        if resp.status_code == 202:
            print(f"🔔 PagerDuty triggered → {staff_name} | dedup: comhub-{incident_id}")
            return {"ok": True, "dedup_key": data.get("dedup_key"), "error": None}
        else:
            err = data.get("message", str(resp.status_code))
            print(f"❌ PagerDuty error: {err}")
            return {"ok": False, "error": err}
    except Exception as e:
        print(f"❌ PagerDuty exception: {e}")
        return {"ok": False, "error": str(e)}


def dispatch_notification(staff: dict, incident: dict) -> dict:
    """Orchestrator — picks the right provider and fires the notification.

    Args:
        staff:    dict with keys: name, phone, pagerduty_email (optional)
        incident: dict with keys: id, title, tier, tier_label

    Returns: {"ok": bool, "provider": str, "actions": list[str], "errors": list[str]}
    """
    cfg = NOTIFICATION_CONFIG
    provider = cfg.get("provider", "simulate")
    tier = incident.get("tier", 3)
    inc_id = incident.get("id", "INC-??")
    inc_title = incident.get("title", "Incident")
    inc_tier_label = incident.get("tier_label", "Low")
    staff_name = staff.get("name", "Staff")
    phone = staff.get("phone", "")
    pd_email = staff.get("pagerduty_email", "")

    actions = []
    errors = []

    # --- Build human-readable alert message ---
    sms_body = (
        f"[InciCare ALERT] {inc_tier_label} Incident {inc_id} assigned to you.\n"
        f"Title: {inc_title[:120]}\n"
        f"Please respond immediately. Login: http://incicare.local"
    )
    voice_msg = (
        f"InciCare alert. You have been assigned a {inc_tier_label} severity incident. "
        f"Incident ID: {inc_id}. {inc_title[:80]}. Please log in to InciCare immediately."
    )

    if provider == "simulate":
        print(f"📣 [SIMULATE] Notification → {staff_name} ({phone}) | {inc_id}: {inc_title[:60]}")
        if tier == 1:
            print(f"   ↳ [SIMULATE] SMS: {sms_body[:80]}")
            print(f"   ↳ [SIMULATE] Voice call: {voice_msg[:80]}")
            actions = ["sms (simulated)", "voice call (simulated)"]
        elif tier == 2:
            print(f"   ↳ [SIMULATE] SMS: {sms_body[:80]}")
            actions = ["sms (simulated)"]
        else:
            print(f"   ↳ [SIMULATE] Low-tier notification logged")
            actions = ["logged (simulated)"]
        return {"ok": True, "provider": "simulate", "actions": actions, "errors": []}

    elif provider == "twilio":
        if not phone:
            return {"ok": False, "provider": "twilio", "actions": [], "errors": [f"No phone number for {staff_name}"]}
        # SMS always
        result = send_sms_twilio(phone, sms_body)
        if result["ok"]:
            actions.append(f"sms sent (SID: {result.get('sid', 'n/a')})")
        else:
            errors.append(f"SMS failed: {result.get('error')}")
        # Voice call for Tier 1 only (if enabled)
        if tier == 1 and cfg.get("twilio_voice_enabled", True):
            v_result = send_voice_call_twilio(phone, voice_msg)
            if v_result["ok"]:
                actions.append(f"voice call placed (SID: {v_result.get('sid', 'n/a')})")
            else:
                errors.append(f"Voice call failed: {v_result.get('error')}")
        return {"ok": len(errors) == 0 or len(actions) > 0, "provider": "twilio", "actions": actions, "errors": errors}

    elif provider == "pagerduty":
        result = trigger_pagerduty(staff_name, pd_email, inc_id, inc_title, tier)
        if result["ok"]:
            actions.append(f"PagerDuty incident triggered (key: {result.get('dedup_key', 'n/a')})")
        else:
            errors.append(f"PagerDuty failed: {result.get('error')}")
        return {"ok": result["ok"], "provider": "pagerduty", "actions": actions, "errors": errors}

    else:
        return {"ok": False, "provider": provider, "actions": [], "errors": [f"Unknown provider: {provider}"]}

# ===== FIX: Correct path handling =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

# Create directories if they don't exist
os.makedirs(BASE_DATA_DIR, exist_ok=True)
os.makedirs(FRONTEND_DIR, exist_ok=True)

print(f"📁 Frontend directory: {FRONTEND_DIR}")
print(f"📁 Data directory: {BASE_DATA_DIR}")

def _get_user_lock(user_id: str) -> threading.Lock:
    with user_locks_lock:
        if user_id not in user_locks:
            user_locks[user_id] = threading.Lock()
        return user_locks[user_id]

def update_user_activity(user_id: str) -> None:
    """Update the last_activity timestamp for a user — keeps their session alive."""
    if user_id in online_users:
        online_users[user_id]["last_activity"] = time.time()

def _inactivity_checker_loop():
    """Background thread: periodically check for inactive users and auto-logout."""
    while True:
        time.sleep(15)  # check every 15 seconds
        now = time.time()
        to_remove = []
        for user_id, info in list(online_users.items()):
            last_act = info.get("last_activity", 0)
            if last_act > 0 and (now - last_act) > INACTIVITY_TIMEOUT:
                to_remove.append(user_id)

        for user_id in to_remove:
            print(f"⏰ Auto-logout: {online_users[user_id].get('email', user_id)} — inactive for {INACTIVITY_TIMEOUT}s+")
            # Signal the IMAP thread to stop
            if user_id in online_users:
                online_users[user_id]["stop_flag"] = True
                # Emit a force-logout event to the frontend so UI updates immediately
                socketio.emit("force_logout", {
                    "client_user_id": user_id,
                    "reason": f"Auto-logged out after {INACTIVITY_TIMEOUT}s of inactivity"
                })
                time.sleep(0.3)
                if user_id in online_users:
                    del online_users[user_id]
            print(f"✅ Session cleaned for {user_id}")

def get_user_data_path(user_id: str) -> str:
    return os.path.join(BASE_DATA_DIR, f"user_{user_id}_incidents.json")

def load_user_data(user_id: str) -> dict:
    file_path = get_user_data_path(user_id)
    if not os.path.exists(file_path):
        return {"incidents": []}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or "incidents" not in data:
            print(f"⚠️ Corrupt data file for {user_id}, resetting")
            return {"incidents": []}
        return data
    except (json.JSONDecodeError, OSError):
        print(f"⚠️ Empty or corrupt data file for {user_id}, resetting")
        return {"incidents": []}

def save_user_data(user_id, data):
    file_path = get_user_data_path(user_id)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_next_incident_id(user_id: str) -> str:
    user_data = load_user_data(user_id)
    existing_ids = [
        int(inc["id"].split("-")[1])
        for inc in user_data.get("incidents", [])
        if inc["id"].startswith("INC-")
    ]
    next_id = max(existing_ids) + 1 if existing_ids else 1
    return f"INC-{str(next_id).zfill(3)}"

# ===== UNIFIED INCIDENT PIPELINE =====
def process_alert(user_id, title, body, source_type="generic", extra_metadata=None):
    """Generic ingestion pipeline for ALL sources (email, webhook, syslog).

    Steps:
    1. LLM classify with confidence scoring
    2. Geocode locations from LLM output
    3. Create incident dict and save to user's JSON file
    4. Broadcast via Socket.IO to the user's room

    Returns the new_incident dict.
    """
    t0 = time.time()

    # --- Step 1: LLM Classification ---
    t1 = time.time()
    classification = classify_alert(title, body, source_type)
    t2 = time.time()

    # --- Step 2: Geocode locations ---
    raw_locations = classification.get("locations", [])
    geocoded = geocode_locations(raw_locations) if raw_locations else []

    # --- Step 3: Create & save incident ---
    lock = _get_user_lock(user_id)
    with lock:
        incident_id = get_next_incident_id(user_id)
        user_data = load_user_data(user_id)

        # --- Deduplication: skip if already processed (same title + body hash) ---
        dedup_hash = hashlib.md5((title + body[:500]).encode()).hexdigest()
        for existing in user_data.get("incidents", []):
            existing_hash = existing.get("dedup_hash", "")
            if existing_hash == dedup_hash:
                print(f"⏭️ Duplicate alert skipped (matches {existing['id']}): {title[:60]}")
                return existing  # already processed, don't create duplicate

        created_at_str = (extra_metadata or {}).get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")
        sla_window = SLA_CONFIG[classification["tier"]]
        # Compute absolute SLA deadline as Unix timestamp
        try:
            created_ts = time.mktime(time.strptime(created_at_str, "%Y-%m-%d %H:%M:%S"))
        except Exception:
            created_ts = time.time()
        sla_deadline_ts = int(created_ts + sla_window)

        conf = classification.get("confidence", 0)
        flags = list(classification.get("classification_flags", []))
        new_incident = {
            "id": incident_id,
            "title": title,
            "description": body[:200] + ("..." if len(body) > 200 else ""),
            "full_body": body,
            "tier": classification["tier"],
            "tier_label": classification["tier_label"],
            "classification_reason": classification.get("reason", ""),
            "confidence": conf,
            "classification_flags": flags,                         # e.g. ["low_confidence", "keyword_fallback"]
            "needs_review": conf < CONF_REVIEW_THRESHOLD,          # True when AI is uncertain
            "manually_overridden": False,                          # set to True after human reclassify
            "override_reason": None,
            "override_at": None,
            "source": source_type,
            "source_metadata": extra_metadata or {},
            "status": "active",
            "acknowledged": False,
            "finished": False,
            "assigned_to": None,
            "created_at": created_at_str,
            "sla_countdown": sla_window,
            "sla_deadline_ts": sla_deadline_ts,
            "dedup_hash": dedup_hash,
            "location_names": raw_locations,
            "locations": geocoded
        }
        user_data["incidents"].insert(0, new_incident)
        save_user_data(user_id, user_data)
                # ======================================================
        # TELEGRAM CRITICAL ALERT
        # Automatically notify phone when AI classifies
        # an incident as Critical (Tier 1).
        # ======================================================

        if classification["tier"] == 1:

            telegram_message = f"""
🚨 InciCare CRITICAL ALERT 🚨

🆔 Incident ID:
{incident_id}

📌 Title:
{title}

🔥 Severity:
Critical

⏰ SLA:
8 Minutes

🤖 AI Reason:
{classification.get("reason", "N/A")}

Please investigate immediately.
"""

            send_telegram(telegram_message)

        # ======================================================
        # END TELEGRAM ALERT
        # ======================================================

    # --- Step 4: Broadcast to frontend ---
    socketio.emit("new_incident", {
        "client_user_id": user_id,
        "incident": new_incident
    })
    conf = classification.get("confidence", 0)
    total_ms = int((time.time() - t0) * 1000)
    llm_ms = int((t2 - t1) * 1000)
    save_ms = int((time.time() - max(t2, t1)) * 1000)
    print(f"⏱️ {incident_id} [{source_type}] [{classification['tier_label']}] conf={conf}% | LLM: {llm_ms}ms | Save+Bcast: {save_ms}ms | Total: {total_ms}ms")
    print(f"   📩 {title[:80]}")
    return new_incident


def _process_email_msg(msg, user_id):
    """Process one email: parse → delegate to process_alert()."""
    # --- Parse subject ---
    raw_subject = msg.get("Subject", "(No Subject)")
    if raw_subject:
        subj_parts = decode_header(raw_subject)
        subj_decoded = []
        for part, enc in subj_parts:
            if isinstance(part, bytes):
                subj_decoded.append(part.decode(enc or "utf-8", errors="replace"))
            else:
                subj_decoded.append(str(part))
        subj = " ".join(subj_decoded).strip() or "(No Subject)"
    else:
        subj = "(No Subject)"

    # --- Parse body (prefer plain text, fall back to HTML) ---
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment":
                payload = part.get_payload(decode=True)
                if payload:
                    body = payload.decode(errors="replace")
                    break
        if not body:
            for part in msg.walk():
                if part.get_content_type() == "text/html" and part.get_content_disposition() != "attachment":
                    payload = part.get_payload(decode=True)
                    if payload:
                        raw_html = payload.decode(errors="replace")
                        body = re.sub(r'<[^>]+>', ' ', raw_html).strip()
                        break
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            ctype = msg.get_content_type()
            body = payload.decode(errors="replace")
            if ctype == "text/html":
                body = re.sub(r'<[^>]+>', ' ', body).strip()

    body = body.strip()
    print(f"✉️ Parsed email: subject='{subj[:50]}', body_len={len(body)}")

    return process_alert(user_id, subj, body, source_type="gmail")

def mail_watch_loop(user_id):
    """Monitor Gmail inbox using UID polling — catches ALL emails regardless of read status.
    Polls every 3 seconds. Tracks last seen UID to never miss or duplicate an email.
    """
    user_info = online_users[user_id]
    email_addr = user_info["email"]
    app_pwd = user_info["app_pwd"]
    last_uid = 0  # track highest UID seen, reset on reconnect

    while not user_info["stop_flag"]:
        try:
            mail = imaplib.IMAP4_SSL("imap.gmail.com")
            mail.sock.settimeout(30)
            mail.login(email_addr, app_pwd)
            mail.select("INBOX")
            print(f"📬 IMAP connected for {email_addr}")

            # On fresh connect, find current max UID so we only process newer emails
            status, uid_data = mail.uid('search', None, 'ALL')
            if status == 'OK' and uid_data[0]:
                all_uids = [int(u) for u in uid_data[0].split()]
                if all_uids:
                    last_uid = max(all_uids)
                    print(f"📬 Tracking from UID {last_uid} ({len(all_uids)} emails in inbox)")

            while not user_info["stop_flag"]:
                try:
                    # Keep connection alive with NOOP, then fetch all UIDs
                    try:
                        mail.noop()
                    except Exception:
                        pass  # noop can fail, we'll reconnect on search failure

                    status, uid_data = mail.uid('search', None, 'ALL')
                    if status != 'OK':
                        print(f"⚠️ UID search failed (status={status}), reconnecting...")
                        break

                    all_uids = sorted(int(u) for u in uid_data[0].split()) if uid_data[0] else []
                    if all_uids:
                        new_uids = [u for u in all_uids if u > last_uid]
                        if new_uids:
                            detect_time = time.strftime("%H:%M:%S")
                            print(f"📬 [{detect_time}] IMAP detected {len(new_uids)} new email(s) (UID {min(new_uids)}-{max(new_uids)})")
                            for uid in new_uids:
                                try:
                                    status2, raw_data = mail.uid('fetch', str(uid), '(RFC822)')
                                    if status2 != 'OK' or not raw_data[0]:
                                        continue
                                    msg = email.message_from_bytes(raw_data[0][1])
                                    t_before = time.time()
                                    _process_email_msg(msg, user_id)
                                    proc_ms = int((time.time() - t_before) * 1000)
                                    print(f"   ⚙️ UID {uid} processed: {proc_ms}ms")
                                except Exception as e:
                                    print(f"Error processing UID {uid}: {e}")
                            last_uid = max(new_uids)
                        else:
                            # Debug: print max UID every 2 min to confirm connection is alive
                            if int(time.time()) % 120 < 3:
                                print(f"   📬 Poll OK — max UID {max(all_uids)}, watching for > {last_uid}")
                    else:
                        print("⚠️ No UIDs returned — inbox empty or connection issue")

                    # Poll every 3 seconds
                    for _ in range(30):
                        if user_info["stop_flag"]:
                            break
                        time.sleep(0.1)

                except Exception as e:
                    print(f"Poll loop error: {e}")
                    break

            try:
                mail.logout()
            except Exception:
                pass

        except Exception as e:
            print(f"Mail connection error for {user_id}: {e}")
            if not user_info["stop_flag"]:
                time.sleep(3)

    print(f"Mail polling thread stopped for user {user_id}")


# ===== MAILBOX SYNC — Smart initial & manual sync =====
def sync_mailbox(user_id, max_emails=50):
    """Fetch recent emails from Gmail and ingest only those not already recorded.

    Each email goes through process_alert() which checks dedup_hash — so
    previously-ingested emails are automatically skipped. Safe to call
    repeatedly; only truly new emails create incidents.

    Returns: {"total_scanned": int, "new_incidents": int, "skipped": int}
    """
    user_info = online_users.get(user_id)
    if not user_info:
        return {"total_scanned": 0, "new_incidents": 0, "skipped": 0, "error": "User not logged in"}

    email_addr = user_info["email"]
    app_pwd = user_info["app_pwd"]

    # Count existing incidents before sync
    user_data = load_user_data(user_id)
    before_count = len(user_data.get("incidents", []))

    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", timeout=20)
        mail.login(email_addr, app_pwd)
        mail.select("INBOX")

        # Fetch ALL message IDs (not just UNSEEN)
        status, msg_ids = mail.search(None, "ALL")
        if status != "OK" or not msg_ids[0]:
            try:
                mail.logout()
            except Exception:
                pass
            return {"total_scanned": 0, "new_incidents": 0, "skipped": 0, "error": "No messages found"}

        all_ids = msg_ids[0].split()
        # Take the most recent N emails (highest IDs)
        recent_ids = all_ids[-max_emails:] if len(all_ids) > max_emails else all_ids

        print(f"📬 Sync: scanning {len(recent_ids)} recent emails (out of {len(all_ids)} total) for {email_addr}")

        scanned = 0
        for mid in reversed(recent_ids):  # newest first
            if user_info.get("stop_flag"):
                break
            try:
                _, raw_data = mail.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(raw_data[0][1])
                _process_email_msg(msg, user_id)
                scanned += 1
            except Exception as e:
                print(f"Sync: error processing email {mid}: {e}")

        try:
            mail.logout()
        except Exception:
            pass
    except Exception as e:
        print(f"📬 Sync connection error: {e}")
        return {"total_scanned": 0, "new_incidents": 0, "skipped": 0, "error": str(e)}

    # Count how many new incidents were actually created
    user_data = load_user_data(user_id)
    after_count = len(user_data.get("incidents", []))
    new_count = after_count - before_count
    skipped = scanned - new_count

    print(f"📬 Sync complete: scanned={scanned}, new={new_count}, skipped={skipped}")
    return {"total_scanned": scanned, "new_incidents": new_count, "skipped": skipped}


# ===== API ENDPOINTS =====
@app.route("/api/ping", methods=["GET"])
def ping():
    """Lightweight health check — returns server start time so the frontend
    can detect a restart and force the user to re-authenticate."""
    return jsonify({"code": 200, "server_start_time": SERVER_START_TIME, "time": time.time()})

@app.route("/api/settings", methods=["GET"])
def get_settings():
    """Return current LLM settings so the frontend can show the active model."""
    return jsonify({"code": 200, "model": OLLAMA_MODEL, "ollama_url": OLLAMA_URL,
                    "fallback_model": OLLAMA_FALLBACK_MODEL,
                    "escalation_threshold": ESCALATION_THRESHOLD})

@app.route("/api/settings", methods=["POST"])
def set_settings():
    """Update LLM model/URL at runtime — no restart needed."""
    global OLLAMA_MODEL, OLLAMA_URL, OLLAMA_FALLBACK_MODEL, ESCALATION_THRESHOLD
    data = request.get_json() or {}
    if "model" in data and data["model"]:
        OLLAMA_MODEL = data["model"]
        print(f"🤖 Model changed to: {OLLAMA_MODEL}")
    if "ollama_url" in data and data["ollama_url"]:
        OLLAMA_URL = data["ollama_url"]
        print(f"🔗 Ollama URL changed to: {OLLAMA_URL}")
    if "fallback_model" in data and data["fallback_model"]:
        OLLAMA_FALLBACK_MODEL = data["fallback_model"]
        print(f"🔼 Fallback model changed to: {OLLAMA_FALLBACK_MODEL}")
    if "escalation_threshold" in data and data["escalation_threshold"] is not None:
        ESCALATION_THRESHOLD = int(data["escalation_threshold"])
        print(f"📊 Escalation threshold changed to: {ESCALATION_THRESHOLD}%")
    return jsonify({"code": 200, "model": OLLAMA_MODEL, "ollama_url": OLLAMA_URL,
                    "fallback_model": OLLAMA_FALLBACK_MODEL,
                    "escalation_threshold": ESCALATION_THRESHOLD})

@app.route("/api/mail/login", methods=["POST"])
def mail_login():
    request_data = request.get_json() or {}
    mail_account = request_data.get("email", "").strip()
    app_password = request_data.get("app_pwd", "").strip().replace(" ", "")
    if not mail_account or not app_password:
        return jsonify({"code": 400, "msg": "Email and app specific password cannot be empty"}), 400

    # Demo account bypass (for testing without real Gmail credentials)
    if mail_account.lower() in ["demo@comhub.com", "admin@comhub.com"] or app_password == "demo123456":
        user_id = hashlib.sha256(mail_account.encode()).hexdigest()[:16]
        online_users[user_id] = {
            "email": mail_account,
            "app_pwd": app_password,
            "stop_flag": True,
            "thread": None,
            "last_activity": time.time()
        }
        return jsonify({"code": 200, "user_id": user_id, "msg": "Demo login successful"})

    try:
        # Test IMAP connection with 10-second timeout
        test_conn = imaplib.IMAP4_SSL("imap.gmail.com", timeout=10)
        test_conn.login(mail_account, app_password)
        try:
            test_conn.logout()
        except Exception:
            pass
    except Exception as e:
        err_str = str(e)
        print(f"[mail_login] IMAP login failed for {mail_account}: {type(e).__name__}: {err_str}")
        if "AUTHENTICATIONFAILED" in err_str.upper() or "INVALID CREDENTIALS" in err_str.upper():
            msg = "Authentication failed! Check your Gmail address and 16-digit App Password (requires Google 2-Step Verification)."
        elif "TIMEOUT" in err_str.upper() or "TIMED OUT" in err_str.upper():
            msg = "Connection to imap.gmail.com timed out (10s limit). Please check internet or network connection."
        else:
            msg = f"IMAP connection failed: {err_str}. Make sure to use Gmail App Password."
        return jsonify({"code": 401, "msg": msg}), 401

    user_id = hashlib.sha256(mail_account.encode()).hexdigest()[:16]

    # If user already has an active monitoring thread, return immediately.
    # This makes returning to the Overview page instant — no IMAP reconnect.
    if user_id in online_users and not online_users[user_id].get("stop_flag", True):
        online_users[user_id]["last_activity"] = time.time()
        print(f"📬 {mail_account} already monitored — reusing existing session")
        return jsonify({"code": 200, "user_id": user_id, "msg": "Session already active"})

    # Stop old thread if one exists (shouldn't happen given the check above, but safe)
    if user_id in online_users:
        online_users[user_id]["stop_flag"] = True

    online_users[user_id] = {
        "email": mail_account,
        "app_pwd": app_password,
        "stop_flag": False,
        "thread": None,
        "last_activity": time.time()
    }
    poll_thread = socketio.start_background_task(mail_watch_loop, user_id)
    online_users[user_id]["thread"] = poll_thread

    # --- Initial sync: if user has few/no incidents, scan mailbox for existing email ---
    user_data = load_user_data(user_id)
    existing_count = len(user_data.get("incidents", []))
    if existing_count <= 2:
        print(f"📬 New user with {existing_count} incident(s) — running initial mailbox scan...")
        # Run sync in background so login response is fast
        def _initial_sync():
            time.sleep(1)  # brief delay so login response goes out first
            result = sync_mailbox(user_id, max_emails=50)
            if result["new_incidents"] > 0:
                socketio.emit("sync_complete", {
                    "client_user_id": user_id,
                    "new_incidents": result["new_incidents"],
                    "scanned": result["total_scanned"],
                    "skipped": result["skipped"]
                })
        threading.Thread(target=_initial_sync, daemon=True).start()

    return jsonify({"code": 200, "user_id": user_id, "msg": "Login successful, mail monitoring started"})

@app.route("/api/mail/logout", methods=["POST"])
def mail_logout():
    request_data = request.get_json()
    user_id = request_data.get("user_id")
    if user_id not in online_users:
        return jsonify({"code": 404, "msg": "User session not found"}), 404
    online_users[user_id]["stop_flag"] = True
    time.sleep(0.5)
    if user_id in online_users:
        del online_users[user_id]
    return jsonify({"code": 200, "msg": "Logged out successfully, mail monitoring stopped"})

@app.route("/api/heartbeat", methods=["POST"])
def heartbeat():
    """Frontend pings this to signal user is active — resets the inactivity timer."""
    request_data = request.get_json() or {}
    user_id = request_data.get("user_id")
    if not user_id:
        return jsonify({"code": 400, "msg": "user_id is required"}), 400
    update_user_activity(user_id)
    return jsonify({"code": 200, "msg": "ok"})

@app.route("/api/mail/sync", methods=["POST"])
def mail_sync():
    """Manual sync: scan recent Gmail emails and ingest only new ones.
    Request: {"user_id": "..."}
    Response: {"code": 200, "total_scanned": N, "new_incidents": N, "skipped": N}
    """
    request_data = request.get_json() or {}
    user_id = request_data.get("user_id")
    if not user_id or user_id not in online_users:
        return jsonify({"code": 401, "msg": "Please log in your email first"}), 401
    result = sync_mailbox(user_id, max_emails=50)
    return jsonify({"code": 200, **result})

@app.route("/api/incidents/reclassify", methods=["POST"])
def reclassify_incidents():
    """Re-run LLM classification on incidents with 0 confidence (Ollama was down).
    POST body: {"user_id": "xxx", "incident_id": "INC-047"} — omit incident_id to fix all.
    """
    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    user_data = load_user_data(user_id)
    target_id = data.get("incident_id")

    reclassified = 0
    for inc in user_data["incidents"]:
        if target_id and inc["id"] != target_id:
            continue
        if not target_id and inc.get("confidence", 100) > 0:
            continue
        # Re-run LLM classification
        title = inc.get("title", "")
        body = inc.get("full_body", inc.get("description", ""))
        source = inc.get("source", "generic")
        result = classify_alert(title, body, source)
        inc["tier"] = result["tier"]
        inc["tier_label"] = result["tier_label"]
        inc["classification_reason"] = result.get("reason", "")
        inc["confidence"] = result.get("confidence", 50)
        inc["location_names"] = result.get("locations", [])
        # Re-geocode
        raw_locs = result.get("locations", [])
        inc["locations"] = geocode_locations(raw_locs) if raw_locs else []
        reclassified += 1
        print(f"🔁 Reclassified {inc['id']}: {result['tier_label']} (conf={result['confidence']}%)")

    if reclassified == 0:
        return jsonify({"code": 200, "msg": "No incidents needed reclassification", "reclassified": 0})
    save_user_data(user_id, user_data)
    return jsonify({"code": 200, "msg": f"{reclassified} incident(s) reclassified", "reclassified": reclassified})


@app.route("/api/incidents/<inc_id>/reclassify_manual", methods=["POST"])
def reclassify_manual(inc_id):
    """Human override: manually set the tier for an incident.

    POST body: {
        "user_id": "...",
        "tier": 1|2|3,
        "reason": "optional explanation"
    }
    Records manually_overridden=True, override_reason, override_at, and
    recalculates the SLA deadline based on the new tier.
    """
    data = request.get_json() or {}
    user_id = data.get("user_id")
    new_tier = data.get("tier")
    override_reason = data.get("reason", "").strip()

    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    if new_tier not in (1, 2, 3):
        return jsonify({"code": 400, "msg": "tier must be 1, 2, or 3"}), 400
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 401, "msg": "Unauthorized — please log in first"}), 401

    tier_labels = {1: "Critical", 2: "Medium", 3: "Low"}
    lock = _get_user_lock(user_id)
    with lock:
        user_data = load_user_data(user_id)
        for inc in user_data["incidents"]:
            if inc["id"] != inc_id:
                continue
            old_tier = inc["tier"]
            old_label = inc["tier_label"]
            inc["tier"] = new_tier
            inc["tier_label"] = tier_labels[new_tier]
            inc["manually_overridden"] = True
            inc["override_reason"] = override_reason or f"Manually changed from {old_label} to {tier_labels[new_tier]}"
            inc["override_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            # Ensure "human_reviewed" flag is set, remove "low_confidence"
            flags = inc.get("classification_flags", [])
            if "low_confidence" in flags:
                flags.remove("low_confidence")
            if "human_reviewed" not in flags:
                flags.append("human_reviewed")
            inc["classification_flags"] = flags
            inc["needs_review"] = False
            # Recalculate SLA deadline based on the new tier
            sla_window = SLA_CONFIG[new_tier]
            inc["sla_countdown"] = sla_window
            try:
                created_ts = time.mktime(time.strptime(inc["created_at"], "%Y-%m-%d %H:%M:%S"))
            except Exception:
                created_ts = time.time()
            inc["sla_deadline_ts"] = int(created_ts + sla_window)
            save_user_data(user_id, user_data)
            socketio.emit("incident_updated", {
                "client_user_id": user_id,
                "incident": inc
            })
            print(f"👤 Manual override: {inc_id} changed {old_label} → {tier_labels[new_tier]} | reason: {inc['override_reason']}")
            return jsonify({"code": 200, "msg": f"{inc_id} reclassified to {tier_labels[new_tier]}", "incident": inc})

    return jsonify({"code": 404, "msg": f"Incident {inc_id} not found"}), 404

@app.route("/api/incidents", methods=["GET"])
def get_incidents():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"code": 401, "msg": "Please log in your email first"}), 401
    return jsonify(load_user_data(user_id))

@app.route("/api/locations", methods=["GET"])
def get_locations():
    """Return all geocoded location data for every incident belonging to a user.
    Useful for populating the incident map page.
    """
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"code": 401, "msg": "Please log in your email first"}), 401
    user_data = load_user_data(user_id)
    map_points = []
    for inc in user_data.get("incidents", []):
        if inc.get("finished") or inc.get("status") == "resolved":
            continue
        locs = inc.get("locations", [])
        for loc in locs:
            # Skip invalid / non-geographic names so garbage geocodes
            # (e.g. "unknown" → Bahamas, "global" → Denmark) never pollute the map.
            if not _is_valid_location(loc.get("name", "")):
                continue
            map_points.append({
                "incident_id": inc["id"],
                "incident_title": inc["title"],
                "tier": inc["tier"],
                "tier_label": inc["tier_label"],
                "status": inc["status"],
                "acknowledged": inc.get("acknowledged", False),
                "created_at": inc["created_at"],
                "sla_deadline_ts": inc.get("sla_deadline_ts"),
                "classification_reason": inc.get("classification_reason", ""),
                "location_name": loc["name"],
                "lat": loc["lat"],
                "lon": loc["lon"],
                "display_name": loc.get("display_name", loc["name"])
            })
    return jsonify({"code": 200, "points": map_points, "total": len(map_points)})

@app.route("/api/stats/timeseries", methods=["GET"])
def stats_timeseries():
    """Return time-bucketed incident counts for trend charts.
    Query params: user_id, granularity=hour|day (default: day), days=7 (default: 7)
    """
    user_id = request.args.get("user_id")
    granularity = request.args.get("granularity", "day")
    try:
        days = int(request.args.get("days", 7))
    except (ValueError, TypeError):
        days = 7
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 200, "buckets": [], "msg": "no data yet"})
    user_data = load_user_data(user_id)
    incidents = user_data.get("incidents", [])

    now = time.time()
    cutoff = now - (days * 86400)
    bucket_count = days * 24 if granularity == "hour" else days
    bucket_seconds = 3600 if granularity == "hour" else 86400

    buckets = []
    for i in range(bucket_count):
        bucket_start = now - ((bucket_count - i) * bucket_seconds)
        bucket_end = bucket_start + bucket_seconds
        bucket_label = time.strftime(
            "%Y-%m-%dT%H:00" if granularity == "hour" else "%Y-%m-%d",
            time.localtime(bucket_start)
        )
        buckets.append({
            "label": bucket_label,
            "total": 0,
            "critical": 0,
            "medium": 0,
            "low": 0,
            "acknowledged": 0,
            "finished": 0
        })

    for inc in incidents:
        try:
            inc_ts = time.mktime(time.strptime(inc["created_at"], "%Y-%m-%d %H:%M:%S"))
        except (ValueError, KeyError):
            continue
        if inc_ts < cutoff:
            continue
        bucket_idx = int((inc_ts - (now - bucket_count * bucket_seconds)) / bucket_seconds)
        if 0 <= bucket_idx < bucket_count:
            b = buckets[bucket_idx]
            b["total"] += 1
            tier = inc.get("tier")
            if tier == 1: b["critical"] += 1
            elif tier == 2: b["medium"] += 1
            elif tier == 3: b["low"] += 1
            if inc.get("acknowledged"): b["acknowledged"] += 1
            if inc.get("finished"): b["finished"] += 1

    return jsonify({"code": 200, "granularity": granularity, "days": days, "buckets": buckets})

@app.route("/api/incidents/<inc_id>/ack", methods=["POST"])
def acknowledge_incident(inc_id):
    request_data = request.get_json()
    user_id = request_data.get("user_id")
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    # Check that user data exists (don't require active IMAP session)
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 401, "msg": "Unauthorized, please log in first"}), 401
    user_data = load_user_data(user_id)
    for item in user_data["incidents"]:
        if item["id"] == inc_id:
            item["acknowledged"] = True
            item["acknowledged_by"] = "Current Operator"
            save_user_data(user_id, user_data)
            socketio.emit("incident_updated", {
                "client_user_id": user_id,
                "incident": item
            })
            return jsonify({"code": 200, "msg": "Incident acknowledged successfully"})
    return jsonify({"code": 404, "msg": "Target incident not found"}), 404

@app.route("/api/incidents/<inc_id>/finish", methods=["POST"])
def finish_incident(inc_id):
    request_data = request.get_json()
    user_id = request_data.get("user_id")
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    # Check that user data exists (don't require active IMAP session)
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 401, "msg": "Unauthorized, please log in first"}), 401
    user_data = load_user_data(user_id)
    for item in user_data["incidents"]:
        if item["id"] == inc_id:
            item["finished"] = True
            item["status"] = "resolved"
            item["acknowledged"] = True
            item.setdefault("acknowledged_by", "Current Operator")
            item["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            save_user_data(user_id, user_data)
            socketio.emit("incident_updated", {
                "client_user_id": user_id,
                "incident": item
            })
            return jsonify({"code": 200, "msg": "Incident marked as finished"})
    return jsonify({"code": 404, "msg": "Target incident not found"}), 404

@app.route("/api/incidents/bulk_ack", methods=["POST"])
def bulk_acknowledge():
    """Acknowledge multiple incidents at once."""
    data = request.get_json()
    user_id = data.get("user_id")
    incident_ids = data.get("incident_ids", [])
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    if not incident_ids:
        return jsonify({"code": 400, "msg": "incident_ids list is required"}), 400
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 401, "msg": "Unauthorized, please log in first"}), 401
    user_data = load_user_data(user_id)
    updated = []
    for item in user_data["incidents"]:
        if item["id"] in incident_ids:
            item["acknowledged"] = True
            item.setdefault("acknowledged_by", "Current Operator")
            updated.append(item)
    if updated:
        save_user_data(user_id, user_data)
        for item in updated:
            socketio.emit("incident_updated", {"client_user_id": user_id, "incident": item})
    return jsonify({"code": 200, "msg": f"{len(updated)} incidents acknowledged"})

@app.route("/api/incidents/bulk_finish", methods=["POST"])
def bulk_finish():
    """Mark multiple incidents as finished at once."""
    data = request.get_json()
    user_id = data.get("user_id")
    incident_ids = data.get("incident_ids", [])
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    if not incident_ids:
        return jsonify({"code": 400, "msg": "incident_ids list is required"}), 400
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 401, "msg": "Unauthorized, please log in first"}), 401
    user_data = load_user_data(user_id)
    updated = []
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    for item in user_data["incidents"]:
        if item["id"] in incident_ids:
            item["finished"] = True
            item["status"] = "resolved"
            item["acknowledged"] = True
            item.setdefault("acknowledged_by", "Current Operator")
            item["finished_at"] = now_str
            updated.append(item)
    if updated:
        save_user_data(user_id, user_data)
        for item in updated:
            socketio.emit("incident_updated", {"client_user_id": user_id, "incident": item})
    return jsonify({"code": 200, "msg": f"{len(updated)} incidents finished"})

@app.route("/api/incidents/<inc_id>/assign", methods=["POST"])
def assign_incident(inc_id):
    request_data = request.get_json()
    user_id = request_data.get("user_id")
    assigned_to = request_data.get("assigned_to", None)  # staff name or None to unassign
    auto_notify = request_data.get("notify", False)       # trigger notification gateway if True
    staff_info  = request_data.get("staff_info", {})      # {name, phone, pagerduty_email}
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id is required"}), 401
    # Check that user data exists (don't require active IMAP session)
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 401, "msg": "Unauthorized, please log in first"}), 401
    user_data = load_user_data(user_id)
    for item in user_data["incidents"]:
        if item["id"] == inc_id:
            if assigned_to and item.get("assigned_to") and item["assigned_to"] != assigned_to:
                return jsonify({"code": 409, "msg": f"Already assigned to {item['assigned_to']}. Release first before reassigning."}), 409
            item["assigned_to"] = assigned_to
            save_user_data(user_id, user_data)
            socketio.emit("incident_updated", {
                "client_user_id": user_id,
                "incident": item
            })
            notify_result = None
            if auto_notify and assigned_to and staff_info:
                notify_result = dispatch_notification(staff_info, item)
            resp = {"code": 200, "msg": "Incident assigned successfully", "assigned_to": assigned_to}
            if notify_result:
                resp["notification"] = notify_result
            return jsonify(resp)
    return jsonify({"code": 404, "msg": "Target incident not found"}), 404


# ===== NOTIFICATION GATEWAY ENDPOINTS =====

@app.route("/api/notify/config", methods=["GET"])
def get_notify_config():
    """Return current notification config — secrets are masked."""
    cfg = NOTIFICATION_CONFIG
    return jsonify({
        "code": 200,
        "provider": cfg["provider"],
        "auto_notify_tier": cfg["auto_notify_tier"],
        "twilio_account_sid": _mask_secret(cfg["twilio_account_sid"]),
        "twilio_from_number": cfg["twilio_from_number"],
        "twilio_voice_enabled": cfg["twilio_voice_enabled"],
        "pagerduty_routing_key": _mask_secret(cfg["pagerduty_routing_key"]),
        "twilio_configured": bool(cfg["twilio_account_sid"] and cfg["twilio_auth_token"] and cfg["twilio_from_number"]),
        "pagerduty_configured": bool(cfg["pagerduty_routing_key"]),
    })


@app.route("/api/notify/config", methods=["POST"])
def set_notify_config():
    """Save notification provider config (in-memory, resets on server restart).
    POST body: { provider, auto_notify_tier, twilio_account_sid, twilio_auth_token,
                 twilio_from_number, twilio_voice_enabled, pagerduty_routing_key }
    Partial updates are safe — only provided keys are overwritten.
    """
    data = request.get_json() or {}
    allowed_keys = [
        "provider", "auto_notify_tier",
        "twilio_account_sid", "twilio_auth_token", "twilio_from_number", "twilio_voice_enabled",
        "pagerduty_routing_key"
    ]
    for key in allowed_keys:
        if key in data:
            # Skip masked placeholder values (user didn't change the secret)
            val = data[key]
            if isinstance(val, str) and "****" in val:
                continue
            NOTIFICATION_CONFIG[key] = val
    provider = NOTIFICATION_CONFIG["provider"]
    print(f"🔔 Notification config updated: provider={provider}, auto_tier={NOTIFICATION_CONFIG['auto_notify_tier']}")
    return jsonify({"code": 200, "msg": f"Config saved (provider: {provider})"})


@app.route("/api/notify/send", methods=["POST"])
def notify_send():
    """Manually fire a notification for a staff member and incident.
    POST body: { user_id, incident_id, staff: {name, phone, pagerduty_email} }
    Returns: { code, ok, provider, actions[], errors[] }
    """
    data = request.get_json() or {}
    user_id = data.get("user_id")
    incident_id = data.get("incident_id")
    staff = data.get("staff", {})

    if not user_id or not incident_id or not staff:
        return jsonify({"code": 400, "msg": "user_id, incident_id, and staff are required"}), 400
    if not os.path.exists(get_user_data_path(user_id)):
        return jsonify({"code": 401, "msg": "Unauthorized"}), 401

    user_data = load_user_data(user_id)
    incident = next((i for i in user_data["incidents"] if i["id"] == incident_id), None)
    if not incident:
        return jsonify({"code": 404, "msg": f"Incident {incident_id} not found"}), 404

    result = dispatch_notification(staff, incident)
    status = 200 if result["ok"] else 500
    return jsonify({"code": status, **result}), status


# ===== WEBHOOK INGESTION =====
def _normalize_datadog(payload):
    """Convert Datadog webhook JSON to InciCare title/body format.

    Datadog's integration tile lets users choose which template variables
    ($ALERT_TITLE, $EVENT_MSG, etc.) to include. We accept whatever common
    fields are present and normalize.

    Returns: (title, body, extra_metadata)
    """
    # --- Title: from the most specific to most generic ---
    title = (
        payload.get("title") or
        payload.get("alert_title") or
        payload.get("name") or
        "Datadog Alert"
    )

    # --- Body: $EVENT_MSG is the most common ---
    text = (
        payload.get("message") or
        payload.get("body") or
        payload.get("text") or
        payload.get("event_msg") or
        ""
    )
    text = text.replace("%%%", "").strip()

    # --- Build enriched body for LLM classification ---
    body_parts = []
    if text:
        body_parts.append(text)

    hostname = payload.get("hostname", "")
    if hostname:
        body_parts.append(f"Host: {hostname}")

    alert_type = payload.get("alert_type", "")
    if alert_type:
        body_parts.append(f"Alert Type: {alert_type}")

    alert_transition = payload.get("alert_transition", "")
    if alert_transition:
        body_parts.append(f"Transition: {alert_transition}")

    tags = payload.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    if tags:
        body_parts.append(f"Tags: {', '.join(tags)}")

    body = "\n".join(body_parts) if body_parts else "No details provided"

    # --- Parse timestamp ---
    raw_date = payload.get("date")
    created_override = None
    if raw_date:
        try:
            ts = int(raw_date) / 1000.0  # $DATE is epoch milliseconds
            created_override = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
        except (ValueError, OSError):
            pass

    # --- Extra metadata preserved for reference ---
    extra = {}
    if created_override:
        extra["created_at"] = created_override

    extra["source_metadata"] = {
        "datadog_alert_id": payload.get("alert_id") or payload.get("id"),
        "datadog_hostname": hostname or None,
        "datadog_tags": tags if tags else None,
        "event_type": payload.get("event_type"),
        "alert_transition": alert_transition or None,
        "priority": payload.get("priority") or payload.get("alert_priority"),
        "org_name": payload.get("org_name"),
        "link": payload.get("link") or payload.get("alert_link"),
    }
    extra["source_metadata"] = {k: v for k, v in extra["source_metadata"].items() if v is not None}

    return title, body, extra


def _normalize_generic(payload):
    """Auto-infer title and body from arbitrary JSON payload.

    Searches for common field names across monitoring, logging, and alerting
    systems. Original payload is preserved in source_metadata.

    Returns: (title, body, extra_metadata)
    """
    title = (
        payload.get("title") or
        payload.get("subject") or
        payload.get("name") or
        payload.get("summary") or
        payload.get("alert_name") or
        "Generic Webhook Alert"
    )

    body = (
        payload.get("message") or
        payload.get("description") or
        payload.get("body") or
        payload.get("text") or
        payload.get("detail") or
        json.dumps(payload)[:1500]
    )

    # Auto-detect severity and prepend to body
    severity = (
        payload.get("severity") or
        payload.get("priority") or
        payload.get("level") or
        payload.get("status") or
        payload.get("alert_severity")
    )
    if severity:
        body = f"Severity/Priority: {severity}\n\n{body}"

    extra = {"source_metadata": {"original_payload": payload}}

    return title, body, extra


@app.route("/api/webhook/datadog", methods=["POST"])
def webhook_datadog():
    """Accept Datadog monitor alert webhooks. user_id in query string."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id query parameter required"}), 401

    payload = request.get_json() or {}
    title, body, extra = _normalize_datadog(payload)
    incident = process_alert(user_id, title, body, source_type="datadog", extra_metadata=extra)
    return jsonify({"code": 200, "incident_id": incident["id"]})


@app.route("/api/webhook/generic", methods=["POST"])
def webhook_generic():
    """Accept arbitrary JSON webhook payloads. Auto-infers title/body/severity."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"code": 401, "msg": "user_id query parameter required"}), 401

    payload = request.get_json() or {}
    title, body, extra = _normalize_generic(payload)
    incident = process_alert(user_id, title, body, source_type="generic", extra_metadata=extra)
    return jsonify({"code": 200, "incident_id": incident["id"]})


# ===== SYSLOG UDP LISTENER =====

def _parse_syslog_rfc3164(msg):
    """Parse RFC 3164 syslog message: <PRI>TIMESTAMP HOSTNAME MSG

    PRI = facility * 8 + severity
    Severity mapping: 0-2→Tier1(Critical), 3-4→Tier2(Medium), 5-7→Tier3(Low)

    Returns: (title, body)
    """
    pri = 13  # default: user.notice
    rest = msg

    if msg.startswith("<") and ">" in msg:
        end = msg.index(">")
        try:
            pri = int(msg[1:end])
        except ValueError:
            pass
        rest = msg[end + 1:].strip()

    severity = pri & 0x07
    facility = (pri >> 3) & 0x1F

    # RFC 3164 severity labels
    sev_labels = {
        0: "EMERGENCY", 1: "ALERT", 2: "CRITICAL",
        3: "ERROR", 4: "WARNING", 5: "NOTICE",
        6: "INFO", 7: "DEBUG"
    }
    sev_name = sev_labels.get(severity, f"SEV{severity}")

    # Map syslog severity to InciCare tier (pre-LLM hint)
    if severity <= 2:
        pre_tier = 1
    elif severity <= 4:
        pre_tier = 2
    else:
        pre_tier = 3

    # Parse: "MMM DD HH:MM:SS HOSTNAME message"
    title = f"[Syslog {sev_name}] {rest[:80]}"
    body = f"Syslog Facility: {facility} | Severity: {sev_name} (pre-tier: {pre_tier})\n\nRaw: {msg}"

    return title, body


def _syslog_udp_listener(port=515):
    """Background thread: listen for RFC 3164 syslog on UDP port 515."""
    sock = _sock_module.socket(_sock_module.AF_INET, _sock_module.SOCK_DGRAM)
    sock.setsockopt(_sock_module.SOL_SOCKET, _sock_module.SO_REUSEADDR, 1)
    try:
        sock.bind(("0.0.0.0", port))
    except OSError as e:
        print(f"⚠️ Syslog: cannot bind UDP {port}: {e}")
        return
    sock.settimeout(2.0)
    print(f"📡 Syslog UDP listener started on 0.0.0.0:{port}")

    # Route syslog incidents to the demo user
    demo_user_id = hashlib.sha256("demo@comhub.com".encode()).hexdigest()[:16]

    while True:
        try:
            data, addr = sock.recvfrom(4096)
            msg = data.decode("utf-8", errors="replace").strip()
            if msg:
                title, body = _parse_syslog_rfc3164(msg)
                process_alert(demo_user_id, title, body, source_type="syslog",
                              extra_metadata={"source_metadata": {"syslog_addr": f"{addr[0]}:{addr[1]}"}})
                print(f"📡 Syslog from {addr[0]}:{addr[1]} → {title[:60]}")
        except _sock_module.timeout:
            continue
        except Exception as e:
            print(f"⚠️ Syslog error: {e}")


# ===== WEBSOCKET EVENTS =====
@socketio.on("bind_user")
def handle_bind_user(user_id):
    join_room(user_id)
    socket_sid_to_user[request.sid] = user_id
    print(f"WebSocket session {request.sid} bound to user {user_id}")

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    if sid in socket_sid_to_user:
        user_id = socket_sid_to_user[sid]
        leave_room(user_id)
        del socket_sid_to_user[sid]
        print(f"WebSocket session {sid} disconnected")

# ===== FRONTEND STATIC FILE SERVING =====
def _no_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.route("/")
def serve_index():
    return _no_cache(send_from_directory(FRONTEND_DIR, "index.html"))

@app.route("/<path:filename>")
def serve_frontend(filename):
    if os.path.exists(os.path.join(FRONTEND_DIR, filename)):
        return _no_cache(send_from_directory(FRONTEND_DIR, filename))
    return jsonify({"code": 404, "msg": "Not found"}), 404

# ===== SERVICE STARTUP - FIXED =====
if __name__ == "__main__":
    print("=== InciCare Multi-User Alert Backend ===")
    print("📧 IMAP Email Monitoring — Gmail inbox polling")
    print("🔗 Webhook Endpoints — POST /api/webhook/datadog & /api/webhook/generic")
    print("📡 Syslog UDP Listener — port 515")
    print(f"🤖 LLM: {OLLAMA_MODEL} @ {OLLAMA_URL}")
    print(f"📁 Frontend: {FRONTEND_DIR}")
    print(f"📁 Data: {BASE_DATA_DIR}")
    print("Backend running on http://127.0.0.1:5000")
    print("Open http://127.0.0.1:5000 in your browser")

    # Start syslog UDP listener in background thread
    syslog_thread = threading.Thread(target=_syslog_udp_listener, args=(515,), daemon=True)
    syslog_thread.start()

    # Warm up Ollama: preload model into memory on startup so first real
    # classification doesn't time out waiting for model loading + inference.
    def _ollama_warmup():
        try:
            print(f"🔥 Warming up Ollama model '{OLLAMA_MODEL}' (preloading into memory)...")
            resp = requests.post(
                OLLAMA_URL,
                json={"model": OLLAMA_MODEL, "prompt": "Hello", "stream": False,
                      "options": {"num_predict": 1}, "keep_alive": -1},
                timeout=(10, 120)
            )
            if resp.ok:
                print(f"✅ Ollama warm-up complete — model '{OLLAMA_MODEL}' is ready")
            else:
                print(f"⚠️ Ollama warm-up returned {resp.status_code}, continuing anyway")
        except Exception as e:
            print(f"⚠️ Ollama warm-up skipped ({e}) — will load on first classification")

    warmup_thread = threading.Thread(target=_ollama_warmup, daemon=True)
    warmup_thread.start()

    # Start inactivity checker — auto-logout after 60s of no user activity
    inactivity_thread = threading.Thread(target=_inactivity_checker_loop, daemon=True)
    inactivity_thread.start()

    # ===== FIX: Correct way to run socketio =====
    # Use socketio.run() without passing async_mode again
    socketio.run(app, host='127.0.0.1', port=5000, debug=True, allow_unsafe_werkzeug=True, use_reloader=False)