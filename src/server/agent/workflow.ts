import { query, run } from "../db/database";
import type { KBEntry, AIJudge, JudgeEvaluation } from "../db/database";
import { StateGraph, END } from "@langchain/langgraph";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import natural from "natural";

// Agent State interface for LangGraph
export interface AgentState {
  question: string;
  question_id: string;
  retrieved_entries: KBEntry[];
  generated_answer: string;
  confidence_score?: number; // 0..1 confidence computed during retrieval
  error?: string;
  judge_evaluations?: Array<Pick<JudgeEvaluation, "judge_id" | "score" | "verdict" | "reasoning">>;
  quality_score?: number;
}

// Initialize LLM using LangChain with Ollama (runs locally, no API key needed)
// Make sure Ollama is running: https://ollama.ai
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";

// Define a LangChain Runnable that calls Ollama via HTTP
const ollamaRunnable = RunnableLambda.from(async (input: any) => {
  try {
    // Extract the prompt string from the input
    // PromptTemplate returns a formatted string, but we need to handle it properly
    let promptText: string;
    if (typeof input === "string") {
      promptText = input;
    } else if (input?.content) {
      // Handle if it's a message object with content
      promptText = typeof input.content === "string" ? input.content : String(input.content);
    } else if (input?.text) {
      // Handle if it's an object with text property
      promptText = String(input.text);
    } else {
      // Fallback: convert to string
      promptText = String(input);
    }
    
    // Debug: Log what we received
    console.log(`[Ollama Request] Input type: ${typeof input}`);
    const previewLength = 200;
    const inputPreview = typeof input === "object" ? JSON.stringify(input).substring(0, previewLength) : String(input).substring(0, previewLength);
    console.log(`[Ollama Request] Input preview (first ${previewLength} chars): ${inputPreview}${promptText.length > previewLength ? '...' : ''}`);
    console.log(`[Ollama Request] URL: ${ollamaBaseUrl}/api/generate`);
    console.log(`[Ollama Request] Model: ${ollamaModel}`);
    console.log(`[Ollama Request] Full prompt length: ${promptText.length} characters (full prompt sent to Ollama)`);
    
    // Ensure promptText is actually a string (not an object)
    if (typeof promptText !== "string") {
      console.error(`[Ollama Request Error] promptText is not a string! Type: ${typeof promptText}, Value:`, promptText);
      throw new Error(`Invalid prompt type: expected string, got ${typeof promptText}`);
    }
    
    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: promptText, // Ensure we're sending a string
        stream: false,
        options: { temperature: 0 },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error(`[Ollama API Error] HTTP ${response.status}: ${errorText}`);
      throw new Error(`Ollama API error: HTTP ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    return (data.response as string) ?? "";
  } catch (error: any) {
    // Enhanced error logging for connection issues
    console.error(`[Ollama Connection Error] Failed to connect to ${ollamaBaseUrl}`);
    console.error(`[Ollama Connection Error] Error type: ${error?.constructor?.name || 'Unknown'}`);
    console.error(`[Ollama Connection Error] Error message: ${error?.message || String(error)}`);
    console.error(`[Ollama Connection Error] Error code: ${error?.code || 'N/A'}`);
    if (error?.cause) {
      console.error(`[Ollama Connection Error] Cause: ${JSON.stringify(error.cause, null, 2)}`);
    }
    if (error?.stack) {
      console.error(`[Ollama Connection Error] Stack trace: ${error.stack}`);
    }
    throw new Error(`Ollama connection failed: ${error?.message || String(error)}. Make sure Ollama is running at ${ollamaBaseUrl} and the model "${ollamaModel}" is available.`);
  }
});

// Create LangChain prompt template for answer generation
const promptTemplate = PromptTemplate.fromTemplate(`You are a cybersecurity compliance analyst answering security questionnaire questions based on a knowledge base.

CRITICAL INSTRUCTIONS:
1. Answer ONLY based on the provided knowledge base context below
2. If the knowledge base does not contain relevant information, respond with: "No information available in the knowledge base."
3. Be comprehensive but concise in your answer
4. Maintain a professional, security-focused tone
5. Never make up or hallucinate information not in the knowledge base

KNOWLEDGE BASE CONTEXT:
{context}

SECURITY QUESTION:
{question}

ANSWER (based only on the knowledge base above):`);

// Create LangChain chain: prompt template -> Ollama runnable
const answerChain = RunnableSequence.from([promptTemplate, ollamaRunnable]);

// Compose KB context string for prompts
function buildKbContext(entries: KBEntry[]): string {
  return entries
    .map(
      (entry, idx) =>
        `[KB Entry ${idx + 1}]\nCategory: ${entry.category}\nQ: ${entry.question}\nA: ${entry.answer}`
    )
    .join("\n\n");
}

// Evaluation Node: Evaluate answer using AI judges (part of LangGraph workflow)
async function evaluationNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const { question, generated_answer, retrieved_entries } = state;

    if (!generated_answer) {
      console.warn("[Evaluation] No generated answer to evaluate");
      return { judge_evaluations: [], quality_score: 0 };
    }

    const kbContext = buildKbContext(retrieved_entries || []);
    const judges = await query<AIJudge>(
      `SELECT * FROM ai_judges WHERE active = 1 ORDER BY name ASC`
    );

    console.log(`[Evaluation] Found ${judges?.length || 0} active judges`);
    if (!judges || judges.length === 0) {
      console.warn(`[Evaluation] No active judges found! Please seed judges with POST /api/judges/seed-defaults`);
      return { judge_evaluations: [], quality_score: 0 };
    }

    const evalPromises = judges.map(async (judge) => {
      console.log(`[Evaluation] Evaluating with judge: ${judge.name} (${judge.id})`);
      const prompt = `${judge.prompt_template}\n\nQUESTION:\n${question}\n\nKB_CONTEXT:\n${kbContext}\n\nANSWER:\n${generated_answer}\n\nReturn STRICT JSON.`;
      let raw: string;
      try {
        raw = await ollamaRunnable.invoke(prompt);
        console.log(`[Evaluation] ${judge.name} raw response: ${raw.substring(0, 200)}...`);
      } catch (err) {
        console.error(`[Evaluation] Failed to call Ollama for ${judge.name}:`, err);
        throw err;
      }

      // Try to parse JSON from model output
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = String(raw).match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
        }
      }

      const score = Number(parsed?.score ?? 0);
      const verdict = String(parsed?.verdict ?? '').toUpperCase() || undefined;
      const reasoning = String(parsed?.reasoning ?? raw).slice(0, 4000);

      return {
        judge_id: judge.id,
        score: isFinite(score) ? score : 0,
        verdict,
        reasoning,
        weight: judge.weight ?? 1,
      };
    });

    let settled;
    try {
      settled = await Promise.all(evalPromises);
    } catch (err) {
      console.error(`[Evaluation] Error during parallel evaluation:`, err);
      throw err;
    }

    const evaluations = settled.map((s) => ({
      judge_id: s.judge_id,
      score: s.score,
      verdict: s.verdict,
      reasoning: s.reasoning,
    }));

    const totalWeight = settled.reduce((acc, s) => acc + (s.weight || 1), 0) || 1;
    const weighted = settled.reduce(
      (acc, s) => acc + (s.score * (s.weight || 1)),
      0
    );
    const qualityScore = Math.round((weighted / totalWeight) * 100) / 100; // 2 decimals

    console.log(`[Evaluation] Computed quality score: ${qualityScore} from ${evaluations.length} evaluations`);

    return {
      judge_evaluations: evaluations,
      quality_score: qualityScore,
    };
  } catch (error: any) {
    console.error(`[Evaluation Error] Failed to evaluate answer:`, error);
    return {
      judge_evaluations: [],
      quality_score: 0,
      error: `Evaluation failed: ${error?.message || String(error)}`,
    };
  }
}

// Save judge evaluations to database
export async function saveJudgeEvaluations(
  answerId: string,
  evaluations: Array<Pick<JudgeEvaluation, "judge_id" | "score" | "verdict" | "reasoning">>
): Promise<JudgeEvaluation[]> {
  const savedEvaluations: JudgeEvaluation[] = [];
  
  for (const evaluation of evaluations) {
    const evalId = `eval_${Date.now()}_${evaluation.judge_id}_${Math.random().toString(36).slice(2,8)}`;
    await run(
      `INSERT INTO judge_evaluations (id, answer_id, judge_id, score, verdict, reasoning, raw_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [evalId, answerId, evaluation.judge_id, evaluation.score || 0, evaluation.verdict || null, evaluation.reasoning || null, JSON.stringify(evaluation)]
    );
    
    savedEvaluations.push({
      id: evalId,
      answer_id: answerId,
      judge_id: evaluation.judge_id,
      score: evaluation.score || 0,
      verdict: evaluation.verdict,
      reasoning: evaluation.reasoning,
      raw_json: JSON.stringify(evaluation),
    });
  }
  
  return savedEvaluations;
}

// Evaluate a generated answer using configured AI judges and persist results (standalone version for backward compatibility)
export async function evaluateAnswerWithJudges(
  answerId: string,
  question: string,
  answer: string,
  retrievedEntries: KBEntry[]
): Promise<{ evaluations: JudgeEvaluation[]; qualityScore: number }> {
  console.log(`[Judge Evaluation] Starting evaluation for answer ${answerId}`);
  const kbContext = buildKbContext(retrievedEntries);
  const judges = await query<AIJudge>(
    `SELECT * FROM ai_judges WHERE active = 1 ORDER BY name ASC`
  );

  console.log(`[Judge Evaluation] Found ${judges?.length || 0} active judges`);
  if (!judges || judges.length === 0) {
    console.warn(`[Judge Evaluation] No active judges found! Please seed judges with POST /api/judges/seed-defaults`);
    return { evaluations: [], qualityScore: 0 };
  }

  const evalPromises = judges.map(async (judge) => {
    console.log(`[Judge Evaluation] Evaluating with judge: ${judge.name} (${judge.id})`);
    const prompt = `${judge.prompt_template}\n\nQUESTION:\n${question}\n\nKB_CONTEXT:\n${kbContext}\n\nANSWER:\n${answer}\n\nReturn STRICT JSON.`;
    let raw: string;
    try {
      raw = await ollamaRunnable.invoke(prompt);
      console.log(`[Judge Evaluation] ${judge.name} raw response: ${raw.substring(0, 200)}...`);
    } catch (err) {
      console.error(`[Judge Evaluation] Failed to call Ollama for ${judge.name}:`, err);
      throw err;
    }

    // Try to parse JSON from model output
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = String(raw).match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    const score = Number(parsed?.score ?? 0);
    const verdict = String(parsed?.verdict ?? '').toUpperCase() || undefined;
    const reasoning = String(parsed?.reasoning ?? raw).slice(0, 4000);

    const evalId = `eval_${Date.now()}_${judge.id}_${Math.random().toString(36).slice(2,8)}`;
    await run(
      `INSERT INTO judge_evaluations (id, answer_id, judge_id, score, verdict, reasoning, raw_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [evalId, answerId, judge.id, isFinite(score) ? score : 0, verdict || null, reasoning || null, JSON.stringify(parsed ?? { raw })]
    );

    const result: JudgeEvaluation = {
      id: evalId,
      answer_id: answerId,
      judge_id: judge.id,
      score: isFinite(score) ? score : 0,
      verdict,
      reasoning,
      raw_json: JSON.stringify(parsed ?? { raw }),
    };
    return { result, weight: judge.weight ?? 1 };
  });

  let settled;
  try {
    settled = await Promise.all(evalPromises);
  } catch (err) {
    console.error(`[Judge Evaluation] Error during parallel evaluation:`, err);
    throw err;
  }
  
  const evaluations = settled.map((s) => s.result);
  const totalWeight = settled.reduce((acc, s) => acc + (s.weight || 1), 0) || 1;
  const weighted = settled.reduce(
    (acc, s) => acc + ((s.result.score || 0) * (s.weight || 1)),
    0
  );
  const qualityScore = Math.round((weighted / totalWeight) * 100) / 100; // 2 decimals

  console.log(`[Judge Evaluation] Computed quality score: ${qualityScore} from ${evaluations.length} evaluations`);
  
  await run(
    `UPDATE generated_answers SET quality_score = ? WHERE id = ?`,
    [qualityScore, answerId]
  );

  console.log(`[Judge Evaluation] Completed evaluation for answer ${answerId}`);
  return { evaluations, qualityScore };
}

// Category assignment: Find best matching category from KB entries using TF-IDF
export async function assignCategoryFromKB(questionText: string): Promise<string | null> {
  try {
    const allEntries = await query<KBEntry>("SELECT * FROM knowledge_base");
    
    if (allEntries.length === 0) {
      return null; // No KB entries to match against
    }

    // TF-IDF similarity matching (same logic as retrieval)
    const TfIdf = natural.TfIdf;
    const tfidf = new TfIdf();

    allEntries.forEach((entry) => {
      tfidf.addDocument(`${entry.question} ${entry.category}`.toLowerCase());
    });

    const questionLower = questionText.toLowerCase();

    const similarities = allEntries.map((entry, index) => {
      let score = 0;
      tfidf.tfidfs(questionLower, (i, measure) => {
        if (i === index) {
          score = measure;
        }
      });
      return { entry, score };
    });

    const sorted = similarities.sort((a, b) => b.score - a.score);
    const topMatch = sorted[0];
    const secondMatch = sorted[1];

    // Log top matches for debugging
    console.log(`Category assignment for: "${questionText.substring(0, 50)}..."`);
    console.log(`Top match: score=${topMatch?.score.toFixed(4)}, category="${topMatch?.entry.category}"`);
    if (secondMatch) {
      console.log(`Second match: score=${secondMatch.score.toFixed(4)}, category="${secondMatch.entry.category}"`);
    }

    // TF-IDF scores are typically much lower (0.01-0.2 range), so use a lower threshold
    // Also check if top score is significantly better than second (to ensure it's a clear match)
    const SIMILARITY_THRESHOLD = 0.05; // Lower threshold for TF-IDF
    const MIN_SCORE_DIFFERENCE = 0.01; // Top should be at least this much better than second
    
    const hasGoodMatch = topMatch && 
      topMatch.score > SIMILARITY_THRESHOLD && 
      topMatch.entry.category &&
      (!secondMatch || (topMatch.score - secondMatch.score) >= MIN_SCORE_DIFFERENCE);
    
    if (hasGoodMatch) {
      console.log(`✅ Assigned category "${topMatch.entry.category}" to question (similarity: ${topMatch.score.toFixed(4)})`);
      return topMatch.entry.category;
    }

    console.log(`❌ No category assigned (top score: ${topMatch?.score.toFixed(4)}, threshold: ${SIMILARITY_THRESHOLD})`);
    return null; // Keep uncategorized if no good match
  } catch (error) {
    console.error("Error assigning category:", error);
    return null;
  }
}

// Retrieval Node: Find relevant KB entries using TF-IDF
async function retrievalNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const { question } = state;
    
    const allEntries = await query<KBEntry>("SELECT * FROM knowledge_base");
    
    if (allEntries.length === 0) {
      return { retrieved_entries: [], confidence_score: 0 };
    }

    // TF-IDF similarity matching
    const TfIdf = natural.TfIdf;
    const tfidf = new TfIdf();

    allEntries.forEach((entry) => {
      tfidf.addDocument(`${entry.question} ${entry.category}`.toLowerCase());
    });

    const questionLower = question.toLowerCase();

    const similarities = allEntries.map((entry, index) => {
      let score = 0;
      tfidf.tfidfs(questionLower, (i, measure) => {
        if (i === index) {
          score = measure;
        }
      });
      return { entry, score };
    });

    const sorted = similarities
      .sort((a, b) => b.score - a.score);

    const topEntries = sorted
      .slice(0, 5)
      .filter((item) => item.score > 0)
      .map((item) => item.entry);

    // Confidence scoring using top-vs-second margin (0..1)
    const topScore = sorted[0]?.score ?? 0;
    const secondScore = sorted[1]?.score ?? 0;
    const confidence = topScore <= 0 ? 0 : topScore / (topScore + secondScore + 1e-9);

    console.log(`Retrieved ${topEntries.length} relevant KB entries for: "${question}"`);

    return { retrieved_entries: topEntries, confidence_score: confidence };
  } catch (error) {
    console.error("Retrieval error:", error);
    return { retrieved_entries: [], confidence_score: 0, error: String(error) };
  }
}

// Generation Node: Generate answer using LangChain LLM through LangGraph
async function generationNode(state: AgentState): Promise<Partial<AgentState>> {
  const { question, retrieved_entries, confidence_score } = state;
  try {

    // Gate on retrieval quality to reduce hallucinations
    const CONFIDENCE_THRESHOLD = 0.55; // conservative default

    if (!retrieved_entries || retrieved_entries.length === 0 || (confidence_score ?? 0) < CONFIDENCE_THRESHOLD) {
      console.error("No relevant entries retrieved.");
      return {
        generated_answer: "No information available in the knowledge base.",
      };
    }

    // Build context from retrieved entries
    const context = retrieved_entries
      .map(
        (entry, idx) =>
          `[KB Entry ${idx + 1}]
Category: ${entry.category}
Q: ${entry.question}
A: ${entry.answer}
`
      )
      .join("\n");

    console.log("Generated context:", context);

    // Use LangChain chain to generate answer with Ollama
    console.log(`Calling LangChain with Ollama for: "${question}"`);
    const generatedAnswer = await answerChain.invoke({
      context,
      question,
    });

    console.log(`Generated answer for: "${question}"`);

    return { generated_answer: generatedAnswer.trim() };
  } catch (error: any) {
    // Enhanced error logging for generation errors
    const questionText = question || state.question || "unknown question";
    console.error(`[Generation Error] Failed to generate answer for: "${questionText}"`);
    console.error(`[Generation Error] Error type: ${error?.constructor?.name || 'Unknown'}`);
    console.error(`[Generation Error] Error message: ${error?.message || String(error)}`);
    if (error?.stack) {
      console.error(`[Generation Error] Stack trace: ${error.stack}`);
    }
    if (error?.cause) {
      console.error(`[Generation Error] Cause:`, error.cause);
    }
    
    const errorMessage = error?.message || String(error);
    return {
      generated_answer: `Error generating answer: ${errorMessage}. Make sure Ollama is running at ${ollamaBaseUrl} and the model "${ollamaModel}" is available.`,
      error: errorMessage,
    };
  }
}

// Create LangGraph workflow
function createWorkflow() {
  // Define the graph with state schema
  const workflow = new StateGraph<AgentState>({
    channels: {
      question: {
        reducer: (x: string, y: string) => y ?? x,
        default: () => "",
      },
      question_id: {
        reducer: (x: string, y: string) => y ?? x,
        default: () => "",
      },
      retrieved_entries: {
        reducer: (x: KBEntry[], y: KBEntry[]) => y ?? x ?? [],
        default: () => [],
      },
      generated_answer: {
        reducer: (x: string, y: string) => y ?? x ?? "",
        default: () => "",
      },
      confidence_score: {
        reducer: (x: number | undefined, y: number | undefined) => y ?? x ?? 0,
        default: () => 0,
      },
      judge_evaluations: {
        reducer: (x: Array<Pick<JudgeEvaluation, "judge_id" | "score" | "verdict" | "reasoning">> | undefined, y: Array<Pick<JudgeEvaluation, "judge_id" | "score" | "verdict" | "reasoning">> | undefined) => y ?? x ?? [],
        default: () => [],
      },
      quality_score: {
        reducer: (x: number | undefined, y: number | undefined) => y ?? x ?? undefined,
        default: () => undefined,
      },
      error: {
        reducer: (x: string | undefined, y: string | undefined) => y ?? x,
        default: () => undefined,
      },
    },
  });

  // Add nodes
  workflow.addNode("retrieval", retrievalNode);
  workflow.addNode("generation", generationNode);
  workflow.addNode("evaluation", evaluationNode);

  // Define edges - using type assertion to work around TypeScript inference issues
  workflow.addEdge("__start__" as any, "retrieval" as any);
  workflow.addEdge("retrieval" as any, "generation" as any);
  workflow.addEdge("generation" as any, "evaluation" as any);
  workflow.addEdge("evaluation" as any, END);

  return workflow.compile();
}

// Generate answer for a single question using LangGraph workflow
export async function generateAnswer(
  questionId: string,
  questionText: string
): Promise<{ 
  answer: string; 
  retrievedContext: KBEntry[]; 
  judge_evaluations?: Array<Pick<JudgeEvaluation, "judge_id" | "score" | "verdict" | "reasoning">>;
  quality_score?: number;
}> {
  const workflow = createWorkflow();

  const initialState: AgentState = {
    question: questionText,
    question_id: questionId,
    retrieved_entries: [],
    generated_answer: "",
    confidence_score: 0,
  };

  // Execute the LangGraph workflow
  const result = await workflow.invoke(initialState);

  return {
    answer: result.generated_answer,
    retrievedContext: result.retrieved_entries,
    judge_evaluations: result.judge_evaluations,
    quality_score: result.quality_score,
  };
}

// Generate answers for all questions
export async function generateAnswersForAll(): Promise<void> {
  const questions = await query<{ id: string; text: string; category?: string }>(
    "SELECT id, text, category FROM security_questions"
  );

  for (const question of questions) {
    try {
      // Check if answer already exists
      const existingAnswer = await query<{ id: string }>(
        "SELECT id FROM generated_answers WHERE question_id = ?",
        [question.id]
      );

      if (existingAnswer.length > 0) {
        console.log(`Skipping question ${question.id} - answer already exists`);
        continue;
      }

      console.log(`Generating answer for question ${question.id}...`);
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
          await saveJudgeEvaluations(answerId, result.judge_evaluations);
        } catch (evalErr) {
          console.error(`Failed to save judge evaluations for ${answerId}:`, evalErr);
        }
      }

      console.log(`Generated answer for question ${question.id}`);
    } catch (error) {
      console.error(`Error generating answer for question ${question.id}:`, error);
    }
  }
}
