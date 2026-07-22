"use client";

import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle,
  Circle,
  Flame,
  Dumbbell,
  Clock,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
  Calendar,
  Trophy,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface Drill {
  drill_name: string;
  sets?: number;
  reps?: number;
  duration_min?: number;
  coaching_tip?: string;
}

interface WorkoutData {
  id: string;
  day_of_week: number;
  title: string;
  drills_json: {
    focus?: string;
    intensity?: string;
    warmup?: { drill_name: string; duration_min?: number };
    main_drills?: Drill[];
    cooldown?: string;
  } | null;
  completed: boolean;
  completed_at: string | null;
  athlete_notes: string | null;
}

interface TrainingPlan {
  id: string;
  athlete_id: string;
  week_start_date: string;
  status: string;
  generated_by: string;
  plan_json: {
    week_focus?: string;
    coach_note?: string;
    days?: any[];
    total_weekly_minutes?: number;
  } | null;
  created_at: string;
  workouts: WorkoutData[];
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const INTENSITY_COLORS: Record<string, string> = {
  low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function TrainingPage() {
  const { getToken } = useAuth();

  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  // Set today as default expanded day
  useEffect(() => {
    const today = new Date().getDay(); // 0=Sun, 1=Mon, ...
    const adjusted = today === 0 ? 6 : today - 1; // Convert to 0=Mon
    setExpandedDay(adjusted);
  }, []);

  const fetchPlan = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/training-plans?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) { setPlan(null); return; }
        throw new Error("Failed to load training plan");
      }
      const data = await res.json();
      if (data.plans && data.plans.length > 0) {
        setPlan(data.plans[0]);

        // Calculate streak from completed workouts
        const completedWorkouts = data.plans[0].workouts.filter((w: WorkoutData) => w.completed);
        const today = new Date().getDay();
        const adjusted = today === 0 ? 6 : today - 1;
        let streakCount = 0;
        for (let i = adjusted; i >= 0; i--) {
          const dayWorkout = data.plans[0].workouts.find((w: WorkoutData) => w.day_of_week === i);
          if (dayWorkout?.completed) {
            streakCount++;
          } else {
            break;
          }
        }
        setStreak(streakCount);
      } else {
        setPlan(null);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/training-plans/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to generate plan");
      }
      const data = await res.json();
      setPlan(data);
      setExpandedDay(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  const handleComplete = async (workoutId: string, currentlyCompleted: boolean) => {
    setCompletingId(workoutId);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/workouts/${workoutId}/complete`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to update workout");

      const data = await res.json();

      // Update local state
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workouts: prev.workouts.map((w) =>
            w.id === workoutId
              ? { ...w, completed: data.completed, completed_at: data.completed_at }
              : w
          ),
        };
      });
      setStreak(data.streak);

      // Confetti if completing
      if (data.completed) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.7 },
          colors: ["#f97316", "#fbbf24", "#22c55e", "#3b82f6", "#a855f7"],
        });
        setTimeout(() => {
          confetti({
            particleCount: 40,
            spread: 40,
            origin: { y: 0.8, x: 0.3 },
            colors: ["#f97316", "#fbbf24"],
          });
          confetti({
            particleCount: 40,
            spread: 40,
            origin: { y: 0.8, x: 0.7 },
            colors: ["#22c55e", "#3b82f6"],
          });
        }, 200);
      }
    } catch (err: any) {
      alert(err.message || "Failed to update workout");
    } finally {
      setCompletingId(null);
    }
  };

  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  // ── No plan — CTA ────────────────────────────────────────────────────
  if (!plan) {
    return (
      <div className="min-h-screen bg-black">
        <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Dashboard</span>
            </Link>
            <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              CourtSense AI
            </span>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-16 sm:py-24 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6">
            <Dumbbell className="w-10 h-10 text-orange-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Your Personalized Training Plan
          </h1>
          <p className="text-zinc-400 text-lg max-w-md mb-8">
            Get a custom 7-day workout plan built from your video analysis. Our AI identifies
            your weak areas and picks the best drills just for you.
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm max-w-md">
              {error}
            </div>
          )}

          <Button
            size="lg"
            className="gap-2 text-base px-8 py-6"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Your Plan...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Training Plan
              </>
            )}
          </Button>

          <p className="text-zinc-600 text-sm mt-4">
            Make sure you've completed at least one video analysis first
          </p>
        </main>
      </div>
    );
  }

  // ── Plan exists — training view ──────────────────────────────────────

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
          <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
            CourtSense AI
          </span>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        {/* ── Week header with streak ────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <Dumbbell className="w-7 h-7 text-orange-400" />
              This Week's Training
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Week of {new Date(plan.week_start_date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
              {plan.plan_json?.week_focus && (
                <span className="text-zinc-500"> — {plan.plan_json.week_focus}</span>
              )}
            </p>
          </div>

          {/* Streak counter */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
                streak >= 3
                  ? "border-orange-500/30 bg-orange-500/10"
                  : "border-zinc-700 bg-zinc-800/50"
              }`}
            >
              <Flame
                className={`w-5 h-5 ${streak >= 3 ? "text-orange-400" : "text-zinc-500"}`}
              />
              <span className={`font-bold ${streak >= 3 ? "text-orange-400" : "text-zinc-400"}`}>
                {streak}-day streak
              </span>
            </div>
            {streak >= 5 && <Trophy className="w-5 h-5 text-yellow-400" />}
          </div>
        </div>

        {/* ── Coach note ─────────────────────────────────────────────── */}
        {plan.plan_json?.coach_note && (
          <Card className="border-orange-500/20 bg-orange-500/5 mb-6">
            <CardContent className="p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-orange-300/80 text-sm leading-relaxed">
                {plan.plan_json.coach_note}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Horizontal day cards ───────────────────────────────────── */}
        <div className="flex gap-3 overflow-x-auto pb-2 mb-6 -mx-1 px-1 scrollbar-hide">
          {DAY_SHORT.map((dayShort, i) => {
            const workout = plan.workouts.find((w) => w.day_of_week === i);
            const isToday = i === todayIndex;
            const isExpanded = i === expandedDay;
            const isCompleted = workout?.completed;

            return (
              <button
                key={i}
                onClick={() => setExpandedDay(isExpanded ? null : i)}
                className={`flex-shrink-0 w-[72px] sm:w-[90px] p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                  isToday
                    ? "border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10"
                    : isExpanded
                    ? "border-zinc-500 bg-zinc-800/60"
                    : isCompleted
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-xs font-semibold uppercase ${
                      isToday ? "text-orange-400" : "text-zinc-500"
                    }`}
                  >
                    {dayShort}
                  </span>
                  {isCompleted ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : isToday ? (
                    <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                  ) : (
                    <Circle className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
                <div className="text-lg font-bold text-white">
                  {i + 1}
                </div>
                {workout && (
                  <div className="mt-1">
                    {workout.drills_json?.intensity && (
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${
                          INTENSITY_COLORS[workout.drills_json.intensity] ||
                          "border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {workout.drills_json.intensity}
                      </Badge>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Expanded day detail ────────────────────────────────────── */}
        {expandedDay !== null && (() => {
          const workout = plan.workouts.find((w) => w.day_of_week === expandedDay);
          if (!workout) {
            return (
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardContent className="p-8 text-center">
                  <Calendar className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium">Rest Day</p>
                  <p className="text-zinc-500 text-sm mt-1">
                    No workout scheduled. Take it easy and recover!
                  </p>
                </CardContent>
              </Card>
            );
          }

          const drills = workout.drills_json;
          const totalMin =
            (drills?.warmup?.duration_min || 0) +
            (drills?.main_drills?.reduce((acc, d) => acc + (d.duration_min || 0), 0) || 0);

          return (
            <Card
              className={`border-zinc-800 bg-zinc-900/60 transition-all ${
                workout.completed ? "border-emerald-500/20" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl text-white">
                        {DAY_NAMES[expandedDay]}
                      </CardTitle>
                      {drills?.intensity && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            INTENSITY_COLORS[drills.intensity] ||
                            "border-zinc-700 text-zinc-400"
                          }`}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          {drills.intensity} intensity
                        </Badge>
                      )}
                      {workout.completed && (
                        <Badge variant="success" className="text-xs gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Done
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1">
                        <Target className="w-3.5 h-3.5" />
                        Focus: {drills?.focus || "General"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        ~{totalMin || workout.title.match(/(\d+)min/)?.[1] || "?"} min
                      </span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Warmup */}
                {drills?.warmup && (
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-emerald-400">W</span>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400">Warmup</span>
                      <span className="text-xs text-zinc-500 ml-auto">
                        {drills.warmup.duration_min || 5} min
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 ml-8">{drills.warmup.drill_name}</p>
                  </div>
                )}

                {/* Main drills */}
                {drills?.main_drills?.map((drill: Drill, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-400">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white truncate">
                            {drill.drill_name}
                          </p>
                          <span className="text-xs text-zinc-500 shrink-0">
                            {drill.duration_min || "?"} min
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          {drill.sets && drill.reps && (
                            <span className="text-xs text-zinc-400">
                              {drill.sets} sets × {drill.reps} reps
                            </span>
                          )}
                          {drill.sets && !drill.reps && (
                            <span className="text-xs text-zinc-400">{drill.sets} sets</span>
                          )}
                        </div>
                        {drill.coaching_tip && (
                          <p className="text-xs text-zinc-500 mt-1.5 italic leading-relaxed">
                            💡 {drill.coaching_tip}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Cooldown */}
                {drills?.cooldown && (
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-400">C</span>
                      </div>
                      <span className="text-sm font-semibold text-blue-400">Cooldown</span>
                    </div>
                    <p className="text-sm text-zinc-300 ml-8">{drills.cooldown}</p>
                  </div>
                )}

                {/* Mark complete button */}
                <div className="pt-2">
                  <Button
                    variant={workout.completed ? "outline" : "default"}
                    className={`w-full gap-2 ${
                      workout.completed
                        ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        : ""
                    }`}
                    onClick={() => handleComplete(workout.id, workout.completed)}
                    disabled={completingId === workout.id}
                  >
                    {completingId === workout.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : workout.completed ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {workout.completed ? "Completed! Tap to undo" : "Mark Complete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* ── Weekly progress bar ─────────────────────────────────────── */}
        <Card className="border-zinc-800 bg-zinc-900/60 mt-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Weekly Progress</span>
              <span className="text-sm font-semibold text-white">
                {plan.workouts.filter((w) => w.completed).length}/{plan.workouts.length} days
              </span>
            </div>
            <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-emerald-400 transition-all duration-500"
                style={{
                  width: `${
                    plan.workouts.length > 0
                      ? (plan.workouts.filter((w) => w.completed).length / plan.workouts.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
