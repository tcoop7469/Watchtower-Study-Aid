import express from 'express';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const cliPort = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : undefined;
const port = cliPort || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = 1500): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errStr = String(error?.message || error || '').toLowerCase();
      const status = error?.status || error?.code || error?.statusCode;
      const isTransient =
        status === 503 ||
        status === 429 ||
        status === 500 ||
        errStr.includes('503') ||
        errStr.includes('overloaded') ||
        errStr.includes('unavailable') ||
        errStr.includes('resource_exhausted') ||
        errStr.includes('econnreset') ||
        errStr.includes('etimedout');

      if (isTransient && attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[Gemini API] Transient error (${status || '503'}). Attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw error;
    }
  }
}

async function generateWithModelFallback(paramsBuilder: (model: string) => any, maxRetries = 2) {
  let lastError: any;
  for (const model of CANDIDATE_MODELS) {
    try {
      return await callGeminiWithRetry(() => ai.models.generateContent(paramsBuilder(model)), maxRetries);
    } catch (err: any) {
      lastError = err;
      const errStr = String(err?.message || err || '').toLowerCase();
      console.warn(`[Gemini] Model ${model} failed (${errStr.slice(0, 100)}). Trying fallback model...`);
    }
  }
  throw lastError;
}

const SYSTEM_INSTRUCTION = `
You are an expert assistant for Jehovah's Witnesses preparing for their weekly Watchtower study, acting also as an experienced Watchtower Study Conductor.
Your task is to parse a Watchtower article text and extract study questions and their corresponding paragraphs.
For each question, you must generate a list of concise, meaningful, and faith-strengthening suggested comments based on the information in the associated paragraph.
You can generate up to 3 suggested comments per paragraph (minimum of 1). 
- Comment 1 (Default): A concise general comment based on the paragraph.
- Comment 2 & 3 (Optional): Distinct alternative comments that specifically incorporate and highlight the Bible scriptures cited/referenced in the paragraph, weaving them naturally into the comment.
- Only generate the maximum of 3 comments if the paragraph has sufficient information and scripture references to support multiple high-quality, distinct comments. Otherwise, provide fewer (1 or 2).
The comments should sound natural, as if spoken by a person in a congregation meeting.
Avoid overly long comments; aim for 2-3 sentences.

MULTI-PARAGRAPH QUESTIONS & COMBINED PARAGRAPHS (CRITICAL):
- In Watchtower study articles, questions frequently cover TWO (or more) consecutive paragraphs (e.g., questions numbered '1-2.', '1, 2.', '3-4.', '15, 16.', or questions with parts '(a)' and '(b)').
- When a question covers multiple paragraphs (e.g. paragraphs 1 and 2):
  * You MUST include the COMPLETE text of BOTH paragraphs together in the 'paragraph' field (e.g., "1. [Full text of paragraph 1]\n\n2. [Full text of paragraph 2]").
  * NEVER skip or drop the first paragraph! Both paragraphs MUST be included in full.
  * In the 'question' field, include the complete question text including all parts (e.g., "1-2. (a) What challenges do we face? (b) How do the Scriptures encourage us?").
  * In 'suggestedComments', provide answers that cover both paragraphs and all sub-parts of the question.
  * Extract all scriptures, cited verses, and conductor highlights from across BOTH paragraphs.
- EXTRACT EVERY QUESTION WITHOUT EXCEPTION:
  * Do not stop early or omit questions. Every single study question in the article (from Question 1 to the final question) must be represented as an item in the 'items' array.
  * If a paragraph has no question directly under it, it belongs to the following multi-paragraph question (e.g., Paragraph 1 belongs with Paragraph 2 for Question 1-2). Combine it with that question!

CONDUCTOR MODE ASSISTANCE:
The study conductor's role during the meeting is to help get ALL the points out in each paragraph:
1. Extra Points in the Paragraph:
   - Identify 2 to 4 distinct secondary thoughts, gems, or supporting evidence in the paragraph beyond the basic answer.
   - For each extra point, provide the EXACT substring ('text') from the paragraph so it can be highlighted in color.
   - Assign each point a DIFFERENT color ('emerald', 'purple', 'amber', 'rose', 'cyan') so they are highlighted in varied colors.
   - Provide a natural conductor question for each extra point to ask the audience if that point is not initially mentioned.
2. Scripture Questions:
   - For scriptures cited or read in the paragraph, provide 1 to 2 targeted questions the conductor can ask the congregation to draw out the application of that scripture.
3. Picture & Artwork Questions:
   - Check if the paragraph text references an illustration, picture, or artwork (e.g., "See picture", "illustrated", "as shown in the image").
   - Set 'hasPicture' to true if an image/picture is mentioned or implied, and provide a short description.
   - Provide 1 to 2 discussion questions about the picture or visual lesson to help the conductor engage the audience.
4. Teaching Tips:
   - Provide 1 or 2 practical conductor tips for managing the paragraph discussion smoothly.

CRITICAL:
- Identify EVERY Bible scripture reference in each paragraph (e.g., 'Matthew 24:14', 'Rev. 21:3, 4', 'John 3:16, 17').
- Specifically identify which of these are 'Read' scriptures (usually preceded by the word 'Read').
- For EVERY scripture reference listed in 'scriptures' or 'readScriptures', you MUST provide its corresponding full text in the 'scriptureTexts' array. If a reference includes a range of verses (e.g., 'Luke 17:31-35' or 'Matthew 24:14-16'), you MUST provide the full text for ALL verses within that range sequentially. Do not stop after the first verse.
- Identify the summary review questions at the end of the article (usually in a section called 'How Would You Answer?' or similar review box).
- For each review question, generate a summary comment that answers the question based on the content of the entire article.
- Use the New World Translation of the Holy Scriptures (2013 Revision) for all scripture texts.
- Ensure that 'highlightedText', 'scriptures', 'readScriptures', and each conductorPoint 'text' are EXACT substrings from the paragraph text provided.
- If a reference covers multiple verses (e.g., 'John 3:16, 17'), treat it as a single string in the arrays that includes the text of all verses.
- Ensure the output is a valid JSON object matching the requested schema.
`;

const COLOR_CYCLE = ['emerald', 'purple', 'amber', 'rose', 'cyan'];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findExactSubstringInParagraph(paragraph: string, targetText: string): string | null {
  if (!paragraph || !targetText) return null;
  const cleanTarget = targetText.trim();
  if (!cleanTarget) return null;
  
  // 1. Literal match
  if (paragraph.includes(cleanTarget)) return cleanTarget;
  
  // 2. Case-insensitive exact match
  const lowerPara = paragraph.toLowerCase();
  const lowerTarget = cleanTarget.toLowerCase();
  const lowerIdx = lowerPara.indexOf(lowerTarget);
  if (lowerIdx !== -1) {
    return paragraph.substring(lowerIdx, lowerIdx + cleanTarget.length);
  }

  // 3. Flexible quote, apostrophe, dash, whitespace regex
  try {
    const clean = cleanTarget.replace(/^[.,;:!?"'“”‘’—\s]+|[.,;:!?"'“”‘’—\s]+$/g, '');
    if (clean.length > 2) {
      let pattern = '';
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (/['\u2018\u2019\u201A\u201B]/.test(ch)) {
          pattern += "['\u2018\u2019\u201A\u201B]";
        } else if (/["\u201C\u201D\u201E\u201F]/.test(ch)) {
          pattern += '["\u201C\u201D\u201E\u201F]';
        } else if (/[-–—]/.test(ch)) {
          pattern += '[-–—]';
        } else if (/\s/.test(ch)) {
          pattern += '\\s+';
        } else {
          pattern += escapeRegex(ch);
        }
      }
      const match = new RegExp(pattern, 'i').exec(paragraph);
      if (match && match[0]) {
        return match[0];
      }
    }
  } catch (e) {}

  // 4. Try matching first 5 words
  const words = cleanTarget.split(/\s+/).filter(w => w.length > 2);
  if (words.length >= 3) {
    const headWords = words.slice(0, Math.min(words.length, 5));
    const headPattern = headWords.map(w => escapeRegex(w.replace(/['"“”‘’.,;:!?]/g, ''))).join('\\s+[^\\s]+\\s+|\\s+');
    try {
      const mHead = new RegExp(headPattern, 'i').exec(paragraph);
      if (mHead && mHead[0]) {
        return mHead[0];
      }
    } catch(e) {}
  }

  // 5. Word overlap match with sentences from paragraph
  const sentences = splitIntoSentences(paragraph);
  let bestSentence: string | null = null;
  let maxOverlap = 0;
  const targetWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')));
  
  if (targetWords.size > 0) {
    for (const sent of sentences) {
      const sentWords = sent.split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
      let overlap = 0;
      for (const sw of sentWords) {
        if (sw.length > 2 && targetWords.has(sw)) overlap++;
      }
      if (overlap > maxOverlap && overlap >= Math.min(2, targetWords.size)) {
        maxOverlap = overlap;
        bestSentence = sent;
      }
    }
  }

  return bestSentence;
}

function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const matches = normalized.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  let sentences = (matches || [normalized]).map(s => s.trim()).filter(s => s.length > 10);
  
  if (sentences.length <= 1) {
    const clauseMatches = normalized.split(/;|\s+—\s+|\s+-\s+|,\s+(?:and|but|for|yet|so|because|although)\s+/i);
    const clauses = clauseMatches.map(c => c.trim()).filter(c => c.length > 15);
    if (clauses.length > 1) {
      sentences = clauses;
    }
  }
  return sentences;
}

function generateConductorQuestionForText(pointText: string, index: number): string {
  const lower = pointText.toLowerCase();
  if (lower.includes('because') || lower.includes('reason') || lower.includes('why') || lower.includes('therefore')) {
    return 'What key reason is highlighted here, and why is it so important for us?';
  }
  if (lower.includes('pray') || lower.includes('jehovah') || lower.includes('god')) {
    return 'How does this deepen our personal relationship with Jehovah?';
  }
  if (lower.includes('example') || lower.includes('jesus') || lower.includes('apostle')) {
    return 'What valuable lesson do we learn from this example?';
  }
  if (lower.includes('preach') || lower.includes('ministry') || lower.includes('field service')) {
    return 'How can we apply this practical thought in our Christian ministry?';
  }
  if (lower.includes('trial') || lower.includes('endure') || lower.includes('faith')) {
    return 'How can meditating on this point give us courage during difficult trials?';
  }
  const defaultQuestions = [
    'What additional insight in this sentence helps to round out our answer?',
    'How does this detail strengthen our understanding of the main question?',
    'What practical lesson can we personally take away from this thought?',
    'Why is this supporting point especially encouraging for us today?',
  ];
  return defaultQuestions[index % defaultQuestions.length];
}

function ensureValidConductorData(item: any, idx: number): any {
  if (!item) return item;
  const paragraph: string = item.paragraph || '';
  const sentences = splitIntoSentences(paragraph);
  const primaryAnswer: string = item.highlightedText || '';

  let conductor = item.conductorData;
  if (!conductor || typeof conductor !== 'object') {
    conductor = {
      extraPoints: [],
      scriptureQuestions: [],
      pictureQuestions: [],
      teachingTips: [],
      hasPicture: false,
    };
  }

  // 1. Process or repair extraPoints
  let extraPoints: any[] = Array.isArray(conductor.extraPoints) ? [...conductor.extraPoints] : [];

  extraPoints = extraPoints
    .map((pt: any, pIdx: number) => {
      const match = findExactSubstringInParagraph(paragraph, pt.text);
      const color = COLOR_CYCLE.includes(pt.color) ? pt.color : COLOR_CYCLE[pIdx % COLOR_CYCLE.length];
      const resolvedText = match || pt.text;
      return {
        id: pt.id || `q${idx + 1}-pt${pIdx + 1}`,
        text: resolvedText,
        color,
        label: pt.label || (pIdx === 0 ? 'Primary Insight' : pIdx === 1 ? 'Secondary Thought' : 'Supporting Gem'),
        question: pt.question || generateConductorQuestionForText(resolvedText, pIdx),
        scriptureRef: pt.scriptureRef || undefined,
        type: pt.type || 'supporting',
      };
    })
    .filter((pt: any) => pt.text && paragraph.includes(pt.text));

  // If fewer than 2 valid points, synthesize from sentences in paragraph
  if (extraPoints.length < 2 && sentences.length > 0) {
    const existingTexts = new Set(extraPoints.map(p => p.text));
    const nonAnswerSentences = sentences.filter(s => {
      if (existingTexts.has(s)) return false;
      if (primaryAnswer && (s.includes(primaryAnswer) || primaryAnswer.includes(s))) return false;
      return true;
    });

    const candidates = nonAnswerSentences.length > 0 ? nonAnswerSentences : sentences;
    let colorPointer = extraPoints.length;

    for (const s of candidates) {
      if (extraPoints.length >= 3) break;
      if (existingTexts.has(s)) continue;
      existingTexts.add(s);

      const color = COLOR_CYCLE[colorPointer % COLOR_CYCLE.length];
      colorPointer++;

      const pNum = extraPoints.length + 1;
      extraPoints.push({
        id: `q${idx + 1}-pt${pNum}`,
        text: s,
        color,
        label: pNum === 1 ? 'Primary Insight' : pNum === 2 ? 'Secondary Thought' : 'Supporting Gem',
        question: generateConductorQuestionForText(s, extraPoints.length),
        type: 'supporting',
      });
    }
  }

  // 2. Process or synthesize scriptureQuestions
  let scriptureQuestions: any[] = Array.isArray(conductor.scriptureQuestions) ? [...conductor.scriptureQuestions] : [];
  const allScriptures = [
    ...(Array.isArray(item.readScriptures) ? item.readScriptures : []),
    ...(Array.isArray(item.scriptures) ? item.scriptures : []),
  ];

  if (scriptureQuestions.length === 0 && allScriptures.length > 0) {
    const uniqueRefs = Array.from(new Set(allScriptures));
    uniqueRefs.slice(0, 3).forEach((ref) => {
      const isRead = Array.isArray(item.readScriptures) && item.readScriptures.includes(ref);
      scriptureQuestions.push({
        scriptureRef: ref,
        question: isRead 
          ? `How does this 'Read' scripture directly support the main point in this paragraph?`
          : `What insight does ${ref} add to our discussion?`,
        purpose: 'Help the audience explain the scriptural basis.',
      });
    });
  }

  // 3. Process or synthesize pictureQuestions
  let pictureQuestions: any[] = Array.isArray(conductor.pictureQuestions) ? [...conductor.pictureQuestions] : [];
  const mentionsPicture = /picture|illustration|artwork|image|drawing|photo|scene|depicted/i.test(paragraph) || !!conductor.hasPicture;
  
  if (mentionsPicture && pictureQuestions.length === 0) {
    pictureQuestions.push({
      question: 'What emotions or details in this illustration help us appreciate the lesson?',
      focus: 'Examine the facial expressions and setting depicted in the artwork.',
    });
  }

  // 4. Teaching Tips
  let teachingTips: string[] = Array.isArray(conductor.teachingTips) && conductor.teachingTips.length > 0
    ? conductor.teachingTips
    : [
        'Allow 3 to 5 seconds of pause before calling on hands to allow thoughtful consideration.',
        'If the primary answer is answered quickly, ask a follow-up question on the secondary points.',
      ];

  item.conductorData = {
    ...conductor,
    hasPicture: mentionsPicture || !!conductor.hasPicture,
    pictureDescription: conductor.pictureDescription || (mentionsPicture ? 'Illustration accompanying paragraph' : ''),
    extraPoints,
    scriptureQuestions,
    pictureQuestions,
    teachingTips,
  };

  return item;
}

app.post('/api/gemini/process-article', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please ensure your API key is configured in the Settings > Secrets panel.',
      });
      return;
    }

    const response = await generateWithModelFallback((model) => ({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Parse the following Watchtower article text and extract ALL study questions and their corresponding paragraphs.

CRITICAL EXTRACTION REQUIREMENTS:
1. MULTI-PARAGRAPH QUESTIONS (e.g., questions numbered "1-2.", "1, 2.", "3-4.", "15-16.", or questions with parts (a) and (b)):
   - When a question covers two or more paragraphs, you MUST include the COMPLETE text of ALL covered paragraphs combined into the "paragraph" field (e.g., "1. [Full paragraph 1 text]\n\n2. [Full paragraph 2 text]").
   - NEVER drop or omit Paragraph 1 or any paragraph! Every paragraph and question in the article must be included.
   - For questions with sub-parts like (a) and (b), ensure the suggested comments answer each part clearly.
2. EXTRACT EVERY QUESTION:
   - Extract and analyze every single study question from the beginning to the end of the article. Do not omit any question or stop prematurely.
3. SCRIPTURES & CONDUCTOR HIGHLIGHTS:
   - Extract all scriptures and conductor points across both paragraphs when combined. Include the full text of all cited scriptures using the NWT 2013 edition.

Watchtower article text:
\n\n${text}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'The title of the Watchtower article' },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "A unique ID for the item (e.g., 'q1')" },
                  subheading: {
                    type: Type.STRING,
                    description:
                      'The subheading of the section this paragraph belongs to, if it exists. Subheadings group multiple paragraphs together.',
                  },
                  question: { type: Type.STRING, description: 'The study question' },
                  paragraph: { type: Type.STRING, description: 'The text of the paragraph associated with the question' },
                  highlightedText: {
                    type: Type.STRING,
                    description:
                      'The specific sentence or phrase from the paragraph that directly answers the question or forms the basis of the comment. This MUST be an exact substring of the paragraph.',
                  },
                  scriptures: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "A list of all Bible scripture references found in the paragraph (e.g., 'Matthew 24:14', 'Rev. 21:3, 4').",
                  },
                  readScriptures: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description:
                      "A list of Bible scripture references that are explicitly marked to be 'Read' in the paragraph (usually preceded by 'Read').",
                  },
                  scriptureTexts: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        reference: { type: Type.STRING },
                        text: { type: Type.STRING, description: 'The full text of the scripture from the NWT 2013 edition' },
                      },
                      required: ['reference', 'text'],
                    },
                  },
                  suggestedComment: {
                    type: Type.STRING,
                    description:
                      'A suggested comment for the question based on the paragraph (this should be the same as the first element of suggestedComments)',
                  },
                  suggestedComments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        comment: { type: Type.STRING, description: 'The text of the suggested comment' },
                        scriptureRef: {
                          type: Type.STRING,
                          description:
                            "If this comment is scripture-focused, provide the exact scripture reference (e.g., 'Matthew 24:14') that this comment specifically incorporates and highlights. Leave undefined or empty for a general paragraph comment.",
                        },
                      },
                      required: ['comment'],
                    },
                    description:
                      'A list of up to 3 suggested comments. Comment 1 should be a general response based on the paragraph (same as suggestedComment). Comments 2 and 3 should be distinct alternatives that specifically incorporate and highlight the Bible scriptures cited/referenced in the paragraph, weaving them naturally into the comment, with scriptureRef specified.',
                  },
                  userComment: { type: Type.STRING, description: 'Initially an empty string' },
                  conductorData: {
                    type: Type.OBJECT,
                    properties: {
                      hasPicture: {
                        type: Type.BOOLEAN,
                        description: 'True if a picture, illustration, or visual artwork is referenced or relevant to this paragraph',
                      },
                      pictureDescription: {
                        type: Type.STRING,
                        description: 'Description of the artwork or picture if mentioned or relevant',
                      },
                      extraPoints: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            text: {
                              type: Type.STRING,
                              description: 'EXACT substring from the paragraph for this distinct point. Must match word-for-word so it can be highlighted.',
                            },
                            color: {
                              type: Type.STRING,
                              description: 'One of: emerald, purple, amber, rose, cyan. Each point in a paragraph must use a different color.',
                            },
                            type: {
                              type: Type.STRING,
                              description: 'supporting, scripture_insight, application, or illustration',
                            },
                            label: {
                              type: Type.STRING,
                              description: 'Short label, e.g. Supporting Gem, Scripture Principle, Practical Application, Visual Lesson',
                            },
                            question: {
                              type: Type.STRING,
                              description: 'An engaging follow-up question for the conductor to ask the congregation to draw this point out',
                            },
                            scriptureRef: {
                              type: Type.STRING,
                              description: 'Optional scripture reference if connected to this point',
                            },
                          },
                          required: ['id', 'text', 'color', 'label', 'question'],
                        },
                        description: '2 to 4 distinct key thoughts in the paragraph to help the conductor get all points out, highlighted in different colors',
                      },
                      scriptureQuestions: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            scriptureRef: { type: Type.STRING },
                            question: {
                              type: Type.STRING,
                              description: 'Conductor question asking how this scripture supports or applies to the paragraph',
                            },
                            purpose: { type: Type.STRING, description: 'The teaching goal of this question' },
                          },
                          required: ['scriptureRef', 'question'],
                        },
                        description: 'Questions specifically about the scriptures cited or read in this paragraph',
                      },
                      pictureQuestions: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            question: {
                              type: Type.STRING,
                              description: 'Conductor question to ask about the picture, artwork, or visual lesson',
                            },
                            focus: { type: Type.STRING, description: 'Key visual detail or lesson highlighted' },
                          },
                          required: ['question', 'focus'],
                        },
                        description: 'Questions about the picture or illustration associated with this paragraph',
                      },
                      teachingTips: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Practical tips for the conductor to guide the discussion smoothly',
                      },
                    },
                    required: ['extraPoints', 'scriptureQuestions', 'pictureQuestions'],
                  },
                },
                required: [
                  'id',
                  'question',
                  'paragraph',
                  'highlightedText',
                  'scriptures',
                  'readScriptures',
                  'scriptureTexts',
                  'suggestedComment',
                  'suggestedComments',
                  'userComment',
                  'conductorData',
                ],
              },
            },
            reviewQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "A unique ID for the review question (e.g., 'rq1')" },
                  question: { type: Type.STRING, description: 'The review question text' },
                  suggestedComment: {
                    type: Type.STRING,
                    description: 'A suggested summary comment answering the review question',
                  },
                  userComment: { type: Type.STRING, description: 'Initially an empty string' },
                },
                required: ['id', 'question', 'suggestedComment', 'userComment'],
              },
            },
          },
          required: ['title', 'items', 'reviewQuestions'],
        },
      },
    }));

    const parsed = JSON.parse(response.text || '{}');
    if (parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map((item: any, idx: number) => ensureValidConductorData(item, idx));
    }
    res.json({ ...parsed, originalText: text });
  } catch (error: any) {
    console.error('Error in /api/gemini/process-article:', error);
    const msg = String(error?.message || '');
    if (msg.includes('503') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('unavailable')) {
      res.status(503).json({ error: 'Google AI service is currently overloaded (503 Service Unavailable). Please wait a few seconds and try again.' });
    } else {
      res.status(500).json({ error: msg || 'Failed to process article.' });
    }
  }
});

app.post('/api/gemini/regenerate-comment', async (req, res) => {
  try {
    const { question, paragraph } = req.body;
    if (!question || !paragraph) {
      res.status(400).json({ error: 'Question and paragraph are required.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please ensure your API key is configured in the Settings > Secrets panel.',
      });
      return;
    }

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Based on the following paragraph, generate a list of concise, meaningful, and faith-strengthening suggested comments for the question: "${question}"\n\nParagraph: ${paragraph}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                comment: { type: Type.STRING, description: 'The text of the suggested comment' },
                scriptureRef: {
                  type: Type.STRING,
                  description:
                    "If this comment is scripture-focused, provide the exact scripture reference (e.g., 'Matthew 24:14') that this comment specifically incorporates and highlights. Otherwise, leave empty or omit.",
                },
              },
              required: ['comment'],
            },
            description:
              'A list of up to 3 suggested comments. Comment 1 should be a general response. Comments 2 & 3 should be distinct alternatives specifically incorporating/explaining any cited scriptures from the paragraph. If there is only one scripture or very little information, only generate 1 or 2 high-quality comments.',
          },
        },
      })
    );

    const comments = JSON.parse(response.text || '[]');
    res.json(Array.isArray(comments) && comments.length > 0 ? comments : [{ comment: 'Failed to generate comment.' }]);
  } catch (error: any) {
    console.error('Error in /api/gemini/regenerate-comment:', error);
    const msg = String(error?.message || '');
    if (msg.includes('503') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('unavailable')) {
      res.status(503).json({ error: 'Google AI service is temporarily overloaded (503). Please wait 5 seconds and click Regenerate again.' });
    } else {
      res.status(500).json({ error: msg || 'Failed to regenerate comment.' });
    }
  }
});

app.post('/api/gemini/conductor-analysis', async (req, res) => {
  try {
    const { 
      question, 
      paragraph, 
      scriptures = [], 
      readScriptures = [], 
      scriptureTexts = [], 
      pictureDescription = '', 
      hasPicture = false, 
      imageBase64 = '' 
    } = req.body;

    if (!paragraph || typeof paragraph !== 'string') {
      res.status(400).json({ error: 'Paragraph is required.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please ensure your API key is configured in the Settings > Secrets panel.',
      });
      return;
    }

    const textPrompt = `You are an expert Watchtower Study Conductor preparation specialist.
Your goal is to help the study conductor get ALL the points out in this paragraph during the congregation meeting.

Study Question: "${question || 'Not specified'}"
Paragraph:
"""${paragraph}"""

Scriptures cited in paragraph: ${scriptures.length > 0 ? scriptures.join(', ') : 'None'}
Read scriptures: ${readScriptures.length > 0 ? readScriptures.join(', ') : 'None'}
Scripture texts: ${JSON.stringify(scriptureTexts)}
Picture details: ${pictureDescription ? pictureDescription : (hasPicture ? 'A picture/illustration accompanies this paragraph.' : 'Check if any illustration or visual concept is mentioned or relevant.')}

CONDUCTOR INSTRUCTIONS:
1. Extra Points in Paragraph:
   - Identify 2 to 4 distinct key thoughts, facts, reasons, or secondary gems in the paragraph beyond just the basic answer.
   - For each point, the 'text' field MUST be an EXACT, literal substring from the paragraph text above so it can be highlighted in color.
   - Assign each point a DIFFERENT color from ['emerald', 'purple', 'amber', 'rose', 'cyan'] so they stand out in different colors.
   - For each point, provide an effective, encouraging follow-up conductor question to prompt the congregation to bring that point out if missed.
2. Scripture Questions:
   - Provide 1 to 2 targeted questions specifically examining the cited/read scriptures in this paragraph, prompting the audience to explain how the scripture supports the point.
3. Picture & Artwork Questions:
   - If an image or picture is referenced in the paragraph or provided, generate 1 to 2 discussion questions to bring out the visual lesson, expressions, emotions, or details in the artwork.
   - If no specific picture is mentioned, provide visual reasoning questions about the scene or subject described.
4. Teaching Tips:
   - Provide 1 to 2 brief practical tips for the conductor to encourage broad participation.`;

    const parts: any[] = [];
    if (imageBase64 && typeof imageBase64 === 'string') {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const mimeMatch = imageBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }
    parts.push({ text: textPrompt });

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hasPicture: { type: Type.BOOLEAN },
              pictureDescription: { type: Type.STRING },
              extraPoints: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING, description: 'EXACT substring from the paragraph' },
                    color: { type: Type.STRING, description: 'One of emerald, purple, amber, rose, cyan' },
                    type: { type: Type.STRING, description: 'supporting, scripture_insight, application, or illustration' },
                    label: { type: Type.STRING, description: 'Short label like Supporting Gem, Scripture Principle, Practical Application' },
                    question: { type: Type.STRING, description: 'Conductor question to draw this point out' },
                    scriptureRef: { type: Type.STRING },
                  },
                  required: ['id', 'text', 'color', 'label', 'question'],
                },
              },
              scriptureQuestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scriptureRef: { type: Type.STRING },
                    question: { type: Type.STRING },
                    purpose: { type: Type.STRING },
                  },
                  required: ['scriptureRef', 'question'],
                },
              },
              pictureQuestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    focus: { type: Type.STRING },
                  },
                  required: ['question', 'focus'],
                },
              },
              teachingTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['extraPoints', 'scriptureQuestions', 'pictureQuestions'],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '{}');
    const dummyItem = {
      paragraph,
      highlightedText: '',
      scriptures,
      readScriptures,
      conductorData: parsed,
    };
    const validated = ensureValidConductorData(dummyItem, 0);
    res.json(validated.conductorData);
  } catch (error: any) {
    console.error('Error in /api/gemini/conductor-analysis:', error);
    const msg = String(error?.message || '');
    if (msg.includes('503') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('unavailable')) {
      res.status(503).json({ error: 'Google AI service is temporarily overloaded (503). Please wait a few seconds and try again.' });
    } else {
      res.status(500).json({ error: msg || 'Failed to generate conductor analysis.' });
    }
  }
});

app.post('/api/gemini/conductor-analysis-batch', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Array of items is required.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
      return;
    }

    const results = await Promise.all(
      items.map(async (it: any, idx: number) => {
        try {
          const textPrompt = `You are an expert Watchtower Study Conductor preparation specialist.
Your goal is to help the study conductor get ALL the points out in this paragraph.

Question: "${it.question || ''}"
Paragraph:
"""${it.paragraph}"""

Scriptures: ${(it.scriptures || []).join(', ')}
Read Scriptures: ${(it.readScriptures || []).join(', ')}

Provide 2 to 4 distinct points with exact substrings from the paragraph, conductor follow-up questions, scripture questions, picture questions (if applicable), and conductor tips.`;

          const response = await callGeminiWithRetry(() =>
            ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: [{ role: 'user', parts: [{ text: textPrompt }] }],
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    hasPicture: { type: Type.BOOLEAN },
                    pictureDescription: { type: Type.STRING },
                    extraPoints: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING },
                          text: { type: Type.STRING },
                          color: { type: Type.STRING },
                          type: { type: Type.STRING },
                          label: { type: Type.STRING },
                          question: { type: Type.STRING },
                          scriptureRef: { type: Type.STRING },
                        },
                        required: ['id', 'text', 'color', 'label', 'question'],
                      },
                    },
                    scriptureQuestions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          scriptureRef: { type: Type.STRING },
                          question: { type: Type.STRING },
                          purpose: { type: Type.STRING },
                        },
                        required: ['scriptureRef', 'question'],
                      },
                    },
                    pictureQuestions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          question: { type: Type.STRING },
                          focus: { type: Type.STRING },
                        },
                        required: ['question', 'focus'],
                      },
                    },
                    teachingTips: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['extraPoints', 'scriptureQuestions', 'pictureQuestions'],
                },
              },
            })
          );

          const parsed = JSON.parse(response.text || '{}');
          const dummy = {
            ...it,
            conductorData: parsed,
          };
          const validated = ensureValidConductorData(dummy, idx);
          return { id: it.id, conductorData: validated.conductorData };
        } catch (e) {
          // If Gemini fails for this individual item, synthesize using local fallback
          const dummy = { ...it, conductorData: it.conductorData || {} };
          const fallback = ensureValidConductorData(dummy, idx);
          return { id: it.id, conductorData: fallback.conductorData };
        }
      })
    );

    res.json({ results });
  } catch (error: any) {
    console.error('Error in /api/gemini/conductor-analysis-batch:', error);
    res.status(500).json({ error: error?.message || 'Failed to process batch conductor analysis.' });
  }
});

const DATA_DIR = path.resolve(__dirname, 'data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');

function readArticlesFromDisk(): any[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(ARTICLES_FILE)) {
      const raw = fs.readFileSync(ARTICLES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error('Failed to read articles from disk:', err);
  }
  return [];
}

function writeArticlesToDisk(articles: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write articles to disk:', err);
  }
}

app.get('/api/articles', (_req, res) => {
  const articles = readArticlesFromDisk();
  res.json({ articles });
});

app.post('/api/articles', (req, res) => {
  const article = req.body;
  if (!article || !article.id) {
    res.status(400).json({ error: 'Article record with id is required.' });
    return;
  }
  const articles = readArticlesFromDisk();
  const idx = articles.findIndex((a: any) => a.id === article.id);
  if (idx > -1) {
    articles[idx] = article;
  } else {
    articles.unshift(article);
  }
  writeArticlesToDisk(articles);
  res.json({ success: true, article });
});

app.post('/api/articles/sync', (req, res) => {
  const { articles: clientArticles } = req.body;
  if (!Array.isArray(clientArticles)) {
    res.status(400).json({ error: 'articles array is required.' });
    return;
  }
  const diskArticles = readArticlesFromDisk();
  const mergedMap = new Map<string, any>();
  for (const a of diskArticles) {
    if (a && a.id) mergedMap.set(a.id, a);
  }
  for (const a of clientArticles) {
    if (a && a.id) {
      const existing = mergedMap.get(a.id);
      if (!existing || (a.createdAt && (!existing.createdAt || a.createdAt >= existing.createdAt))) {
        mergedMap.set(a.id, a);
      }
    }
  }
  const merged = Array.from(mergedMap.values());
  writeArticlesToDisk(merged);
  res.json({ success: true, articles: merged });
});

app.delete('/api/articles/:id', (req, res) => {
  const { id } = req.params;
  let articles = readArticlesFromDisk();
  articles = articles.filter((a: any) => a.id !== id);
  writeArticlesToDisk(articles);
  res.json({ success: true });
});

// Explicit catch-all for /api/* to NEVER let API requests fall through to Vite SPA html handler
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}.`,
  });
});

// Global Express JSON error handler to prevent HTML error responses
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Express error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
