import { StudyItem, ConductorData, ConductorPoint, ConductorPointColor, WatchtowerArticle, ScriptureQuestion, PictureQuestion } from '../types';

export const COLOR_CYCLE: ConductorPointColor[] = ['emerald', 'purple', 'amber', 'rose', 'cyan'];

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Robust substring matcher that handles typographical differences:
 * - Smart quotes: “ ” ' ‘ ’
 * - Em/en dashes: — –
 * - Whitespace & linebreaks
 * - Word overlap fallback to the exact matching sentence in the paragraph
 */
export function findBestSubstringMatch(paragraph: string, targetText: string): string | null {
  if (!paragraph || !targetText) return null;
  const cleanTarget = targetText.trim();
  if (!cleanTarget) return null;

  // 1. Literal exact match
  if (paragraph.includes(cleanTarget)) return cleanTarget;

  // 2. Case-insensitive exact match
  const lowerPara = paragraph.toLowerCase();
  const lowerTarget = cleanTarget.toLowerCase();
  const lowerIdx = lowerPara.indexOf(lowerTarget);
  if (lowerIdx !== -1) {
    return paragraph.substring(lowerIdx, lowerIdx + cleanTarget.length);
  }

  // 3. Flexible typography regex
  try {
    const trimmedTarget = cleanTarget.replace(/^[.,;:!?"'“”‘’—\s]+|[.,;:!?"'“”‘’—\s]+$/g, '');
    if (trimmedTarget.length > 2) {
      let pattern = '';
      for (let i = 0; i < trimmedTarget.length; i++) {
        const ch = trimmedTarget[i];
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

  // 4. Match full sentence via word overlap (NEVER return partial 4-5 words)
  const sentences = splitParagraphIntoSentences(paragraph);
  const words = cleanTarget.split(/\s+/).filter(w => w.length > 2);
  let bestSentence: string | null = null;
  let maxOverlap = 0;

  const targetWordSet = new Set(words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')));
  if (targetWordSet.size > 0) {
    for (const sent of sentences) {
      const sentWords = sent.split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
      let overlap = 0;
      for (const sw of sentWords) {
        if (sw.length > 2 && targetWordSet.has(sw)) {
          overlap++;
        }
      }
      if (overlap > maxOverlap && overlap >= Math.min(2, Math.floor(targetWordSet.size * 0.4))) {
        maxOverlap = overlap;
        bestSentence = sent;
      }
    }
  }

  return bestSentence;
}

/**
 * Splits a paragraph into clean, meaningful sentences and clauses.
 */
export function splitParagraphIntoSentences(text: string): string[] {
  if (!text) return [];
  // Normalize whitespace
  const normalized = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Match sentences ending in punctuation
  const matches = normalized.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  let sentences = (matches || [normalized])
    .map(s => s.trim())
    .filter(s => s.length > 12);

  // If paragraph only had 1 sentence or very few, break down by clauses
  if (sentences.length <= 1) {
    const clauseMatches = normalized.split(/;|\s+—\s+|\s+-\s+|,\s+(?:and|but|for|yet|so|because|although)\s+/i);
    const clauses = clauseMatches.map(c => c.trim()).filter(c => c.length > 15);
    if (clauses.length > 1) {
      sentences = clauses;
    }
  }

  return sentences;
}

/**
 * Generates an authentic Watchtower Study Conductor follow-up question.
 */
export function generateConductorQuestionForText(pointText: string, mainQuestion?: string, index: number = 0): string {
  const lower = pointText.toLowerCase();

  if (lower.includes('because') || lower.includes('reason') || lower.includes('why') || lower.includes('therefore')) {
    return 'What key reason is highlighted here, and why is it so important for us?';
  }
  if (lower.includes('pray') || lower.includes('supplication') || lower.includes('jehovah') || lower.includes('god')) {
    return 'How does this deepen our personal relationship with Jehovah?';
  }
  if (lower.includes('example') || lower.includes('jesus') || lower.includes('christ') || lower.includes('apostle')) {
    return 'What valuable lesson do we learn from this example?';
  }
  if (lower.includes('preach') || lower.includes('ministry') || lower.includes('witness') || lower.includes('field service')) {
    return 'How can we apply this practical thought in our Christian ministry?';
  }
  if (lower.includes('congregation') || lower.includes('brother') || lower.includes('sister') || lower.includes('love') || lower.includes('fellowship')) {
    return 'How can this thought strengthen love and unity in our congregation?';
  }
  if (lower.includes('trial') || lower.includes('endure') || lower.includes('discourage') || lower.includes('faith') || lower.includes('faithful')) {
    return 'How can meditating on this point give us courage during difficult trials?';
  }
  if (lower.includes('family') || lower.includes('marriage') || lower.includes('children') || lower.includes('youth') || lower.includes('parents')) {
    return 'How can Christian families put this counsel into practice?';
  }

  const defaultQuestions = [
    'What additional insight in this sentence helps to round out our answer?',
    'How does this detail strengthen our understanding of the main question?',
    'What practical lesson can we personally take away from this thought?',
    'Why is this supporting point especially encouraging for us today?',
  ];

  return defaultQuestions[index % defaultQuestions.length];
}

/**
 * Guarantees that a single StudyItem has rich, valid conductor data.
 * If conductorData is missing, incomplete, or has 0 points, it auto-synthesizes full points immediately.
 */
export function ensureValidConductorData(item: StudyItem, idx: number): ConductorData {
  const paragraph: string = item.paragraph || '';
  const sentences = splitParagraphIntoSentences(paragraph);
  const primaryAnswer: string = item.highlightedText || '';

  const conductor = item.conductorData || {
    extraPoints: [],
    scriptureQuestions: [],
    pictureQuestions: [],
    teachingTips: [],
    hasPicture: false,
  };

  // 1. Process and heal existing extraPoints
  const usedTexts = new Set<string>();
  const validPoints: ConductorPoint[] = [];

  const rawExtraPoints = Array.isArray(conductor.extraPoints) ? conductor.extraPoints : [];

  for (let pIdx = 0; pIdx < rawExtraPoints.length; pIdx++) {
    const pt = rawExtraPoints[pIdx];
    let ptText = (pt.text || '').trim();

    // If point text is missing, find a match
    if (!paragraph.includes(ptText) || ptText.length < 25) {
      const match = findBestSubstringMatch(paragraph, ptText);
      if (match) ptText = match;
    }

    // If point text is a truncated fragment of a sentence in the paragraph, heal to full sentence!
    const containingSentence = sentences.find(s => s.includes(ptText) || (ptText.length > 15 && s.toLowerCase().includes(ptText.toLowerCase())));
    if (containingSentence) {
      ptText = containingSentence;
    }

    // Ensure it exists in paragraph
    if (!paragraph.includes(ptText)) {
      continue;
    }

    // Ensure uniqueness: never highlight the same sentence multiple times in the same paragraph
    if (usedTexts.has(ptText)) {
      continue;
    }

    usedTexts.add(ptText);

    const color = COLOR_CYCLE.includes(pt.color as ConductorPointColor) 
      ? (pt.color as ConductorPointColor) 
      : COLOR_CYCLE[validPoints.length % COLOR_CYCLE.length];

    const pNum = validPoints.length + 1;
    validPoints.push({
      id: pt.id || `q${idx + 1}-pt${pNum}`,
      text: ptText,
      color,
      label: pt.label || (pNum === 1 ? 'Primary Insight' : pNum === 2 ? 'Secondary Thought' : 'Supporting Gem'),
      question: pt.question || generateConductorQuestionForText(ptText, item.question, validPoints.length),
      scriptureRef: pt.scriptureRef || undefined,
      type: pt.type || 'supporting',
    });
  }

  // If fewer than 2 valid points, synthesize from unused sentences in paragraph
  if (validPoints.length < 2 && sentences.length > 0) {
    // Non-answer sentences preferred
    const candidateSentences = sentences.filter(s => {
      if (usedTexts.has(s)) return false;
      if (primaryAnswer && (s.includes(primaryAnswer) || primaryAnswer.includes(s))) return false;
      return true;
    });

    const fallbackSentences = candidateSentences.length > 0 
      ? candidateSentences 
      : sentences.filter(s => !usedTexts.has(s));

    for (const s of fallbackSentences) {
      if (validPoints.length >= 3) break;
      if (usedTexts.has(s)) continue;
      usedTexts.add(s);

      const color = COLOR_CYCLE[validPoints.length % COLOR_CYCLE.length];
      const pNum = validPoints.length + 1;
      const label = pNum === 1 ? 'Primary Insight' : pNum === 2 ? 'Secondary Thought' : 'Supporting Gem';

      validPoints.push({
        id: `q${idx + 1}-pt${pNum}`,
        text: s,
        color,
        label,
        question: generateConductorQuestionForText(s, item.question, validPoints.length),
        type: 'supporting',
      });
    }
  }

  // 2. Scripture Questions
  let scriptureQuestions: ScriptureQuestion[] = Array.isArray(conductor.scriptureQuestions) 
    ? [...conductor.scriptureQuestions] 
    : [];
    
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
          ? `How does reading ${ref} directly underscore the main lesson in this paragraph?`
          : `What valuable insight does ${ref} add to our discussion?`,
        purpose: 'Guide the audience to explain the scriptural foundation.',
      });
    });
  }

  // 3. Picture & Artwork Questions
  let pictureQuestions: PictureQuestion[] = Array.isArray(conductor.pictureQuestions) 
    ? [...conductor.pictureQuestions] 
    : [];
    
  const mentionsPicture = /picture|illustration|artwork|image|drawing|photo|scene|depicted/i.test(paragraph) || !!conductor.hasPicture;

  if (mentionsPicture && pictureQuestions.length === 0) {
    pictureQuestions.push({
      question: 'What details or expressions in the illustration help us appreciate the lesson taught here?',
      focus: 'Examine the visual setting, emotions, and practical application portrayed.',
    });
  }

  // 4. Teaching Tips
  let teachingTips: string[] = Array.isArray(conductor.teachingTips) && conductor.teachingTips.length > 0
    ? conductor.teachingTips
    : [
        'Allow 3 to 5 seconds of pause before calling on hands to encourage thoughtful participation.',
        'If the initial response is brief, invite comments on the highlighted secondary points.',
      ];

  return {
    ...conductor,
    hasPicture: mentionsPicture || !!conductor.hasPicture,
    pictureDescription: conductor.pictureDescription || (mentionsPicture ? 'Illustration accompanying paragraph' : ''),
    extraPoints: validPoints,
    scriptureQuestions,
    pictureQuestions,
    teachingTips,
  };
}

/**
 * Ensures that EVERY item in an entire WatchtowerArticle has complete, valid conductor data.
 * Safe to call on newly parsed, imported, or library articles.
 */
export function ensureArticleConductorData(article: WatchtowerArticle): WatchtowerArticle {
  if (!article || !Array.isArray(article.items)) return article;

  const healedItems = article.items.map((item, idx) => {
    const conductorData = ensureValidConductorData(item, idx);
    return {
      ...item,
      conductorData,
    };
  });

  return {
    ...article,
    items: healedItems,
  };
}
