"use client";

import { SignUp } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-4">
      {/* Back to home */}
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CourtSense AI
      </Link>

      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto w-full max-w-md",
            card: "bg-zinc-900/80 border border-zinc-800 rounded-xl shadow-2xl shadow-orange-500/5",
            headerTitle: "text-zinc-100 text-xl font-bold",
            headerSubtitle: "text-zinc-400",
            dividerLine: "bg-zinc-700",
            dividerText: "text-zinc-500",
            formFieldLabel: "text-zinc-300",
            formFieldInput:
              "bg-zinc-800 border-zinc-700 text-zinc-100 focus:ring-orange-500/50 focus:border-orange-500/50 rounded-lg",
            formFieldInputShowPasswordIcon: "text-zinc-400",
            formButtonPrimary:
              "bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg shadow-lg shadow-orange-500/25 transition-all",
            footerActionLink:
              "text-orange-400 hover:text-orange-300 font-medium",
            socialButtonsBlockButton:
              "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 rounded-lg",
            socialButtonsBlockButtonText: "text-zinc-200 font-medium",
            formFieldAction: "text-orange-400",
            formFieldErrorText: "text-red-400",
            alert: "bg-red-500/10 border-red-500/30 text-red-400",
            alertText: "text-red-300",
            otpCodeFieldInput:
              "bg-zinc-800 border-zinc-700 text-zinc-100 rounded-lg",
          },
          // Layout options applied via appearance
        }}
      />
    </div>
  );
}
