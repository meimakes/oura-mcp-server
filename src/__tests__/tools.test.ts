import { tools, executeToolCall } from "../mcp/tools.js";

// Mock the Oura client
jest.mock("../oura/client.js", () => ({
  getPersonalInfo: jest.fn(),
  getDailySleep: jest.fn(),
  getDailyActivity: jest.fn(),
  getDailyReadiness: jest.fn(),
  getHeartRate: jest.fn(),
  getWorkouts: jest.fn(),
  getSleepPeriods: jest.fn(),
  getEnhancedTags: jest.fn(),
  getRingConfiguration: jest.fn(),
  getDailySpO2: jest.fn(),
  getDailyStress: jest.fn(),
  getDailyResilience: jest.fn(),
  getDailyCardiovascularAge: jest.fn(),
  getVO2Max: jest.fn(),
  getSessions: jest.fn(),
  getRestModePeriods: jest.fn(),
  getSleepTime: jest.fn(),
}));

// Mock the cache
jest.mock("../utils/cache.js", () => {
  return {
    __esModule: true,
    default: {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
    },
  };
});

// Mock the logger
jest.mock("../utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import * as client from "../oura/client.js";

describe("MCP Tools", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("tools array", () => {
    it("should have 19 tools defined", () => {
      expect(tools).toHaveLength(19);
    });

    it("should include all new endpoint tools", () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_daily_spo2");
      expect(toolNames).toContain("get_daily_stress");
      expect(toolNames).toContain("get_daily_resilience");
      expect(toolNames).toContain("get_cardiovascular_age");
      expect(toolNames).toContain("get_vo2_max");
      expect(toolNames).toContain("get_sessions");
      expect(toolNames).toContain("get_rest_mode_periods");
      expect(toolNames).toContain("get_sleep_time");
      expect(toolNames).toContain("get_enhanced_tags");
      expect(toolNames).toContain("get_ring_configuration");
    });

    it("should not include deprecated get_tags tool", () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).not.toContain("get_tags");
    });

    it("should have proper input schemas for date-based tools", () => {
      const dateBasedTools = [
        "get_daily_spo2",
        "get_daily_stress",
        "get_daily_resilience",
        "get_cardiovascular_age",
        "get_vo2_max",
        "get_sessions",
        "get_rest_mode_periods",
        "get_sleep_time",
        "get_enhanced_tags",
      ];

      dateBasedTools.forEach((toolName) => {
        const tool = tools.find((t) => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.properties).toHaveProperty("start_date");
        expect(tool?.inputSchema.required).toContain("start_date");
      });
    });

    it("should have no required params for get_ring_configuration", () => {
      const tool = tools.find((t) => t.name === "get_ring_configuration");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toBeUndefined();
    });
  });

  describe("executeToolCall", () => {
    describe("get_daily_spo2", () => {
      it("should return SpO2 data with summary", async () => {
        const mockData = [
          { id: "1", day: "2024-01-01", spo2_percentage: { average: 97 } },
          { id: "2", day: "2024-01-02", spo2_percentage: { average: 98 } },
        ];
        (client.getDailySpO2 as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_daily_spo2",
          arguments: { start_date: "2024-01-01", end_date: "2024-01-02" },
        });

        expect(result.content[0].type).toBe("text");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toHaveLength(2);
        expect(parsed.summary.average_spo2).toBe(97.5);
        expect(parsed.summary.total_days).toBe(2);
      });
    });

    describe("get_daily_stress", () => {
      it("should return stress data with summary", async () => {
        const mockData = [
          {
            id: "1",
            day: "2024-01-01",
            stress_high: 30,
            recovery_high: 70,
            day_summary: "restored",
          },
        ];
        (client.getDailyStress as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_daily_stress",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data[0].stress_high).toBe(30);
        expect(parsed.data[0].recovery_high).toBe(70);
        expect(parsed.summary.average_stress_high).toBe(30);
      });
    });

    describe("get_daily_resilience", () => {
      it("should return resilience data with level distribution", async () => {
        const mockData = [
          {
            id: "1",
            day: "2024-01-01",
            level: "solid",
            contributors: { sleep_recovery: 80, daytime_recovery: 70 },
          },
          {
            id: "2",
            day: "2024-01-02",
            level: "strong",
            contributors: { sleep_recovery: 90, daytime_recovery: 85 },
          },
        ];
        (client.getDailyResilience as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_daily_resilience",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toHaveLength(2);
        expect(parsed.summary.level_distribution).toEqual({
          solid: 1,
          strong: 1,
        });
      });
    });

    describe("get_cardiovascular_age", () => {
      it("should return cardiovascular age with average", async () => {
        const mockData = [
          { day: "2024-01-01", vascular_age: 35 },
          { day: "2024-01-02", vascular_age: 34 },
        ];
        (client.getDailyCardiovascularAge as jest.Mock).mockResolvedValue(
          mockData,
        );

        const result = await executeToolCall({
          name: "get_cardiovascular_age",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.summary.average_vascular_age).toBe(34.5);
      });
    });

    describe("get_vo2_max", () => {
      it("should return VO2 max data with average", async () => {
        const mockData = [
          { id: "1", day: "2024-01-01", vo2_max: 42 },
          { id: "2", day: "2024-01-02", vo2_max: 43 },
        ];
        (client.getVO2Max as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_vo2_max",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.summary.average_vo2_max).toBe(42.5);
      });
    });

    describe("get_sessions", () => {
      it("should return session data with type summary", async () => {
        const mockData = [
          {
            id: "1",
            day: "2024-01-01",
            start_datetime: "2024-01-01T08:00:00Z",
            end_datetime: "2024-01-01T08:15:00Z",
            type: "meditation",
            mood: "good",
            heart_rate: null,
            heart_rate_variability: null,
            motion_count: null,
          },
          {
            id: "2",
            day: "2024-01-01",
            start_datetime: "2024-01-01T12:00:00Z",
            end_datetime: "2024-01-01T12:10:00Z",
            type: "breathing",
            mood: "great",
            heart_rate: null,
            heart_rate_variability: null,
            motion_count: null,
          },
        ];
        (client.getSessions as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_sessions",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toHaveLength(2);
        expect(parsed.summary.total_sessions).toBe(2);
        expect(parsed.summary.session_types).toContain("meditation");
        expect(parsed.summary.session_types).toContain("breathing");
      });
    });

    describe("get_rest_mode_periods", () => {
      it("should return rest mode periods", async () => {
        const mockData = [
          {
            id: "1",
            start_day: "2024-01-01",
            end_day: "2024-01-03",
            start_time: "2024-01-01T20:00:00Z",
            end_time: "2024-01-03T08:00:00Z",
            episodes: [],
          },
        ];
        (client.getRestModePeriods as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_rest_mode_periods",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toHaveLength(1);
        expect(parsed.summary.total_periods).toBe(1);
      });
    });

    describe("get_sleep_time", () => {
      it("should return sleep time recommendations", async () => {
        const mockData = [
          {
            id: "1",
            day: "2024-01-01",
            optimal_bedtime: {
              day_tz: 0,
              start_offset: 79200,
              end_offset: 82800,
            },
            recommendation: "improve_efficiency",
            status: "not_enough_nights",
          },
        ];
        (client.getSleepTime as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_sleep_time",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toHaveLength(1);
        expect(parsed.data[0].recommendation).toBe("improve_efficiency");
      });
    });

    describe("get_enhanced_tags", () => {
      it("should return enhanced tags with summary", async () => {
        const mockData = [
          {
            id: "1",
            tag_type_code: "caffeine",
            start_time: "2024-01-01T08:00:00Z",
            end_time: null,
            start_day: "2024-01-01",
            end_day: null,
            comment: "Morning coffee",
          },
          {
            id: "2",
            tag_type_code: "alcohol",
            start_time: "2024-01-01T20:00:00Z",
            end_time: null,
            start_day: "2024-01-01",
            end_day: null,
            comment: "Wine with dinner",
          },
        ];
        (client.getEnhancedTags as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_enhanced_tags",
          arguments: { start_date: "2024-01-01" },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toHaveLength(2);
        expect(parsed.summary.total_tags).toBe(2);
        expect(parsed.summary.tag_types).toContain("caffeine");
        expect(parsed.summary.tag_types).toContain("alcohol");
      });
    });

    describe("get_ring_configuration", () => {
      it("should return ring configuration", async () => {
        const mockData = [
          {
            id: "1",
            color: "silver",
            design: "heritage",
            firmware_version: "2.5.1",
            hardware_type: "gen3",
            set_up_at: "2023-06-01T10:00:00Z",
            size: 9,
          },
        ];
        (client.getRingConfiguration as jest.Mock).mockResolvedValue(mockData);

        const result = await executeToolCall({
          name: "get_ring_configuration",
          arguments: {},
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toHaveLength(1);
        expect(parsed.data[0].color).toBe("silver");
        expect(parsed.data[0].hardware_type).toBe("gen3");
      });
    });

    describe("error handling", () => {
      it("should throw error for unknown tool", async () => {
        await expect(
          executeToolCall({
            name: "unknown_tool",
            arguments: {},
          }),
        ).rejects.toThrow("Unknown tool: unknown_tool");
      });
    });
  });
});
