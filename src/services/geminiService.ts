import { WatchtowerArticle, SuggestedCommentOption, ConductorData } from "../types";

export interface ConductorAnalysisParams {
  question: string;
  paragraph: string;
  scriptures?: string[];
  readScriptures?: string[];
  scriptureTexts?: { reference: string; text: string }[];
  pictureDescription?: string;
  hasPicture?: boolean;
  imageBase64?: string;
}

export async function processArticle(text: string): Promise<WatchtowerArticle> {
  const response = await fetch("/api/gemini/process-article", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to process article";
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      errorMessage = `Server error (${response.status}): ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result as WatchtowerArticle;
}

export async function regenerateComment(question: string, paragraph: string): Promise<SuggestedCommentOption[]> {
  const response = await fetch("/api/gemini/regenerate-comment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, paragraph }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to regenerate comment";
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      errorMessage = `Server error (${response.status})`;
    }
    throw new Error(errorMessage);
  }

  const comments = await response.json();
  return comments as SuggestedCommentOption[];
}

export async function generateConductorAnalysis(params: ConductorAnalysisParams): Promise<ConductorData> {
  const response = await fetch("/api/gemini/conductor-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = "Failed to analyze conductor points";
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      errorMessage = `Server error (${response.status})`;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data as ConductorData;
}

