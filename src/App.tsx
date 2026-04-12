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
  Image as ImageIcon,
  Type,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { processArticle, regenerateComment } from "./services/geminiService";
import { WatchtowerArticle, StudyItem } from "./types";
import { cn } from "@/lib/utils";

export default function App() {
  const [inputText, setInputText] = useState("");
  const [article, setArticle] = useState<WatchtowerArticle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [collapsedSuggestions, setCollapsedSuggestions] = useState<Set<string>>(new Set());
  const [collapsedNotes, setCollapsedNotes] = useState<Set<string>>(new Set());

  // Initialize theme from system preference or local storage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

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

  const handleImport = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await processArticle(inputText);
      setArticle(result);
      setCollapsedSuggestions(new Set(result.items.map(item => item.id)));
      setCollapsedNotes(new Set()); // New articles have no notes yet
      setInputText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateComment = (id: string, newComment: string) => {
    if (!article) return;
    setArticle({
      ...article,
      items: article.items.map(item => 
        item.id === id ? { ...item, userComment: newComment } : item
      )
    });
  };

  const handleRegenerate = async (id: string, question: string, paragraph: string) => {
    if (!article) return;
    setRegeneratingId(id);
    try {
      const newComment = await regenerateComment(question, paragraph);
      setArticle({
        ...article,
        items: article.items.map(item => 
          item.id === id ? { ...item, suggestedComment: newComment } : item
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
    const dataStr = JSON.stringify(article, null, 2);
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
        const importedArticle = JSON.parse(content) as WatchtowerArticle;
        
        // Basic validation
        if (importedArticle.title && Array.isArray(importedArticle.items)) {
          setArticle(importedArticle);
          setCollapsedSuggestions(new Set(importedArticle.items.map(item => item.id)));
          
          // Collapse all existing additional notes
          const allNoteIds: string[] = [];
          importedArticle.items.forEach(item => {
            item.additionalNotes?.forEach(note => {
              allNoteIds.push(note.id);
            });
          });
          setCollapsedNotes(new Set(allNoteIds));
          
          setError(null);
        } else {
          setError("Invalid study data file.");
        }
      } catch (err) {
        setError("Failed to parse study data file.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const toggleSuggestion = (id: string) => {
    setCollapsedSuggestions(prev => {
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

  const reset = () => {
    setArticle(null);
    setInputText("");
    setError(null);
    setCollapsedSuggestions(new Set());
    setCollapsedNotes(new Set());
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
    
    // 2. Read Scriptures (Blue highlight + Bold)
    item.readScriptures.forEach((s, sIdx) => {
      content = formatText(content, s, (match, i) => (
        <span key={`read-${sIdx}-${i}`} className="bg-blue-300 dark:bg-blue-800 text-foreground not-italic font-bold px-1 rounded shadow-sm">
          {match}
        </span>
      ));
    });
    
    // 3. Other Scriptures (Bold)
    item.scriptures.forEach((s, sIdx) => {
      if (item.readScriptures.includes(s)) return;
      content = formatText(content, s, (match, i) => (
        <span key={`scripture-${sIdx}-${i}`} className="font-bold not-italic text-primary/90">
          {match}
        </span>
      ));
    });
    
    return content;
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <BookOpen size={22} />
            </div>
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
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-muted"
              onClick={() => document.getElementById('import-data')?.click()}
              title="Import Study Data"
            >
              <Upload size={20} />
            </Button>
            {article && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full hover:bg-muted"
                onClick={handleExport}
                title="Export Study Data"
              >
                <Download size={20} />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleDarkMode}
              className="rounded-full hover:bg-muted"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </Button>
            {article && (
              <>
                <Button variant="outline" size="sm" onClick={copyAllComments} className="hidden sm:flex gap-2 border-border hover:bg-muted">
                  {copiedId === "all" ? <Check size={14} /> : <Copy size={14} />}
                  {copiedId === "all" ? "Copied All" : "Copy All"}
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 size={14} />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 pb-24">
        <AnimatePresence mode="wait">
          {!article && !isLoading ? (
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
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm font-medium uppercase tracking-widest">
                  <Separator className="w-8 bg-border" />
                  <span>Study Preparation</span>
                  <Separator className="w-8 bg-border" />
                </div>
              </div>

              <Tabs defaultValue="study" className="w-full">
                <div className="flex justify-center mb-8">
                  <TabsList className="bg-muted p-1 rounded-xl">
                    <TabsTrigger value="study" className="rounded-lg gap-2 px-6">
                      <Layout size={16} />
                      Study
                    </TabsTrigger>
                    <TabsTrigger value="article" className="rounded-lg gap-2 px-6">
                      <FileText size={16} />
                      Article
                    </TabsTrigger>
                    <TabsTrigger value="scriptures" className="rounded-lg gap-2 px-6">
                      <BookOpen size={16} />
                      Scriptures
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="study" className="space-y-6 outline-none">
                  {article?.items.map((item, index) => (
                    <motion.div
                      key={item.id}
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
                          <div className="p-4 rounded-xl bg-muted/50 border border-border text-sm text-muted-foreground leading-relaxed italic">
                            {renderParagraph(item)}
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                <User size={12} className="text-primary" />
                                My Comment
                              </label>
                              <Textarea
                                value={item.userComment}
                                onChange={(e) => handleUpdateComment(item.id, e.target.value)}
                                className="min-h-[100px] border-border focus-visible:ring-primary bg-background shadow-inner text-base"
                                placeholder="Type your personal comment here..."
                              />
                            </div>

                            <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
                              <button 
                                onClick={() => toggleSuggestion(item.id)}
                                className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <Sparkles size={12} className="text-amber-500" />
                                  AI Suggested Comment
                                </div>
                                {collapsedSuggestions.has(item.id) ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                              </button>
                              
                              <AnimatePresence>
                                {!collapsedSuggestions.has(item.id) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-4 pt-0 space-y-3">
                                      <div className="p-3 rounded-lg bg-background border border-border text-sm leading-relaxed text-foreground/80">
                                        {item.suggestedComment}
                                      </div>
                                      <div className="flex justify-end">
                                        <Button 
                                          variant="outline" 
                                          size="sm" 
                                          className="text-[10px] h-7 px-2 gap-1.5 border-border hover:bg-primary hover:text-primary-foreground"
                                          onClick={() => copySuggestionToUser(item.id, item.suggestedComment)}
                                        >
                                          <Copy size={10} />
                                          Use this suggestion
                                        </Button>
                                      </div>
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
                  ))}
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
              </Tabs>

              <div className="flex justify-center pt-8">
                <Button 
                  variant="outline" 
                  onClick={reset}
                  className="border-border text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  Start New Study
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border p-4 text-center">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">
          "Study to show thyself approved"
        </p>
      </footer>
    </div>
  );
}
