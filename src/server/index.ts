import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase, query, run } from './db/database';
import type { AIJudge } from './db/database';
import knowledgeBaseRoutes from './routes/knowledgeBase';
import questionsRoutes from './routes/questions';
import answersRoutes from './routes/answers';
import judgesRoutes from './routes/judges';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/answers', answersRoutes);
app.use('/api/judges', judgesRoutes);

// Health check
app.get('/', (_req, res) => {
  res.json({ message: 'Aegis Questionnaire System API', status: 'running' });
});

export interface SecurityQuestion {
  id: string;
  text: string;
  category?: string;
}

// Seed default judges if none exist
async function ensureDefaultJudges() {
  try {
    // Update risk judge name if it has the old name
    const riskJudge = await query<{ id: string; name: string }>('SELECT id, name FROM ai_judges WHERE id = ?', ['risk']);
    if (riskJudge.length > 0 && riskJudge[0].name === 'Risk Appropriateness Judge') {
      console.log('Updating Risk Appropriateness Judge to Risk Judge...');
      await run('UPDATE ai_judges SET name = ? WHERE id = ?', ['Risk Judge', 'risk']);
      console.log('✅ Updated judge name');
    }

    const existing = await query<{ count: number }>('SELECT COUNT(1) as count FROM ai_judges');
    const hasAny = (existing as any)[0]?.count > 0;
    if (hasAny) {
      console.log('Default judges already exist, skipping seed');
      return;
    }

    console.log('Seeding default AI judges...');
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

    console.log(`✅ Seeded ${defaults.length} default judges`);
  } catch (error) {
    console.error('Failed to seed default judges:', error);
    // Don't fail startup if seeding fails
  }
}

// Initialize database and start server
async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');
    
    // Automatically seed default judges if none exist
    await ensureDefaultJudges();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`Using Ollama LLM - make sure Ollama is running at http://localhost:11434`);
      console.log(`Model: ${process.env.OLLAMA_MODEL || 'llama3.2'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();