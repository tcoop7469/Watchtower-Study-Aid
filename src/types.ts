export interface ScriptureContent {
  reference: string;
  text: string;
}

export interface AdditionalNote {
  id: string;
  type: 'text' | 'image';
  content: string;
}

export interface StudyItem {
  id: string;
  question: string;
  paragraph: string;
  highlightedText: string;
  scriptures: string[];
  readScriptures: string[];
  scriptureTexts: ScriptureContent[];
  suggestedComment: string;
  userComment: string;
  additionalNotes?: AdditionalNote[];
}

export interface WatchtowerArticle {
  title: string;
  items: StudyItem[];
  originalText: string;
}
