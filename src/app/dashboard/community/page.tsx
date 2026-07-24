"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Medal,
  Flame,
  Target,
  Swords,
  Star,
  Users,
  Lock,
  Award,
  TrendingUp,
  ArrowLeft,
  CheckCircle2,
  Zap,
  Crown,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  athlete_id: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  streak: number;
  analyses_count: number;
}

interface ChallengeData {
  id: string;
  name: string;
  description: string | null;
  skill_category: string | null;
  start_date: string;
  end_date: string;
  rules_json: any;
  participant_count: number;
  created_at: string;
  joined?: boolean;
}

interface AthleteBadgeData {
  id: string;
  badge_id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  earned_at: string;
}

interface AllBadgeDef {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  criteria_json: any;
}

type Tab = "leaderboard" | "challenges" | "badges";

// ── Badge icon helper ──────────────────────────────────────────────────

const BADGE_ICONS: Record<string, React.ReactNode> = {
  analysis: <Trophy className="w-5 h-5 text-orange-400" />,
  workout: <Flame className="w-5 h-5 text-emerald-400" />,
  streak: <Zap className="w-5 h-5 text-amber-400" />,
  shooting: <Target className="w-5 h-5 text-red-400" />,
  team: <Users className="w-5 h-5 text-blue-400" />,
};

function badgeIcon(name: string): React.ReactNode {
  const lower = name.toLowerCase();
  if (lower.includes("film") || lower.includes("analysis")) return BADGE_ICONS["analysis"];
  if (lower.includes("workout") || lower.includes("warrior")) return BADGE_ICONS["workout"];
  if (lower.includes("streak") || lower.includes("king")) return BADGE_ICONS["streak"];
  if (lower.includes("shoot")) return BADGE_ICONS["shooting"];
  if (lower.includes("team")) return BADGE_ICONS["team"];
  return <Award className="w-5 h-5 text-zinc-400" />;
}

function badgeTierColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("gold")) return "from-amber-400 to-yellow-500";
  if (lower.includes("silver")) return "from-zinc-300 to-zinc-400";
  if (lower.includes("bronze")) return "from-amber-600 to-amber-700";
  return "from-orange-500 to-orange-600";
}

// ── Component ──────────────────────────────────────────────────────────

export default function CommunityPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("leaderboard");
  const [athleteId, setAthleteId] = useState<string | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLB, setLoadingLB] = useState(true);
  const [sortBy, setSortBy] = useState<"score" | "streak">("score");

  // Challenges
  const [challenges, setChallenges] = useState<ChallengeData[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [challengeFilter, setChallengeFilter] = useState<string>("active");

  // Badges
  const [earnedBadges, setEarnedBadges] = useState<AthleteBadgeData[]>([]);
  const [allBadges, setAllBadges] = useState<AllBadgeDef[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  // ── Resolve athlete ID from onboarding ───────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("courtsense_onboarding");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.athleteId) setAthleteId(data.athleteId);
      } catch { /* ignore */ }
    }
  }, []);

  // ── Fetch leaderboard ────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async () => {
    setLoadingLB(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/leaderboard?sort=${sortBy}&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
      }
    } catch { /* silent */ }
    finally { setLoadingLB(false); }
  }, [getToken, sortBy]);

  useEffect(() => {
    if (isLoaded) fetchLeaderboard();
  }, [isLoaded, fetchLeaderboard]);

  // ── Fetch challenges ─────────────────────────────────────────────────
  const fetchChallenges = useCallback(async () => {
    setLoadingChallenges(true);
    try {
      const token = await getToken();
      const url = challengeFilter
        ? `${API_URL}/challenges?status=${challengeFilter}`
        : `${API_URL}/challenges`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChallenges(data.challenges || []);
      }
    } catch { /* silent */ }
    finally { setLoadingChallenges(false); }
  }, [getToken, challengeFilter]);

  useEffect(() => {
    if (isLoaded) fetchChallenges();
  }, [isLoaded, fetchChallenges]);

  // ── Fetch badges ─────────────────────────────────────────────────────
  const fetchBadges = useCallback(async () => {
    setLoadingBadges(true);
    try {
      const token = await getToken();

      // Fetch all badge definitions
      const allRes = await fetch(`${API_URL}/badges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (allRes.ok) {
        const allData = await allRes.json();
        setAllBadges(allData.badges || []);
      }

      // Fetch earned badges if we have an athlete ID
      if (athleteId) {
        const earnedRes = await fetch(`${API_URL}/athletes/${athleteId}/badges`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (earnedRes.ok) {
          const earnedData = await earnedRes.json();
          setEarnedBadges(earnedData.badges || []);
        }
      }
    } catch { /* silent */ }
    finally { setLoadingBadges(false); }
  }, [getToken, athleteId]);

  useEffect(() => {
    if (isLoaded && athleteId) fetchBadges();
  }, [isLoaded, athleteId, fetchBadges]);

  // ── Join challenge ───────────────────────────────────────────────────
  const handleJoinChallenge = async (challengeId: string) => {
    setJoiningId(challengeId);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/challenges/${challengeId}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        // Refresh challenges
        await fetchChallenges();
      }
    } catch { /* silent */ }
    finally { setJoiningId(null); }
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  const getStatusBadge = (start: string, end: string) => {
    const now = new Date();
    const s = new Date(start);
    const e = new Date(end);
    if (now < s) return <Badge variant="secondary">Upcoming</Badge>;
    if (now > e) return <Badge variant="outline">Ended</Badge>;
    return <Badge variant="success">Active</Badge>;
  };

  const earnedBadgeIds = new Set(earnedBadges.map(b => b.badge_id));

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              CourtSense AI
            </span>
          </div>
          <span className="text-sm text-zinc-500">Community</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Trophy className="w-8 h-8 text-orange-400" />
            Community
          </h1>
          <p className="text-zinc-400 mt-2">
            Compete in challenges, climb the leaderboard, and earn badges.
          </p>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-8 border-b border-zinc-800 pb-2">
          {(["leaderboard", "challenges", "badges"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? "text-orange-400 border-b-2 border-orange-400 bg-orange-500/5"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab === "leaderboard" && <Medal className="w-4 h-4 inline mr-1.5" />}
              {tab === "challenges" && <Swords className="w-4 h-4 inline mr-1.5" />}
              {tab === "badges" && <Award className="w-4 h-4 inline mr-1.5" />}
              {tab}
            </button>
          ))}
        </div>

        {/* ── Leaderboard Tab ───────────────────────────────────────── */}
        {activeTab === "leaderboard" && (
          <div>
            {/* Sort toggle */}
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm text-zinc-400">Sort by:</span>
              <button
                onClick={() => setSortBy("score")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  sortBy === "score"
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                Score
              </button>
              <button
                onClick={() => setSortBy("streak")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  sortBy === "streak"
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Flame className="w-3.5 h-3.5 inline mr-1" />
                Streak
              </button>
            </div>

            {loadingLB ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : leaderboard.length === 0 ? (
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardContent className="p-10 text-center">
                  <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400">No athletes on the leaderboard yet.</p>
                  <p className="text-zinc-500 text-sm mt-1">
                    Complete analyses to appear here!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Podium — top 3 */}
                <div className="grid grid-cols-3 gap-4 mb-8 items-end">
                  {/* 2nd place */}
                  {leaderboard[1] && (
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-b from-zinc-300 to-zinc-400 flex items-center justify-center mb-2 ring-2 ring-zinc-500/30">
                        <span className="text-xl font-bold text-zinc-800">
                          {leaderboard[1].display_name?.[0] || "?"}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-zinc-300 mb-1">2</div>
                      <div className="text-sm font-medium text-white truncate">
                        {leaderboard[1].display_name || "Unknown"}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {sortBy === "score"
                          ? `${leaderboard[1].score.toFixed(1)} pts`
                          : `${leaderboard[1].streak}-day streak`}
                      </div>
                      <div className="mt-2 mx-auto w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-400 rounded-full" style={{ width: "80%" }} />
                      </div>
                    </div>
                  )}

                  {/* 1st place */}
                  {leaderboard[0] && (
                    <div className="text-center -mt-4">
                      <Crown className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                      <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-b from-amber-400 to-orange-500 flex items-center justify-center mb-2 ring-4 ring-amber-500/30 shadow-lg shadow-amber-500/20">
                        <span className="text-2xl font-bold text-white">
                          {leaderboard[0].display_name?.[0] || "?"}
                        </span>
                      </div>
                      <div className="text-3xl font-bold text-amber-400 mb-1">1</div>
                      <div className="text-sm font-medium text-white truncate">
                        {leaderboard[0].display_name || "Unknown"}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {sortBy === "score"
                          ? `${leaderboard[0].score.toFixed(1)} pts`
                          : `${leaderboard[0].streak}-day streak`}
                      </div>
                      <div className="mt-2 mx-auto w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: "100%" }} />
                      </div>
                    </div>
                  )}

                  {/* 3rd place */}
                  {leaderboard[2] && (
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-b from-amber-600 to-amber-700 flex items-center justify-center mb-2 ring-2 ring-amber-700/30">
                        <span className="text-xl font-bold text-white">
                          {leaderboard[2].display_name?.[0] || "?"}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-amber-600 mb-1">3</div>
                      <div className="text-sm font-medium text-white truncate">
                        {leaderboard[2].display_name || "Unknown"}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {sortBy === "score"
                          ? `${leaderboard[2].score.toFixed(1)} pts`
                          : `${leaderboard[2].streak}-day streak`}
                      </div>
                      <div className="mt-2 mx-auto w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-700 rounded-full" style={{ width: "60%" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Ranking list (4+) */}
                <div className="space-y-2">
                  {leaderboard.slice(3).map((entry) => (
                    <Card
                      key={entry.athlete_id}
                      className="border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-colors"
                    >
                      <CardContent className="p-4 flex items-center gap-4">
                        <span className="text-sm font-bold text-zinc-500 w-6 text-center">
                          {entry.rank}
                        </span>
                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                          <span className="text-sm font-medium text-zinc-300">
                            {entry.display_name?.[0] || "?"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {entry.display_name || "Unknown"}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {entry.analyses_count} analyses
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <div className="text-sm font-bold text-white">
                              {entry.score.toFixed(1)}
                            </div>
                            <div className="text-xs text-zinc-500">Score</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-orange-400 flex items-center gap-1 justify-end">
                              <Flame className="w-3.5 h-3.5" />
                              {entry.streak}
                            </div>
                            <div className="text-xs text-zinc-500">Streak</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Challenges Tab ─────────────────────────────────────────── */}
        {activeTab === "challenges" && (
          <div>
            {/* Filter */}
            <div className="flex gap-2 mb-6">
              {["active", "upcoming", "past"].map((f) => (
                <button
                  key={f}
                  onClick={() => setChallengeFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                    challengeFilter === f
                      ? "bg-orange-500/20 text-orange-400"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {loadingChallenges ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : challenges.length === 0 ? (
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardContent className="p-10 text-center">
                  <Swords className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400">No {challengeFilter} challenges right now.</p>
                  <p className="text-zinc-500 text-sm mt-1">Check back soon!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {challenges.map((ch) => (
                  <Card
                    key={ch.id}
                    className="border-zinc-800 bg-zinc-900/60 hover:border-orange-500/20 transition-all duration-300"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {ch.skill_category === "shooting" ? (
                            <Target className="w-5 h-5 text-red-400" />
                          ) : (
                            <Star className="w-5 h-5 text-orange-400" />
                          )}
                          <h3 className="text-white font-semibold">{ch.name}</h3>
                        </div>
                        {getStatusBadge(ch.start_date, ch.end_date)}
                      </div>

                      {ch.description && (
                        <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
                          {ch.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
                        <span>
                          {new Date(ch.start_date).toLocaleDateString()} —{" "}
                          {new Date(ch.end_date).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {ch.participant_count} joined
                        </span>
                      </div>

                      {/* Progress bar (placeholder) */}
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all"
                          style={{ width: `${Math.min(ch.participant_count * 5, 100)}%` }}
                        />
                      </div>

                      <Button
                        size="sm"
                        className="w-full gap-2"
                        disabled={joiningId === ch.id}
                        onClick={() => handleJoinChallenge(ch.id)}
                      >
                        {joiningId === ch.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Joining...
                          </>
                        ) : (
                          <>
                            <Swords className="w-4 h-4" />
                            Join Challenge
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Badges Tab ─────────────────────────────────────────────── */}
        {activeTab === "badges" && (
          <div>
            {loadingBadges ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Earned count */}
                <div className="flex items-center gap-2 mb-6">
                  <Award className="w-5 h-5 text-orange-400" />
                  <span className="text-sm text-zinc-400">
                    {earnedBadges.length} / {allBadges.length} badges earned
                  </span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden max-w-xs ml-2">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all"
                      style={{
                        width: allBadges.length > 0
                          ? `${(earnedBadges.length / allBadges.length) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {allBadges.map((badge) => {
                    const earned = earnedBadgeIds.has(badge.id);
                    const earnedInfo = earnedBadges.find((eb) => eb.badge_id === badge.id);

                    return (
                      <Card
                        key={badge.id}
                        className={`border-zinc-800 transition-all duration-300 ${
                          earned
                            ? "bg-zinc-900/60 hover:border-orange-500/30"
                            : "bg-zinc-900/30 opacity-50"
                        }`}
                      >
                        <CardContent className="p-4 text-center">
                          {/* Icon */}
                          <div
                            className={`w-14 h-14 mx-auto rounded-xl flex items-center justify-center mb-3 ${
                              earned
                                ? `bg-gradient-to-br ${badgeTierColor(badge.name)} shadow-lg`
                                : "bg-zinc-800"
                            }`}
                          >
                            {earned ? (
                              <CheckCircle2 className="w-7 h-7 text-white" />
                            ) : (
                              <Lock className="w-6 h-6 text-zinc-600" />
                            )}
                          </div>

                          <h4 className={`text-sm font-semibold mb-1 ${earned ? "text-white" : "text-zinc-500"}`}>
                            {badge.name}
                          </h4>

                          {badge.description && (
                            <p className="text-xs text-zinc-500 line-clamp-2">
                              {badge.description}
                            </p>
                          )}

                          {earned && earnedInfo && (
                            <p className="text-xs text-orange-400 mt-2">
                              Earned {new Date(earnedInfo.earned_at).toLocaleDateString()}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
