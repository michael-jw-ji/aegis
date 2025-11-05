import express from 'express';
import { query, run, get } from '../db/database';
import type { AIJudge } from '../db/database';

const router = express.Router();

// List all judges
router.get('/', async (_req, res) => {
  try {
    const judges = await query<AIJudge>(
      'SELECT * FROM ai_judges ORDER BY name ASC'
    );
    res.json(judges);
  } catch (error) {
    console.error('Error fetching judges:', error);
    res.status(500).json({ error: 'Failed to fetch judges' });
  }
});

// Create judge
router.post('/', async (req, res) => {
  try {
    const { id, name, description, criteria, prompt_template, weight = 1.0, active = 1 } = req.body as Partial<AIJudge> & { id: string };

    if (!id || !name || !prompt_template) {
      return res.status(400).json({ error: 'id, name, and prompt_template are required' });
    }

    await run(
      `INSERT INTO ai_judges (id, name, description, criteria, prompt_template, weight, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, name, description || null, criteria || null, prompt_template, weight, active ? 1 : 0]
    );

    const created = await get<AIJudge>('SELECT * FROM ai_judges WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Judge with this ID already exists' });
    }
    console.error('Error creating judge:', error);
    res.status(500).json({ error: 'Failed to create judge' });
  }
});

// Update judge
router.put('/:id', async (req, res) => {
  try {
    const { name, description, criteria, prompt_template, weight, active } = req.body as Partial<AIJudge>;
    const id = req.params.id;

    // Build dynamic update
    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (criteria !== undefined) { fields.push('criteria = ?'); params.push(criteria); }
    if (prompt_template !== undefined) { fields.push('prompt_template = ?'); params.push(prompt_template); }
    if (weight !== undefined) { fields.push('weight = ?'); params.push(weight); }
    if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    await run(`UPDATE ai_judges SET ${fields.join(', ')} WHERE id = ?`, params);

    const updated = await get<AIJudge>('SELECT * FROM ai_judges WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('Error updating judge:', error);
    res.status(500).json({ error: 'Failed to update judge' });
  }
});

// Delete judge
router.delete('/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM ai_judges WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Judge not found' });
    }
    res.json({ message: 'Judge deleted successfully' });
  } catch (error) {
    console.error('Error deleting judge:', error);
    res.status(500).json({ error: 'Failed to delete judge' });
  }
});

// Seed default judges if none exist
router.post('/seed-defaults', async (_req, res) => {
  try {
    // Update risk judge name if it has the old name
    const riskJudge = await query<{ id: string; name: string }>('SELECT id, name FROM ai_judges WHERE id = ?', ['risk']);
    if (riskJudge.length > 0 && riskJudge[0].name === 'Risk Appropriateness Judge') {
      await run('UPDATE ai_judges SET name = ? WHERE id = ?', ['Risk Judge', 'risk']);
    }

    const existing = await query<AIJudge>('SELECT COUNT(1) as count FROM ai_judges');
    const hasAny = (existing as any)[0]?.count > 0;
    if (hasAny) {
      return res.json({ message: 'Judges already exist' });
    }

    const defaults: Array<AIJudge> = [
      {
        id: 'accuracy',
        name: 'Accuracy Judge',
        description: 'Checks factual alignment with KB context only',
        criteria: 'No hallucinations; cites only provided context',
        prompt_template:
          'You are an impartial evaluator. Given the QUESTION, KB_CONTEXT, and ANSWER, return strict JSON {"score":0-100,"verdict":"PASS|FAIL|WARNING","reasoning":"..."}. Evaluate factual accuracy strictly based on KB_CONTEXT.',
        weight: 0.5,
        active: 1,
      },
      {
        id: 'completeness',
        name: 'Completeness Judge',
        description: 'Assesses whether all parts of the question are addressed',
        criteria: 'Covers scope; clear and actionable',
        prompt_template:
          'Evaluate completeness of ANSWER with respect to QUESTION using KB_CONTEXT. Return {"score":0-100,"verdict":"PASS|FAIL|WARNING","reasoning":"..."}.',
        weight: 0.3,
        active: 1,
      },
              {
          id: 'risk',
          name: 'Risk Judge',
          description: 'Checks security risk posture and tone',
        criteria: 'Conservative, compliant, no overpromising',
        prompt_template:
          'Evaluate risk appropriateness of ANSWER for a security questionnaire. Return {"score":0-100,"verdict":"PASS|FAIL|WARNING","reasoning":"..."}.',
        weight: 0.2,
        active: 1,
      },
    ];

    for (const j of defaults) {
      await run(
        `INSERT INTO ai_judges (id, name, description, criteria, prompt_template, weight, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [j.id, j.name, j.description || null, j.criteria || null, j.prompt_template, j.weight || 1.0, j.active ? 1 : 0]
      );
    }

    const all = await query<AIJudge>('SELECT * FROM ai_judges ORDER BY name ASC');
    res.json({ message: 'Seeded default judges', judges: all });
  } catch (error) {
    console.error('Error seeding default judges:', error);
    res.status(500).json({ error: 'Failed to seed default judges' });
  }
});

export default router;


