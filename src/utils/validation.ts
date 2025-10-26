import Joi from 'joi';

// Date validation patterns
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

/**
 * Schema for date range parameters
 */
export const dateRangeSchema = Joi.object({
  start_date: Joi.string()
    .pattern(DATE_PATTERN)
    .required()
    .messages({
      'string.pattern.base': 'start_date must be in YYYY-MM-DD format',
      'any.required': 'start_date is required',
    }),
  end_date: Joi.string()
    .pattern(DATE_PATTERN)
    .optional()
    .messages({
      'string.pattern.base': 'end_date must be in YYYY-MM-DD format',
    }),
});

/**
 * Schema for datetime range parameters
 */
export const datetimeRangeSchema = Joi.object({
  start_datetime: Joi.string()
    .pattern(ISO_DATETIME_PATTERN)
    .required()
    .messages({
      'string.pattern.base': 'start_datetime must be in ISO 8601 format',
      'any.required': 'start_datetime is required',
    }),
  end_datetime: Joi.string()
    .pattern(ISO_DATETIME_PATTERN)
    .optional()
    .messages({
      'string.pattern.base': 'end_datetime must be in ISO 8601 format',
    }),
});

/**
 * Schema for sleep summary parameters
 */
export const sleepSummarySchema = dateRangeSchema.keys({
  include_hrv: Joi.boolean().optional(),
});

/**
 * Schema for heart rate parameters
 */
export const heartRateSchema = datetimeRangeSchema;

/**
 * Schema for health insights parameters
 */
export const healthInsightsSchema = Joi.object({
  days: Joi.number()
    .integer()
    .min(1)
    .max(90)
    .optional()
    .default(7)
    .messages({
      'number.base': 'days must be a number',
      'number.integer': 'days must be an integer',
      'number.min': 'days must be at least 1',
      'number.max': 'days must be at most 90',
    }),
});

/**
 * Validates parameters against a schema
 * @param schema - Joi schema to validate against
 * @param data - Data to validate
 * @returns Validated and sanitized data
 * @throws Error if validation fails
 */
export function validateParams<T>(schema: Joi.Schema, data: any): T {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const messages = error.details.map((detail) => detail.message).join(', ');
    throw new Error(`Validation error: ${messages}`);
  }

  return value as T;
}

/**
 * Validates a date string
 * @param date - Date string to validate
 * @returns True if valid, false otherwise
 */
export function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Validates an ISO datetime string
 * @param datetime - Datetime string to validate
 * @returns True if valid, false otherwise
 */
export function isValidDatetime(datetime: string): boolean {
  if (!ISO_DATETIME_PATTERN.test(datetime)) {
    return false;
  }

  const d = new Date(datetime);
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Gets today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gets a date N days ago in YYYY-MM-DD format
 * @param days - Number of days ago
 */
export function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Converts a date string to ISO datetime
 * @param date - Date in YYYY-MM-DD format
 * @param endOfDay - If true, returns end of day (23:59:59)
 */
export function dateToDatetime(date: string, endOfDay: boolean = false): string {
  const d = new Date(date);
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

/**
 * Validates that start_date is before end_date
 * @param startDate - Start date
 * @param endDate - End date
 * @throws Error if dates are invalid
 */
export function validateDateRange(startDate: string, endDate?: string): void {
  if (!isValidDate(startDate)) {
    throw new Error('Invalid start_date format');
  }

  if (endDate) {
    if (!isValidDate(endDate)) {
      throw new Error('Invalid end_date format');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new Error('start_date must be before or equal to end_date');
    }
  }
}

/**
 * Validates that start_datetime is before end_datetime
 * @param startDatetime - Start datetime
 * @param endDatetime - End datetime
 * @throws Error if datetimes are invalid
 */
export function validateDatetimeRange(startDatetime: string, endDatetime?: string): void {
  if (!isValidDatetime(startDatetime)) {
    throw new Error('Invalid start_datetime format');
  }

  if (endDatetime) {
    if (!isValidDatetime(endDatetime)) {
      throw new Error('Invalid end_datetime format');
    }

    const start = new Date(startDatetime);
    const end = new Date(endDatetime);

    if (start > end) {
      throw new Error('start_datetime must be before or equal to end_datetime');
    }
  }
}
