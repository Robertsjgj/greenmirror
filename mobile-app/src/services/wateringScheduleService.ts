import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { LatestReading, VisualZone } from "../zoneLayout";

const WATERING_TIME_ZONE = "America/Halifax";
const DEFAULT_HOSE_FLOW_RATE_LPM = 8;
const DEFAULT_HOT_DAY_THRESHOLD_C = 28;
const DEFAULT_NORMAL_TIME = "09:00";
const DEFAULT_HOT_MORNING_TIME = "08:00";
const DEFAULT_HOT_EVENING_TIME = "18:00";

export interface WateringScheduleUser {
  uid: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
  greenhouseId: string;
  active: boolean;
}

export interface WateringSettings {
  greenhouseId: string;
  hoseFlowRateLpm: number;
  hotDayThresholdC: number;
  normalWateringTime: string;
  hotMorningTime: string;
  hotEveningTime: string;
  updatedAt?: unknown;
}

export interface WateringRound {
  id: "morning" | "evening";
  label: string;
  time: string;
  completed: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
}

export interface WateringBedTask {
  zoneId: string;
  zoneName: string;
  plantName?: string;
  litres: number;
  hoseMinutes: number;
  instruction: string;
}

export interface WateringSchedule {
  id: string;
  greenhouseId: string;
  greenhouseName: string;
  date: string;

  assignedUserId: string;
  assignedUserName: string;
  assignedUsername: string;

  hotDay: boolean;
  temperatureC: number | null;
  roundsPerDay: 1 | 2;

  hoseFlowRateLpm: number;
  hotDayThresholdC: number;

  totalLitresPerRound: number;
  totalDailyLitres: number;
  totalHoseMinutesPerRound: number;
  totalDailyHoseMinutes: number;

  rounds: WateringRound[];
  beds: WateringBedTask[];

  instruction: string;
  notes?: string;
  manuallyEdited?: boolean;
  completed?: boolean;

  createdAt?: unknown;
  updatedAt?: unknown;
}

interface BuildScheduleInput {
  greenhouseId: string;
  greenhouseName: string;
  date: string;
  users: WateringScheduleUser[];
  zones: VisualZone[];
  latestReading: LatestReading | null;
  settings: WateringSettings;
  existing?: WateringSchedule | null;
}

function noopUnsubscribe(): void {
  return undefined;
}

export function defaultWateringSettings(
  greenhouseId: string,
): WateringSettings {
  return {
    greenhouseId,
    hoseFlowRateLpm: DEFAULT_HOSE_FLOW_RATE_LPM,
    hotDayThresholdC: DEFAULT_HOT_DAY_THRESHOLD_C,
    normalWateringTime: DEFAULT_NORMAL_TIME,
    hotMorningTime: DEFAULT_HOT_MORNING_TIME,
    hotEveningTime: DEFAULT_HOT_EVENING_TIME,
  };
}

export function getWateringDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WATERING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getUpcomingWateringDates(days = 7): string[] {
  const dates: string[] = [];
  const base = new Date();

  for (let i = 0; i < days; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(getWateringDateKey(d));
  }

  return dates;
}

export function wateringScheduleId(greenhouseId: string, date: string): string {
  return `${greenhouseId}_${date}`;
}

function dayIndex(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function roundNumber(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);

    // Preserve Firestore Timestamp / FieldValue / Date-like objects.
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }

    const cleaned: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(
      ([key, nested]) => {
        if (nested === undefined) return;
        cleaned[key] = removeUndefinedDeep(nested);
      },
    );

    return cleaned as T;
  }

  return value;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function displayTemp(latestReading: LatestReading | null): number | null {
  const value =
    latestReading?.external_weather?.temp_c ??
    latestReading?.environment?.air_temp_c ??
    latestReading?.env_temp_c ??
    null;

  return typeof value === "number" && Number.isFinite(value)
    ? roundNumber(value, 1)
    : null;
}

function zoneArea(zone: VisualZone): string {
  const z = zone as VisualZone & { area?: string };
  return z.area ?? zone.rowLabel ?? "greenhouse";
}

function zoneShape(zone: VisualZone): string {
  const z = zone as VisualZone & { shape?: string };
  return z.shape ?? "rect";
}

function shouldIncludeZone(zone: VisualZone): boolean {
  const area = zoneArea(zone);
  const hasPlant = Boolean(zone.assignedPlantProfile || zone.referenceCrop);

  if (area === "utility" && !hasPlant) {
    return false;
  }

  return true;
}

function plantNameForZone(zone: VisualZone): string | undefined {
  return zone.assignedPlantProfile?.name ?? zone.referenceCrop ?? undefined;
}

function estimateLitresForZone(zone: VisualZone): number {
  const area = zoneArea(zone);
  const shape = zoneShape(zone);
  const plantName = (plantNameForZone(zone) ?? "").toLowerCase();

  let litres = 6;

  if (shape === "circle") litres = 3.5;
  else if (area === "greenhouse") litres = 6;
  else if (area === "outdoor") litres = 8;
  else if (area === "pumpkin") litres = 12;
  else litres = 5;

  if (
    plantName.includes("watermelon") ||
    plantName.includes("pumpkin") ||
    plantName.includes("squash")
  ) {
    litres += 4;
  } else if (
    plantName.includes("cucumber") ||
    plantName.includes("zucchini") ||
    plantName.includes("corn")
  ) {
    litres += 2;
  }

  const moisture = zone.soilMoisturePct;
  const profile = zone.assignedPlantProfile;

  if (typeof moisture === "number" && profile) {
    if (moisture < profile.moistureMin - 10) litres += 2;
    else if (moisture < profile.moistureMin) litres += 1;
    else if (moisture > profile.moistureMax) litres -= 2;
  } else if (typeof moisture === "number") {
    if (moisture < 35) litres += 2;
    else if (moisture > 80) litres -= 2;
  }

  return Math.max(2, roundToHalf(litres));
}

function buildRounds(
  hotDay: boolean,
  settings: WateringSettings,
  existing?: WateringSchedule | null,
): WateringRound[] {
  const existingById = new Map(
    existing?.rounds.map((round) => [round.id, round]) ?? [],
  );

  if (hotDay) {
    const morningExisting = existingById.get("morning");
    const eveningExisting = existingById.get("evening");

    return [
      {
        id: "morning",
        label: "Morning watering",
        time: morningExisting?.time ?? settings.hotMorningTime,
        completed: morningExisting?.completed ?? false,
        completedAt: morningExisting?.completedAt ?? null,
        completedBy: morningExisting?.completedBy ?? null,
        completedByName: morningExisting?.completedByName ?? null,
      },
      {
        id: "evening",
        label: "Evening watering",
        time: eveningExisting?.time ?? settings.hotEveningTime,
        completed: eveningExisting?.completed ?? false,
        completedAt: eveningExisting?.completedAt ?? null,
        completedBy: eveningExisting?.completedBy ?? null,
        completedByName: eveningExisting?.completedByName ?? null,
      },
    ];
  }

  const existingMorning = existingById.get("morning");

  return [
    {
      id: "morning",
      label: "Daily watering",
      time: existingMorning?.time ?? settings.normalWateringTime,
      completed: existingMorning?.completed ?? false,
      completedAt: existingMorning?.completedAt ?? null,
      completedBy: existingMorning?.completedBy ?? null,
      completedByName: existingMorning?.completedByName ?? null,
    },
  ];
}

export function recalculateWateringSchedule(
  schedule: WateringSchedule,
  hoseFlowRateLpm: number,
  rounds: WateringRound[] = schedule.rounds,
): WateringSchedule {
  const safeFlow = Math.max(1, hoseFlowRateLpm);

  const beds = schedule.beds.map((bed) => ({
    ...bed,
    hoseMinutes: roundNumber(bed.litres / safeFlow, 1),
  }));

  const totalLitresPerRound = roundNumber(
    beds.reduce((sum, bed) => sum + bed.litres, 0),
    1,
  );
  const totalHoseMinutesPerRound = roundNumber(
    totalLitresPerRound / safeFlow,
    1,
  );

  return {
    ...schedule,
    hoseFlowRateLpm: safeFlow,
    rounds,
    roundsPerDay: rounds.length === 2 ? 2 : 1,
    beds,
    totalLitresPerRound,
    totalDailyLitres: roundNumber(totalLitresPerRound * rounds.length, 1),
    totalHoseMinutesPerRound,
    totalDailyHoseMinutes: roundNumber(
      totalHoseMinutesPerRound * rounds.length,
      1,
    ),
    completed: rounds.every((round) => round.completed),
  };
}

export function buildWateringSchedule({
  greenhouseId,
  greenhouseName,
  date,
  users,
  zones,
  latestReading,
  settings,
  existing,
}: BuildScheduleInput): WateringSchedule {
  const activeUsers = users
    .filter((user) => user.active)
    .sort((a, b) => {
      const aName = a.displayName || a.username;
      const bName = b.displayName || b.username;
      return aName.localeCompare(bName);
    });

  if (activeUsers.length === 0) {
    throw new Error("No active users found for this greenhouse.");
  }

  const previousAssignee = activeUsers.find(
    (user) => user.uid === existing?.assignedUserId,
  );

  const assignedUser =
    previousAssignee ?? activeUsers[dayIndex(date) % activeUsers.length];

  const temperatureC = displayTemp(latestReading);
  const hotDay =
    typeof temperatureC === "number" &&
    temperatureC >= settings.hotDayThresholdC;

  const beds: WateringBedTask[] = zones
    .filter(shouldIncludeZone)
    .map((zone) => {
      const litres = estimateLitresForZone(zone);
      const hoseMinutes = roundNumber(litres / settings.hoseFlowRateLpm, 1);

      return {
        zoneId: zone.visualLabel,
        zoneName: zone.displayLabel ?? zone.visualLabel,
        plantName: plantNameForZone(zone),
        litres,
        hoseMinutes,
        instruction: "Water evenly across the whole bed.",
      };
    });

  const rounds = buildRounds(hotDay, settings, existing);
  const baseSchedule: WateringSchedule = {
    id: wateringScheduleId(greenhouseId, date),
    greenhouseId,
    greenhouseName,
    date,

    assignedUserId: assignedUser.uid,
    assignedUserName: assignedUser.displayName,
    assignedUsername: assignedUser.username,

    hotDay,
    temperatureC,
    roundsPerDay: rounds.length === 2 ? 2 : 1,

    hoseFlowRateLpm: settings.hoseFlowRateLpm,
    hotDayThresholdC: settings.hotDayThresholdC,

    totalLitresPerRound: 0,
    totalDailyLitres: 0,
    totalHoseMinutesPerRound: 0,
    totalDailyHoseMinutes: 0,

    rounds,
    beds,

    instruction:
      "Use a hose and water slowly and evenly across each bed. Avoid spraying only one spot.",
    notes: existing?.notes ?? "",
    manuallyEdited: existing?.manuallyEdited ?? false,
    completed: false,
  };

  return recalculateWateringSchedule(
    baseSchedule,
    settings.hoseFlowRateLpm,
    rounds,
  );
}

export function subscribeWateringSettings(
  greenhouseId: string,
  onSettings: (settings: WateringSettings) => void,
  onError?: (error: Error) => void,
): () => void {
  const db = getDb();

  if (!db) {
    onSettings(defaultWateringSettings(greenhouseId));
    return noopUnsubscribe;
  }

  return onSnapshot(
    doc(db, "wateringSettings", greenhouseId),
    (snap) => {
      if (!snap.exists()) {
        onSettings(defaultWateringSettings(greenhouseId));
        return;
      }

      onSettings({
        ...defaultWateringSettings(greenhouseId),
        ...(snap.data() as Partial<WateringSettings>),
        greenhouseId,
      });
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function saveWateringSettings(
  settings: WateringSettings,
): Promise<void> {
  const db = getDb();

  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  await setDoc(
    doc(db, "wateringSettings", settings.greenhouseId),
    {
      ...settings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeAdminWateringSchedules(
  greenhouseId: string,
  days: number,
  onSchedules: (schedules: WateringSchedule[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const db = getDb();

  if (!db) {
    onSchedules([]);
    return noopUnsubscribe;
  }

  const dates = getUpcomingWateringDates(days);

  const schedulesQuery = query(
    collection(db, "wateringSchedules"),
    where("greenhouseId", "==", greenhouseId),
    where("date", "in", dates),
  );

  return onSnapshot(
    schedulesQuery,
    (snap) => {
      const schedules = snap.docs
        .map((docSnap) => docSnap.data() as WateringSchedule)
        .sort((a, b) => a.date.localeCompare(b.date));

      onSchedules(schedules);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function subscribeUserWateringSchedules(
  userId: string,
  greenhouseId: string,
  onSchedules: (schedules: WateringSchedule[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe | null {
  const db = getDb();

  if (!db) {
    onSchedules([]);
    return null;
  }

  const schedulesQuery = query(
    collection(db, "wateringSchedules"),
    where("greenhouseId", "==", greenhouseId),
    where("assignedUserId", "==", userId),
  );

  return onSnapshot(
    schedulesQuery,
    (snap) => {
      const today = getWateringDateKey();

      const schedules = snap.docs
        .map((docSnap) => docSnap.data() as WateringSchedule)
        .filter((schedule) => schedule.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));

      onSchedules(schedules);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function saveWateringSchedule(
  schedule: WateringSchedule,
): Promise<void> {
  const db = getDb();

  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  const data = removeUndefinedDeep({
    ...schedule,
    updatedAt: serverTimestamp(),
    createdAt:
      schedule.createdAt === undefined ? serverTimestamp() : schedule.createdAt,
  });

  await setDoc(doc(db, "wateringSchedules", schedule.id), data, {
    merge: true,
  });
}

export async function ensureUpcomingWateringSchedules(input: {
  greenhouseId: string;
  greenhouseName: string;
  users: WateringScheduleUser[];
  zones: VisualZone[];
  latestReading: LatestReading | null;
  settings: WateringSettings;
  days?: number;
}): Promise<void> {
  const db = getDb();

  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  const dates = getUpcomingWateringDates(input.days ?? 7);

  const existingQuery = query(
    collection(db, "wateringSchedules"),
    where("greenhouseId", "==", input.greenhouseId),
    where("date", "in", dates),
  );

  const existingSnap = await getDocs(existingQuery);
  const existingDates = new Set(
    existingSnap.docs.map((docSnap) => {
      const data = docSnap.data() as WateringSchedule;
      return data.date;
    }),
  );

  for (const date of dates) {
    if (existingDates.has(date)) continue;

    const schedule = buildWateringSchedule({
      greenhouseId: input.greenhouseId,
      greenhouseName: input.greenhouseName,
      date,
      users: input.users,
      zones: input.zones,
      latestReading: input.latestReading,
      settings: input.settings,
    });

    await saveWateringSchedule(schedule);
  }
}

export async function regenerateWateringSchedule(input: {
  greenhouseId: string;
  greenhouseName: string;
  date: string;
  users: WateringScheduleUser[];
  zones: VisualZone[];
  latestReading: LatestReading | null;
  settings: WateringSettings;
}): Promise<WateringSchedule> {
  const schedule = buildWateringSchedule({
    greenhouseId: input.greenhouseId,
    greenhouseName: input.greenhouseName,
    date: input.date,
    users: input.users,
    zones: input.zones,
    latestReading: input.latestReading,
    settings: input.settings,
  });

  await saveWateringSchedule({
    ...schedule,
    manuallyEdited: false,
  });

  return schedule;
}

export async function markWateringRoundComplete(
  schedule: WateringSchedule,
  roundId: WateringRound["id"],
  user: { uid: string; displayName: string },
): Promise<void> {
  const db = getDb();

  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  const now = new Date().toISOString();

  const rounds = schedule.rounds.map((round) =>
    round.id === roundId
      ? {
          ...round,
          completed: true,
          completedAt: now,
          completedBy: user.uid,
          completedByName: user.displayName,
        }
      : round,
  );

  await updateDoc(doc(db, "wateringSchedules", schedule.id), {
    rounds,
    completed: rounds.every((round) => round.completed),
    updatedAt: serverTimestamp(),
  });
}
