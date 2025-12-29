import {
  getPersonalInfo,
  getDailySleep,
  getDailyActivity,
  getDailyReadiness,
  getHeartRate,
  getWorkouts,
  getSleepPeriods,
  getEnhancedTags,
  getRingConfiguration,
  getDailySpO2,
  getDailyStress,
  getDailyResilience,
  getDailyCardiovascularAge,
  getVO2Max,
  getSessions,
  getRestModePeriods,
  getSleepTime,
} from "../oura/client.js";
import { getOAuthStatus } from "../oauth/handler.js";
import {
  validateParams,
  dateRangeSchema,
  sleepSummarySchema,
  datetimeRangeSchema,
  healthInsightsSchema,
  getTodayDate,
  getDaysAgo,
} from "../utils/validation.js";
import cache from "../utils/cache.js";
import { MCPTool, MCPToolCall, MCPResponse } from "../oura/types.js";
import { logger } from "../utils/logger.js";

/**
 * List of all available MCP tools
 */
export const tools: MCPTool[] = [
  {
    name: "get_oauth_status",
    description: "Check OAuth connection status and granted scopes (useful for debugging permission issues)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_personal_info",
    description: "Get user's personal information and ring details",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_sleep_summary",
    description: "Get sleep data for a date range",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description:
            "End date in YYYY-MM-DD format (optional, defaults to today)",
        },
        include_hrv: {
          type: "boolean",
          description: "Include HRV data (default: false)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_readiness_score",
    description: "Get daily readiness scores",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_activity_summary",
    description: "Get activity data for a date range",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_heart_rate",
    description: "Get heart rate data (5-minute intervals)",
    inputSchema: {
      type: "object",
      properties: {
        start_datetime: {
          type: "string",
          description: "Start datetime in ISO 8601 format",
        },
        end_datetime: {
          type: "string",
          description:
            "End datetime in ISO 8601 format (optional, defaults to now)",
        },
      },
      required: ["start_datetime"],
    },
  },
  {
    name: "get_workouts",
    description: "Get workout sessions",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_sleep_detailed",
    description:
      "Get detailed sleep period data (multiple sleep sessions per day)",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_health_insights",
    description: "Get AI-powered insights based on recent data",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to analyze (default: 7)",
        },
      },
    },
  },
  {
    name: "get_daily_spo2",
    description: "Get daily blood oxygen saturation (SpO2) data",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_daily_stress",
    description: "Get daily stress and recovery metrics",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_daily_resilience",
    description: "Get daily resilience scores and recovery contributors",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_cardiovascular_age",
    description: "Get daily cardiovascular age estimates",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_vo2_max",
    description: "Get VO2 max (cardio fitness) estimates",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_sessions",
    description: "Get meditation, breathwork, and relaxation sessions",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_rest_mode_periods",
    description: "Get rest mode tracking periods",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_sleep_time",
    description: "Get bedtime recommendations and optimal sleep windows",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_enhanced_tags",
    description: "Get enhanced tags with duration and comments for lifestyle tracking",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_ring_configuration",
    description:
      "Get ring hardware details including color, size, and firmware",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Executes a tool call and returns the result
 */
export async function executeToolCall(
  toolCall: MCPToolCall,
): Promise<MCPResponse> {
  const { name, arguments: args } = toolCall;

  logger.info(`Tool: ${name}`);
  logger.debug(`Tool args:`, args);

  try {
    let result: string;

    switch (name) {
      case "get_oauth_status":
        result = await handleGetOAuthStatus();
        break;
      case "get_personal_info":
        result = await handleGetPersonalInfo();
        break;
      case "get_sleep_summary":
        result = await handleGetSleepSummary(args);
        break;
      case "get_readiness_score":
        result = await handleGetReadinessScore(args);
        break;
      case "get_activity_summary":
        result = await handleGetActivitySummary(args);
        break;
      case "get_heart_rate":
        result = await handleGetHeartRate(args);
        break;
      case "get_workouts":
        result = await handleGetWorkouts(args);
        break;
      case "get_sleep_detailed":
        result = await handleGetSleepDetailed(args);
        break;
      case "get_enhanced_tags":
        result = await handleGetEnhancedTags(args);
        break;
      case "get_health_insights":
        result = await handleGetHealthInsights(args);
        break;
      case "get_daily_spo2":
        result = await handleGetDailySpO2(args);
        break;
      case "get_daily_stress":
        result = await handleGetDailyStress(args);
        break;
      case "get_daily_resilience":
        result = await handleGetDailyResilience(args);
        break;
      case "get_cardiovascular_age":
        result = await handleGetCardiovascularAge(args);
        break;
      case "get_vo2_max":
        result = await handleGetVO2Max(args);
        break;
      case "get_sessions":
        result = await handleGetSessions(args);
        break;
      case "get_rest_mode_periods":
        result = await handleGetRestModePeriods(args);
        break;
      case "get_sleep_time":
        result = await handleGetSleepTime(args);
        break;
      case "get_ring_configuration":
        result = await handleGetRingConfiguration();
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
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
 * Handler for get_oauth_status tool
 */
async function handleGetOAuthStatus(): Promise<string> {
  const status = await getOAuthStatus();

  const requiredScopes = [
    "email",
    "personal",
    "daily",
    "heartrate",
    "workout",
    "tag",
    "session",
    "spo2",
  ];

  const grantedScopes = status.scope ? status.scope.split(" ") : [];
  const missingScopes = requiredScopes.filter(
    (scope) => !grantedScopes.includes(scope),
  );

  const result = {
    connected: status.connected,
    expires_at: status.expiresAt
      ? new Date(status.expiresAt).toISOString()
      : null,
    granted_scopes: grantedScopes,
    missing_scopes: missingScopes,
    has_tag_scope: grantedScopes.includes("tag"),
    recommendation:
      missingScopes.length > 0
        ? `Re-authenticate at /oauth/authorize to grant missing scopes: ${missingScopes.join(", ")}`
        : "All required scopes are granted",
  };

  return JSON.stringify(result, null, 2);
}

/**
 * Handler for get_personal_info tool
 */
async function handleGetPersonalInfo(): Promise<string> {
  const cacheKey = "personal_info";
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
    2,
  );

  cache.set(cacheKey, result, 3600000); // Cache for 1 hour
  return result;
}

/**
 * Handler for get_sleep_summary tool
 */
async function handleGetSleepSummary(args: any): Promise<string> {
  const params = validateParams<{
    start_date: string;
    end_date?: string;
    include_hrv?: boolean;
  }>(sleepSummarySchema, args);
  const { start_date, end_date, include_hrv } = params;

  const cacheKey = `sleep_summary:${start_date}:${end_date || "today"}:${include_hrv || false}`;
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
    light_sleep_duration:
      (item.contributors.total_sleep -
        item.contributors.deep_sleep -
        item.contributors.rem_sleep) *
      3600,
    rem_sleep_duration: item.contributors.rem_sleep * 3600,
    awake_time:
      item.contributors.total_sleep *
      (1 - item.contributors.efficiency / 100) *
      3600,
    restfulness: item.contributors.restfulness,
    timing: item.contributors.timing,
    ...(include_hrv && { hrv_balance: 0 }), // Note: HRV balance not directly available in daily sleep
  }));

  const summary = {
    average_score:
      mapped.reduce((acc, item) => acc + item.score, 0) / mapped.length,
    average_duration:
      mapped.reduce((acc, item) => acc + item.total_sleep_duration, 0) /
      mapped.length,
    average_efficiency:
      mapped.reduce((acc, item) => acc + item.efficiency, 0) / mapped.length,
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
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `readiness:${start_date}:${end_date || "today"}`;
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

  const avgScore =
    mapped.reduce((acc, item) => acc + item.score, 0) / mapped.length;
  const firstScore = mapped[0]?.score || 0;
  const lastScore = mapped[mapped.length - 1]?.score || 0;
  const trend =
    lastScore > firstScore + 5
      ? "improving"
      : lastScore < firstScore - 5
        ? "declining"
        : "stable";

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
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `activity:${start_date}:${end_date || "today"}`;
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
    average_score:
      mapped.reduce((acc, item) => acc + item.score, 0) / mapped.length,
    total_steps: mapped.reduce((acc, item) => acc + item.steps, 0),
    total_calories: mapped.reduce((acc, item) => acc + item.total_calories, 0),
    average_steps_per_day:
      mapped.reduce((acc, item) => acc + item.steps, 0) / mapped.length,
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
  const params = validateParams<{
    start_datetime: string;
    end_datetime?: string;
  }>(datetimeRangeSchema, args);
  const { start_datetime, end_datetime } = params;

  const cacheKey = `heart_rate:${start_datetime}:${end_datetime || "now"}`;
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
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `workouts:${start_date}:${end_date || "today"}`;
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
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `sleep_detailed:${start_date}:${end_date || "today"}`;
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
 * Handler for get_enhanced_tags tool
 */
async function handleGetEnhancedTags(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `enhanced_tags:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getEnhancedTags(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    tag_type_code: item.tag_type_code,
    custom_name: item.custom_name,
    start_time: item.start_time,
    end_time: item.end_time,
    start_day: item.start_day,
    end_day: item.end_day,
    comment: item.comment,
  }));

  const tagTypes = [...new Set(mapped.map((item) => item.tag_type_code).filter(Boolean))];
  const customTags = mapped
    .filter((item) => item.tag_type_code === "custom" && item.custom_name)
    .map((item) => item.custom_name);
  const summary = {
    total_tags: mapped.length,
    tag_types: tagTypes,
    custom_tag_names: [...new Set(customTags)],
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
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
  const avgSleepScore =
    sleepData.reduce((acc, item) => acc + item.score, 0) / sleepData.length;
  if (avgSleepScore < 70) {
    insights.push({
      category: "sleep",
      finding: `Your average sleep score is ${avgSleepScore.toFixed(0)}, which is below optimal levels.`,
      recommendation:
        "Try to maintain a consistent sleep schedule and aim for 7-9 hours of sleep per night.",
      priority: "high",
    });
  }

  // Activity insights
  const avgSteps =
    activityData.reduce((acc, item) => acc + item.steps, 0) /
    activityData.length;
  if (avgSteps < 7000) {
    insights.push({
      category: "activity",
      finding: `Your average daily steps (${avgSteps.toFixed(0)}) are below the recommended 7,000-10,000 steps.`,
      recommendation:
        "Consider taking short walks throughout the day to increase your activity level.",
      priority: "medium",
    });
  }

  // Readiness insights
  const avgReadiness =
    readinessData.reduce((acc, item) => acc + item.score, 0) /
    readinessData.length;
  if (avgReadiness < 70) {
    insights.push({
      category: "readiness",
      finding: `Your average readiness score is ${avgReadiness.toFixed(0)}, indicating suboptimal recovery.`,
      recommendation:
        "Focus on recovery strategies like adequate sleep, stress management, and proper nutrition.",
      priority: "high",
    });
  }

  // Determine trends
  const sleepTrend =
    sleepData[0]?.score > sleepData[sleepData.length - 1]?.score
      ? "declining"
      : "improving";
  const activityTrend =
    activityData[0]?.score > activityData[activityData.length - 1]?.score
      ? "declining"
      : "improving";
  const readinessTrend =
    readinessData[0]?.score > readinessData[readinessData.length - 1]?.score
      ? "declining"
      : "improving";

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
    2,
  );

  return result;
}

/**
 * Handler for get_daily_spo2 tool
 */
async function handleGetDailySpO2(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `daily_spo2:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailySpO2(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    day: item.day,
    spo2_percentage: item.spo2_percentage?.average,
  }));

  const validSpo2 = mapped.filter((item) => item.spo2_percentage != null);
  const summary = {
    average_spo2:
      validSpo2.length > 0
        ? validSpo2.reduce(
            (acc, item) => acc + (item.spo2_percentage ?? 0),
            0,
          ) / validSpo2.length
        : null,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_daily_stress tool
 */
async function handleGetDailyStress(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `daily_stress:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailyStress(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    day: item.day,
    stress_high: item.stress_high,
    recovery_high: item.recovery_high,
    day_summary: item.day_summary,
  }));

  const summary = {
    average_stress_high:
      mapped.reduce((acc, item) => acc + (item.stress_high ?? 0), 0) /
      mapped.length,
    average_recovery_high:
      mapped.reduce((acc, item) => acc + (item.recovery_high ?? 0), 0) /
      mapped.length,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_daily_resilience tool
 */
async function handleGetDailyResilience(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `daily_resilience:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailyResilience(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    day: item.day,
    level: item.level,
    contributors: item.contributors,
  }));

  const levels = mapped
    .map((item) => item.level)
    .filter(
      (
        level,
      ): level is "limited" | "adequate" | "solid" | "strong" | "exceptional" =>
        level != null,
    );
  const summary = {
    level_distribution: levels.reduce(
      (acc, level) => {
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_cardiovascular_age tool
 */
async function handleGetCardiovascularAge(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `cardiovascular_age:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailyCardiovascularAge(
    start_date,
    end_date || getTodayDate(),
  );

  const mapped = data.map((item) => ({
    day: item.day,
    vascular_age: item.vascular_age,
  }));

  const validAges = mapped.filter((item) => item.vascular_age != null);
  const summary = {
    average_vascular_age:
      validAges.length > 0
        ? validAges.reduce((acc, item) => acc + (item.vascular_age ?? 0), 0) /
          validAges.length
        : null,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_vo2_max tool
 */
async function handleGetVO2Max(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `vo2_max:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getVO2Max(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    day: item.day,
    vo2_max: item.vo2_max,
  }));

  const validVo2 = mapped.filter((item) => item.vo2_max != null);
  const summary = {
    average_vo2_max:
      validVo2.length > 0
        ? validVo2.reduce((acc, item) => acc + (item.vo2_max ?? 0), 0) /
          validVo2.length
        : null,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_sessions tool
 */
async function handleGetSessions(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `sessions:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getSessions(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    day: item.day,
    start_datetime: item.start_datetime,
    end_datetime: item.end_datetime,
    type: item.type,
    mood: item.mood,
    heart_rate: item.heart_rate,
    heart_rate_variability: item.heart_rate_variability,
    motion_count: item.motion_count,
  }));

  const types = [...new Set(mapped.map((item) => item.type))];
  const summary = {
    total_sessions: mapped.length,
    session_types: types,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_rest_mode_periods tool
 */
async function handleGetRestModePeriods(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `rest_mode_periods:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getRestModePeriods(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    start_day: item.start_day,
    end_day: item.end_day,
    start_time: item.start_time,
    end_time: item.end_time,
    episodes: item.episodes,
  }));

  const summary = {
    total_periods: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_sleep_time tool
 */
async function handleGetSleepTime(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(
    dateRangeSchema,
    args,
  );
  const { start_date, end_date } = params;

  const cacheKey = `sleep_time:${start_date}:${end_date || "today"}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getSleepTime(start_date, end_date || getTodayDate());

  const mapped = data.map((item) => ({
    id: item.id,
    day: item.day,
    optimal_bedtime: item.optimal_bedtime,
    recommendation: item.recommendation,
    status: item.status,
  }));

  const result = JSON.stringify({ data: mapped }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_ring_configuration tool
 */
async function handleGetRingConfiguration(): Promise<string> {
  const cacheKey = "ring_configuration";
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getRingConfiguration();

  const mapped = data.map((item) => ({
    id: item.id,
    color: item.color,
    design: item.design,
    firmware_version: item.firmware_version,
    hardware_type: item.hardware_type,
    set_up_at: item.set_up_at,
    size: item.size,
  }));

  const result = JSON.stringify({ data: mapped }, null, 2);
  cache.set(cacheKey, result, 3600000); // Cache for 1 hour
  return result;
}
