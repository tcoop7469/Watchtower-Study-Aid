import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Image as ImageIcon, Calendar, Edit2, X, Check, Download, Search, BookOpen, Sparkles, Layers } from 'lucide-react';
import { WatchtowerArticle } from '../types';
import { ensureArticleConductorData } from '../utils/conductorEngine';
import { fetchArticles, saveArticleRecord, deleteArticleRecord } from '../services/articleStorage';

export interface ArticleRecord {
  id: string;
  userId: string;
  title: string;
  date: string;
  coverUrl: string;
  createdAt: number;
  articleData: string;
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (y && m && d) {
      const dObj = new Date(y, m - 1, d);
      return dObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    }
  }
  return dateStr;
}

export function parseDateTimestamp(dateStr: string): number {
  if (!dateStr) return 0;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (y && m && d) {
      return new Date(y, m - 1, d).getTime();
    }
  }
  return new Date(dateStr).getTime() || 0;
}

export function Library({ 
  onSelectArticle, 
  activeArticleId,
  onImportNew 
}: { 
  onSelectArticle: (article: WatchtowerArticle, id: string, date?: string) => void;
  activeArticleId?: string | null;
  onImportNew?: () => void;
}) {
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<'all' | 'upcoming' | 'previous'>('all');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");

  const loadArticles = async () => {
    try {
      const list = await fetchArticles();
      setArticles(list);
    } catch (error) {
      console.error("Failed to load articles", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
    
    // Listen for storage events to sync across tabs, or custom events from the same tab
    const handleStorageChange = () => {
      loadArticles();
    };
    
    window.addEventListener('articlesUpdated', handleStorageChange);
    window.addEventListener('storage', (e) => {
      if (e.key === 'watchtower-articles') loadArticles();
    });
    
    return () => {
      window.removeEventListener('articlesUpdated', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this article?')) return;
    await deleteArticleRecord(id);
    setArticles(prev => prev.filter(a => a.id !== id));
  };

  const startEditing = (e: React.MouseEvent, record: ArticleRecord) => {
    e.stopPropagation();
    setEditingId(record.id);
    setEditTitle(record.title);
    setEditDate(record.date || "");
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleEditSave = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!editTitle.trim()) return;
    
    const target = articles.find(a => a.id === id);
    if (!target) return;

    let updatedArticleData = target.articleData;
    try {
      const parsed = JSON.parse(target.articleData);
      parsed.title = editTitle;
      parsed.studyDate = editDate;
      updatedArticleData = JSON.stringify(parsed);
    } catch (e) {}

    const updatedRecord: ArticleRecord = {
      ...target,
      title: editTitle,
      date: editDate,
      articleData: updatedArticleData
    };

    await saveArticleRecord(updatedRecord);
    setArticles(prev => prev.map(a => a.id === id ? updatedRecord : a));
    setEditingId(null);
  };

  const exportArticle = (e: React.MouseEvent, record: ArticleRecord) => {
    e.stopPropagation();
    try {
      const raw = JSON.parse(record.articleData);
      const parsed = ensureArticleConductorData(raw);
      if (!parsed.studyDate && record.date) {
        parsed.studyDate = record.date;
      }
      const dataStr = JSON.stringify(parsed, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `watchtower-study-${record.title.replace(/\s+/g, '-').toLowerCase()}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (err) {
      console.error("Failed to export article data:", err);
    }
  };

  const exportAllArticles = () => {
    if (articles.length === 0) return;
    try {
      const dataStr = JSON.stringify(articles, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `watchtower-study-library-backup.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (err) {
      console.error("Failed to export library backup:", err);
    }
  };

  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  
  // Filter by query first
  const queryFiltered = articles.filter(a => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.title?.toLowerCase().includes(q) || a.date?.includes(q);
  });

  const upcomingArticles = queryFiltered.filter(a => !a.date || parseDateTimestamp(a.date) >= todayStart);
  const previousArticles = queryFiltered.filter(a => a.date && parseDateTimestamp(a.date) < todayStart);

  const displayedArticles = filterTab === 'upcoming' 
    ? upcomingArticles 
    : filterTab === 'previous' 
      ? previousArticles 
      : queryFiltered;

  if (loading) {
    return <div className="p-12 text-center text-muted-foreground font-medium">Loading your dashboard...</div>;
  }

  const renderArticleList = (list: ArticleRecord[]) => (
    <div className="flex flex-col gap-3">
      {list.map((record) => {
        const isActive = activeArticleId === record.id;
        return (
          <div 
            key={record.id} 
            className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer shadow-xs group ${
              isActive 
                ? 'border-indigo-500/60 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-500/30' 
                : 'border-border bg-card hover:border-border/80 hover:bg-muted/40'
            }`}
            onClick={() => {
              if (editingId !== record.id) {
                try {
                  const raw = JSON.parse(record.articleData);
                  const parsed = ensureArticleConductorData(raw);
                  onSelectArticle(parsed, record.id, record.date || parsed.studyDate);
                } catch (e) {
                  console.error("Failed to parse article data", e);
                }
              }
            }}
          >
            {editingId === record.id ? (
              <div className="flex-1 flex flex-col gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Article Title"
                  className="h-8 text-sm bg-background"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-8 text-sm w-44 bg-background"
                  />
                  <Button size="sm" onClick={(e) => handleEditSave(e, record.id)} className="h-8 ml-auto flex gap-1.5 items-center">
                    <Check size={14} /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-8 text-muted-foreground">
                    <X size={14} /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors text-base">
                      {record.title}
                    </h3>
                    {isActive && (
                      <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-500/30">
                        Currently Open
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {record.date ? (
                      <div className="flex items-center gap-1.5 font-medium text-foreground/80">
                        <Calendar size={13} className="text-primary" />
                        <span>Study Date: {formatDisplayDate(record.date)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 italic">
                        <Calendar size={13} />
                        <span>No study date specified</span>
                      </div>
                    )}
                    <span>•</span>
                    <span className="text-[11px] text-muted-foreground/80">
                      Saved {new Date(record.createdAt || Date.now()).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" 
                    onClick={(e) => exportArticle(e, record)}
                    title="Export Article JSON"
                  >
                    <Download size={16} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" 
                    onClick={(e) => startEditing(e, record)}
                    title="Edit Title / Date"
                  >
                    <Edit2 size={16} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
                    onClick={(e) => { e.stopPropagation(); handleDelete(record.id); }}
                    title="Delete Article"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-serif text-primary italic">Dashboard & Library</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {articles.length} {articles.length === 1 ? 'article' : 'articles'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            All your processed Watchtower articles, saved comments, notes, and conductor highlights
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onImportNew && (
            <Button onClick={onImportNew} size="sm" className="gap-1.5 shadow-sm">
              <Sparkles size={14} /> Import New Article
            </Button>
          )}
          {articles.length > 0 && (
            <Button 
              onClick={exportAllArticles} 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1.5 border-border hover:bg-muted text-xs"
              title="Download backup file of all saved articles"
            >
              <Download size={14} /> Backup All (.json)
            </Button>
          )}
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center space-y-4 bg-muted/20">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <BookOpen size={28} />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="font-semibold text-lg">No Articles in Your Dashboard Yet</h3>
            <p className="text-sm text-muted-foreground">
              When you paste and process a Watchtower article, it is automatically saved here with all your comments and conductor points.
            </p>
          </div>
          {onImportNew && (
            <Button onClick={onImportNew} className="gap-2 mt-2">
              <Sparkles size={16} /> Import Your First Article
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Controls: Search & Tabs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filterTab === 'all'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({queryFiltered.length})
              </button>
              <button
                onClick={() => setFilterTab('upcoming')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filterTab === 'upcoming'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Upcoming ({upcomingArticles.length})
              </button>
              <button
                onClick={() => setFilterTab('previous')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filterTab === 'previous'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Previous ({previousArticles.length})
              </button>
            </div>

            <div className="relative max-w-xs w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search articles by title or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs bg-card border-border"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")} 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          {displayedArticles.length > 0 ? (
            renderArticleList(displayedArticles)
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm border border-border rounded-xl bg-card">
              No articles match your search or filter.
            </div>
          )}
        </>
      )}
    </div>
  );
}
