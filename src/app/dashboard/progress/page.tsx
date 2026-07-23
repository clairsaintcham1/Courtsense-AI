"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Flame,
  Dumbbell,
  Clock,
  Star,
  Trophy,
  Target,
  Zap,
  Award,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillRating {
  skill_category: string;
  rating: number;
}

interface SkillRatingsResponse {
  ratings: SkillRating[];
  updated_at: string | null;
}

interface AthleteStats {
  total_workouts: number;
  current_streak: number;
  analyses_count: number;
  hours_trained: number;
  average_score: number | null;
  total_videos: number;
}

interface ProgressEvent {
  id: string;
  metric_name: string;
  value: number;
  recorded_at: string;
}

interface AnalysisScore {
  overall_score: number | null;
  created_at: string;
}

interface WorkoutDay {
  date: string; // YYYY-MM-DD
  completed: boolean;
  count: number;
}

// ---------------------------------------------------------------------------
// Milestones definition
// ---------------------------------------------------------------------------

interface Milestone {
  id: string;
  name: string;
  icon: React.ReactNode;
  metric: "total_workouts" | "analyses_count" | "current_streak" | "hours_trained";
  thresholds: { value: number; label: string; emoji: string }[];
}

const MILESTONES: Milestone[] = [
  {
    id: "workout-warrior",
    name: "Workout Warrior",
    icon: <Dumbbell className="w-4 h-4" />,
    metric: "total_workouts",
    thresholds: [
      { value: 5, label: "Rookie", emoji: "🌱" },
      { value: 10, label: "Grinder", emoji: "💪" },
      { value: 25, label: "Warrior", emoji: "⚔️" },
      { value: 50, label: "Elite", emoji: "👑" },
    ],
  },
  {
    id: "film-junkie",
    name: "Film Junkie",
    icon: <Star className="w-4 h-4" />,
    metric: "analyses_count",
    thresholds: [
      { value: 3, label: "Observer", emoji: "👀" },
      { value: 10, label: "Analyst", emoji: "🔬" },
      { value: 25, label: "Film Junkie", emoji: "🎬" },
    ],
  },
  {
    id: "streak-king",
    name: "Streak King",
    icon: <Flame className="w-4 h-4" />,
    metric: "current_streak",
    thresholds: [
      { value: 3, label: "On Fire", emoji: "🔥" },
      { value: 7, label: "Unstoppable", emoji: "🚀" },
      { value: 14, label: "Legendary", emoji: "🏆" },
    ],
  },
  {
    id: "gym-rat",
    name: "Gym Rat",
    icon: <Clock className="w-4 h-4" />,
    metric: "hours_trained",
    thresholds: [
      { value: 5, label: "Dedicated", emoji: "⏰" },
      { value: 20, label: "Gym Rat", emoji: "🐀" },
      { value: 50, label: "Immortal", emoji: "💎" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Spider / Radar Chart (pure SVG)
// ---------------------------------------------------------------------------

const SKILL_LABELS: Record<string, string> = {
  shooting: "Shooting",
  dribbling: "Dribbling",
  footwork: "Footwork",
  defense: "Defense",
  passing: "Passing",
  basketball_iq: "Basketball IQ",
};

const SKILL_ORDER = ["shooting", "dribbling", "footwork", "defense", "passing", "basketball_iq"];

function SpiderChart({ ratings }: { ratings: SkillRating[] }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 105;
  const levels = 5; // concentric rings
  const n = SKILL_ORDER.length;
  const angleStep = (2 * Math.PI) / n;
  // Rotate so first point is at top
  const angleOffset = -Math.PI / 2;

  const getPoint = (i: number, r: number): [number, number] => {
    const angle = angleOffset + i * angleStep;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  // Build rating map
  const ratingMap: Record<string, number> = {};
  for (const r of ratings) {
    ratingMap[r.skill_category] = r.rating;
  }

  // Data polygon
  const dataPoints = SKILL_ORDER.map((cat, i) => {
    const val = ratingMap[cat] ?? 5;
    const r = (val / 10) * radius;
    return getPoint(i, r);
  });

  const dataPolygon = dataPoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px] mx-auto">
      {/* Concentric rings */}
      {Array.from({ length: levels }, (_, level) => {
        const r = (radius / levels) * (level + 1);
        const ringPoints = SKILL_ORDER.map((_, i) => {
          const [px, py] = getPoint(i, r);
          return `${px},${py}`;
        }).join(" ");
        return (
          <polygon
            key={level}
            points={ringPoints}
            fill="none"
            stroke="rgb(39 39 42)"
            strokeWidth="1"
          />
        );
      })}

      {/* Axis lines */}
      {SKILL_ORDER.map((_, i) => {
        const [ex, ey] = getPoint(i, radius);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={ex}
            y2={ey}
            stroke="rgb(39 39 42)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPolygon}
        fill="rgba(249, 115, 22, 0.15)"
        stroke="rgb(249, 115, 22)"
        strokeWidth="2"
      />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <circle key={`dot-${i}`} cx={x} cy={y} r="4" fill="rgb(249, 115, 22)" />
      ))}

      {/* Labels */}
      {SKILL_ORDER.map((cat, i) => {
        const [lx, ly] = getPoint(i, radius + 22);
        return (
          <text
            key={`label-${i}`}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgb(161 161 170)"
            fontSize="11"
            fontFamily="Inter, sans-serif"
          >
            {SKILL_LABELS[cat]}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Score Trend Line (SVG)
// ---------------------------------------------------------------------------

function ScoreTrendChart({ scores }: { scores: AnalysisScore[] }) {
  const width = 600;
  const height = 160;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 12;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const data = scores
    .filter((s) => s.overall_score != null)
    .slice(0, 10)
    .reverse(); // oldest first for line chart

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
        Need at least 2 analyses to show a trend
      </div>
    );
  }

  const yMin = 0;
  const yMax = 100;
  const xScale = (i: number) => padLeft + (i / (data.length - 1)) * plotW;
  const yScale = (v: number) => padTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const points = data
    .map((d, i) => `${xScale(i)},${yScale(d.overall_score!)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((v) => (
        <line
          key={`grid-${v}`}
          x1={padLeft}
          y1={yScale(v)}
          x2={width - padRight}
          y2={yScale(v)}
          stroke="rgb(39 39 42)"
          strokeWidth="1"
        />
      ))}
      {/* Y-axis labels */}
      {[0, 50, 100].map((v) => (
        <text
          key={`yl-${v}`}
          x={padLeft - 8}
          y={yScale(v) + 4}
          textAnchor="end"
          fill="rgb(113 113 122)"
          fontSize="10"
          fontFamily="Inter, sans-serif"
        >
          {v}
        </text>
      ))}
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="rgb(249, 115, 22)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots */}
      {data.map((d, i) => (
        <circle
          key={`dot-${i}`}
          cx={xScale(i)}
          cy={yScale(d.overall_score!)}
          r="4"
          fill="rgb(249, 115, 22)"
        />
      ))}
      {/* X-axis labels (dates) */}
      {data.map((d, i) => {
        const label = new Date(d.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        return (
          <text
            key={`xl-${i}`}
            x={xScale(i)}
            y={height - 6}
            textAnchor="middle"
            fill="rgb(113 113 122)"
            fontSize="9"
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Workout Heat Map (7-day grid, GitHub-style)
// ---------------------------------------------------------------------------

function WorkoutHeatMap({ workouts }: { workouts: WorkoutDay[] }) {
  // Show last 4 weeks (28 days)
  const today = new Date();
  const days: { date: string; dayName: string; dayNum: number; weekIndex: number; completed: boolean; count: number }[] = [];

  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const match = workouts.find((w) => w.date === key);
    days.push({
      date: key,
      dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: d.getDay(),
      weekIndex: Math.floor(i / 7),
      completed: match?.completed ?? false,
      count: match?.count ?? 0,
    });
  }

  // Reorder into columns: each column is a day-of-week (0=Sun, 6=Sat), each row is a week
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weeks = 4;

  const getCell = (weekIdx: number, dayOfWeek: number) => {
    return days.find((d) => d.weekIndex === weekIdx && d.dayNum === dayOfWeek);
  };

  const getColor = (completed: boolean, count: number) => {
    if (!completed) return "rgb(24 24 27)"; // empty cell
    if (count >= 2) return "rgb(249 115 22)"; // intense
    return "rgb(234 88 12)"; // completed
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-1 mr-1 justify-around">
          {dayNames.map((name) => (
            <div key={name} className="text-[10px] text-zinc-500 w-8 text-right pr-2 leading-none">
              {name}
            </div>
          ))}
        </div>
        {/* Week columns */}
        {Array.from({ length: weeks }, (_, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {dayNames.map((_, di) => {
              const cell = getCell(wi, di);
              const completed = cell?.completed ?? false;
              const count = cell?.count ?? 0;
              const isToday = cell?.date === today.toISOString().slice(0, 10);
              return (
                <div
                  key={`${wi}-${di}`}
                  className={`w-3.5 h-3.5 rounded-sm transition-colors ${
                    isToday ? "ring-1 ring-orange-400 ring-offset-1 ring-offset-black" : ""
                  }`}
                  style={{ backgroundColor: getColor(completed, count) }}
                  title={cell?.date ?? ""}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-zinc-500">
        <span>Less</span>
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgb(24 24 27)" }} />
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgb(234 88 12)" }} />
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgb(249 115 22)" }} />
        <span>More</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestone Progress
// ---------------------------------------------------------------------------

function MilestoneCard({
  milestone,
  currentValue,
}: {
  milestone: Milestone;
  currentValue: number;
}) {
  // Find current and next threshold
  let currentThreshold = milestone.thresholds[0];
  let nextThreshold = milestone.thresholds[0];
  let earnedIndex = -1;

  for (let i = 0; i < milestone.thresholds.length; i++) {
    if (currentValue >= milestone.thresholds[i].value) {
      earnedIndex = i;
      currentThreshold = milestone.thresholds[i];
      nextThreshold = milestone.thresholds[i + 1] ?? milestone.thresholds[i];
    } else {
      nextThreshold = milestone.thresholds[i];
      break;
    }
  }

  const isMaxed = earnedIndex === milestone.thresholds.length - 1;
  const progress = isMaxed
    ? 100
    : Math.min(100, (currentValue / nextThreshold.value) * 100);
  const progressLabel = isMaxed
    ? `${currentThreshold.label} — Maxed!`
    : `${currentValue}/${nextThreshold.value} to ${nextThreshold.label}`;

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
            {milestone.icon}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{milestone.name}</div>
            <div className="text-xs text-zinc-400">{progressLabel}</div>
          </div>
          {isMaxed && (
            <Badge variant="success" className="ml-auto text-xs">
              <Trophy className="w-3 h-3 mr-1" />
              Max
            </Badge>
          )}
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: isMaxed
                ? "linear-gradient(90deg, #f59e0b, #f97316)"
                : "linear-gradient(90deg, #f97316, #ea580c)",
            }}
          />
        </div>
        {/* Earned badges row */}
        <div className="flex items-center gap-1 mt-2">
          {milestone.thresholds.map((t, i) => (
            <div
              key={i}
              className={`text-xs transition-opacity ${
                i <= earnedIndex ? "opacity-100" : "opacity-30"
              }`}
              title={t.label}
            >
              {t.emoji}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProgressDashboardPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [skillRatings, setSkillRatings] = useState<SkillRating[]>([]);
  const [stats, setStats] = useState<AthleteStats | null>(null);
  const [scoreTrend, setScoreTrend] = useState<AnalysisScore[]>([]);
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  useEffect(() => {
    if (!isLoaded) return;

    const fetchAll = async () => {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };

        // We need the athlete ID. The API uses the authenticated user to look up athlete.
        // Fetch athlete ID from training-plans or use the "me" pattern.
        // For MVP: use a simple approach — call the endpoints that need athlete ID.
        // We'll get athlete ID from the videos endpoint response.

        // First, get athlete ID from a simple call
        const videosRes = await fetch(`${API_URL}/videos?limit=1`, { headers });
        let athleteId: string | null = null;

        if (videosRes.ok) {
          const vData = await videosRes.json();
          // Videos response may not include athlete_id directly.
          // Let's try training plans instead.
        }

        // Alternative: get athlete ID from training plans
        const plansRes = await fetch(`${API_URL}/training-plans?limit=1`, { headers });
        if (plansRes.ok) {
          const pData = await plansRes.json();
          if (pData.plans?.[0]?.athlete_id) {
            athleteId = pData.plans[0].athlete_id;
          }
        }

        // If we still don't have it, try the analyses endpoint
        if (!athleteId) {
          // We can try to get it from the user endpoint or fallback.
          // For MVP, we'll use the clerk ID to derive — but actually,
          // the backend enforces athlete-only access via get_current_athlete.
          // The training endpoint already requires get_current_athlete, so if
          // we get a successful response, it implicitly tells us we're an athlete.

          // Let's just try the analyses listing which requires athlete context
          const analysesRes = await fetch(`${API_URL}/videos?limit=1`, { headers });
          if (analysesRes.ok) {
            const aData = await analysesRes.json();
            // videos response has athlete context implicitly
          }
        }

        // Since the API uses get_current_athlete which validates via JWT,
        // and each endpoint needs athlete_id in the URL, we need a way to get it.
        // For MVP: parse the Clerk user ID from the JWT and use it.
        // Actually, let's just call a simple endpoint. The training plan list
        // returns athlete_id in the response.

        // Let's use a different approach: call the endpoints we know.
        // The training plans list returns athlete_id, so:
        if (athleteId) {
          // Fetch skill ratings
          const ratingsRes = await fetch(
            `${API_URL}/athletes/${athleteId}/skill-ratings`,
            { headers }
          );
          if (ratingsRes.ok) {
            const rData: SkillRatingsResponse = await ratingsRes.json();
            setSkillRatings(rData.ratings);
          }

          // Fetch stats
          const statsRes = await fetch(
            `${API_URL}/athletes/${athleteId}/stats`,
            { headers }
          );
          if (statsRes.ok) {
            setStats(await statsRes.json());
          }

          // Fetch analyses for score trend
          const analysesRes = await fetch(
            `${API_URL}/athletes/${athleteId}/analyses?limit=10`,
            { headers }
          );
          if (analysesRes.ok) {
            const aData = await analysesRes.json();
            const scores: AnalysisScore[] = (aData.analyses || [])
              .filter((a: any) => a.overall_score != null)
              .map((a: any) => ({
                overall_score: a.overall_score,
                created_at: a.created_at,
              }));
            setScoreTrend(scores);
          }
        }

        // Build workout heatmap from training plans
        const plansListRes = await fetch(`${API_URL}/training-plans?limit=4`, { headers });
        if (plansListRes.ok) {
          const pData = await plansListRes.json();
          const days: WorkoutDay[] = [];
          for (const plan of pData.plans || []) {
            const weekStart = new Date(plan.week_start_date);
            for (const w of plan.workouts || []) {
              const workoutDate = new Date(weekStart);
              workoutDate.setDate(weekStart.getDate() + w.day_of_week);
              const dateKey = workoutDate.toISOString().slice(0, 10);
              const existing = days.find((d) => d.date === dateKey);
              if (existing) {
                existing.count += 1;
                existing.completed = existing.completed || w.completed;
              } else {
                days.push({
                  date: dateKey,
                  completed: w.completed,
                  count: 1,
                });
              }
            }
            // Set athleteId from the plan if not already set
            if (!athleteId && plan.athlete_id) {
              athleteId = plan.athlete_id;
            }
          }
          setWorkoutDays(days);
        }

        // If we got athleteId late, re-fetch stats and ratings
        if (athleteId && skillRatings.length === 0) {
          const [ratingsRes2, statsRes2, analysesRes2] = await Promise.all([
            fetch(`${API_URL}/athletes/${athleteId}/skill-ratings`, { headers }),
            fetch(`${API_URL}/athletes/${athleteId}/stats`, { headers }),
            fetch(`${API_URL}/athletes/${athleteId}/analyses?limit=10`, { headers }),
          ]);

          if (ratingsRes2.ok) {
            const rData: SkillRatingsResponse = await ratingsRes2.json();
            setSkillRatings(rData.ratings);
          }
          if (statsRes2.ok) {
            setStats(await statsRes2.json());
          }
          if (analysesRes2.ok) {
            const aData = await analysesRes2.json();
            const scores: AnalysisScore[] = (aData.analyses || [])
              .filter((a: any) => a.overall_score != null)
              .map((a: any) => ({
                overall_score: a.overall_score,
                created_at: a.created_at,
              }));
            setScoreTrend(scores);
          }
        }
      } catch {
        // Silently fail — dashboard is best-effort
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [isLoaded, getToken]);

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayName = user?.fullName || user?.firstName || "Athlete";

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Dashboard</span>
            </Link>
            <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              Progress
            </span>
          </div>
          <span className="text-sm text-zinc-500">{displayName}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page title */}
        <div className="mb-8">
          <Badge variant="default" className="mb-3 text-sm px-4 py-1.5">
            <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
            Performance Tracking
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            Your Progress
          </h1>
          <p className="text-zinc-400 text-sm max-w-xl">
            Track your skills, streaks, and milestones as you level up your game.
          </p>
        </div>

        {/* ── Stats Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">
                  {stats?.current_streak ?? 0}
                </div>
                <div className="text-[11px] text-zinc-400">Day Streak</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Dumbbell className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">
                  {stats?.total_workouts ?? 0}
                </div>
                <div className="text-[11px] text-zinc-400">Workouts</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">
                  {stats?.hours_trained ?? 0}h
                </div>
                <div className="text-[11px] text-zinc-400">Trained</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <Star className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">
                  {stats?.average_score != null ? Math.round(stats.average_score) : "—"}
                </div>
                <div className="text-[11px] text-zinc-400">Avg Score</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Charts Row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Spider Chart */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-orange-400" />
                Skill Ratings
              </CardTitle>
              <CardDescription>
                {skillRatings.length > 0
                  ? "Based on your video analyses"
                  : "Upload videos to get skill ratings"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              {skillRatings.length > 0 ? (
                <SpiderChart ratings={skillRatings} />
              ) : (
                <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
                  No ratings yet — upload your first video!
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score Trend */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Score Trend
              </CardTitle>
              <CardDescription>Last {Math.min(scoreTrend.filter(s => s.overall_score != null).length, 10)} analyses</CardDescription>
            </CardHeader>
            <CardContent>
              <ScoreTrendChart scores={scoreTrend} />
            </CardContent>
          </Card>
        </div>

        {/* ── Workout Heat Map ────────────────────────────────────── */}
        <Card className="border-zinc-800 bg-zinc-900/60 mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Workout Consistency
            </CardTitle>
            <CardDescription>Last 4 weeks — darker cells = more workouts</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <WorkoutHeatMap workouts={workoutDays} />
          </CardContent>
        </Card>

        {/* ── Milestones ──────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Milestones</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MILESTONES.map((m) => (
              <MilestoneCard
                key={m.id}
                milestone={m}
                currentValue={
                  m.metric === "total_workouts"
                    ? stats?.total_workouts ?? 0
                    : m.metric === "analyses_count"
                    ? stats?.analyses_count ?? 0
                    : m.metric === "current_streak"
                    ? stats?.current_streak ?? 0
                    : stats?.hours_trained ?? 0
                }
              />
            ))}
          </div>
        </div>

        {/* ── Quick Nav ───────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/dashboard/training"
            className="inline-flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300 transition-colors"
          >
            <Dumbbell className="w-4 h-4" />
            Training Plan
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/dashboard/upload"
            className="inline-flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300 transition-colors"
          >
            <Star className="w-4 h-4" />
            Upload Video
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </main>
    </div>
  );
}
