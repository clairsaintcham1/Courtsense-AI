"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Users, TrendingUp, Video, Dumbbell, Copy, Check, Plus,
  BarChart3, Clock, Flame, Sparkles, ChevronRight, X, Activity,
  UserPlus, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamItem {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  member_count: number;
  created_at: string;
}

interface RecentActivity {
  type: string;
  athlete_name: string;
  athlete_id: string;
  description: string;
  timestamp: string;
}

interface CoachDashboard {
  team_count: number;
  athlete_count: number;
  total_analyses: number;
  recent_activity: RecentActivity[];
  teams: TeamItem[];
}

interface AthleteRosterItem {
  id: string;
  display_name: string | null;
  user_email: string;
  skill_level: string | null;
  position: string | null;
  last_active: string | null;
  latest_score: number | null;
}

interface TeamAnalytics {
  team_id: string;
  team_name: string;
  athlete_count: number;
  avg_completion_rate: number;
  avg_overall_score: number | null;
  attendance_trend: { week_start: string; completed_count: number; total_count: number }[];
  athlete_breakdown: { athlete_id: string; name: string; completion_rate: number; avg_score: number | null }[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachDashboardPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState<TeamItem | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Roster / Analytics tabs per team
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [roster, setRoster] = useState<AthleteRosterItem[]>([]);
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null);
  const [teamTab, setTeamTab] = useState<"roster" | "analytics">("roster");
  const [loadingTeamData, setLoadingTeamData] = useState(false);

  // Assign workout modal
  const [assignAthlete, setAssignAthlete] = useState<AthleteRosterItem | null>(null);
  const [workoutTitle, setWorkoutTitle] = useState("");
  const [workoutDay, setWorkoutDay] = useState(1); // Default Tuesday
  const [drills, setDrills] = useState<{ name: string; category: string; description: string; duration_minutes: number; sets_reps: string }[]>([]);
  const [newDrillName, setNewDrillName] = useState("");
  const [newDrillCategory, setNewDrillCategory] = useState("shooting");
  const [newDrillDuration, setNewDrillDuration] = useState(15);
  const [assigningWorkout, setAssigningWorkout] = useState(false);

  // ── Fetch dashboard ──────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/coach/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 403) setError("Coach access required");
        else setError("Failed to load dashboard");
        return;
      }
      const data = await res.json();
      setDashboard(data);
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

  // ── Create team ──────────────────────────────────────────────────────
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/coach/teams`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDesc.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed to create team");
      setShowCreateTeam(false);
      setNewTeamName("");
      setNewTeamDesc("");
      await fetchDashboard();
    } catch (e: any) {
      alert(e.message || "Failed to create team");
    } finally {
      setCreatingTeam(false);
    }
  };

  // ── Copy invite code ─────────────────────────────────────────────────
  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ── Regenerate invite code ───────────────────────────────────────────
  const regenerateCode = async (teamId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/coach/teams/${teamId}/invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      // Update local team data
      if (dashboard) {
        const updated = dashboard.teams.map(t =>
          t.id === teamId ? { ...t, invite_code: data.invite_code } : t
        );
        setDashboard({ ...dashboard, teams: updated });
        if (showInvite?.id === teamId) {
          setShowInvite({ ...showInvite, invite_code: data.invite_code });
        }
      }
    } catch {
      alert("Failed to regenerate invite code");
    }
  };

  // ── Expand team → load roster/analytics ─────────────────────────────
  const expandTeam = async (team: TeamItem) => {
    if (expandedTeam === team.id) {
      setExpandedTeam(null);
      return;
    }
    setExpandedTeam(team.id);
    setTeamTab("roster");
    setLoadingTeamData(true);
    try {
      const token = await getToken();
      // Fetch roster
      const rosterRes = await fetch(`${API_URL}/coach/teams/${team.id}/athletes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (rosterRes.ok) {
        const rosterData = await rosterRes.json();
        setRoster(rosterData.athletes || []);
      }
      // Fetch analytics
      const analyticsRes = await fetch(`${API_URL}/coach/teams/${team.id}/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTeamData(false);
    }
  };

  // ── Assign workout ───────────────────────────────────────────────────
  const handleAssignWorkout = async () => {
    if (!assignAthlete || !workoutTitle.trim()) return;
    setAssigningWorkout(true);
    try {
      const token = await getToken();
      // Get next Monday as week_start
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

      const res = await fetch(`${API_URL}/coach/athletes/${assignAthlete.id}/assign-workout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: workoutTitle.trim(),
          day_of_week: workoutDay,
          plan_week_start: monday.toISOString().split("T")[0],
          drills: drills.map(d => ({
            name: d.name,
            category: d.category,
            description: d.description,
            duration_minutes: d.duration_minutes,
            sets_reps: d.sets_reps,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to assign workout");
      // Close modal
      setAssignAthlete(null);
      setWorkoutTitle("");
      setDrills([]);
      setWorkoutDay(1);
    } catch (e: any) {
      alert(e.message || "Failed to assign workout");
    } finally {
      setAssigningWorkout(false);
    }
  };

  const addDrill = () => {
    if (!newDrillName.trim()) return;
    setDrills(prev => [...prev, {
      name: newDrillName.trim(),
      category: newDrillCategory,
      description: "",
      duration_minutes: newDrillDuration,
      sets_reps: "",
    }]);
    setNewDrillName("");
    setNewDrillDuration(15);
  };

  // ── Loading / error states ───────────────────────────────────────────
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

  const displayName = user?.fullName || user?.firstName || "Coach";

  // ── Render ───────────────────────────────────────────────────────────
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
            <Badge variant="default" className="text-xs ml-2">Coach</Badge>
          </div>
          <span className="text-sm text-zinc-400">{displayName}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Welcome */}
        <div className="mb-10">
          <Badge variant="default" className="mb-4 text-sm px-4 py-1.5">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Coach Dashboard
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Welcome, Coach {displayName}!
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl">
            Manage your teams, track athlete progress, and assign personalized workouts.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{dashboard?.team_count ?? 0}</div>
                <div className="text-xs text-zinc-400">Teams</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{dashboard?.athlete_count ?? 0}</div>
                <div className="text-xs text-zinc-400">Athletes</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{dashboard?.total_analyses ?? 0}</div>
                <div className="text-xs text-zinc-400">Total Analyses</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Teams section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-400" />
            Your Teams
          </h2>
          <Button size="sm" onClick={() => setShowCreateTeam(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Create Team
          </Button>
        </div>

        {(!dashboard?.teams || dashboard.teams.length === 0) ? (
          <Card className="border-zinc-800 bg-zinc-900/60 mb-8">
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 mb-4">No teams yet. Create your first team to get started.</p>
              <Button onClick={() => setShowCreateTeam(true)} className="gap-1.5">
                <Plus className="w-4 h-4" />
                Create Team
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 mb-8">
            {dashboard.teams.map((team) => (
              <div key={team.id}>
                <Card
                  className={`border-zinc-800 bg-zinc-900/60 hover:border-violet-500/30 transition-all duration-300 cursor-pointer ${
                    expandedTeam === team.id ? "border-violet-500/50" : ""
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between" onClick={() => expandTeam(team)}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                          <h3 className="text-white font-semibold">{team.name}</h3>
                          <p className="text-xs text-zinc-500">
                            {team.member_count} athlete{team.member_count !== 1 ? "s" : ""}
                            {team.description ? ` · ${team.description}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowInvite(team); }}
                          className="text-xs text-orange-400 hover:text-orange-300 font-medium"
                        >
                          Invite Code
                        </button>
                        <ChevronRight className={`w-4 h-4 text-zinc-500 transition-transform ${expandedTeam === team.id ? "rotate-90" : ""}`} />
                      </div>
                    </div>

                    {/* Expanded content */}
                    {expandedTeam === team.id && (
                      <div className="mt-4 pt-4 border-t border-zinc-800">
                        {/* Tabs */}
                        <div className="flex gap-4 mb-4">
                          <button
                            onClick={() => setTeamTab("roster")}
                            className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                              teamTab === "roster" ? "text-violet-400 border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-300"
                            }`}
                          >
                            Roster
                          </button>
                          <button
                            onClick={() => setTeamTab("analytics")}
                            className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                              teamTab === "analytics" ? "text-violet-400 border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-300"
                            }`}
                          >
                            Analytics
                          </button>
                        </div>

                        {loadingTeamData ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="w-5 h-5 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
                          </div>
                        ) : teamTab === "roster" ? (
                          /* Roster */
                          roster.length === 0 ? (
                            <p className="text-zinc-500 text-sm py-4 text-center">
                              No athletes on this team yet. Share your invite code!
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {roster.map((athlete) => (
                                <Card key={athlete.id} className="border-zinc-700 bg-zinc-800/50">
                                  <CardContent className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <Link
                                        href={`/dashboard/coach/athletes/${athlete.id}`}
                                        className="text-sm font-semibold text-white hover:text-orange-400 transition-colors truncate"
                                      >
                                        {athlete.display_name || athlete.user_email}
                                      </Link>
                                      {athlete.latest_score !== null && (
                                        <span className="text-xs font-bold text-orange-400">{athlete.latest_score}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                                      {athlete.skill_level && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                          {athlete.skill_level}
                                        </Badge>
                                      )}
                                      {athlete.position && (
                                        <span>{athlete.position}</span>
                                      )}
                                    </div>
                                    {athlete.last_active && (
                                      <p className="text-[10px] text-zinc-600 mt-2">
                                        Last active: {new Date(athlete.last_active).toLocaleDateString()}
                                      </p>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full mt-3 text-xs h-7"
                                      onClick={() => setAssignAthlete(athlete)}
                                    >
                                      <Dumbbell className="w-3 h-3" />
                                      Assign Workout
                                    </Button>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )
                        ) : (
                          /* Analytics */
                          analytics ? (
                            <div className="space-y-4">
                              {/* Summary */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                                  <div className="text-xl font-bold text-white">{analytics.athlete_count}</div>
                                  <div className="text-xs text-zinc-400">Athletes</div>
                                </div>
                                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                                  <div className="text-xl font-bold text-emerald-400">{analytics.avg_completion_rate}%</div>
                                  <div className="text-xs text-zinc-400">Completion Rate</div>
                                </div>
                                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                                  <div className="text-xl font-bold text-orange-400">
                                    {analytics.avg_overall_score !== null ? analytics.avg_overall_score : "—"}
                                  </div>
                                  <div className="text-xs text-zinc-400">Avg Score</div>
                                </div>
                              </div>

                              {/* Attendance trend */}
                              {analytics.attendance_trend.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium text-zinc-300 mb-2">Workout Attendance (4 Weeks)</h4>
                                  <div className="flex items-end gap-2 h-24">
                                    {analytics.attendance_trend.map((week, i) => {
                                      const pct = week.total_count > 0 ? (week.completed_count / week.total_count) * 100 : 0;
                                      return (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                          <span className="text-xs text-zinc-400">{week.completed_count}/{week.total_count}</span>
                                          <div className="w-full bg-violet-500/30 rounded-t" style={{ height: `${Math.max(pct, 4)}%` }} />
                                          <span className="text-[10px] text-zinc-600">
                                            {new Date(week.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Per-athlete breakdown */}
                              {analytics.athlete_breakdown.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium text-zinc-300 mb-2">Athlete Breakdown</h4>
                                  <div className="space-y-1">
                                    {analytics.athlete_breakdown.map((a) => (
                                      <div key={a.athlete_id} className="flex items-center justify-between bg-zinc-800/30 rounded px-3 py-2">
                                        <span className="text-sm text-zinc-300">{a.name}</span>
                                        <div className="flex items-center gap-4">
                                          <span className="text-xs text-emerald-400">{a.completion_rate}%</span>
                                          <span className="text-xs text-orange-400">
                                            {a.avg_score !== null ? a.avg_score : "—"}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-zinc-500 text-sm py-4 text-center">No analytics data available yet.</p>
                          )
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}

        {/* Recent Activity */}
        {dashboard?.recent_activity && dashboard.recent_activity.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-orange-400" />
              Recent Activity
            </h2>
            <div className="space-y-2">
              {dashboard.recent_activity.map((act, i) => (
                <div key={i} className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800 rounded-lg px-4 py-3">
                  {act.type === "analysis" ? (
                    <Video className="w-4 h-4 text-blue-400 shrink-0" />
                  ) : act.type === "workout_completed" ? (
                    <Dumbbell className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">
                      <span className="font-medium text-white">{act.athlete_name}</span> — {act.description}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">
                    {new Date(act.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Create Team Modal ────────────────────────────────────────── */}
      {showCreateTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCreateTeam(false)} />
          <Card className="relative border-zinc-700 bg-zinc-900 w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Create Team</CardTitle>
                <button onClick={() => setShowCreateTeam(false)} className="text-zinc-400 hover:text-zinc-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>Set up a new team for your athletes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Team Name</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. U16 Elite Squad"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="e.g. Competitive travel team"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreateTeam}
                disabled={creatingTeam || !newTeamName.trim()}
              >
                {creatingTeam ? "Creating..." : "Create Team"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Invite Code Modal ─────────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowInvite(null)} />
          <Card className="relative border-zinc-700 bg-zinc-900 w-full max-w-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Invite Athletes</CardTitle>
                <button onClick={() => setShowInvite(null)} className="text-zinc-400 hover:text-zinc-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>
                Share this code with your athletes to join <strong>{showInvite.name}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-zinc-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-mono font-bold text-violet-400 tracking-widest">
                  {showInvite.invite_code}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-1.5"
                  onClick={() => copyInviteCode(showInvite.invite_code)}
                >
                  {copiedCode === showInvite.invite_code ? (
                    <>
                      <Check className="w-4 h-4" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy Code
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="default"
                  className="gap-1.5"
                  onClick={() => regenerateCode(showInvite.id)}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Assign Workout Modal ──────────────────────────────────────── */}
      {assignAthlete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAssignAthlete(null)} />
          <Card className="relative border-zinc-700 bg-zinc-900 w-full max-w-md my-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Assign Workout</CardTitle>
                <button onClick={() => setAssignAthlete(null)} className="text-zinc-400 hover:text-zinc-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>
                For <strong>{assignAthlete.display_name || assignAthlete.user_email}</strong>
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

              {/* Drills */}
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Drills</label>
                {drills.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {drills.map((d, i) => (
                      <div key={i} className="flex items-center justify-between bg-zinc-800 rounded px-2 py-1 text-xs">
                        <span className="text-zinc-300">{d.name} <span className="text-zinc-500">({d.category}, {d.duration_minutes}min)</span></span>
                        <button
                          onClick={() => setDrills(prev => prev.filter((_, j) => j !== i))}
                          className="text-zinc-500 hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDrillName}
                    onChange={(e) => setNewDrillName(e.target.value)}
                    placeholder="Drill name"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                  <select
                    value={newDrillCategory}
                    onChange={(e) => setNewDrillCategory(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500"
                  >
                    {["shooting", "dribbling", "footwork", "defense", "passing", "conditioning", "iq"].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={newDrillDuration}
                    onChange={(e) => setNewDrillDuration(Number(e.target.value))}
                    min={1}
                    max={120}
                    className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500"
                    placeholder="min"
                  />
                  <Button size="sm" variant="secondary" className="text-xs h-auto py-1.5" onClick={addDrill}>
                    Add
                  </Button>
                </div>
              </div>

              <Button
                className="w-full gap-1.5"
                onClick={handleAssignWorkout}
                disabled={assigningWorkout || !workoutTitle.trim()}
              >
                <Dumbbell className="w-4 h-4" />
                {assigningWorkout ? "Assigning..." : "Assign Workout"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
