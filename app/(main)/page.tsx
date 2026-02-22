/* eslint-disable @next/next/no-img-element */
"use client";

import React, {
  use,
  useState,
  useRef,
  useTransition,
  useEffect,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Globe,
  ArrowUp,
  ChevronDown,
  Check,
  Plus,
  Github,
  User,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Context } from "./providers";
import { MODELS, SUGGESTED_PROMPTS } from "@/lib/constants";
import { saveChat } from "@/lib/utils";
import Spinner from "@/components/spinner";

export default function Home() {
  const { setStreamPromise } = use(Context);
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(
    MODELS.find((m) => !m.hidden)?.value || MODELS[0].value,
  );
  const [quality, setQuality] = useState("high");
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(
    undefined,
  );
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [modelOpen, setModelOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement | null>(null);
  const qualityRef = useRef<HTMLDivElement | null>(null);

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (modelRef.current && !modelRef.current.contains(target))
        setModelOpen(false);
      if (qualityRef.current && !qualityRef.current.contains(target))
        setQualityOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedModelObj = useMemo(
    () => MODELS.find((m) => m.value === model),
    [model],
  );

  const qualityOptions = [
    { value: "low", label: "Low quality [faster]" },
    { value: "high", label: "High quality [slower]" },
  ];

  const selectedQualityLabel = useMemo(
    () => qualityOptions.find((q) => q.value === quality)?.label,
    [quality],
  );

  const handleScreenshotUpload = async (event: any) => {
    if (prompt.length === 0) setPrompt("Build this");
    setQuality("low");
    setScreenshotLoading(true);
    let file = event.target.files[0];
    if (!file) {
      setScreenshotLoading(false);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setScreenshotUrl(reader.result as string);
      setScreenshotLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!prompt.trim()) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/create-chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            model,
            quality,
            screenshotUrl,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || "Failed to create chat. Please try again.",
          );
        }

        const { chatId, messages, title } = await response.json();

        // Save to local storage
        const newChat = {
          id: chatId,
          title: title || prompt.slice(0, 50),
          model,
          quality,
          messages,
          createdAt: new Date().toISOString(),
        };
        saveChat(newChat);

        const streamPromise = fetch("/api/get-next-completion-stream-promise", {
          method: "POST",
          body: JSON.stringify({ messages, model }),
        }).then(async (res) => {
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || "Failed to start stream");
          }
          if (!res.body) {
            throw new Error("No body on response");
          }
          return res.body;
        });

        setStreamPromise(streamPromise);
        router.push(`/chats/${chatId}`);
      } catch (e: any) {
        setError(e.message || "An unexpected error occurred.");
      }
    });
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-200 via-slate-100 to-slate-200 flex flex-col relative overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto mt-4 px-4 sm:px-6">
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md shadow-md rounded-2xl sm:rounded-full px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-orange-500 rounded-full" />
            <span className="text-lg sm:text-xl font-semibold">Nuvic</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-gray-700 font-medium">
            <span>Product</span>
            <span>Pricing</span>
            <span>Enterprise</span>
          </div>

          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-gray-600" />

            <button
              type="button"
              className="sm:hidden w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <User className="w-5 h-5 text-gray-700" />
            </button>

            <button
              type="button"
              className="hidden sm:flex relative w-10 h-10 rounded-full bg-gradient-to-tr from-orange-500 to-orange-400 items-center justify-center shadow-md hover:scale-105 transition"
            >
              <span className="text-white text-sm font-semibold">U</span>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center text-center mt-16 sm:mt-24 px-4 sm:px-6 grow pb-20">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-3xl sm:text-5xl md:text-6xl font-semibold text-gray-900"
        >
          Turn your ideas into apps
        </motion.h1>

        <p className="mt-4 sm:mt-6 text-base sm:text-lg text-gray-600 max-w-2xl">
          Nuvic lets you build fully-functional apps in minutes with just your
          words. No coding necessary.
        </p>

        <Card className="mt-10 sm:mt-12 w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-8 bg-white/90 backdrop-blur-md relative overflow-hidden">
          {isPending && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
              <span className="mb-4 text-gray-600 font-medium animate-pulse">
                {quality === "high"
                  ? "Coming up with project plan..."
                  : screenshotUrl
                    ? "Analyzing screenshot..."
                    : "Creating your app..."}
              </span>
              <Spinner />
            </div>
          )}

          <div className="relative">
            {screenshotUrl && (
              <div className="relative mb-4 inline-block">
                <img
                  src={screenshotUrl}
                  alt="Screenshot"
                  className="h-20 w-auto rounded-lg shadow-md border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    setScreenshotUrl(undefined);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-gray-100 hover:bg-gray-50"
                >
                  <X className="w-3 h-3 text-gray-600" />
                </button>
              </div>
            )}
            {screenshotLoading && (
              <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 italic">
                <Spinner />
                <span>Uploading screenshot...</span>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Design a personal budget tracker with income/expense categories, charts, and monthly reports..."
              className="w-full min-h-[140px] sm:min-h-[180px] resize-none outline-none bg-transparent text-gray-700 text-base sm:text-lg placeholder:text-gray-400 pr-16 sm:pr-20 pb-24"
            />

            <div className="absolute bottom-4 left-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                title="Attach screenshot"
              >
                <Plus className="w-4 h-4 text-gray-700" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleScreenshotUpload}
              />
            </div>

            <div className="absolute bottom-4 left-14 sm:left-16 flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600">
              <div className="relative" ref={modelRef}>
                <button
                  type="button"
                  onClick={() => {
                    setModelOpen((prev) => !prev);
                    setQualityOpen(false);
                  }}
                  className="flex items-center gap-1 bg-gray-100 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <span className="truncate max-w-[110px] sm:max-w-none">
                    {selectedModelObj?.label}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {modelOpen && (
                  <div className="absolute bottom-12 left-0 w-52 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                    {MODELS.filter((m) => !m.hidden).map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => {
                          setModel(m.value);
                          setModelOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-100 text-sm transition-colors"
                      >
                        <span>{m.label}</span>
                        {model === m.value && (
                          <Check className="w-4 h-4 text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative hidden sm:block" ref={qualityRef}>
                <button
                  type="button"
                  onClick={() => {
                    setQualityOpen((prev) => !prev);
                    setModelOpen(false);
                  }}
                  className="flex items-center gap-1 bg-gray-100 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <span className="truncate max-w-[110px] sm:max-w-none">
                    {selectedQualityLabel}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {qualityOpen && (
                  <div className="absolute bottom-12 left-0 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                    {qualityOptions.map((q) => (
                      <button
                        key={q.value}
                        type="button"
                        onClick={() => {
                          setQuality(q.value);
                          setQualityOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-100 text-sm transition-colors"
                      >
                        <span>{q.label}</span>
                        {quality === q.value && (
                          <Check className="w-4 h-4 text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !prompt.trim()}
              className="absolute bottom-4 right-4 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-orange-500 to-orange-400 flex items-center justify-center shadow-xl transition-all duration-200 group-hover:scale-105 group-active:scale-95">
                <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </button>
          </div>
        </Card>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600 max-w-3xl">
            {error}
          </div>
        )}

        <div className="mt-10 sm:mt-12 text-gray-600 font-medium tracking-wide text-xs sm:text-sm">
          NOT SURE WHERE TO START? TRY ONE OF THESE:
        </div>

        <div className="mt-4 sm:mt-6 flex flex-wrap justify-center gap-3 sm:gap-4 max-w-3xl">
          {SUGGESTED_PROMPTS.map((item) => (
            <motion.div
              key={item.title}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setPrompt(item.description);
                textareaRef.current?.focus();
              }}
              className="px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-white/80 backdrop-blur-md shadow-md cursor-pointer text-gray-800 text-sm sm:text-base font-medium hover:bg-white transition-colors"
            >
              {item.title}
            </motion.div>
          ))}
        </div>
      </div>

      <a
        href="https://github.com/Nutlope/llamacoder"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors z-50 shadow-sm"
      >
        <Github className="w-4 h-4 text-gray-700" />
      </a>
    </div>
  );
}

export const runtime = "edge";
export const maxDuration = 60;
