import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Image as ImageIcon, Calendar, Edit2, X, Check, Download } from 'lucide-react';
import { WatchtowerArticle } from '../types';

export interface ArticleRecord {
  id: string;
  userId: string;
  title: string;
  date: string;
  coverUrl: string;
  createdAt: number;
  articleData: string;
}

export function Library({ onSelectArticle }: { onSelectArticle: (article: WatchtowerArticle, id: string) => void }) {
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");

  const loadArticles = () => {
    try {
      const stored = localStorage.getItem('watchtower-articles');
      if (stored) {
        const parsed = JSON.parse(stored) as ArticleRecord[];
        parsed.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
        setArticles(parsed);
      }
    } catch (error) {
      console.error("Failed to load articles from local storage", error);
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

  const saveToStorage = (updatedArticles: ArticleRecord[]) => {
    localStorage.setItem('watchtower-articles', JSON.stringify(updatedArticles));
    setArticles(updatedArticles);
    // Dispatch custom event to notify App.tsx if it's listening
    window.dispatchEvent(new Event('articlesUpdated'));
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this article?')) return;
    const updated = articles.filter(a => a.id !== id);
    saveToStorage(updated);
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

  const handleEditSave = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!editTitle.trim()) return;
    
    const updated = articles.map(record => {
      if (record.id === id) {
        try {
          const parsed = JSON.parse(record.articleData);
          parsed.title = editTitle;
          return {
            ...record,
            title: editTitle,
            date: editDate,
            articleData: JSON.stringify(parsed)
          };
        } catch (e) {
          return {
            ...record,
            title: editTitle,
            date: editDate
          };
        }
      }
      return record;
    });
    
    saveToStorage(updated);
    setEditingId(null);
  };

  const exportArticle = (e: React.MouseEvent, record: ArticleRecord) => {
    e.stopPropagation();
    try {
      const parsed = JSON.parse(record.articleData);
      // Ensure we export it parsed as a nice WatchtowerArticle json representation
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

  const upcomingArticles = articles.filter(a => !a.date || new Date(a.date) >= new Date(new Date().setHours(0,0,0,0)));
  const previousArticles = articles.filter(a => a.date && new Date(a.date) < new Date(new Date().setHours(0,0,0,0)));

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading library...</div>;
  }

  const renderArticleList = (list: ArticleRecord[]) => (
    <div className="flex flex-col gap-3">
      {list.map((record) => (
        <div 
          key={record.id} 
          className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer shadow-sm group" 
          onClick={() => {
            if (editingId !== record.id) {
              onSelectArticle(JSON.parse(record.articleData), record.id);
            }
          }}
        >
          {editingId === record.id ? (
            <div className="flex-1 flex flex-col gap-2 w-full" onClick={(e) => e.stopPropagation()}>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Article Title"
                className="h-8 text-sm"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="h-8 text-sm w-40"
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
              <div className="flex flex-col gap-1 flex-1 pr-4">
                <h3 className="font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                  {record.title}
                </h3>
                {record.date ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar size={12} />
                    Study Date: {new Date(record.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                    <Calendar size={12} />
                    No study date set
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
                  title="Edit Article"
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
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-serif text-primary italic">My Library</h1>
          <p className="text-sm text-muted-foreground">Manage and study your processed Watchtower articles</p>
        </div>
        {articles.length > 0 && (
          <Button 
            onClick={exportAllArticles} 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-2 border-border hover:bg-muted"
          >
            <Download size={14} />
            Export Library Backup (.json)
          </Button>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">Upcoming & Current</h2>
        {upcomingArticles.length > 0 ? renderArticleList(upcomingArticles) : <p className="text-muted-foreground text-sm italic">No upcoming articles.</p>}
      </div>
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">Previous Articles</h2>
        {previousArticles.length > 0 ? renderArticleList(previousArticles) : <p className="text-muted-foreground text-sm italic">No previous articles.</p>}
      </div>
    </div>
  );
}
