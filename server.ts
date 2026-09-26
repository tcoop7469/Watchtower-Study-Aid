import express from 'express';
import path from 'path';
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

app.use(express.json({ limit: '10mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Parse the following Watchtower article text and generate suggested comments for each question based on its paragraph. Also include the full text of all cited scriptures using the NWT 2013 edition: \n\n${text}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
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
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ ...parsed, originalText: text });
  } catch (error: any) {
    console.error('Error in /api/gemini/process-article:', error);
    res.status(500).json({ error: error?.message || 'Failed to process article.' });
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

    const response = await ai.models.generateContent({
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
    });

    const comments = JSON.parse(response.text || '[]');
    res.json(Array.isArray(comments) && comments.length > 0 ? comments : [{ comment: 'Failed to generate comment.' }]);
  } catch (error: any) {
    console.error('Error in /api/gemini/regenerate-comment:', error);
    res.status(500).json({ error: error?.message || 'Failed to regenerate comment.' });
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

    const response = await ai.models.generateContent({
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
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/gemini/conductor-analysis:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate conductor analysis.' });
  }
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
