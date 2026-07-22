"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, MessageCircle, LogOut, Sparkles, TrendingUp, Clock, Video } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface OnboardingData {
  role: string;
  displayName: string;
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">0</div>
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
                <div className="text-2xl font-bold text-white">0</div>
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

        {/* CTAs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center mb-3">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-3">
                <CardTitle className="text-xl text-zinc-300">
                  Chat with Coach AI
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                  Coming soon
                </Badge>
              </div>
              <CardDescription className="text-zinc-500 text-sm leading-relaxed">
                Get instant answers to basketball questions, drills recommendations,
                and strategic advice from your 24/7 AI coach.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" className="w-full gap-2" disabled>
                <MessageCircle className="w-4 h-4" />
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
