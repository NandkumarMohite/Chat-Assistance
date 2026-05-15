// ─────────────────────────────────────────────
// core/test-mock-data.js — Mock API responses for local testing
// When TEST_LOCALLY=true in .env, these responses are returned
// instead of calling the real BFF backend.
// ─────────────────────────────────────────────

const MOCK_RESPONSES = {

  get_oee_parameters: {
    time: 4200,
    percentage: 1,
    totalParameters: [
      { name: "Operating Time", value: 4200 },
      { name: "Stop Threshold", value: 60 },
      { name: "Planned Production Time", value: 4200 },
      { name: "Sum Of Failures", value: 0 },
      { name: "Scheduled Breaks", value: 0 }
    ],
    overTimeChanges: [
      { date: "2026-05-13T06:00:00Z", number: 1 },
      { date: "2026-05-13T07:00:00Z", number: 1 },
      { date: "2026-05-13T07:05:00Z", number: 1 }
    ],
    lowestAggregator: 5
  },

  get_time_between_cycles: [
    {
      stationId: 1,
      modelId: "MODEL_A",
      duration: [45, 50, 47, 43, 48, 51, 44],
      max: [55],
      min: [40],
      std: [3],
      nCycles: 120
    },
    {
      stationId: 2,
      modelId: "MODEL_B",
      duration: [38, 41, 39, 42, 40],
      max: [48],
      min: [35],
      std: [2],
      nCycles: 95
    }
  ],

  get_overall_cycle_counts: [
    {
      stationId: 1,
      modelId: "MODEL_A",
      totalDuration: 5400,
      totalTimeNoRework: 5000,
      ok_cycles: 120,
      nok_cycles: 5,
      ok_NoReworkCycles: 118,
      nok_NoReworkCycles: 2,
      refCycleTime: 45,
      startTime: "2026-05-14T05:23:24.333Z",
      endTime: "2026-05-14T06:23:24.333Z",
      ncycles: 125
    },
    {
      stationId: 2,
      modelId: "MODEL_B",
      totalDuration: 4800,
      totalTimeNoRework: 4500,
      ok_cycles: 98,
      nok_cycles: 7,
      ok_NoReworkCycles: 95,
      nok_NoReworkCycles: 3,
      refCycleTime: 40,
      startTime: "2026-05-14T05:23:24.333Z",
      endTime: "2026-05-14T06:23:24.333Z",
      ncycles: 105
    }
  ],

  get_cycle_times: [
    {
      stationId: 1,
      modelId: "MODEL_A",
      refCycleTime: 45,
      duration: [42, 46, 44, 48, 43, 47, 45],
      max: [50],
      min: [40],
      std: [3],
      nexceedCycles: 5,
      nCycles: 120
    },
    {
      stationId: 2,
      modelId: "MODEL_B",
      refCycleTime: 40,
      duration: [38, 41, 39, 42, 37],
      max: [45],
      min: [35],
      std: [2],
      nexceedCycles: 3,
      nCycles: 95
    }
  ],

  get_tree_view_of_cycle_time: {
    plantAverageCycleTime: 52,
    plantTotalCycles: 1200,
    plantCyclesWithExceedingRefCT: 85,
    refCycleTime: 45,
    message: "Cycle time tree data retrieved successfully",
    lineHierarchies: [
      {
        lineId: 1,
        lineName: "Assembly Line 1",
        avgCycleTime: 49,
        totalCycles: 550,
        totalExceedCycles: 35,
        refCycleTime: 45,
        stationMatrics: [
          {
            stationId: 101,
            stationName: "Station A",
            lineName: "Assembly Line 1",
            componentId: 10,
            lineId: 1,
            totalCycles: 300,
            totalExceedCycles: 20,
            avgCycleTime: 48,
            maxCycleTime: 70,
            minCycleTime: 35,
            avgStd: 4,
            isLastStation: false,
            refCycleTime: 45,
            modelMetrics: [
              {
                stationId: 101,
                modelName: "MODEL_X",
                totalCycles: 150,
                totalExceedCycles: 10,
                avgCycleTime: 47,
                maxCycleTime: 65,
                minCycleTime: 36,
                avgStd: 3,
                refCycleTime: 45
              },
              {
                stationId: 101,
                modelName: "MODEL_Y",
                totalCycles: 150,
                totalExceedCycles: 10,
                avgCycleTime: 51,
                maxCycleTime: 72,
                minCycleTime: 38,
                avgStd: 5,
                refCycleTime: 45
              }
            ]
          },
          {
            stationId: 102,
            stationName: "Station B",
            lineName: "Assembly Line 1",
            componentId: 11,
            lineId: 1,
            totalCycles: 250,
            totalExceedCycles: 15,
            avgCycleTime: 50,
            maxCycleTime: 68,
            minCycleTime: 37,
            avgStd: 3,
            isLastStation: true,
            refCycleTime: 45,
            modelMetrics: [
              {
                stationId: 102,
                modelName: "MODEL_X",
                totalCycles: 130,
                totalExceedCycles: 8,
                avgCycleTime: 49,
                maxCycleTime: 62,
                minCycleTime: 38,
                avgStd: 3,
                refCycleTime: 45
              }
            ]
          }
        ]
      },
      {
        lineId: 2,
        lineName: "Assembly Line 2",
        avgCycleTime: 55,
        totalCycles: 650,
        totalExceedCycles: 50,
        refCycleTime: 45,
        stationMatrics: [
          {
            stationId: 201,
            stationName: "Station C",
            lineName: "Assembly Line 2",
            componentId: 20,
            lineId: 2,
            totalCycles: 350,
            totalExceedCycles: 30,
            avgCycleTime: 54,
            maxCycleTime: 75,
            minCycleTime: 40,
            avgStd: 5,
            isLastStation: false,
            refCycleTime: 45,
            modelMetrics: [
              {
                stationId: 201,
                modelName: "MODEL_A",
                totalCycles: 200,
                totalExceedCycles: 18,
                avgCycleTime: 53,
                maxCycleTime: 70,
                minCycleTime: 41,
                avgStd: 4,
                refCycleTime: 45
              }
            ]
          }
        ]
      }
    ]
  },

  get_cycle_operations: [
    {
      stationId: 1,
      modelId: "MODEL_A",
      opId: 1001,
      refOpTime: 30,
      mean: [28, 29, 31, 30, 32],
      delta: [-2, -1, 1, 0, 2],
      max: [35],
      min: [25],
      std: [2],
      nexceedOpTime: 4,
      nCycles: 120
    },
    {
      stationId: 1,
      modelId: "MODEL_A",
      opId: 1002,
      refOpTime: 15,
      mean: [14, 16, 15, 17],
      delta: [-1, 1, 0, 2],
      max: [19],
      min: [12],
      std: [1],
      nexceedOpTime: 2,
      nCycles: 120
    }
  ],

  get_tree_view_of_oee_data: {
    overallOee: 85,
    overallQuality: 92,
    overallPerformance: 88,
    overallAvailability: 90,
    message: "OEE tree data retrieved successfully",
    unit: "milliseconds",
    componentMetrics: [
      {
        stationId: 101,
        stationName: "Station A",
        componentId: 10,
        lineId: 1,
        oee: 84,
        availablity: 89,
        performance: 87,
        quality: 92,
        isLastStation: false,
        modelMetrics: [
          { stationId: 101, modelName: "MODEL_X", oee: 83, availablity: 88, performance: 86, quality: 91 },
          { stationId: 101, modelName: "MODEL_Y", oee: 81, availablity: 86, performance: 85, quality: 90 }
        ]
      }
    ],
    stationMatrics: [
      {
        stationId: 102,
        stationName: "Station B",
        componentId: 11,
        lineId: 1,
        oee: 86,
        availablity: 91,
        performance: 89,
        quality: 93,
        isLastStation: false,
        modelMetrics: [
          { stationId: 102, modelName: "MODEL_Y", oee: 85, availablity: 90, performance: 88, quality: 92 }
        ]
      }
    ],
    lineHierarchies: [
      {
        lineId: 1,
        lineName: "Assembly Line 1",
        oee: 85,
        performance: 88,
        availablity: 90,
        quality: 92,
        stationMatrics: [
          {
            stationId: 101,
            stationName: "Station A",
            componentId: 10,
            lineId: 1,
            oee: 84,
            availablity: 89,
            performance: 87,
            quality: 92,
            isLastStation: false,
            modelMetrics: [
              { stationId: 101, modelName: "MODEL_X", oee: 83, availablity: 88, performance: 86, quality: 91 }
            ]
          },
          {
            stationId: 102,
            stationName: "Station B",
            componentId: 11,
            lineId: 1,
            oee: 86,
            availablity: 91,
            performance: 89,
            quality: 93,
            isLastStation: true,
            modelMetrics: [
              { stationId: 102, modelName: "MODEL_Y", oee: 85, availablity: 90, performance: 88, quality: 92 }
            ]
          }
        ]
      },
      {
        lineId: 2,
        lineName: "Assembly Line 2",
        oee: 79,
        performance: 82,
        availablity: 85,
        quality: 88,
        stationMatrics: [
          {
            stationId: 201,
            stationName: "Station C",
            componentId: 20,
            lineId: 2,
            oee: 79,
            availablity: 85,
            performance: 82,
            quality: 88,
            isLastStation: false,
            modelMetrics: [
              { stationId: 201, modelName: "MODEL_A", oee: 78, availablity: 84, performance: 81, quality: 87 }
            ]
          }
        ]
      }
    ]
  },

  get_station_quality: {
    overallQuality: 96.77,
    totalCycles: 377,
    goodCycles: 365,
    badCycles: 12,
    modelwiseDistribution: [
      { modelName: "MODEL_X", quality: 97.5, totalCycles: 200, goodCycles: 195, badCycles: 5 },
      { modelName: "MODEL_Y", quality: 95.2, totalCycles: 177, goodCycles: 168, badCycles: 9 }
    ]
  },

  get_performance_and_productivity: {
    overallPerformance: 96.77,
    overallProductivity: 92.45,
    modelwiseDistribution: [
      { modelId: "991/992/6S2P", performance: 95.5, productivity: 91.2, cycles: 377, capacity: 500, target: 400 },
      { modelId: "MODEL_X", performance: 97.8, productivity: 94.1, cycles: 420, capacity: 550, target: 450 }
    ]
  },

  get_oee_station_parameters: {
    oeeValue: 0.776,
    overallOeeVariables: {
      availability: 91.5,
      quality: 96.2,
      performance: 88.4,
      oee: 77.6
    }
  },

  get_line_oee_report_data: {
    lineId: 1,
    lineName: "Assembly Line 1",
    selectedDate: "2026-05-14T11:06:07.819Z",
    range: { startDate: "2026-05-01T00:00:00Z", to: "2026-05-31T23:59:59Z" },
    lineOeeOverview: {
      daily: {
        range: "Last 7 Days",
        data: [
          { date: "2026-05-08", week: "Week 19", month: "May", rangeLabel: "Day", oee: 82.1, referenceOee: 90 },
          { date: "2026-05-09", week: "Week 19", month: "May", rangeLabel: "Day", oee: 84.5, referenceOee: 90 },
          { date: "2026-05-10", week: "Week 19", month: "May", rangeLabel: "Day", oee: 83.2, referenceOee: 90 },
          { date: "2026-05-11", week: "Week 19", month: "May", rangeLabel: "Day", oee: 86.7, referenceOee: 90 },
          { date: "2026-05-12", week: "Week 20", month: "May", rangeLabel: "Day", oee: 85.9, referenceOee: 90 },
          { date: "2026-05-13", week: "Week 20", month: "May", rangeLabel: "Day", oee: 87.3, referenceOee: 90 },
          { date: "2026-05-14", week: "Week 20", month: "May", rangeLabel: "Day", oee: 84.5, referenceOee: 90 }
        ]
      },
      weekly: {
        range: "Last 4 Weeks",
        data: [
          { date: "2026-W17", week: "Week 17", month: "April", rangeLabel: "Week", oee: 83.1, referenceOee: 90 },
          { date: "2026-W18", week: "Week 18", month: "May", rangeLabel: "Week", oee: 84.8, referenceOee: 90 },
          { date: "2026-W19", week: "Week 19", month: "May", rangeLabel: "Week", oee: 85.2, referenceOee: 90 },
          { date: "2026-W20", week: "Week 20", month: "May", rangeLabel: "Week", oee: 86.0, referenceOee: 90 }
        ]
      },
      monthly: {
        range: "Last 12 Months",
        data: [
          { date: "2026-01", week: "", month: "January", rangeLabel: "Month", oee: 80.2, referenceOee: 90 },
          { date: "2026-02", week: "", month: "February", rangeLabel: "Month", oee: 81.5, referenceOee: 90 },
          { date: "2026-03", week: "", month: "March", rangeLabel: "Month", oee: 83.1, referenceOee: 90 },
          { date: "2026-04", week: "", month: "April", rangeLabel: "Month", oee: 84.3, referenceOee: 90 },
          { date: "2026-05", week: "", month: "May", rangeLabel: "Month", oee: 86.1, referenceOee: 90 }
        ]
      }
    },
    stations: [
      {
        stationId: 101,
        stationName: "Station A",
        oeeOverview: {
          daily: {
            range: "Last 7 Days",
            data: [
              { date: "2026-05-10", week: "Week 19", month: "May", rangeLabel: "Day", oee: 83.4, referenceOee: 88 },
              { date: "2026-05-11", week: "Week 19", month: "May", rangeLabel: "Day", oee: 85.1, referenceOee: 88 },
              { date: "2026-05-12", week: "Week 20", month: "May", rangeLabel: "Day", oee: 84.7, referenceOee: 88 }
            ]
          },
          weekly: {
            range: "Last 4 Weeks",
            data: [
              { date: "2026-W19", week: "Week 19", month: "May", rangeLabel: "Week", oee: 84.1, referenceOee: 88 },
              { date: "2026-W20", week: "Week 20", month: "May", rangeLabel: "Week", oee: 85.0, referenceOee: 88 }
            ]
          },
          monthly: {
            range: "Last 12 Months",
            data: [
              { date: "2026-04", week: "", month: "April", rangeLabel: "Month", oee: 83.8, referenceOee: 88 },
              { date: "2026-05", week: "", month: "May", rangeLabel: "Month", oee: 85.3, referenceOee: 88 }
            ]
          }
        }
      }
    ]
  },

  get_busy_oee_station: {
    oeeValue: 0.776,
    overallOeeVariables: {
      availability: 91.2,
      quality: 95.4,
      performance: 88.1,
      busyOee: 77.6
    }
  },

  get_busy_availability: {
    time: 87500,
    percentage: 91.5,
    totalParameters: [
      { name: "Busy Operating Time", value: 87500 },
      { name: "Busy Stop Time", value: 1200 },
      { name: "Busy Availability", value: 91.5 }
    ],
    overTimeChanges: [
      { name: "Busy Operating Time", value: 45000 },
      { name: "Busy Stop Time", value: 600 }
    ],
    lowestAggregator: 60
  },

  get_kpi_summary_full_data: [
    {
      stationId: 101,
      modelId: "MODEL_X",
      overAllOEE: 82.5,
      refAvailability: 95,
      actAvailability: 91.2,
      refQuality: 98,
      actQuality: 96.4,
      refPerformance: 92,
      actPerformance: 88.7,
      quantity: 450
    },
    {
      stationId: 101,
      modelId: "MODEL_Y",
      overAllOEE: 79.3,
      refAvailability: 95,
      actAvailability: 88.5,
      refQuality: 98,
      actQuality: 94.1,
      refPerformance: 92,
      actPerformance: 85.2,
      quantity: 320
    },
    {
      stationId: 102,
      modelId: "MODEL_X",
      overAllOEE: 84.1,
      refAvailability: 94,
      actAvailability: 92.3,
      refQuality: 97,
      actQuality: 95.8,
      refPerformance: 91,
      actPerformance: 89.5,
      quantity: 520
    },
    {
      stationId: 102,
      modelId: "MODEL_Y",
      overAllOEE: 80.8,
      refAvailability: 94,
      actAvailability: 89.7,
      refQuality: 97,
      actQuality: 93.2,
      refPerformance: 91,
      actPerformance: 86.9,
      quantity: 410
    }
  ]
};

/**
 * Get mock response for a given API ID.
 * @param {string} apiId - The API identifier (e.g. 'get_oee_parameters')
 * @returns {object|array|null} Mock response data or null if not found
 */
function getMockResponse(apiId) {
  const data = MOCK_RESPONSES[apiId];
  if (!data) {
    console.warn(`[MOCK] No mock data found for API: ${apiId}. Returning empty array.`);
    return [];
  }
  console.log(`[MOCK] Returning mock data for: ${apiId}`);
  // Return deep clone to avoid mutation
  return JSON.parse(JSON.stringify(data));
}

module.exports = { getMockResponse, MOCK_RESPONSES };
