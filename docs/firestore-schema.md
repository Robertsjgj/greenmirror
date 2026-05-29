# GreenMirror — Firestore Data Model

**Project phase:** Internet/Wi-Fi development mode  
**Database:** Google Cloud Firestore (Native mode)  
**Security rules:** Not yet locked down — apply rules before any public access

---

## Overview

All data is stored under top-level collections.  No deeply-nested sub-collections are used at this stage so queries stay simple and the app can be extended without restructuring.

```
greenhouses/
latestReadings/        ← overwritten on every reading (real-time listeners)
readings/              ← append-only history
nodes/
zones/
plantProfiles/
zoneAssignments/
alerts/
tasks/
wateringEvents/
activityLogs/
```

---

## Collections

### `greenhouses/{greenhouseId}`

One document per physical greenhouse site.

| Field       | Type      | Description                              |
|-------------|-----------|------------------------------------------|
| `id`        | string    | Same as document ID (e.g. `sydney-greenhouse`) |
| `name`      | string    | Display name (e.g. `"Sydney"`)           |
| `region`    | string    | Human region (e.g. `"Sydney, NSW"`)      |
| `timezone`  | string?   | IANA tz (e.g. `"Australia/Sydney"`)      |
| `createdAt` | timestamp | Server timestamp on first write          |
| `updatedAt` | timestamp | Server timestamp on last update          |

**Known IDs:** `sydney-greenhouse`, `truro-greenhouse`

---

### `latestReadings/{greenhouseId}`

Single document per greenhouse, **overwritten** on every reading.  
Frontend Firestore listeners subscribe to this for near-real-time updates.

| Field           | Type        | Description                              |
|-----------------|-------------|------------------------------------------|
| `greenhouse_id` | string      | e.g. `"sydney-greenhouse"`               |
| `node_id`       | string?     | ESP node that sent the reading           |
| `node_count`    | number?     | Number of nodes in this payload          |
| `zone_count`    | number?     | Number of zones in this payload          |
| `mode`          | string      | `"real"` or `"simulation"`               |
| `timestamp`     | string      | ISO-8601 string from ESP/simulator       |
| `_savedAt`      | timestamp   | Firestore server timestamp on write      |
| `zones`         | ZoneReading[] | Inline array (see below)               |

**ZoneReading (inline)**

| Field                | Type     | Description                    |
|----------------------|----------|--------------------------------|
| `zone_id`            | string   | Backend zone ID (e.g. `zone-01-1`) |
| `node_id`            | string?  | Originating node               |
| `greenhouse_id`      | string?  | Site identifier                |
| `soil_moisture_raw`  | number?  | Raw ADC value                  |
| `soil_moisture_pct`  | number?  | Normalised 0–100               |
| `soil_temp_c`        | number?  | DS18B20 reading in °C          |
| `soil_temp_status`   | string?  | `"ok"` / `"disconnected"` etc. |
| `alerts`             | string[] | Backend-generated alert strings|

---

### `readings/{auto-id}`

Append-only history.  Same schema as `latestReadings` above.  
Used for trend analysis and historic charts.

**Suggested query:**
```js
query(collection(db, 'readings'), orderBy('timestamp', 'desc'), limit(100))
```

**Pruning:** No automatic pruning implemented yet. Add a Cloud Function or scheduled deletion if this grows large.

---

### `nodes/{nodeId}`

One document per ESP node.

| Field           | Type      | Description                              |
|-----------------|-----------|------------------------------------------|
| `nodeId`        | string    | e.g. `"node-01"`                         |
| `greenhouseId`  | string    | Parent greenhouse                        |
| `zoneCount`     | number    | Zones managed by this node               |
| `firmwareVersion` | string? | ESP firmware version string             |
| `lastSeen`      | timestamp | Last reading received                    |
| `status`        | string    | `"online"` / `"offline"` / `"unknown"`   |

---

### `zones/{zoneId}`

One document per physical zone.  Document ID = `{greenhouseId}__{visualLabel}`.

| Field           | Type    | Description                               |
|-----------------|---------|-------------------------------------------|
| `greenhouseId`  | string  | Parent greenhouse                         |
| `visualLabel`   | string  | Stable physical ID (e.g. `SYD-GH-LEFT-01`)|
| `displayLabel`  | string? | Human label shown in UI                   |
| `rowLabel`      | string  | Row grouping (e.g. `"A"`, `"Left"`)       |
| `nodeId`        | string? | Assigned ESP node                         |
| `createdAt`     | timestamp |                                         |
| `updatedAt`     | timestamp |                                         |

---

### `plantProfiles/{profileId}`

One document per plant profile. Document ID = profile `id` (e.g. `"tomato"`).

| Field          | Type    | Description                         |
|----------------|---------|-------------------------------------|
| `id`           | string  | Slug ID (e.g. `"tomato"`)           |
| `name`         | string  | Display name (e.g. `"Tomato"`)      |
| `icon`         | string? | Emoji (e.g. `"🍅"`)                |
| `moistureMin`  | number  | % lower bound                       |
| `moistureMax`  | number  | % upper bound                       |
| `soilTempMin`  | number  | °C lower bound                      |
| `soilTempMax`  | number  | °C upper bound                      |
| `notes`        | string? | Care notes                          |
| `isDefault`    | boolean | Part of built-in profile set        |
| `isCustom`     | boolean | User-created                        |
| `createdAt`    | timestamp |                                   |
| `updatedAt`    | timestamp |                                   |

---

### `zoneAssignments/{greenhouseId}`

One document per greenhouse.
The frontend reads this document as the source of truth and caches it in localStorage only for fallback/offline display.

| Field         | Type                | Description                                      |
|---------------|---------------------|--------------------------------------------------|
| `assignments` | map<string, string> | Stable visual zone ID -> plant profile ID        |

Example:

```json
{
  "assignments": {
    "SYD-GH-LEFT-05": "tomato",
    "SYD-GH-MID-01": "cucumber"
  }
}
```

---

### `alerts/{auto-id}`

Generated by backend analysis or frontend `alertRules.ts`.

| Field         | Type      | Description                                |
|---------------|-----------|--------------------------------------------|
| `greenhouseId`| string    | Parent greenhouse                          |
| `zoneId`      | string    | Visual zone ID                             |
| `nodeId`      | string?   | Originating node                           |
| `plantName`   | string?   | Assigned plant at time of alert            |
| `type`        | string    | `"moisture"` / `"temperature"` / `"sensor"` / `"node"` |
| `severity`    | string    | `"critical"` / `"warning"`                |
| `title`       | string    | Short alert title                          |
| `message`     | string    | Full description                           |
| `resolved`    | boolean   | Whether the alert has been addressed       |
| `createdAt`   | timestamp |                                            |
| `resolvedAt`  | timestamp?|                                            |

---

### `tasks/{auto-id}`

Plant-care tasks for a given day.

| Field         | Type      | Description                              |
|---------------|-----------|------------------------------------------|
| `greenhouseId`| string    | Parent greenhouse                        |
| `zoneId`      | string    | Visual zone ID                           |
| `kind`        | string    | `"water"` / `"check"`                   |
| `label`       | string    | Human task description                   |
| `date`        | string    | `YYYY-MM-DD`                             |
| `completedAt` | timestamp?| When the task was marked done            |
| `completedBy` | string?   | User or device that completed it         |

---

### `wateringEvents/{auto-id}`

Log of watering actions.

| Field         | Type      | Description                             |
|---------------|-----------|-----------------------------------------|
| `greenhouseId`| string    | Parent greenhouse                       |
| `visualZoneId`| string    | Zone that was watered                   |
| `amountMl`    | number    | Volume in millilitres                   |
| `plantName`   | string?   | Plant assigned at time of watering      |
| `source`      | string    | `"manual"` / `"automated"`             |
| `timestamp`   | timestamp | Server timestamp                        |

---

### `activityLogs/{auto-id}`

Human-readable activity feed (mirrors localStorage `greenmirror-activity-log`).

| Field         | Type      | Description                             |
|---------------|-----------|-----------------------------------------|
| `type`        | string    | `"watering"` / `"assignment"` / `"cleared"` / `"profile-update"` |
| `greenhouseId`| string?   | Parent greenhouse                       |
| `visualZoneId`| string?   | Zone involved                           |
| `plantName`   | string?   | Plant involved                          |
| `amountMl`    | number?   | Volume (watering events only)           |
| `message`     | string    | Human-readable log line                 |
| `timestamp`   | timestamp | Server timestamp                        |

---

## Indexes required

Firestore will prompt for composite index creation when queries first run.
Expected indexes:

| Collection    | Fields                                  | Order |
|---------------|-----------------------------------------|-------|
| `readings`    | `timestamp` DESC                        | DESC  |
| `readings`    | `greenhouse_id` ASC, `timestamp` DESC   | —     |
| `wateringEvents` | `greenhouseId` ASC, `timestamp` DESC | —     |
| `activityLogs` | `greenhouseId` ASC, `timestamp` DESC  | —     |
| `alerts`      | `greenhouseId` ASC, `resolved` ASC, `createdAt` DESC | — |

---

## Security rules (starter — tighten before production)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // TODO: replace with auth-based rules before public deployment
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

---

## Data flow

```
ESP firmware  →  POST /api/readings  →  server.js
                                          ├── in-memory (existing)
                                          └── Firestore:
                                               ├── readings/{auto}        (history)
                                               └── latestReadings/{ghId}  (real-time)

Simulator     →  onSystemState()    →  server.js
                                          └── same Firestore writes

Frontend      →  GET /api/latest    →  polling every 8 s (existing)
              →  Firestore listener →  latestReadings/{ghId} (supplemental)
```

The frontend uses API polling as the primary data source.  
Firestore listeners are supplemental and can coexist or replace polling in a future phase.
