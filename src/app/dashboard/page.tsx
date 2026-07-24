"use client";

import { useUser, useClerk, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, MessageCircle, LogOut, Sparkles, TrendingUp, Clock, Video, ArrowRight, Dumbbell, Flame, CheckCircle, Circle, BarChart3, Trophy, Medal, Award, Users } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface OnboardingData {
  role: string;
  displayName: string;
}

interface RecentAnalysis {
  id: string;
  video_id: string;
  overall_score: number | null;
  confidence_level: string | null;
  feedback_json: any;
  created_at: string;
}

interface TrainingSummary {
  hasPlan: boolean;
  streak: number;
  todayCompleted: boolean;
  todayWorkoutTitle: string | null;
  completedThisWeek: number;
  totalThisWeek: number;
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const router = useRouter();
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);
  const [trainingSummary, setTrainingSummary] = useState<TrainingSummary>({
    hasPlan: false,
    streak: 0,
    todayCompleted: false,
    todayWorkoutTitle: null,
    completedThisWeek: 0,
    totalThisWeek: 0,
  });
  const [communitySummary, setCommunitySummary] = useState<{
    rank: number | null;
    totalAthletes: number;
    recentBadges: { name: string; earned_at: string }[];
    activeChallenges: number;
  }>({
    rank: null,
    totalAthletes: 0,
    recentBadges: [],
    activeChallenges: 0,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  useEffect(() => {
    const stored = localStorage.getItem("courtsense_onboarding");
    if (stored) {
      try {
        setOnboarding(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  // Role-based redirect: coaches and parents get their specialized dashboards
  useEffect(() => {
    if (!isLoaded || !onboarding) return;
    if (onboarding.role === "coach") {
      router.replace("/dashboard/coach");
    } else if (onboarding.role === "parent") {
      router.replace("/dashboard/parent");
    }
  }, [isLoaded, onboarding, router]);

  // Fetch recent analyses using the videos list endpoint
  useEffect(() => {
    const fetchAnalyses = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/videos?limit=3`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();

        // For each ready video, fetch its detail to get the analysis
        const analyses: RecentAnalysis[] = [];
        for (const video of data.videos || []) {
          if (video.status === "ready") {
            try {
              const detailRes = await fetch(`${API_URL}/videos/${video.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (detailRes.ok) {
                const detail = await detailRes.json();
                if (detail.analysis && detail.analysis.status === "completed") {
                  analyses.push({
                    id: detail.analysis.id,
                    video_id: video.id,
                    overall_score: detail.analysis.overall_score,
                    confidence_level: detail.analysis.confidence_level,
                    feedback_json: detail.analysis.feedback_json,
                    created_at: detail.analysis.created_at,
                  });
                }
              }
            } catch {
              // skip individual fetch errors
            }
          }
        }
        setRecentAnalyses(analyses);
      } catch {
        // Silently fail — analyses list is non-critical
      } finally {
        setLoadingAnalyses(false);
      }
    };

    if (isLoaded) {
      fetchAnalyses();
    }
  }, [isLoaded, getToken]);

  // Fetch training summary
  useEffect(() => {
    const fetchTraining = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/training-plans?limit=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || res.status === 404) return;
        const data = await res.json();
        if (data.plans && data.plans.length > 0) {
          const plan = data.plans[0];
          const today = new Date().getDay();
          const adjusted = today === 0 ? 6 : today - 1;
          const todayWorkout = plan.workouts?.find((w: any) => w.day_of_week === adjusted);
          const completedCount = plan.workouts?.filter((w: any) => w.completed).length || 0;

          // Calculate streak
          let streakCount = 0;
          for (let i = adjusted; i >= 0; i--) {
            const dw = plan.workouts?.find((w: any) => w.day_of_week === i);
            if (dw?.completed) streakCount++;
            else break;
          }

          setTrainingSummary({
            hasPlan: true,
            streak: streakCount,
            todayCompleted: todayWorkout?.completed || false,
            todayWorkoutTitle: todayWorkout?.title || null,
            completedThisWeek: completedCount,
            totalThisWeek: plan.workouts?.length || 0,
          });
        }
      } catch {
        // Silently fail
      }
    };

    if (isLoaded) {
      fetchTraining();
    }
  }, [isLoaded, getToken]);

  // Fetch community summary
  useEffect(() => {
    const fetchCommunity = async () => {
      try {
        const token = await getToken();
        // Get leaderboard position
        const lbRes = await fetch(`${API_URL}/leaderboard?sort=score&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        let rank: number | null = null;
        let totalAthletes = 0;
        if (lbRes.ok) {
          const lb = await lbRes.json();
          totalAthletes = lb.total || 0;
          // Find current athlete's rank
          const stored = localStorage.getItem("courtsense_onboarding");
          if (stored) {
            const data = JSON.parse(stored);
            const entries = lb.leaderboard || [];
            const idx = entries.findIndex((e: any) => e.athlete_id === data.athleteId);
            if (idx >= 0) rank = idx + 1;
          }
        }

        // Get recent badges
        let recentBadges: { name: string; earned_at: string }[] = [];
        const stored = localStorage.getItem("courtsense_onboarding");
        if (stored) {
          const data = JSON.parse(stored);
          if (data.athleteId) {
            const badgeRes = await fetch(`${API_URL}/athletes/${data.athleteId}/badges`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (badgeRes.ok) {
              const badgeData = await badgeRes.json();
              recentBadges = (badgeData.badges || []).slice(0, 3).map((b: any) => ({
                name: b.name,
                earned_at: b.earned_at,
              }));
            }
          }
        }

        // Get active challenges count
        let activeChallenges = 0;
        const challengeRes = await fetch(`${API_URL}/challenges?status=active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (challengeRes.ok) {
          const cData = await challengeRes.json();
          activeChallenges = cData.total || 0;
        }

        setCommunitySummary({ rank, totalAthletes, recentBadges, activeChallenges });
      } catch {
        // Silently fail — community summary is non-critical
      }
    };

    if (isLoaded) {
      fetchCommunity();
    }
  }, [isLoaded, getToken]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayName = onboarding?.displayName || user?.fullName || user?.firstName || "Athlete";
  const role = onboarding?.role || "athlete";

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              CourtSense AI
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:inline">
              {displayName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ redirectUrl: "/" })}
              className="text-zinc-400 hover:text-zinc-100 gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Welcome */}
        <div className="mb-10">
          <Badge variant="default" className="mb-4 text-sm px-4 py-1.5">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Welcome back
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Hey, {displayName}! 👋
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl">
            Ready to level up your game? Upload a video for AI analysis or chat with your personal coach.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{recentAnalyses.length}</div>
                <div className="text-xs text-zinc-400">Videos analyzed</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{trainingSummary.completedThisWeek}</div>
                <div className="text-xs text-zinc-400">Workouts completed</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">0h</div>
                <div className="text-xs text-zinc-400">Training time</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* View Full Progress link */}
        <div className="mb-10">
          <Link
            href="/dashboard/progress"
            className="inline-flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300 transition-colors group"
          >
            <BarChart3 className="w-4 h-4" />
            View Full Progress
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* ── Community Summary ──────────────────────────────────────── */}
        <Card className="border-zinc-800 bg-zinc-900/60 mb-10">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-orange-400" />
                Community
              </h3>
              <Link
                href="/dashboard/community"
                className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
              >
                View Community
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Leaderboard rank */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
                <Medal className="w-8 h-8 text-amber-400 shrink-0" />
                <div>
                  <div className="text-lg font-bold text-white">
                    {communitySummary.rank ? `#${communitySummary.rank}` : "—"}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {communitySummary.rank
                      ? `of ${communitySummary.totalAthletes} athletes`
                      : "Not ranked yet"}
                  </div>
                </div>
              </div>
              {/* Active challenges */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
                <Trophy className="w-8 h-8 text-orange-400 shrink-0" />
                <div>
                  <div className="text-lg font-bold text-white">
                    {communitySummary.activeChallenges}
                  </div>
                  <div className="text-xs text-zinc-400">Active challenges</div>
                </div>
              </div>
              {/* Recent badges */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
                <Award className="w-8 h-8 text-orange-400 shrink-0" />
                <div>
                  {communitySummary.recentBadges.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {communitySummary.recentBadges.map((b, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium"
                        >
                          {b.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">No badges yet</div>
                  )}
                  <div className="text-xs text-zinc-400 mt-1">Recent badges</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTAs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <Card className="border-zinc-800 bg-zinc-900/60 hover:border-orange-500/30 transition-all duration-300 group cursor-pointer">
            <Link href="/dashboard/upload" className="block">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-3 shadow-lg shadow-orange-500/20">
                  <Upload className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-xl text-white group-hover:text-orange-400 transition-colors">
                  Upload Video
                </CardTitle>
                <CardDescription className="text-zinc-400 text-sm leading-relaxed">
                  Upload your training or game footage and get instant AI-powered
                  analysis of your shooting form, footwork, ball handling, and more.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full gap-2">
                  <Upload className="w-4 h-4" />
                  Upload &amp; Analyze
                </Button>
              </CardContent>
            </Link>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60 hover:border-orange-500/30 transition-all duration-300 group cursor-pointer">
            <Link href="/dashboard/chat" className="block">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center mb-3">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-xl text-white group-hover:text-orange-400 transition-colors">
                  Chat with Coach AI
                </CardTitle>
                <CardDescription className="text-zinc-400 text-sm leading-relaxed">
                  Get instant answers to basketball questions, drills recommendations,
                  and strategic advice from your 24/7 AI coach.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Start Chatting
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* ── Training card ────────────────────────────────────────── */}
        {trainingSummary.hasPlan && (
          <Card className="border-orange-500/20 bg-gradient-to-r from-orange-500/5 to-amber-500/5 mb-10 hover:border-orange-500/30 transition-all duration-300">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-6 h-6 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                      This Week's Training
                      {trainingSummary.streak >= 3 && (
                        <span className="flex items-center gap-1 text-sm text-orange-400">
                          <Flame className="w-4 h-4" />
                          {trainingSummary.streak}-day streak
                        </span>
                      )}
                    </h3>
                    <p className="text-zinc-400 text-sm">
                      {trainingSummary.todayCompleted
                        ? "✅ Today's workout is done — great job!"
                        : trainingSummary.todayWorkoutTitle
                        ? `Today: ${trainingSummary.todayWorkoutTitle}`
                        : "Check out your plan for this week"}
                    </p>
                    {/* Progress bar for the week */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-500"
                          style={{
                            width: `${trainingSummary.totalThisWeek > 0 ? (trainingSummary.completedThisWeek / trainingSummary.totalThisWeek) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500">
                        {trainingSummary.completedThisWeek}/{trainingSummary.totalThisWeek} done
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Mini progress dots */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {Array.from({ length: 7 }, (_, i) => (
                      <div
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full ${
                          i < trainingSummary.completedThisWeek
                            ? "bg-emerald-400"
                            : i === trainingSummary.completedThisWeek && !trainingSummary.todayCompleted
                            ? "bg-orange-400 animate-pulse"
                            : "bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>
                  <Link
                    href="/dashboard/training"
                    className="text-sm font-medium text-orange-400 flex items-center gap-1 hover:text-orange-300 transition-colors"
                  >
                    View Plan
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Recent Analyses ─────────────────────────────────────── */}
        {!loadingAnalyses && recentAnalyses.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-400" />
                Recent Analyses
              </h2>
              <Link
                href="/dashboard/videos"
                className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
              >
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentAnalyses.map((analysis) => (
                <Link key={analysis.id} href={`/dashboard/videos/${analysis.video_id}`}>
                  <Card className="border-zinc-800 bg-zinc-900/60 hover:border-orange-500/30 transition-all duration-300 cursor-pointer h-full">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              analysis.confidence_level === "high"
                                ? "bg-emerald-400"
                                : analysis.confidence_level === "medium"
                                ? "bg-amber-400"
                                : "bg-red-400"
                            }`}
                          />
                          <span className="text-xs text-zinc-400 capitalize">
                            {analysis.confidence_level || "unknown"} confidence
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          {new Date(analysis.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-3xl font-bold text-white">
                            {analysis.overall_score ?? "—"}
                          </div>
                          <div className="text-xs text-zinc-500">Overall Score</div>
                        </div>
                        {analysis.feedback_json?.summary && (
                          <p className="text-xs text-zinc-400 line-clamp-2 max-w-[60%] text-right">
                            {analysis.feedback_json.summary}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loadingAnalyses && recentAnalyses.length === 0 && (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm">
              No analyses yet. Upload your first video to get started!
            </p>
          </div>
        )}

        {loadingAnalyses && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-zinc-600 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}
      </main>
    </div>
  );
}
