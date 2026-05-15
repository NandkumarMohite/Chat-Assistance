// ─────────────────────────────────────────────
// routes/analyze.js — POST /api/analyze-data
// Analyzes already-fetched data with follow-up questions
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { callOllama } = require('../core/ollama');

const ANALYZE_PROMPT = `You are a Manufacturing Execution System (MES) data analyst. The user has already received data from an API and now wants to ask a follow-up question about that data.

STRICT RULES:
1. ONLY use values that exist in the provided JSON data — never invent numbers
2. Answer ONLY what the user asked — no extra information
3. Use markdown tables when comparing multiple entries
4. For max/min/best/worst: scan ALL entries, find the correct field, report the winner clearly
5. Show exact values from the data
6. Keep answers short, precise, factory-floor friendly

FIELD DETECTION:
- "OEE" → look for: overAllOEE, oee, oeeValue, busyOee
- "quality" → look for: actQuality, overallQuality, quality
- "availability" → look for: actAvailability, overallAvailability, availablity, availability, percentage
- "performance" → look for: actPerformance, overallPerformance, performance
- "cycle time" → look for: avgCycleTime, duration, refCycleTime, plantAverageCycleTime
- "production"/"quantity" → look for: quantity, totalCycles, nCycles, ok_cycles

COMPARISON LOGIC:
- "worst OEE" / "min OEE" = LOWEST OEE value
- "best OEE" / "max OEE" = HIGHEST OEE value  
- "worst cycle time" = LONGEST (highest number)
- "best cycle time" = SHORTEST (lowest number)

FORMAT:
- Single answer: Direct statement with the value
- Multiple items: Markdown table ranked from best to worst (or as requested)
- Always mention which station/model/line the value belongs to

Do NOT add: explanations of what OEE is, tips to improve, general manufacturing advice.`;

router.post('/', async (req, res) => {
  const { question, data } = req.body;

  if (!question || !data) {
    return res.status(400).json({ error: 'Both question and data are required' });
  }

  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Data must be a non-empty array' });
  }

  console.log(`[ANALYZE] Question: "${question}" | Data: ${data.length} rows`);

  try {
    const userPrompt = `DATA (${data.length} entries):
${JSON.stringify(data, null, 2)}

USER QUESTION: ${question}

Analyze the data above and answer the question precisely.`;

    const response = await callOllama(ANALYZE_PROMPT, userPrompt);
    const answer = response.content || 'No analysis result.';

    // Clean thinking tags if present
    const cleanAnswer = answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    res.json({
      success: true,
      answer: cleanAnswer
    });

  } catch (error) {
    console.error('[ANALYZE] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
