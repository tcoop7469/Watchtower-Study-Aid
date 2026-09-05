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
  Calendar
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
import { WatchtowerArticle, StudyItem, SuggestedCommentOption } from "./types";
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
      const articleWithDate: WatchtowerArticle = {
        ...parsedArticle,
        studyDate: resolvedDate
      };
      const record: ArticleRecord = {
        id: newId,
        userId: "local-user",
        title: parsedArticle.title || "Untitled Article",
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
      result.studyDate = articleDate;
      setArticle(result);
      const allIds = [
        ...result.items.map(item => item.id),
        ...result.reviewQuestions.map(q => q.id)
      ];
      setCollapsedSuggestions(new Set(allIds));
      setCollapsedUserComments(new Set(allIds));
      setCollapsedNotes(new Set()); // New articles have no notes yet
      
      const newId = await saveArticleToDB(result, articleDate);
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
      .map((item, index) => `Question ${index + 1}: ${item.question}\nComment: ${item.userComment}`)
      .join("\n\n");
    navigator.clipboard.writeText(allComments);
    setCopiedId("all");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExport = () => {
    if (!article) return;
    const articleToExport = {
      ...article,
      studyDate: articleDate || article.studyDate || ""
    };
    const dataStr = JSON.stringify(articleToExport, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `watchtower-study-${article.title.replace(/\s+/g, '-').toLowerCase()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
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
          // It's a single article
          const singleArticle = {
            ...parsed,
            reviewQuestions: parsed.reviewQuestions || [],
            studyDate: parsed.studyDate || ""
          };
          setArticle(singleArticle);
          setArticleDate(parsed.studyDate || "");
          const allIds = [
            ...parsed.items.map((item: any) => item.id),
            ...(parsed.reviewQuestions || []).map((q: any) => q.id)
          ];
          setCollapsedSuggestions(new Set(allIds));
          setCollapsedUserComments(new Set(allIds));
          
          const allNoteIds: string[] = [];
          parsed.items.forEach((item: any) => {
            item.additionalNotes?.forEach((note: any) => {
              allNoteIds.push(note.id);
            });
          });
          setCollapsedNotes(new Set(allNoteIds));
          
          setError(null);
          saveArticleToStorage(singleArticle);
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

      // Check if title already exists to avoid duplication
      const existingIdx = articles.findIndex(a => a.title === parsedArticle.title);
      if (existingIdx > -1) {
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

  const handleAddNote = (itemId: string, type: 'text' | 'image') => {
    if (!article) return;
    const newNote = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: '',
    };
    
    setArticle({
      ...article,
      items: article.items.map(item => 
        item.id === itemId 
          ? { ...item, additionalNotes: [...(item.additionalNotes || []), newNote] } 
          : item
      )
    });
  };

  const handleUpdateNote = (itemId: string, noteId: string, content: string) => {
    if (!article) return;
    setArticle({
      ...article,
      items: article.items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              additionalNotes: item.additionalNotes?.map(note => 
                note.id === noteId ? { ...note, content } : note
              ) 
            } 
          : item
      )
    });
  };

  const handleRemoveNote = (itemId: string, noteId: string) => {
    if (!article) return;
    setArticle({
      ...article,
      items: article.items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              additionalNotes: item.additionalNotes?.filter(note => note.id !== noteId) 
            } 
          : item
      )
    });
  };

  const handleImageUpload = (itemId: string, noteId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleUpdateNote(itemId, noteId, content);
    };
    reader.readAsDataURL(file);
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
    setActiveTab(tab);
  };

  const formatText = (content: React.ReactNode, search: string, formatter: (match: string, index: number) => React.ReactNode): React.ReactNode => {
    if (!search) return content;
    
    if (typeof content === 'string') {
      const parts = content.split(search);
      if (parts.length === 1) return content;
      const result: React.ReactNode[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) result.push(parts[i]);
        if (i < parts.length - 1) {
          result.push(formatter(search, i));
        }
      }
      return result;
    }
    
    if (Array.isArray(content)) {
      return content.map((child, idx) => (
        <React.Fragment key={idx}>
          {formatText(child, search, formatter)}
        </React.Fragment>
      ));
    }
    
    if (content && typeof content === 'object' && 'props' in content) {
      const element = content as React.ReactElement;
      return React.cloneElement(element, {
        ...element.props,
        children: formatText(element.props.children, search, formatter)
      });
    }
    
    return content;
  };

  const renderParagraph = (item: StudyItem) => {
    let content: React.ReactNode = item.paragraph;
    
    // 1. Main Highlight (Yellow)
    if (item.highlightedText) {
      content = formatText(content, item.highlightedText, (match, i) => (
        <span key={`main-${i}`} className="bg-yellow-200 dark:bg-yellow-900/50 text-foreground not-italic font-medium px-1 rounded">
          {match}
        </span>
      ));
    }
    
    // 2. Read Scriptures (Blue highlight + Bold) - Sort by length descending to avoid partial matches
    const sortedRead = [...item.readScriptures].sort((a, b) => b.length - a.length);
    sortedRead.forEach((s, sIdx) => {
      content = formatText(content, s, (match, i) => (
        <span 
          key={`read-${sIdx}-${i}`} 
          className="bg-blue-300 dark:bg-blue-800 text-foreground not-italic font-bold px-1 rounded shadow-sm cursor-pointer hover:bg-blue-400 dark:hover:bg-blue-700 transition-colors"
          onClick={() => {
            // Try exact match first, then partial match
            let scripture = item.scriptureTexts.find(st => st.reference === match);
            if (!scripture) {
              scripture = item.scriptureTexts.find(st => st.reference.includes(match) || match.includes(st.reference));
            }
            if (scripture) setSelectedScripture(scripture);
          }}
        >
          {match}
        </span>
      ));
    });
    
    // 3. Other Scriptures (Bold) - Sort by length descending
    const sortedOther = item.scriptures
      .filter(s => !item.readScriptures.includes(s))
      .sort((a, b) => b.length - a.length);
      
    sortedOther.forEach((s, sIdx) => {
      content = formatText(content, s, (match, i) => (
        <span 
          key={`scripture-${sIdx}-${i}`} 
          className="font-bold not-italic text-primary/90 cursor-pointer hover:underline decoration-primary/30 underline-offset-2 transition-all"
          onClick={() => {
            // Try exact match first, then partial match
            let scripture = item.scriptureTexts.find(st => st.reference === match);
            if (!scripture) {
              scripture = item.scriptureTexts.find(st => st.reference.includes(match) || match.includes(st.reference));
            }
            if (scripture) setSelectedScripture(scripture);
          }}
        >
          {match}
        </span>
      ));
    });
    
    return content;
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
                  <Button variant="ghost" size="sm" onClick={() => reset()} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto w-full p-6 pb-24">
        <AnimatePresence mode="wait">
          {!article && !isLoading && activeTab === "library" ? (
            <motion.div
              key="library-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Library onSelectArticle={(imported, id, date) => {
                setArticle(imported);
                setActiveArticleId(id);
                setArticleDate(date || imported.studyDate || "");
                
                const allIds = [
                  ...imported.items.map(item => item.id),
                  ...(imported.reviewQuestions || []).map(q => q.id)
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
                    <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-3">
                      <Trash2 size={16} />
                      {error}
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
                      <Card className="border-border shadow-lg shadow-primary/5 bg-card overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Question {index + 1}</span>
                              <CardTitle className="text-lg font-medium leading-snug">{item.question}</CardTitle>
                            </div>
                            <div className="flex items-center gap-1">
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
                            {renderParagraph(item)}
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
                                  
                                  <AnimatePresence initial={false}>
                                    {!collapsedNotes.has(note.id) && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="p-3">
                                          {note.type === 'text' ? (
                                            <Textarea
                                              value={note.content}
                                              onChange={(e) => handleUpdateNote(item.id, note.id, e.target.value)}
                                              className="min-h-[80px] border-border bg-background/50 text-sm focus-visible:ring-primary"
                                              placeholder="Add more study material or notes..."
                                            />
                                          ) : (
                                            <div 
                                              className={cn(
                                                "relative aspect-video rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 overflow-hidden bg-muted/20 transition-colors",
                                                !note.content && "hover:border-primary/50 hover:bg-muted/40"
                                              )}
                                              onPaste={(e) => {
                                                const file = e.clipboardData.files[0];
                                                if (file && file.type.startsWith('image/')) {
                                                  handleImageUpload(item.id, note.id, file);
                                                }
                                              }}
                                            >
                                              {note.content ? (
                                                <img 
                                                  src={note.content} 
                                                  alt="Study material" 
                                                  className="w-full h-full object-contain"
                                                  referrerPolicy="no-referrer"
                                                />
                                              ) : (
                                                <>
                                                  <ImageIcon size={24} className="text-muted-foreground" />
                                                  <div className="text-center">
                                                    <p className="text-xs font-medium">Paste image here</p>
                                                    <p className="text-[10px] text-muted-foreground">or click to upload</p>
                                                  </div>
                                                  <input 
                                                    type="file" 
                                                    accept="image/*"
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    onChange={(e) => {
                                                      const file = e.target.files?.[0];
                                                      if (file) handleImageUpload(item.id, note.id, file);
                                                    }}
                                                  />
                                                </>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              ))}

                              <div className="flex items-center gap-2 pt-2">
                                <div className="h-[1px] flex-1 bg-border" />
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-full gap-1.5 text-[10px] font-bold uppercase tracking-wider border-dashed"
                                    onClick={() => handleAddNote(item.id, 'text')}
                                  >
                                    <Plus size={12} />
                                    <Type size={12} />
                                    Text
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-full gap-1.5 text-[10px] font-bold uppercase tracking-wider border-dashed"
                                    onClick={() => handleAddNote(item.id, 'image')}
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
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-1 rounded">Paragraph {index + 1}</span>
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
