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
 * 
 * BUG FIXES:
 * 1. SLEEP DURATION UNITS: Removed incorrect * 3600 conversion
 *    - BEFORE: item.contributors.total_sleep * 3600
 *    - AFTER: item.contributors.total_sleep
 *    - WHY: Oura API already returns durations in SECONDS, not hours
 *    
 * 2. HRV DATA: Fetch real HRV from readiness + detailed sleep endpoints
 *    - BEFORE: ...(include_hrv && { hrv_balance: 0 })
 *    - AFTER: Fetch from getDailyReadiness and getSleepPeriods
 *    - WHY: HRV is not in daily_sleep endpoint, must use readiness/detailed sleep
 * 
 * 3. SLEEP EFFICIENCY & DURATION: Cross-reference with detailed sleep periods
 *    - BEFORE: Used daily_sleep contributors which may be scored/aggregated
 *    - AFTER: Use detailed sleep periods for actual time_in_bed and total_sleep_duration
 *    - WHY: daily_sleep contributors.efficiency is a score; need raw calculation
 * 
 * 4. AWAKE TIME: Calculate from actual time in bed vs sleep duration
 *    - BEFORE: item.contributors.total_sleep * (1 - item.contributors.efficiency / 100)
 *    - AFTER: detailedSleep.time_in_bed - detailedSleep.total_sleep_duration
 *    - WHY: Previous calculation was based on efficiency score, not actual awake time
 * 
 * 5. RAW HRV/RHR VALUES: Add explicit raw value fields
 *    - NEW: hrv_average_ms (raw HRV in milliseconds)
 *    - NEW: resting_heart_rate_bpm (raw RHR in beats per minute)
 *    - WHY: Users need access to raw physiological values, not just contributor scores
 * 
 * 6. CACHE KEY BUG: Fixed to use actual end_date instead of literal 'today'
 *    - BEFORE: cacheKey = `sleep_summary:${start_date}:${end_date || 'today'}:${include_hrv}`
 *    - AFTER: cacheKey = `sleep_summary:${start_date}:${actualEndDate}:${include_hrv}`
 *    - WHY: Cache key must match actual data fetched, prevents cross-day contamination
 */
async function handleGetSleepSummary(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string; include_hrv?: boolean }>(sleepSummarySchema, args);
  const { start_date, end_date, include_hrv } = params;

  // FIXED: Resolve end_date to actual date for cache key consistency
  const actualEndDate = end_date || getTodayDate();
  const cacheKey = `sleep_summary:${start_date}:${actualEndDate}:${include_hrv || false}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  // FIXED: Fetch ALL necessary data sources for accurate calculations
  const [data, detailedSleepData] = await Promise.all([
    getDailySleep(start_date, actualEndDate),
    getSleepPeriods(start_date, actualEndDate), // CRITICAL: For accurate duration/efficiency
  ]);
  
  // FIXED: Fetch both readiness (for HRV balance + RHR) and detailed sleep (for HRV samples)
  let readinessData: any[] = [];
  if (include_hrv) {
    readinessData = await getDailyReadiness(start_date, actualEndDate);
  }

  const mapped = data.map((item) => {
    // FIXED: Get detailed sleep period for this day for accurate calculations
    // The detailed sleep endpoint provides the ACTUAL raw values
    const detailedSleep = detailedSleepData.find((d) => d.day === item.day);
    
    // FIXED: Calculate actual sleep metrics from detailed data when available
    let total_sleep_duration = item.contributors.total_sleep; // Fallback
    let calculated_efficiency = item.contributors.efficiency; // Fallback
    let awake_time = item.contributors.total_sleep * (1 - item.contributors.efficiency / 100); // Fallback
    let time_in_bed = total_sleep_duration + awake_time; // Fallback
    
    if (detailedSleep) {
      // Use ACTUAL values from detailed sleep period
      total_sleep_duration = detailedSleep.total_sleep_duration || total_sleep_duration;
      time_in_bed = detailedSleep.time_in_bed || time_in_bed;
      awake_time = detailedSleep.awake_time || awake_time;
      
      // FIXED: Calculate REAL efficiency from actual time in bed vs sleep duration
      // Efficiency = (total_sleep_duration / time_in_bed) * 100
      if (time_in_bed > 0) {
        calculated_efficiency = (total_sleep_duration / time_in_bed) * 100;
      }
    }
    
    // FIXED: Use detailed sleep for component durations too
    const deep_sleep_duration = detailedSleep?.deep_sleep_duration || item.contributors.deep_sleep;
    const rem_sleep_duration = detailedSleep?.rem_sleep_duration || item.contributors.rem_sleep;
    const light_sleep_duration = detailedSleep?.light_sleep_duration || 
      (total_sleep_duration - deep_sleep_duration - rem_sleep_duration);
    const latency = detailedSleep?.latency || item.contributors.latency;

    // Base data with FIXED calculations
    const baseData = {
      date: item.day,
      score: item.score,
      // CRITICAL FIXES for duration and efficiency
      total_sleep_duration: total_sleep_duration, // In seconds, from detailed sleep
      time_in_bed: time_in_bed, // In seconds, from detailed sleep
      efficiency: calculated_efficiency, // FIXED: Real percentage calculation
      efficiency_score: item.contributors.efficiency, // Original score for reference
      awake_time: awake_time, // FIXED: Actual awake time from detailed sleep
      // Component durations
      latency: latency,
      deep_sleep_duration: deep_sleep_duration,
      rem_sleep_duration: rem_sleep_duration,
      light_sleep_duration: light_sleep_duration,
      // Other contributors
      restfulness: item.contributors.restfulness,
      timing: item.contributors.timing,
    };

    // FIXED: Get real HRV data from appropriate endpoints
    if (include_hrv) {
      const readiness = readinessData.find((r) => r.day === item.day);
      
      return {
        ...baseData,
        // Contributor scores (0-100)
        hrv_balance: readiness?.contributors.hrv_balance ?? null,
        // RAW VALUES - What users actually need!
        hrv_average_ms: detailedSleep?.average_hrv ?? null, // FIXED: Raw HRV in milliseconds
        hrv_samples_count: detailedSleep?.hrv?.items?.length ?? 0,
        resting_heart_rate_bpm: readiness?.contributors.resting_heart_rate ?? null, // FIXED: Raw RHR in BPM
      };
    }

    return baseData;
  });

  const summary = {
    average_score: mapped.reduce((acc, item) => acc + item.score, 0) / mapped.length,
    average_duration: mapped.reduce((acc, item) => acc + item.total_sleep_duration, 0) / mapped.length,
    average_duration_hours: (mapped.reduce((acc, item) => acc + item.total_sleep_duration, 0) / mapped.length) / 3600,
    average_efficiency: mapped.reduce((acc, item) => acc + item.efficiency, 0) / mapped.length,
    average_time_in_bed: mapped.reduce((acc, item) => acc + item.time_in_bed, 0) / mapped.length,
    total_days: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_readiness_score tool
 * 
 * Contains REAL RHR and HRV values from Oura getDailyReadiness endpoint
 * 
 * CACHE KEY BUG FIX: Use actual end_date instead of literal 'today'
 */
async function handleGetReadinessScore(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  // FIXED: Resolve end_date to actual date for cache key consistency
  const actualEndDate = end_date || getTodayDate();
  const cacheKey = `readiness:${start_date}:${actualEndDate}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailyReadiness(start_date, actualEndDate);

  const mapped = data.map((item) => ({
    date: item.day,
    score: item.score,
    temperature_deviation: item.temperature_deviation,
    temperature_trend_deviation: item.temperature_trend_deviation,
    activity_balance: item.contributors.activity_balance,
    body_temperature: item.contributors.body_temperature,
    hrv_balance: item.contributors.hrv_balance, // HRV contributor score (0-100)
    previous_day_activity: item.contributors.previous_day_activity,
    previous_night: item.contributors.previous_night,
    recovery_index: item.contributors.recovery_index,
    resting_heart_rate: item.contributors.resting_heart_rate, // Raw RHR in BPM
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
    average_resting_hr: mapped.reduce((acc, item) => acc + item.resting_heart_rate, 0) / mapped.length,
    average_hrv_balance: mapped.reduce((acc, item) => acc + item.hrv_balance, 0) / mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_activity_summary tool
 * 
 * CACHE KEY BUG FIX: Use actual end_date instead of literal 'today'
 */
async function handleGetActivitySummary(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  // FIXED: Resolve end_date to actual date for cache key consistency
  const actualEndDate = end_date || getTodayDate();
  const cacheKey = `activity:${start_date}:${actualEndDate}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getDailyActivity(start_date, actualEndDate);

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
 * 
 * BUG FIXES:
 * 1. RHR CALCULATION: Use real RHR from getDailyReadiness instead of Math.min
 *    - BEFORE: resting_hr: Math.min(...bpms.slice(0, 10))
 *    - AFTER: Fetch from readiness.contributors.resting_heart_rate
 *    - WHY: Minimum BPM is not the same as resting heart rate
 *    
 * 2. TIMEZONE HANDLING: Preserve ISO 8601 timestamps
 *    - BEFORE: No timezone awareness
 *    - AFTER: Proper date parsing from ISO strings
 *    - WHY: Ensure accurate time-based queries
 * 
 * 3. CACHE KEY BUG: Use actual end_datetime instead of literal 'now'
 *    - BEFORE: cacheKey = `heart_rate:${start_datetime}:${end_datetime || 'now'}`
 *    - AFTER: cacheKey = `heart_rate:${start_datetime}:${actualEndDatetime}`
 *    - WHY: Cache key must match actual data fetched
 */
async function handleGetHeartRate(args: any): Promise<string> {
  const params = validateParams<{ start_datetime: string; end_datetime?: string }>(datetimeRangeSchema, args);
  const { start_datetime, end_datetime } = params;

  // FIXED: Resolve end_datetime to actual datetime for cache key consistency
  const actualEndDatetime = end_datetime || new Date().toISOString();
  const cacheKey = `heart_rate:${start_datetime}:${actualEndDatetime}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getHeartRate(start_datetime, end_datetime);

  // FIXED: Preserve timezone-aware timestamps
  const mapped = data.map((item) => ({
    timestamp: item.timestamp, // ISO 8601 with timezone
    bpm: item.bpm,
    source: item.source,
  }));

  const bpms = mapped.map((item) => item.bpm);
  
  // FIXED: Fetch REAL resting HR from readiness endpoint
  let realRestingHR: number | null = null;
  let rhrSource = 'unavailable';
  
  try {
    // Extract date from datetime for readiness query
    const startDate = start_datetime.split('T')[0];
    const endDate = end_datetime ? end_datetime.split('T')[0] : getTodayDate();
    
    const readinessData = await getDailyReadiness(startDate, endDate);
    if (readinessData.length > 0) {
      // Use most recent readiness data
      const latestReadiness = readinessData[readinessData.length - 1];
      realRestingHR = latestReadiness.contributors.resting_heart_rate;
      rhrSource = 'readiness_api';
    }
  } catch (error) {
    logger.warn('Could not fetch resting HR from readiness endpoint:', error);
  }

  const summary = {
    average_bpm: Math.round(bpms.reduce((acc, bpm) => acc + bpm, 0) / bpms.length),
    min_bpm: Math.min(...bpms),
    max_bpm: Math.max(...bpms),
    resting_hr: realRestingHR, // FIXED: Real RHR from Oura API
    resting_hr_source: rhrSource, // Track data source for transparency
    total_readings: mapped.length,
  };

  const result = JSON.stringify({ data: mapped, summary }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_workouts tool
 * 
 * BUG FIXES:
 * 1. HEART RATE DATA
 *    - BEFORE: average_heart_rate: 0, max_heart_rate: 0
 *    - AFTER: Fetch real HR data from getHeartRate endpoint
 *    - WHY: HR data IS available, just needs to be fetched for workout timeframe
 * 
 * 2. CACHE KEY BUG: Use actual end_date instead of literal 'today'
 *    - BEFORE: cacheKey = `workouts:${start_date}:${end_date || 'today'}`
 *    - AFTER: cacheKey = `workouts:${start_date}:${actualEndDate}`
 *    - WHY: Cache key must match actual data fetched
 */
async function handleGetWorkouts(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  // FIXED: Resolve end_date to actual date for cache key consistency
  const actualEndDate = end_date || getTodayDate();
  const cacheKey = `workouts:${start_date}:${actualEndDate}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getWorkouts(start_date, actualEndDate);

  // FIXED: Fetch heart rate data for each workout period
  const mapped = await Promise.all(
    data.map(async (item) => {
      let avgHR: number | null = null;
      let maxHR: number | null = null;

      try {
        // Fetch HR data for the specific workout timeframe
        const hrData = await getHeartRate(item.start_datetime, item.end_datetime);
        if (hrData.length > 0) {
          const bpms = hrData.map((hr) => hr.bpm);
          avgHR = Math.round(bpms.reduce((acc, bpm) => acc + bpm, 0) / bpms.length);
          maxHR = Math.max(...bpms);
        }
      } catch (error) {
        logger.warn(`Failed to fetch HR data for workout on ${item.day}:`, error);
      }

      return {
        date: item.day,
        activity: item.activity,
        intensity: item.intensity,
        start_datetime: item.start_datetime, // ISO 8601 format
        end_datetime: item.end_datetime, // ISO 8601 format
        calories: item.calories,
        distance: item.distance,
        average_heart_rate: avgHR, // FIXED: Real workout HR
        max_heart_rate: maxHR, // FIXED: Real max HR
      };
    })
  );

  const activities = [...new Set(mapped.map((item) => item.activity))];
  
  // FIXED: Timezone-aware duration calculation
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
 * 
 * ENDPOINT CONSISTENCY: Uses detailed sleep periods for comprehensive data
 * - Includes actual duration values (already in seconds)
 * - Includes full HRV sample arrays
 * - Includes heart rate sample arrays
 * - Preserves ISO 8601 timestamps with timezone
 * - FIXED: Now calculates real efficiency from time_in_bed vs total_sleep_duration
 * 
 * CACHE KEY BUG FIX: Use actual end_date instead of literal 'today'
 */
async function handleGetSleepDetailed(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  // FIXED: Resolve end_date to actual date for cache key consistency
  const actualEndDate = end_date || getTodayDate();
  const cacheKey = `sleep_detailed:${start_date}:${actualEndDate}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getSleepPeriods(start_date, actualEndDate);

  const mapped = data.map((item) => {
    // FIXED: Calculate real efficiency
    const calculated_efficiency = item.time_in_bed > 0 
      ? (item.total_sleep_duration / item.time_in_bed) * 100 
      : 0;
    
    return {
      date: item.day,
      type: item.type,
      bedtime_start: item.bedtime_start, // ISO 8601 with timezone
      bedtime_end: item.bedtime_end, // ISO 8601 with timezone
      breath_average: item.average_breath,
      heart_rate: {
        interval: item.heart_rate.interval,
        samples: item.heart_rate.items,
        average: item.average_heart_rate,
        lowest: item.lowest_heart_rate,
      },
      hrv: {
        interval: item.hrv.interval,
        samples: item.hrv.items,
        average: item.average_hrv, // Raw HRV in milliseconds
      },
      movement_30_sec: item.movement_30_sec,
      sleep_phase_5_min: item.sleep_phase_5_min,
      // Sleep metrics (all in seconds)
      time_in_bed: item.time_in_bed,
      total_sleep_duration: item.total_sleep_duration,
      deep_sleep_duration: item.deep_sleep_duration,
      light_sleep_duration: item.light_sleep_duration,
      rem_sleep_duration: item.rem_sleep_duration,
      awake_time: item.awake_time,
      efficiency: calculated_efficiency, // FIXED: Real percentage
      efficiency_raw: item.efficiency, // Original value for reference
      latency: item.latency,
    };
  });

  const result = JSON.stringify({ data: mapped }, null, 2);
  cache.set(cacheKey, result);
  return result;
}

/**
 * Handler for get_tags tool
 * 
 * CACHE KEY BUG FIX: Use actual end_date instead of literal 'today'
 */
async function handleGetTags(args: any): Promise<string> {
  const params = validateParams<{ start_date: string; end_date?: string }>(dateRangeSchema, args);
  const { start_date, end_date } = params;

  // FIXED: Resolve end_date to actual date for cache key consistency
  const actualEndDate = end_date || getTodayDate();
  const cacheKey = `tags:${start_date}:${actualEndDate}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const data = await getTags(start_date, actualEndDate);

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

  // Readiness insights with REAL HRV data
  const avgReadiness = readinessData.reduce((acc, item) => acc + item.score, 0) / readinessData.length;
  if (avgReadiness < 70) {
    insights.push({
      category: 'readiness',
      finding: `Your average readiness score is ${avgReadiness.toFixed(0)}, indicating suboptimal recovery.`,
      recommendation: 'Focus on recovery strategies like adequate sleep, stress management, and proper nutrition.',
      priority: 'high',
    });
  }

  // HRV insights using REAL data from readiness endpoint
  const avgHRVBalance = readinessData.reduce((acc, item) => acc + item.contributors.hrv_balance, 0) / readinessData.length;
  if (avgHRVBalance < 70) {
    insights.push({
      category: 'recovery',
      finding: `Your average HRV balance is ${avgHRVBalance.toFixed(0)}, suggesting elevated stress or recovery needs.`,
      recommendation: 'Consider stress reduction techniques, quality sleep, and avoiding overtraining.',
      priority: 'high',
    });
  }

  // RHR insights using REAL data from readiness endpoint
  const avgRHR = readinessData.reduce((acc, item) => acc + item.contributors.resting_heart_rate, 0) / readinessData.length;
  const firstRHR = readinessData[0]?.contributors.resting_heart_rate || avgRHR;
  const lastRHR = readinessData[readinessData.length - 1]?.contributors.resting_heart_rate || avgRHR;
  
  if (lastRHR > firstRHR + 3) {
    insights.push({
      category: 'recovery',
      finding: `Your resting heart rate has increased from ${firstRHR.toFixed(0)} to ${lastRHR.toFixed(0)} BPM, which may indicate stress or overtraining.`,
      recommendation: 'Ensure adequate rest and recovery. Consider reducing training intensity temporarily.',
      priority: 'medium',
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
