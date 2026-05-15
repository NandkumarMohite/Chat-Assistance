// ─────────────────────────────────────────────
// routes/chart.js — POST /api/chart-config
// Uses Qwen LLM to recommend chart type, then builds config programmatically
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { callOllama } = require('../core/ollama');

// Simple prompt - just ask for chart type recommendation
const CHART_PROMPT = `You are a data visualization expert. Analyze the data fields and recommend the best chart type.

ALLOWED CHART TYPES (choose ONLY one):
- bar: For comparing values across categories
- stackedBar: For comparing parts of a whole across categories
- line: For time series or trend data
- scatter: For showing correlation between two numeric variables
- histogram: For showing distribution/frequency of a single numeric variable
- radar: For comparing multiple metrics across categories (spider chart)
- pie: For showing parts of a whole (proportions)
- doughnut: Same as pie but with center hole

RESPONSE FORMAT - Return ONLY this, nothing else:
chartType: <type>
labelField: <field name for labels/x-axis>
valueFields: <comma separated numeric field names>
reasoning: <one sentence explanation>

RULES:
- Choose "bar" for comparing values across categories
- Choose "stackedBar" for OEE metrics (oee, availability, performance, quality) to show composition
- Choose "line" for time-based data with timestamps or dates
- Choose "scatter" when comparing two numeric fields for correlation
- Choose "histogram" for frequency distribution of a single metric
- Choose "radar" for multi-dimensional comparison (3+ metrics per item)
- Choose "pie" or "doughnut" for distribution/percentage data with few categories
- Choose "bar" as default if unsure`;

// Color palette for charts
const COLORS = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

router.post('/', async (req, res) => {
  const { data, preferredType } = req.body;

  if (!data || !Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Data array is required' });
  }

  console.log(`[CHART-CONFIG] Analyzing ${data.length} rows for chart generation`);

  try {
    const dataFields = Object.keys(data[0]);
    const sampleRow = data[0];
    
    // Identify field types
    const numericFields = dataFields.filter(f => typeof sampleRow[f] === 'number');
    const stringFields = dataFields.filter(f => typeof sampleRow[f] === 'string');
    
    const userPrompt = `Analyze this data structure and recommend a chart type:

DATA FIELDS: ${dataFields.join(', ')}
NUMERIC FIELDS: ${numericFields.join(', ') || 'none'}
STRING FIELDS: ${stringFields.join(', ') || 'none'}
ROW COUNT: ${data.length}
SAMPLE ROW: ${JSON.stringify(sampleRow)}

Which chart type is best for visualizing this data?`;

    const response = await callOllama(CHART_PROMPT, userPrompt);
    const content = response.content || '';
    
    // Parse simple response format
    const chartTypeMatch = content.match(/chartType:\s*(bar|stackedBar|line|scatter|histogram|radar|pie|doughnut)/i);
    const labelFieldMatch = content.match(/labelField:\s*(\w+)/i);
    const valueFieldsMatch = content.match(/valueFields:\s*([^\n]+)/i);
    const reasoningMatch = content.match(/reasoning:\s*([^\n]+)/i);
    
    const recommendedType = chartTypeMatch ? chartTypeMatch[1] : 'bar';
    const labelField = labelFieldMatch ? labelFieldMatch[1] : stringFields[0] || dataFields[0];
    const valueFieldsStr = valueFieldsMatch ? valueFieldsMatch[1] : numericFields.join(', ');
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'Default chart type selected based on data structure.';
    
    // Parse value fields
    let valueFields = valueFieldsStr.split(',').map(f => f.trim()).filter(f => numericFields.includes(f));
    if (valueFields.length === 0) valueFields = numericFields.slice(0, 4); // Take first 4 numeric fields
    
    // Use preferred type if specified, otherwise use AI recommendation
    const chartType = preferredType || recommendedType;
    
    // Build chart config programmatically
    const config = buildChartConfig(data, chartType, labelField, valueFields, reasoning);
    
    console.log(`[CHART-CONFIG] Recommended: ${recommendedType}, Using: ${chartType}, Label: ${labelField}, Values: ${valueFields.join(', ')}`);
    
    res.json({
      success: true,
      config: config,
      rowCount: data.length
    });

  } catch (error) {
    console.error('[CHART-CONFIG] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function buildChartConfig(data, chartType, labelField, valueFields, reasoning) {
  // Extract labels from data
  const labels = data.map((row, idx) => {
    const val = row[labelField];
    if (val === undefined || val === null) return `Item ${idx + 1}`;
    if (typeof val === 'string') return val.length > 20 ? val.slice(0, 20) + '...' : val;
    return String(val);
  });
  
  // Handle special chart types
  
  // SCATTER: needs x,y point pairs
  if (chartType === 'scatter') {
    const xField = valueFields[0] || labelField;
    const yField = valueFields[1] || valueFields[0];
    
    const scatterData = data.map(row => ({
      x: typeof row[xField] === 'number' ? row[xField] : 0,
      y: typeof row[yField] === 'number' ? row[yField] : 0
    }));
    
    return {
      chartType: 'scatter',
      title: `${formatFieldName(yField)} vs ${formatFieldName(xField)}`,
      datasets: [{
        label: `${formatFieldName(xField)} / ${formatFieldName(yField)}`,
        data: scatterData,
        backgroundColor: COLORS[0],
        borderColor: COLORS[0],
        pointRadius: 5
      }],
      xAxisLabel: formatFieldName(xField),
      yAxisLabel: formatFieldName(yField),
      reasoning
    };
  }
  
  // HISTOGRAM: bins numeric data into frequency distribution
  if (chartType === 'histogram') {
    const field = valueFields[0];
    const values = data.map(row => typeof row[field] === 'number' ? row[field] : 0).filter(v => v !== 0);
    
    // Create bins
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(10, Math.ceil(Math.sqrt(values.length)));
    const binSize = (max - min) / binCount || 1;
    
    const bins = Array(binCount).fill(0);
    const binLabels = [];
    
    for (let i = 0; i < binCount; i++) {
      const binStart = min + (i * binSize);
      const binEnd = min + ((i + 1) * binSize);
      binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
    }
    
    values.forEach(v => {
      const binIndex = Math.min(Math.floor((v - min) / binSize), binCount - 1);
      bins[binIndex]++;
    });
    
    return {
      chartType: 'bar', // Histogram is rendered as bar
      isHistogram: true,
      title: `Distribution of ${formatFieldName(field)}`,
      labels: binLabels,
      datasets: [{
        label: 'Frequency',
        data: bins,
        backgroundColor: COLORS[0],
        borderColor: COLORS[0],
        borderWidth: 1
      }],
      xAxisLabel: formatFieldName(field),
      yAxisLabel: 'Frequency',
      reasoning
    };
  }
  
  // RADAR: multiple metrics per item (spider chart)
  if (chartType === 'radar') {
    // For radar, labels are the metrics and each data row is a dataset
    const radarLabels = valueFields.map(formatFieldName);
    const radarDatasets = data.slice(0, 5).map((row, i) => { // Limit to 5 items
      const rowLabel = row[labelField] || `Item ${i + 1}`;
      return {
        label: typeof rowLabel === 'string' ? rowLabel : String(rowLabel),
        data: valueFields.map(f => typeof row[f] === 'number' ? row[f] : 0),
        backgroundColor: COLORS[i % COLORS.length] + '40', // 25% opacity
        borderColor: COLORS[i % COLORS.length],
        borderWidth: 2,
        pointBackgroundColor: COLORS[i % COLORS.length]
      };
    });
    
    return {
      chartType: 'radar',
      title: `Comparison of ${valueFields.map(formatFieldName).join(', ')}`,
      labels: radarLabels,
      datasets: radarDatasets,
      reasoning
    };
  }
  
  // STACKED BAR
  if (chartType === 'stackedBar') {
    const datasets = valueFields.map((field, i) => {
      const values = data.map(row => typeof row[field] === 'number' ? row[field] : 0);
      return {
        label: formatFieldName(field),
        data: values,
        backgroundColor: COLORS[i % COLORS.length],
        borderColor: COLORS[i % COLORS.length],
        borderWidth: 1
      };
    });
    
    return {
      chartType: 'bar',
      isStacked: true,
      title: `Stacked: ${valueFields.map(formatFieldName).join(', ')}`,
      labels,
      datasets,
      xAxisLabel: formatFieldName(labelField),
      yAxisLabel: 'Value',
      reasoning
    };
  }
  
  // Standard datasets for bar, line, pie, doughnut
  const datasets = valueFields.map((field, i) => {
    const values = data.map(row => {
      const v = row[field];
      return typeof v === 'number' ? v : 0;
    });
    
    const color = COLORS[i % COLORS.length];
    
    return {
      label: formatFieldName(field),
      data: values,
      backgroundColor: (chartType === 'pie' || chartType === 'doughnut') 
        ? values.map((_, idx) => COLORS[idx % COLORS.length])
        : color,
      borderColor: color,
      borderWidth: chartType === 'line' ? 2 : 1
    };
  });
  
  // For pie/doughnut with multiple value fields, aggregate into single dataset
  if ((chartType === 'pie' || chartType === 'doughnut') && valueFields.length > 1) {
    // Sum each value field across all rows
    const aggregatedData = valueFields.map(field => 
      data.reduce((sum, row) => sum + (typeof row[field] === 'number' ? row[field] : 0), 0)
    );
    
    return {
      chartType,
      title: `Distribution of ${valueFields.map(formatFieldName).join(', ')}`,
      labels: valueFields.map(formatFieldName),
      datasets: [{
        label: 'Values',
        data: aggregatedData,
        backgroundColor: valueFields.map((_, i) => COLORS[i % COLORS.length])
      }],
      reasoning
    };
  }
  
  return {
    chartType,
    title: valueFields.length === 1 
      ? `${formatFieldName(valueFields[0])} by ${formatFieldName(labelField)}`
      : `Comparison of ${valueFields.map(formatFieldName).join(', ')}`,
    labels,
    datasets,
    xAxisLabel: formatFieldName(labelField),
    yAxisLabel: valueFields.length === 1 ? formatFieldName(valueFields[0]) : 'Value',
    reasoning
  };
}

function formatFieldName(field) {
  // Convert camelCase or snake_case to Title Case
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

module.exports = router;
