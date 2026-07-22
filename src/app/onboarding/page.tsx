"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Briefcase, Users, ArrowRight, Check, AlertCircle } from "lucide-react";

type Role = "athlete" | "coach" | "parent" | null;

interface ProfileData {
  role: Role;
  displayName: string;
  // Athlete fields
  age?: string;
  skillLevel?: string;
  // Coach fields
  organization?: string;
  teamName?: string;
  // Parent fields
  childName?: string;
  childAge?: string;
}

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [step, setStep] = useState<"role" | "profile">("role");
  const [role, setRole] = useState<Role>(null);
  const [profile, setProfile] = useState<ProfileData>({
    role: null,
    displayName: user?.fullName || "",
  });

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectRole = (r: Role) => {
    setRole(r);
    setProfile((p) => ({ ...p, role: r }));
    setStep("profile");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Store onboarding data in localStorage
    localStorage.setItem("courtsense_onboarding", JSON.stringify(profile));
    router.push("/dashboard");
  };

  const roles = [
    {
      id: "athlete" as const,
      icon: User,
      title: "Athlete",
      description: "I want to improve my game with AI-powered analysis and personalized training plans.",
      color: "from-orange-500 to-orange-600",
      bgGlow: "bg-orange-500/10",
    },
    {
      id: "coach" as const,
      icon: Briefcase,
      title: "Coach",
      description: "I want to manage my team, assign workouts, and track player development.",
      color: "from-blue-500 to-blue-600",
      bgGlow: "bg-blue-500/10",
    },
    {
      id: "parent" as const,
      icon: Users,
      title: "Parent",
      description: "I want to support my child's basketball journey and track their progress.",
      color: "from-emerald-500 to-emerald-600",
      bgGlow: "bg-emerald-500/10",
    },
  ];

  // Role selection step
  if (step === "role") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black px-4 py-16">
        <div className="max-w-4xl w-full text-center">
          <Badge variant="default" className="mb-6 text-sm px-4 py-1.5">
            Step 1 of 2
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
            Welcome to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              CourtSense AI
            </span>
          </h1>
          <p className="text-lg text-zinc-400 mb-12 max-w-xl mx-auto">
            Tell us who you are so we can personalize your experience.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRole(r.id)}
                className="group relative text-left focus:outline-none"
              >
                <Card className="h-full cursor-pointer border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700 transition-all duration-300 hover:scale-[1.02] group-focus-visible:ring-2 group-focus-visible:ring-orange-500/50">
                  {/* Glow effect on hover */}
                  <div
                    className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${r.bgGlow} blur-xl`}
                  />
                  <CardHeader className="relative z-10">
                    <div
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${r.color} flex items-center justify-center mb-4 shadow-lg`}
                    >
                      <r.icon className="w-7 h-7 text-white" />
                    </div>
                    <CardTitle className="text-xl text-white">{r.title}</CardTitle>
                    <CardDescription className="text-zinc-400 text-sm leading-relaxed">
                      {r.description}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="relative z-10">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-orange-400 group-hover:text-orange-300 transition-colors">
                      Get started <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </CardFooter>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Profile form step
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-4 py-16">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <Badge variant="default" className="mb-4 text-sm px-4 py-1.5">
            Step 2 of 2
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Tell us about yourself
          </h2>
          <p className="text-zinc-400">
            {role === "athlete" && "Let's set up your training profile."}
            {role === "coach" && "Tell us about your coaching setup."}
            {role === "parent" && "Tell us about your young athlete."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-6 space-y-5">
              {/* Display Name (common) */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, displayName: e.target.value }))
                  }
                  required
                  className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
                  placeholder="Your name"
                />
              </div>

              {/* Athlete fields */}
              {role === "athlete" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Age
                    </label>
                    <select
                      value={profile.age || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, age: e.target.value }))
                      }
                      required
                      className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 appearance-none"
                    >
                      <option value="" disabled>
                        Select age
                      </option>
                      {Array.from({ length: 11 }, (_, i) => i + 8).map((age) => (
                        <option key={age} value={age}>
                          {age} years old
                        </option>
                      ))}
                      <option value="19+">19+ years old</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Skill Level
                    </label>
                    <select
                      value={profile.skillLevel || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, skillLevel: e.target.value }))
                      }
                      required
                      className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 appearance-none"
                    >
                      <option value="" disabled>
                        Select level
                      </option>
                      <option value="beginner">Beginner — Just starting out</option>
                      <option value="intermediate">Intermediate — Play regularly</option>
                      <option value="advanced">Advanced — Competitive player</option>
                      <option value="elite">Elite — High school varsity / AAU</option>
                    </select>
                  </div>

                  {/* Under-13 notice */}
                  {profile.age && parseInt(profile.age) < 13 && (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-300">
                        <p className="font-medium mb-1">Under-13 Notice</p>
                        <p className="text-amber-400/80">
                          Athletes under 13 must have a parent or guardian manage their account.
                          Please ask a parent to create an account and add you as their athlete.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Coach fields */}
              {role === "coach" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Organization (optional)
                    </label>
                    <input
                      type="text"
                      value={profile.organization || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, organization: e.target.value }))
                      }
                      className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
                      placeholder="School, AAU program, or academy name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Team Name
                    </label>
                    <input
                      type="text"
                      value={profile.teamName || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, teamName: e.target.value }))
                      }
                      className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
                      placeholder="Your team name"
                    />
                  </div>
                </>
              )}

              {/* Parent fields */}
              {role === "parent" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Child&apos;s Name
                    </label>
                    <input
                      type="text"
                      value={profile.childName || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, childName: e.target.value }))
                      }
                      required
                      className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
                      placeholder="Your child's name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Child&apos;s Age
                    </label>
                    <select
                      value={profile.childAge || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, childAge: e.target.value }))
                      }
                      required
                      className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 appearance-none"
                    >
                      <option value="" disabled>
                        Select age
                      </option>
                      {Array.from({ length: 11 }, (_, i) => i + 8).map((age) => (
                        <option key={age} value={age}>
                          {age} years old
                        </option>
                      ))}
                      <option value="19+">19+ years old</option>
                    </select>
                  </div>
                </>
              )}
            </CardContent>

            <CardFooter className="px-6 pb-6 pt-0 flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("role")}
                className="flex-1"
              >
                Back
              </Button>
              <Button type="submit" className="flex-1 gap-2">
                <Check className="w-4 h-4" />
                Complete Setup
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
