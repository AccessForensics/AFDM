# ECT

### Timestamps
All timestamps are recorded in UTC using ISO 8601 format with millisecond precision.

### Chain of Custody
Each artifact is individually SHA-256 hashed and sealed at packet level.
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

