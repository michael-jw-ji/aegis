import express from 'express';
import { query, run, get } from '../db/database';
import type { SecurityQuestion } from '../db/database';
import { assignCategoryFromKB } from '../agent/workflow';

const router = express.Router();

// Get all security questions
router.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    
    let sql = "SELECT * FROM security_questions ORDER BY created_at DESC";
    const params: any[] = [];

    if (category) {
      sql = "SELECT * FROM security_questions WHERE category = ? ORDER BY created_at DESC";
      params.push(category);
    }

    const questions = await query<SecurityQuestion>(sql, params);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Get question by ID
router.get('/:id', async (req, res) => {
  try {
    const question = await get<SecurityQuestion>(
      "SELECT * FROM security_questions WHERE id = ?",
      [req.params.id]
    );
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(question);
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// Create security question
router.post('/', async (req, res) => {
  try {
    const { id, text, category } = req.body;

    if (!id || !text) {
      return res.status(400).json({ error: 'Missing required fields (id, text)' });
    }

    // Auto-assign category if not provided and KB has entries
    let finalCategory = category;
    if (!finalCategory) {
      finalCategory = await assignCategoryFromKB(text);
    }

    await run(
      `INSERT INTO security_questions (id, text, category, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, text, finalCategory || null]
    );

    const newQuestion = await get<SecurityQuestion>(
      "SELECT * FROM security_questions WHERE id = ?",
      [id]
    );

    res.status(201).json(newQuestion);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Question with this ID already exists' });
    }
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// Bulk upload questions from JSON
router.post('/upload', async (req, res) => {
  try {
    const questions: SecurityQuestion[] = req.body;

    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Expected an array of questions' });
    }

    const results = [];
    const errors = [];

    for (const question of questions) {
      try {
        const { id, text, category } = question;

        if (!id || !text) {
          errors.push({ question, error: 'Missing required fields (id, text)' });
          continue;
        }

        // Auto-assign category if not provided and KB has entries
        let finalCategory = category;
        if (!finalCategory) {
          finalCategory = (await assignCategoryFromKB(text)) || undefined;
        }

        await run(
          `INSERT OR REPLACE INTO security_questions (id, text, category, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [id, text, finalCategory || null]
        );

        results.push(id);
      } catch (error: any) {
        errors.push({ question, error: error.message });
      }
    }

    res.json({
      success: true,
      uploaded: results.length,
      failed: errors.length,
      errors,
    });
  } catch (error) {
    console.error('Error uploading questions:', error);
    res.status(500).json({ error: 'Failed to upload questions' });
  }
});

// Update question
router.put('/:id', async (req, res) => {
  try {
    const { text, category } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing required field (text)' });
    }

    // Auto-assign category if not provided and KB has entries
    let finalCategory = category;
    if (!finalCategory) {
      finalCategory = await assignCategoryFromKB(text);
    }

    await run(
      `UPDATE security_questions 
       SET text = ?, category = ?
       WHERE id = ?`,
      [text, finalCategory || null, req.params.id]
    );

    const updatedQuestion = await get<SecurityQuestion>(
      "SELECT * FROM security_questions WHERE id = ?",
      [req.params.id]
    );

    if (!updatedQuestion) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(updatedQuestion);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
router.delete('/:id', async (req, res) => {
  try {
    const result = await run(
      "DELETE FROM security_questions WHERE id = ?",
      [req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

export default router;

