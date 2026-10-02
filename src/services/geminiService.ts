import { WatchtowerArticle, SuggestedCommentOption, ConductorData } from "../types";

async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delay = 2000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 503 && i < retries) {
        console.warn(`[Client Retry] 503 Service Unavailable received. Retrying (${i + 1}/${retries}) in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return fetch(url, options);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const trimmed = text.trim().toLowerCase();
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      throw new Error(`Server returned an HTML page instead of JSON (Status ${response.status}). The server or proxy may be temporarily busy. Please wait a few seconds and try again.`);
    }
    throw new Error(`Failed to parse server response (Status ${response.status}).`);
  }
}

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
  const response = await fetchWithRetry("/api/gemini/process-article", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to process article";
    try {
      const errorData = await parseJsonResponse<{ error?: string }>(response);
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch (e: any) {
      errorMessage = response.status === 503
        ? "Google AI service is currently busy or overloaded (503 Service Unavailable). Please wait 5 seconds and try again."
        : e?.message || `Server error (${response.status}): ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return await parseJsonResponse<WatchtowerArticle>(response);
}

export async function regenerateComment(question: string, paragraph: string): Promise<SuggestedCommentOption[]> {
  const response = await fetchWithRetry("/api/gemini/regenerate-comment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, paragraph }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to regenerate comment";
    try {
      const errorData = await parseJsonResponse<{ error?: string }>(response);
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch (e: any) {
      errorMessage = response.status === 503
        ? "Google AI service is temporarily busy (503). Please wait a few seconds and try again."
        : e?.message || `Server error (${response.status})`;
    }
    throw new Error(errorMessage);
  }

  return await parseJsonResponse<SuggestedCommentOption[]>(response);
}

export async function generateConductorAnalysis(params: ConductorAnalysisParams): Promise<ConductorData> {
  const response = await fetchWithRetry("/api/gemini/conductor-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = "Failed to analyze conductor points";
    try {
      const errorData = await parseJsonResponse<{ error?: string }>(response);
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch (e: any) {
      errorMessage = response.status === 503
        ? "Google AI service is temporarily busy (503). Please wait a few seconds and try again."
        : e?.message || `Server error (${response.status})`;
    }
    throw new Error(errorMessage);
  }

  return await parseJsonResponse<ConductorData>(response);
}

export async function generateConductorAnalysisBatch(items: Array<{
  id: string;
  question: string;
  paragraph: string;
  scriptures?: string[];
  readScriptures?: string[];
  conductorData?: any;
}>): Promise<Array<{ id: string; conductorData: ConductorData }>> {
  const response = await fetchWithRetry("/api/gemini/conductor-analysis-batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to run batch conductor analysis";
    try {
      const errorData = await parseJsonResponse<{ error?: string }>(response);
      if (errorData?.error) errorMessage = errorData.error;
    } catch (e: any) {
      errorMessage = response.status === 503
        ? "Google AI service is temporarily busy (503). Please wait a few seconds and try again."
        : e?.message || `Server error (${response.status})`;
    }
    throw new Error(errorMessage);
  }

  const data = await parseJsonResponse<{ results?: Array<{ id: string; conductorData: ConductorData }> }>(response);
  return data.results || [];
}

