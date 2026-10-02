/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, 
  Send, 
  Copy, 
  Check, 
  Trash2, 
  MessageSquare, 
  RefreshCw,
  Info,
  Sun,
  Moon,
  FileText,
  Layout,
  Download,
  Upload,
  ChevronDown,
  ChevronUp,
  Sparkles,
  User,
  Plus,
  Save,
  Image as ImageIcon,
  Type,
  X,
  Pin,
  PinOff,
  Settings,
  Sliders,
  Library as LibraryIcon,
  LogOut,
  ImagePlus,
  Calendar,
  Users,
  Printer,
  FileCode,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { processArticle, regenerateComment } from "./services/geminiService";
import { WatchtowerArticle, StudyItem, SuggestedCommentOption, ConductorData, ConductorPointColor, ConductorPoint } from "./types";
import { ConductorSidePanel, COLOR_CONFIG } from "./components/ConductorSidePanel";
import { ensureArticleConductorData, splitParagraphIntoSentences, getParagraphDisplayLabel, getQuestionDisplayLabel } from "./utils/conductorEngine";
import { ImageReferenceNote } from "./components/ImageReferenceNote";
import { processImageFile } from "./utils/imageUtils";
import { cn } from "@/lib/utils";
import { Library, ArticleRecord, formatDisplayDate } from "./components/Library";

export default function App() {
  const [inputText, setInputText] = useState("");
  const [article, setArticle] = useState<WatchtowerArticle | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Dashboard fields
  const [articleDate, setArticleDate] = useState("");

  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [collapsedUserComments, setCollapsedUserComments] = useState<Set<string>>(new Set());
  const [collapsedSuggestions, setCollapsedSuggestions] = useState<Set<string>>(new Set());
  const [collapsedNotes, setCollapsedNotes] = useState<Set<string>>(new Set());
  const [pinnedSuggestions, setPinnedSuggestions] = useState<Set<string>>(new Set());
  const [pinnedUserComments, setPinnedUserComments] = useState<Set<string>>(new Set());
  const [selectedScripture, setSelectedScripture] = useState<{ reference: string; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState("import"); // 'import' is the default dashboard
  const [fontSizeParagraph, setFontSizeParagraph] = useState(16);
  const [fontSizeComment, setFontSizeComment] = useState(16);

  // Conductor Mode State
  const [isConductorOpen, setIsConductorOpen] = useState(false);
  const [conductorIndex, setConductorIndex] = useState(0);
  const [showConductorHighlights, setShowConductorHighlights] = useState(true);
  const [focusedPointText, setFocusedPointText] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Initialize theme and font sizes from system preference or local storage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }

    const savedPSize = localStorage.getItem("fontSizeParagraph");
    if (savedPSize) setFontSizeParagraph(parseInt(savedPSize));

    const savedCSize = localStorage.getItem("fontSizeComment");
    if (savedCSize) setFontSizeComment(parseInt(savedCSize));
  }, []);

  useEffect(() => {
    localStorage.setItem("fontSizeParagraph", fontSizeParagraph.toString());
  }, [fontSizeParagraph]);

  useEffect(() => {
    localStorage.setItem("fontSizeComment", fontSizeComment.toString());
  }, [fontSizeComment]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      return next;
    });
  };

  const saveArticleToDB = async (parsedArticle: WatchtowerArticle, dateOverride?: string) => {
    const newId = Math.random().toString(36).substring(2, 10);
    try {
      const resolvedDate = dateOverride !== undefined ? dateOverride : (articleDate || parsedArticle.studyDate || "");
      const healedArticle = ensureArticleConductorData(parsedArticle);
      const articleWithDate: WatchtowerArticle = {
        ...healedArticle,
        studyDate: resolvedDate
      };
      const record: ArticleRecord = {
        id: newId,
        userId: "local-user",
        title: articleWithDate.title || "Untitled Article",
        date: resolvedDate,
        createdAt: Date.now(),
        articleData: JSON.stringify(articleWithDate),
        coverUrl: ""
      };
      
      const stored = localStorage.getItem('watchtower-articles');
      let articles: ArticleRecord[] = [];
      if (stored) {
        try {
          articles = JSON.parse(stored);
        } catch(e) {}
      }
      
      articles.push(record);
      localStorage.setItem('watchtower-articles', JSON.stringify(articles));
      window.dispatchEvent(new Event('articlesUpdated'));
      
      return newId;
    } catch (err) {
      console.error("Failed to save article:", err);
      return null;
    }
  };

  const handleImport = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await processArticle(inputText);
      const healedResult = ensureArticleConductorData(result);
      healedResult.studyDate = articleDate;
      setArticle(healedResult);
      const allIds = [
        ...healedResult.items.map(item => item.id),
        ...healedResult.reviewQuestions.map(q => q.id)
      ];
      setCollapsedSuggestions(new Set(allIds));
      setCollapsedUserComments(new Set(allIds));
      setCollapsedNotes(new Set()); // New articles have no notes yet
      
      const newId = await saveArticleToDB(healedResult, articleDate);
      if (newId) setActiveArticleId(newId);

      setActiveTab("study");
      setInputText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Save article when it changes
  useEffect(() => {
    if (activeArticleId && article) {
      const updateDB = async () => {
        try {
          const stored = localStorage.getItem('watchtower-articles');
          if (!stored) return;
          
          const articles: ArticleRecord[] = JSON.parse(stored);
          const updated = articles.map(a => {
            if (a.id === activeArticleId) {
              const resolvedDate = articleDate || article.studyDate || a.date || "";
              const articleWithDate: WatchtowerArticle = {
                ...article,
                studyDate: resolvedDate
              };
              return {
                ...a,
                articleData: JSON.stringify(articleWithDate),
                title: article.title || "Untitled Article",
                date: resolvedDate
              };
            }
            return a;
          });
          
          localStorage.setItem('watchtower-articles', JSON.stringify(updated));
          window.dispatchEvent(new Event('articlesUpdated'));
        } catch (err) {
          console.error("Failed to auto-save", err);
        }
      };
      // debounce slightly
      const timer = setTimeout(updateDB, 1000);
      return () => clearTimeout(timer);
    }
  }, [article, activeArticleId, articleDate]);

  const handleUpdateComment = (id: string, newComment: string) => {
    if (!article) return;
    setArticle({
      ...article,
      items: article.items.map(item => 
        item.id === id ? { ...item, userComment: newComment } : item
      ),
      reviewQuestions: article.reviewQuestions.map(q => 
        q.id === id ? { ...q, userComment: newComment } : q
      )
    });
  };

  const handleRegenerate = async (id: string, question: string, paragraph: string) => {
    if (!article) return;
    setRegeneratingId(id);
    try {
      const newComments = await regenerateComment(question, paragraph);
      setArticle({
        ...article,
        items: article.items.map(item => 
          item.id === id ? { ...item, suggestedComment: newComments[0]?.comment || "", suggestedComments: newComments } : item
        )
      });
    } catch (err) {
      console.error("Failed to regenerate comment:", err);
      setError("Failed to regenerate comment. Please try again.");
    } finally {
      setRegeneratingId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAllComments = () => {
    if (!article) return;
    const allComments = article.items
      .map((item, index) => `${getQuestionDisplayLabel(item.question, index)}: ${item.question}\nComment: ${item.userComment}`)
      .join("\n\n");
    navigator.clipboard.writeText(allComments);
    setCopiedId("all");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generateConductorTextSummary = (art: WatchtowerArticle, sDate?: string): string => {
    const dateStr = sDate || art.studyDate || "No date specified";
    let output = `================================================================================\n`;
    output += `WATCHTOWER STUDY - CONDUCTOR PREPARATION SHEET\n`;
    output += `================================================================================\n`;
    output += `Article: ${art.title || "Untitled Article"}\n`;
    output += `Study Date: ${dateStr}\n`;
    output += `Total Questions: ${art.items.length}\n`;
    output += `Exported: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;

    art.items.forEach((item, index) => {
      output += `--------------------------------------------------------------------------------\n`;
      output += `${getParagraphDisplayLabel(item.question, index).toUpperCase()}${item.subheading ? ` - [${item.subheading}]` : ''}\n`;
      output += `--------------------------------------------------------------------------------\n`;
      output += `Question: ${item.question}\n\n`;
      if (item.highlightedText) {
        output += `Primary Answer: "${item.highlightedText}"\n\n`;
      }

      const conductor = item.conductorData;

      // Conductor Extra Points with Color Tags
      if (conductor?.extraPoints && conductor.extraPoints.length > 0) {
        output += `* CONDUCTOR EXTRA POINTS & FOLLOW-UP QUESTIONS:\n`;
        conductor.extraPoints.forEach((point, pIdx) => {
          const colorLabel = point.color ? point.color.toUpperCase() : 'EXTRA';
          output += `  ${pIdx + 1}. [${colorLabel}] ${point.label || 'Extra Point'}:\n`;
          if (point.text) {
            output += `     Paragraph Excerpt: "${point.text}"\n`;
          }
          output += `     Follow-Up Question: "${point.question}"\n`;
          if (point.scriptureRef) {
            output += `     Scripture Basis: ${point.scriptureRef}\n`;
          }
        });
        output += `\n`;
      }

      // Scripture Application Questions
      if (conductor?.scriptureQuestions && conductor.scriptureQuestions.length > 0) {
        output += `* SCRIPTURE APPLICATION QUESTIONS:\n`;
        conductor.scriptureQuestions.forEach((sq) => {
          const isRead = item.readScriptures.some(rs => rs.includes(sq.scriptureRef) || sq.scriptureRef.includes(rs));
          output += `  - ${sq.scriptureRef}${isRead ? ' (READ SCRIPTURE)' : ''}:\n`;
          output += `    Question: "${sq.question}"\n`;
          if (sq.purpose) {
            output += `    Purpose: ${sq.purpose}\n`;
          }
        });
        output += `\n`;
      } else if (item.scriptures.length > 0) {
        output += `* SCRIPTURES CITED:\n  ${item.scriptures.join(', ')}\n\n`;
      }

      // Picture & Artwork Questions
      if (conductor?.hasPicture || conductor?.pictureQuestions?.length) {
        output += `* PICTURE & ARTWORK DISCUSSION:\n`;
        if (conductor.pictureDescription) {
          output += `  Illustration Details: ${conductor.pictureDescription}\n`;
        }
        if (conductor.pictureQuestions && conductor.pictureQuestions.length > 0) {
          conductor.pictureQuestions.forEach((pq, pqIdx) => {
            output += `  ${pqIdx + 1}. Question: "${pq.question}"\n`;
            if (pq.focus) {
              output += `     Visual Focus: ${pq.focus}\n`;
            }
          });
        }
        output += `\n`;
      }

      // Teaching Tips
      if (conductor?.teachingTips && conductor.teachingTips.length > 0) {
        output += `* CONDUCTOR TEACHING TIPS:\n`;
        conductor.teachingTips.forEach((tip) => {
          output += `  - ${tip}\n`;
        });
        output += `\n`;
      }

      if (item.userComment) {
        output += `* MY PERSONAL COMMENT:\n  ${item.userComment}\n\n`;
      }

      if (item.additionalNotes && item.additionalNotes.length > 0) {
        output += `* PERSONAL NOTES & IMAGE REFERENCES:\n`;
        item.additionalNotes.forEach((n, nIdx) => {
          if (n.type === 'text' && n.content) {
            output += `  - Note ${nIdx + 1}: ${n.content}\n`;
          } else if (n.type === 'image' && n.content) {
            output += `  - Image Reference ${nIdx + 1}: ${n.caption ? `[${n.caption}] ` : ''}${n.content.startsWith('http') ? n.content : '[Attached Picture]'}\n`;
          }
        });
        output += `\n`;
      }
    });

    if (art.reviewQuestions && art.reviewQuestions.length > 0) {
      output += `================================================================================\n`;
      output += `HOW WOULD YOU ANSWER? (REVIEW QUESTIONS)\n`;
      output += `================================================================================\n`;
      art.reviewQuestions.forEach((rq, i) => {
        output += `Review Question ${i + 1}: ${rq.question}\n`;
        if (rq.suggestedComment) {
          output += `Suggested Answer: ${rq.suggestedComment}\n`;
        }
        if (rq.userComment) {
          output += `My Answer: ${rq.userComment}\n`;
        }
        output += `\n`;
      });
    }

    return output;
  };

  const generateConductorHTML = (art: WatchtowerArticle, sDate?: string): string => {
    const dateStr = sDate || art.studyDate || "No date specified";
    const title = art.title || "Watchtower Study";
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Watchtower Conductor Guide</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #1e293b;
      --card-bg: #f8fafc;
      --border: #e2e8f0;
      --emerald-bg: #ecfdf5; --emerald-border: #10b981; --emerald-text: #065f46;
      --purple-bg: #faf5ff; --purple-border: #a855f7; --purple-text: #6b21a8;
      --amber-bg: #fffbeb; --amber-border: #f59e0b; --amber-text: #92400e;
      --rose-bg: #fff1f2; --rose-border: #f43f5e; --rose-text: #9f1239;
      --cyan-bg: #ecfeff; --cyan-border: #06b6d4; --cyan-text: #155e75;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background-color: var(--bg);
      max-width: 860px;
      margin: 0 auto;
      padding: 24px;
    }
    @media print {
      body { padding: 0; max-width: 100%; }
      .no-print { display: none !important; }
      .paragraph-card { break-inside: avoid; page-break-inside: avoid; margin-bottom: 24px; }
    }
    .header-bar {
      border-bottom: 2px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .print-btn {
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .paragraph-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .paragraph-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .main-question {
      font-size: 15px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 12px;
      background: #ffffff;
      padding: 10px 14px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
    }
    .primary-basis {
      font-size: 13px;
      font-style: italic;
      color: #475569;
      background: #f1f5f9;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 14px;
    }
    .point-card {
      padding: 12px 14px;
      border-radius: 8px;
      margin-bottom: 10px;
      border-left: 4px solid;
    }
    .point-emerald { background: var(--emerald-bg); border-color: var(--emerald-border); color: var(--emerald-text); }
    .point-purple { background: var(--purple-bg); border-color: var(--purple-border); color: var(--purple-text); }
    .point-amber { background: var(--amber-bg); border-color: var(--amber-border); color: var(--amber-text); }
    .point-rose { background: var(--rose-bg); border-color: var(--rose-border); color: var(--rose-text); }
    .point-cyan { background: var(--cyan-bg); border-color: var(--cyan-border); color: var(--cyan-text); }
    .point-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0,0,0,0.06);
      margin-bottom: 4px;
    }
    .point-question {
      font-size: 14px;
      font-weight: 600;
      margin: 4px 0;
    }
    .point-excerpt {
      font-size: 12px;
      font-style: italic;
      opacity: 0.9;
    }
    .scripture-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 8px;
    }
    .scripture-ref {
      font-weight: 700;
      font-size: 13px;
      color: #6b21a8;
    }
    .read-badge {
      background: #2563eb;
      color: white;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 6px;
    }
    .picture-box {
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-radius: 8px;
      padding: 12px 14px;
      margin-top: 12px;
    }
    .tips-box {
      background: #fefce8;
      border: 1px solid #fef08a;
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 12px;
      font-size: 12px;
      color: #713f12;
    }
    .user-comment-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 12px;
      font-size: 13px;
      color: #1e3a8a;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1 style="margin:0 0 4px 0; font-size: 24px;">${title}</h1>
      <p style="margin:0; font-size: 14px; color: #64748b;">Watchtower Study Conductor Preparation Sheet • Study Date: <strong>${dateStr}</strong></p>
    </div>
    <div class="no-print">
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
`;

    art.items.forEach((item, index) => {
      const conductor = item.conductorData;
      html += `  <div class="paragraph-card">
    <div class="paragraph-title">
      <span>${getParagraphDisplayLabel(item.question, index)}</span>
      ${item.subheading ? `<span style="font-size: 13px; font-weight: normal; color: #64748b;">${item.subheading}</span>` : ''}
    </div>
    <div class="main-question">${item.question}</div>
    ${item.highlightedText ? `<div class="primary-basis"><strong>Primary Basis:</strong> "${item.highlightedText}"</div>` : ''}
`;

      // Extra Points
      if (conductor?.extraPoints && conductor.extraPoints.length > 0) {
        html += `    <div style="margin-top: 14px; margin-bottom: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569;">Conductor Extra Points & Follow-Up Questions:</div>\n`;
        conductor.extraPoints.forEach((point, pIdx) => {
          const col = point.color || 'emerald';
          html += `    <div class="point-card point-${col}">
      <span class="point-tag">Point ${pIdx + 1} • ${point.label || 'Extra Point'}${point.scriptureRef ? ` • ${point.scriptureRef}` : ''}</span>
      <div class="point-question">"${point.question}"</div>
      ${point.text ? `<div class="point-excerpt">Basis in text: "${point.text}"</div>` : ''}
    </div>\n`;
        });
      }

      // Scripture Application Questions
      if (conductor?.scriptureQuestions && conductor.scriptureQuestions.length > 0) {
        html += `    <div style="margin-top: 14px; margin-bottom: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569;">Scripture Application Questions:</div>\n`;
        conductor.scriptureQuestions.forEach((sq) => {
          const isRead = item.readScriptures.some(rs => rs.includes(sq.scriptureRef) || sq.scriptureRef.includes(rs));
          html += `    <div class="scripture-box">
      <div>
        <span class="scripture-ref">${sq.scriptureRef}</span>
        ${isRead ? `<span class="read-badge">READ</span>` : ''}
      </div>
      <div style="font-weight: 600; font-size: 13px; margin: 4px 0;">"${sq.question}"</div>
      ${sq.purpose ? `<div style="font-size: 11px; color: #64748b;">Purpose: ${sq.purpose}</div>` : ''}
    </div>\n`;
        });
      }

      // Picture Questions
      if (conductor?.hasPicture || conductor?.pictureQuestions?.length) {
        html += `    <div class="picture-box">
      <div style="font-weight: 700; font-size: 13px; color: #9f1239; margin-bottom: 6px;">Illustration Discussion:</div>
      ${conductor.pictureDescription ? `<div style="font-size: 12px; margin-bottom: 8px;"><em>Illustration Details:</em> ${conductor.pictureDescription}</div>` : ''}
      ${conductor.pictureUrl ? `<div style="margin-bottom: 8px;"><img src="${conductor.pictureUrl}" style="max-height: 220px; border-radius: 6px; max-width: 100%;" /></div>` : ''}
      ${(conductor.pictureQuestions || []).map((pq, qIdx) => `
        <div style="margin-bottom: 6px; font-size: 13px;">
          <strong>Q${qIdx + 1}:</strong> "${pq.question}"
          ${pq.focus ? `<span style="font-size: 11px; color: #881337; margin-left: 6px;">(Focus: ${pq.focus})</span>` : ''}
        </div>
      `).join('')}
    </div>\n`;
      }

      // Teaching tips
      if (conductor?.teachingTips && conductor.teachingTips.length > 0) {
        html += `    <div class="tips-box">
      <strong>Conductor Pacing Tip:</strong> ${conductor.teachingTips.join(' • ')}
    </div>\n`;
      }

      // Personal comment
      if (item.userComment) {
        html += `    <div class="user-comment-box">
      <strong>My Comment:</strong> ${item.userComment}
    </div>\n`;
      }

      // Additional Notes & Image References
      if (item.additionalNotes && item.additionalNotes.length > 0) {
        html += `    <div style="margin-top: 10px; padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
      <div style="font-weight: 700; font-size: 11px; color: #475569; margin-bottom: 6px; text-transform: uppercase;">Study Notes & Image References:</div>
      ${item.additionalNotes.map(n => {
        if (n.type === 'text' && n.content) {
          return `<div style="font-size: 13px; margin-bottom: 4px;">• ${n.content}</div>`;
        } else if (n.type === 'image' && n.content) {
          return `<div style="margin-bottom: 8px;">
            ${n.caption ? `<div style="font-size: 12px; font-weight: 600; margin-bottom: 2px;">${n.caption}</div>` : ''}
            <img src="${n.content}" style="max-height: 240px; border-radius: 6px; max-width: 100%; display: block;" />
          </div>`;
        }
        return '';
      }).join('')}
    </div>\n`;
      }

      html += `  </div>\n`;
    });

    if (art.reviewQuestions && art.reviewQuestions.length > 0) {
      html += `  <div class="paragraph-card" style="border-top: 4px solid #6366f1;">
    <h2 style="margin-top: 0; font-size: 18px;">How Would You Answer? (Review Questions)</h2>
`;
      art.reviewQuestions.forEach((rq, i) => {
        html += `    <div style="margin-bottom: 14px;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Review Question ${i + 1}: ${rq.question}</div>
      ${rq.suggestedComment ? `<div style="font-size: 13px; color: #475569; margin-bottom: 4px;"><em>Suggested:</em> ${rq.suggestedComment}</div>` : ''}
      ${rq.userComment ? `<div style="font-size: 13px; color: #1e3a8a; background: #eff6ff; padding: 6px 10px; border-radius: 6px;"><em>My Answer:</em> ${rq.userComment}</div>` : ''}
    </div>\n`;
      });
      html += `  </div>\n`;
    }

    html += `</body>
</html>`;
    return html;
  };

  const generateConductorMarkdown = (art: WatchtowerArticle, sDate?: string): string => {
    const dateStr = sDate || art.studyDate || "No date specified";
    let md = `# ${art.title || "Watchtower Study"}\n\n`;
    md += `**Study Date:** ${dateStr}  \n`;
    md += `**Total Paragraphs:** ${art.items.length}  \n`;
    md += `**Generated:** ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;
    md += `---\n\n`;

    art.items.forEach((item, index) => {
      md += `## ${getParagraphDisplayLabel(item.question, index)}${item.subheading ? ` - ${item.subheading}` : ''}\n\n`;
      md += `**Question:** ${item.question}\n\n`;
      if (item.highlightedText) {
        md += `> **Basis in text:** "${item.highlightedText}"\n\n`;
      }

      const conductor = item.conductorData;
      if (conductor?.extraPoints && conductor.extraPoints.length > 0) {
        md += `### Conductor Extra Points & Follow-Up Questions\n\n`;
        conductor.extraPoints.forEach((point, pIdx) => {
          const col = (point.color || 'emerald').toUpperCase();
          md += `- **[${col}] Point ${pIdx + 1} (${point.label || 'Extra Point'}):**\n`;
          md += `  - **Question:** "${point.question}"\n`;
          if (point.text) md += `  - *Excerpt:* "${point.text}"\n`;
          if (point.scriptureRef) md += `  - *Scripture:* ${point.scriptureRef}\n`;
        });
        md += `\n`;
      }

      if (conductor?.scriptureQuestions && conductor.scriptureQuestions.length > 0) {
        md += `### Scripture Application Questions\n\n`;
        conductor.scriptureQuestions.forEach((sq) => {
          const isRead = item.readScriptures.some(rs => rs.includes(sq.scriptureRef) || sq.scriptureRef.includes(rs));
          md += `- **${sq.scriptureRef}${isRead ? ' (READ SCRIPTURE)' : ''}:** "${sq.question}"\n`;
          if (sq.purpose) md += `  - *Purpose:* ${sq.purpose}\n`;
        });
        md += `\n`;
      }

      if (conductor?.hasPicture || conductor?.pictureQuestions?.length) {
        md += `### Picture & Artwork Discussion\n\n`;
        if (conductor.pictureDescription) md += `*Illustration Details:* ${conductor.pictureDescription}\n\n`;
        (conductor.pictureQuestions || []).forEach((pq, pqIdx) => {
          md += `- **Artwork Question ${pqIdx + 1}:** "${pq.question}"\n`;
          if (pq.focus) md += `  - *Visual Focus:* ${pq.focus}\n`;
        });
        md += `\n`;
      }

      if (conductor?.teachingTips && conductor.teachingTips.length > 0) {
        md += `> **Conductor Tip:** ${conductor.teachingTips.join(' ')}\n\n`;
      }

      if (item.userComment) {
        md += `**My Comment:** ${item.userComment}\n\n`;
      }

      if (item.additionalNotes && item.additionalNotes.length > 0) {
        md += `**Study Notes & Image References:**\n\n`;
        item.additionalNotes.forEach((n) => {
          if (n.type === 'text' && n.content) {
            md += `- ${n.content}\n`;
          } else if (n.type === 'image' && n.content) {
            md += `- ${n.caption ? `**${n.caption}**: ` : ''}![](${n.content})\n`;
          }
        });
        md += `\n`;
      }

      md += `---\n\n`;
    });

    if (art.reviewQuestions && art.reviewQuestions.length > 0) {
      md += `## Review Questions\n\n`;
      art.reviewQuestions.forEach((rq, i) => {
        md += `### Review Question ${i + 1}: ${rq.question}\n\n`;
        if (rq.suggestedComment) md += `*Suggested:* ${rq.suggestedComment}\n\n`;
        if (rq.userComment) md += `*My Answer:* ${rq.userComment}\n\n`;
      });
    }

    return md;
  };

  const handleExportJSON = () => {
    if (!article) return;
    const resolvedDate = articleDate || article.studyDate || "";
    const articleToExport: WatchtowerArticle = {
      ...article,
      studyDate: resolvedDate,
      items: article.items.map((item) => ({
        ...item,
        conductorData: item.conductorData ? {
          extraPoints: (item.conductorData.extraPoints || []).map(p => ({
            id: p.id,
            text: p.text || '',
            color: p.color,
            label: p.label || 'Extra Point',
            question: p.question || '',
            scriptureRef: p.scriptureRef || '',
          })),
          scriptureQuestions: (item.conductorData.scriptureQuestions || []).map(sq => ({
            scriptureRef: sq.scriptureRef,
            question: sq.question,
            purpose: sq.purpose || '',
          })),
          pictureQuestions: (item.conductorData.pictureQuestions || []).map(pq => ({
            question: pq.question,
            focus: pq.focus || '',
          })),
          hasPicture: !!item.conductorData.hasPicture,
          pictureDescription: item.conductorData.pictureDescription || "",
          pictureUrl: item.conductorData.pictureUrl,
          teachingTips: item.conductorData.teachingTips || [],
        } : undefined,
      })),
    };

    // Immediately sync to localStorage as well
    try {
      const stored = localStorage.getItem('watchtower-articles');
      if (stored) {
        const articles: ArticleRecord[] = JSON.parse(stored);
        const updated = articles.map(a => {
          if (a.id === activeArticleId || (activeArticleId == null && a.title === article.title)) {
            return {
              ...a,
              articleData: JSON.stringify(articleToExport),
              date: resolvedDate || a.date || "",
            };
          }
          return a;
        });
        localStorage.setItem('watchtower-articles', JSON.stringify(updated));
        window.dispatchEvent(new Event('articlesUpdated'));
      }
    } catch (e) {}

    const dataStr = JSON.stringify(articleToExport, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `watchtower-study-${article.title.replace(/\s+/g, '-').toLowerCase()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    setIsExportModalOpen(false);
  };

  const handleExportConductorSheet = () => {
    if (!article) return;
    const textContent = generateConductorTextSummary(article, articleDate);
    const dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(textContent);
    const exportFileDefaultName = `conductor-study-sheet-${article.title.replace(/\s+/g, '-').toLowerCase()}.txt`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    setIsExportModalOpen(false);
  };

  const handleExportHTML = () => {
    if (!article) return;
    const htmlContent = generateConductorHTML(article, articleDate);
    const dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    const exportFileDefaultName = `conductor-study-guide-${article.title.replace(/\s+/g, '-').toLowerCase()}.html`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    setIsExportModalOpen(false);
  };

  const handleExportMarkdown = () => {
    if (!article) return;
    const mdContent = generateConductorMarkdown(article, articleDate);
    const dataUri = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(mdContent);
    const exportFileDefaultName = `conductor-notes-${article.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    setIsExportModalOpen(false);
  };

  const handleExportCommentsTxt = () => {
    if (!article) return;
    let text = `================================================================================\n`;
    text += `WATCHTOWER STUDY COMMENTS & CONDUCTOR SUMMARY - ${article.title}\n`;
    text += `Study Date: ${articleDate || article.studyDate || 'N/A'}\n`;
    text += `================================================================================\n\n`;
    article.items.forEach((item, index) => {
      text += `${getQuestionDisplayLabel(item.question, index)}: ${item.question}\n`;
      if (item.highlightedText) text += `Basis: "${item.highlightedText}"\n`;
      text += `My Comment: ${item.userComment || '(No comment written yet)'}\n`;
      
      const conductor = item.conductorData;
      if (conductor?.extraPoints && conductor.extraPoints.length > 0) {
        text += `Conductor Questions:\n`;
        conductor.extraPoints.forEach((p, idx) => {
          text += `  - Point ${idx + 1}: "${p.question}"\n`;
        });
      }
      text += `\n`;
    });
    if (article.reviewQuestions?.length) {
      text += `--- REVIEW QUESTIONS ---\n`;
      article.reviewQuestions.forEach((rq, i) => {
        text += `Review Question ${i + 1}: ${rq.question}\n`;
        text += `My Answer: ${rq.userComment || '(No answer written yet)'}\n\n`;
      });
    }
    const dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    const exportFileDefaultName = `my-comments-${article.title.replace(/\s+/g, '-').toLowerCase()}.txt`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    setIsExportModalOpen(false);
  };

  const handleExport = () => {
    if (!article) return;
    setIsExportModalOpen(true);
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        
        if (Array.isArray(parsed)) {
          // It's a library backup! Let's import all these into the local storage
          const stored = localStorage.getItem('watchtower-articles');
          let existing: ArticleRecord[] = [];
          if (stored) {
            try {
              existing = JSON.parse(stored);
            } catch (e) {}
          }
          
          // Merge avoiding identical IDs, update or append
          const merged = [...existing];
          parsed.forEach((importedItem: any) => {
            if (importedItem.id && importedItem.title && importedItem.articleData) {
              const idx = merged.findIndex(item => item.id === importedItem.id);
              if (idx > -1) {
                merged[idx] = importedItem; // Overwrite
              } else {
                merged.push(importedItem); // Append
              }
            }
          });
          
          localStorage.setItem('watchtower-articles', JSON.stringify(merged));
          window.dispatchEvent(new Event('articlesUpdated'));
          setError(null);
          alert(`Successfully imported backup: ${parsed.length} articles added/updated in your Library.`);
          setActiveTab("library");
        } else if (parsed && parsed.title && Array.isArray(parsed.items)) {
          // It's a single article (make sure conductorData is mapped cleanly)
          const singleArticle: WatchtowerArticle = {
            ...parsed,
            items: parsed.items.map((item: any) => ({
              ...item,
              conductorData: item.conductorData ? {
                extraPoints: item.conductorData.extraPoints || [],
                scriptureQuestions: item.conductorData.scriptureQuestions || [],
                pictureQuestions: item.conductorData.pictureQuestions || [],
                hasPicture: !!item.conductorData.hasPicture,
                pictureDescription: item.conductorData.pictureDescription || "",
                pictureUrl: item.conductorData.pictureUrl,
                teachingTips: item.conductorData.teachingTips || [],
              } : undefined,
            })),
            reviewQuestions: parsed.reviewQuestions || [],
            studyDate: parsed.studyDate || ""
          };
          const healedSingle = ensureArticleConductorData(singleArticle);
          setArticle(healedSingle);
          setArticleDate(parsed.studyDate || "");
          const allIds = [
            ...healedSingle.items.map((item: any) => item.id),
            ...(healedSingle.reviewQuestions || []).map((q: any) => q.id)
          ];
          setCollapsedSuggestions(new Set(allIds));
          setCollapsedUserComments(new Set(allIds));
          
          const allNoteIds: string[] = [];
          healedSingle.items.forEach((item: any) => {
            item.additionalNotes?.forEach((note: any) => {
              allNoteIds.push(note.id);
            });
          });
          setCollapsedNotes(new Set(allNoteIds));
          
          setError(null);
          saveArticleToStorage(healedSingle);
          setActiveTab("study");
        } else {
          setError("Invalid study data or backup file.");
        }
      } catch (err) {
        console.error(err);
        setError("Failed to parse study data file.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const saveArticleToStorage = async (parsedArticle: WatchtowerArticle) => {
    // Determine if this article is already in library, otherwise create new record
    try {
      const stored = localStorage.getItem('watchtower-articles');
      let articles: ArticleRecord[] = [];
      if (stored) {
        try {
          articles = JSON.parse(stored);
        } catch(e) {}
      }

      // Check if title already exists to avoid duplication - update existing record with imported conductor items
      const existingIdx = articles.findIndex(a => a.title === parsedArticle.title);
      if (existingIdx > -1) {
        articles[existingIdx] = {
          ...articles[existingIdx],
          articleData: JSON.stringify(parsedArticle),
          date: parsedArticle.studyDate || articles[existingIdx].date || "",
        };
        localStorage.setItem('watchtower-articles', JSON.stringify(articles));
        window.dispatchEvent(new Event('articlesUpdated'));
        setActiveArticleId(articles[existingIdx].id);
        const resolvedDate = articles[existingIdx].date || parsedArticle.studyDate || "";
        setArticleDate(resolvedDate);
        return;
      }

      const newId = Math.random().toString(36).substring(2, 10);
      const resolvedDate = parsedArticle.studyDate || articleDate || "";
      const record: ArticleRecord = {
        id: newId,
        userId: "local-user",
        title: parsedArticle.title || "Untitled Article",
        date: resolvedDate,
        createdAt: Date.now(),
        articleData: JSON.stringify(parsedArticle),
        coverUrl: ""
      };
      
      articles.push(record);
      localStorage.setItem('watchtower-articles', JSON.stringify(articles));
      window.dispatchEvent(new Event('articlesUpdated'));
      setActiveArticleId(newId);
      setArticleDate(resolvedDate);
    } catch (e) {
      console.error("Failed to auto-save single imported article", e);
    }
  };

  const toggleSuggestion = (id: string) => {
    setCollapsedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePin = (id: string) => {
    setPinnedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleUserComment = (id: string) => {
    setCollapsedUserComments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleUserPin = (id: string) => {
    setPinnedUserComments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleNote = (id: string) => {
    setCollapsedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copySuggestionToUser = (id: string, suggestion: string) => {
    if (!article) return;
    setArticle({
      ...article,
      items: article.items.map(item => 
        item.id === id ? { ...item, userComment: suggestion } : item
      ),
      reviewQuestions: article.reviewQuestions.map(q => 
        q.id === id ? { ...q, userComment: suggestion } : q
      )
    });
  };

  const syncArticleToStorage = (updatedArticle: WatchtowerArticle) => {
    try {
      const stored = localStorage.getItem('watchtower-articles');
      if (stored) {
        const resolvedDate = articleDate || updatedArticle.studyDate || "";
        const articles: ArticleRecord[] = JSON.parse(stored);
        const updated = articles.map(a => {
          if (a.id === activeArticleId || (activeArticleId == null && a.title === updatedArticle.title)) {
            return {
              ...a,
              articleData: JSON.stringify(updatedArticle),
              date: resolvedDate || a.date || "",
            };
          }
          return a;
        });
        localStorage.setItem('watchtower-articles', JSON.stringify(updated));
        window.dispatchEvent(new Event('articlesUpdated'));
      }
    } catch (e) {
      console.error("Failed to sync article to storage", e);
    }
  };

  const handleAddNote = (itemId: string, type: 'text' | 'image', initialContent = '', initialCaption = '') => {
    if (!article) return;
    const newNote = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      type,
      content: initialContent,
      caption: initialCaption,
    };
    
    const updatedArticle: WatchtowerArticle = {
      ...article,
      items: article.items.map(item => 
        item.id === itemId 
          ? { ...item, additionalNotes: [...(item.additionalNotes || []), newNote] } 
          : item
      )
    };
    setArticle(updatedArticle);
    syncArticleToStorage(updatedArticle);
    setCollapsedNotes(prev => {
      const next = new Set(prev);
      next.delete(newNote.id);
      return next;
    });
    return newNote.id;
  };

  const handleUpdateNote = (itemId: string, noteId: string, content: string, caption?: string) => {
    if (!article) return;
    const updatedArticle: WatchtowerArticle = {
      ...article,
      items: article.items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              additionalNotes: item.additionalNotes?.map(note => 
                note.id === noteId ? { ...note, content, ...(caption !== undefined ? { caption } : {}) } : note
              ) 
            } 
          : item
      )
    };
    setArticle(updatedArticle);
    syncArticleToStorage(updatedArticle);
    setCollapsedNotes(prev => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
  };

  const handleRemoveNote = (itemId: string, noteId: string) => {
    if (!article) return;
    const updatedArticle: WatchtowerArticle = {
      ...article,
      items: article.items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              additionalNotes: item.additionalNotes?.filter(note => note.id !== noteId) 
            } 
          : item
      )
    };
    setArticle(updatedArticle);
    syncArticleToStorage(updatedArticle);
  };

  const handleImageUpload = async (itemId: string, noteId: string, file: File) => {
    try {
      const content = await processImageFile(file);
      handleUpdateNote(itemId, noteId, content);
    } catch (err) {
      console.error("Failed to process image upload", err);
    }
  };

  const reset = (tab: string = "import") => {
    setActiveArticleId(null);
    setArticle(null);
    setInputText("");
    setArticleDate("");
    setError(null);
    setCollapsedSuggestions(new Set());
    setCollapsedNotes(new Set());
    setPinnedSuggestions(new Set());
    setIsConductorOpen(false);
    setConductorIndex(0);
    setFocusedPointText(null);
    setActiveTab(tab);
  };

  const handleUpdateItemConductorData = (itemId: string, data: ConductorData) => {
    if (!article) return;
    const resolvedDate = articleDate || article.studyDate || "";
    const updatedArticle: WatchtowerArticle = {
      ...article,
      studyDate: resolvedDate,
      items: article.items.map(item => 
        item.id === itemId ? { ...item, conductorData: data } : item
      )
    };
    setArticle(updatedArticle);

    // Immediately persist to localStorage so Library and exports are 100% up to date
    try {
      const stored = localStorage.getItem('watchtower-articles');
      if (stored) {
        const articles: ArticleRecord[] = JSON.parse(stored);
        const updated = articles.map(a => {
          if (a.id === activeArticleId || (activeArticleId == null && a.title === article.title)) {
            return {
              ...a,
              articleData: JSON.stringify(updatedArticle),
              date: resolvedDate || a.date || "",
            };
          }
          return a;
        });
        localStorage.setItem('watchtower-articles', JSON.stringify(updated));
        window.dispatchEvent(new Event('articlesUpdated'));
      }
    } catch (e) {
      console.error("Failed to sync conductor update to storage", e);
    }
  };

  const handleUpdateAllItemsConductorData = (updatedItems: StudyItem[]) => {
    if (!article) return;
    const resolvedDate = articleDate || article.studyDate || "";
    const updatedArticle: WatchtowerArticle = {
      ...article,
      studyDate: resolvedDate,
      items: updatedItems,
    };
    setArticle(updatedArticle);

    try {
      const stored = localStorage.getItem('watchtower-articles');
      if (stored) {
        const articles: ArticleRecord[] = JSON.parse(stored);
        const updated = articles.map(a => {
          if (a.id === activeArticleId || (activeArticleId == null && a.title === article.title)) {
            return {
              ...a,
              articleData: JSON.stringify(updatedArticle),
              date: resolvedDate || a.date || "",
            };
          }
          return a;
        });
        localStorage.setItem('watchtower-articles', JSON.stringify(updated));
        window.dispatchEvent(new Event('articlesUpdated'));
      }
    } catch (e) {
      console.error("Failed to sync conductor update to storage", e);
    }
  };

  const handleFocusPointInParagraph = (pointText: string, itemId: string) => {
    setFocusedPointText(pointText);
    const cardEl = document.getElementById(`item-card-${itemId}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => setFocusedPointText(null), 3500);
  };

  // Helper to find exact or fuzzy sentence range in paragraph text
  const findTextRange = (paragraph: string, search: string): { start: number; end: number } | null => {
    if (!paragraph || !search) return null;
    const cleanSearch = search.trim();
    if (!cleanSearch) return null;

    // 1. Literal exact match
    const exactIdx = paragraph.indexOf(cleanSearch);
    if (exactIdx !== -1) {
      return { start: exactIdx, end: exactIdx + cleanSearch.length };
    }

    // 2. Case-insensitive exact match
    const lowerPara = paragraph.toLowerCase();
    const lowerSearch = cleanSearch.toLowerCase();
    const lowerIdx = lowerPara.indexOf(lowerSearch);
    if (lowerIdx !== -1) {
      return { start: lowerIdx, end: lowerIdx + cleanSearch.length };
    }

    // 3. Flexible typography regex (quotes, dashes, whitespace)
    try {
      const stripped = cleanSearch.replace(/^[.,;:!?"'“”‘’—\s]+|[.,;:!?"'“”‘’—\s]+$/g, '');
      if (stripped.length > 2) {
        let pattern = '';
        for (let i = 0; i < stripped.length; i++) {
          const ch = stripped[i];
          if (/['\u2018\u2019\u201A\u201B]/.test(ch)) {
            pattern += "['\u2018\u2019\u201A\u201B]";
          } else if (/["\u201C\u201D\u201E\u201F]/.test(ch)) {
            pattern += '["\u201C\u201D\u201E\u201F]';
          } else if (/[-–—]/.test(ch)) {
            pattern += '[-–—]';
          } else if (/\s/.test(ch)) {
            pattern += '\\s+';
          } else {
            pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          }
        }
        const m = new RegExp(pattern, 'i').exec(paragraph);
        if (m && m[0]) {
          return { start: m.index, end: m.index + m[0].length };
        }
      }
    } catch (e) {}

    // 4. Match full sentence via word overlap (NEVER partial head words)
    const sentences = splitParagraphIntoSentences(paragraph);
    const targetWords = cleanSearch.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length >= 2) {
      const targetSet = new Set(targetWords);
      let bestSent: string | null = null;
      let maxOverlap = 0;
      for (const sent of sentences) {
        const sentWords = sent.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
        let overlap = 0;
        for (const sw of sentWords) {
          if (targetSet.has(sw)) overlap++;
        }
        if (overlap > maxOverlap && overlap >= Math.min(2, Math.floor(targetSet.size * 0.4))) {
          maxOverlap = overlap;
          bestSent = sent;
        }
      }
      if (bestSent) {
        const sIdx = paragraph.indexOf(bestSent);
        if (sIdx !== -1) {
          return { start: sIdx, end: sIdx + bestSent.length };
        }
      }
    }

    return null;
  };

  const renderParagraph = (item: StudyItem, index: number) => {
    const text = item.paragraph || '';
    if (!text) return null;

    interface HighlightRange {
      start: number;
      end: number;
      type: 'conductor' | 'main';
      conductorPoint?: ConductorPoint;
    }

    interface ScriptureRange {
      start: number;
      end: number;
      reference: string;
      isRead: boolean;
    }

    const highlightRanges: HighlightRange[] = [];
    const scriptureRanges: ScriptureRange[] = [];

    // 1. Conductor Mode Highlights: ONLY visible when in Conductor Mode (isConductorOpen === true) AND showConductorHighlights is true
    if (isConductorOpen && showConductorHighlights && item.conductorData?.extraPoints && item.conductorData.extraPoints.length > 0) {
      item.conductorData.extraPoints.forEach((point) => {
        if (!point.text || !point.text.trim()) return;
        const range = findTextRange(text, point.text);
        if (range && range.start < range.end) {
          // Avoid overlaps between conductor points
          const overlaps = highlightRanges.some(
            existing => Math.max(existing.start, range.start) < Math.min(existing.end, range.end)
          );
          if (!overlaps) {
            highlightRanges.push({
              start: range.start,
              end: range.end,
              type: 'conductor',
              conductorPoint: point,
            });
          }
        }
      });
    } else {
      // 2. Main Yellow Highlight: Only when NOT in conductor mode (or when conductor highlights are toggled off)
      if (item.highlightedText && item.highlightedText.trim()) {
        const mainRange = findTextRange(text, item.highlightedText);
        if (mainRange && mainRange.start < mainRange.end) {
          highlightRanges.push({
            start: mainRange.start,
            end: mainRange.end,
            type: 'main',
          });
        }
      }
    }

    // 3. Scriptures (Read and Cited)
    // Read Scriptures first (Blue highlight)
    const readRefs = Array.isArray(item.readScriptures) ? item.readScriptures : [];
    readRefs.forEach((s) => {
      if (!s || !s.trim()) return;
      const sRange = findTextRange(text, s);
      if (sRange && sRange.start < sRange.end) {
        scriptureRanges.push({
          start: sRange.start,
          end: sRange.end,
          reference: s,
          isRead: true,
        });
      }
    });

    // Cited Scriptures (Bold)
    const allRefs = Array.isArray(item.scriptures) ? item.scriptures : [];
    allRefs.forEach((s) => {
      if (!s || !s.trim() || readRefs.includes(s)) return;
      const sRange = findTextRange(text, s);
      if (sRange && sRange.start < sRange.end) {
        const overlaps = scriptureRanges.some(
          existing => Math.max(existing.start, sRange.start) < Math.min(existing.end, sRange.end)
        );
        if (!overlaps) {
          scriptureRanges.push({
            start: sRange.start,
            end: sRange.end,
            reference: s,
            isRead: false,
          });
        }
      }
    });

    // Collect all unique boundary points across text
    const boundarySet = new Set<number>([0, text.length]);
    highlightRanges.forEach(r => {
      boundarySet.add(r.start);
      boundarySet.add(r.end);
    });
    scriptureRanges.forEach(r => {
      boundarySet.add(r.start);
      boundarySet.add(r.end);
    });

    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

    // Build contiguous, non-overlapping segments
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const segStart = boundaries[i];
      const segEnd = boundaries[i + 1];
      if (segStart >= segEnd) continue;

      const segText = text.substring(segStart, segEnd);
      if (!segText) continue;

      const activeHighlight = highlightRanges.find(r => r.start <= segStart && r.end >= segEnd);
      const activeScripture = scriptureRanges.find(r => r.start <= segStart && r.end >= segEnd);

      let content: React.ReactNode = segText;

      // Wrap in scripture interaction if applicable
      if (activeScripture) {
        const scRef = activeScripture.reference;
        const handleScriptureClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          let scripture = item.scriptureTexts.find(st => st.reference === scRef);
          if (!scripture) {
            scripture = item.scriptureTexts.find(st => st.reference.includes(scRef) || scRef.includes(st.reference));
          }
          if (scripture) setSelectedScripture(scripture);
        };

        if (activeScripture.isRead) {
          content = (
            <span
              key={`sc-${segStart}`}
              onClick={handleScriptureClick}
              className="bg-blue-300 dark:bg-blue-800 text-foreground not-italic font-bold px-1 rounded shadow-xs cursor-pointer hover:bg-blue-400 dark:hover:bg-blue-700 transition-colors inline-block my-0.5"
              title={`Read Scripture: ${scRef} (Click to view)`}
            >
              {segText}
            </span>
          );
        } else {
          content = (
            <span
              key={`sc-${segStart}`}
              onClick={handleScriptureClick}
              className="font-bold not-italic text-primary/90 cursor-pointer hover:underline decoration-primary/40 underline-offset-2 transition-all"
              title={`Scripture Reference: ${scRef} (Click to view)`}
            >
              {segText}
            </span>
          );
        }
      }

      // Wrap in highlight styling if applicable
      if (activeHighlight) {
        if (activeHighlight.type === 'conductor' && activeHighlight.conductorPoint) {
          const pt = activeHighlight.conductorPoint;
          const colorCfg = COLOR_CONFIG[pt.color as ConductorPointColor] || COLOR_CONFIG.emerald;
          const isFocused = focusedPointText === pt.text;

          elements.push(
            <span
              key={`hl-${segStart}`}
              className={cn(
                colorCfg.highlightClass,
                "cursor-pointer shadow-xs inline transition-all duration-200",
                isFocused && "ring-2 ring-amber-500 ring-offset-2 scale-[1.01] shadow-md font-semibold"
              )}
              onClick={(e) => {
                e.stopPropagation();
                setConductorIndex(index);
                setIsConductorOpen(true);
                setFocusedPointText(pt.text);
              }}
              title={`💡 Conductor Point (${pt.label || colorCfg.name}): "${pt.question}" — Click to view in Conductor Mode`}
            >
              {content}
            </span>
          );
        } else if (activeHighlight.type === 'main') {
          elements.push(
            <span
              key={`hl-${segStart}`}
              className="bg-yellow-200 dark:bg-yellow-900/50 text-foreground not-italic font-medium px-1 rounded"
              title="Primary Answer Basis"
            >
              {content}
            </span>
          );
        }
      } else {
        elements.push(<React.Fragment key={`plain-${segStart}`}>{content}</React.Fragment>);
      }
    }

    return elements;
  };

  const renderSettingsContent = () => {
    const handleClearLibrary = () => {
      if (window.confirm("Are you sure you want to clear your local Library? This will permanently delete all saved study articles.")) {
        localStorage.removeItem('watchtower-articles');
        window.dispatchEvent(new Event('articlesUpdated'));
        alert("Library cleared successfully.");
      }
    };

    return (
      <Card className="border-border bg-card shadow-xl shadow-primary/5">
        <CardHeader className="border-b border-border bg-muted/30">
          <CardTitle className="text-xl font-serif italic text-primary">Display & App Settings</CardTitle>
          <CardDescription>Customize the appearance and behavior of your study assistant.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          {/* Theme Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Sun className="text-primary" size={18} />
              <h3 className="font-semibold">App Theme</h3>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border">
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Toggle between light and dark display mode.</p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={toggleDarkMode}
                className="gap-2 border-border"
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                {isDarkMode ? "Switch to Light Theme" : "Switch to Dark Theme"}
              </Button>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Conductor Mode Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-amber-500" size={18} />
              <h3 className="font-semibold">Conductor Mode Options</h3>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border">
              <div>
                <p className="text-sm font-medium">Colored Extra Point Highlights</p>
                <p className="text-xs text-muted-foreground">Highlight secondary points, scripture principles, and practical application gems directly in the paragraph text.</p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowConductorHighlights(!showConductorHighlights)}
                className="gap-2 border-border"
              >
                {showConductorHighlights ? "Enabled (Colors ON)" : "Disabled (Colors OFF)"}
              </Button>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Font Sizes Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Sliders className="text-primary" size={18} />
              <h3 className="font-semibold">Text Size</h3>
            </div>
            
            <div className="grid gap-6 sm:grid-cols-2 max-w-xl">
              <div className="space-y-2">
                <Label htmlFor="p-size" className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Paragraph Text Size</Label>
                <div className="flex items-center gap-4">
                  <Input 
                    id="p-size" 
                    type="number" 
                    value={fontSizeParagraph} 
                    onChange={(e) => setFontSizeParagraph(parseInt(e.target.value) || 16)}
                    className="w-24 bg-background"
                    min="12"
                    max="32"
                  />
                  <span className="text-sm text-muted-foreground">pixels</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-size" className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Comment Text Size</Label>
                <div className="flex items-center gap-4">
                  <Input 
                    id="c-size" 
                    type="number" 
                    value={fontSizeComment} 
                    onChange={(e) => setFontSizeComment(parseInt(e.target.value) || 16)}
                    className="w-24 bg-background"
                    min="12"
                    max="32"
                  />
                  <span className="text-sm text-muted-foreground">pixels</span>
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Live Preview */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Live Preview</h4>
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-card border border-border" style={{ fontSize: `${fontSizeParagraph}px` }}>
                This is a sample paragraph text.
              </div>
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary" style={{ fontSize: `${fontSizeComment}px`, fontStyle: 'italic' }}>
                This is a sample AI suggestion or user comment text.
              </div>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Library Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="text-destructive" size={18} />
              <h3 className="font-semibold text-destructive">Danger Zone</h3>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-destructive/5 border border-destructive/20">
              <div>
                <p className="text-sm font-medium text-destructive">Clear Saved Articles</p>
                <p className="text-xs text-muted-foreground">Permanently delete all imported articles and backups stored in this browser.</p>
              </div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleClearLibrary}
                className="gap-2"
              >
                <Trash2 size={16} />
                Clear Library
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 transition-colors duration-300 flex">
      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 bottom-0 w-16 md:w-20 bg-card border-r border-border flex flex-col items-center py-8 z-30">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/25 mb-10">
          <BookOpen size={22} />
        </div>
        
        <nav className="flex flex-col gap-3.5">
          <button
            onClick={() => reset("library")}
            className={cn(
              "p-3 rounded-xl transition-all duration-200 group relative",
              activeTab === "library" || (!article && activeTab !== "import")
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30" 
                : "text-indigo-500 dark:text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-300"
            )}
            title="Dashboard"
          >
            <LibraryIcon size={22} />
            <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-md z-50">
              Dashboard
            </span>
          </button>
          <button
            onClick={() => reset("import")}
            className={cn(
              "p-3 rounded-xl transition-all duration-200 group relative",
              activeTab === "import"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/30" 
                : "text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300"
            )}
            title="Import New"
          >
            <Plus size={22} />
            <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-md z-50">
              Import New
            </span>
          </button>

          {[
            { 
              id: "study", 
              icon: Layout, 
              label: "Study",
              activeClass: "bg-amber-600 text-white shadow-md shadow-amber-500/30",
              inactiveClass: "text-amber-500 dark:text-amber-400 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
            },
            { 
              id: "article", 
              icon: FileText, 
              label: "Article",
              activeClass: "bg-cyan-600 text-white shadow-md shadow-cyan-500/30",
              inactiveClass: "text-cyan-500 dark:text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300"
            },
            { 
              id: "scriptures", 
              icon: BookOpen, 
              label: "Scriptures",
              activeClass: "bg-rose-600 text-white shadow-md shadow-rose-500/30",
              inactiveClass: "text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
            },
            { 
              id: "settings", 
              icon: Settings, 
              label: "Settings",
              activeClass: "bg-purple-600 text-white shadow-md shadow-purple-500/30",
              inactiveClass: "text-purple-500 dark:text-purple-400 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-300"
            }
          ].map((nav) => (
            <button
              key={nav.id}
              onClick={() => setActiveTab(nav.id)}
              className={cn(
                "p-3 rounded-xl transition-all duration-200 group relative",
                activeTab === nav.id 
                  ? nav.activeClass 
                  : nav.inactiveClass
              )}
              title={nav.label}
            >
              <nav.icon size={22} />
              <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-md z-50">
                {nav.label}
              </span>
            </button>
          ))}

          {article && (
            <button
              onClick={() => setIsConductorOpen(!isConductorOpen)}
              className={cn(
                "p-3 rounded-xl transition-all duration-200 group relative",
                isConductorOpen
                  ? "bg-amber-600 text-white shadow-md shadow-amber-500/30"
                  : "text-amber-500 dark:text-amber-400 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
              )}
              title="Conductor Mode"
            >
              <Users size={22} />
              <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-md z-50">
                Conductor Mode
              </span>
            </button>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-3.5">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleDarkMode}
            className="rounded-xl text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-teal-500 hover:text-teal-600 hover:bg-teal-500/10 dark:text-teal-400 dark:hover:bg-teal-500/20"
            onClick={() => document.getElementById('import-data')?.click()}
            title="Import Saved .json Data"
          >
            <Upload size={20} />
          </Button>
          {article && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
              onClick={handleExport}
              title="Export Study Data"
            >
              <Download size={20} />
            </Button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 pl-16 md:pl-20">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Watchtower Study Assistant</h1>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Preparation Tool</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                id="import-data"
                className="hidden"
                accept=".json"
                onChange={handleImportData}
              />
              {article && (
                <>
                  <Button
                    variant={isConductorOpen ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsConductorOpen(!isConductorOpen)}
                    className={cn(
                      "flex items-center gap-1.5 transition-all text-xs font-semibold",
                      isConductorOpen
                        ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-md shadow-amber-500/25"
                        : "border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                    )}
                    title="Toggle Conductor Mode Side Panel"
                  >
                    <Users size={15} />
                    <span className="hidden sm:inline">Conductor Mode</span>
                    {article.items[conductorIndex]?.conductorData?.extraPoints?.length ? (
                      <span className="bg-amber-500/20 text-amber-800 dark:text-amber-200 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                        {article.items[conductorIndex].conductorData.extraPoints.length}
                      </span>
                    ) : null}
                  </Button>

                  {!activeArticleId && (
                    <Button variant="default" size="sm" onClick={async () => {
                      const newId = await saveArticleToDB(article);
                      if (newId) setActiveArticleId(newId);
                    }} className="hidden md:flex gap-2">
                      <Save size={14} /> Save to Library
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={copyAllComments} className="hidden sm:flex gap-2 border-border hover:bg-muted">
                    {copiedId === "all" ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === "all" ? "Copied All" : "Copy All"}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleExport} 
                    className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 border-blue-500/40 hover:bg-blue-500/10 font-semibold"
                    title="Export Complete Study with Conductor Items"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => reset()} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <main className={cn("max-w-4xl mx-auto w-full p-6 pb-24 transition-all duration-300", isConductorOpen && "xl:mr-[500px]")}>
        <AnimatePresence mode="wait">
          {!article && !isLoading && activeTab === "library" ? (
            <motion.div
              key="library-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Library onSelectArticle={(imported, id, date) => {
                const healed = ensureArticleConductorData(imported);
                setArticle(healed);
                setActiveArticleId(id);
                setArticleDate(date || healed.studyDate || "");
                
                const allIds = [
                  ...healed.items.map(item => item.id),
                  ...(healed.reviewQuestions || []).map(q => q.id)
                ];
                setCollapsedSuggestions(new Set(allIds));
                setCollapsedUserComments(new Set(allIds));
                
                const allNoteIds: string[] = [];
                imported.items.forEach(item => {
                  item.additionalNotes?.forEach(note => {
                    allNoteIds.push(note.id);
                  });
                });
                setCollapsedNotes(new Set(allNoteIds));
                
                setActiveTab("study");
              }} />
            </motion.div>
          ) : !article && !isLoading && activeTab === "import" ? (
            <motion.div
              key="import-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <Card className="border-border shadow-xl shadow-primary/5 bg-card overflow-hidden">
                <CardHeader className="bg-muted/50 border-b border-border">
                  <CardTitle className="text-2xl font-serif italic text-primary">Import Article</CardTitle>
                  <CardDescription>
                    Paste the text of the Watchtower article below to generate suggested comments.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
                    <div className="space-y-2">
                      <Label htmlFor="articleDate" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Study Date</Label>
                      <Input
                        id="articleDate"
                        type="date"
                        value={articleDate}
                        onChange={(e) => setArticleDate(e.target.value)}
                        className="bg-background border-border"
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <Textarea
                      placeholder="Paste article text here... (e.g., Title, Paragraphs, and Questions)"
                      className="min-h-[300px] resize-none border-border focus-visible:ring-primary text-lg leading-relaxed bg-background"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 text-muted-foreground text-sm">
                      <Info size={14} />
                      <span>Include questions for best results</span>
                    </div>
                  </div>
                  
                  {error && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-sm flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                        <AlertCircle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>Notice</span>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{error}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="self-start h-7 text-xs border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/15"
                        onClick={handleImport}
                        disabled={isLoading || !inputText.trim()}
                      >
                        <RefreshCw size={12} className={cn("mr-1.5", isLoading && "animate-spin")} />
                        Try Again
                      </Button>
                    </div>
                  )}

                  <Button 
                    onClick={handleImport} 
                    disabled={!inputText.trim() || isLoading}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-medium transition-all active:scale-[0.98]"
                  >
                    <Send size={18} className="mr-2" />
                    Process Article
                  </Button>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: MessageSquare, title: "Smart Comments", desc: "AI-generated suggestions based on paragraph context." },
                  { icon: RefreshCw, title: "Fully Editable", desc: "Refine comments to match your personal style." },
                  { icon: Copy, title: "Easy Export", desc: "Copy individual comments or the entire study set." }
                ].map((feature, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-card border border-border flex flex-col items-center text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <feature.icon size={20} />
                    </div>
                    <h3 className="font-semibold text-sm">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : !article && !isLoading && activeTab === "settings" ? (
            <motion.div
              key="settings-view-no-article"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {renderSettingsContent()}
            </motion.div>
          ) : !article && !isLoading ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <FileText size={32} />
              </div>
              <h2 className="text-xl font-semibold">No Article Selected</h2>
              <p className="text-muted-foreground max-w-sm">
                Please select an article from your Dashboard or import a new one to begin your study.
              </p>
              <div className="flex gap-4 mt-6">
                <Button onClick={() => setActiveTab("library")}>Go to Dashboard</Button>
                <Button variant="outline" className="border-border hover:bg-muted" onClick={() => setActiveTab("import")}>Import New</Button>
              </div>
            </motion.div>
          ) : isLoading ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-10 w-2/3 bg-muted" />
                <Skeleton className="h-4 w-1/3 bg-muted" />
              </div>
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-border shadow-md bg-card/50">
                  <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-6 w-full bg-muted" />
                    <Skeleton className="h-24 w-full bg-muted" />
                    <Skeleton className="h-32 w-full bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <motion.div
              key="article-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl md:text-4xl font-serif italic text-primary">{article?.title}</h2>
                <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm font-medium">
                  <Separator className="w-8 bg-border" />
                  {articleDate ? (
                    <div className="flex items-center gap-2 text-xs md:text-sm font-normal text-muted-foreground bg-muted/40 px-3 py-1 rounded-full border border-border">
                      <Calendar size={14} className="text-primary" />
                      <span>Study Date: <strong className="text-foreground font-medium">{formatDisplayDate(articleDate)}</strong></span>
                    </div>
                  ) : (
                    <span className="uppercase tracking-widest text-xs">Study Preparation</span>
                  )}
                  <Separator className="w-8 bg-border" />
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsContent value="study" className="space-y-6 outline-none">
                  {article?.items.map((item, index) => {
                    const showSubheading = item.subheading && (index === 0 || article.items[index - 1].subheading !== item.subheading);

                    return (
                      <React.Fragment key={item.id}>
                        {showSubheading && (
                          <div className="flex items-center gap-4 mt-12 mb-2">
                            <Separator className="flex-1 bg-border" />
                            <h3 className="text-lg md:text-xl font-bold uppercase tracking-[0.15em] text-foreground/80 whitespace-nowrap">
                              {item.subheading}
                            </h3>
                            <Separator className="flex-1 bg-border" />
                          </div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                      <Card id={`item-card-${item.id}`} className="border-border shadow-lg shadow-primary/5 bg-card overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{getParagraphDisplayLabel(item.question, index)}</span>
                              <CardTitle className="text-lg font-medium leading-snug">{item.question}</CardTitle>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className={cn(
                                  "h-8 px-2.5 text-xs gap-1.5 rounded-lg border transition-all shrink-0",
                                  conductorIndex === index && isConductorOpen
                                    ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 font-semibold"
                                    : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                                onClick={() => {
                                  setConductorIndex(index);
                                  setIsConductorOpen(true);
                                }}
                                title="Open in Conductor Mode Side Panel"
                              >
                                <Users size={14} className="text-amber-500" />
                                <span className="hidden sm:inline">Conductor</span>
                                {item.conductorData?.extraPoints?.length ? (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-200 px-1 py-0.2 rounded font-bold">
                                    {item.conductorData.extraPoints.length}
                                  </span>
                                ) : null}
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className={cn(
                                  "shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted",
                                  regeneratingId === item.id && "animate-spin"
                                )}
                                onClick={() => handleRegenerate(item.id, item.question, item.paragraph)}
                                disabled={!!regeneratingId}
                                title="Regenerate Comment"
                              >
                                <RefreshCw size={18} />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                                onClick={() => copyToClipboard(item.userComment, item.id)}
                              >
                                {copiedId === item.id ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="p-4 rounded-xl bg-muted/50 border border-border text-muted-foreground leading-relaxed italic" style={{ fontSize: `${fontSizeParagraph}px` }}>
                            {renderParagraph(item, index)}
                          </div>
                          <div className="space-y-4">
                            <div className={cn(
                              "border rounded-xl overflow-hidden transition-all duration-300",
                              pinnedUserComments.has(item.id) 
                                ? "border-primary/30 bg-primary/5 shadow-md shadow-primary/5" 
                                : "border-border bg-muted/20"
                            )}>
                              <div className="flex items-center justify-between px-4 py-1.5 bg-background/50 border-b border-border/10">
                                <button 
                                  onClick={() => toggleUserComment(item.id)}
                                  className="flex-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors text-left"
                                >
                                  <User size={12} className={cn(
                                    pinnedUserComments.has(item.id) ? "text-primary" : "text-primary/60"
                                  )} />
                                  My Comment
                                  {pinnedUserComments.has(item.id) && (
                                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[8px] tracking-tighter ml-1">PINNED</span>
                                  )}
                                </button>
                                <div className="flex items-center gap-1">
                                  {!pinnedSuggestions.has(item.id) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[9px] font-bold uppercase tracking-widest gap-1.5 hover:bg-amber-500/10 hover:text-amber-600 transition-colors"
                                      onClick={() => toggleSuggestion(item.id)}
                                    >
                                      <Sparkles size={10} className="text-amber-500" />
                                      {collapsedSuggestions.has(item.id) ? "Show Suggestion" : "Hide Suggestion"}
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-6 w-6 rounded-full transition-colors",
                                      pinnedUserComments.has(item.id) ? "text-primary bg-primary/20" : "text-muted-foreground hover:bg-muted"
                                    )}
                                    onClick={() => toggleUserPin(item.id)}
                                    title={pinnedUserComments.has(item.id) ? "Unpin Comment" : "Pin Comment"}
                                  >
                                    {pinnedUserComments.has(item.id) ? <PinOff size={10} /> : <Pin size={10} />}
                                  </Button>
                                  <button
                                    onClick={() => toggleUserComment(item.id)}
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                  >
                                    {collapsedUserComments.has(item.id) ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                  </button>
                                </div>
                              </div>
                              <AnimatePresence mode="wait">
                                {(pinnedUserComments.has(item.id) || !collapsedUserComments.has(item.id)) ? (
                                  <motion.div
                                    key="expanded"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-4">
                                      <Textarea
                                        value={item.userComment}
                                        onChange={(e) => handleUpdateComment(item.id, e.target.value)}
                                        className="min-h-[100px] border-border focus-visible:ring-primary bg-background shadow-inner"
                                        style={{ fontSize: `${fontSizeComment}px` }}
                                        placeholder="Type your personal comment here..."
                                      />
                                    </div>
                                  </motion.div>
                                ) : (
                                  item.userComment && (
                                    <motion.div
                                      key="collapsed-preview"
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      className="p-4 pt-2"
                                      onClick={() => toggleUserComment(item.id)}
                                    >
                                      <div className="p-3 rounded-lg bg-background/80 border border-border/50 italic text-foreground/60 text-xs line-clamp-2 cursor-pointer hover:bg-background/90 transition-colors shadow-sm">
                                        {item.userComment}
                                      </div>
                                    </motion.div>
                                  )
                                )}
                              </AnimatePresence>
                            </div>

                              <div className={cn(
                                "border rounded-xl overflow-hidden transition-all duration-300",
                                pinnedSuggestions.has(item.id) 
                                  ? "border-amber-500/30 bg-amber-500/5 shadow-md shadow-amber-500/5" 
                                  : "border-border bg-muted/30"
                              )}>
                                <div className="flex items-center justify-between px-4 py-1.5 bg-muted/20 border-b border-border/10">
                                  <button 
                                    onClick={() => toggleSuggestion(item.id)}
                                    className="flex-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors text-left"
                                  >
                                    <Sparkles size={12} className={cn(
                                      pinnedSuggestions.has(item.id) ? "text-amber-600" : "text-amber-500/60"
                                    )} />
                                    AI Suggested Comment
                                    {pinnedSuggestions.has(item.id) && (
                                      <span className="bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded text-[8px] tracking-tighter ml-1">PINNED</span>
                                    )}
                                  </button>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "h-6 w-6 rounded-full transition-colors",
                                        pinnedSuggestions.has(item.id) ? "text-amber-600 bg-amber-500/20" : "text-muted-foreground hover:bg-muted"
                                      )}
                                      onClick={() => togglePin(item.id)}
                                      title={pinnedSuggestions.has(item.id) ? "Unpin Suggestion" : "Pin Suggestion"}
                                    >
                                      {pinnedSuggestions.has(item.id) ? <PinOff size={12} /> : <Pin size={12} />}
                                    </Button>
                                    <button
                                      onClick={() => toggleSuggestion(item.id)}
                                      className="p-1 text-muted-foreground hover:text-foreground"
                                    >
                                      {collapsedSuggestions.has(item.id) ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </button>
                                  </div>
                                </div>
                                
                                <AnimatePresence>
                                  {(pinnedSuggestions.has(item.id) || !collapsedSuggestions.has(item.id)) && (
                                    <motion.div
                                      initial={pinnedSuggestions.has(item.id) ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="p-4 space-y-3">
                                        {(() => {
                                          const suggestions = item.suggestedComments && item.suggestedComments.length > 0 
                                            ? item.suggestedComments 
                                            : [item.suggestedComment];
                                          
                                          return (
                                            <div className="space-y-3 w-full">
                                              {suggestions.map((commentOption, sIdx) => {
                                                const isObj = typeof commentOption === 'object' && commentOption !== null;
                                                const commentText = isObj ? (commentOption as SuggestedCommentOption).comment : (commentOption as string);
                                                const scriptureRef = isObj ? (commentOption as SuggestedCommentOption).scriptureRef : undefined;
                                                
                                                return (
                                                  <div 
                                                    key={`${item.id}-suggestion-${sIdx}`} 
                                                    className="p-3.5 rounded-xl bg-background border border-border/60 hover:border-amber-500/40 hover:bg-amber-500/[0.01] transition-all leading-relaxed text-foreground/80 shadow-sm flex flex-col gap-2 group/sugg relative"
                                                  >
                                                    <div className="flex items-center justify-between text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                                                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold flex-wrap">
                                                        <span>Comment Option {sIdx + 1}</span>
                                                        {sIdx === 0 && <span className="text-[9px] bg-amber-500/15 px-1 py-0.2 rounded font-normal text-amber-700 dark:text-amber-300">General</span>}
                                                        {sIdx > 0 && <span className="text-[9px] bg-emerald-500/15 px-1 py-0.2 rounded font-normal text-emerald-700 dark:text-emerald-400">Scripture Focus</span>}
                                                        {scriptureRef && (
                                                          <span className="text-[9px] bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded font-medium flex items-center gap-1 normal-case font-sans">
                                                            <BookOpen size={10} />
                                                            {scriptureRef}
                                                          </span>
                                                        )}
                                                      </span>
                                                      <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="text-[10px] h-6 px-2 gap-1 border-border/40 hover:bg-primary hover:text-primary-foreground opacity-70 group-hover/sugg:opacity-100 transition-opacity"
                                                        onClick={() => copySuggestionToUser(item.id, commentText)}
                                                      >
                                                        <Copy size={10} />
                                                        Use Comment {sIdx + 1}
                                                      </Button>
                                                    </div>
                                                    <div style={{ fontSize: `${fontSizeComment}px` }} className="leading-relaxed">
                                                      {commentText}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                            {/* Additional Notes Section */}
                            <div className="space-y-4 pt-2">
                              {item.additionalNotes?.map((note) => (
                                <div key={note.id} className="relative group/note border border-border rounded-xl overflow-hidden bg-muted/10">
                                  <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/50">
                                    <button 
                                      onClick={() => toggleNote(note.id)}
                                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      {note.type === 'text' ? <Type size={10} /> : <ImageIcon size={10} />}
                                      {note.type === 'text' ? 'Additional Info' : 'Image Reference'}
                                      {collapsedNotes.has(note.id) ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                                    </button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                      onClick={() => handleRemoveNote(item.id, note.id)}
                                    >
                                      <X size={12} />
                                    </Button>
                                  </div>
                                  
                                  {!collapsedNotes.has(note.id) && (
                                    <div className="p-3 border-t border-border/40">
                                      {note.type === 'text' ? (
                                        <Textarea
                                          value={note.content}
                                          onChange={(e) => handleUpdateNote(item.id, note.id, e.target.value)}
                                          className="min-h-[80px] border-border bg-background/50 text-sm focus-visible:ring-primary"
                                          placeholder="Add more study material or notes..."
                                        />
                                      ) : (
                                        <ImageReferenceNote
                                          note={note}
                                          onUpdate={(content, caption) => handleUpdateNote(item.id, note.id, content, caption)}
                                          onRemove={() => handleRemoveNote(item.id, note.id)}
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}

                              <div className="flex items-center gap-2 pt-2">
                                <div className="h-[1px] flex-1 bg-border" />
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-full gap-1.5 text-[10px] font-bold uppercase tracking-wider border-dashed hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleAddNote(item.id, 'text');
                                    }}
                                  >
                                    <Plus size={12} />
                                    <Type size={12} />
                                    Text
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-full gap-1.5 text-[10px] font-bold uppercase tracking-wider border-dashed hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleAddNote(item.id, 'image');
                                    }}
                                  >
                                    <Plus size={12} />
                                    <ImageIcon size={12} />
                                    Image
                                  </Button>
                                </div>
                                <div className="h-[1px] flex-1 bg-border" />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                    </React.Fragment>
                    );
                  })}

                  {article?.reviewQuestions && article.reviewQuestions.length > 0 && (
                    <div className="mt-12 space-y-8">
                      <div className="flex items-center gap-4">
                        <Separator className="flex-1 bg-border" />
                        <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-primary whitespace-nowrap">
                          How Would You Answer?
                        </h3>
                        <Separator className="flex-1 bg-border" />
                      </div>
                      
                      {article.reviewQuestions.map((q, idx) => (
                        <motion.div
                          key={q.id}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.1 }}
                        >
                          <Card className="border-primary/20 bg-primary/5 shadow-md overflow-hidden">
                            <CardHeader className="pb-3 border-b border-primary/10">
                              <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Review Question {idx + 1}</span>
                                  <CardTitle className="text-lg font-medium leading-snug">{q.question}</CardTitle>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                              <div className={cn(
                                "border rounded-xl overflow-hidden transition-all duration-300",
                                pinnedUserComments.has(q.id) 
                                  ? "border-primary/30 bg-primary/5 shadow-md shadow-primary/5" 
                                  : "border-border bg-muted/20"
                              )}>
                                <div className="flex items-center justify-between px-4 py-1.5 bg-background/50 border-b border-border/10">
                                  <button 
                                    onClick={() => toggleUserComment(q.id)}
                                    className="flex-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors text-left"
                                  >
                                    <User size={10} className={cn(
                                      pinnedUserComments.has(q.id) ? "text-primary" : "text-primary/60"
                                    )} />
                                    My Summary Comment
                                    {pinnedUserComments.has(q.id) && (
                                      <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[8px] tracking-tighter ml-1">PINNED</span>
                                    )}
                                  </button>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "h-6 w-6 rounded-full transition-colors",
                                        pinnedUserComments.has(q.id) ? "text-primary bg-primary/20" : "text-muted-foreground hover:bg-muted"
                                      )}
                                      onClick={() => toggleUserPin(q.id)}
                                      title={pinnedUserComments.has(q.id) ? "Unpin Comment" : "Pin Comment"}
                                    >
                                      {pinnedUserComments.has(q.id) ? <PinOff size={10} /> : <Pin size={10} />}
                                    </Button>
                                    <button
                                      onClick={() => toggleUserComment(q.id)}
                                      className="p-1 text-muted-foreground hover:text-foreground"
                                    >
                                      {collapsedUserComments.has(q.id) ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </button>
                                  </div>
                                </div>
                                <AnimatePresence mode="wait">
                                  {(pinnedUserComments.has(q.id) || !collapsedUserComments.has(q.id)) ? (
                                    <motion.div
                                      key="expanded-summary"
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="p-4">
                                        <Textarea
                                          value={q.userComment}
                                          onChange={(e) => handleUpdateComment(q.id, e.target.value)}
                                          className="min-h-[80px] bg-background border-border"
                                          style={{ fontSize: `${fontSizeComment}px` }}
                                          placeholder="Type your summary response here..."
                                        />
                                      </div>
                                    </motion.div>
                                  ) : (
                                    q.userComment && (
                                      <motion.div
                                        key="collapsed-summary-preview"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="p-4 pt-2"
                                        onClick={() => toggleUserComment(q.id)}
                                      >
                                        <div className="p-3 rounded-lg bg-background/80 border border-border/50 italic text-foreground/60 text-xs line-clamp-2 cursor-pointer hover:bg-background/90 transition-colors shadow-sm">
                                          {q.userComment}
                                        </div>
                                      </motion.div>
                                    )
                                  )}
                                </AnimatePresence>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                      <Sparkles size={10} className="text-amber-500" />
                                      AI Suggested Summary
                                    </label>
                                    <button
                                      onClick={() => toggleSuggestion(q.id)}
                                      className="p-1 text-muted-foreground hover:text-foreground"
                                    >
                                      {collapsedSuggestions.has(q.id) ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </button>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 px-2 text-[8px] gap-1 hover:bg-muted"
                                    onClick={() => copySuggestionToUser(q.id, q.suggestedComment)}
                                  >
                                    <Copy size={8} /> Use Suggestion
                                  </Button>
                                </div>
                                <AnimatePresence>
                                  {!collapsedSuggestions.has(q.id) && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="p-4 rounded-xl bg-background border border-border/50 italic text-foreground/70 leading-relaxed shadow-inner mt-2" style={{ fontSize: `${fontSizeComment}px` }}>
                                        {q.suggestedComment}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="article" className="outline-none">
                  <Card className="border-border bg-card shadow-xl shadow-primary/5">
                    <CardHeader className="border-b border-border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl font-serif italic text-primary">Original Article</CardTitle>
                          <CardDescription>The full text you imported for this study.</CardDescription>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => copyToClipboard(article?.originalText || "", "article-copy")}
                          className="gap-2"
                        >
                          {copiedId === "article-copy" ? <Check size={14} /> : <Copy size={14} />}
                          {copiedId === "article-copy" ? "Copied" : "Copy Text"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[600px] p-6">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground/80">
                            {article?.originalText}
                          </pre>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="scriptures" className="outline-none">
                  <Card className="border-border bg-card shadow-xl shadow-primary/5">
                    <CardHeader className="border-b border-border bg-muted/30">
                      <CardTitle className="text-xl font-serif italic text-primary">Bible Scriptures</CardTitle>
                      <CardDescription>Full text of cited scriptures (NWT 2013 Revision).</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[600px] w-full p-6">
                        <div className="space-y-8">
                          {article?.items.map((item, index) => (
                            <div key={`scripture-group-${item.id}`} className="space-y-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-1 rounded">{getParagraphDisplayLabel(item.question, index)}</span>
                                <Separator className="flex-1" />
                              </div>
                              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                                {item.scriptureTexts && item.scriptureTexts.length > 0 ? (
                                  item.scriptureTexts.map((scripture, sIdx) => (
                                    <div key={`${item.id}-s-${sIdx}`} className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className={cn(
                                          "text-sm font-bold",
                                          item.readScriptures.includes(scripture.reference) ? "text-blue-600 dark:text-blue-400" : "text-primary"
                                        )}>
                                          {scripture.reference}
                                        </span>
                                        {item.readScriptures.includes(scripture.reference) && (
                                          <span className="text-[10px] font-bold uppercase tracking-tighter bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">Read</span>
                                        )}
                                      </div>
                                      <p className="text-sm leading-relaxed text-foreground/90 italic">
                                        "{scripture.text}"
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">No scriptures cited in this paragraph.</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings" className="outline-none">
                  {renderSettingsContent()}
                </TabsContent>
              </Tabs>

              <div className="flex justify-center pt-8">
                <Button 
                  variant="outline" 
                  onClick={() => reset()}
                  className="border-border text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  Start New Study
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Conductor Mode Side Panel */}
      {article && (
        <ConductorSidePanel
          isOpen={isConductorOpen}
          onClose={() => setIsConductorOpen(false)}
          studyItems={article.items}
          activeItemIndex={conductorIndex}
          onSelectItem={(idx) => {
            setConductorIndex(idx);
            const cardEl = document.getElementById(`item-card-${article.items[idx]?.id}`);
            if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onUpdateItemConductorData={handleUpdateItemConductorData}
          onUpdateAllItemsConductorData={handleUpdateAllItemsConductorData}
          onOpenScripture={(scripture) => setSelectedScripture(scripture)}
          showHighlights={showConductorHighlights}
          onToggleHighlights={setShowConductorHighlights}
          onFocusPointInParagraph={handleFocusPointInParagraph}
          onOpenExportModal={() => setIsExportModalOpen(true)}
        />
      )}

      {/* Export Study & Conductor Data Modal */}
      <AnimatePresence>
        {isExportModalOpen && article && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExportModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
            >
              {/* Header */}
              <div className="p-6 pb-4 flex items-center justify-between border-b border-border/80 bg-muted/20 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                    <Download size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Export Study & Conductor Data</h3>
                    <p className="text-xs text-muted-foreground">All questions, comments & Conductor items will be saved</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-8 w-8 hover:bg-muted"
                  onClick={() => setIsExportModalOpen(false)}
                >
                  <X size={18} />
                </Button>
              </div>

              {/* Body - Scrollable */}
              <div className="p-6 space-y-3.5 overflow-y-auto flex-1 custom-scrollbar">
                {/* Option 1: Full JSON (with all Conductor items) */}
                <div 
                  onClick={handleExportJSON}
                  className="p-4 rounded-xl border border-border/80 hover:border-blue-500/50 hover:bg-blue-500/[0.03] transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        Complete Study File (.json)
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <Button size="sm" className="h-7 text-xs px-2.5 gap-1.5 shrink-0 bg-blue-600 hover:bg-blue-700 text-white">
                      <Download size={12} /> Download .json
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Saves the entire article, your written comments, notes, <strong>AND all Conductor Mode items</strong> (color-coded highlights, follow-up questions, scripture questions, picture questions, picture details, and teaching tips). Re-importable anytime.
                  </p>
                </div>

                {/* Option 2: Printable HTML / PDF Conductor Guide (.html) */}
                <div 
                  onClick={handleExportHTML}
                  className="p-4 rounded-xl border border-border/80 hover:border-emerald-500/50 hover:bg-emerald-500/[0.03] transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        Printable HTML & PDF Guide (.html)
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                        Print to PDF
                      </span>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1.5 shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10">
                      <Printer size={12} /> Download .html
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A formatted, responsive visual booklet with color-coded badges, questions, scripture breakdowns, and artwork prompts. Includes a 1-click <strong>Print to PDF</strong> button.
                  </p>
                </div>

                {/* Option 3: Conductor Preparation Sheet (.txt) */}
                <div 
                  onClick={handleExportConductorSheet}
                  className="p-4 rounded-xl border border-border/80 hover:border-amber-500/50 hover:bg-amber-500/[0.03] transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        Conductor Study Sheet (.txt)
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                        Text Outline
                      </span>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1.5 shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10">
                      <FileText size={12} /> Download .txt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A formatted conductor meeting outline. Lists every paragraph with its primary answer, color-coded extra points, scripture application questions, artwork questions, and pacing tips.
                  </p>
                </div>

                {/* Option 4: Markdown Notes (.md) */}
                <div 
                  onClick={handleExportMarkdown}
                  className="p-4 rounded-xl border border-border/80 hover:border-cyan-500/50 hover:bg-cyan-500/[0.03] transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        Markdown Study Notes (.md)
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full">
                        Obsidian / Notion
                      </span>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1.5 shrink-0 border-cyan-500/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10">
                      <FileCode size={12} /> Download .md
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Clean Markdown outline with headings, blockquotes, and lists for note-taking apps.
                  </p>
                </div>

                {/* Option 5: Personal Comments & Conductor Summary (.txt) */}
                <div 
                  onClick={handleExportCommentsTxt}
                  className="p-4 rounded-xl border border-border/80 hover:border-purple-500/50 hover:bg-purple-500/[0.03] transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-sm text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      Personal Comments & Prompts (.txt)
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1.5 shrink-0 border-border hover:bg-muted">
                      <Copy size={12} /> Download .txt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A clean text document with the study questions, your personal comments, and conductor questions.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-muted/30 border-t border-border flex items-center justify-between shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyAllComments}
                  className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  {copiedId === "all" ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  <span>{copiedId === "all" ? "Copied All Comments" : "Copy Comments to Clipboard"}</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsExportModalOpen(false)}
                  className="rounded-full px-5 text-xs"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scripture Popup */}
      <AnimatePresence>
        {selectedScripture && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedScripture(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg max-h-[85vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-6 pb-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <BookOpen size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{selectedScripture.reference}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-8 w-8 hover:bg-muted"
                  onClick={() => setSelectedScripture(null)}
                >
                  <X size={18} />
                </Button>
              </div>
              
              <Separator className="mx-6 bg-border shrink-0" />
              
              {/* Content Area - This is what scrolls */}
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 custom-scrollbar">
                <p className="text-lg leading-relaxed text-foreground italic font-serif">
                  "{selectedScripture.text}"
                </p>
              </div>
              
              <Separator className="mx-6 bg-border shrink-0" />
              
              {/* Footer */}
              <div className="p-6 pt-4 flex justify-end shrink-0">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setSelectedScripture(null)}
                  className="rounded-full px-6"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
}
