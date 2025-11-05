import express from 'express';
import { query, run, get } from '../db/database';
import type { KBEntry, KBVersion } from '../db/database';

const router = express.Router();

// Get all KB entries
router.get('/', async (_req, res) => {
  try {
    const entries = await query<KBEntry>(
      "SELECT * FROM knowledge_base ORDER BY created_at DESC"
    );
    res.json(entries);
  } catch (error) {
    console.error('Error fetching KB entries:', error);
    res.status(500).json({ error: 'Failed to fetch KB entries' });
  }
});

// Get KB entry by ID
router.get('/:id', async (req, res) => {
  try {
    const entry = await get<KBEntry>(
      "SELECT * FROM knowledge_base WHERE id = ?",
      [req.params.id]
    );
    if (!entry) {
      return res.status(404).json({ error: 'KB entry not found' });
    }
    res.json(entry);
  } catch (error) {
    console.error('Error fetching KB entry:', error);
    res.status(500).json({ error: 'Failed to fetch KB entry' });
  }
});

// Create KB entry
router.post('/', async (req, res) => {
  try {
    const { id, category, question, answer, change_reason } = req.body;

    if (!id || !category || !question || !answer) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert new entry with version 1
    await run(
      `INSERT INTO knowledge_base (id, category, question, answer, created_at, updated_at, current_version)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [id, category, question, answer]
    );

    // Create initial version record
    const versionId = `kbv_${Date.now()}_${id}_1`;
    await run(
      `INSERT INTO knowledge_base_versions (id, entry_id, version_number, category, question, answer, change_reason, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [versionId, id, category, question, answer, change_reason || 'Initial version']
    );

    const newEntry = await get<KBEntry>(
      "SELECT * FROM knowledge_base WHERE id = ?",
      [id]
    );

    res.status(201).json(newEntry);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'KB entry with this ID already exists' });
    }
    console.error('Error creating KB entry:', error);
    res.status(500).json({ error: 'Failed to create KB entry' });
  }
});

// Update KB entry - creates a new version automatically
router.put('/:id', async (req, res) => {
  try {
    const { category, question, answer, change_reason } = req.body;

    if (!category || !question || !answer) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get current entry to check if it exists and get current version
    const currentEntry = await get<KBEntry>(
      "SELECT * FROM knowledge_base WHERE id = ?",
      [req.params.id]
    );

    if (!currentEntry) {
      return res.status(404).json({ error: 'KB entry not found' });
    }

    // Check if anything actually changed
    const hasChanged = 
      currentEntry.category !== category ||
      currentEntry.question !== question ||
      currentEntry.answer !== answer;

    if (!hasChanged) {
      // No changes, just return current entry
      return res.json(currentEntry);
    }

    // Get next version number
    const currentVersion = (currentEntry as any).current_version || 1;
    const nextVersion = currentVersion + 1;

    // Update the main entry
    await run(
      `UPDATE knowledge_base 
       SET category = ?, question = ?, answer = ?, updated_at = CURRENT_TIMESTAMP, current_version = ?
       WHERE id = ?`,
      [category, question, answer, nextVersion, req.params.id]
    );

    // Create new version record
    const versionId = `kbv_${Date.now()}_${req.params.id}_${nextVersion}`;
    await run(
      `INSERT INTO knowledge_base_versions (id, entry_id, version_number, category, question, answer, change_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [versionId, req.params.id, nextVersion, category, question, answer, change_reason || null]
    );

    const updatedEntry = await get<KBEntry>(
      "SELECT * FROM knowledge_base WHERE id = ?",
      [req.params.id]
    );

    res.json(updatedEntry);
  } catch (error) {
    console.error('Error updating KB entry:', error);
    res.status(500).json({ error: 'Failed to update KB entry' });
  }
});

// Delete all KB entries
router.delete('/', async (req, res) => {
  try {
    await run("DELETE FROM knowledge_base");
    res.status(200).json({ message: "All KB entries removed successfully" });
  } catch (error) {
    console.error("Error removing KB entries:", error);
    res.status(500).json({ error: "Failed to remove KB entries" });
  }
});

// Delete KB entry
router.delete('/:id', async (req, res) => {
  try {
    const result = await run(
      "DELETE FROM knowledge_base WHERE id = ?",
      [req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'KB entry not found' });
    }

    res.json({ message: 'KB entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting KB entry:', error);
    res.status(500).json({ error: 'Failed to delete KB entry' });
  }
});

// Bulk upload KB entries from JSON
router.post('/upload', async (req, res) => {
  try {
    const entries: KBEntry[] = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Expected an array of KB entries' });
    }

    const results = [];
    const errors = [];

    // Process entries sequentially (WAL mode and busy timeout handle concurrency)
    for (const entry of entries) {
      try {
        const { id, category, question, answer } = entry;

        if (!id || !category || !question || !answer) {
          errors.push({ entry, error: 'Missing required fields' });
          continue;
        }

        // Check if entry exists
        const existing = await get<KBEntry>(
          "SELECT * FROM knowledge_base WHERE id = ?",
          [id]
        );

        if (existing) {
          // Update existing entry (will create new version)
          const currentVersion = (existing as any).current_version || 1;
          const nextVersion = currentVersion + 1;

          await run(
            `UPDATE knowledge_base
             SET category = ?, question = ?, answer = ?, updated_at = CURRENT_TIMESTAMP, current_version = ?
             WHERE id = ?`,
            [category, question, answer, nextVersion, id]
          );

          // Create version record
          const versionId = `kbv_${Date.now()}_${id}_${nextVersion}`;
          await run(
            `INSERT INTO knowledge_base_versions (id, entry_id, version_number, category, question, answer, change_reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [versionId, id, nextVersion, category, question, answer, 'Bulk upload']
          );
        } else {
          // Insert new entry
          await run(
            `INSERT INTO knowledge_base (id, category, question, answer, created_at, updated_at, current_version)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
            [id, category, question, answer]
          );

          // Create initial version
          const versionId = `kbv_${Date.now()}_${id}_1`;
          await run(
            `INSERT INTO knowledge_base_versions (id, entry_id, version_number, category, question, answer, change_reason, created_at)
             VALUES (?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [versionId, id, category, question, answer, 'Initial version']
          );
        }

        results.push(id);
      } catch (error: any) {
        errors.push({ entry, error: error.message });
        console.error(`Error processing entry ${entry.id}:`, error);
      }
    }

    res.json({
      success: true,
      uploaded: results.length,
      failed: errors.length,
      errors,
    });
  } catch (error: any) {
    console.error('Error uploading KB entries:', error);
    res.status(500).json({ 
      error: 'Failed to upload KB entries', 
      details: error?.message || String(error)
    });
  }
});

// Get version history for a KB entry
router.get('/:id/versions', async (req, res) => {
  try {
    // Get the current entry first
    const entry = await get<KBEntry>(
      "SELECT * FROM knowledge_base WHERE id = ?",
      [req.params.id]
    );

    if (!entry) {
      return res.status(404).json({ error: 'KB entry not found' });
    }

    // Get all versions from history
    const versions = await query<KBVersion>(
      `SELECT * FROM knowledge_base_versions 
       WHERE entry_id = ? 
       ORDER BY version_number DESC`,
      [req.params.id]
    );

    // If no versions exist in history, create a virtual version 1 from current entry
    if (versions.length === 0) {
      const currentVersion: KBVersion = {
        id: `virtual_${req.params.id}_1`,
        entry_id: req.params.id,
        version_number: 1,
        category: entry.category,
        question: entry.question,
        answer: entry.answer,
        change_reason: 'Initial version',
        created_at: entry.created_at || undefined
      };
      return res.json([currentVersion]);
    }

    res.json(versions);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// Get specific version
router.get('/:id/versions/:version', async (req, res) => {
  try {
    const version = await get<KBVersion>(
      `SELECT * FROM knowledge_base_versions 
       WHERE entry_id = ? AND version_number = ?`,
      [req.params.id, parseInt(req.params.version)]
    );

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(version);
  } catch (error) {
    console.error('Error fetching version:', error);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// Restore to a specific version
router.post('/:id/restore/:version', async (req, res) => {
  try {
    const version = await get<KBVersion>(
      `SELECT * FROM knowledge_base_versions 
       WHERE entry_id = ? AND version_number = ?`,
      [req.params.id, parseInt(req.params.version)]
    );

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Get current version number
    const currentEntry = await get<KBEntry>(
      "SELECT * FROM knowledge_base WHERE id = ?",
      [req.params.id]
    );

    if (!currentEntry) {
      return res.status(404).json({ error: 'KB entry not found' });
    }

    const currentVersion = (currentEntry as any).current_version || 1;
    const nextVersion = currentVersion + 1;

    // Update main entry with restored version's data
    await run(
      `UPDATE knowledge_base 
       SET category = ?, question = ?, answer = ?, updated_at = CURRENT_TIMESTAMP, current_version = ?
       WHERE id = ?`,
      [version.category, version.question, version.answer, nextVersion, req.params.id]
    );

    // Create new version record documenting the restore
    const versionId = `kbv_${Date.now()}_${req.params.id}_${nextVersion}`;
    await run(
      `INSERT INTO knowledge_base_versions (id, entry_id, version_number, category, question, answer, change_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [versionId, req.params.id, nextVersion, version.category, version.question, version.answer, `Restored from version ${req.params.version}`]
    );

    const restoredEntry = await get<KBEntry>(
      "SELECT * FROM knowledge_base WHERE id = ?",
      [req.params.id]
    );

    res.json({ message: `Restored to version ${req.params.version}`, entry: restoredEntry });
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

export default router;

