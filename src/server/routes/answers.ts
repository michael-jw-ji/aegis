import express from 'express';
import { query, run } from '../db/database';
import type { GeneratedAnswer } from '../db/database';
import { generateAnswer, generateAnswersForAll, evaluateAnswerWithJudges, saveJudgeEvaluations } from '../agent/workflow';
import type { JudgeEvaluation } from '../db/database';

const router = express.Router();

// Get all generated answers
router.get('/', async (req, res) => {
  try {
    const categories = req.query.categories;
    let sql = "SELECT * FROM generated_answers ORDER BY created_at DESC";
    const params: any[] = [];

    if (categories) {
      const categoryList = Array.isArray(categories) ? categories : [categories];
      const placeholders = categoryList.map(() => '?').join(',');
      sql = `SELECT * FROM generated_answers WHERE category IN (${placeholders}) ORDER BY created_at DESC`;
      params.push(...categoryList);
    }

    const answers = await query<GeneratedAnswer>(sql, params);
    res.json(answers);
  } catch (error) {
    console.error('Error fetching answers:', error);
    res.status(500).json({ error: 'Failed to fetch answers' });
  }
});

// Get answer by ID
router.get('/:id', async (req, res) => {
  try {
    const answers = await query<GeneratedAnswer>(
      "SELECT * FROM generated_answers WHERE id = ?",
      [req.params.id]
    );
    if (answers.length === 0) {
      return res.status(404).json({ error: 'Answer not found' });
    }
    res.json(answers[0]);
  } catch (error) {
    console.error('Error fetching answer:', error);
    res.status(500).json({ error: 'Failed to fetch answer' });
  }
});

// Generate answer for a single question
router.post('/generate/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;
    
    // Get question details
    const questions = await query<{ id: string; text: string; category?: string }>(
      "SELECT id, text, category FROM security_questions WHERE id = ?",
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questions[0];

    // Check if answer already exists
    const existingAnswers = await query<{ id: string }>(
      "SELECT id FROM generated_answers WHERE question_id = ?",
      [questionId]
    );

    if (existingAnswers.length > 0) {
      const existing = await query<GeneratedAnswer>(
        "SELECT * FROM generated_answers WHERE question_id = ?",
        [questionId]
      );
      return res.json({ message: 'Answer already exists', answer: existing[0] });
    }

    // Generate answer using LangGraph workflow (includes evaluation node)
    const result = await generateAnswer(question.id, question.text);

    // Save generated answer
    const answerId = `answer_${Date.now()}_${question.id}`;
      await run(
        `INSERT INTO generated_answers (id, question_id, question_text, answer, category, quality_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [answerId, question.id, question.text, result.answer, question.category || null, result.quality_score || null]
      );

    // Save judge evaluations from workflow result
    if (result.judge_evaluations && result.judge_evaluations.length > 0) {
      try {
        console.log(`[Answer Generation] Saving ${result.judge_evaluations.length} judge evaluations for answer ${answerId}`);
        await saveJudgeEvaluations(answerId, result.judge_evaluations);
        console.log(`[Answer Generation] Judge evaluations saved for answer ${answerId}`);
      } catch (evalErr: any) {
        console.error(`[Answer Generation] Failed to save judge evaluations for answer ${answerId}:`, evalErr);
        // Don't fail the entire request if saving evaluations fails
      }
    }

    const savedAnswer = await query<GeneratedAnswer>(
      "SELECT * FROM generated_answers WHERE id = ?",
      [answerId]
    );

    res.json(savedAnswer[0]);
  } catch (error) {
    console.error('Error generating answer:', error);
    res.status(500).json({ error: 'Failed to generate answer', details: String(error) });
  }
});

// Generate answers for all questions
router.post('/generate-all', async (req, res) => {
  try {
    await generateAnswersForAll();
    res.json({ message: 'Answers generated for all questions' });
  } catch (error) {
    console.error('Error generating answers:', error);
    res.status(500).json({ error: 'Failed to generate answers', details: String(error) });
  }
});

// Delete all answers
router.delete("/", async (req, res) => {
  try {
    await run("DELETE FROM generated_answers");
    res.status(200).json({ message: "All answers removed successfully" });
  } catch (error) {
    console.error("Error removing answers:", error);
    res.status(500).json({ error: "Failed to remove answers" });
  }
});

// Delete single answer by ID
router.delete("/:id", async (req, res) => {
  try {
    const result = await run(
      "DELETE FROM generated_answers WHERE id = ?",
      [req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    res.json({ message: 'Answer deleted successfully' });
  } catch (error) {
    console.error('Error deleting answer:', error);
    res.status(500).json({ error: 'Failed to delete answer' });
  }
});

export default router;

// Additional evaluation endpoints
// Get judge evaluations for an answer
router.get('/:id/evaluations', async (req, res) => {
  try {
    const evaluations = await query<JudgeEvaluation>(
      `SELECT * FROM judge_evaluations WHERE answer_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(evaluations);
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    res.status(500).json({ error: 'Failed to fetch evaluations' });
  }
});

// Get analytics/compliance metrics
router.get('/analytics/summary', async (req, res) => {
  try {
    // Get all answers
    const answers = await query<GeneratedAnswer>('SELECT * FROM generated_answers');
    
    // Get all evaluations
    const evaluations = await query<JudgeEvaluation>(
      `SELECT * FROM judge_evaluations`
    );
    
    // Get all judges to identify them
    const judges = await query<{ id: string; name: string }>(
      `SELECT id, name FROM ai_judges WHERE active = 1`
    );
    
    const totalAnswers = answers.length;
    const totalEvaluations = evaluations.length;
    
    // Calculate pass rates per judge
    const judgeStats: Record<string, {
      name: string;
      total: number;
      pass: number;
      fail: number;
      warning: number;
      avgScore: number;
      passRate: number;
    }> = {};
    
    // Initialize judge stats
    judges.forEach(judge => {
      judgeStats[judge.id] = {
        name: judge.name,
        total: 0,
        pass: 0,
        fail: 0,
        warning: 0,
        avgScore: 0,
        passRate: 0,
      };
    });
    
    // Aggregate evaluation data
    let totalScoreSum = 0;
    evaluations.forEach(evaluation => {
      const judgeId = evaluation.judge_id;
      if (judgeStats[judgeId]) {
        judgeStats[judgeId].total++;
        const score = evaluation.score ?? 0;
        totalScoreSum += score;
        judgeStats[judgeId].avgScore += score;
        
        const verdict = (evaluation.verdict || '').toUpperCase();
        if (verdict === 'PASS') {
          judgeStats[judgeId].pass++;
        } else if (verdict === 'FAIL') {
          judgeStats[judgeId].fail++;
        } else if (verdict === 'WARNING') {
          judgeStats[judgeId].warning++;
        }
      }
    });
    
    // Calculate averages and pass rates
    Object.keys(judgeStats).forEach(judgeId => {
      const stats = judgeStats[judgeId];
      if (stats.total > 0) {
        stats.avgScore = Math.round((stats.avgScore / stats.total) * 100) / 100;
        stats.passRate = Math.round((stats.pass / stats.total) * 10000) / 100;
      }
    });
    
    // Overall compliance metrics
    const overallAvgScore = totalEvaluations > 0 
      ? Math.round((totalScoreSum / totalEvaluations) * 100) / 100 
      : 0;
    
    // Overall pass rate (percentage of all evaluations that passed)
    const overallPassCount = evaluations.filter(e => 
      (e.verdict || '').toUpperCase() === 'PASS'
    ).length;
    const overallPassRate = totalEvaluations > 0
      ? Math.round((overallPassCount / totalEvaluations) * 10000) / 100
      : 0;
    
    // Verdict distribution
    const verdictDistribution = {
      pass: evaluations.filter(e => (e.verdict || '').toUpperCase() === 'PASS').length,
      warning: evaluations.filter(e => (e.verdict || '').toUpperCase() === 'WARNING').length,
      fail: evaluations.filter(e => (e.verdict || '').toUpperCase() === 'FAIL').length,
    };
    
    // Quality score distribution
    const qualityScores = answers
      .filter(a => typeof a.quality_score === 'number')
      .map(a => a.quality_score as number);
    const avgQualityScore = qualityScores.length > 0
      ? Math.round((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100) / 100
      : 0;

    // Time series data: group evaluations by date
    const timeSeriesData: Record<string, { date: string; passRate: number; avgScore: number; count: number }> = {};
    
    // Get evaluations with their dates (join with generated_answers to get created_at)
    // SQLite uses strftime for explicit date formatting
    let evaluationsWithDates: any[] = [];
    try {
      evaluationsWithDates = await query<{ date: string; verdict: string; score: number }>(
        `SELECT 
          strftime('%Y-%m-%d', ga.created_at) as date,
          je.verdict,
          je.score
        FROM judge_evaluations je
        INNER JOIN generated_answers ga ON je.answer_id = ga.id
        WHERE ga.created_at IS NOT NULL
        ORDER BY date ASC`
      );
      console.log(`[Analytics] Found ${evaluationsWithDates.length} evaluations with dates for time series`);
      if (evaluationsWithDates.length > 0) {
        console.log(`[Analytics] Sample date:`, evaluationsWithDates[0].date);
      }
    } catch (err) {
      console.error('[Analytics] Error fetching time series data:', err);
      // Continue with empty array if query fails
    }

    evaluationsWithDates.forEach((evaluation: any) => {
      const date = evaluation.date;
      if (!date) return; // Skip if date is null/undefined
      
      if (!timeSeriesData[date]) {
        timeSeriesData[date] = {
          date,
          passRate: 0,
          avgScore: 0,
          count: 0,
        };
      }
      
      const entry = timeSeriesData[date];
      entry.count++;
      entry.avgScore += evaluation.score || 0;
      
      if ((evaluation.verdict || '').toUpperCase() === 'PASS') {
        entry.passRate += 1;
      }
    });

    // Calculate percentages for each date
    const timeSeries = Object.values(timeSeriesData).map(entry => ({
      date: entry.date,
      passRate: entry.count > 0 ? Math.round((entry.passRate / entry.count) * 10000) / 100 : 0,
      avgScore: entry.count > 0 ? Math.round((entry.avgScore / entry.count) * 100) / 100 : 0,
      count: entry.count,
    }));
    
    console.log(`[Analytics] Generated time series with ${timeSeries.length} data points`);
    
    res.json({
      totalAnswers,
      totalEvaluations,
      overallAvgScore,
      overallPassRate,
      avgQualityScore,
      verdictDistribution,
      judgeStats: Object.values(judgeStats),
      timeSeries,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Re-evaluate an existing answer
router.post('/:id/reevaluate', async (req, res) => {
  try {
    const answer = (await query<GeneratedAnswer>('SELECT * FROM generated_answers WHERE id = ?', [req.params.id]))[0];
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    // Minimal context: use top KB entries (simple approach)
    const kbEntries = await query<any>('SELECT * FROM knowledge_base LIMIT 5');

    const { evaluations, qualityScore } = await evaluateAnswerWithJudges(
      req.params.id,
      answer.question_text,
      answer.answer,
      kbEntries as any
    );

    const updated = (await query<GeneratedAnswer>('SELECT * FROM generated_answers WHERE id = ?', [req.params.id]))[0];
    res.json({ answer: updated, evaluations, qualityScore });
  } catch (error) {
    console.error('Error re-evaluating answer:', error);
    res.status(500).json({ error: 'Failed to re-evaluate answer' });
  }
});

