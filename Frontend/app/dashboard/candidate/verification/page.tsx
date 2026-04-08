"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { candidateApi, clearToken, getApiErrorMessage, getToken } from "@/lib/api";

type Step = "id" | "photo" | "resume";

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: "id", label: "ID Proof", icon: "🪪" },
  { key: "photo", label: "Photo", icon: "📷" },
  { key: "resume", label: "Resume", icon: "📄" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function CandidateVerificationPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("id");
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof candidateApi.getVerification>>["data"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [videoDevices, setVideoDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);

  const loadVerification = useCallback(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    candidateApi
      .getVerification()
      .then((r) => {
        setVerification(r.data ?? null);
        setError(null);
      })
      .catch((e) => {
        if (e?.response?.status === 401) {
          clearToken();
          window.location.href = "/login";
          return;
        }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadVerification();
  }, [loadVerification]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoReady(false);
    setCameraStarted(false);
    setCameraLoading(false);
  }, []);

  const startCamera = useCallback(async (deviceId?: string | null) => {
    setError(null);
    setRetryCountdown(0);
    setCameraLoading(true);

    const releaseStream = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported. Use Chrome or Edge.");
      setCameraLoading(false);
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext && window.location?.protocol !== "https:" && !/^localhost$|^127\.0\.0\.1$/.test(window.location?.hostname || "")) {
      setError("Camera requires HTTPS or localhost.");
      setCameraLoading(false);
      return;
    }

    let stream: MediaStream | null = null;
    let lastErr: unknown = null;

    // First try: no release, no delay – just request (keeps user gesture)
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        deviceId ? { video: { deviceId: { exact: deviceId } }, audio: false } : { video: true, audio: false }
      );
    } catch (err) {
      lastErr = err;
      releaseStream();
      const delays = [800, 2000, 3500];
      for (let i = 0; i < 3 && !stream; i++) {
        await new Promise((r) => setTimeout(r, delays[i]));
        releaseStream();
        try {
          stream = await navigator.mediaDevices.getUserMedia(
            i === 2 ? { video: true, audio: false } : { video: { width: { max: 640 }, height: { max: 480 } }, audio: false }
          );
        } catch (e) {
          lastErr = e;
        }
      }
    }

    if (!stream) {
      const name = (lastErr as { name?: string } | null)?.name ?? "";
      setError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Camera blocked. Allow camera in the address bar (lock icon), then refresh and try again."
          : name === "NotFoundError"
            ? "No camera found. Connect a webcam and try again."
            : "Camera could not open. Refresh the page and click Open Webcam again, or try Chrome."
      );
      setCameraLoading(false);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
      setVideoDevices(inputs);
      const currentId = stream.getVideoTracks()[0]?.getSettings?.()?.deviceId;
      if (currentId && !deviceId) setSelectedDeviceId(currentId);
    } catch {
      setVideoDevices([]);
    }

    setVideoReady(false);
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      video.play().then(() => setVideoReady(true)).catch(() => setVideoReady(true));
    }
    setCameraStarted(true);
    setCameraLoading(false);
  }, []);

  useEffect(() => {
    if (step !== "photo") {
      stopCamera();
    }
  }, [step, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  // When landing on Photo step with camera not open, release any stale stream so Open Webcam starts clean
  useEffect(() => {
    if (step === "photo" && !cameraStarted) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }, [step, cameraStarted]);

  const handleWaitAndRetry = useCallback(() => {
    setRetryCountdown(3);
  }, []);

  useEffect(() => {
    if (retryCountdown !== 3) return;
    const t = setInterval(() => {
      setRetryCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          startCamera(selectedDeviceId ?? undefined);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [retryCountdown, startCamera, selectedDeviceId]);

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB");
      return;
    }
    setIdFile(f);
    const url = URL.createObjectURL(f);
    setIdPreview(url);
    setError(null);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) {
      setError("Camera not ready. Please wait for the video to appear.");
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setError("Camera still loading. Wait a second and try again.");
      return;
    }
    // Capture center region to match the face outline (object-fit: cover center)
    const size = Math.min(w, h);
    const sx = (w - size) / 2;
    const sy = (h - size) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Could not capture image.");
      return;
    }
    // Mirror so capture matches what user sees in preview (front camera)
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setPhotoDataUrl(dataUrl);
      setError(null);
    } catch {
      setError("Capture failed. Try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let idProofBase64: string | undefined;
      let photoBase64: string | undefined;
      let resumeBase64: string | undefined;
      if (idFile) {
        idProofBase64 = await fileToBase64(idFile);
      }
      if (photoDataUrl) {
        photoBase64 = photoDataUrl;
      }
      if (resumeFile) {
        resumeBase64 = await fileToBase64(resumeFile);
      }
      if (!idProofBase64 || !photoBase64) {
        setError("Please complete ID Proof and Photo steps (upload ID and capture your photo).");
        setSubmitting(false);
        return;
      }
      await candidateApi.submitVerification({
        id_proof_base64: idProofBase64,
        photo_base64: photoBase64,
        resume_url: resumeUrl.trim() || undefined,
        resume_base64: resumeBase64,
      });
      await loadVerification();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: unknown } } };
      setError(getApiErrorMessage(err?.response?.data?.detail, "Verification failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const faceMatch = verification?.ocr_data?.face_match;
  const idNameCheck = verification?.ocr_data?.id_name_check as
    | { expected_name?: string; extracted_name?: string | null; checked?: boolean; match?: boolean | null }
    | undefined;
  const isApproved = verification?.status === "approved";
  const verificationRequired = searchParams.get("required") === "1";

  if (loading) return <div className="p-4 text-white/70">Loading...</div>;

  const idOnFile = !!verification?.id_proof_url;
  const photoOnFile = !!verification?.photo_url;
  const resumeOnFile = !!verification?.resume_url;

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6 md:p-8">
      <header>
        <h1 className="text-2xl font-bold text-white">Identity Verification</h1>
        {verificationRequired && (
          <p className="mt-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80">
            Verification is required before entering rounds. Please complete ID, Photo capture, and Resume here.
          </p>
        )}
        <p className="mt-1 text-white/70">
          {verification?.id_proof_url && verification?.resume_url
            ? "Your ID and resume are on file. Please take a new photo to verify your identity for this interview."
            : "Complete the steps below to verify your identity and access interview rounds."}
        </p>
      </header>

      {/* Step blocks: ID Proof, Photo, Resume */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setStep("id")}
          className={`flex flex-col items-center justify-center rounded-xl border px-4 py-5 text-center transition ${
            step === "id"
              ? "border-white/20 bg-white/10 text-white"
              : idOnFile
                ? "border-white/20 bg-white/5 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20"
          }`}
        >
          {idOnFile ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">✓</span>
          ) : (
            <span className="text-2xl">🪪</span>
          )}
          <span className="mt-2 font-medium">ID Proof</span>
          <span className="mt-1 text-xs text-white/60">{idOnFile ? "On file" : "Required"}</span>
        </button>
        <button
          type="button"
          onClick={() => setStep("photo")}
          className={`flex flex-col items-center justify-center rounded-xl border px-4 py-5 text-center transition ${
            step === "photo"
              ? "border-white/20 bg-white/10 text-white"
              : photoOnFile
                ? "border-white/20 bg-white/5 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20"
          }`}
        >
          {photoOnFile ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">✓</span>
          ) : (
            <svg className="h-8 w-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 13v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7" />
            </svg>
          )}
          <span className="mt-2 font-medium">Photo</span>
          <span className="mt-1 text-xs text-white/60">{photoOnFile ? "On file" : "Required"}</span>
        </button>
        <button
          type="button"
          onClick={() => setStep("resume")}
          className={`flex flex-col items-center justify-center rounded-xl border px-4 py-5 text-center transition ${
            step === "resume"
              ? "border-white/20 bg-white/10 text-white"
              : resumeOnFile
                ? "border-white/20 bg-white/5 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20"
          }`}
        >
          {resumeOnFile ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">✓</span>
          ) : (
            <span className="text-2xl">📄</span>
          )}
          <span className="mt-2 font-medium">Resume</span>
          <span className="mt-1 text-xs text-white/60">{resumeOnFile ? "On file" : "Optional"}</span>
        </button>
      </div>

      {error && step !== "photo" && <p className="rounded bg-red-950/40 px-3 py-2 text-sm text-red-500">{error}</p>}

      {isApproved ? (
        <section className="space-y-4 rounded-xl border border-white/20 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">Verification Approved</h2>
          <p className="text-white/70">You are verified and can access all interview rounds.</p>
          {faceMatch != null && (
            <div className="rounded-lg border border-white/20 bg-white/10 p-4">
              <p className="font-medium text-white">
                Face Match: Verified ({Math.round((faceMatch.confidence ?? 0) * 100)}% confidence)
              </p>
              <p className="mt-1 text-xs text-white/70">
                Strong facial feature alignment. You can proceed to HR and other rounds.
              </p>
            </div>
          )}
          {idNameCheck?.checked && (
            <div className="rounded-lg border border-white/20 bg-white/5 p-4">
              <p className="font-medium text-white">
                ID Name Check: {idNameCheck.match === false ? "Needs review" : "Verified"}
              </p>
              <p className="mt-1 text-xs text-white/70">
                Candidate profile: {idNameCheck.expected_name || "—"} | ID document: {idNameCheck.extracted_name || "Could not extract"}
              </p>
            </div>
          )}
        </section>
      ) : (
        <>
          {(faceMatch != null || idNameCheck?.checked) && (
            <section className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-6">
              <h2 className="mb-2 text-lg font-medium text-amber-200">Verification Review</h2>
              {faceMatch != null && (
                <p className="text-sm text-white/70">
                  Face match confidence: {Math.round((faceMatch.confidence ?? 0) * 100)}%
                </p>
              )}
              {idNameCheck?.checked && (
                <p className="mt-2 text-sm text-white/70">
                  Name on ID: {idNameCheck.extracted_name || "Unreadable"} | Profile name: {idNameCheck.expected_name || "—"} | Match: {idNameCheck.match === false ? "No" : "Yes / Needs review"}
                </p>
              )}
            </section>
          )}
          {step === "id" && (
            <section className="rounded-xl border border-white/20 bg-white/5 p-6">
              <h2 className="mb-2 text-lg font-medium text-white">ID Proof</h2>
              <p className="mb-4 text-sm text-white/70">
                Upload a government-issued ID (passport, driver&apos;s license, etc.). JPG, PNG, or PDF (max 10MB).
              </p>
              <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/10 p-6 transition hover:border-white/30">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                  onChange={handleIdChange}
                />
                <span className="text-3xl text-white/50">↑</span>
                <span className="mt-2 text-sm text-white/70">Click to upload ID proof</span>
                {idFile && <span className="mt-1 text-xs text-white">{idFile.name}</span>}
              </label>
              {idPreview && idFile?.type.startsWith("image/") && (
                <img src={idPreview} alt="ID preview" className="mt-4 max-h-40 rounded border border-white/20 object-contain" />
              )}
            </section>
          )}

          {step === "photo" && (
            <section className="rounded-xl border border-white/20 bg-white/5 p-6">
              <h2 className="mb-2 text-lg font-medium text-white">Photo</h2>
              <p className="mb-4 text-sm text-white/70">
                Take a webcam photo or upload a photo of yourself
              </p>
              {/* Video always in DOM on photo step so ref exists when we attach stream */}
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full rounded-lg border border-white/20 bg-black object-cover object-center ${cameraStarted ? "block" : "hidden"}`}
                  style={{ aspectRatio: "1" }}
                  onLoadedMetadata={() => setVideoReady(true)}
                  onCanPlay={() => setVideoReady(true)}
                  onError={() => setError("Video failed to load. Try again.")}
                />
                {cameraStarted && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-48 w-48 rounded-full border-2 border-dashed border-purple-500/70" />
                  </div>
                )}
              </div>
              {!cameraStarted ? (
                <div className="space-y-4">
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/10 p-8">
                    <svg className="h-16 w-16 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <svg className="mt-4 h-10 w-10 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    </svg>
                    <p className="mt-4 text-sm font-medium text-white">Live webcam photo required</p>
                    <p className="mt-1 text-xs text-white/70">Photo uploads are not accepted</p>
                  </div>
                  {error && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                      {error}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void startCamera(selectedDeviceId ?? undefined)}
                      disabled={cameraLoading || retryCountdown > 0}
                      className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2.5 text-sm font-medium hover:bg-white/90 disabled:opacity-50"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                      {retryCountdown > 0 ? `Trying again in ${retryCountdown}s…` : cameraLoading ? "Opening camera…" : "Open Webcam"}
                    </button>
                    {error && retryCountdown === 0 && (
                      <button
                        type="button"
                        onClick={handleWaitAndRetry}
                        disabled={cameraLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-500/20"
                      >
                        Wait 3s & try again
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-md space-y-3">
                  {videoDevices.length > 1 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-white/70">Camera</label>
                      <select
                        value={selectedDeviceId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          setSelectedDeviceId(id);
                          startCamera(id);
                        }}
                        className="dark-native rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                      >
                        {videoDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-white/70">If you see an avatar or virtual camera, choose your real webcam above.</p>
                    </div>
                  )}
                  <p className="text-center text-xs text-white/70">Align your face within the outline</p>
                  <div className="mt-4 flex flex-col items-center gap-2">
                    {!videoReady && !error && (
                      <p className="text-xs text-amber-400">{cameraLoading ? "Starting camera…" : "Waiting for camera…"}</p>
                    )}
                    {error && (
                      <button
                        type="button"
                        onClick={() => void startCamera()}
                        disabled={cameraLoading}
                        className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                      >
                        {cameraLoading ? "Retrying…" : "Try again"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={!videoReady}
                      className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Capture
                    </button>
                  </div>
                  {photoDataUrl && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs text-white/70">Captured photo:</p>
                      <img src={photoDataUrl} alt="Captured" className="mx-auto max-h-32 rounded border border-white/20" />
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {step === "resume" && (
            <section className="rounded-xl border border-white/20 bg-white/5 p-6">
              <h2 className="mb-2 text-lg font-medium text-white">Resume</h2>
              <p className="mb-4 text-sm text-white/70">
                Upload your resume (PDF, DOC, DOCX, or image) for your profile.
              </p>
              <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/10 p-6 transition hover:border-white/30">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 10 * 1024 * 1024) {
                      setError("Resume file must be under 10MB");
                      return;
                    }
                    setResumeFile(f ?? null);
                    setError(null);
                  }}
                />
                <span className="text-3xl text-white/50">📄</span>
                <span className="mt-2 text-sm text-white/70">
                  {resumeFile ? resumeFile.name : "Click to upload resume"}
                </span>
                {resumeFile && (
                  <span className="mt-1 text-xs text-white">File selected</span>
                )}
              </label>
              <p className="mt-3 text-xs text-white/70">Or paste a URL instead:</p>
              <input
                type="url"
                placeholder="Resume URL (optional)"
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
              />
            </section>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setStep(STEPS[Math.max(0, STEPS.findIndex((s) => s.key === step) - 1)].key)}
              disabled={step === "id"}
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-white/20"
            >
              Previous
            </button>
            {step !== "resume" ? (
              <button
                type="button"
                onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.key === step) + 1].key)}
                className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-white/90"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !idFile || !photoDataUrl}
                className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-white/90 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit verification"}
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
