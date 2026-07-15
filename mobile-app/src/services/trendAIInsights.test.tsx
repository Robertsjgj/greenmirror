/**
 * Contextual AI in Trends & Analysis.
 *
 * The design rule under test: the real Trends content (charts, zone cards,
 * plant groups, watering records) comes FIRST, and AI is reachable only from a
 * small chip that opens one explainable sheet. There is no AI card stack at the
 * top of any tab, and no standalone AI page.
 */

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AIHomeCard } from '../components/AIHomeCard';
import { ContextualAIInsightSheet } from '../components/trends/ContextualAIInsightSheet';
import { PlantsView, WateringView, ZonesView, type AIContext } from '../components/trends/TrendsViews';
import { buildGreenhouseModel } from '../components/trends/trendsModel';
import type { PlantProfile } from '../plantProfiles';
import type { LatestReading, VisualZone } from '../zoneLayout';
import type { ActivityEntry } from '../activityLog';
import type { ZoneAIInsight } from './aiInsights';
import {
  buildPlantContextualInsight, buildWateringContextualInsight, buildZoneContextualInsight,
} from './trendAIInsights';

// ── Fixtures ────────────────────────────────────────────────────────────────

const TOMATO: PlantProfile = {
  id: 'tomato', name: 'Tomato', icon: '🍅',
  moistureMin: 55, moistureMax: 75, soilTempMin: 18, soilTempMax: 29,
  notes: 'Keep soil consistently moist and warm.',
};

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function zone(overrides: Partial<VisualZone> = {}): VisualZone {
  return {
    id: 'SYD-INSIDE-LEFT-01', visualLabel: 'SYD-INSIDE-LEFT-01', displayLabel: 'Greenhouse Bed 1',
    rowLabel: 'A', rowIndex: 0, section: 1,
    backendZoneId: 'SYD-INSIDE-LEFT-01', greenhouseId: 'gh-1',
    soilMoistureRaw: 500, soilMoisturePct: 27, soilMoistureStatus: 'ok',
    soilTempC: 22, soilTempStatus: 'ok', alerts: [], hasReading: true,
    timestamp: iso(60_000),
    assignedPlant: 'tomato', assignedPlantProfile: TOMATO,
    ...overrides,
  };
}

function insight(overrides: Partial<ZoneAIInsight> = {}): ZoneAIInsight {
  return {
    greenhouseId: 'gh-1', zoneId: 'SYD-INSIDE-LEFT-01', visualZoneId: 'SYD-INSIDE-LEFT-01',
    zoneLabel: 'Greenhouse Bed 1', plantName: 'Tomato',
    severity: 'attention', action: 'water_soon', title: 'Water soon',
    summary: 'Greenhouse Bed 1 is below the preferred range and still drying.',
    explanation: 'Greenhouse Bed 1 is below the saved preferred moisture range and has continued to dry.',
    reasons: ['Below preferred moisture'],
    evidence: [
      { label: 'Current moisture', value: '27%' },
      { label: 'Latest sensor reading', value: 'fresh' },
      { label: 'Preferred range', value: '55–75%' },
      { label: '6-hour trend', value: 'decreasing (-8 pts / 6h)' },
      { label: 'Last watering record', value: '2 days ago' },
    ],
    confidence: 'high',
    limitations: ['Water delivered by the hose is not measured.'],
    generatedAt: iso(0), insightVersion: 'greenmirror-ai-v1',
    ...overrides,
  };
}

function readings(): LatestReading[] {
  return [0, 1, 2].map((i) => ({
    greenhouse_id: 'gh-1',
    timestamp: iso((3 - i) * 3_600_000),
    zones: [{ zone_id: 'SYD-INSIDE-LEFT-01', soil_moisture_pct: 35 - i * 4, soil_temp_c: 22 }],
  })) as LatestReading[];
}

function watering(): ActivityEntry[] {
  return [{
    id: 'w1', type: 'watering', greenhouseId: 'gh-1',
    visualZoneId: 'SYD-INSIDE-LEFT-01', backendZoneId: 'SYD-INSIDE-LEFT-01',
    plantName: 'Tomato', amountMl: 200,
    message: 'Watered Greenhouse Bed 1', timestamp: iso(2 * 86_400_000),
  }];
}

function model(zones = [zone()]) {
  return buildGreenhouseModel({
    zones,
    profilesById: new Map([['tomato', TOMATO]]),
    plantProfiles: [TOMATO],
    readings: readings(),
    wateringEvents: watering(),
  });
}

function aiContext(overrides: Partial<AIContext> = {}): AIContext {
  return {
    insights: [insight()],
    zones: [zone()],
    profilesById: new Map([['tomato', TOMATO]]),
    verification: new Map(),
    ...overrides,
  };
}

const tabProps = { range: '24h' as const, setRange: vi.fn(), onSelect: vi.fn(), onBack: vi.fn() };

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ── The Trends content comes first ──────────────────────────────────────────

describe('Trends content is not buried under AI', () => {
  it('shows the zone list before any AI explanation content', () => {
    const html = renderToStaticMarkup(
      <ZonesView gm={model()} {...tabProps} selected={null} ai={aiContext()} />,
    );
    expect(html.indexOf('All Zones')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('All Zones')).toBeLessThan(html.indexOf('Why?'));
    expect(html).toContain('Greenhouse Bed 1');
  });

  it('has no AI recommendation-card stack at the top of Zones', () => {
    const html = renderToStaticMarkup(
      <ZonesView gm={model()} {...tabProps} selected={null} ai={aiContext()} />,
    );
    expect(html).not.toContain('GreenMirror AI Insights');
    expect(html).not.toContain('Recommended action');
  });

  it('shows Plant Groups immediately, with no AI card stack above them', () => {
    const html = renderToStaticMarkup(
      <PlantsView gm={model()} {...tabProps} selected={null} ai={aiContext()} />,
    );
    expect(html).not.toContain('GreenMirror AI Insights');
    expect(html.indexOf('Plant Groups')).toBeLessThan(html.indexOf('Plant Insight'));
    expect(html.indexOf('Plant Groups')).toBeLessThan(html.indexOf('Tomato'));
  });

  it('shows the watering summary first, with no AI card stack above it', () => {
    const html = renderToStaticMarkup(<WateringView gm={model()} ai={aiContext()} />);
    expect(html).not.toContain('GreenMirror AI Insights');
    expect(html.indexOf('This Week')).toBeLessThan(html.indexOf('Did watering help?'));
  });

  it('keeps the original Watering layout untouched apart from the AI chip', () => {
    const html = renderToStaticMarkup(<WateringView gm={model()} ai={aiContext()} />);
    for (const label of ['This Week', 'Waterings', 'Total water', 'Zones watered',
      'Watering Activity', 'Water used per week', 'Did watering help?',
      'Consistent watering keeps your plants happy and healthy!']) {
      expect(html).toContain(label);
    }
  });

  it('renders the zone chart and metrics before the AI chip in zone detail', () => {
    const html = renderToStaticMarkup(
      <ZonesView gm={model()} {...tabProps} selected="SYD-INSIDE-LEFT-01" ai={aiContext()} />,
    );
    expect(html).toContain('Current moisture');
    expect(html).toContain('Moisture over time');
    expect(html.indexOf('Current moisture')).toBeLessThan(html.indexOf('Explain this'));
  });
});

// ── Contextual chips ────────────────────────────────────────────────────────

describe('contextual AI chips', () => {
  it('puts an AI chip on each zone card and in zone detail', () => {
    const list = renderToStaticMarkup(
      <ZonesView gm={model()} {...tabProps} selected={null} ai={aiContext()} />,
    );
    expect(list).toContain('Explain Greenhouse Bed 1');

    const detail = renderToStaticMarkup(
      <ZonesView gm={model()} {...tabProps} selected="SYD-INSIDE-LEFT-01" ai={aiContext()} />,
    );
    expect(detail).toContain('AI Insight');
    expect(detail).toContain('Explain the trend for Greenhouse Bed 1');
  });

  it('puts a plant insight chip on each plant group', () => {
    const html = renderToStaticMarkup(
      <PlantsView gm={model()} {...tabProps} selected={null} ai={aiContext()} />,
    );
    expect(html).toContain('Plant Insight');
    expect(html).toContain('Explain Tomato');
  });

  it('puts a watering chip on the before/after row, without adding new sections', () => {
    const html = renderToStaticMarkup(<WateringView gm={model()} ai={aiContext()} />);
    expect(html).toContain('Explain watering status for');
    expect(html).not.toContain('Watering status by zone');
  });

  it('omits the chip when no insight exists for the zone', () => {
    const html = renderToStaticMarkup(
      <ZonesView gm={model()} {...tabProps} selected={null} ai={aiContext({ insights: [] })} />,
    );
    expect(html).toContain('Greenhouse Bed 1');
    expect(html).not.toContain('Why?');
  });
});

// ── The sheet ───────────────────────────────────────────────────────────────

describe('field-capacity explanations', () => {
  it('distinguishes the preferred range from wet-side tolerance', () => {
    const wet = insight({
      action: 'monitor', summary: 'Greenhouse Bed 1 is wetter than the preferred range — monitor.',
      evidence: [
        { label: 'Current moisture', value: '106%' },
        { label: 'Preferred range', value: '66–100%' },
        { label: 'Above field capacity', value: '6 percentage points' },
      ],
    });
    const contextual = buildZoneContextualInsight(wet, { profile: { ...TOMATO, moistureMin: 66, moistureMax: 100 } });
    expect(contextual.learn).toMatch(/Field capacity describes/i);
    expect(contextual.why).toContain('Preferred range: 66–100%');
    expect(contextual.why).toContain('Above field capacity: 6 percentage points');
  });
});

describe('ContextualAIInsightSheet', () => {
  const render = (i: Parameters<typeof ContextualAIInsightSheet>[0]['insight']) =>
    renderToStaticMarkup(<ContextualAIInsightSheet insight={i} onClose={vi.fn()} />);

  it('shows the reason, evidence, confidence, limitations, and one Learn section', () => {
    const html = render(buildZoneContextualInsight(insight(), { readingCount: 127, profile: TOMATO }));
    expect(html).toContain('What is happening?');
    expect(html).toContain('Why?');
    expect(html).toContain('Based on');
    expect(html).toContain('What this means');
    expect(html).toContain('Learn');
    expect(html).toContain('Suggested action');
    expect(html).toContain('Confidence');
    expect(html).toContain('Limitations');
    // Evidence is the real zone data, not a summary of it.
    expect(html).toContain('Current moisture: 27%');
    expect(html).toContain('Preferred range: 55–75%');
    // Confidence is evidence quality, expressed as High / Moderate / Low.
    expect(html).toContain('High');
    expect(html).toContain('127 recent readings');
    expect(html).toContain('Water delivered by the hose is not measured.');
    // Educational content is short and general, not a plant fact we invented.
    expect(html).toContain('Roots take up water from the spaces between soil particles');
    expect(html).toContain('Saved note for Tomato: Keep soil consistently moist and warm.');
  });

  it('does not expose internal thresholds or classifier language', () => {
    // Assert on the insight text, not the markup — inline styles legitimately
    // contain words like "font-weight".
    const text = JSON.stringify(buildZoneContextualInsight(insight(), { readingCount: 127 }));
    expect(text).not.toMatch(/threshold|scoring|weighting|classifier|probability|severity|epsilon/i);
  });

  it('renders nothing while closed', () => {
    const html = render(null);
    expect(html).not.toContain('What is happening?');
  });
});

// ── Explainability + honesty guarantees ─────────────────────────────────────

describe('missing data never becomes invented text', () => {
  it('says the reading is unavailable rather than guessing a value', () => {
    const stale = buildZoneContextualInsight(insight({
      action: 'check_sensor', severity: 'unknown', confidence: 'low',
      summary: 'GreenMirror cannot give reliable guidance for Greenhouse Bed 1 — the latest reading is stale.',
      evidence: [
        { label: 'Current moisture', value: 'unavailable' },
        { label: 'Sensor', value: 'stale reading' },
      ],
      limitations: ['Guidance is paused until a valid, fresh sensor reading is available.'],
    }));
    expect(stale.why).toContain('Current moisture: unavailable');
    expect(stale.confidence?.level).toBe('low');
    expect(JSON.stringify(stale)).not.toMatch(/\d+%/);
  });

  it('omits plant comparison when no moisture reading exists', () => {
    const result = buildPlantContextualInsight({
      profile: TOMATO,
      zones: [zone({ soilMoisturePct: null, hasReading: false })],
      insightByZone: new Map(),
      zoneKey: (z) => z.backendZoneId ?? z.visualLabel,
    });
    expect(result.why).toEqual(['Current soil moisture: not available']);
    expect(result.meaning).toBeUndefined();
    expect(result.confidence?.level).toBe('low');
    expect(JSON.stringify(result)).not.toMatch(/\d+%/);
  });
});

describe('watering claims stay honest', () => {
  const key = (z: VisualZone) => z.backendZoneId ?? z.visualLabel;

  it('describes a pending watering as pending, never verified', () => {
    const result = buildWateringContextualInsight({
      zone: zone(), zoneId: key(zone()), insight: insight(),
      verification: { status: 'pending_verification' },
    });
    expect(result.happening).toContain('waiting for sensor evidence');
    expect(result.limitations).toContain('This watering record is not verified.');
    expect(result.why).toContain('Verification status: pending — not yet confirmed by the sensor');
    expect(JSON.stringify(result)).not.toMatch(/was verified|is verified|has been verified/i);
  });

  it('never claims delivered litres or a delivered volume', () => {
    const pending = buildWateringContextualInsight({
      zone: zone(), zoneId: key(zone()), insight: insight(),
      verification: { status: 'pending_verification' },
    });
    const normal = buildWateringContextualInsight({
      zone: zone(), zoneId: key(zone()), insight: insight(), readingCount: 127,
    });
    for (const result of [pending, normal]) {
      expect(JSON.stringify(result)).not.toMatch(/litre|liter|\bml\b|delivered/i);
      expect(result.limitations).toContain('GreenMirror cannot measure how much water was applied using the hose.');
    }
    expect(normal.happening).toContain('drier than preferred');
  });
});

// ── Wiring ──────────────────────────────────────────────────────────────────

describe('AI wiring', () => {
  it('keeps the compact Home card, whose button opens Trends & Analysis', () => {
    const onOpenTrends = vi.fn();
    const html = renderToStaticMarkup(
      <AIHomeCard
        summary={{ headline: 'One zone needs attention.', counts: { urgent: 1, attention: 0, monitor: 1, good: 2, sensor: 0 }, top: [] }}
        onOpenTrends={onOpenTrends}
      />,
    );
    expect(html).toContain('GreenMirror AI');
    expect(html).toContain('View in Trends &amp; Analysis');

    const app = read('../App.tsx');
    expect(app).toContain('onOpenTrends');
    expect(app).toContain("setTrendsInitialSection('zones')");
  });

  it('has no standalone AI page, route, or AI card component left', () => {
    const app = read('../App.tsx');
    expect(app).not.toMatch(/AIInsightsView|PlantAssistant|aiInsightsOpen|plantAssistantOpen/);
    const views = read('../components/trends/TrendsViews.tsx');
    expect(views).not.toMatch(/AIInsightsSection|ExplainableAIInsightCard/);
  });

  it('threads AI context into Zones, Plants, and Watering without an AI section', () => {
    const dashboard = read('../components/TrendsDashboard.tsx');
    expect(dashboard).toMatch(/<ZonesView[\s\S]*?ai=\{ai\}/);
    expect(dashboard).toMatch(/<PlantsView[\s\S]*?ai=\{ai\}/);
    expect(dashboard).toMatch(/<WateringView[\s\S]*?ai=\{ai\}/);
  });

  it('keeps authentication and greenhouse scoping intact', () => {
    const app = read('../App.tsx');
    // Trends and its AI data stay behind the signed-in greenhouse.
    expect(app).toMatch(/useAuth|AuthContext/);
    expect(app).toMatch(/greenhouseId=\{ghId/);
    const dashboard = read('../components/TrendsDashboard.tsx');
    // Verification reads are scoped to the open greenhouse, and skipped when closed.
    expect(dashboard).toContain('if (!open || !greenhouseId)');
    expect(dashboard).toContain('fetchZoneVerificationStates(greenhouseId)');
  });
});

// ── Existing Trends views still work ────────────────────────────────────────

describe('existing Trends views still work', () => {
  it('keeps the zone detail chart, stats, and plant target range', () => {
    const html = renderToStaticMarkup(
      <ZonesView gm={model()} {...tabProps} selected="SYD-INSIDE-LEFT-01" ai={aiContext()} />,
    );
    expect(html).toContain('Target range');
    expect(html).toContain('55–75%');
    expect(html).toContain('Readings');
  });

  it('keeps plant cards and the plant detail chart', () => {
    const list = renderToStaticMarkup(
      <PlantsView gm={model()} {...tabProps} selected={null} ai={aiContext()} />,
    );
    expect(list).toContain('Tomato');
    expect(list).toContain('Tap for more information');

    const detail = renderToStaticMarkup(
      <PlantsView gm={model()} {...tabProps} selected="tomato" ai={aiContext()} />,
    );
    expect(detail).toContain('Average moisture over time');
  });

  it('keeps the watering records view', () => {
    const html = renderToStaticMarkup(<WateringView gm={model()} ai={aiContext()} />);
    expect(html).toContain('Did watering help?');
    expect(html).toContain('Water used per week');
  });

  it('renders each tab without a horizontally overflowing fixed width', () => {
    const views = read('../components/trends/TrendsViews.tsx');
    const sheet = read('../components/trends/ContextualAIInsightSheet.tsx');
    // No fixed pixel widths that could exceed a narrow phone viewport.
    expect(views).not.toMatch(/width:\s*[4-9]\d\d(?!%)/);
    expect(sheet).not.toMatch(/width:\s*[4-9]\d\d(?!%)/);
    // The sheet uses the app's existing bottom-sheet shell, which scrolls its
    // body internally and sits above the fixed bottom nav.
    expect(sheet).toContain('gm-sheet');
    expect(sheet).toContain('gm-sheet-body');
  });
});
