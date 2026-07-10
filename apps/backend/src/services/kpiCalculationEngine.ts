export interface ScoreInput {
  value?: number;
  previousValue?: number;
  growthPercent?: number;
  sourceMetric?: string;
  isAvailable?: boolean;
  referenceValue?: number;
}

export interface EmailPerformanceInputs {
  openRate?: ScoreInput;
  clickRate?: ScoreInput;
  subscriberGrowth?: ScoreInput;
  unsubscribeRate?: ScoreInput;
}

export interface SocialMediaPerformanceInputs {
  postsPublished?: ScoreInput;
  likes?: ScoreInput;
  comments?: ScoreInput;
  shares?: ScoreInput;
}

export interface PodcastPerformanceInputs {
  streams?: ScoreInput;
  podcastsPublished?: ScoreInput;
  listenerGrowth?: ScoreInput;
}

export interface WebsitePerformanceInputs {
  visitors?: ScoreInput;
  clicks?: ScoreInput;
  engagement?: ScoreInput;
}

export interface CommunicationsPerformanceInputs {
  email?: EmailPerformanceInputs;
  socialMedia?: SocialMediaPerformanceInputs;
  podcast?: PodcastPerformanceInputs;
  website?: WebsitePerformanceInputs;
}

export interface GrowthIndicatorInput {
  current?: number;
  previous?: number;
  unit?: string;
  sourceMetric?: string;
}

export interface GrowthIndicator {
  label: string;
  value: number;
  previousValue?: number;
  growthPercent?: number;
  unit?: string;
  sourceMetric?: string;
  definition: string;
}

export interface GrowthIndicatorInputs {
  newFollowers?: GrowthIndicatorInput;
  newSubscribers?: GrowthIndicatorInput;
  newPodcastListeners?: GrowthIndicatorInput;
  websiteVisitors?: GrowthIndicatorInput;
  contentPublished?: GrowthIndicatorInput;
}

export interface KpiScoreComponent {
  key: string;
  label: string;
  weight: number;
  value?: number;
  isAvailable?: boolean;
  growthPercent?: number;
  relativeScore?: number;
  score: number;
  sourceMetric?: string;
  formula?: string;
  lowerIsBetter?: boolean;
}

export interface KpiScoreDefinition {
  key: string;
  label: string;
  definition: string;
  formula: string;
  example: string;
  components: Array<{
    label: string;
    weight: number;
    formula?: string;
    lowerIsBetter?: boolean;
  }>;
}

export interface KpiScore {
  key: string;
  label: string;
  score: number;
  definition: string;
  formula: string;
  example: string;
  components: KpiScoreComponent[];
}

export interface CommunicationsPerformanceScore extends KpiScore {
  key: "communicationsPerformanceScore";
  channelScores: KpiScore[];
}

export const KPI_SCORE_DEFINITIONS: Record<string, KpiScoreDefinition> = {
  communicationsPerformanceScore: {
    key: "communicationsPerformanceScore",
    label: "Communications Performance Score",
    definition: "Overall communications performance across all major channels.",
    formula:
      "(Email Performance Score + Social Media Performance Score + Podcast Performance Score + Website Performance Score) / 4",
    example: "(82 + 75 + 84 + 68) / 4 = 77.3",
    components: [
      { label: "Email Performance Score", weight: 0.25 },
      { label: "Social Media Performance Score", weight: 0.25 },
      { label: "Podcast Performance Score", weight: 0.25 },
      { label: "Website Performance Score", weight: 0.25 }
    ]
  },
  emailPerformanceScore: {
    key: "emailPerformanceScore",
    label: "Email Performance Score",
    definition: "Measures effectiveness of email communications.",
    formula:
      "(Click Rate score * 40%) + (Open Rate score * 30%) + (Subscriber Growth score * 20%) + (Unsubscribe Rate Health score * 10%)",
    example:
      "(18 click rate * 40%) + (42 open rate * 30%) + (56 subscriber growth score * 20%) + (99 unsubscribe health * 10%) = 40.9",
    components: [
      { label: "Click Rate", weight: 0.4 },
      { label: "Open Rate", weight: 0.3 },
      { label: "Subscriber Growth", weight: 0.2, formula: "50 + Subscriber Growth %" },
      {
        label: "Unsubscribe Rate",
        weight: 0.1,
        formula: "100 - Unsubscribe Rate %",
        lowerIsBetter: true
      }
    ]
  },
  socialMediaPerformanceScore: {
    key: "socialMediaPerformanceScore",
    label: "Social Media Performance Score",
    definition: "Measures social media effectiveness across publishing and engagement activity.",
    formula:
      "(Posts Published score * 20%) + (Likes score * 30%) + (Comments score * 25%) + (Shares score * 25%)",
    example:
      "With relative volume scores of 20 posts, 100 likes, 24 comments, and 12 shares: (20 * 20%) + (100 * 30%) + (24 * 25%) + (12 * 25%) = 43",
    components: [
      { label: "Posts Published", weight: 0.2, formula: "Relative volume score" },
      { label: "Likes", weight: 0.3, formula: "Relative volume score" },
      { label: "Comments", weight: 0.25, formula: "Relative volume score" },
      { label: "Shares", weight: 0.25, formula: "Relative volume score" }
    ]
  },
  podcastPerformanceScore: {
    key: "podcastPerformanceScore",
    label: "Podcast Performance Score",
    definition: "Measures podcast performance and audience growth.",
    formula:
      "(Listener Growth score * 40%) + (Streams Per Episode score * 40%) + (Streams score * 20%)",
    example:
      "(58 listener growth score * 40%) + (100 streams per episode score * 40%) + (100 streams score * 20%) = 83.2",
    components: [
      { label: "Listener Growth", weight: 0.4, formula: "50 + Listener Growth %" },
      { label: "Streams Per Episode", weight: 0.4, formula: "Streams / Podcasts Published" },
      { label: "Streams", weight: 0.2, formula: "Relative volume score" }
    ]
  },
  websitePerformanceScore: {
    key: "websitePerformanceScore",
    label: "Website Performance Score",
    definition: "Measures owned website performance and audience engagement.",
    formula:
      "(Visitors score * 40%) + (Clicks score * 35%) + (Engagement score * 25%)",
    example:
      "(100 visitor score * 40%) + (18 click score * 35%) + (64 engagement score * 25%) = 62.3",
    components: [
      { label: "Visitors", weight: 0.4, formula: "Relative volume score" },
      { label: "Clicks", weight: 0.35, formula: "Relative volume score" },
      { label: "Engagement", weight: 0.25 }
    ]
  }
};

export function calculatePerformanceScores(
  inputs: CommunicationsPerformanceInputs
): CommunicationsPerformanceScore {
  return combineCommunicationsPerformanceScore([
    calculateEmailPerformanceScore(inputs.email ?? {}),
    calculateSocialMediaPerformanceScore(inputs.socialMedia ?? {}),
    calculatePodcastPerformanceScore(inputs.podcast ?? {}),
    calculateWebsitePerformanceScore(inputs.website ?? {})
  ]);
}

export function calculateEmailPerformanceScore(inputs: EmailPerformanceInputs): KpiScore {
  const definition = KPI_SCORE_DEFINITIONS.emailPerformanceScore;
  const components = [
    scoreComponent(definition.components[0], inputs.clickRate, "percent"),
    scoreComponent(definition.components[1], inputs.openRate, "percent"),
    scoreComponent(definition.components[2], inputs.subscriberGrowth, "growth"),
    scoreComponent(definition.components[3], inputs.unsubscribeRate, "inversePercent")
  ];

  return scoreFromDefinition(definition, components);
}

export function calculateSocialMediaPerformanceScore(inputs: SocialMediaPerformanceInputs): KpiScore {
  const definition = KPI_SCORE_DEFINITIONS.socialMediaPerformanceScore;
  const referenceValue = largestValue([
    inputs.postsPublished,
    inputs.likes,
    inputs.comments,
    inputs.shares
  ]);
  const components = [
    scoreComponent(definition.components[0], inputs.postsPublished, "volume", referenceValue),
    scoreComponent(definition.components[1], inputs.likes, "volume", referenceValue),
    scoreComponent(definition.components[2], inputs.comments, "volume", referenceValue),
    scoreComponent(definition.components[3], inputs.shares, "volume", referenceValue)
  ];

  return scoreFromDefinition(definition, components);
}

export function calculatePodcastPerformanceScore(inputs: PodcastPerformanceInputs): KpiScore {
  const definition = KPI_SCORE_DEFINITIONS.podcastPerformanceScore;
  const streams = inputValue(inputs.streams);
  const podcastsPublished = inputValue(inputs.podcastsPublished);
  const streamsPerEpisode =
    streams !== undefined && podcastsPublished !== undefined && podcastsPublished > 0
      ? streams / podcastsPublished
      : undefined;
  const referenceValue = largestNumber([
    streams,
    streamsPerEpisode,
    inputs.streams?.referenceValue,
    inputs.podcastsPublished?.referenceValue
  ]);
  const components = [
    scoreComponent(definition.components[0], inputs.listenerGrowth, "growth"),
    scoreComponent(
      definition.components[1],
      {
        value: streamsPerEpisode,
        isAvailable: streamsPerEpisode !== undefined,
        sourceMetric: "Streams / Podcasts Published"
      },
      "volume",
      referenceValue
    ),
    scoreComponent(definition.components[2], inputs.streams, "volume", referenceValue)
  ];

  return scoreFromDefinition(definition, components);
}

export function calculateWebsitePerformanceScore(inputs: WebsitePerformanceInputs): KpiScore {
  const definition = KPI_SCORE_DEFINITIONS.websitePerformanceScore;
  const referenceValue = largestValue([inputs.visitors, inputs.clicks]);
  const components = [
    scoreComponent(definition.components[0], inputs.visitors, "volume", referenceValue),
    scoreComponent(definition.components[1], inputs.clicks, "volume", referenceValue),
    scoreComponent(definition.components[2], inputs.engagement, "percent")
  ];

  return scoreFromDefinition(definition, components);
}

export function combineCommunicationsPerformanceScore(channelScores: KpiScore[]): CommunicationsPerformanceScore {
  const definition = KPI_SCORE_DEFINITIONS.communicationsPerformanceScore;
  const scoreByKey = new Map(channelScores.map((score) => [score.key, score]));
  const orderedScores = [
    scoreByKey.get("emailPerformanceScore") ?? channelScores[0],
    scoreByKey.get("socialMediaPerformanceScore") ?? channelScores[1],
    scoreByKey.get("podcastPerformanceScore") ?? channelScores[2],
    scoreByKey.get("websitePerformanceScore") ?? channelScores[3]
  ].filter(Boolean) as KpiScore[];
  const components = orderedScores.map((score, index) => ({
    key: score.key,
    label: definition.components[index]?.label ?? score.label,
    weight: definition.components[index]?.weight ?? 0,
    value: score.score,
    isAvailable: true,
    score: score.score,
    relativeScore: score.score,
    sourceMetric: score.label
  }));

  return {
    key: "communicationsPerformanceScore",
    label: definition.label,
    definition: definition.definition,
    formula: definition.formula,
    example: definition.example,
    score: roundScore(components.reduce((sum, component) => sum + component.score * component.weight, 0)),
    components,
    channelScores: orderedScores
  };
}

export function calculateGrowthIndicators(inputs: GrowthIndicatorInputs): GrowthIndicator[] {
  return [
    growthIndicator("New Followers", inputs.newFollowers),
    growthIndicator("New Subscribers", inputs.newSubscribers),
    growthIndicator("New Podcast Listeners", inputs.newPodcastListeners),
    growthIndicator("Website Visitors", inputs.websiteVisitors),
    growthIndicator("Content Published", inputs.contentPublished)
  ];
}

export function calculatePercentChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return 0;
  }

  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return roundScore(((current - previous) / Math.abs(previous)) * 100);
}

export function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreFromDefinition(definition: KpiScoreDefinition, components: KpiScoreComponent[]): KpiScore {
  return {
    key: definition.key,
    label: definition.label,
    definition: definition.definition,
    formula: definition.formula,
    example: definition.example,
    score: roundScore(
      components.reduce((sum, component) => sum + clampScore(component.score) * component.weight, 0)
    ),
    components
  };
}

function scoreComponent(
  definitionComponent: KpiScoreDefinition["components"][number],
  input: ScoreInput | undefined,
  mode: "percent" | "inversePercent" | "growth" | "volume",
  referenceValue?: number
): KpiScoreComponent {
  const value = inputValue(input);
  const isAvailable = input?.isAvailable ?? value !== undefined;
  const score = isAvailable ? scoreValue(value ?? 0, mode, referenceValue ?? input?.referenceValue) : 0;

  return {
    key: componentKey(definitionComponent.label),
    label: definitionComponent.label,
    weight: definitionComponent.weight,
    value,
    isAvailable,
    growthPercent: input?.growthPercent,
    score,
    relativeScore: score,
    sourceMetric: input?.sourceMetric,
    formula: definitionComponent.formula,
    lowerIsBetter: definitionComponent.lowerIsBetter
  };
}

function scoreValue(value: number, mode: "percent" | "inversePercent" | "growth" | "volume", referenceValue?: number): number {
  if (mode === "inversePercent") {
    return clampScore(100 - value);
  }

  if (mode === "growth") {
    return clampScore(50 + value);
  }

  if (mode === "volume") {
    return volumeScore(value, referenceValue);
  }

  return clampScore(value);
}

function volumeScore(value: number, referenceValue?: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (!referenceValue || referenceValue <= 0) {
    return clampScore(value);
  }

  return clampScore((value / referenceValue) * 100);
}

function inputValue(input: ScoreInput | undefined): number | undefined {
  if (!input || input.value === undefined || input.value === null) {
    return undefined;
  }

  const value = Number(input.value);
  return Number.isFinite(value) ? roundScore(value) : undefined;
}

function largestValue(inputs: Array<ScoreInput | undefined>): number | undefined {
  return largestNumber(inputs.map((input) => inputValue(input) ?? input?.referenceValue));
}

function largestNumber(values: Array<number | undefined>): number | undefined {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value));
  return finiteValues.length ? Math.max(...finiteValues) : undefined;
}

function growthIndicator(label: string, input: GrowthIndicatorInput | undefined): GrowthIndicator {
  const current = Number(input?.current ?? 0);
  const previous =
    input?.previous === undefined || input?.previous === null ? undefined : Number(input.previous);

  return {
    label,
    value: Number.isFinite(current) ? roundScore(current) : 0,
    previousValue: previous !== undefined && Number.isFinite(previous) ? roundScore(previous) : undefined,
    growthPercent:
      previous !== undefined && Number.isFinite(previous)
        ? calculatePercentChange(current, previous)
        : undefined,
    unit: input?.unit,
    sourceMetric: input?.sourceMetric,
    definition: "Priority growth indicator calculated for the selected reporting period."
  };
}

function clampScore(value: number): number {
  return Math.min(Math.max(roundScore(value), 0), 100);
}

function componentKey(label: string): string {
  return label
    .replace(/\W+/g, " ")
    .trim()
    .replace(/\s+(\w)/g, (_match, letter: string) => letter.toUpperCase())
    .replace(/^\w/, (letter) => letter.toLowerCase());
}
