export interface ScriptureContent {
  reference: string;
  text: string;
}

export interface AdditionalNote {
  id: string;
  type: 'text' | 'image';
  content: string;
  caption?: string;
}

export interface SuggestedCommentOption {
  comment: string;
  scriptureRef?: string;
}

export type ConductorPointColor = 'emerald' | 'purple' | 'amber' | 'rose' | 'cyan';

export interface ConductorPoint {
  id: string;
  text: string;
  color: ConductorPointColor;
  type?: 'supporting' | 'scripture_insight' | 'application' | 'illustration';
  label: string;
  question: string;
  scriptureRef?: string;
}

export interface ScriptureQuestion {
  scriptureRef: string;
  question: string;
  purpose?: string;
}

export interface PictureQuestion {
  question: string;
  focus?: string;
}

export interface ConductorData {
  extraPoints: ConductorPoint[];
  scriptureQuestions: ScriptureQuestion[];
  pictureQuestions: PictureQuestion[];
  hasPicture?: boolean;
  pictureDescription?: string;
  pictureUrl?: string;
  teachingTips?: string[];
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
  conductorData?: ConductorData;
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
