"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";

export function Hero() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center px-4 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto text-center py-20">
        <Badge variant="default" className="mb-6 text-sm px-4 py-1.5">
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          AI-Powered Coaching — Now in Beta
        </Badge>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1]">
          Your Personal
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
            Basketball Coach
          </span>
          <br />
          in Your Pocket
        </h1>

        <p className="mt-6 max-w-2xl mx-auto text-lg sm:text-xl text-zinc-400 leading-relaxed">
          Upload your training footage and get instant AI-powered analysis of your
          shooting form, footwork, and decision-making — then follow personalized
          workout plans that actually make you better.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {!submitted ? (
            <form
              onSubmit={handleSubmit}
              className="flex w-full max-w-md gap-3"
            >
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 h-12 rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
              />
              <Button type="submit" size="lg" className="shrink-0">
                Get Early Access
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-6 py-3 text-emerald-400 font-medium">
              🎉 You&apos;re on the list! We&apos;ll be in touch soon.
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          No credit card required. Free tier available.
        </p>

        {/* Social proof */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-black flex items-center justify-center text-xs font-bold text-zinc-300"
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span className="text-sm">Trusted by coaches &amp; athletes</span>
          </div>
          <div className="text-sm">Avg. 40% skill improvement in 8 weeks</div>
        </div>
      </div>
    </section>
  );
}
