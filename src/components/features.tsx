import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Video, BarChart3, Dumbbell, MessageCircle } from "lucide-react";

const features = [
  {
    icon: Video,
    title: "Video Analysis",
    description:
      "Upload any training or game footage and our AI breaks down your shooting form, footwork, ball handling, defense, passing, and decision-making in seconds.",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
  },
  {
    icon: Dumbbell,
    title: "AI Training Plans",
    description:
      "Get personalized weekly workout plans generated from your analysis results. Every drill targets your specific weaknesses — not generic routines.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    icon: BarChart3,
    title: "Progress Tracking",
    description:
      "Watch your skills improve over time with detailed progress graphs, skill ratings, and streak counters. See exactly where you're getting better.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: MessageCircle,
    title: "AI Coach Chat",
    description:
      "Stuck on a drill? Ask your personal AI coach anything, anytime. Get instant, specific advice tailored to your game — like having a trainer on call 24/7.",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
];

export function Features() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Everything You Need to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              Level Up
            </span>
          </h2>
          <p className="mt-4 text-lg text-zinc-400 max-w-2xl mx-auto">
            Pro-level coaching tools — now available to every athlete with a phone.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group hover:border-zinc-700 transition-colors duration-300"
            >
              <CardHeader>
                <div
                  className={`w-12 h-12 rounded-lg ${feature.bgColor} flex items-center justify-center mb-4`}
                >
                  <feature.icon
                    className={`w-6 h-6 ${feature.color}`}
                    strokeWidth={1.5}
                  />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
