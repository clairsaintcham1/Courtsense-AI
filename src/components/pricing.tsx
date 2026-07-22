import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with basic AI coaching tools.",
    badge: null,
    features: [
      "3 video analyses per month",
      "Basic drill library access",
      "AI coach chat (5 messages/day)",
      "Progress tracking (7-day history)",
      "Community leaderboard",
    ],
    cta: "Start Free",
    variant: "outline" as const,
  },
  {
    name: "Pro",
    price: "$19",
    period: "per month",
    description: "Unlimited analysis and personalized training.",
    badge: "Most Popular",
    features: [
      "Unlimited video analyses",
      "Personalized AI training plans",
      "Unlimited AI coach chat",
      "Full progress tracking & streaks",
      "Skill spider charts & trends",
      "Parent dashboard access",
      "Priority processing",
    ],
    cta: "Get Pro",
    variant: "default" as const,
  },
  {
    name: "Team",
    price: "$49",
    period: "per month",
    description: "For coaches managing up to 15 athletes.",
    badge: "Best Value",
    features: [
      "Everything in Pro for 15 athletes",
      "Coach dashboard & analytics",
      "Team roster management",
      "Assign custom workouts",
      "Attendance & completion tracking",
      "Bulk athlete management",
      "Email support",
    ],
    cta: "Start Team",
    variant: "secondary" as const,
  },
];

export function Pricing() {
  return (
    <section className="py-24 px-4 bg-zinc-950/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Simple,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              Transparent
            </span>{" "}
            Pricing
          </h2>
          <p className="mt-4 text-lg text-zinc-400 max-w-2xl mx-auto">
            Start free. Upgrade when you&apos;re ready to take your game to the next level.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={`relative flex flex-col ${
                tier.name === "Pro"
                  ? "border-orange-500/50 bg-gradient-to-b from-orange-500/5 to-transparent shadow-lg shadow-orange-500/10"
                  : ""
              }`}
            >
              {tier.badge && (
                <Badge
                  variant={tier.name === "Pro" ? "default" : "secondary"}
                  className="absolute -top-3 left-1/2 -translate-x-1/2"
                >
                  {tier.badge}
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-bold text-white">
                    {tier.price}
                  </span>
                  <span className="text-sm text-zinc-400">/{tier.period}</span>
                </div>
                <CardDescription className="mt-2">
                  {tier.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-zinc-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  variant={tier.variant}
                  size="lg"
                  className="w-full"
                >
                  {tier.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
