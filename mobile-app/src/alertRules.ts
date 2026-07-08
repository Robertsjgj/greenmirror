import type { PlantProfile } from './plantProfiles';
import type { VisualZone } from './zoneLayout';

export type AlertType = 'moisture' | 'temperature' | 'sensor' | 'node';
export type AlertSeverity = 'critical' | 'warning';

export interface ZoneAlert {
  id: string;
  zoneId: string;
  nodeId?: string;
  plantName?: string;
  displayLabel?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  action?: string;
  zone: VisualZone;
}

// DS18B20 sentinel values
const DS18B20_DISCONNECT = -127;
const DS18B20_POWER_ON   =  85;

// Generic thresholds (no plant profile)
const GENERIC_DRY_PCT = 20;
const GENERIC_WET_PCT = 90;

// Severity escalation offsets
const MOISTURE_CRITICAL_OFFSET = 15; // percentage points beyond threshold
const TEMP_CRITICAL_OFFSET     =  5; // degrees beyond threshold

// TODO: Backend needs per-zone timestamps (last_seen_at) for precise stale detection.
// Currently uses the top-level reading timestamp shared across all zones.
const STALE_WARNING_MS  = 2 * 60 * 1000; // 2 min
const STALE_CRITICAL_MS = 5 * 60 * 1000; // 5 min

function zoneLabel(zone: VisualZone) {
  return zone.displayLabel ?? zone.visualLabel;
}

// ── Moisture ──────────────────────────────────────────────────────────────────

function moistureAlerts(zone: VisualZone, profile: PlantProfile | null): ZoneAlert[] {
  const pct = zone.soilMoisturePct;
  if (pct === null) return [];

  const label = zoneLabel(zone);
  const base = { zoneId: zone.visualLabel, nodeId: zone.nodeId, displayLabel: zone.displayLabel, zone };

  // Firmware reports 0–200% (values >100 = overwatered, not an error). Only
  // values outside 0–200 indicate a damaged/miscalibrated sensor.
  if (pct < 0 || pct > 200) {
    return [{
      ...base,
      id: `${zone.visualLabel}-moisture-invalid`,
      type: 'sensor' as const,
      severity: 'critical' as const,
      title: `Invalid moisture reading on ${label}`,
      message: `${label} reports ${pct}% — sensor may be damaged or miscalibrated.`,
      action: 'Check sensor wiring',
    }];
  }

  if (profile) {
    const { moistureMin, moistureMax, name } = profile;
    if (pct < moistureMin) {
      const critical = moistureMin - pct >= MOISTURE_CRITICAL_OFFSET;
      return [{
        ...base,
        id: `${zone.visualLabel}-moisture-dry`,
        type: 'moisture' as const,
        plantName: name,
        severity: critical ? 'critical' as const : 'warning' as const,
        title: critical ? `${name} is very dry` : `${name} needs water`,
        message: `Soil at ${pct}% — ${name} prefers ${moistureMin}–${moistureMax}%.`,
        action: 'Water this bed',
      }];
    }
    if (pct > moistureMax) {
      const critical = pct - moistureMax >= MOISTURE_CRITICAL_OFFSET;
      return [{
        ...base,
        id: `${zone.visualLabel}-moisture-wet`,
        type: 'moisture' as const,
        plantName: name,
        severity: critical ? 'critical' as const : 'warning' as const,
        title: critical ? `${name} is dangerously wet` : `${name} may be overwatered`,
        message: `Soil at ${pct}% — ${name} prefers ${moistureMin}–${moistureMax}%.`,
        action: 'Reduce watering, check drainage',
      }];
    }
    return []; // within range — no alert
  }

  // No plant assigned: use wide generic thresholds only
  if (pct < GENERIC_DRY_PCT) {
    return [{
      ...base,
      id: `${zone.visualLabel}-moisture-dry`,
      type: 'moisture' as const,
      severity: 'warning' as const,
      title: `${label} getting dry`,
      message: `${label} soil at ${pct}% — looking dry.`,
      action: 'Consider watering',
    }];
  }
  if (pct > GENERIC_WET_PCT) {
    return [{
      ...base,
      id: `${zone.visualLabel}-moisture-wet`,
      type: 'moisture' as const,
      severity: 'warning' as const,
      title: `${label} may be overwatered`,
      message: `${label} soil at ${pct}% — very wet.`,
      action: 'Check drainage',
    }];
  }
  return [];
}

// ── Temperature ───────────────────────────────────────────────────────────────

function temperatureAlerts(zone: VisualZone, profile: PlantProfile | null): ZoneAlert[] {
  const temp = zone.soilTempC;
  if (temp === null) return [];

  const label = zoneLabel(zone);
  const base = { zoneId: zone.visualLabel, nodeId: zone.nodeId, displayLabel: zone.displayLabel, zone };

  // DS18B20 hardware error sentinels
  if (temp === DS18B20_DISCONNECT) {
    return [{
      ...base,
      id: `${zone.visualLabel}-temp-disconnect`,
      type: 'sensor' as const,
      severity: 'critical' as const,
      title: `Temperature sensor disconnected on ${label}`,
      message: `${label} returned −127°C — probe may be unplugged.`,
      action: 'Check sensor cable',
    }];
  }
  if (temp === DS18B20_POWER_ON) {
    return [{
      ...base,
      id: `${zone.visualLabel}-temp-power-on`,
      type: 'sensor' as const,
      severity: 'warning' as const,
      title: `Temperature sensor initialising on ${label}`,
      message: `${label} returned 85°C — probe may still be warming up.`,
      action: 'Wait and recheck',
    }];
  }

  if (!profile) return []; // no thresholds to compare against without a plant

  const { soilTempMin, soilTempMax, name } = profile;
  if (temp < soilTempMin) {
    const critical = soilTempMin - temp >= TEMP_CRITICAL_OFFSET;
    return [{
      ...base,
      id: `${zone.visualLabel}-temp-cold`,
      type: 'temperature' as const,
      plantName: name,
      severity: critical ? 'critical' as const : 'warning' as const,
      title: critical ? `${name} soil dangerously cold` : `${name} soil too cold`,
      message: `Soil at ${temp.toFixed(1)}°C — ${name} prefers ${soilTempMin}–${soilTempMax}°C.`,
      action: 'Add mulch or fleece cover',
    }];
  }
  if (temp > soilTempMax) {
    const critical = temp - soilTempMax >= TEMP_CRITICAL_OFFSET;
    return [{
      ...base,
      id: `${zone.visualLabel}-temp-hot`,
      type: 'temperature' as const,
      plantName: name,
      severity: critical ? 'critical' as const : 'warning' as const,
      title: critical ? `${name} soil dangerously hot` : `${name} soil too warm`,
      message: `Soil at ${temp.toFixed(1)}°C — ${name} prefers ${soilTempMin}–${soilTempMax}°C.`,
      action: 'Shade or cool the bed',
    }];
  }
  return []; // within range — no alert
}

// ── Sensor failures ───────────────────────────────────────────────────────────

function sensorAlerts(zone: VisualZone): ZoneAlert[] {
  const alerts: ZoneAlert[] = [];
  const label = zoneLabel(zone);
  const base = { zoneId: zone.visualLabel, nodeId: zone.nodeId, displayLabel: zone.displayLabel, zone };

  const moistureNotConnected =
    zone.soilMoistureStatus === 'not_connected' || zone.soilMoistureStatus === 'invalid';

  const tempMissing =
    zone.soilTempStatus === 'not_detected' ||
    zone.soilTempStatus === 'not_connected' ||
    (zone.soilTempC === null && zone.soilTempStatus !== 'ok' && zone.soilTempStatus != null);

  if (moistureNotConnected) {
    alerts.push({
      ...base,
      id: `${zone.visualLabel}-sensor-moisture-missing`,
      type: 'sensor' as const,
      severity: 'warning' as const,
      title: `Moisture sensor not connected on ${label}`,
      message: `Moisture sensor not connected in ${label}.`,
      action: 'Connect or check the soil moisture sensor',
    });
  }

  if (tempMissing) {
    alerts.push({
      ...base,
      id: `${zone.visualLabel}-sensor-temp-missing`,
      type: 'sensor' as const,
      severity: 'warning' as const,
      title: `Temperature sensor not connected on ${label}`,
      message: `Temperature sensor not connected in ${label}.`,
      action: 'Check the DS18B20 probe cable',
    });
  }

  // Raw value present but percentage couldn't be computed while the sensor IS
  // reported connected = calibration issue (not a disconnected sensor).
  if (!moistureNotConnected && zone.soilMoisturePct === null && zone.soilMoistureRaw !== null) {
    alerts.push({
      ...base,
      id: `${zone.visualLabel}-sensor-moisture-calc`,
      type: 'sensor' as const,
      severity: 'warning' as const,
      title: `Moisture reading unavailable on ${label}`,
      message: `${label} — moisture percentage could not be calculated from raw value.`,
      action: 'Check sensor calibration',
    });
  }

  return alerts;
}

// ── Stale data ────────────────────────────────────────────────────────────────

function staleAlert(zone: VisualZone): ZoneAlert | null {
  if (!zone.timestamp) return null;
  const age = Date.now() - new Date(zone.timestamp).getTime();
  if (age < STALE_WARNING_MS) return null;

  const label = zoneLabel(zone);
  const minutes = Math.round(age / 60000);
  const critical = age >= STALE_CRITICAL_MS;
  return {
    id: `${zone.visualLabel}-stale`,
    zoneId: zone.visualLabel,
    nodeId: zone.nodeId,
    displayLabel: zone.displayLabel,
    type: 'node',
    severity: critical ? 'critical' : 'warning',
    title: critical ? `${label} data is stale` : `${label} data may be stale`,
    message: `${label} last updated ${minutes}min ago — ESP node may be offline.`,
    action: 'Check ESP node power and WiFi',
    zone,
  };
}

// ── Main exports ──────────────────────────────────────────────────────────────

export function evaluateZoneAlerts(zone: VisualZone, profile: PlantProfile | null): ZoneAlert[] {
  if (!zone.hasReading) return [];

  const stale = staleAlert(zone);
  return [
    ...sensorAlerts(zone),
    ...moistureAlerts(zone, profile),
    ...temperatureAlerts(zone, profile),
    ...(stale ? [stale] : []),
  ];
}

export function evaluateAllAlerts(
  zones: VisualZone[],
  profilesById: Map<string, PlantProfile>
): ZoneAlert[] {
  const seen = new Set<string>();
  const alerts: ZoneAlert[] = [];

  zones.forEach((zone) => {
    const profile = zone.assignedPlant ? (profilesById.get(zone.assignedPlant) ?? null) : null;
    evaluateZoneAlerts(zone, profile).forEach((alert) => {
      if (!seen.has(alert.id)) {
        seen.add(alert.id);
        alerts.push(alert);
      }
    });
  });

  return alerts;
}
