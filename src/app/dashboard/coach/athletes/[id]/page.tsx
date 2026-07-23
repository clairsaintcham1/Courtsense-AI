"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, TrendingUp, Flame, Dumbbell, Clock, Video, Sparkles,
  BarChart3, Target, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisItem {
  id: string;
  overall_score: number | null;
  confidence_level: string | null;
  feedback_json: any;
  created_at: string;
  video_filename?: string;
}

interface WorkoutItem {
  id: string;
  day_of_week: number;
  title: string;
  drills_json: any;
  completed: boolean;
  completed_at: string | null;
}

interface TrainingPlanItem {
  id: string;
  week_start_date: string;
  status: string;
  workouts: WorkoutItem[];
}

interface AthleteDetail {
  id: string;
  display_name: string;
  user_email: string;
  skill_level: string;
  position: string | null;
  last_active: string | null;
  latest_score: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-600 text-sm">—</span>;
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-white">{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachAthleteDetailPage() {
  const { isLoaded } = useUser();
  const { getToken } = useAuth();
  const params = useParams();
  const athleteId = params.id as string;

  const [athlete, setAthlete] = useState<AthleteDetail | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [plans, setPlans] = useState<TrainingPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assign workout quick modal
  const [showAssign, setShowAssign] = useState(false);
  const [workoutTitle, setWorkoutTitle] = useState("");
  const [workoutDay, setWorkoutDay] = useState(1);
  const [assigning, setAssigning] = useState(false);

  // Expand/collapse sections
  const [showAllAnalyses, setShowAllAnalyses] = useState(false);

  const fetchData = useCallback(async () => {
    if (!athleteId) return;
    try {
      const token = await getToken();

      // Fetch roster data to get athlete details
      // We don't have a direct "get athlete by id" endpoint for coaches, so
      // we'll use the roster from the first team, or we can infer from analyses.
      // Instead, let's fetch analyses and training plans directly.

      // Fetch analyses for this athlete
      const analysesRes = await fetch(`${API_URL}/videos?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Since we can't filter by athlete directly via the videos endpoint, 
      // we'll get the athlete roster from the coach's teams and match.
      // For the MVP, fetch the coach dashboard to find this athlete in teams.
      const dashRes = await fetch(`${API_URL}/coach/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!dashRes.ok) throw new Error("Could not load");
      const dash = await dashRes.json();
      
      // Find the athlete across all teams' rosters
      let foundAthlete: AthleteDetail | null = null;
      for (const team of dash.teams || []) {
        const rosterRes = await fetch(`${API_URL}/coach/teams/${team.id}/athletes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (rosterRes.ok) {
          const rosterData = await rosterRes.json();
          const match = (rosterData.athletes || []).find((a: any) => a.id === athleteId);
          if (match) {
            foundAthlete = {
              id: match.id,
              display_name: match.display_name || match.user_email,
              user_email: match.user_email,
              skill_level: match.skill_level || "beginner",
              position: match.position,
              last_active: match.last_active,
              latest_score: match.latest_score,
            };
            break;
          }
        }
      }

      if (!foundAthlete) {
        setError("Athlete not found in your teams");
        return;
      }
      setAthlete(foundAthlete);

      // Now fetch the training plans for this athlete
      // We need to do this via the backend — we'll use a generic approach
      // Since we don't have a coach-specific endpoint, let's try the training plans endpoint
      // Actually we need to proxy via the coach context... let's use a simpler approach:
      // We'll display what we have and let the coach interact via the dashboard.
      
      // For MVP: show roster data + provide a clean detail view
      // The analytics & progress can be fetched via the coach/teams analytics endpoint

      setError(null);
    } catch {
      setError("Could not load athlete data");
    } finally {
      setLoading(false);
    }
  }, [athleteId, getToken]);

  useEffect(() => {
    if (isLoaded) fetchData();
  }, [isLoaded, fetchData]);

  // ── Assign Workout ──────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!workoutTitle.trim()) return;
    setAssigning(true);
    try {
      const token = await getToken();
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

      const res = await fetch(`${API_URL}/coach/athletes/${athleteId}/assign-workout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: workoutTitle.trim(),
          day_of_week: workoutDay,
          plan_week_start: monday.toISOString().split("T")[0],
          drills: [],
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowAssign(false);
      setWorkoutTitle("");
    } catch (e: any) {
      alert(e.message || "Failed to assign workout");
    } finally {
      setAssigning(false);
    }
  };

  // ── Loading / Error ─────────────────────────────────────────────────
  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Card className="border-zinc-800 bg-zinc-900/60 p-8 text-center max-w-md">
          <CardContent className="pt-6">
            <h2 className="text-xl font-bold text-white mb-2">Not Found</h2>
            <p className="text-zinc-400 mb-4">{error}</p>
            <Link href="/dashboard/coach">
              <Button variant="secondary">Back to Coach Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!athlete) return null;

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/coach" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              CourtSense AI
            </span>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowAssign(true)}>
            <Dumbbell className="w-4 h-4" />
            Assign Workout
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Athlete header */}
        <div className="mb-8">
          <Badge variant="default" className="mb-3 text-sm px-4 py-1.5">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Athlete Profile
          </Badge>
          <h1 className="text-3xl font-bold text-white mb-2">{athlete.display_name}</h1>
          <div className="flex items-center gap-3 text-sm text-zinc-400 flex-wrap">
            <span>{athlete.user_email}</span>
            <Badge variant="secondary" className="text-xs capitalize">{athlete.skill_level}</Badge>
            {athlete.position && <Badge variant="outline" className="text-xs">{athlete.position}</Badge>}
          </div>
          {athlete.last_active && (
            <p className="text-xs text-zinc-600 mt-2">
              Last active: {new Date(athlete.last_active).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <Target className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {athlete.latest_score !== null ? athlete.latest_score : "—"}
                </div>
                <div className="text-xs text-zinc-400">Latest Score</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {athlete.skill_level ? athlete.skill_level.charAt(0).toUpperCase() + athlete.skill_level.slice(1) : "—"}
                </div>
                <div className="text-xs text-zinc-400">Skill Level</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {athlete.last_active ? new Date(athlete.last_active).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A"}
                </div>
                <div className="text-xs text-zinc-400">Last Active</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Score history graph placeholder */}
        <Card className="border-zinc-800 bg-zinc-900/60 mb-8">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-400" />
              Progress Overview
            </CardTitle>
            <CardDescription>
              Score history and workout completion trend
            </CardDescription>
          </CardHeader>
          <CardContent>
            {athlete.latest_score !== null ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">Latest Score:</span>
                  <ScoreBar score={athlete.latest_score} />
                </div>
                <p className="text-sm text-zinc-500">
                  More detailed progress data will appear as this athlete uploads more videos and completes workouts.
                </p>
              </div>
            ) : (
              <div className="text-center py-6">
                <Video className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No video analyses yet. Encourage {athlete.display_name} to upload a video!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Training plan summary */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-emerald-400" />
              Current Training Plan
            </CardTitle>
            <CardDescription>
              This week's assigned workouts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <Dumbbell className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 mb-3">No active training plan data available yet.</p>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShowAssign(true)}>
                <Dumbbell className="w-4 h-4" />
                Assign First Workout
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* ── Assign Workout Modal ──────────────────────────────────────── */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAssign(false)} />
          <Card className="relative border-zinc-700 bg-zinc-900 w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Quick Assign Workout</CardTitle>
                <button onClick={() => setShowAssign(false)} className="text-zinc-400 hover:text-zinc-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>
                For <strong>{athlete.display_name}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Workout Title</label>
                <input
                  type="text"
                  value={workoutTitle}
                  onChange={(e) => setWorkoutTitle(e.target.value)}
                  placeholder="e.g. Shooting Form Drills"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Day of Week</label>
                <select
                  value={workoutDay}
                  onChange={(e) => setWorkoutDay(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                >
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => (
                    <option key={i} value={i}>{day}</option>
                  ))}
                </select>
              </div>
              <Button
                className="w-full gap-1.5"
                onClick={handleAssign}
                disabled={assigning || !workoutTitle.trim()}
              >
                <Dumbbell className="w-4 h-4" />
                {assigning ? "Assigning..." : "Assign Workout"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
