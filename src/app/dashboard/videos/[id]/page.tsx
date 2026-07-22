"use client";

import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Video, Loader2, CheckCircle, AlertCircle, Clock, Sparkles, RefreshCw, Play, Dumbbell } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface VideoData {
  id: string;
  athlete_id: string;
  s3_key: string;
  status: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  uploaded_at: string;
  processed_at: string | null;
  error_message: string | null;
}

interface AnalysisData {
  id: string;
  status: string;
  overall_score: number | null;
  confidence_level: string | null;
  feedback_json: any;
  processing_time_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  uploading: { label: "Uploading", icon: <Clock className="w-4 h-4" />, color: "text-zinc-400" },
  processing: { label: "Processing", icon: <Loader2 className="w-4 h-4 animate-spin" />, color: "text-orange-400" },
  ready: { label: "Ready", icon: <CheckCircle className="w-4 h-4" />, color: "text-emerald-400" },
  failed: { label: "Failed", icon: <AlertCircle className="w-4 h-4" />, color: "text-red-400" },
};

const CATEGORY_LABELS: Record<string, string> = {
  shooting_form: "Shooting Form",
  ball_handling: "Ball Handling",
  footwork: "Footwork",
  defense: "Defense",
  passing: "Passing",
  decision_making: "Decision Making",
};

function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return null;

  const config: Record<string, { emoji: string; label: string; variant: "success" | "warning" | "default" }> = {
    high: { emoji: "🟢", label: "High confidence", variant: "success" },
    medium: { emoji: "🟡", label: "Medium confidence", variant: "warning" },
    low: { emoji: "🔴", label: "Low confidence", variant: "default" },
  };

  const c = config[level] || config.low;

  return (
    <Badge variant={c.variant} className="flex items-center gap-1">
      <span>{c.emoji}</span>
      {c.label}
    </Badge>
  );
}

function ScoreGauge({ score, size = "lg" }: { score: number | null; size?: "lg" | "sm" }) {
  if (score === null) return <span className="text-zinc-500 text-sm">—</span>;

  const pct = score; // score is 1-100
  // Color: red→amber→green gradient
  const hue = pct < 50 ? 0 : pct < 75 ? 40 : 120;
  const sat = 85;
  const light = pct < 50 ? 55 : 48;
  const color = `hsl(${hue}, ${sat}%, ${light}%)`;

  const isLg = size === "lg";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`relative ${isLg ? "w-24 h-24" : "w-14 h-14"} rounded-full flex items-center justify-center`}
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, #27272a ${pct * 3.6}deg)`,
        }}
      >
        <div className={`absolute inset-[4px] rounded-full bg-zinc-900 flex items-center justify-center`}>
          <span className={`${isLg ? "text-2xl" : "text-sm"} font-bold text-white`}>{score}</span>
        </div>
      </div>
      {isLg && (
        <div className="text-xs text-zinc-500">
          <div>/ 100</div>
        </div>
      )}
    </div>
  );
}

export default function VideoDetailPage() {
  const { getToken } = useAuth();
  const params = useParams();
  const videoId = params.id as string;

  const [video, setVideo] = useState<VideoData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const fetchVideo = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/videos/${videoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Video not found");
        throw new Error("Failed to load video");
      }
      const data = await res.json();
      setVideo(data.video);
      setAnalysis(data.analysis);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [videoId, getToken]);

  useEffect(() => {
    fetchVideo();

    // Poll while processing
    const interval = setInterval(() => {
      fetchVideo();
    }, 3000);

    return () => clearInterval(interval);
  }, [videoId]);

  const handleStartAnalysis = async () => {
    setStartingAnalysis(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/videos/${videoId}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to start analysis");
      }
      // Optimistically update state — polling will fetch real data
      setVideo((prev) => prev ? { ...prev, status: "processing" } : prev);
      setAnalysis({
        id: "",
        status: "processing",
        overall_score: null,
        confidence_level: null,
        feedback_json: null,
        processing_time_ms: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      });
    } catch (err: any) {
      alert(err.message || "Failed to start analysis");
    } finally {
      setStartingAnalysis(false);
    }
  };

  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    try {
      const token = await getToken();
      // Extract priority areas from the analysis to pre-fill
      const priorityAreas = analysis?.feedback_json?.priority_areas || [];
      const res = await fetch(`${API_URL}/training-plans/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ focus_areas: priorityAreas }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to generate training plan");
      }
      // Redirect to training page
      window.location.href = "/dashboard/training";
    } catch (err: any) {
      alert(err.message || "Failed to generate training plan");
    } finally {
      setGeneratingPlan(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error || !video) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-white text-lg font-semibold">{error || "Video not found"}</p>
        <Link href="/dashboard">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const status = statusConfig[video.status] || statusConfig.failed;
  const fileName = video.s3_key.split("/").pop() || video.s3_key;
  const hasAnalysis = analysis && analysis.status === "completed" && analysis.feedback_json;
  const isProcessing = video.status === "processing" || analysis?.status === "processing";
  const isUploading = video.status === "uploading";
  const isFailed = video.status === "failed";
  const isReadyNoAnalysis = video.status === "ready" && !hasAnalysis;
  const isReadyWithAnalysis = video.status === "ready" && hasAnalysis;

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
          <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
            CourtSense AI
          </span>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* ── Video info card ────────────────────────────────────────── */}
        <Card className="border-zinc-800 bg-zinc-900/60 mb-6">
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <Video className="w-5 h-5 text-zinc-300" />
                </div>
                <div>
                  <CardTitle className="text-lg text-white">{fileName}</CardTitle>
                  <CardDescription>
                    Uploaded {new Date(video.uploaded_at).toLocaleDateString()}
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant={
                  video.status === "ready"
                    ? "success"
                    : video.status === "failed"
                    ? "default"
                    : "secondary"
                }
                className="flex items-center gap-1.5"
              >
                {status.icon}
                {status.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {video.duration_seconds != null && video.duration_seconds > 0 && (
                <div>
                  <span className="text-zinc-500">Duration</span>
                  <p className="text-zinc-200 font-medium">
                    {Math.floor(video.duration_seconds / 60)}:
                    {String(video.duration_seconds % 60).padStart(2, "0")}
                  </p>
                </div>
              )}
              {video.file_size_bytes != null && video.file_size_bytes > 0 && (
                <div>
                  <span className="text-zinc-500">File size</span>
                  <p className="text-zinc-200 font-medium">
                    {(video.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              )}
              <div>
                <span className="text-zinc-500">Status</span>
                <p className={`font-medium ${status.color}`}>{status.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Processing / analyzing state ───────────────────────────── */}
        {isProcessing && (
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-zinc-800 border-t-orange-500 animate-spin" />
                <Sparkles className="w-6 h-6 text-orange-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-white font-semibold">AI is analyzing your video</p>
              <p className="text-zinc-400 text-sm text-center max-w-md">
                Our AI coach is examining your shooting form, footwork, ball handling,
                and more. This usually takes 30–60 seconds.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Uploading state ────────────────────────────────────────── */}
        {isUploading && (
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
              <p className="text-white font-semibold">Waiting for upload to complete</p>
              <p className="text-zinc-400 text-sm text-center">
                If this persists, the upload may not have completed. Try uploading again.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Failed state ───────────────────────────────────────────── */}
        {isFailed && (
          <Card className="border-red-800/50 bg-red-900/10">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-white font-semibold">Analysis failed</p>
              <p className="text-zinc-400 text-sm text-center max-w-md">
                {video.error_message || "Something went wrong during analysis."}
              </p>
              <div className="flex gap-3">
                <Link href="/dashboard/upload">
                  <Button variant="outline" className="gap-2">
                    <Video className="w-4 h-4" />
                    Upload Another Video
                  </Button>
                </Link>
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={handleStartAnalysis}
                  disabled={startingAnalysis}
                >
                  <RefreshCw className={`w-4 h-4 ${startingAnalysis ? "animate-spin" : ""}`} />
                  Retry Analysis
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Ready but no analysis — "Start Analysis" button ────────── */}
        {isReadyNoAnalysis && (
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
              <p className="text-white font-semibold">Video ready for analysis</p>
              <p className="text-zinc-400 text-sm text-center max-w-md">
                Your video has been uploaded and is ready. Start the AI analysis to get
                your personalized coaching feedback.
              </p>
              <Button
                className="gap-2"
                onClick={handleStartAnalysis}
                disabled={startingAnalysis}
              >
                {startingAnalysis ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {startingAnalysis ? "Starting Analysis..." : "Start Analysis"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ANALYSIS RESULTS (the payoff moment!)
           ══════════════════════════════════════════════════════════════ */}
        {isReadyWithAnalysis && analysis && (
          <>
            {/* ── Hero score card ────────────────────────────────────── */}
            <Card className="border-zinc-800 bg-zinc-900/60 mb-6">
              <CardContent className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {/* Score gauge */}
                  <div className="flex-shrink-0">
                    <ScoreGauge score={analysis.overall_score} size="lg" />
                  </div>

                  {/* Summary */}
                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                      <Sparkles className="w-5 h-5 text-orange-400" />
                      <h2 className="text-xl font-bold text-white">Overall Assessment</h2>
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed mb-3">
                      {analysis.feedback_json?.summary || "No summary available."}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                      <ConfidenceBadge level={analysis.confidence_level} />
                      {analysis.processing_time_ms != null && (
                        <span className="text-xs text-zinc-500">
                          Analyzed in {(analysis.processing_time_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Low confidence warning */}
                {analysis.confidence_level === "low" && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-amber-400 text-sm flex items-center gap-2">
                      ⚠️ AI had limited visibility — results may be incomplete
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Skill breakdown: 6 cards in 3×2 grid ───────────────── */}
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-400" />
              Skill Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {analysis.feedback_json?.categories &&
                Object.entries(analysis.feedback_json.categories).map(
                  ([name, cat]: [string, any]) => (
                    <Card
                      key={name}
                      className="border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-white">
                            {CATEGORY_LABELS[name] || name.replace(/_/g, " ")}
                          </p>
                          {cat.score !== null && cat.score !== undefined ? (
                            <span className="text-lg font-bold text-orange-400">
                              {cat.score}
                              <span className="text-xs text-zinc-500 font-normal">/10</span>
                            </span>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Not enough data
                            </Badge>
                          )}
                        </div>

                        {/* Score bar */}
                        {cat.score !== null && cat.score !== undefined && (
                          <div className="w-full h-1.5 bg-zinc-700 rounded-full mb-3 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${(cat.score / 10) * 100}%`,
                                background:
                                  cat.score >= 8
                                    ? "linear-gradient(90deg, #22c55e, #16a34a)"
                                    : cat.score >= 5
                                    ? "linear-gradient(90deg, #f59e0b, #d97706)"
                                    : "linear-gradient(90deg, #ef4444, #dc2626)",
                              }}
                            />
                          </div>
                        )}

                        {/* Observations */}
                        {cat.observations && (
                          <p className="text-xs text-zinc-400 mb-2 leading-relaxed">
                            {cat.observations}
                          </p>
                        )}

                        {/* No data label */}
                        {cat.score === null || cat.score === undefined ? (
                          <p className="text-xs text-zinc-500 italic">
                            {cat.observations || "Not enough data to assess this category."}
                          </p>
                        ) : null}

                        {/* Recommended drills */}
                        {cat.recommended_drills?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-800">
                            {cat.recommended_drills.map((drill: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {drill}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                )}
            </div>

            {/* ── Priority areas — "What to work on" ─────────────────── */}
            {analysis.feedback_json?.priority_areas?.length > 0 && (
              <Card className="border-orange-500/20 bg-orange-500/5 mb-8">
                <CardHeader>
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    🎯 What to Work On
                  </CardTitle>
                  <CardDescription>
                    Focus on these areas in your next training session to see the biggest improvement.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analysis.feedback_json.priority_areas.map((area: string, i: number) => {
                      const catData = analysis.feedback_json?.categories?.[area];
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
                        >
                          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-orange-400">{i + 1}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {CATEGORY_LABELS[area] || area.replace(/_/g, " ")}
                            </p>
                            {catData?.score != null && (
                              <p className="text-xs text-zinc-400">
                                Current score: {catData.score}/10
                                {catData.recommended_drills?.length > 0 && (
                                  <> — Try: {catData.recommended_drills.join(", ")}</>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Generate Training Plan CTA ──────────────────────────── */}
            <Card className="border-orange-500/20 bg-gradient-to-r from-orange-500/5 to-amber-500/5 mb-8">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-6 h-6 text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-lg">
                      Ready to Train?
                    </h3>
                    <p className="text-zinc-400 text-sm mt-0.5">
                      Generate a personalized 7-day workout plan targeting your weak areas —
                      {analysis.feedback_json?.priority_areas?.length
                        ? ` ${analysis.feedback_json.priority_areas
                            .map((a: string) => CATEGORY_LABELS[a] || a)
                            .join(", ")}`
                        : " based on your analysis"}
                    </p>
                  </div>
                  <Button
                    className="gap-2 shrink-0"
                    onClick={handleGeneratePlan}
                    disabled={generatingPlan}
                  >
                    {generatingPlan ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Training Plan
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Raw analysis data (collapsed for debugging) ────────── */}
            <details className="mb-8">
              <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">
                Raw analysis data
              </summary>
              <pre className="mt-2 p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-500 overflow-x-auto">
                {JSON.stringify(analysis.feedback_json, null, 2)}
              </pre>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
