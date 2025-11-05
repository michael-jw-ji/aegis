// Shared types for frontend

export interface KBEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  created_at?: string;
  updated_at?: string;
  current_version?: number;
}

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

export interface SecurityQuestion {
  id: string;
  text: string;
  category?: string;
  created_at?: string;
}

export interface GeneratedAnswer {
  id: string;
  question_id: string;
  question_text: string;
  answer: string;
  category?: string;
  quality_score?: number;
  created_at?: string;
}

export interface JudgeEvaluation {
  id: string;
  answer_id: string;
  judge_id: string;
  score?: number;
  verdict?: string;
  reasoning?: string;
  created_at?: string;
}

