"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { proctoringApi } from "../lib/api";

export type ProctoringEventType =
  | "tab_switch"
  | "fullscreen_exit"
  | "face_not_visible_10s"
  | "external_voice"
  | "logout"
  | "phone_detected"
  | "multiple_faces"
  | "identity_mismatch";

interface ProctoringOptions {
  suppressVoiceDetection?: boolean;
}

export function useProctoring(
  interviewId: number,
  roundId: number,
  enabled: boolean,
  options: ProctoringOptions = {}
) {
  const [strikes, setStrikes] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [fullscreenRequested, setFullscreenRequested] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceVisible, setFaceVisible] = useState<boolean | null>(null);
  const [identityMatch, setIdentityMatch] = useState<boolean | null>(null);
  const [identityConfidence, setIdentityConfidence] = useState<number | null>(null);
  const faceNotVisibleSince = useRef<number | null>(null);
  const identityMismatchSince = useRef<number | null>(null);
  const lastPhoneReport = useRef<number>(0);
  const lastMultipleFacesReport = useRef<number>(0);
  const voiceAboveThresholdSince = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const reportEvent = useCallback(
    (type: ProctoringEventType, data?: object) => {
      if (!enabled || disqualified) return;
      proctoringApi
        .submitEvent(interviewId, roundId, type, data)
        .then((r) => {
          setStrikes(r.data.strikes);
          setDisqualified(r.data.disqualified);
          const s = r.data.strikes;
          setWarningMessage(
            r.data.disqualified
              ? "You have been disqualified for exceeding 3 warnings."
              : s === 3
              ? `⚠ FINAL WARNING (${s}/3): ${type.replace(/_/g, " ")}. Next violation = disqualification.`
              : `Warning ${s}/3: ${type.replace(/_/g, " ")}.`
          );
        })
        .catch(() => {});
    },
    [enabled, interviewId, roundId, disqualified]
  );

  // Poll status on mount and when enabled
  useEffect(() => {
    if (!enabled || !interviewId || !roundId) return;
    proctoringApi
      .getStatus(interviewId, roundId)
      .then((r) => {
        setStrikes(r.data.strikes);
        setDisqualified(r.data.disqualified);
      })
      .catch(() => {});
  }, [enabled, interviewId, roundId]);

  // Tab switch
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        reportEvent("tab_switch", { visibility: "hidden" });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, reportEvent]);

  // Fullscreen exit
  useEffect(() => {
    if (!enabled) return;
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        reportEvent("fullscreen_exit", {});
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, [enabled, reportEvent]);

  // Webcam: request stream and capture frames for Claude Vision
  useEffect(() => {
    if (!enabled || disqualified) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    const canvas = document.createElement("canvas");
    videoRef.current = video;
    canvasRef.current = canvas;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().then(() => {
            setCameraReady(true);
            setCameraError(null);
          }).catch(() => {});
        };
      })
      .catch((err: { name?: string } | undefined) => {
        setCameraReady(false);
        setCameraError(
          err?.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access."
            : "Camera monitoring is required for this round."
        );
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      videoRef.current = null;
      canvasRef.current = null;
      setCameraReady(false);
      setIdentityMatch(null);
      setIdentityConfidence(null);
    };
  }, [enabled, disqualified]);

  // Face monitoring: every 3s capture frame, call analyze-frame, track face_visible 10s and phone/multiple_faces
  useEffect(() => {
    if (!enabled || disqualified || !cameraReady) return;
    const interval = 3000;
    const tenSec = 10000;
    const mismatchMs = 6000;
    const debounce = 15000; // don't report same phone/multiple_faces more than once per 15s
    let tid: ReturnType<typeof setInterval> | null = null;

    const run = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || v.readyState < 2) return;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      const dataUrl = c.toDataURL("image/jpeg", 0.7);
      const base64 = dataUrl.split(",")[1] || dataUrl;
      proctoringApi
        .analyzeFrame(base64)
        .then((r) => {
          const { face_visible, phone_detected, multiple_faces, identity_match, identity_confidence } = r.data;
          setFaceVisible(face_visible);
          setIdentityMatch(identity_match ?? null);
          setIdentityConfidence(typeof identity_confidence === "number" ? identity_confidence : null);
          const now = Date.now();
          if (!face_visible) {
            if (faceNotVisibleSince.current == null) faceNotVisibleSince.current = now;
            if (now - (faceNotVisibleSince.current || 0) >= tenSec) {
              reportEvent("face_not_visible_10s", {});
              faceNotVisibleSince.current = null;
            }
          } else {
            faceNotVisibleSince.current = null;
          }
          if (phone_detected && now - lastPhoneReport.current > debounce) {
            lastPhoneReport.current = now;
            reportEvent("phone_detected", {});
          }
          if (multiple_faces && now - lastMultipleFacesReport.current > debounce) {
            lastMultipleFacesReport.current = now;
            reportEvent("multiple_faces", {});
          }
          if (identity_match === false) {
            if (identityMismatchSince.current == null) identityMismatchSince.current = now;
            if (now - (identityMismatchSince.current || 0) >= mismatchMs) {
              reportEvent("identity_mismatch", { confidence: identity_confidence ?? null });
              identityMismatchSince.current = null;
            }
          } else {
            identityMismatchSince.current = null;
          }
        })
        .catch(() => {});
    };

    tid = setInterval(run, interval);
    return () => {
      if (tid) clearInterval(tid);
    };
  }, [enabled, disqualified, cameraReady, reportEvent]);

  // Voice activity: Web Audio API – sustained high volume = possible external voice
  useEffect(() => {
    if (!enabled || disqualified || options.suppressVoiceDetection) return;
    let cancelled = false;
    let voiceStream: MediaStream | null = null;
    const threshold = 0.06;
    const sustainMs = 6000;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        voiceStream = stream;
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        src.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const n = (data[i] - 128) / 128;
            sum += n * n;
          }
          const rms = Math.sqrt(sum / data.length);
          const now = Date.now();
          if (rms > threshold) {
            if (voiceAboveThresholdSince.current == null) voiceAboveThresholdSince.current = now;
            if (now - (voiceAboveThresholdSince.current || 0) >= sustainMs) {
              reportEvent("external_voice", { rms, duration_ms: sustainMs });
              voiceAboveThresholdSince.current = null;
            }
          } else {
            voiceAboveThresholdSince.current = null;
          }
          animationRef.current = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      analyserRef.current = null;
      voiceStream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, disqualified, reportEvent, options.suppressVoiceDetection]);

  const requestFullscreen = useCallback(() => {
    if (fullscreenRequested || !enabled) return;
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().then(() => setFullscreenRequested(true)).catch(() => {});
    }
  }, [enabled, fullscreenRequested]);

  return {
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
  };
}
