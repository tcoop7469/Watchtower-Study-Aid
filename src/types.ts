export interface ScriptureContent {
  reference: string;
  text: string;
}

export interface AdditionalNote {
  id: string;
  type: 'text' | 'image';
  content: string;
}

export interface SuggestedCommentOption {
  comment: string;
  scriptureRef?: string;
}

export interface StudyItem {
  id: string;
  subheading?: string;
  question: string;
  paragraph: string;
  highlightedText: string;
  scriptures: string[];
  readScriptures: string[];
  scriptureTexts: ScriptureContent[];
  suggestedComment: string;
  suggestedComments?: (string | SuggestedCommentOption)[];
  userComment: string;
  additionalNotes?: AdditionalNote[];
}

export interface ReviewQuestion {
  id: string;
  question: string;
  suggestedComment: string;
  userComment: string;
}

export interface WatchtowerArticle {
  title: string;
  items: StudyItem[];
  reviewQuestions: ReviewQuestion[];
  originalText: string;
  studyDate?: string;
}
