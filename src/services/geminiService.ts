import { GoogleGenAI, Type } from "@google/genai";
import { WatchtowerArticle } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `
You are an expert assistant for Jehovah's Witnesses preparing for their weekly Watchtower study.
Your task is to parse a Watchtower article text and extract study questions and their corresponding paragraphs.
For each question, you must generate a concise, meaningful, and faith-strengthening comment based on the information in the associated paragraph.
The comment should sound natural, as if spoken by a person in a congregation meeting.
Avoid overly long comments; aim for 2-3 sentences.

CRITICAL:
- Identify ALL Bible scripture references in each paragraph (e.g., 'Matthew 24:14', 'Rev. 21:3, 4').
- Specifically identify which of these are 'Read' scriptures (usually preceded by the word 'Read').
- For each scripture reference found, provide its full text using the New World Translation of the Holy Scriptures (2013 Revision).
- Ensure that 'highlightedText', 'scriptures', and 'readScriptures' are EXACT substrings from the paragraph text provided.
- Ensure the output is a valid JSON object matching the requested schema.
`;

export async function processArticle(text: string): Promise<WatchtowerArticle> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [{ text: `Parse the following Watchtower article text and generate suggested comments for each question based on its paragraph. Also include the full text of all cited scriptures using the NWT 2013 edition: \n\n${text}` }]
      }
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "The title of the Watchtower article" },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "A unique ID for the item (e.g., 'q1')" },
                question: { type: Type.STRING, description: "The study question" },
                paragraph: { type: Type.STRING, description: "The text of the paragraph associated with the question" },
                highlightedText: { type: Type.STRING, description: "The specific sentence or phrase from the paragraph that directly answers the question or forms the basis of the comment. This MUST be an exact substring of the paragraph." },
                scriptures: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of all Bible scripture references found in the paragraph (e.g., 'Matthew 24:14', 'Rev. 21:3, 4')." },
                readScriptures: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of Bible scripture references that are explicitly marked to be 'Read' in the paragraph (usually preceded by 'Read')." },
                scriptureTexts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      reference: { type: Type.STRING },
                      text: { type: Type.STRING, description: "The full text of the scripture from the NWT 2013 edition" }
                    },
                    required: ["reference", "text"]
                  }
                },
                suggestedComment: { type: Type.STRING, description: "A suggested comment for the question based on the paragraph" },
                userComment: { type: Type.STRING, description: "Initially an empty string" }
              },
              required: ["id", "question", "paragraph", "highlightedText", "scriptures", "readScriptures", "scriptureTexts", "suggestedComment", "userComment"]
            }
          }
        },
        required: ["title", "items"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return { ...result, originalText: text } as WatchtowerArticle;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Failed to process article. Please ensure the text is correct.");
  }
}

export async function regenerateComment(question: string, paragraph: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [{ text: `Based on the following paragraph, generate a concise, meaningful, and faith-strengthening comment for the question: "${question}"\n\nParagraph: ${paragraph}` }]
      }
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    }
  });

  return response.text?.trim() || "Failed to generate comment.";
}
