import axios, { type AxiosInstance } from "axios";

/** Normalize FastAPI error detail (string or array of { msg, ... }) to a single string for display. */
export function getApiErrorMessage(detail: unknown, fallback: string): string {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (first && typeof first === "object" && typeof first.msg === "string") return first.msg;
  }
  return fallback;
}

const isLocalFrontend = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const PRIMARY_API_URL = process.env.NEXT_PUBLIC_API_URL || "https://hiremind-ai-5kza.onrender.com";
const LOCAL_API_URL = process.env.NEXT_PUBLIC_API_URL_LOCAL || "http://localhost:8000";

function resolveShortlistApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SHORTLIST_API_URL;
  if (!configured) return isLocalFrontend ? LOCAL_API_URL : PRIMARY_API_URL;

  const configuredIsLocal = /localhost|127\.0\.0\.1/i.test(configured);
  // Never use a local-only API URL from a deployed frontend host.
  if (!isLocalFrontend && configuredIsLocal) return PRIMARY_API_URL;

  return configured;
}

const SHORTLIST_API_URL = resolveShortlistApiUrl();
let activeBaseUrl = isLocalFrontend ? LOCAL_API_URL : PRIMARY_API_URL;

function canFallbackToLocal(currentUrl?: string): boolean {
  return Boolean(
    LOCAL_API_URL &&
      currentUrl &&
      currentUrl !== LOCAL_API_URL
  );
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
}

export function setRefreshToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("refresh_token", token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
}

const api: AxiosInstance = axios.create({
  baseURL: activeBaseUrl,
  headers: { "Content-Type": "application/json" },
});

const shortlistApiClient: AxiosInstance = axios.create({
  baseURL: SHORTLIST_API_URL,
  headers: { "Content-Type": "application/json" },
});

shortlistApiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let refreshQueue: ((token: string) => void)[] = [];

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    // If primary API is unreachable (network/DNS/CORS-level failure), switch to local API once.
    if (!err?.response && canFallbackToLocal(api.defaults.baseURL)) {
      activeBaseUrl = LOCAL_API_URL;
      api.defaults.baseURL = activeBaseUrl;
      const originalRequest = err?.config;
      if (originalRequest && !originalRequest._localRetry) {
        originalRequest._localRetry = true;
        originalRequest.baseURL = activeBaseUrl;
        return api(originalRequest);
      }
    }

    const originalRequest = err?.config;
    if (err?.response?.status === 401 && !originalRequest?._retry) {
      const refresh = getRefreshToken();
      if (refresh) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            refreshQueue.push((newToken: string) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            });
          });
        }
        isRefreshing = true;
        originalRequest._retry = true;
        try {
          const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refresh_token: refresh });
          const { access_token, refresh_token: newRefresh } = res.data;
          setToken(access_token);
          if (newRefresh) setRefreshToken(newRefresh);
          refreshQueue.forEach((cb) => cb(access_token));
          refreshQueue = [];
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch {
          clearToken();
        } finally {
          isRefreshing = false;
        }
      } else {
        clearToken();
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; refresh_token?: string; role?: string; user_id?: number }>("/auth/login", { email, password }),
  refresh: (refreshToken: string) =>
    api.post<{ access_token: string; refresh_token?: string }>("/auth/refresh", { refresh_token: refreshToken }),
  me: () => api.get<{ id: number; email: string; full_name: string | null; role: string }>("/auth/me"),
};

// CSV download
export const csvApi = {
  downloadInterviewsCsv: () =>
    api.get<Blob>("/download-csv", {
      responseType: "blob",
      headers: { Accept: "text/csv" },
    }),
};

// Admin
export const adminApi = {
  stats: () => api.get<{ total_companies: number; total_interviews: number; total_candidates: number }>("/admin/stats"),
  listCompanies: () => api.get("/admin/companies"),
  createCompany: (data: { name: string; contact_email?: string; admin_email: string; admin_password: string; admin_full_name?: string }) =>
    api.post("/admin/companies", data),
  deleteCompany: (companyId: number) => api.delete(`/admin/companies/${companyId}`),
  bulkCompanies: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/admin/companies/bulk", form, { headers: { "Content-Type": "multipart/form-data" } });
  },
};

// Company
export const companyApi = {
  me: () => api.get("/company/me"),
  dashboard: () => api.get("/company/dashboard"),
  listCandidates: () => api.get("/company/candidates"),
  createCandidate: (data: { email: string; full_name?: string; password: string }) =>
    api.post("/company/candidates", data),
  listInterviews: () => api.get("/company/interviews"),
  createInterview: (data: {
    name: string;
    description?: string;
    follow_order?: boolean;
    shortlist_count?: number;
    scheduled_start?: string;
    scheduled_end?: string;
  }) => api.post("/company/interviews", data),
  updateInterview: (interviewId: number, data: {
    name?: string;
    description?: string;
    follow_order?: boolean;
    shortlist_count?: number;
    scheduled_start?: string;
    scheduled_end?: string;
  }) => api.put(`/company/interviews/${interviewId}`, data),
  activateInterview: (interviewId: number) =>
    api.patch(`/company/interviews/${interviewId}/activate`),
  endInterview: (interviewId: number) =>
    api.patch(`/company/interviews/${interviewId}/end`),
  terminateInterview: (interviewId: number) =>
    api.patch(`/company/interviews/${interviewId}/terminate`),
  listRounds: (interviewId: number) => api.get(`/company/interviews/${interviewId}/rounds`),
  addRound: (interviewId: number, data: {
    type: string;
    order: number;
    weightage?: number;
    duration_minutes?: number;
    config?: object;
  }) => api.post(`/company/interviews/${interviewId}/rounds`, data),
  updateRound: (roundId: number, data: {
    type?: string;
    order?: number;
    weightage?: number;
    duration_minutes?: number;
    config?: object;
  }) => api.put(`/company/rounds/${roundId}`, data),
  deleteRound: (roundId: number) => api.delete(`/company/rounds/${roundId}`),
  reorderRounds: (interviewId: number, roundIds: number[]) =>
    api.put(`/company/interviews/${interviewId}/rounds/reorder`, { round_ids: roundIds }),
  listEnrolledCandidates: (interviewId: number) =>
    api.get<{ id: number; email: string; full_name: string | null; verification_status: string }[]>(
      `/company/interviews/${interviewId}/candidates`
    ),
  enrollCandidates: (interviewId: number, candidateIds: number[]) =>
    api.post(`/company/interviews/${interviewId}/candidates`, candidateIds),
  bulkEnrollCandidates: (interviewId: number, file: File, passwordColumnIndex: number = 0) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/company/interviews/${interviewId}/candidates/bulk?password_column_index=${passwordColumnIndex}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  removeCandidate: (interviewId: number, candidateId: number) =>
    api.delete(`/company/interviews/${interviewId}/candidates/${candidateId}`),
  getRound: (roundId: number) =>
    api.get<{
      id: number; interview_id: number; type: string; order: number;
      status: string; weightage?: number; duration_minutes?: number;
      config?: { recruiter_requirements?: string; resume_summary?: string };
    }>(`/company/rounds/${roundId}`),
  updateRoundConfig: (roundId: number, data: { recruiter_requirements?: string; resume_summary?: string }) =>
    api.patch(`/company/rounds/${roundId}`, data),
  listRoundQuestions: (roundId: number) => api.get(`/company/rounds/${roundId}/questions`),
  addQuestion: (roundId: number, data: {
    content: string; type?: string; difficulty?: string; domain?: string;
    options?: object; correct_answer?: string; max_score?: number;
  }) => api.post(`/company/rounds/${roundId}/questions`, data),
  updateQuestion: (questionId: number, data: {
    content?: string; type?: string; difficulty?: string; domain?: string;
    options?: object; correct_answer?: string; max_score?: number;
  }) => api.put(`/company/questions/${questionId}`, data),
  deleteQuestion: (questionId: number) => api.delete(`/company/questions/${questionId}`),
  approveQuestion: (questionId: number, approved: boolean = true) =>
    api.patch(`/company/questions/${questionId}/approve?approved=${approved}`),
  generateQuestions: (roundId: number, data: { count: number; difficulty?: string; domain?: string }) =>
    api.post(`/company/rounds/${roundId}/questions/generate`, data),
  bulkAddQuestions: (roundId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ created: number; failed: number; errors: { row: number; error: string }[] }>(`/company/rounds/${roundId}/questions/bulk`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  listResponsesByRound: (interviewId: number, roundId: number) =>
    api.get(`/company/interviews/${interviewId}/rounds/${roundId}/responses`),
  listResponsesByCandidate: (interviewId: number, candidateId: number) =>
    api.get(`/company/interviews/${interviewId}/candidates/${candidateId}/responses`),
  candidateSummary: (interviewId: number, candidateId: number) =>
    api.get(`/company/interviews/${interviewId}/candidates/${candidateId}/summary`),
  topPerformers: (interviewId: number) =>
    api.get(`/company/interviews/${interviewId}/top-performers`),
  createFromShortlisted: (interviewId: number, name: string) =>
    api.post(`/company/interviews/${interviewId}/create-from-shortlisted?name=${encodeURIComponent(name)}`),
  generateCandidateReport: (interviewId: number, candidateId: number) =>
    api.post(`/company/interviews/${interviewId}/candidates/${candidateId}/report`),
  plagiarismCheck: (roundId: number) =>
    api.get(`/company/rounds/${roundId}/plagiarism-check`),
  startGDSession: (interviewId: number, roundId: number, topic?: string) =>
    api.post(`/company/interviews/${interviewId}/rounds/${roundId}/gd-session`, null, { params: { topic } }),
  endGDSession: (interviewId: number, roundId: number) =>
    api.post(`/company/interviews/${interviewId}/rounds/${roundId}/gd-session/end`),
  gdSessionStatus: (interviewId: number, roundId: number) =>
    api.get(`/company/interviews/${interviewId}/rounds/${roundId}/gd-session/status`),
  startLiveInterview: (interviewId: number, roundId: number, candidateId: number) =>
    api.post(`/company/interviews/${interviewId}/rounds/${roundId}/live-start`, { candidate_id: candidateId }),
  scoreLiveInterview: (interviewId: number, roundId: number, data: { candidate_id: number; score: number; max_score?: number; notes?: string }) =>
    api.post(`/company/interviews/${interviewId}/rounds/${roundId}/live-score`, data),
  liveAssist: (interviewId: number, roundId: number, data: { note: string; previous_notes?: string[] }) =>
    api.post(`/company/interviews/${interviewId}/rounds/${roundId}/live-assist`, data),
};

// Candidate
export type VerificationResponse = {
  id: number;
  candidate_id: number;
  status: string;
  id_proof_url: string | null;
  photo_url: string | null;
  resume_url: string | null;
  ocr_data: { face_match?: { confidence: number; match: boolean }; resume_text?: string } | null;
  created_at: string;
  updated_at: string;
};

export const candidateApi = {
  me: () => api.get("/candidate/me"),
  listInterviews: () => api.get("/candidate/interviews"),
  listRounds: (interviewId: number) => api.get(`/candidate/interviews/${interviewId}/rounds`),
  getRound: (interviewId: number, roundId: number) =>
    api.get<{
      id: number; interview_id: number; type: string; order: number;
      status: string; weightage?: number; duration_minutes?: number;
    }>(`/candidate/interviews/${interviewId}/rounds/${roundId}`),
  getRoundQuestions: (interviewId: number, roundId: number) =>
    api.get(`/candidate/interviews/${interviewId}/rounds/${roundId}/questions`),
  startRound: (roundId: number) =>
    api.post<{
      id: number; candidate_id: number; round_id: number; interview_id: number;
      status: string; total_score?: number; max_possible_score?: number;
      started_at?: string; submitted_at?: string;
    }>(`/candidate/rounds/${roundId}/start`),
  getRoundSession: (roundId: number) =>
    api.get<{
      id: number; candidate_id: number; round_id: number; interview_id: number;
      status: string; total_score?: number; max_possible_score?: number;
    } | null>(`/candidate/rounds/${roundId}/session`),
  submitAnswer: (roundId: number, data: { question_id: number; content?: string; language?: string }) =>
    api.post(`/candidate/rounds/${roundId}/answer`, data),
  submitRound: (roundId: number) =>
    api.post<{
      session_id: number; status: string; total_score?: number; max_possible_score?: number;
    }>(`/candidate/rounds/${roundId}/submit`),
  runCode: (roundId: number, data: { question_id: number; code: string; language: string }) =>
    api.post<{ passed: number; failed: number; total: number; results: object[] }>(
      `/candidate/rounds/${roundId}/run-code`, data
    ),
  techInterviewTurn: (interviewId: number, roundId: number, data: {
    conversation: { role: string; content: string }[]; candidate_response: string;
  }) => api.post<{ question: string; analysis: string; done: boolean }>(
    `/candidate/interviews/${interviewId}/rounds/${roundId}/tech-turn`, data
  ),
  submitResponses: (interviewId: number, roundId: number, responses: { question_id: number; content?: string }[]) =>
    api.post(`/candidate/interviews/${interviewId}/rounds/${roundId}/responses`, responses),
  gdInfo: (roundId: number) => api.get(`/candidate/rounds/${roundId}/gd-info`),
  gdJoin: (roundId: number) => api.post(`/candidate/rounds/${roundId}/gd/join`),
  gdMessages: (roundId: number) => api.get(`/candidate/rounds/${roundId}/gd/messages`),
  gdChat: (roundId: number, text: string) => api.post(`/candidate/rounds/${roundId}/gd/chat`, { text }),
  liveInfo: (roundId: number) => api.get(`/candidate/rounds/${roundId}/live-info`),
  getVerification: () => api.get<VerificationResponse | null>("/candidate/verification"),
  submitVerification: (data: {
    id_proof_url?: string;
    photo_url?: string;
    resume_url?: string;
    resume_base64?: string;
    id_proof_base64?: string;
    photo_base64?: string;
    ocr_data?: object;
  }) => api.post<VerificationResponse>("/candidate/verification", data),
  reverifyPhoto: (photo_base64: string) =>
    api.post<{ ok: boolean; message?: string }>("/candidate/verification/reverify", { photo_base64 }),
};

// Proctoring (candidate during round)
export const proctoringApi = {
  getStatus: (interviewId: number, roundId: number) =>
    api.get<{ strikes: number; status: string; disqualified: boolean }>(`/proctoring/status?interview_id=${interviewId}&round_id=${roundId}`),
  submitEvent: (interviewId: number, roundId: number, type: string, data?: object) =>
    api.post<{ strikes: number; status: string; disqualified: boolean }>("/proctoring/events", {
      interview_id: interviewId,
      round_id: roundId,
      type,
      data,
    }),
  analyzeFrame: (imageBase64: string) =>
    api.post<{
      face_visible: boolean;
      phone_detected: boolean;
      multiple_faces: boolean;
      identity_match?: boolean | null;
      identity_confidence?: number | null;
    }>("/proctoring/analyze-frame", {
      image_base64: imageBase64,
    }),
};

export const shortlistApi = {
  createJob: (data: { title: string; description: string }) =>
    shortlistApiClient.post<{ success: boolean; data: { id: string; title: string; description: string; createdAt: string } }>("/jobs", data),
  uploadResumes: (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("resumes", f));
    return shortlistApiClient.post<{ success: boolean; count: number; data: { id: string; name?: string; mobileNumber?: string; resumeUrl: string }[] }>(
      "/candidates/upload",
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  shortlistCandidates: (jobId: string, candidateIds: string[] = []) =>
    shortlistApiClient.post<{
      success: boolean;
      shortlisted: Array<{ candidateId: string; name?: string; mobileNumber?: string; resumeUrl: string; evaluation: { overall_score: number; decision: string; reason: string } }>;
      rejected: Array<{ candidateId: string; name?: string; mobileNumber?: string; resumeUrl: string; evaluation: { overall_score: number; decision: string; reason: string } }>;
    }>(`/shortlist/${jobId}`, { candidate_ids: candidateIds }),
  downloadShortlistedCsv: (jobId: string) =>
    shortlistApiClient.get(`/shortlist/report/${jobId}/csv`, { responseType: "blob" }),
  callShortlisted: (jobId: string) =>
    shortlistApiClient.post<{ success: boolean; called: number; skipped: number; failed: number }>(`/caller/call-shortlisted/${jobId}`),
  downloadCallerReportCsv: (jobId: string) =>
    shortlistApiClient.get(`/caller/report/${jobId}/csv`, { responseType: "blob" }),
  uploadCsvAndCall: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return shortlistApiClient.post<{
      success: boolean;
      called: number;
      skipped: number;
      failed: number;
      details: Array<{
        name?: string;
        mobileNumber?: string;
        status: string;
        availabilityDate?: string;
        notes?: string;
        reason?: string;
      }>;
    }>("/caller/upload-csv-and-call", form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  uploadCsvAndEmail: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return shortlistApiClient.post<{
      success: boolean;
      sent: number;
      skipped: number;
      failed: number;
      details: Array<{
        name?: string;
        email?: string;
        status: string;
        reason?: string;
        smtpStatus?: number;
        emailStatus?: { status: string; reason?: string; smtpStatus?: number; email?: string };
      }>;
    }>("/caller/upload-csv-and-email", form, { headers: { "Content-Type": "multipart/form-data" } });
  },

  // Caller status polling (Vapi)
  getCallerCallStatuses: (callIds: string[]) =>
    shortlistApiClient.post<{ success: boolean; calls: Record<string, { call_id: string; status?: string | null; ended_at?: string | null; ended_reason?: unknown; error?: string }> }>(
      "/caller/calls/status",
      { call_ids: callIds }
    ),
};

export default api;
