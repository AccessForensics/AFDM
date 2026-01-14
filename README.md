# ECT

### Timestamps
All timestamps are recorded in UTC using ISO 8601 format with millisecond precision.

### Chain of Custody
Each artifact is individually SHA-256 hashed and sealed at packet level.
<<<<<<< Updated upstream
## Third-Party Domain Observation Artifact

Artifact: 	hird_party_domains.json  
Schema: docs/third_party_domains.schema.json

Purpose: Records first-seen third-party domains observed during a run (for vendor attribution and domain transition evidence).

Fields:
- generated_at_utc (UTC, ISO 8601 with milliseconds)
- domains[]
  - domain
  - irst_seen_utc
  - source_artifact (for example 
etwork.har)

=======

### Console Capture (Raw)
When present, console.ndjson contains timestamped browser console events captured as encountered.
- Format: newline-delimited JSON
- Time: UTC ISO 8601 with millisecond precision
- Scope: raw capture only, no interpretation or expectations
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
if (!(Test-Path "runs")) { mkdir runs | Out-Null }
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_console_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{ "ts_utc":"2026-01-14T17:42:11.216Z", "type":"error", "message":"Uncaught TypeError: x is not a function" }
{ "ts_utc":"2026-01-14T17:42:11.317Z", "type":"warn",  "message":"ARIA attribute not recognized" }

### Network Capture (HAR)
When present, 
etwork.har contains raw HTTP request and response entries captured as encountered.
- Purpose: document domain transitions and third-party interactions
- Format: HAR (HTTP Archive)
- Scope: raw capture only, no attribution or interpretation
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_network_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{
  "log": {
    "version": "1.2",
    "creator": { "name": "selftest", "version": "1.0" },
    "entries": [
      {
        "startedDateTime": "2026-01-14T17:42:11.216Z",
        "request": { "method": "GET", "url": "https://example.com/", "headers": [] },
        "response": { "status": 200, "headers": [] }
      },
      {
        "startedDateTime": "2026-01-14T17:42:11.317Z",
        "request": { "method": "GET", "url": "https://thirdparty.example/api", "headers": [] },
        "response": { "status": 200, "headers": [] }
      }
    ]
  }
}

### Execution Environment Record
When present, environment.json documents the recorded execution configuration at the time of capture.
- Time: UTC ISO 8601 with millisecond precision
- Scope: factual recording only
- No claims of optimization, completeness, or compliance
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_env_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{
  "recorded_at_utc": "2026-01-14T17:42:11.216Z",
  "browser": { "name": "Chromium", "version": "121.0" },
  "os": { "name": "Windows", "version": "11" },
  "extensions_disabled": true,
  "cache_cleared": true,
  "cookies_cleared": true,
  "notes": "Recorded configuration state only"
}

### Keyboard Focus Order (Raw)
When present, ocus_order.ndjson records the sequential keyboard focus order as encountered.
- Format: newline-delimited JSON
- Indexing: 1-based, strictly sequential
- Scope: raw capture only, no expected behavior or evaluation
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_focus_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{ "ts_utc":"2026-01-14T17:42:11.216Z", "index":1, "selector":"a.logo", "role":"link", "label":"Home" }
{ "ts_utc":"2026-01-14T17:42:11.317Z", "index":2, "selector":"button.menu", "role":"button", "label":"Menu" }
{ "ts_utc":"2026-01-14T17:42:11.418Z", "index":3, "selector":"input#search", "role":"searchbox", "label":"Search" }

### Video Capture (Supplemental)
When present, ideo.json references a raw screen recording captured during execution.
- Purpose: supplemental visualization for complex navigation
- Format: external video file referenced by filename
- Scope: raw capture only, no narration, no interpretation
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_video_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{
  "recorded_at_utc": "2026-01-14T17:42:11.216Z",
  "format": "webm",
  "filename": "navigation.webm",
  "frame_rate": 30,
  "resolution": "1920x1080",
  "notes": "Raw screen capture"
}

### Evidence Index (Raw)
When present, evidence_index.json provides a timestamped index of artifacts in the packet.
- Purpose: chronological orientation only
- Time: UTC ISO 8601 with millisecond precision
- Scope: index and references only, no analysis or conclusions
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_index_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{
  "generated_at_utc": "2026-01-14T17:42:11.216Z",
  "entries": [
    {
      "ts_utc": "2026-01-14T17:42:11.216Z",
      "artifact": "console",
      "path": "console.ndjson"
    },
    {
      "ts_utc": "2026-01-14T17:42:11.317Z",
      "artifact": "network",
      "path": "network.har"
    }
  ]
}

### ARIA Announcements (Raw)
When present, ria_announcements.ndjson records ARIA live region announcements as emitted.
- Format: newline-delimited JSON
- Time: UTC ISO 8601 with millisecond precision
- Scope: raw assistive output only, no expectations or evaluation
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_aria_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{ "ts_utc":"2026-01-14T17:42:11.216Z", "text":"Menu expanded", "politeness":"polite" }
{ "ts_utc":"2026-01-14T17:42:11.317Z", "text":"Form submission failed", "politeness":"assertive" }

### Third Party Domain Observation (Raw)
When present, 	hird_party_domains.json lists external domains observed during execution.
- Purpose: document domain transitions only
- Time: UTC ISO 8601 with millisecond precision
- Scope: observation only, no attribution, no liability assessment
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_domains_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{
  "generated_at_utc": "2026-01-14T17:42:11.216Z",
  "domains": [
    {
      "domain": "cdn.example.com",
      "first_seen_utc": "2026-01-14T17:42:11.317Z",
      "source_artifact": "network.har"
    },
    {
      "domain": "chat.vendor.com",
      "first_seen_utc": "2026-01-14T17:42:11.418Z",
      "source_artifact": "network.har"
    }
  ]
}

### Third Party Domain Observation (Raw)
When present, 	hird_party_domains.json lists external domains observed during execution.
- Purpose: document domain transitions only
- Time: UTC ISO 8601 with millisecond precision
- Scope: observation only, no attribution, no liability assessment
"

# ---------- SELF TEST: CREATE + MANIFEST + VERIFY ----------
. tools\af_manifest.ps1

runs\_selftest_1768413133523 = "runs\_selftest_domains_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
mkdir runs\_selftest_1768413133523 | Out-Null

@"
{
  "generated_at_utc": "2026-01-14T17:42:11.216Z",
  "domains": [
    {
      "domain": "cdn.example.com",
      "first_seen_utc": "2026-01-14T17:42:11.317Z",
      "source_artifact": "network.har"
    },
    {
      "domain": "chat.vendor.com",
      "first_seen_utc": "2026-01-14T17:42:11.418Z",
      "source_artifact": "network.har"
    }
  ]
}
>>>>>>> Stashed changes
