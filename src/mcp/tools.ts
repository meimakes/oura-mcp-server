import {
  getPersonalInfo,
  getDailySleep,
  getDailyActivity,
  getDailyReadiness,
  getHeartRate,
  getWorkouts,
  getSleepPeriods,
  getTags,
} from '../oura/client.js';
import {
  validateParams,
  dateRangeSchema,
  sleepSummarySchema,
  datetimeRangeSchema,
  healthInsightsSchema,
  getTodayDate,
  getDaysAgo,
} from '../utils/validation.js';
import cache from '../utils/cache.js';
import { MCPTool, MCPToolCall, MCPResponse } from '../oura/types.js';
import { logger } from '../utils/logger.js';

/**
 * List of all available MCP tools
 */
export const tools: MCPTool[] = [
  {
    name: 'get_personal_info',
    description: "Get user's personal information and ring details",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_sleep_summary',
    description: 'Get sleep data for a date range',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional, defaults to today)',
        },
        include_hrv: {
          type: 'boolean',
          description: 'Include HRV data (default: false)',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_readiness_score',
    description: 'Get daily readiness scores',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional)',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_activity_summary',
    description: 'Get activity data for a date range',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional)',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_heart_rate',
    description: 'Get heart rate data (5-minute intervals)',
    inputSchema: {
      type: 'object',
      properties: {
        start_datetime: {
          type: 'string',
          description: 'Start datetime in ISO 8601 format',
        },
        end_datetime: {
          type: 'string',
          description: 'End datetime in ISO 8601 format (optional, defaults to now)',
        },
      },
      required: ['start_datetime'],
    },
  },
  {
    name: 'get_workouts',
    description: 'Get workout sessions',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional)',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_sleep_detailed',
    description: 'Get detailed sleep period data (multiple sleep sessions per day)',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional)',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_tags',
    description: 'Get user-created tags (notes/comments on specific days)',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional)',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_health_insights',
    description: 'Get AI-powered insights based on recent data',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to analyze (default: 7)',
        },
      },
    },
  },
];

/**
 * Executes a tool call and returns the result
 */
export async function executeToolCall(toolCall: MCPToolCall): Promise<MCPResponse> {
  const { name, arguments: args } = toolCall;

  logger.info(`Tool: ${name}`);
  logger.debug(`Tool args:`, args);

  try {
    let result: string;

    switch (name) {
      case 'get_personal_info':
        result = await handleGetPersonalInfo();
        break;
      case 'get_sleep_summary':
        result = await handleGetSleepSummary(args);
        break;
      case 'get_readiness_score':
        result = await handleGetReadinessScore(args);
        break;
      case 'get_activity_summary':
        result = await handleGetActivitySummary(args);
        break;
      case 'get_heart_rate':
        result = await handleGetHeartRate(args);
        break;
      case 'get_workouts':
        result = await handleGetWorkouts(args);
        break;
      case 'get_sleep_detailed':
        result = await handleGetSleepDetailed(args);
        break;
      case 'get_tags':
        result = await handleGetTags(args);
        break;
      case 'get_health_insights':
        result = await handleGetHealthInsights(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    logger.error(`Error executing tool ${name}:`, error);
    throw error;
  }
}

/**
 * Handler for get_personal_info tool
 */
async function handleGetPersonalInfo(): Promise<string> {
  const cacheKey = 'personal_info';
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getPersonalInfo();

  const result = JSON.stringify(
    {
      age: data.age,
      weight: data.weight,
      height: data.height,
      biological_sex: data.biological_sex,
      email: data.email,
    },
    null,
    2
  );

  cache.set(cacheKey, result, 3600000); // Cache for 1 hour
  return result;
}

/**
 * Handler for get_sleep_summary tool
 */
async function handleGetSleepSummary(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string; include_hrv?: boolean }>(sleepSummarySchema, args);
  const { start_date, end_date, include_hrv } = params;

  const cacheKey = `sleep_summary:${start_date}:${end_date || 'today'}:${include_hrv || false}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailySleep(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    date: item.day,
    score: item.score,
    total_sleep_duration: item.contributors.total_sleep * 3600,
    efficiency: item.contributors.efficiency,
    latency: item.contributors.latency * 60,
    deep_sleep_duration: item.contributors.deep_sleep * 3600,
    light_sleep_duration: (item.contributors.total_sleep - item.contributors.deep_sleep - item.contributors.rem_sleep) * 3600,
    rem_sleep_duration: item.contributors.rem_sleep * 3600,
    awake_time: (item.contributors.total_sleep * (1 - item.contributors.efficiency / 100)) * 3600,
    restfulness: item.contributors.restfulness,
    timing: item.contributors.timing,
    ...(include_hrv && { hrv_balance: 0 }), // Note: HRV balance not directly available in daily sleep
  }));

  const summary = {
    average_score: mapped.reduce((acc, item) => acc + item.score, 0) / mapped.length,
    average_duration: mapped.reduce((acc, item) => acc + item.total_sleep_duration, 0) / mapped.length,
    average_efficiency: mapped.reduce((acc, item) => acc + item.efficiency, 0) / mapped.length,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_readiness_score tool
 */
async function handleGetReadinessScore(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  const cacheKey = `readiness:${start_date}:${end_date || 'today'}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailyReadiness(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    date: item.day,
    score: item.score,
    temperature_deviation: item.temperature_deviation,
    temperature_trend_deviation: item.temperature_trend_deviation,
    activity_balance: item.contributors.activity_balance,
    body_temperature: item.contributors.body_temperature,
    hrv_balance: item.contributors.hrv_balance,
    previous_day_activity: item.contributors.previous_day_activity,
    previous_night: item.contributors.previous_night,
    recovery_index: item.contributors.recovery_index,
    resting_heart_rate: item.contributors.resting_heart_rate,
    sleep_balance: item.contributors.sleep_balance,
  }));

  const avgScore = mapped.reduce((acc, item) => acc + item.score, 0) / mapped.length;
  const firstScore = mapped[0]?.score || 0;
  const lastScore = mapped[mapped.length - 1]?.score || 0;
  const trend = lastScore > firstScore + 5 ? 'improving' : lastScore < firstScore - 5 ? 'declining' : 'stable';

  const summary = {
    average_score: avgScore,
    trend,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_activity_summary tool
 */
async function handleGetActivitySummary(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  const cacheKey = `activity:${start_date}:${end_date || 'today'}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailyActivity(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    date: item.day,
    score: item.score,
    active_calories: item.active_calories,
    total_calories: item.total_calories,
    steps: item.steps,
    equivalent_walking_distance: item.equivalent_walking_distance,
    high_activity_time: item.high_activity_time,
    medium_activity_time: item.medium_activity_time,
    low_activity_time: item.low_activity_time,
    sedentary_time: item.sedentary_time,
    resting_time: item.resting_time,
    average_met: item.average_met_minutes,
    inactivity_alerts: item.inactivity_alerts,
    target_calories: item.target_calories,
    target_meters: item.target_meters,
    meet_daily_targets: item.contributors.meet_daily_targets,
  }));

  const summary = {
    average_score: mapped.reduce((acc, item) => acc + item.score, 0) / mapped.length,
    total_steps: mapped.reduce((acc, item) => acc + item.steps, 0),
    total_calories: mapped.reduce((acc, item) => acc + item.total_calories, 0),
    average_steps_per_day: mapped.reduce((acc, item) => acc + item.steps, 0) / mapped.length,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_heart_rate tool
 */
async function handleGetHeartRate(args: any): Promise<string> {
  const params = validateParams<{ start_datetime: string; end_datetime?: string }>(datetimeRangeSchema, args);
  const { start_datetime, end_datetime } = params;

  const cacheKey = `heart_rate:${start_datetime}:${end_datetime || 'now'}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getHeartRate(start_datetime, end_datetime);

  const mapped = data.map((item) => ({
    timestamp: item.timestamp,
    bpm: item.bpm,
    source: item.source,
  }));

  const bpms = mapped.map((item) => item.bpm);
  const summary = {
    average_bpm: bpms.reduce((acc, bpm) => acc + bpm, 0) / bpms.length,
    min_bpm: Math.min(...bpms),
    max_bpm: Math.max(...bpms),
    resting_hr: Math.min(...bpms.slice(0, 10)), // Approximate
    total_readings: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_workouts tool
 */
async function handleGetWorkouts(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  const cacheKey = `workouts:${start_date}:${end_date || 'today'}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getWorkouts(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    date: item.day,
    activity: item.activity,
    intensity: item.intensity,
    start_datetime: item.start_datetime,
    end_datetime: item.end_datetime,
    calories: item.calories,
    distance: item.distance,
    average_heart_rate: 0, // Not directly available
    max_heart_rate: 0, // Not directly available
  }));

  const activities = [...new Set(mapped.map((item) => item.activity))];
  const summary = {
    total_workouts: mapped.length,
    total_calories: mapped.reduce((acc, item) => acc + item.calories, 0),
    total_duration: mapped.reduce((acc, item) => {
      const start = new Date(item.start_datetime);
      const end = new Date(item.end_datetime);
      return acc + (end.getTime() - start.getTime()) / 1000;
    }, 0),
    activities,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_sleep_detailed tool
 */
async function handleGetSleepDetailed(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  const cacheKey = `sleep_detailed:${start_date}:${end_date || 'today'}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getSleepPeriods(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    date: item.day,
    type: item.type,
    bedtime_start: item.bedtime_start,
    bedtime_end: item.bedtime_end,
    breath_average: item.average_breath,
    heart_rate: {
      interval: item.heart_rate.interval,
      samples: item.heart_rate.items,
      average: item.average_heart_rate,
    },
    hrv: {
      samples: item.hrv.items,
      average: item.average_hrv,
    },
    movement_30_sec: item.movement_30_sec,
    sleep_phase_5_min: item.sleep_phase_5_min,
  }));

  const result = JSON.stringify({ data: mapped }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_tags tool
 */
async function handleGetTags(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  const cacheKey = `tags:${start_date}:${end_date || 'today'}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getTags(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    date: item.timestamp,
    day: item.day,
    text: item.text,
    timestamp: item.timestamp,
    tags: item.tags,
  }));

  const result = JSON.stringify({ data: mapped }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_health_insights tool
 */
async function handleGetHealthInsights(args: any): Promise<string> {
  const params = validateParams<{ days?: number }>(healthInsightsSchema, args);
  const days = params.days || 7;

  const endDate = getTodayDate();
  const startDate = getDaysAgo(days);

  // Fetch recent data
  const [sleepData, activityData, readinessData] = await Promise.all([
    getDailySleep(startDate, endDate),
    getDailyActivity(startDate, endDate),
    getDailyReadiness(startDate, endDate),
  ]);

  // Generate insights
  const insights = [];

  // Sleep insights
  const avgSleepScore = sleepData.reduce((acc, item) => acc + item.score, 0) / sleepData.length;
  if (avgSleepScore < 70) {
    insights.push({
      category: 'sleep',
      finding: `Your average sleep score is ${avgSleepScore.toFixed(0)}, which is below optimal levels.`,
      recommendation: 'Try to maintain a consistent sleep schedule and aim for 7-9 hours of sleep per night.',
      priority: 'high',
    });
  }

  // Activity insights
  const avgSteps = activityData.reduce((acc, item) => acc + item.steps, 0) / activityData.length;
  if (avgSteps < 7000) {
    insights.push({
      category: 'activity',
      finding: `Your average daily steps (${avgSteps.toFixed(0)}) are below the recommended 7,000-10,000 steps.`,
      recommendation: 'Consider taking short walks throughout the day to increase your activity level.',
      priority: 'medium',
    });
  }

  // Readiness insights
  const avgReadiness = readinessData.reduce((acc, item) => acc + item.score, 0) / readinessData.length;
  if (avgReadiness < 70) {
    insights.push({
      category: 'readiness',
      finding: `Your average readiness score is ${avgReadiness.toFixed(0)}, indicating suboptimal recovery.`,
      recommendation: 'Focus on recovery strategies like adequate sleep, stress management, and proper nutrition.',
      priority: 'high',
    });
  }

  // Determine trends
  const sleepTrend = sleepData[0]?.score > sleepData[sleepData.length - 1]?.score ? 'declining' : 'improving';
  const activityTrend = activityData[0]?.score > activityData[activityData.length - 1]?.score ? 'declining' : 'improving';
  const readinessTrend = readinessData[0]?.score > readinessData[readinessData.length - 1]?.score ? 'declining' : 'improving';

  const result = JSON.stringify(
    {
      period: {
        start_date: startDate,
        end_date: endDate,
      },
      insights,
      trends: {
        sleep: sleepTrend,
        activity: activityTrend,
        readiness: readinessTrend,
      },
    },
    null,
    2
  );

  return result;
}
