"use client";

import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, ArrowLeft, CheckCircle, AlertCircle, Loader2, Video, X, CloudUpload } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = ["video/mp4", "video/quicktime"];

type UploadState =
  | { phase: "idle" }
  | { phase: "validating"; file: File }
  | { phase: "getting_url" }
  | { phase: "uploading"; progress: number }
  | { phase: "confirming" }
  | { phase: "processing"; videoId: string }
  | { phase: "done"; videoId: string }
  | { phase: "error"; message: string };

export default function UploadPage() {
  const { getToken } = useAuth();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Poll for processing status
  useEffect(() => {
    if (state.phase !== "processing") return;
    const videoId = state.videoId;

    const poll = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/videos/${videoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.video?.status === "ready") {
          setState({ phase: "done", videoId });
        } else if (data.video?.status === "failed") {
          setState({
            phase: "error",
            message: data.video?.error_message || "Analysis failed. Please try again.",
          });
        }
      } catch {
        // keep polling
      }
    };

    poll(); // immediately
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [state.phase === "processing" ? (state as any).videoId : null]);

  const handleFile = useCallback(
    async (file: File) => {
      // Validate
      setState({ phase: "validating", file });

      if (!ALLOWED_TYPES.includes(file.type)) {
        setState({ phase: "error", message: "Only .mp4 and .mov files are supported." });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setState({
          phase: "error",
          message: `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Max is 500MB.`,
        });
        return;
      }
      if (file.size === 0) {
        setState({ phase: "error", message: "File is empty." });
        return;
      }

      try {
        // Step 1: Get presigned URL from backend
        setState({ phase: "getting_url" });
        const token = await getToken();
        const presignedRes = await fetch(`${API_URL}/videos/upload-url`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
          }),
        });

        if (!presignedRes.ok) {
          const err = await presignedRes.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to get upload URL");
        }

        const { upload_url, s3_key, video_id } = await presignedRes.json();

        // Step 2: Upload directly to S3 with progress tracking
        setState({ phase: "uploading", progress: 0 });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              setState({ phase: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
          xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

          xhr.open("PUT", upload_url);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });

        // Step 3: Confirm upload with backend
        setState({ phase: "confirming" });
        const confirmRes = await fetch(`${API_URL}/videos`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            s3_key,
            duration_seconds: null,
            file_size_bytes: file.size,
          }),
        });

        if (!confirmRes.ok) {
          const err = await confirmRes.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to confirm upload");
        }

        // Step 4: Poll for processing
        setState({ phase: "processing", videoId: video_id });
      } catch (err: any) {
        setState({ phase: "error", message: err.message || "Something went wrong" });
      }
    },
    [getToken]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const handleCancel = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setState({ phase: "idle" });
  };

  const renderContent = () => {
    switch (state.phase) {
      // ---- Idle / Drop zone ----
      case "idle":
        return (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-2xl p-12 sm:p-16 text-center cursor-pointer
              transition-all duration-200
              ${dragOver
                ? "border-orange-400 bg-orange-500/5 scale-[1.02]"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/30"
              }
            `}
          >
            <div className="flex flex-col items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${dragOver ? "bg-orange-500/20" : "bg-zinc-800"}`}>
                <CloudUpload className={`w-8 h-8 ${dragOver ? "text-orange-400" : "text-zinc-400"}`} />
              </div>
              <div>
                <p className="text-lg font-semibold text-white mb-1">
                  {dragOver ? "Drop your video here" : "Drag & drop your video"}
                </p>
                <p className="text-sm text-zinc-400">
                  or click to browse — .mp4, .mov up to 500MB
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,video/mp4,video/quicktime"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        );

      // ---- Validating ----
      case "validating":
        return (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
            <p className="text-zinc-300">Checking {state.file.name}…</p>
          </div>
        );

      // ---- Getting presigned URL ----
      case "getting_url":
        return (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
            <p className="text-zinc-300">Preparing upload…</p>
          </div>
        );

      // ---- Uploading to S3 ----
      case "uploading":
        return (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="w-full max-w-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-300 font-medium">Uploading to cloud</span>
                <span className="text-sm text-orange-400 font-semibold">{state.progress}%</span>
              </div>
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-zinc-500">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>
        );

      // ---- Confirming ----
      case "confirming":
        return (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
            <p className="text-zinc-300">Finalizing upload…</p>
          </div>
        );

      // ---- Processing ----
      case "processing":
        return (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-zinc-800 border-t-orange-500 animate-spin" />
              <Video className="w-8 h-8 text-orange-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white mb-1">Analyzing your technique…</p>
              <p className="text-sm text-zinc-400">This usually takes 30–60 seconds</p>
            </div>
          </div>
        );

      // ---- Done ----
      case "done":
        return (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white mb-1">Analysis complete!</p>
              <p className="text-sm text-zinc-400 mb-6">
                AI analysis has been completed. View your results below.
              </p>
              <div className="flex gap-3">
                <Link href={`/dashboard/videos/${state.videoId}`}>
                  <Button className="gap-2">
                    <Video className="w-4 h-4" />
                    View Results
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => setState({ phase: "idle" })}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Another
                </Button>
              </div>
            </div>
          </div>
        );

      // ---- Error ----
      case "error":
        return (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white mb-1">Upload failed</p>
              <p className="text-sm text-zinc-400 mb-6 max-w-md">{state.message}</p>
              <Button
                variant="outline"
                onClick={() => setState({ phase: "idle" })}
                className="gap-2"
              >
                Try Again
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </Link>
          <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
            CourtSense AI
          </span>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Heading */}
        <div className="mb-8">
          <Badge variant="default" className="mb-3 text-sm px-4 py-1.5">
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Video Upload
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Upload Your Training Video
          </h1>
          <p className="text-zinc-400 max-w-lg">
            Upload footage of your drills, scrimmage, or game. Our AI will analyze your
            shooting form, footwork, ball handling, and more — then give you a personalized
            training plan.
          </p>
        </div>

        {/* Main card */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="p-0">
            {renderContent()}
          </CardContent>
        </Card>

        {/* Tips */}
        {state.phase === "idle" && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                title: "Best Angles",
                desc: "Film from the side or ¾ angle so our AI can see your full body mechanics.",
              },
              {
                title: "Keep It Short",
                desc: "30–90 second clips work best. Focus on one drill or skill per video.",
              },
              {
                title: "Good Lighting",
                desc: "Make sure you're well-lit. Indoor courts with even lighting are ideal.",
              },
            ].map((tip) => (
              <div key={tip.title} className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50">
                <p className="text-sm font-semibold text-zinc-200 mb-1">{tip.title}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{tip.desc}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
