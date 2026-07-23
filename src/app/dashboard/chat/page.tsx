"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Send,
  Sparkles,
  User,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface ChatMessage {
  id: string;
  athlete_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const SUGGESTIONS = [
  "How do I improve my jump shot?",
  "Drills for weak-hand dribbling",
  "Create a warm-up routine",
];

export default function ChatPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [rateLimitInfo, setRateLimitInfo] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get display name from localStorage
  const stored = typeof window !== "undefined" ? localStorage.getItem("courtsense_onboarding") : null;
  let displayName = user?.fullName || user?.firstName || "Athlete";
  if (stored) {
    try {
      const onboarding = JSON.parse(stored);
      if (onboarding?.displayName) displayName = onboarding.displayName;
    } catch { /* ignore */ }
  }

  const firstName = displayName.split(" ")[0];

  // Fetch chat history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/chat/history?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch {
        // Silently fail — history is non-critical
      } finally {
        setInitialLoading(false);
      }
    };

    if (isLoaded) {
      fetchHistory();
    }
  }, [isLoaded, getToken]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    if (!initialLoading) {
      inputRef.current?.focus();
    }
  }, [initialLoading]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const trimmed = text.trim();
      setInput("");
      setRateLimitInfo(null);

      // Optimistically add user message
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        athlete_id: "",
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      setLoading(true);

      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/chat`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: trimmed }),
        });

        if (!res.ok) {
          if (res.status === 429) {
            const data = await res.json().catch(() => ({}));
            setRateLimitInfo(
              data.detail || "You've reached the chat limit. Try again later."
            );
          } else {
            const data = await res.json().catch(() => ({}));
            // Add error as assistant message
            setMessages((prev) => [
              ...prev,
              {
                id: `err-${Date.now()}`,
                athlete_id: "",
                role: "assistant",
                content:
                  data.detail ||
                  "Sorry, I'm having trouble right now. Please try again shortly.",
                created_at: new Date().toISOString(),
              },
            ]);
          }
          // Remove optimistic user message on error
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
          return;
        }

        const data = await res.json();

        // Replace temp message and add real reply
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
          return [
            ...withoutTemp,
            {
              id: `user-${Date.now()}`,
              athlete_id: data.reply.athlete_id,
              role: "user",
              content: trimmed,
              created_at: new Date().toISOString(),
            },
            data.reply,
          ];
        });
      } catch {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          {
            id: `err-${Date.now()}`,
            athlete_id: "",
            role: "assistant",
            content:
              "Sorry, I couldn't connect to the server. Please check your connection and try again.",
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, getToken]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (!isLoaded || initialLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-orange-400" />
            </div>
            <span className="text-sm font-semibold text-zinc-200">Coach AI</span>
          </div>

          <div className="w-20" />
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {isEmpty ? (
            /* ── Empty state ─────────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-6 shadow-lg shadow-orange-500/20">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                👋 Hey {firstName}!
              </h1>
              <p className="text-zinc-400 text-lg max-w-md mb-8">
                I'm your AI coach. Ask me anything about basketball — drills,
                technique, training routines, or game strategy.
              </p>

              <div className="flex flex-wrap justify-center gap-3 max-w-lg">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className="px-4 py-2.5 rounded-full border border-zinc-700 bg-zinc-900/60 text-zinc-300 text-sm hover:border-orange-500/50 hover:text-orange-300 hover:bg-orange-500/5 transition-all duration-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Messages ────────────────────────────────────────────── */
            <div className="space-y-4 pb-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* AI avatar */}
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles className="w-4 h-4 text-orange-400" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-orange-500 text-white rounded-br-md"
                        : "bg-zinc-800 text-zinc-100 rounded-bl-md"
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* User avatar */}
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4 text-zinc-300" />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-zinc-800 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                    <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                    <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Rate limit banner */}
      {rateLimitInfo && (
        <div className="max-w-3xl mx-auto px-4 pb-2">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{rateLimitInfo}</span>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-zinc-800 bg-zinc-950/50 shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                rateLimitInfo
                  ? "Rate limit reached — please wait..."
                  : "Ask Coach AI anything..."
              }
              disabled={loading || !!rateLimitInfo}
              maxLength={2000}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim() || !!rateLimitInfo}
              size="default"
              className="h-11 w-11 rounded-xl shrink-0 !px-0"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-zinc-600 mt-2 text-center">
            Coach AI can make mistakes. Always use proper judgment when training.
          </p>
        </div>
      </div>
    </div>
  );
}
