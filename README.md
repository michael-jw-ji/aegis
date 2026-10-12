# Aegis - AI Engineering Take Home Assessment

A questionnaire answering system that uses LangGraph/LangChain to intelligently answer security questionnaires against a knowledge base.

## Quick Start

```bash
npm install
ollama pull llama3.2  # One-time setup
npm run dev
```

App opens at **http://localhost:5173**

Ollama starts automatically in the background (Windows-compatible).

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + TypeScript
- **Database**: SQLite
- **AI**: LangGraph + LangChain + Ollama (local LLM)
- **Retrieval**: TF-IDF similarity matching

## Features

### Core Requirements ✓

- **Knowledge Base Management**: Upload JSON, add/edit/delete entries with persistent storage
- **Question Upload**: Upload security questions from JSON with automatic categorization
- **Agentic Answer Generation**: LangGraph workflow with:
  - **Retrieval Node**: TF-IDF-based similarity search for relevant KB entries
  - **Generation Node**: LangChain + Ollama LLM to generate answers from retrieved context
- **Results View**: Display answers with category filtering and search

### Bonus Features ✨

- **AI Judges**: Integrated into LangGraph workflow as an evaluation node. Three custom judges (Accuracy, Completeness, Risk) evaluate answers with scores, verdicts, and reasoning
- **Version Control**: Full version history for KB entries with rollback capability
- **Analytics Dashboard**: Animated charts showing compliance metrics, pass rates, and time-series trends
- **Auto-start Ollama**: Silent background process on Windows

## LangGraph Workflow

The agentic workflow uses LangGraph's `StateGraph` with proper state management:

```
START → Retrieval Node (TF-IDF) → Generation Node (LangChain + Ollama) → Evaluation Node (AI Judges) → END
```

**Implementation**:

- `StateGraph<AgentState>` with defined state channels (`question`, `retrieved_entries`, `generated_answer`, `confidence_score`, `judge_evaluations`, `quality_score`)
- Retrieval node finds top 5 relevant KB entries using TF-IDF
- Generation node uses LangChain's `PromptTemplate` + `RunnableSequence` to call Ollama
- Evaluation node runs AI judges (Accuracy, Completeness, Risk) in parallel to assess answer quality
- Anti-hallucination: Confidence threshold gating, strict KB-only instructions, temperature=0

**Code**: `src/server/agent/workflow.ts` - Uses `addNode()`, `addEdge()`, `compile()`, `invoke()`

## Database

SQLite database (`data/aegis.db`) with tables:

- `knowledge_base` + `knowledge_base_versions` (version control)
- `security_questions`
- `generated_answers` + `quality_score`
- `ai_judges` + `judge_evaluations`

Automatic migrations handle schema changes.

## API Endpoints

**Knowledge Base**: GET/POST/PUT/DELETE `/api/knowledge-base`, version endpoints  
**Questions**: GET/POST/DELETE `/api/questions`, bulk upload  
**Answers**: GET `/api/answers`, POST `/api/answers/generate/:questionId`, analytics endpoint  
**Judges**: CRUD `/api/judges`, seed defaults

## Time Spent

~20-25 hours total:

- Core implementation: 12 hours
- LangGraph/LangChain integration: 4 hours
- Bonus features (Judges, Version Control, Analytics): 6 hours
- UI/UX refinement: 3 hours

## Workflow & Tools

This project was built using **Cursor with Claude** (AI-assisted development) throughout:

**Architecture & Design**: AI helped design the LangGraph workflow structure, database schema for version control/judges, and API organization.

**Implementation**: AI assisted with:

- Parallel evaluation architecture for AI Judges
- Version control system with diff tracking
- Custom SVG chart components (animated progress bars, pie charts, bezier line charts)
- Windows Ollama silent startup solution

**Debugging**: AI helped resolve Ollama integration issues, TypeScript type mismatches, database migrations, and time-series data aggregation bugs.

**Iteration**: Many UI refinements (modal layouts, button styling, spacing) were done iteratively with AI feedback.

**Learning**: AI guided LangGraph concepts (StateGraph, nodes, edges), Ollama integration patterns, and modern React hooks usage.

**Productivity**: AI accelerated development by reducing boilerplate, providing instant feedback on approaches, debugging complex issues quickly, and suggesting alternatives when hitting roadblocks.

## Trade-offs & Decisions

1. **Local LLM (Ollama)**: Chose Ollama over cloud APIs (OpenAI/Anthropic) to avoid API costs and ensure offline functionality. Trade-off: Requires local installation, but auto-start script mitigates this.

2. **TF-IDF over Embeddings**: Used simple TF-IDF for retrieval instead of vector embeddings (e.g., OpenAI embeddings) for simplicity and speed. Works well for this KB size; embeddings would improve semantic matching for larger datasets.

3. **SQLite over PostgreSQL**: Chose SQLite for simplicity and portability. PostgreSQL would be better for production scale but adds complexity.

4. **Manual Prompt Engineering**: Wrote explicit anti-hallucination instructions directly in the prompt template (e.g., "Answer ONLY based on context", "Never make up information") rather than using more sophisticated RAG patterns like self-verification chains or multi-step reasoning. Provides full control and simplicity but requires manual prompt refinement.

5. **Custom Charts**: Built SVG charts from scratch instead of using libraries (Chart.js, Recharts) for full control over animations and styling, though it required more code.

## License

Take-home assessment for Aegis.
