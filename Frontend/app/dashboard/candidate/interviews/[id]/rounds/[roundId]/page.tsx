"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { candidateApi, getApiErrorMessage, getToken } from "@/lib/api";
import { useProctoring } from "@/hooks/useProctoring";

type Question = {
  id: number; round_id: number; content: string; type: string;
  difficulty: string | null; domain: string | null;
  options?: Record<string, string> | null;
  correct_answer?: string | null;
  max_score?: number;
  test_cases?: { public?: { input: string; expected: string }[] } | null;
};
type Round = { id: number; interview_id: number; type: string; order: number; status: string; weightage?: number; duration_minutes?: number };
type RoundSession = {
  id: number; candidate_id: number; round_id: number; interview_id: number;
  status: string; total_score?: number; max_possible_score?: number;
  started_at?: string; submitted_at?: string;
};
type LiveInterviewInfo = {
  status: string;
  message?: string | null;
  room_name?: string | null;
  meeting_url?: string | null;
  candidate_name?: string | null;
  jitsi_domain?: string | null;
  jitsi_jwt?: string | null;
};

function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const onEndRef = useRef<(() => void) | null>(null);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !text.trim()) return;
    onEndRef.current = onEnd ?? null;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1;
    u.onend = () => {
      setIsSpeaking(false);
      onEndRef.current?.();
      onEndRef.current = null;
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setIsSpeaking(true);
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
    setIsSpeaking(false);
    onEndRef.current = null;
  }, []);

  return { speak, isSpeaking, stop };
}

function AvatarWithWaveform({
  isSpeaking,
  isListening,
  micLevel,
}: {
  isSpeaking: boolean;
  isListening: boolean;
  micLevel: number;
}) {
  const active = isSpeaking || isListening;
  const showBars = isSpeaking || (isListening && micLevel > 0);
  return (
    <div className="relative flex flex-col items-center justify-center">
      <div
        className={`relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-b from-indigo-900/80 to-slate-900 shadow-lg transition-all duration-300 ${
          active ? "ring-4 ring-green-500/60 shadow-green-500/20" : "ring-4 ring-indigo-500/30"
        } ${isListening ? "animate-pulse ring-green-500/50" : ""}`}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="flex gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-300" />
            <span className="h-3 w-3 rounded-full bg-slate-300" />
          </div>
          <div className="h-1 w-8 rounded-full bg-slate-400" />
        </div>
        {showBars && (
          <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-green-400 transition-all duration-75"
                style={{
                  height: isSpeaking
                    ? `${12 + Math.sin(i * 0.8) * 8}px`
                    : `${8 + micLevel * 24 * (0.6 + 0.4 * Math.sin(i * 0.7))}px`,
                  animation: isSpeaking ? `pulse 0.4s ease-in-out ${i * 0.05}s infinite` : "none",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function parseMcqOptions(question: Question): [string, string][] {
  if (question.options && typeof question.options === "object") {
    return Object.entries(question.options).map(([key, value]) => [String(key), String(value ?? "")]);
  }
  const matches = Array.from(
    question.content.matchAll(/(?:^|\n)\s*([A-D])[\)\].:-]\s*(.+?)(?=(?:\n\s*[A-D][\)\].:-]\s)|$)/gis)
  );
  return matches.map((match) => [match[1].toUpperCase(), match[2].trim()]);
}

function buildMeetingSrc(meetingUrl: string, token?: string | null) {
  if (!token) return meetingUrl;
  return `${meetingUrl}${meetingUrl.includes("?") ? "&" : "?"}jwt=${encodeURIComponent(token)}`;
}

export default function CandidateTakeRoundPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const roundId = Number(params.roundId);
  const [round, setRound] = useState<Round | null>(null);
  const [session, setSession] = useState<RoundSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [codeLang, setCodeLang] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [roundStarted, setRoundStarted] = useState(false);
  const [runResults, setRunResults] = useState<Record<number, { passed: number; failed: number; total: number; results: any[] }>>({});
  const [liveInfo, setLiveInfo] = useState<LiveInterviewInfo | null>(null);
  const [preJoinDone, setPreJoinDone] = useState(false);
  const [showReverifyModal, setShowReverifyModal] = useState(false);
  const [reverifyPhoto, setReverifyPhoto] = useState<string | null>(null);
  const [reverifySubmitting, setReverifySubmitting] = useState(false);
  const [reverifyError, setReverifyError] = useState<string | null>(null);
  const reverifyVideoRef = useRef<HTMLVideoElement | null>(null);
  const reverifyStreamRef = useRef<MediaStream | null>(null);
  const [preJoinCameraOk, setPreJoinCameraOk] = useState(false);
  const [preJoinMicOk, setPreJoinMicOk] = useState(false);
  const [preJoinError, setPreJoinError] = useState<string | null>(null);
  const preJoinStreamRef = useRef<MediaStream | null>(null);
  const preJoinVideoRef = useRef<HTMLVideoElement | null>(null);

  const [techConversation, setTechConversation] = useState<{ role: string; content: string }[]>([]);
  const [techCurrentQuestion, setTechCurrentQuestion] = useState("");
  const [techAnalysis, setTechAnalysis] = useState("");
  const [techResponse, setTechResponse] = useState("");
  const [techDone, setTechDone] = useState(false);
  const [techLoading, setTechLoading] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const recognitionRef = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null);
  const committedTranscriptRef = useRef("");
  const listeningRequestedRef = useRef(false);

  const { speak, isSpeaking, stop } = useTTS();

  const isTechRound = round?.type === "TECH_INTERVIEW";
  const isHRRound = round?.type === "HR_INTERVIEW";
  const isLiveRound = round?.type === "LIVE_INTERVIEW";
  const isVoiceRound = isTechRound || isHRRound;

  const proctoringEnabled =
    !loading &&
    (questions.length > 0 || isVoiceRound || isLiveRound) &&
    !submitted &&
    !techDone &&
    (!isVoiceRound || interviewStarted) &&
    (isVoiceRound || isLiveRound || roundStarted);
  const {
    strikes,
    disqualified,
    warningMessage,
    setWarningMessage,
    reportEvent,
    requestFullscreen,
    fullscreenRequested,
    cameraReady,
    cameraError,
    faceVisible,
    identityMatch,
    identityConfidence,
  } = useProctoring(id, roundId, proctoringEnabled, {
    suppressVoiceDetection: false,
  });

  const fetchRoundAndQuestions = useCallback(() => {
    if (!id || !roundId || !getToken()) {
      router.replace("/login");
      return;
    }
    setError(null);
    candidateApi
      .getRound(id, roundId)
      .then(async (r) => {
        setRound(r.data);
        if (r.data.type === "LIVE_INTERVIEW") {
          const liveRes = await candidateApi.liveInfo(roundId);
          setLiveInfo(liveRes.data);
          return;
        }
        try {
          const sessRes = await candidateApi.startRound(roundId);
          setSession(sessRes.data);
          if (sessRes.data.status === "submitted") {
            setSubmitted(true);
          }
        } catch (sessErr: any) {
          if (sessErr?.response?.status !== 400) {
            console.warn("Session start info:", sessErr?.response?.data?.detail);
          }
          const existingSess = await candidateApi.getRoundSession(roundId).catch(() => null);
          if (existingSess?.data) {
            setSession(existingSess.data);
            if (existingSess.data.status === "submitted") setSubmitted(true);
          }
        }
        if (r.data.type !== "HR_INTERVIEW" && r.data.type !== "TECH_INTERVIEW") {
          const q = await candidateApi.getRoundQuestions(id, roundId);
          setQuestions(q.data || []);
        }
      })
      .catch((e) => {
        if (e?.response?.status === 401) window.location.href = "/login";
        else if (e?.response?.status === 403) router.replace("/dashboard/candidate/verification?required=1");
        else setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));
  }, [id, roundId, router]);

  useEffect(() => {
    fetchRoundAndQuestions();
  }, [fetchRoundAndQuestions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const need = sessionStorage.getItem("hiremind_need_reverify") === "1";
    const justLoggedIn = sessionStorage.getItem("hiremind_just_logged_in") === "1";
    if (justLoggedIn) {
      sessionStorage.removeItem("hiremind_just_logged_in");
      sessionStorage.setItem("hiremind_need_reverify", "1");
    }
    if (need) setShowReverifyModal(true);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sessionStorage.setItem("hiremind_need_reverify", "1");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!showReverifyModal) return;
    let cancelled = false;
    let attachTimeout: ReturnType<typeof setTimeout> | null = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      reverifyStreamRef.current = stream;
      const attach = () => {
        const video = reverifyVideoRef.current;
        if (video && stream) { video.srcObject = stream; video.play().catch(() => {}); }
      };
      attach();
      attachTimeout = setTimeout(attach, 150);
    }).catch(() => setReverifyError("Camera access needed for re-verification."));
    return () => {
      cancelled = true;
      if (attachTimeout) clearTimeout(attachTimeout);
      reverifyStreamRef.current?.getTracks().forEach((t) => t.stop());
      reverifyStreamRef.current = null;
    };
  }, [showReverifyModal]);

  useEffect(() => {
    if (preJoinDone || loading || !round || isLiveRound) return;
    setPreJoinError(null);
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        preJoinStreamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        setPreJoinCameraOk(!!videoTrack);
        setPreJoinMicOk(!!audioTrack);
        const video = preJoinVideoRef.current;
        if (video) { video.srcObject = stream; video.play().catch(() => {}); }
      })
      .catch((err: { name?: string }) => {
        if (cancelled) return;
        const msg = err?.name === "NotAllowedError" ? "Camera and microphone access are required. Please allow and refresh." : "Could not access camera or microphone.";
        setPreJoinError(msg);
      });
    return () => {
      cancelled = true;
      preJoinStreamRef.current?.getTracks().forEach((t) => t.stop());
      preJoinStreamRef.current = null;
      setPreJoinCameraOk(false);
      setPreJoinMicOk(false);
    };
  }, [preJoinDone, loading, round, isLiveRound]);

  useEffect(() => {
    if (isLiveRound && liveInfo?.meeting_url && !document.fullscreenElement) {
      requestFullscreen();
    }
  }, [isLiveRound, liveInfo?.meeting_url, requestFullscreen]);

  const fetchFirstQuestion = useCallback(() => {
    if (!id || !roundId) return;
    setTechLoading(true);
    candidateApi
      .techInterviewTurn(id, roundId, { conversation: [], candidate_response: "" })
      .then((r) => {
        const q = r.data.question;
        setTechCurrentQuestion(q);
        setTechDone(r.data.done);
        if (q) speak(q);
      })
      .catch((e) => {
        if (e?.response?.status === 403) router.replace("/dashboard/candidate/verification?required=1");
        else setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to start"));
      })
      .finally(() => setTechLoading(false));
  }, [id, roundId, speak, router]);

  const techInitialized = useRef(false);
  useEffect(() => {
    if (!isVoiceRound || loading || !interviewStarted || techInitialized.current || techCurrentQuestion || techDone) return;
    techInitialized.current = true;
    fetchFirstQuestion();
  }, [isVoiceRound, loading, interviewStarted, techCurrentQuestion, techDone, fetchFirstQuestion]);

  const handleEnterFullscreenAndStart = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen()
        .then(() => {
          setInterviewStarted(true);
        })
        .catch(() => setInterviewStarted(true));
    } else {
      setInterviewStarted(true);
    }
  };

  useEffect(() => {
    if (proctoringEnabled && !document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
  }, [proctoringEnabled]);

  const handleEnterFullscreenAndStartAssessment = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen()
        .then(() => setRoundStarted(true))
        .catch(() => setRoundStarted(true));
    } else {
      setRoundStarted(true);
    }
  };

  const handleLeaveRound = () => {
    stop();
    if (typeof window !== "undefined") sessionStorage.setItem("hiremind_need_reverify", "1");
    reportEvent("logout", {});
    router.push("/dashboard/candidate");
  };

  const handleReverifyCapture = () => {
    const video = reverifyVideoRef.current;
    if (!video || !video.srcObject) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setReverifyPhoto(dataUrl.split(",")[1] || dataUrl);
    setReverifyError(null);
  };

  const handleReverifySubmit = async () => {
    if (!reverifyPhoto) return;
    setReverifySubmitting(true);
    setReverifyError(null);
    try {
      await candidateApi.reverifyPhoto(reverifyPhoto);
      sessionStorage.removeItem("hiremind_need_reverify");
      reverifyStreamRef.current?.getTracks().forEach((t) => t.stop());
      reverifyStreamRef.current = null;
      setShowReverifyModal(false);
      setReverifyPhoto(null);
    } catch (e: any) {
      setReverifyError(getApiErrorMessage(e?.response?.data?.detail, "Re-verification failed. Please try again."));
    } finally {
      setReverifySubmitting(false);
    }
  };

  const handlePreJoinJoin = () => {
    preJoinStreamRef.current?.getTracks().forEach((t) => t.stop());
    preJoinStreamRef.current = null;
    setPreJoinDone(true);
  };

  const handleTechSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const response = techResponse.trim();
    if (!response) return;
    setTechLoading(true);
    const newConv = [
      ...techConversation,
      { role: "assistant", content: techCurrentQuestion },
      { role: "user", content: response },
    ];
    candidateApi
      .techInterviewTurn(id, roundId, { conversation: newConv, candidate_response: response })
      .then((r) => {
        setTechConversation(newConv);
        setTechCurrentQuestion(r.data.question);
        setTechAnalysis(r.data.analysis);
        setTechResponse("");
        committedTranscriptRef.current = "";
        setTechDone(r.data.done);
        if (r.data.question) speak(r.data.question);
      })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to submit")))
      .finally(() => setTechLoading(false));
  };

  const micStreamRef = useRef<MediaStream | null>(null);
  const micRetryCount = useRef(0);
  const micRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_MIC_RETRIES = 5;

  const acquireMic = useCallback(async () => {
    if (micStreamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      return true;
    } catch {
      setError("Microphone permission denied. Please allow mic access in your browser and try again.");
      return false;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (recognitionRef.current) return;
    const ok = await acquireMic();
    if (!ok) return;
    listeningRequestedRef.current = true;

    const SR =
      typeof window !== "undefined"
        ? (window as Record<string, unknown>).SpeechRecognition ||
          (window as Record<string, unknown>).webkitSpeechRecognition
        : null;
    if (!SR) {
      setError("Speech recognition not supported. Use Chrome or Edge for mic input, or type your answer.");
      return;
    }
    try {
      const rec = new (SR as { new (): SpeechRecognition })();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";
      (rec as unknown as { maxAlternatives?: number }).maxAlternatives = 3;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        micRetryCount.current = 0;
        let interim = "";
        let committedAddition = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const len = (result as unknown as { length: number }).length || 0;
          let bestTranscript = (result[0] as { transcript?: string } | undefined)?.transcript ?? "";
          let bestConf = 0;
          for (let j = 0; j < len; j++) {
            const alt = (result[j] ?? result[0]) as { transcript: string; confidence?: number };
            if (!alt?.transcript) continue;
            const conf = typeof alt.confidence === "number" ? alt.confidence : 1;
            if (conf > bestConf) {
              bestConf = conf;
              bestTranscript = alt.transcript;
            }
          }
          if (result.isFinal) {
            if (bestTranscript.trim()) {
              committedAddition += `${bestTranscript.trim()} `;
            }
          } else {
            interim += `${bestTranscript.trim()} `;
          }
        }
        if (committedAddition.trim()) {
          committedTranscriptRef.current = `${committedTranscriptRef.current} ${committedAddition}`.replace(/\s+/g, " ").trim();
        }
        setTechResponse(
          [committedTranscriptRef.current, interim.trim()]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        );
      };

      rec.onerror = (ev: Event) => {
        const code = (ev as unknown as { error?: string }).error ?? "unknown";
        if (code === "aborted") return;

        if (code === "not-allowed") {
          setError("Microphone blocked by browser. Allow mic in site settings, then reload.");
          recognitionRef.current = null;
          setIsListening(false);
          return;
        }

        const RETRYABLE = ["network", "audio-capture", "no-speech", "service-not-allowed"];
        if (RETRYABLE.includes(code) && micRetryCount.current < MAX_MIC_RETRIES) {
          micRetryCount.current += 1;
          recognitionRef.current = null;
          setIsListening(false);
          const delay = Math.min(1000 * micRetryCount.current, 3000);
          setError(`Mic reconnecting… (attempt ${micRetryCount.current}/${MAX_MIC_RETRIES})`);
          micRetryTimer.current = setTimeout(() => {
            micRetryTimer.current = null;
            startListening();
          }, delay);
          return;
        }

        setError(`Mic error (${code}). Click the mic button to try again.`);
        recognitionRef.current = null;
        setIsListening(false);
      };

      rec.onend = () => {
        if (recognitionRef.current === rec) {
          recognitionRef.current = null;
          setIsListening(false);
        }
        if (listeningRequestedRef.current && !isSpeaking && !techDone && !techLoading) {
          micRetryTimer.current = setTimeout(() => {
            micRetryTimer.current = null;
            startListening();
          }, 150);
        }
      };

      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
      setError(null);
    } catch {
      setError("Could not start speech recognition. Try reloading the page.");
    }
  }, [acquireMic]);

  const stopListening = useCallback(() => {
    listeningRequestedRef.current = false;
    if (micRetryTimer.current) {
      clearTimeout(micRetryTimer.current);
      micRetryTimer.current = null;
    }
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) try { rec.stop(); } catch {}
    setIsListening(false);
  }, []);

  // Pause mic while AI is speaking, auto-resume when done
  useEffect(() => {
    if (isSpeaking && recognitionRef.current) {
      stopListening();
    }
  }, [isSpeaking, stopListening]);

  useEffect(() => {
    if (!isSpeaking && interviewStarted && isVoiceRound && !techDone && !techLoading) {
      micRetryCount.current = 0;
      startListening();
    }
  }, [isSpeaking, interviewStarted, isVoiceRound, techDone, techLoading, startListening]);

  // Request mic permission eagerly on interview start
  useEffect(() => {
    if (interviewStarted && isVoiceRound) {
      acquireMic();
    }
  }, [interviewStarted, isVoiceRound, acquireMic]);

  // Mic level for waveform when listening
  useEffect(() => {
    if (!isListening) {
      setMicLevel(0);
      return;
    }
    const stream = micStreamRef.current;
    if (!stream) return;
    let cancelled = false;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      setMicLevel(Math.min(1, avg / 128));
      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelled = true;
      ctx.close();
    };
  }, [isListening]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (micRetryTimer.current) clearTimeout(micRetryTimer.current);
      listeningRequestedRef.current = false;
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) try { rec.abort(); } catch {}
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    };
  }, []);

  const handleSaveAnswer = async (questionId: number, contentOverride?: string, languageOverride?: string) => {
    try {
      await candidateApi.submitAnswer(roundId, {
        question_id: questionId,
        content: contentOverride ?? answers[questionId] ?? "",
        language: languageOverride ?? codeLang[questionId] ?? undefined,
      });
    } catch (e: any) {
      console.warn("Save answer failed:", e?.response?.data?.detail);
    }
  };

  const handleRunCode = async (questionId: number) => {
    const code = answers[questionId] || "";
    const lang = codeLang[questionId] || "python";
    if (!code.trim()) return;
    try {
      const res = await candidateApi.runCode(roundId, { question_id: questionId, code, language: lang });
      setRunResults((prev) => ({ ...prev, [questionId]: res.data }));
      setError(null);
    } catch (e: any) {
      setError(getApiErrorMessage(e?.response?.data?.detail, "Code execution failed"));
    }
  };

  const handleCodeEditorKeyDown = (questionId: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const value = answers[questionId] ?? "";
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const indent = "    ";

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        if (value.slice(lineStart, lineStart + indent.length) === indent) {
          const nextValue = value.slice(0, lineStart) + value.slice(lineStart + indent.length);
          setAnswers((prev) => ({ ...prev, [questionId]: nextValue }));
          requestAnimationFrame(() => {
            const nextPos = Math.max(lineStart, start - indent.length);
            textarea.setSelectionRange(nextPos, nextPos);
          });
        }
        return;
      }
      const nextValue = value.slice(0, start) + indent + value.slice(end);
      setAnswers((prev) => ({ ...prev, [questionId]: nextValue }));
      requestAnimationFrame(() => {
        const nextPos = start + indent.length;
        textarea.setSelectionRange(nextPos, nextPos);
      });
      return;
    }

    if (e.key === "Enter") {
      const currentLanguage = codeLang[questionId] || "python";
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const currentLine = value.slice(lineStart, start);
      const currentIndent = currentLine.match(/^\s*/)?.[0] ?? "";
      const extraIndent = currentLanguage === "python" && /:\s*$/.test(currentLine) ? indent : "";
      e.preventDefault();
      const insertion = `\n${currentIndent}${extraIndent}`;
      const nextValue = value.slice(0, start) + insertion + value.slice(end);
      setAnswers((prev) => ({ ...prev, [questionId]: nextValue }));
      requestAnimationFrame(() => {
        const nextPos = start + insertion.length;
        textarea.setSelectionRange(nextPos, nextPos);
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disqualified) return;
    setSubmitting(true);
    try {
      for (const q of questions) {
        if (answers[q.id]) {
          await candidateApi.submitAnswer(roundId, {
            question_id: q.id,
            content: answers[q.id],
            language: codeLang[q.id] || undefined,
          });
        }
      }
      const result = await candidateApi.submitRound(roundId);
      setSession((prev) => prev ? { ...prev, ...result.data } : prev);
      setSubmitted(true);
    } catch (e: any) {
      await candidateApi.submitResponses(id, roundId, questions.map((q) => ({ question_id: q.id, content: answers[q.id] || "" })))
        .then(() => setSubmitted(true))
        .catch((err) => setError(getApiErrorMessage(err?.response?.data?.detail, "Submit failed")));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !round) return <div className="p-4 text-slate-400">Loading...</div>;

  if (isLiveRound) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-center p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
          <h1 className="text-2xl font-semibold text-white">Live Interview</h1>
          <p className="mt-2 text-sm text-slate-400">
            This round is conducted as a live human interview over Jitsi.
          </p>
          {liveInfo?.meeting_url ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-green-400">Your interviewer has started the meeting. The meeting is embedded below.</p>
              <button
                type="button"
                onClick={requestFullscreen}
                className="inline-flex rounded-lg border border-sky-700 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-950/40"
              >
                Enter Fullscreen
              </button>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-300">
                <p>Room: <span className="text-white">{liveInfo.room_name}</span></p>
                <p>Provider: <span className="text-white">{liveInfo.jitsi_domain}</span></p>
              </div>
              <iframe
                src={buildMeetingSrc(liveInfo.meeting_url, liveInfo.jitsi_jwt)}
                title="Candidate live interview meeting"
                allow="camera; microphone; fullscreen; display-capture"
                className="h-[72vh] w-full rounded-lg border border-slate-800 bg-slate-900"
              />
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-amber-800/50 bg-amber-950/30 p-4 text-sm text-amber-200">
              {liveInfo?.message || "Waiting for the interviewer to start the meeting."}
            </div>
          )}
        </div>
      </main>
    );
  }

  if (submitted || (isVoiceRound && techDone)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="rounded-xl border border-sky-800 bg-sky-950/40 p-6 text-center space-y-3">
          <p className="text-sky-200 text-lg font-medium">
            {isVoiceRound && techDone ? "Voice interview completed. Thank you." : "Round submitted successfully!"}
          </p>
          {session?.total_score != null && (
            <p className="text-white text-2xl font-bold">
              Score: {session.total_score} / {session.max_possible_score || "?"}
            </p>
          )}
        </div>
        <Link href="/dashboard/candidate" className="mt-6 text-sky-400 hover:underline">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  if (showReverifyModal) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h1 className="text-xl font-semibold text-white">Re-verify your identity</h1>
          <p className="mt-2 text-sm text-slate-400">
            You left or switched tabs. Take a new photo to match with your ID and continue.
          </p>
          <div className="mt-6">
            {!reverifyPhoto ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-800">
                <video
                  ref={reverifyVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-32 w-32 rounded-full border-2 border-dashed border-violet-500/70" />
                </div>
              </div>
            ) : (
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-slate-800">
                <img src={`data:image/jpeg;base64,${reverifyPhoto}`} alt="Captured" className="h-full w-full object-cover" />
              </div>
            )}
          </div>
          {reverifyError && <p className="mt-3 text-sm text-red-400">{reverifyError}</p>}
          <div className="mt-6 flex gap-3">
            {!reverifyPhoto ? (
              <button
                type="button"
                onClick={handleReverifyCapture}
                disabled={!reverifyStreamRef.current}
                className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                Capture photo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setReverifyPhoto(null)}
                  className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleReverifySubmit}
                  disabled={reverifySubmitting}
                  className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {reverifySubmitting ? "Verifying…" : "Submit & continue"}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!preJoinDone && !loading && round && !isLiveRound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h1 className="text-xl font-semibold text-white">Check your camera & microphone</h1>
          <p className="mt-2 text-sm text-slate-400">
            Before joining, make sure your camera and mic work. You’ll need them for this round.
          </p>
          <div className="mt-6 aspect-video w-full overflow-hidden rounded-lg bg-slate-800">
            <video
              ref={preJoinVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mt-4 flex gap-4 text-sm">
            <span className={preJoinCameraOk ? "text-green-400" : "text-amber-400"}>
              {preJoinCameraOk ? "✓ Camera" : "○ Camera"}
            </span>
            <span className={preJoinMicOk ? "text-green-400" : "text-amber-400"}>
              {preJoinMicOk ? "✓ Microphone" : "○ Microphone"}
            </span>
          </div>
          {preJoinError && <p className="mt-3 text-sm text-red-400">{preJoinError}</p>}
          <button
            type="button"
            onClick={handlePreJoinJoin}
            disabled={!preJoinCameraOk}
            className="mt-6 w-full rounded-xl bg-indigo-600 py-4 text-lg font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Join
          </button>
        </div>
      </main>
    );
  }

  if (isVoiceRound && !interviewStarted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-lg space-y-8 text-center">
          <h1 className="text-3xl font-semibold text-white">AI Interview</h1>
          <div className="flex justify-center">
            <AvatarWithWaveform isSpeaking={false} />
          </div>
          <p className="text-slate-300">
            You&apos;re about to have a voice conversation with our AI interviewer. Speak naturally—your microphone will
            activate when you tap the mic button after each question.
          </p>
          <ul className="list-inside list-disc space-y-2 text-left text-sm text-slate-400">
            <li>The interview will be in fullscreen mode with proctoring active</li>
            <li>The AI interviewer will speak questions to you (captions shown)</li>
            <li>Speak clearly in a quiet place so your words are captured accurately</li>
            <li>Tap the mic button to speak, or type your answer and press Send</li>
          </ul>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={handleEnterFullscreenAndStart}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-4 text-lg font-medium text-white hover:bg-indigo-500"
          >
            <span className="text-xl">⛶</span>
            Enter Fullscreen & Start Interview
          </button>
        </div>
      </main>
    );
  }

  if (isVoiceRound) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-950">
        {disqualified && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95">
            <div className="mx-4 max-w-md rounded-xl border border-red-800 bg-slate-900 p-6 text-center">
              <h2 className="text-xl font-semibold text-red-400">Disqualified</h2>
              <p className="mt-2 text-sm text-slate-300">You exceeded 3 warnings and have been disqualified from this round.</p>
              <button
                type="button"
                onClick={() => router.push("/dashboard/candidate")}
                className="mt-4 rounded bg-slate-600 px-4 py-2 text-sm text-white"
              >
                Return to dashboard
              </button>
            </div>
          </div>
        )}

        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-medium text-white">AI Interviewer</span>
            <span className={`h-2 w-2 rounded-full ${isSpeaking ? "bg-red-500 animate-pulse" : "bg-green-500"}`} />
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                cameraReady ? "bg-green-900/60 text-green-300" : cameraError ? "bg-red-900/60 text-red-300" : "bg-slate-700 text-slate-400"
              }`}
            >
              <span className="text-[10px]">📷</span>
              {cameraReady ? "Camera OK" : cameraError ? "Camera Required" : "Camera…"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                faceVisible === true ? "bg-green-900/60 text-green-300" : faceVisible === false ? "bg-red-900/60 text-red-300" : "bg-slate-700 text-slate-400"
              }`}
            >
              <span className="text-[10px]">👁</span>
              {faceVisible === true ? "Face OK" : faceVisible === false ? "No Face" : "—"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                identityMatch === true ? "bg-green-900/60 text-green-300" : identityMatch === false ? "bg-red-900/60 text-red-300" : "bg-slate-700 text-slate-400"
              }`}
            >
              <span className="text-[10px]">🪪</span>
              {identityMatch === true ? `Identity OK${identityConfidence != null ? ` ${Math.round(identityConfidence * 100)}%` : ""}` : identityMatch === false ? "Identity Mismatch" : "Identity…"}
            </span>
            <button type="button" onClick={handleLeaveRound} className="text-sm text-slate-400 hover:text-white">
              Leave
            </button>
          </div>
        </header>

        {warningMessage && !disqualified && (
          <div className="flex items-center justify-between border-b border-amber-800/50 bg-amber-950/30 px-4 py-2 text-amber-200">
            <span className="text-sm">⚠ {warningMessage}</span>
            <button type="button" onClick={() => setWarningMessage(null)} className="text-amber-400 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
          <AvatarWithWaveform isSpeaking={isSpeaking} isListening={isListening} micLevel={micLevel} />
          <div className="mt-8 w-full max-w-2xl">
            <p className="min-h-[4rem] text-center text-lg text-white">
              {techCurrentQuestion || (techLoading ? "Loading first question…" : "—")}
            </p>
            <p className="mt-2 text-center text-sm">
              {isSpeaking ? (
                <span className="text-indigo-400">SPEAKING…</span>
              ) : techLoading ? (
                <span className="text-slate-500">…</span>
              ) : (
                <>
                  <span className="text-green-500/90">LISTENING</span>
                  <span className="mx-1.5 text-slate-500">—</span>
                  <span className="text-green-400 font-medium">SPEAK NOW</span>
                </>
              )}
            </p>
            {techCurrentQuestion && !techLoading && (
              <button
                type="button"
                onClick={() => speak(techCurrentQuestion)}
                className="mx-auto mt-2 block text-xs text-indigo-400 hover:underline"
              >
                Replay question
              </button>
            )}
          </div>
          {techAnalysis && (
            <p className="mt-4 max-w-xl text-center text-sm text-amber-200/90">Feedback: {techAnalysis}</p>
          )}
        </div>

        <div className="border-t border-slate-800 px-4 py-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            {error && <p className="w-full text-center text-sm text-red-400">{error}</p>}
            {/* Heard: live transcript (reference-style) */}
            <div className="w-full">
              <div className="rounded-lg border border-green-800/60 bg-green-950/40 px-4 py-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-green-400/90">Heard:</p>
                <p className="min-h-[2.5rem] text-sm text-green-100 whitespace-pre-wrap">
                  {techResponse || (isListening ? "…" : "")}
                </p>
              </div>
            </div>
            <div className="flex w-full items-end gap-3">
              <button
                type="button"
                onClick={() => { if (isListening) stopListening(); else startListening(); }}
                disabled={techLoading || techDone || isSpeaking}
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isListening
                    ? "bg-red-600 hover:bg-red-500 ring-4 ring-red-500/40 animate-pulse"
                    : "bg-green-600 hover:bg-green-500"
                } text-white disabled:opacity-50`}
                title={isSpeaking ? "Wait for AI to finish speaking" : isListening ? "Stop listening" : "Tap to speak"}
              >
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
                </svg>
              </button>
              <form onSubmit={handleTechSubmit} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <textarea
                  placeholder="Type your answer or use the mic"
                  value={techResponse}
                  onChange={(e) => setTechResponse(e.target.value)}
                  className="min-h-[44px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500"
                  readOnly={techLoading || techDone}
                  rows={2}
                />
                <button
                  type="submit"
                  disabled={techLoading || !techResponse.trim() || techDone}
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>
            <p className="text-xs text-slate-500">Speak clearly in a quiet place. What you say appears in &quot;Heard&quot; above. Edit if needed, then press Send.</p>
          </div>
        </div>
      </main>
    );
  }

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;

  if (!isVoiceRound && !isLiveRound && !roundStarted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <h1 className="text-3xl font-semibold text-white">Assessment Monitoring</h1>
          <p className="text-sm text-slate-300">
            This round requires fullscreen mode and continuous camera monitoring. The person attending will be checked against the verified candidate photo.
          </p>
          <ul className="list-inside list-disc space-y-2 text-left text-sm text-slate-400">
            <li>Leaving fullscreen counts as a warning</li>
            <li>Camera access is compulsory for aptitude and coding rounds</li>
            <li>The face in camera must match the verified candidate</li>
            <li>Tab switch, phone detection, and multiple faces are monitored</li>
          </ul>
          <button
            type="button"
            onClick={handleEnterFullscreenAndStartAssessment}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-4 text-lg font-medium text-white hover:bg-indigo-500"
          >
            <span className="text-xl">⛶</span>
            Enter Fullscreen & Start Round
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-8 p-4">
      {disqualified && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95">
          <div className="mx-4 max-w-md rounded-xl border border-red-800 bg-slate-900 p-6 text-center">
            <h2 className="text-xl font-semibold text-red-400">Disqualified</h2>
            <p className="mt-2 text-slate-300">You exceeded 3 warnings and have been disqualified from this round.</p>
            <button
              type="button"
              onClick={() => router.push("/dashboard/candidate")}
              className="mt-4 rounded bg-slate-600 px-4 py-2 text-sm text-white"
            >
              Return to dashboard
            </button>
          </div>
        </div>
      )}
      {warningMessage && !disqualified && (
        <div className="flex items-center justify-between rounded-lg border border-amber-700 bg-amber-950/50 px-4 py-3 text-amber-200">
          <span className="text-sm">⚠ {warningMessage}</span>
          <button type="button" onClick={() => setWarningMessage(null)} className="text-amber-400 hover:underline">
            Dismiss
          </button>
        </div>
      )}
      <header className="flex items-center justify-between">
        <button type="button" onClick={handleLeaveRound} className="text-sky-400 hover:underline">
          ← Leave round
        </button>
        <h1 className="text-2xl font-semibold">{round?.type ? `${round.type} — Order ${round.order}` : `Round ${roundId}`}</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {proctoringEnabled && (
            <span className={`text-sm ${strikes >= 3 ? "text-red-400 font-semibold" : "text-slate-400"}`}>
              Warnings: {strikes}/3{strikes >= 3 && " — FINAL"}
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-xs ${cameraReady ? "bg-green-900/60 text-green-300" : cameraError ? "bg-red-900/60 text-red-300" : "bg-slate-700 text-slate-300"}`}>
            {cameraReady ? "Camera OK" : cameraError ? "Camera Required" : "Camera…"}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs ${faceVisible === true ? "bg-green-900/60 text-green-300" : faceVisible === false ? "bg-red-900/60 text-red-300" : "bg-slate-700 text-slate-300"}`}>
            {faceVisible === true ? "Face OK" : faceVisible === false ? "No Face" : "Checking Face"}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs ${identityMatch === true ? "bg-green-900/60 text-green-300" : identityMatch === false ? "bg-red-900/60 text-red-300" : "bg-slate-700 text-slate-300"}`}>
            {identityMatch === true ? `Identity OK${identityConfidence != null ? ` ${Math.round(identityConfidence * 100)}%` : ""}` : identityMatch === false ? "Identity Mismatch" : "Identity Check"}
          </span>
        </div>
      </header>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {cameraError && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Camera monitoring is mandatory for this round. {cameraError}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            {(() => {
              const questionType = (q.type || "").toLowerCase();
              const mcqOptions = questionType === "mcq" ? parseMcqOptions(q) : [];
              return (
                <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-300">
                Question {idx + 1}
                <span className="ml-2 text-xs text-slate-500">({questionType || q.type})</span>
                {q.max_score && <span className="ml-2 text-xs text-sky-400">[{q.max_score} pts]</span>}
              </p>
              {q.difficulty && <span className="text-xs text-amber-400">{q.difficulty}</span>}
            </div>
            <p className="mb-3 whitespace-pre-wrap text-slate-200">{q.content}</p>

            {/* MCQ Options */}
            {questionType === "mcq" && mcqOptions.length > 0 && (
              <div className="mb-3 space-y-2">
                {mcqOptions.map(([key, val]) => (
                  <label key={key} className="flex items-center gap-2 rounded border border-slate-700 px-3 py-2 cursor-pointer hover:bg-slate-800/50">
                    <input type="radio" name={`q-${q.id}`} value={key}
                      checked={answers[q.id] === key}
                      onChange={() => {
                        setAnswers((a) => ({ ...a, [q.id]: key }));
                        handleSaveAnswer(q.id, key);
                      }}
                      disabled={disqualified} />
                    <span className="text-sm text-white"><strong>{key}.</strong> {val as string}</span>
                  </label>
                ))}
              </div>
            )}
            {questionType === "mcq" && mcqOptions.length === 0 && (
              <p className="mb-3 text-sm text-amber-300">Options are missing for this MCQ. Regenerate or update the question.</p>
            )}

            {/* Coding */}
            {questionType === "coding" && (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <select value={codeLang[q.id] || "python"}
                    onChange={(e) => setCodeLang((l) => ({ ...l, [q.id]: e.target.value }))}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs">
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                  </select>
                  <button type="button" onClick={() => handleRunCode(q.id)}
                    className="rounded bg-green-700 px-3 py-1 text-xs text-white hover:bg-green-600">
                    Run Code
                  </button>
                  <button type="button" onClick={() => handleSaveAnswer(q.id)}
                    className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600">
                    Save
                  </button>
                </div>
                <textarea
                  placeholder="Write your code here..."
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  onKeyDown={handleCodeEditorKeyDown(q.id)}
                  onBlur={() => handleSaveAnswer(q.id)}
                  className="min-h-[220px] w-full rounded border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm leading-6 [tab-size:4]"
                  readOnly={disqualified} spellCheck={false} />
                {runResults[q.id] && (
                  <div className="rounded border border-slate-700 bg-slate-900/80 p-3 text-xs">
                    <p className={runResults[q.id].failed === 0 ? "text-green-400" : "text-amber-400"}>
                      Test Results: {runResults[q.id].passed}/{runResults[q.id].total} passed
                    </p>
                    {runResults[q.id].results.map((r: any, i: number) => (
                      <div key={i} className={`mt-1 ${r.passed ? "text-green-400" : "text-red-400"}`}>
                        Test {i + 1}: {r.passed ? "PASS" : "FAIL"}
                        {r.error && <span className="text-slate-400 ml-2">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {q.test_cases?.public && q.test_cases.public.length > 0 && (
                  <div className="rounded border border-slate-700 bg-slate-900/50 p-2 text-xs text-slate-400">
                    <p className="font-medium text-slate-300 mb-1">Sample Test Cases:</p>
                    {q.test_cases.public.slice(0, 3).map((tc, i) => (
                      <div key={i}>Input: <code>{tc.input}</code> → Expected: <code>{tc.expected}</code></div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Text/Short Answer */}
            {questionType !== "mcq" && questionType !== "coding" && (
              <textarea
                placeholder="Your answer"
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                onBlur={() => handleSaveAnswer(q.id)}
                className="min-h-[100px] w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                readOnly={disqualified} />
            )}
                </>
              );
            })()}
          </div>
        ))}
        <button
          type="submit"
          disabled={submitting || !questions.length || disqualified}
          className="rounded bg-sky-600 px-6 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {submitting ? "Submitting & Grading..." : "Submit Round"}
        </button>
      </form>
    </main>
  );
}
