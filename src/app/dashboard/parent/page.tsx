"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Heart, TrendingUp, Flame, Dumbbell, Clock, Video,
  Sparkles, Target, UserPlus, X, Activity, ChevronRight, BarChart3, Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AthleteSummary {
  athlete_id: string;
  display_name: string;
  skill_level: string | null;
  position: string | null;
  latest_score: number | null;
  streak: number;
  recent_activity: string | null;
}

interface WeeklyReport {
  athlete_id: string;
  athlete_name: string;
  week_start: string;
  workouts_assigned: number;
  workouts_completed: number;
  completion_rate: number;
  analyses_completed: number;
  latest_score: number | null;
  previous_score: number | null;
  score_change: number | null;
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ScoreCircle({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center text-zinc-600 text-xs">
        N/A
      </div>
    );
  }
  const color = score >= 70 ? "border-emerald-500 text-emerald-400" : score >= 40 ? "border-amber-500 text-amber-400" : "border-red-500 text-red-400";
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative w-16 h-16">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="none" stroke="rgb(39,39,42)" strokeWidth="4" />
        <circle
          cx="32" cy="32" r="28"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={color.split(" ")[0].replace("border", "stroke").replace("-500", "-400")}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${color.split(" ")[1]}`}>
        {score}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ParentDashboardPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Link athlete modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);

  // Weekly report modal
  const [reportAthlete, setReportAthlete] = useState<AthleteSummary | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // ── Fetch dashboard ──────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/parent/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 403) setError("Parent access required");
        else setError("Failed to load dashboard");
        return;
      }
      const data = await res.json();
      setAthletes(data.linked_athletes || []);
      setError(null);
    } catch {
      setError("Could not connect to the server");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isLoaded) fetchDashboard();
  }, [isLoaded, fetchDashboard]);

  // ── Link athlete ────────────────────────────────────────────────────
  const handleLinkAthlete = async () => {
    if (!linkEmail.trim()) return;
    setLinking(true);
    setLinkMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/parent/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ athlete_email: linkEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinkMessage(data.message);
        setLinkEmail("");
        await fetchDashboard();
        setTimeout(() => {
          setShowLinkModal(false);
          setLinkMessage(null);
        }, 1500);
      } else {
        setLinkMessage(data.detail || "Failed to link athlete");
      }
    } catch {
      setLinkMessage("Could not connect to the server");
    } finally {
      setLinking(false);
    }
  };

  // ── Fetch weekly report ─────────────────────────────────────────────
  const fetchWeeklyReport = async (athlete: AthleteSummary) => {
    setReportAthlete(athlete);
    setLoadingReport(true);
    setReport(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/parent/athletes/${athlete.athlete_id}/reports/weekly`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setReport(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoadingReport(false);
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
            <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-zinc-400 mb-4">{error}</p>
            <Link href="/dashboard">
              <Button variant="secondary">Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName = user?.fullName || user?.firstName || "Parent";

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              CourtSense AI
            </span>
            <Badge variant="default" className="text-xs ml-2">Parent</Badge>
          </div>
          <span className="text-sm text-zinc-400">{displayName}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Welcome */}
        <div className="mb-10">
          <Badge variant="default" className="mb-4 text-sm px-4 py-1.5">
            <Heart className="w-3.5 h-3.5 mr-1.5" />
            Parent View
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            How They're Doing
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl">
            Monitor your athlete's progress, scores, and training activity — all in one place.
          </p>
        </div>

        {/* Linked athletes */}
        {athletes.length === 0 ? (
          <Card className="border-zinc-800 bg-zinc-900/60 mb-8">
            <CardContent className="p-8 text-center">
              <Heart className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-white mb-2">No athletes linked yet</h2>
              <p className="text-zinc-400 text-sm mb-4 max-w-md mx-auto">
                Link your child's CourtSense AI account to see their progress, scores, and activity.
              </p>
              <Button onClick={() => setShowLinkModal(true)} className="gap-1.5">
                <UserPlus className="w-4 h-4" />
                Link an Athlete
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                    <Heart className="w-5 h-5 text-pink-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{athletes.length}</div>
                    <div className="text-xs text-zinc-400">Athletes tracked</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Star className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {athletes.filter(a => a.latest_score !== null).length > 0
                        ? Math.round(athletes.reduce((sum, a) => sum + (a.latest_score || 0), 0) / athletes.filter(a => a.latest_score !== null).length)
                        : "—"}
                    </div>
                    <div className="text-xs text-zinc-400">Avg Score</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Flame className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {Math.max(...athletes.map(a => a.streak), 0)}
                    </div>
                    <div className="text-xs text-zinc-400">Best Streak</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Athlete cards */}
            <div className="space-y-4 mb-8">
              {athletes.map((athlete) => (
                <Card
                  key={athlete.athlete_id}
                  className="border-zinc-800 bg-zinc-900/60 hover:border-orange-500/30 transition-all duration-300"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <ScoreCircle score={athlete.latest_score} />
                        <div>
                          <h3 className="text-white font-semibold text-lg">{athlete.display_name}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {athlete.skill_level && (
                              <Badge variant="secondary" className="text-xs capitalize">{athlete.skill_level}</Badge>
                            )}
                            {athlete.position && (
                              <Badge variant="outline" className="text-xs">{athlete.position}</Badge>
                            )}
                          </div>
                          {athlete.recent_activity && (
                            <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              {athlete.recent_activity}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Streak */}
                        {athlete.streak > 0 && (
                          <div className="text-center">
                            <div className="flex items-center gap-1 text-orange-400">
                              <Flame className="w-4 h-4" />
                              <span className="text-sm font-bold">{athlete.streak}</span>
                            </div>
                            <div className="text-[10px] text-zinc-500">day streak</div>
                          </div>
                        )}

                        {/* Weekly report button */}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => fetchWeeklyReport(athlete)}
                        >
                          <BarChart3 className="w-4 h-4" />
                          Weekly Report
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Link another athlete */}
            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={() => setShowLinkModal(true)} className="gap-1.5 text-zinc-400 hover:text-zinc-100">
                <UserPlus className="w-4 h-4" />
                Link Another Athlete
              </Button>
            </div>
          </>
        )}
      </main>

      {/* ── Link Athlete Modal ────────────────────────────────────────── */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowLinkModal(false); setLinkMessage(null); }} />
          <Card className="relative border-zinc-700 bg-zinc-900 w-full max-w-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Link Athlete</CardTitle>
                <button onClick={() => { setShowLinkModal(false); setLinkMessage(null); }} className="text-zinc-400 hover:text-zinc-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>
                Enter your athlete's email to link their account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Athlete Email</label>
                <input
                  type="email"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="athlete@example.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-pink-500"
                />
              </div>
              {linkMessage && (
                <p className={`text-xs ${linkMessage.includes("Failed") || linkMessage.includes("not found") ? "text-red-400" : "text-emerald-400"}`}>
                  {linkMessage}
                </p>
              )}
              <Button
                className="w-full gap-1.5"
                onClick={handleLinkAthlete}
                disabled={linking || !linkEmail.trim()}
              >
                <UserPlus className="w-4 h-4" />
                {linking ? "Linking..." : "Link Athlete"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Weekly Report Modal ───────────────────────────────────────── */}
      {reportAthlete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setReportAthlete(null); setReport(null); }} />
          <Card className="relative border-zinc-700 bg-zinc-900 w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Weekly Report</CardTitle>
                <button onClick={() => { setReportAthlete(null); setReport(null); }} className="text-zinc-400 hover:text-zinc-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>
                {reportAthlete.display_name}'s progress this week
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingReport ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-zinc-600 border-t-orange-500 rounded-full animate-spin" />
                </div>
              ) : report ? (
                <div className="space-y-4">
                  {/* Score change */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-white">{report.latest_score ?? "—"}</div>
                      <div className="text-xs text-zinc-400">Current Score</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                      {report.score_change !== null ? (
                        <>
                          <div className={`text-lg font-bold ${report.score_change > 0 ? "text-emerald-400" : report.score_change < 0 ? "text-red-400" : "text-zinc-300"}`}>
                            {report.score_change > 0 ? "+" : ""}{report.score_change}
                          </div>
                          <div className="text-xs text-zinc-400">Score Change</div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-bold text-zinc-500">—</div>
                          <div className="text-xs text-zinc-400">No prior data</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Workout completion */}
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400">Workouts</span>
                      <span className="text-xs font-bold text-white">
                        {report.workouts_completed}/{report.workouts_assigned} completed
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${report.completion_rate}%` }}
                      />
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">{report.completion_rate}% completion rate</div>
                  </div>

                  {/* Analyses */}
                  <div className="flex items-center gap-3 bg-zinc-800/30 rounded-lg px-3 py-2">
                    <Video className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-zinc-300">{report.analyses_completed} video analysis{report.analyses_completed !== 1 ? "es" : ""} this week</span>
                  </div>

                  {/* Summary */}
                  <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-3">
                    <p className="text-sm text-zinc-300">{report.summary}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-zinc-500">No data available for this week yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
