"use client";

import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Video, Loader2, CheckCircle, AlertCircle, Clock, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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

export default function VideoDetailPage() {
  const { getToken } = useAuth();
  const params = useParams();
  const videoId = params.id as string;

  const [video, setVideo] = useState<VideoData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideo = async () => {
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
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideo();

    // Poll if processing
    const interval = setInterval(() => {
      if (video?.status === "processing" || video?.status === "uploading") {
        fetchVideo();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [videoId, video?.status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Video info card */}
        <Card className="border-zinc-800 bg-zinc-900/60 mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
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
              {video.duration_seconds && (
                <div>
                  <span className="text-zinc-500">Duration</span>
                  <p className="text-zinc-200 font-medium">
                    {Math.floor(video.duration_seconds / 60)}:
                    {String(video.duration_seconds % 60).padStart(2, "0")}
                  </p>
                </div>
              )}
              {video.file_size_bytes && (
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

        {/* Processing state */}
        {video.status === "processing" && (
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

        {/* Uploading state */}
        {video.status === "uploading" && (
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

        {/* Ready state — placeholder for future analysis display */}
        {video.status === "ready" && analysis && (
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-400" />
                AI Analysis Results
              </CardTitle>
              <CardDescription>
                {analysis.overall_score != null
                  ? `Overall score: ${analysis.overall_score}/100`
                  : "Score pending"}
                {" · "}
                Confidence:{" "}
                {analysis.confidence_level === "high"
                  ? "🟢 High"
                  : analysis.confidence_level === "medium"
                  ? "🟡 Medium"
                  : "🔴 Low"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.feedback_json?.summary && (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50 mb-6">
                  <p className="text-zinc-300 text-sm leading-relaxed">
                    {analysis.feedback_json.summary}
                  </p>
                </div>
              )}

              {analysis.feedback_json?.categories && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(analysis.feedback_json.categories).map(
                    ([name, cat]: [string, any]) => (
                      <div
                        key={name}
                        className="p-4 rounded-lg bg-zinc-800/30 border border-zinc-700/30"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-white capitalize">
                            {name.replace(/_/g, " ")}
                          </p>
                          {cat.score != null && (
                            <span className="text-sm font-bold text-orange-400">
                              {cat.score}/10
                            </span>
                          )}
                        </div>
                        {cat.score != null && (
                          <div className="w-full h-1.5 bg-zinc-700 rounded-full mb-2 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                              style={{ width: `${(cat.score / 10) * 100}%` }}
                            />
                          </div>
                        )}
                        {cat.observations && (
                          <p className="text-xs text-zinc-400 mb-2">{cat.observations}</p>
                        )}
                        {cat.recommended_drills?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {cat.recommended_drills.map((drill: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {drill}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              {analysis.feedback_json?.priority_areas?.length > 0 && (
                <div className="mt-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <p className="text-sm font-semibold text-orange-400 mb-2">
                    🎯 Priority Areas to Work On
                  </p>
                  <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1">
                    {analysis.feedback_json.priority_areas.map((area: string, i: number) => (
                      <li key={i} className="capitalize">
                        {area.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ready but no analysis yet */}
        {video.status === "ready" && !analysis && (
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
              <p className="text-white font-semibold">Video processed</p>
              <p className="text-zinc-400 text-sm text-center">
                Analysis will appear here once complete. Check back shortly.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Failed state */}
        {video.status === "failed" && (
          <Card className="border-red-800/50 bg-red-900/10">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-white font-semibold">Analysis failed</p>
              <p className="text-zinc-400 text-sm text-center max-w-md">
                {video.error_message || "Something went wrong during analysis."}
              </p>
              <Link href="/dashboard/upload">
                <Button variant="outline" className="gap-2">
                  <Video className="w-4 h-4" />
                  Upload Another Video
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
