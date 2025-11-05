import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite database path
const DB_PATH = path.join(__dirname, '../../..', 'data', 'sentri.db');

// Database instance
let db: sqlite3.Database | null = null;

// Initialize database connection
export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sqlite3Verbose = sqlite3.verbose();

    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new sqlite3Verbose.Database(DB_PATH, (err: Error | null) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      
      // Enable WAL mode for better concurrency (reduces SQLITE_BUSY errors)
      db!.run('PRAGMA journal_mode = WAL;', (walErr: Error | null) => {
        if (walErr) {
          console.warn('Warning: Could not enable WAL mode:', walErr);
        } else {
          console.log('WAL mode enabled for better concurrency');
        }
        // Set busy timeout to 5 seconds (retry for 5 seconds before giving up)
        db!.configure('busyTimeout', 5000);
        createTables().then(resolve).catch(reject);
      });
    });
  });
}

// Create tables
async function createTables(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  const dbRun = (sql: string) => {
    return new Promise<void>((resolve, reject) => {
      db!.run(sql, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  // Knowledge Base table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      current_version INTEGER DEFAULT 1
    )
  `);

  // Knowledge Base Versions table - stores historical versions
  await dbRun(`
    CREATE TABLE IF NOT EXISTS knowledge_base_versions (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      changed_by TEXT,
      change_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entry_id) REFERENCES knowledge_base(id),
      UNIQUE(entry_id, version_number)
    )
  `);

  // Security Questions table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS security_questions (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Generated Answers table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS generated_answers (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      quality_score REAL, -- overall weighted score from AI judges (0-100)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES security_questions(id)
    )
  `);

  // AI Judges table - configurable evaluation judges
  await dbRun(`
    CREATE TABLE IF NOT EXISTS ai_judges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      criteria TEXT, -- short human-readable criteria
      prompt_template TEXT NOT NULL, -- template sent to LLM
      weight REAL DEFAULT 1.0, -- contribution to overall score
      active INTEGER DEFAULT 1, -- 1=true, 0=false
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Judge evaluations table - one row per (answer, judge)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS judge_evaluations (
      id TEXT PRIMARY KEY,
      answer_id TEXT NOT NULL,
      judge_id TEXT NOT NULL,
      score REAL, -- 0-100
      verdict TEXT, -- PASS/FAIL/WARNING
      reasoning TEXT,
      raw_json TEXT, -- full raw JSON response for audits
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (answer_id) REFERENCES generated_answers(id),
      FOREIGN KEY (judge_id) REFERENCES ai_judges(id)
    )
  `);

  // Indexes for performance
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_questions_category ON security_questions(category)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_answers_category ON generated_answers(category)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_answers_question_id ON generated_answers(question_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_eval_answer_id ON judge_evaluations(answer_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_eval_judge_id ON judge_evaluations(judge_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_kb_versions_entry_id ON knowledge_base_versions(entry_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_kb_versions_version ON knowledge_base_versions(entry_id, version_number)`);

  // Lightweight migrations for existing databases
  await migrateSchema();
}

// KB Entry interface
export interface KBEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  created_at?: string;
  updated_at?: string;
  current_version?: number;
}

// Knowledge Base Version interface
export interface KBVersion {
  id: string;
  entry_id: string;
  version_number: number;
  category: string;
  question: string;
  answer: string;
  changed_by?: string;
  change_reason?: string;
  created_at?: string;
}

// Security Question interface
export interface SecurityQuestion {
  id: string;
  text: string;
  category?: string;
  created_at?: string;
}

// Generated Answer interface
export interface GeneratedAnswer {
  id: string;
  question_id: string;
  question_text: string;
  answer: string;
  category?: string;
  quality_score?: number;
  created_at?: string;
}

// AI Judge configuration
export interface AIJudge {
  id: string;
  name: string;
  description?: string;
  criteria?: string;
  prompt_template: string;
  weight?: number;
  active?: number; // 1 or 0
  created_at?: string;
}

// Judge evaluation result
export interface JudgeEvaluation {
  id: string;
  answer_id: string;
  judge_id: string;
  score?: number;
  verdict?: string;
  reasoning?: string;
  raw_json?: string;
  created_at?: string;
}

// Ensure schema is up-to-date for existing databases
async function migrateSchema(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  const columnExists = async (table: string, column: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      db!.all(`PRAGMA table_info(${table})`, [], (err: Error | null, rows: any[]) => {
        if (err) return reject(err);
        const exists = rows?.some((r) => r?.name === column);
        resolve(!!exists);
      });
    });
  };

  try {
    // Add quality_score to generated_answers if missing
    const hasQuality = await columnExists('generated_answers', 'quality_score');
    if (!hasQuality) {
      await new Promise<void>((resolve, reject) => {
        db!.run('ALTER TABLE generated_answers ADD COLUMN quality_score REAL', (err: Error | null) => {
          if (err) return reject(err);
          console.log('✅ Migrated: added quality_score column to generated_answers');
          resolve();
        });
      });
    }

    // Add current_version to knowledge_base if missing
    const hasCurrentVersion = await columnExists('knowledge_base', 'current_version');
    if (!hasCurrentVersion) {
      await new Promise<void>((resolve, reject) => {
        db!.run('ALTER TABLE knowledge_base ADD COLUMN current_version INTEGER DEFAULT 1', (err: Error | null) => {
          if (err) return reject(err);
          console.log('✅ Migrated: added current_version column to knowledge_base');
          resolve();
        });
      });
    }

    // Backfill version history for existing entries without versions
    await backfillVersionHistory();
  } catch (err) {
    console.error('Schema migration error:', err);
  }
}

// Backfill version history for existing KB entries
async function backfillVersionHistory(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    // Find all KB entries that don't have any version history
    const entriesWithoutVersions = await new Promise<any[]>((resolve, reject) => {
      db!.all(
        `SELECT kb.* FROM knowledge_base kb 
         LEFT JOIN knowledge_base_versions kbv ON kb.id = kbv.entry_id 
         WHERE kbv.id IS NULL`,
        [],
        (err: Error | null, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    if (entriesWithoutVersions.length > 0) {
      console.log(`📝 Backfilling version history for ${entriesWithoutVersions.length} existing KB entries...`);
      
      for (const entry of entriesWithoutVersions) {
        // Set current_version to 1 if it's null or 0
        const currentVersion = entry.current_version || 1;
        
        if (!entry.current_version) {
          await new Promise<void>((resolve, reject) => {
            db!.run(
              'UPDATE knowledge_base SET current_version = 1 WHERE id = ?',
              [entry.id],
              (err: Error | null) => {
                if (err) return reject(err);
                resolve();
              }
            );
          });
        }

        // Create version 1 record
        const versionId = `kbv_${Date.now()}_${entry.id}_1`;
        await new Promise<void>((resolve, reject) => {
          db!.run(
            `INSERT INTO knowledge_base_versions (id, entry_id, version_number, category, question, answer, change_reason, created_at)
             VALUES (?, ?, 1, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
            [versionId, entry.id, entry.category, entry.question, entry.answer, 'Initial version', entry.created_at],
            (err: Error | null) => {
              if (err) return reject(err);
              resolve();
            }
          );
        });
      }

      console.log(`✅ Backfilled version history for ${entriesWithoutVersions.length} entries`);
    }
  } catch (err) {
    console.error('Error backfilling version history:', err);
    // Don't throw - this is a best-effort migration
  }
}

// Generic query function
export function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  if (!db) throw new Error('Database not initialized');
  return new Promise((resolve, reject) => {
    db!.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Generic run function with retry logic for SQLITE_BUSY
export function run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  if (!db) throw new Error('Database not initialized');
  return new Promise((resolve, reject) => {
    const execute = (attempt: number = 1) => {
      db!.run(sql, params, function(err: Error | null) {
        if (err) {
          // Retry on SQLITE_BUSY with exponential backoff (max 3 retries)
          if ((err as any).code === 'SQLITE_BUSY' && attempt < 3) {
            const delay = Math.min(100 * Math.pow(2, attempt - 1), 500);
            setTimeout(() => execute(attempt + 1), delay);
          } else {
            reject(err);
          }
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    };
    execute();
  });
}

// Execute a function within a transaction
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise((resolve, reject) => {
    db!.run('BEGIN TRANSACTION', (beginErr: Error | null) => {
      if (beginErr) {
        reject(beginErr);
        return;
      }

      fn()
        .then((result) => {
          db!.run('COMMIT', (commitErr: Error | null) => {
            if (commitErr) {
              db!.run('ROLLBACK', () => reject(commitErr));
            } else {
              resolve(result);
            }
          });
        })
        .catch((error) => {
          db!.run('ROLLBACK', () => reject(error));
        });
    });
  });
}

// Get a single row
export function get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  if (!db) throw new Error('Database not initialized');
  return new Promise((resolve, reject) => {
    db!.get(sql, params, (err: Error | null, row: T) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Close database connection
export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }
    db.close((err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        db = null;
        resolve();
      }
    });
  });
}