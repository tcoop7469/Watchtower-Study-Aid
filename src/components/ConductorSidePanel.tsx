import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  BookOpen, 
  Image as ImageIcon, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Lightbulb, 
  Plus, 
  Upload, 
  AlertCircle,
  HelpCircle,
  BookmarkCheck,
  Download,
  Layers,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { StudyItem, ConductorData, ConductorPoint, ConductorPointColor } from '../types';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { generateConductorAnalysis, generateConductorAnalysisBatch } from '../services/geminiService';
import { ensureValidConductorData } from '../utils/conductorEngine';
import { cn } from '@/lib/utils';

interface ConductorSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  studyItems: StudyItem[];
  activeItemIndex: number;
  onSelectItem: (index: number) => void;
  onUpdateItemConductorData: (itemId: string, data: ConductorData) => void;
  onUpdateAllItemsConductorData?: (items: StudyItem[]) => void;
  onOpenScripture: (scripture: { reference: string; text: string }) => void;
  showHighlights: boolean;
  onToggleHighlights: (show: boolean) => void;
  onFocusPointInParagraph?: (pointText: string, itemId: string) => void;
  onOpenExportModal?: () => void;
}

export type ConductorTab = 'all' | 'points' | 'scriptures' | 'pictures' | 'tips';

export const COLOR_CONFIG: Record<ConductorPointColor, {
  name: string;
  bgLight: string;
  bgDark: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  highlightClass: string;
}> = {
  emerald: {
    name: 'Emerald (Primary)',
    bgLight: 'bg-emerald-50 text-emerald-900',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-200',
    border: 'border-emerald-500/40',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    highlightClass: 'bg-emerald-200/80 dark:bg-emerald-900/60 border-b-2 border-emerald-500 font-medium px-1 rounded transition-colors',
  },
  purple: {
    name: 'Purple (Depth)',
    bgLight: 'bg-purple-50 text-purple-900',
    bgDark: 'dark:bg-purple-950/40 dark:text-purple-200',
    border: 'border-purple-500/40',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/60',
    badgeText: 'text-purple-700 dark:text-purple-300',
    highlightClass: 'bg-purple-200/80 dark:bg-purple-900/60 border-b-2 border-purple-500 font-medium px-1 rounded transition-colors',
  },
  amber: {
    name: 'Amber (Insight)',
    bgLight: 'bg-amber-50 text-amber-900',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-200',
    border: 'border-amber-500/40',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/60',
    badgeText: 'text-amber-700 dark:text-amber-300',
    highlightClass: 'bg-amber-200/80 dark:bg-amber-900/60 border-b-2 border-amber-500 font-medium px-1 rounded transition-colors',
  },
  rose: {
    name: 'Rose (Heart)',
    bgLight: 'bg-rose-50 text-rose-900',
    bgDark: 'dark:bg-rose-950/40 dark:text-rose-200',
    border: 'border-rose-500/40',
    badgeBg: 'bg-rose-100 dark:bg-rose-900/60',
    badgeText: 'text-rose-700 dark:text-rose-300',
    highlightClass: 'bg-rose-200/80 dark:bg-rose-900/60 border-b-2 border-rose-500 font-medium px-1 rounded transition-colors',
  },
  cyan: {
    name: 'Cyan (Context)',
    bgLight: 'bg-cyan-50 text-cyan-900',
    bgDark: 'dark:bg-cyan-950/40 dark:text-cyan-200',
    border: 'border-cyan-500/40',
    badgeBg: 'bg-cyan-100 dark:bg-cyan-900/60',
    badgeText: 'text-cyan-700 dark:text-cyan-300',
    highlightClass: 'bg-cyan-200/80 dark:bg-cyan-900/60 border-b-2 border-cyan-500 font-medium px-1 rounded transition-colors',
  },
};

export function ConductorSidePanel({
  isOpen,
  onClose,
  studyItems,
  activeItemIndex,
  onSelectItem,
  onUpdateItemConductorData,
  onUpdateAllItemsConductorData,
  onOpenScripture,
  showHighlights,
  onToggleHighlights,
  onFocusPointInParagraph,
  onOpenExportModal
}: ConductorSidePanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ConductorTab>('all');
  const [pictureDescriptionInput, setPictureDescriptionInput] = useState('');
  const [hasPictureToggle, setHasPictureToggle] = useState(false);
  const [customQuestionInput, setCustomQuestionInput] = useState('');
  const [customScriptureRefInput, setCustomScriptureRefInput] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);

  const currentItem = studyItems[activeItemIndex];

  // Auto-heal current item if conductorData is missing or has 0 points
  React.useEffect(() => {
    if (currentItem && (!currentItem.conductorData || !currentItem.conductorData.extraPoints || currentItem.conductorData.extraPoints.length === 0)) {
      const healedData = ensureValidConductorData(currentItem, activeItemIndex);
      onUpdateItemConductorData(currentItem.id, healedData);
    }
  }, [currentItem, activeItemIndex]);

  // Sync picture toggle with current item
  React.useEffect(() => {
    if (currentItem?.conductorData) {
      setHasPictureToggle(!!currentItem.conductorData.hasPicture);
      setPictureDescriptionInput(currentItem.conductorData.pictureDescription || '');
    } else {
      setHasPictureToggle(false);
      setPictureDescriptionInput('');
    }
    setShowAddCustom(false);
    setCustomQuestionInput('');
    setCustomScriptureRefInput('');
  }, [activeItemIndex, currentItem]);

  const handleCopyQuestion = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedQuestionId(id);
    setTimeout(() => setCopiedQuestionId(null), 2000);
  };

  const handleAnalyzeParagraph = async (includePictureDetails = false) => {
    if (!currentItem) return;
    setIsAnalyzing(true);
    try {
      const data = await generateConductorAnalysis({
        question: currentItem.question,
        paragraph: currentItem.paragraph,
        scriptures: currentItem.scriptures,
        readScriptures: currentItem.readScriptures,
        scriptureTexts: currentItem.scriptureTexts,
        hasPicture: includePictureDetails ? hasPictureToggle : currentItem.conductorData?.hasPicture,
        pictureDescription: includePictureDetails ? pictureDescriptionInput : currentItem.conductorData?.pictureDescription,
        imageBase64: currentItem.conductorData?.pictureUrl,
      });

      // Retain custom image if previously attached
      const merged: ConductorData = {
        ...data,
        pictureUrl: currentItem.conductorData?.pictureUrl,
        hasPicture: data.hasPicture || hasPictureToggle || !!data.pictureQuestions?.length,
      };

      onUpdateItemConductorData(currentItem.id, merged);
    } catch (err) {
      console.error('Failed to generate conductor analysis:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeAllParagraphs = async () => {
    if (isBatchAnalyzing || studyItems.length === 0) return;
    setIsBatchAnalyzing(true);
    setBatchProgress({ current: 0, total: studyItems.length });

    try {
      const batchSize = 3;
      for (let i = 0; i < studyItems.length; i += batchSize) {
        const slice = studyItems.slice(i, i + batchSize);
        const batchResults = await generateConductorAnalysisBatch(slice);

        batchResults.forEach(res => {
          onUpdateItemConductorData(res.id, res.conductorData);
        });

        setBatchProgress({ current: Math.min(i + batchSize, studyItems.length), total: studyItems.length });
      }
    } catch (err) {
      console.error('Failed to batch analyze all paragraphs:', err);
    } finally {
      setIsBatchAnalyzing(false);
      setTimeout(() => setBatchProgress(null), 2500);
    }
  };

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (!currentItem) return;
      
      const existingData = currentItem.conductorData || {
        extraPoints: [],
        scriptureQuestions: [],
        pictureQuestions: [],
        hasPicture: true,
      };

      const updatedWithImage: ConductorData = {
        ...existingData,
        hasPicture: true,
        pictureUrl: base64,
      };
      
      onUpdateItemConductorData(currentItem.id, updatedWithImage);
      setHasPictureToggle(true);

      // Automatically analyze the uploaded picture with Gemini
      setIsAnalyzing(true);
      try {
        const result = await generateConductorAnalysis({
          question: currentItem.question,
          paragraph: currentItem.paragraph,
          scriptures: currentItem.scriptures,
          readScriptures: currentItem.readScriptures,
          scriptureTexts: currentItem.scriptureTexts,
          hasPicture: true,
          pictureDescription: pictureDescriptionInput || 'Analyze the visual details, mood, and lesson shown in this picture.',
          imageBase64: base64,
        });
        onUpdateItemConductorData(currentItem.id, {
          ...result,
          hasPicture: true,
          pictureUrl: base64,
        });
      } catch (e) {
        console.error('Error analyzing image:', e);
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddCustomPoint = () => {
    if (!customQuestionInput.trim() || !currentItem) return;
    const colors: ConductorPointColor[] = ['emerald', 'purple', 'amber', 'rose', 'cyan'];
    const currentPoints = currentItem.conductorData?.extraPoints || [];
    const nextColor = colors[currentPoints.length % colors.length];

    const newPoint: ConductorPoint = {
      id: `custom-${Date.now()}`,
      text: '',
      color: nextColor,
      label: 'Conductor Question',
      question: customQuestionInput.trim(),
      scriptureRef: customScriptureRefInput.trim() || undefined,
    };

    const updatedData: ConductorData = {
      ...(currentItem.conductorData || {
        scriptureQuestions: [],
        pictureQuestions: [],
        teachingTips: [],
      }),
      extraPoints: [...currentPoints, newPoint],
    };

    onUpdateItemConductorData(currentItem.id, updatedData);
    setCustomQuestionInput('');
    setCustomScriptureRefInput('');
    setShowAddCustom(false);
  };

  const handleDeletePoint = (pointId: string) => {
    if (!currentItem?.conductorData) return;
    const updatedPoints = (currentItem.conductorData.extraPoints || []).filter(p => p.id !== pointId);
    onUpdateItemConductorData(currentItem.id, {
      ...currentItem.conductorData,
      extraPoints: updatedPoints,
    });
  };

  if (!isOpen || !currentItem) return null;

  const conductor = currentItem.conductorData;
  const extraPoints = conductor?.extraPoints || [];
  const scriptureQuestions = conductor?.scriptureQuestions || [];
  const pictureQuestions = conductor?.pictureQuestions || [];
  const teachingTips = conductor?.teachingTips || [];

  // Render Section 1: Extra Points
  const renderExtraPointsSection = () => (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <h3 className="text-sm font-bold text-foreground">Extra Points & Follow-Up Questions</h3>
          {extraPoints.length > 0 && (
            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              {extraPoints.length} points
            </span>
          )}
        </div>
      </div>

      {/* Color Legend */}
      <div className="p-3 bg-muted/40 rounded-xl border border-border/60 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Colored Point Highlights:</span>
          <span className="text-[10px] text-primary/80 font-normal">Highlighted in paragraph text</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(COLOR_CONFIG) as ConductorPointColor[]).map((col) => {
            const cfg = COLOR_CONFIG[col];
            return (
              <div
                key={col}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border border-border/40",
                  cfg.badgeBg,
                  cfg.badgeText
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", col === 'emerald' ? 'bg-emerald-500' : col === 'purple' ? 'bg-purple-500' : col === 'amber' ? 'bg-amber-500' : col === 'rose' ? 'bg-rose-500' : 'bg-cyan-500')} />
                <span>{cfg.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* List of Extra Points */}
      <div className="space-y-3">
        {extraPoints.map((point, pIdx) => {
          const colorKey = (point.color || 'emerald') as ConductorPointColor;
          const cfg = COLOR_CONFIG[colorKey] || COLOR_CONFIG.emerald;

          return (
            <motion.div
              key={point.id || `point-${pIdx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pIdx * 0.04 }}
              className={cn(
                "p-3.5 rounded-xl border transition-all duration-200 shadow-xs relative group",
                cfg.bgLight,
                cfg.bgDark,
                cfg.border
              )}
            >
              {/* Point Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", cfg.badgeBg, cfg.badgeText)}>
                    Point {pIdx + 1} • {point.label || 'Extra Point'}
                  </span>
                  {point.scriptureRef && (
                    <span className="text-[9px] bg-background/80 px-1.5 py-0.5 rounded text-foreground/80 font-sans border border-border/40 flex items-center gap-1">
                      <BookOpen size={9} />
                      {point.scriptureRef}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {point.text && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[10px] gap-1 hover:bg-background/80"
                      onClick={() => onFocusPointInParagraph?.(point.text, currentItem.id)}
                      title="Scroll to point in paragraph text"
                    >
                      <BookmarkCheck size={11} />
                      <span>Locate</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-background/80"
                    onClick={() => handleCopyQuestion(point.question, point.id)}
                    title="Copy conductor question"
                  >
                    {copiedQuestionId === point.id ? (
                      <Check size={12} className="text-green-600" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-background/80"
                    onClick={() => handleDeletePoint(point.id)}
                    title="Delete this point"
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </div>

              {/* Conductor Question */}
              <div className="mb-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
                  <HelpCircle size={10} className="text-primary" />
                  <span>Conductor's Question:</span>
                </div>
                <p className="text-sm font-semibold text-foreground leading-snug">
                  "{point.question}"
                </p>
              </div>

              {/* Highlighted text excerpt from paragraph */}
              {point.text ? (
                <div className="p-2 rounded-lg bg-background/70 border border-border/50 text-xs italic text-foreground/80 leading-relaxed">
                  <span className="font-semibold not-italic text-[10px] text-muted-foreground block uppercase tracking-wider mb-0.5">
                    Highlighted Paragraph Excerpt:
                  </span>
                  "{point.text}"
                </div>
              ) : null}
            </motion.div>
          );
        })}

        {extraPoints.length === 0 && !isAnalyzing && (
          <div className="text-center py-6 text-xs text-muted-foreground space-y-2 bg-muted/20 rounded-xl border border-dashed border-border p-4">
            <p>No extra points extracted yet for this paragraph.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAnalyzeParagraph(false)}
              className="gap-1.5 text-xs"
            >
              <Sparkles size={12} /> Generate Extra Points
            </Button>
          </div>
        )}
      </div>

      {/* Add Custom Question Accordion */}
      <div className="pt-2">
        {!showAddCustom ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5 border-dashed border-border hover:bg-muted"
            onClick={() => setShowAddCustom(true)}
          >
            <Plus size={13} />
            Add Custom Conductor Question
          </Button>
        ) : (
          <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Add Custom Conductor Question</span>
              <button
                onClick={() => setShowAddCustom(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Cancel
              </button>
            </div>
            <Input
              placeholder="Type your question for the audience..."
              value={customQuestionInput}
              onChange={(e) => setCustomQuestionInput(e.target.value)}
              className="text-xs bg-background"
            />
            <Input
              placeholder="Optional scripture reference (e.g., Romans 12:2)..."
              value={customScriptureRefInput}
              onChange={(e) => setCustomScriptureRefInput(e.target.value)}
              className="text-xs bg-background"
            />
            <Button
              size="sm"
              className="w-full text-xs font-medium"
              onClick={handleAddCustomPoint}
              disabled={!customQuestionInput.trim()}
            >
              Save Custom Question
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Render Section 2: Scriptures
  const renderScripturesSection = () => (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-purple-600 dark:text-purple-400" />
          <h3 className="text-sm font-bold text-foreground">Scripture Application Questions</h3>
          {scriptureQuestions.length > 0 && (
            <span className="text-[10px] font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
              {scriptureQuestions.length}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 text-xs text-purple-950 dark:text-purple-200">
        <p className="leading-relaxed text-[11px] text-muted-foreground">
          Draw out the congregation's understanding of cited and read scriptures, linking Bible verses directly to the paragraph's theme.
        </p>
      </div>

      {/* Scripture Questions List */}
      <div className="space-y-3">
        {scriptureQuestions.map((sq, sqIdx) => {
          const isRead = currentItem.readScriptures.some(rs => rs.includes(sq.scriptureRef) || sq.scriptureRef.includes(rs));
          const scriptureTextObj = currentItem.scriptureTexts.find(
            st => st.reference === sq.scriptureRef || st.reference.includes(sq.scriptureRef) || sq.scriptureRef.includes(st.reference)
          );

          return (
            <div
              key={`sq-${sqIdx}`}
              className="p-3.5 rounded-xl bg-card border border-border shadow-xs space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1",
                    isRead ? "bg-blue-600 text-white" : "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300"
                  )}>
                    <BookOpen size={11} />
                    {sq.scriptureRef}
                  </span>
                  {isRead && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                      Read Scripture
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {scriptureTextObj && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[10px] gap-1 hover:bg-muted"
                      onClick={() => onOpenScripture(scriptureTextObj)}
                      title="View NWT Bible Text"
                    >
                      <Eye size={11} /> View Text
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-muted"
                    onClick={() => handleCopyQuestion(sq.question, `sq-${sqIdx}`)}
                    title="Copy scripture question"
                  >
                    {copiedQuestionId === `sq-${sqIdx}` ? (
                      <Check size={12} className="text-green-600" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
                  Conductor Question:
                </div>
                <p className="text-xs font-semibold text-foreground leading-relaxed">
                  "{sq.question}"
                </p>
              </div>

              {sq.purpose && (
                <div className="text-[11px] text-muted-foreground bg-muted/30 px-2.5 py-1.5 rounded-lg border border-border/40">
                  <span className="font-semibold text-foreground/80">Goal: </span>
                  {sq.purpose}
                </div>
              )}
            </div>
          );
        })}

        {scriptureQuestions.length === 0 && (
          <div className="p-4 text-center rounded-xl bg-muted/20 border border-border/60 text-xs text-muted-foreground space-y-2">
            <p>No scripture questions generated yet for this paragraph.</p>
            {currentItem.scriptures.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAnalyzeParagraph(false)}
                className="gap-1.5 text-xs"
              >
                <Sparkles size={12} /> Generate Scripture Questions
              </Button>
            )}
          </div>
        )}
      </div>

      {/* List of cited scriptures quick glance */}
      {currentItem.scriptureTexts && currentItem.scriptureTexts.length > 0 && (
        <div className="pt-2 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Cited Scriptures in this Paragraph:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {currentItem.scriptureTexts.map((st, i) => (
              <button
                key={i}
                onClick={() => onOpenScripture(st)}
                className="text-xs px-2.5 py-1 rounded-lg bg-background border border-border hover:border-purple-500/50 hover:bg-purple-500/5 text-foreground transition-all flex items-center gap-1.5"
              >
                <BookOpen size={11} className="text-purple-500" />
                <span>{st.reference}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Render Section 3: Picture & Artwork
  const renderPicturesSection = () => (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-rose-600 dark:text-rose-400" />
          <h3 className="text-sm font-bold text-foreground">Picture & Artwork Discussion</h3>
          {(conductor?.hasPicture || hasPictureToggle || pictureQuestions.length > 0) && (
            <span className="text-[10px] font-bold bg-rose-500/20 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
              Illustration Active
            </span>
          )}
        </div>
      </div>

      <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs text-rose-950 dark:text-rose-200">
        <p className="leading-relaxed text-[11px] text-muted-foreground">
          Use the artwork to engage visually. Ask questions about the setting, expressions, actions, and lessons shown.
        </p>
      </div>

      {/* Picture Status Box */}
      <div className="p-3.5 bg-card border border-border rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasPictureToggle}
              onChange={(e) => {
                const next = e.target.checked;
                setHasPictureToggle(next);
                if (conductor) {
                  onUpdateItemConductorData(currentItem.id, {
                    ...conductor,
                    hasPicture: next,
                  });
                }
              }}
              className="rounded border-border text-rose-600 focus:ring-rose-500 h-4 w-4"
            />
            <span>Illustration accompanies this paragraph</span>
          </label>
        </div>

        {/* Uploaded image preview if exists */}
        {conductor?.pictureUrl && (
          <div className="relative rounded-lg overflow-hidden border border-border group max-h-48 bg-muted">
            <img
              src={conductor.pictureUrl}
              alt="Paragraph illustration"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <Button
                variant="destructive"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => {
                  if (conductor) {
                    onUpdateItemConductorData(currentItem.id, {
                      ...conductor,
                      pictureUrl: undefined,
                    });
                  }
                }}
                title="Remove picture"
              >
                <X size={12} />
              </Button>
            </div>
          </div>
        )}

        {/* Upload image or description form */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>Describe illustration or attach picture:</span>
            <label className="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1">
              <Upload size={11} /> Upload Artwork
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />
            </label>
          </div>

          <Textarea
            placeholder="e.g., A father and daughter sharing scriptures with a neighbor at the door, smiling and holding open Bibles..."
            value={pictureDescriptionInput}
            onChange={(e) => setPictureDescriptionInput(e.target.value)}
            className="text-xs bg-background resize-none min-h-[60px]"
          />

          <Button
            size="sm"
            onClick={() => handleAnalyzeParagraph(true)}
            disabled={isAnalyzing}
            className="w-full text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium gap-1.5"
          >
            <Sparkles size={12} />
            {isAnalyzing ? "Analyzing Picture..." : "Generate Artwork Discussion Questions"}
          </Button>
        </div>
      </div>

      {/* Picture Questions */}
      <div className="space-y-3">
        {pictureQuestions.map((pq, pqIdx) => (
          <div
            key={`pq-${pqIdx}`}
            className="p-3.5 rounded-xl bg-card border border-rose-500/30 hover:border-rose-500/50 transition-colors shadow-xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
                Artwork Question {pqIdx + 1}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted"
                onClick={() => handleCopyQuestion(pq.question, `pq-${pqIdx}`)}
                title="Copy question"
              >
                {copiedQuestionId === `pq-${pqIdx}` ? (
                  <Check size={12} className="text-green-600" />
                ) : (
                  <Copy size={12} />
                )}
              </Button>
            </div>

            <p className="text-xs font-semibold text-foreground leading-relaxed">
              "{pq.question}"
            </p>

            {pq.focus && (
              <div className="text-[11px] text-muted-foreground bg-rose-500/5 px-2.5 py-1.5 rounded-lg border border-rose-500/20">
                <span className="font-semibold text-rose-800 dark:text-rose-300">Visual Focus: </span>
                {pq.focus}
              </div>
            )}
          </div>
        ))}

        {pictureQuestions.length === 0 && !isAnalyzing && (
          <div className="text-center py-4 text-xs text-muted-foreground italic bg-muted/20 rounded-xl p-3 border border-border">
            No artwork questions yet. Check the box above or describe the illustration to generate discussion questions.
          </div>
        )}
      </div>
    </div>
  );

  // Render Section 4: Teaching Tips
  const renderTeachingTipsSection = () => (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-amber-500" />
          <h3 className="text-sm font-bold text-foreground">Conductor Teaching & Pacing Tips</h3>
        </div>
      </div>

      <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs">
        <p className="leading-relaxed text-[11px] text-muted-foreground">
          Practical pointers for managing meeting pacing, drawing out varied answers, and keeping the audience engaged.
        </p>
      </div>

      <div className="space-y-2.5">
        {teachingTips.map((tip, tIdx) => (
          <div
            key={`tip-${tIdx}`}
            className="p-3 rounded-xl bg-card border border-border shadow-xs flex items-start gap-2.5 text-xs text-foreground/90 leading-relaxed"
          >
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
              {tIdx + 1}
            </span>
            <span>{tip}</span>
          </div>
        ))}

        {teachingTips.length === 0 && (
          <>
            <div className="p-3 rounded-xl bg-card border border-border text-xs text-foreground/90 leading-relaxed flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">1</span>
              <span><strong>Allow silence:</strong> Give the congregation 3-5 seconds after reading the paragraph before expecting hands to rise.</span>
            </div>
            <div className="p-3 rounded-xl bg-card border border-border text-xs text-foreground/90 leading-relaxed flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">2</span>
              <span><strong>Bridge between answers:</strong> If the first comment covers the primary point, ask: <em>"What other gem or reason in this paragraph strengthens our appreciation?"</em></span>
            </div>
            <div className="p-3 rounded-xl bg-card border border-border text-xs text-foreground/90 leading-relaxed flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">3</span>
              <span><strong>Read Scriptures:</strong> Always call for designated 'Read' scriptures to be read in full, then ask how the scripture supports the thought.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-xs z-30 sm:hidden"
        onClick={onClose}
      />

      {/* Main Conductor Side Panel - scrollable when content is longer than screen */}
      <aside
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] md:w-[520px] max-h-screen max-h-[100dvh] h-[100dvh] bg-card border-l border-border shadow-2xl z-40 flex flex-col overflow-y-auto overscroll-contain custom-scrollbar select-text transition-all duration-300"
        aria-label="Conductor Mode Panel"
      >
        {/* Sticky Top Header Container */}
        <div className="sticky top-0 z-30 bg-card border-b border-border shadow-xs shrink-0">
          {/* Main Title Bar */}
          <div className="p-4 sm:p-5 border-b border-border bg-gradient-to-r from-amber-500/10 via-primary/5 to-purple-500/10">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-md shadow-amber-500/25">
                  <Users size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif font-bold text-lg text-foreground tracking-tight">Conductor Mode</h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
                      Live Helper
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Draw out all points, scriptures & illustrations
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {onOpenExportModal && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={onOpenExportModal}
                    title="Save & Export with Conductor Items"
                  >
                    <Download size={16} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  title="Close Conductor Mode"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            {/* Global Highlight Toggle & Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
              <button
                onClick={() => onToggleHighlights(!showHighlights)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                  showHighlights 
                    ? "bg-primary/10 border-primary/30 text-primary font-semibold" 
                    : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                )}
                title="Toggle extra colored point highlights in the paragraph"
              >
                {showHighlights ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>{showHighlights ? "Highlights: ON" : "Highlights: OFF"}</span>
              </button>

              <div className="flex items-center gap-1">
                {onOpenExportModal && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenExportModal}
                    className="h-7 text-xs px-2 gap-1 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                    title="Export complete study file with all Conductor items"
                  >
                    <Download size={12} />
                    <span>Export</span>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAnalyzeAllParagraphs}
                  disabled={isBatchAnalyzing || isAnalyzing}
                  className="h-7 text-xs px-2 gap-1 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                  title="Analyze all paragraphs in the article with AI to generate complete Conductor questions"
                >
                  <Sparkles size={12} className={cn(isBatchAnalyzing && "animate-spin text-amber-500")} />
                  <span>
                    {batchProgress 
                      ? `${batchProgress.current}/${batchProgress.total}` 
                      : isBatchAnalyzing 
                        ? "Analyzing..." 
                        : "Analyze All"}
                  </span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAnalyzeParagraph(false)}
                  disabled={isAnalyzing || isBatchAnalyzing}
                  className="h-7 text-xs px-2 gap-1 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  title="Re-analyze or generate fresh conductor questions for this paragraph"
                >
                  <RefreshCw size={12} className={cn(isAnalyzing && "animate-spin")} />
                  <span>{isAnalyzing ? "Analyzing..." : "Re-Analyze"}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Paragraph Nav bar & Quick Selector */}
          <div className="px-4 py-2 bg-muted/40 border-b border-border flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-lg border-border"
                  disabled={activeItemIndex === 0}
                  onClick={() => onSelectItem(activeItemIndex - 1)}
                  title="Previous Paragraph"
                >
                  <ChevronLeft size={14} />
                </Button>

                {/* Dropdown select for instant jump to any paragraph */}
                <select
                  value={activeItemIndex}
                  onChange={(e) => onSelectItem(Number(e.target.value))}
                  className="h-7 px-2 text-xs font-bold uppercase tracking-wider bg-card border border-border rounded-lg text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-[170px]"
                  title="Select paragraph to open in Conductor Mode"
                >
                  {studyItems.map((item, idx) => {
                    const count = item.conductorData?.extraPoints?.length || 0;
                    return (
                      <option key={item.id || idx} value={idx}>
                        Para {idx + 1} ({count} pts){item.subheading ? ` - ${item.subheading.substring(0, 16)}` : ''}
                      </option>
                    );
                  })}
                </select>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-lg border-border"
                  disabled={activeItemIndex === studyItems.length - 1}
                  onClick={() => onSelectItem(activeItemIndex + 1)}
                  title="Next Paragraph"
                >
                  <ChevronRight size={14} />
                </Button>
              </div>

              <div className="text-[11px] text-muted-foreground font-medium truncate max-w-[150px] text-right">
                {currentItem.subheading || `Question ${activeItemIndex + 1}`}
              </div>
            </div>

            {/* Quick jump pill strip for all paragraphs */}
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 pt-0.5">
              {studyItems.map((item, idx) => {
                const isActive = idx === activeItemIndex;
                const ptCount = item.conductorData?.extraPoints?.length || 0;
                return (
                  <button
                    key={item.id || idx}
                    onClick={() => onSelectItem(idx)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold shrink-0 transition-all border flex items-center gap-1",
                      isActive
                        ? "bg-amber-500 text-white border-amber-600 shadow-xs scale-105"
                        : ptCount > 0
                          ? "bg-card text-foreground/80 hover:bg-muted border-border hover:border-amber-500/50"
                          : "bg-muted/30 text-muted-foreground border-dashed border-border"
                    )}
                    title={`Paragraph ${idx + 1}: ${ptCount} points • "${item.question.substring(0, 40)}..."`}
                  >
                    <span>{idx + 1}</span>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isActive ? "bg-white" : ptCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"
                    )} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Study Question Context Bar */}
          <div className="px-4 py-2.5 bg-background border-b border-border/80">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
              Main Study Question:
            </div>
            <p className="text-xs font-medium text-foreground line-clamp-2 leading-relaxed">
              {currentItem.question}
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-border bg-muted/20 text-xs font-medium px-2 pt-1 gap-1 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "py-2 px-2.5 text-center border-b-2 transition-all flex items-center justify-center gap-1 shrink-0",
                activeTab === 'all'
                  ? "border-amber-500 text-amber-700 dark:text-amber-400 font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              title="All items overview (scrollable)"
            >
              <Layers size={13} className="text-amber-500" />
              <span>All Items</span>
            </button>

            <button
              onClick={() => setActiveTab('points')}
              className={cn(
                "py-2 px-2.5 text-center border-b-2 transition-all flex items-center justify-center gap-1 shrink-0",
                activeTab === 'points'
                  ? "border-amber-500 text-amber-700 dark:text-amber-400 font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles size={13} className="text-amber-500" />
              <span>Extra Points</span>
              {extraPoints.length > 0 && (
                <span className="bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {extraPoints.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('scriptures')}
              className={cn(
                "py-2 px-2.5 text-center border-b-2 transition-all flex items-center justify-center gap-1 shrink-0",
                activeTab === 'scriptures'
                  ? "border-purple-500 text-purple-700 dark:text-purple-400 font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <BookOpen size={13} className="text-purple-500" />
              <span>Scriptures</span>
              {(currentItem.scriptures.length > 0 || scriptureQuestions.length > 0) && (
                <span className="bg-purple-500/20 text-purple-800 dark:text-purple-300 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {scriptureQuestions.length || currentItem.scriptures.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('pictures')}
              className={cn(
                "py-2 px-2.5 text-center border-b-2 transition-all flex items-center justify-center gap-1 shrink-0",
                activeTab === 'pictures'
                  ? "border-rose-500 text-rose-700 dark:text-rose-400 font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <ImageIcon size={13} className="text-rose-500" />
              <span>Picture & Art</span>
              {(conductor?.hasPicture || hasPictureToggle || pictureQuestions.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('tips')}
              className={cn(
                "py-2 px-2 text-center border-b-2 transition-all flex items-center justify-center gap-1 shrink-0",
                activeTab === 'tips'
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              title="Teaching Tips"
            >
              <Lightbulb size={13} />
              <span>Tips</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 p-4 space-y-5">
          {/* Analyzing loading state */}
          {isAnalyzing && (
            <div className="p-8 text-center space-y-3 bg-muted/30 rounded-2xl border border-dashed border-amber-500/40 my-4 animate-pulse">
              <Sparkles className="mx-auto text-amber-500 animate-spin" size={28} />
              <h4 className="font-semibold text-sm">Generating Conductor Points...</h4>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Analyzing paragraph nuances, scripture applications, and artwork questions.
              </p>
            </div>
          )}

          {/* Not analyzed yet banner */}
          {!conductor && !isAnalyzing && (
            <div className="p-5 text-center space-y-3 bg-amber-500/5 rounded-2xl border border-amber-500/20 my-4">
              <Lightbulb className="mx-auto text-amber-500" size={32} />
              <h4 className="font-semibold text-sm text-foreground">Conductor Analysis Ready</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Activate Conductor Mode for this paragraph to uncover all secondary points, color-coded highlights, scripture questions, and picture discussion points.
              </p>
              <Button
                onClick={() => handleAnalyzeParagraph(false)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs gap-2"
              >
                <Sparkles size={14} />
                Analyze This Paragraph
              </Button>
            </div>
          )}

          {/* Views */}
          {activeTab === 'all' && (
            <div className="space-y-6">
              {renderExtraPointsSection()}
              <Separator className="bg-border/60" />
              {renderScripturesSection()}
              <Separator className="bg-border/60" />
              {renderPicturesSection()}
              <Separator className="bg-border/60" />
              {renderTeachingTipsSection()}
            </div>
          )}

          {activeTab === 'points' && renderExtraPointsSection()}
          {activeTab === 'scriptures' && renderScripturesSection()}
          {activeTab === 'pictures' && renderPicturesSection()}
          {activeTab === 'tips' && renderTeachingTipsSection()}
        </div>

        {/* Sticky Footer Navigation */}
        <div className="sticky bottom-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border p-3 shrink-0 flex items-center justify-between text-xs shadow-xs">
          <Button
            variant="ghost"
            size="sm"
            disabled={activeItemIndex === 0}
            onClick={() => onSelectItem(activeItemIndex - 1)}
            className="gap-1 text-xs"
          >
            <ChevronLeft size={14} /> Previous
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-medium">
              {activeItemIndex + 1} / {studyItems.length}
            </span>
            {onOpenExportModal && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenExportModal}
                className="h-7 text-xs px-2 gap-1 border-border text-foreground hover:bg-muted"
                title="Export complete study file with all Conductor items"
              >
                <Download size={11} />
                <span>Save / Export</span>
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={activeItemIndex === studyItems.length - 1}
            onClick={() => onSelectItem(activeItemIndex + 1)}
            className="gap-1 text-xs"
          >
            Next <ChevronRight size={14} />
          </Button>
        </div>
      </aside>
    </>
  );
}
