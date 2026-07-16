import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TablesUpdate } from "@workspace/supabase/types";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  DollarSign,
  Globe,
  Loader2,
  Tag,
  TriangleAlert,
  Upload,
  User,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SentriveLogo, SentriveSky } from "@/features/dashboard/brand";
import { prewarmAgentSuggestions } from "@/features/tasks/suggestions";

import { useProfile, useWorkspace } from "./hooks";
import { analyzeWebsite, updateProfileName, updateWorkspace, uploadLogo } from "./mutations";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_MODELS,
  REVENUES,
  ROLES,
  TEAM_SIZES,
  TOTAL_STEPS,
} from "./options";
import { onboardingKeys } from "./queries";

import "@/features/dashboard/dashboard.css";
import "./onboarding.css";

interface FormState {
  name: string;
  companyName: string;
  logoUrl: string | null;
  websiteMode: "url" | "description";
  websiteUrl: string;
  description: string;
  teamSize: string;
  monthlyRevenue: string;
  role: string;
  businessModel: string;
  businessCategories: string[];
}

const EMPTY: FormState = {
  name: "",
  companyName: "",
  logoUrl: null,
  websiteMode: "url",
  websiteUrl: "",
  description: "",
  teamSize: "",
  monthlyRevenue: "",
  role: "",
  businessModel: "",
  businessCategories: [],
};

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: ws, isLoading: wsLoading } = useWorkspace();
  const { data: profile, isLoading: profileLoading } = useProfile();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  // The site analysis runs in the background while the user answers the quick
  // steps, so they never sit on a spinner. Only "Finish" waits on it.
  const [analysis, setAnalysis] = useState<"idle" | "running" | "done" | "error">("idle");
  const analysisPromise = useRef<Promise<void> | null>(null);
  const analysisRunId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const teamId = ws?.id ?? null;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // hydrate from saved progress once data loads (so refresh resumes)
  useEffect(() => {
    if (hydrated || wsLoading || profileLoading) return;
    setForm({
      name: profile?.full_name ?? "",
      companyName: ws?.name && ws.name !== "My team" ? ws.name : "",
      logoUrl: ws?.logo_url ?? null,
      websiteMode: ws?.business_description ? "description" : "url",
      websiteUrl: ws?.website_url ?? "",
      description: ws?.business_description ?? "",
      teamSize: ws?.team_size ?? "",
      monthlyRevenue: ws?.monthly_revenue ?? "",
      role: ws?.owner_role ?? "",
      businessModel: ws?.business_model ?? "",
      businessCategories: ws?.business_categories ?? [],
    });
    setStep(Math.min(ws?.onboarding_step ?? 0, TOTAL_STEPS - 1));
    setHydrated(true);
  }, [hydrated, wsLoading, profileLoading, ws, profile]);

  async function persist(patch: TablesUpdate<"teams">, nextStep: number) {
    if (!teamId) return;
    await updateWorkspace(teamId, { ...patch, onboarding_step: nextStep });
    // awaited so the route guard reads the fresh onboarding state (no redirect loop)
    await queryClient.invalidateQueries({ queryKey: onboardingKeys.workspace });
  }

  /** Kick off the site analysis in the background; status drives the chip. */
  function startAnalysis(payload: { website_url: string } | { description: string }) {
    const runId = ++analysisRunId.current;
    setAnalysis("running");
    const p = analyzeWebsite(payload)
      .then(() => {
        if (analysisRunId.current !== runId) return; // superseded by a newer run
        if (teamId) prewarmAgentSuggestions(teamId);
        setAnalysis("done");
      })
      .catch(() => {
        if (analysisRunId.current !== runId) return;
        setAnalysis("error");
      });
    analysisPromise.current = p;
  }

  function retryAnalysis() {
    const payload =
      form.websiteMode === "description"
        ? { description: form.description.trim() }
        : { website_url: form.websiteUrl.trim() };
    startAnalysis(payload);
  }

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !teamId) return;
    setError(null);
    setBusy(true);
    uploadLogo(teamId, file)
      .then((url) => set("logoUrl", url))
      .catch((err) => setError(err instanceof Error ? err.message : "Upload failed."))
      .finally(() => setBusy(false));
  }

  async function next() {
    if (busy) return;
    setError(null);
    try {
      // STEP 0 — profile
      if (step === 0) {
        setBusy(true);
        await updateProfileName(form.name.trim());
        await persist(
          {
            name: form.companyName.trim() || form.name.trim() || "My workspace",
            logo_url: form.logoUrl,
          },
          1,
        );
        void queryClient.invalidateQueries({ queryKey: onboardingKeys.profile });
        setStep(1);
        return;
      }

      // STEP 1 — kick off the site analysis and move on immediately. It runs in
      // the background (saving business_context server-side) while they answer
      // the quick steps; only "Finish" waits on it.
      if (step === 1) {
        setBusy(true);
        const useDesc = form.websiteMode === "description";
        startAnalysis(
          useDesc
            ? { description: form.description.trim() }
            : { website_url: form.websiteUrl.trim() },
        );
        await persist({}, 2);
        setStep(2);
        return;
      }

      // STEP 2 — team size + revenue
      if (step === 2) {
        setBusy(true);
        await persist({ team_size: form.teamSize, monthly_revenue: form.monthlyRevenue }, 3);
        setStep(3);
        return;
      }

      // STEP 3 — role
      if (step === 3) {
        setBusy(true);
        await persist({ owner_role: form.role }, 4);
        setStep(4);
        return;
      }

      // STEP 4 — business type → finish
      if (step === 4) {
        setBusy(true);
        await persist(
          {
            business_model: form.businessModel,
            business_categories: form.businessCategories,
            onboarding_completed: true,
          },
          TOTAL_STEPS,
        );
        // Make sure the site analysis has landed so the dashboard's first-run
        // has business context. Usually already done by now (the quick steps
        // covered the wait), so this is instant.
        if (analysisPromise.current) await analysisPromise.current.catch(() => {});
        void navigate({ to: "/home" });
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const back = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  // per-step validity for the primary button
  const canContinue = (() => {
    switch (step) {
      case 0:
        return form.name.trim().length > 0;
      case 1:
        return form.websiteMode === "url"
          ? form.websiteUrl.trim().length > 3
          : form.description.trim().length > 10;
      case 2:
        return !!form.teamSize && !!form.monthlyRevenue;
      case 3:
        return !!form.role;
      case 4:
        return !!form.businessModel;
      default:
        return true;
    }
  })();

  const HEADERS = [
    {
      title: "Welcome to Sentrive",
      sub: "A few quick things so Sentrive can do real work for you.",
    },
    {
      title: "Analyze your website",
      sub: "Sentrive reads your site to learn your product, audience, and voice.",
    },
    { title: "Tell us about yourself", sub: "This helps us tailor recommendations to your stage." },
    {
      title: "What describes you best?",
      sub: "We'll customize your experience based on your role.",
    },
    {
      title: "What type of business do you run?",
      sub: "This helps us create content that resonates with your audience.",
    },
  ];

  return (
    <div className="flowy-app">
      <SentriveSky />
      <main className="flowy-onb-main">
        <div className="onb-shell">
          <div className="onb-brand">
            <SentriveLogo size={40} />
          </div>
          <div className="onb-head">
            <h1>{HEADERS[step].title}</h1>
            <p>{HEADERS[step].sub}</p>
          </div>

          <div className="onb-card">
            {step >= 2 && analysis !== "idle" && (
              <div
                className={`mb-4 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  analysis === "error"
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-[#3d82f5]/25 bg-[#3d82f5]/5"
                }`}
              >
                {analysis === "running" && (
                  <>
                    <Loader2 className="size-4 animate-spin text-[#3d82f5]" />
                    <span className="text-muted-foreground">Reading your site…</span>
                  </>
                )}
                {analysis === "done" && (
                  <>
                    <Check className="size-4 text-emerald-600" />
                    <span className="text-muted-foreground">Learned your business</span>
                  </>
                )}
                {analysis === "error" && (
                  <>
                    <TriangleAlert className="size-4 text-amber-600" />
                    <span className="text-muted-foreground">Couldn't read your site.</span>
                    <button
                      type="button"
                      className="text-foreground font-medium underline underline-offset-2"
                      onClick={retryAnalysis}
                    >
                      Retry
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="onb-step" key={step}>
              {renderStep()}
            </div>

            {error && <p className="onb-error">{error}</p>}

            <div className="onb-actions">
              <Button
                className="w-full"
                disabled={!canContinue || busy}
                onClick={() => void next()}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {step === TOTAL_STEPS - 1 ? "Finish" : "Continue"}
              </Button>
              {step > 0 && (
                <button type="button" className="onb-back" onClick={back}>
                  <ArrowLeft className="mr-1 inline size-3.5" /> Back
                </button>
              )}
            </div>
          </div>

          <div className="onb-dots">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span key={i} className={`dot${i === step ? " active" : ""}`} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );

  function renderStep() {
    if (step === 0) return renderProfile();
    if (step === 1) return renderWebsite();
    if (step === 2) return renderAbout();
    if (step === 3) return renderRole();
    return renderBusiness();
  }

  function renderProfile() {
    return (
      <>
        <div className="onb-profile">
          <div>
            <div className="onb-label">
              <Building2 className="size-4" /> Company Logo (optional)
            </div>
            <button type="button" className="onb-upload" onClick={() => fileRef.current?.click()}>
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" />
              ) : (
                <span className="onb-upload-inner">
                  <span className="ico">
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                  </span>
                  Upload
                  <br />
                  PNG, JPG (5MB)
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={onPickLogo}
            />
          </div>
          <div>
            <div className="onb-label">
              <User className="size-4" /> Your name
            </div>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Jane Doe"
            />
            <div className="onb-label mt-4">
              <Building2 className="size-4" /> Company name
            </div>
            <Input
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Enter your company name"
            />
          </div>
        </div>
        <p className="onb-note subtle">
          Have multiple businesses? You can add more workspaces anytime from the workspace menu
          under the Sentrive logo.
        </p>
      </>
    );
  }

  function renderWebsite() {
    const useDesc = form.websiteMode === "description";
    return (
      <>
        <div className="onb-section">
          <div className="onb-label">
            <Globe className="size-4" /> {useDesc ? "Describe your business" : "Company website"}
          </div>
          {useDesc ? (
            <Textarea
              rows={5}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What does your business do? Who are your customers? What makes you different?"
            />
          ) : (
            <Input
              type="url"
              value={form.websiteUrl}
              onChange={(e) => set("websiteUrl", e.target.value)}
              placeholder="https://yourcompany.com"
            />
          )}
          <div className="mt-3">
            <button
              type="button"
              className="onb-toggle"
              onClick={() => set("websiteMode", useDesc ? "url" : "description")}
            >
              {useDesc ? "Use website URL instead" : "Use description instead"}
            </button>
          </div>
        </div>
        <p className="onb-note subtle">
          Sentrive uses this to understand your product, audience, and voice, so everything it makes
          sounds like you, not generic AI.
        </p>
      </>
    );
  }

  function renderAbout() {
    return (
      <>
        <div className="onb-section">
          <div className="onb-label">
            <Users className="size-4" /> How big is your current team?
          </div>
          <div className="onb-grid cols-3">
            {TEAM_SIZES.map((t) => (
              <Pill
                key={t}
                label={t}
                selected={form.teamSize === t}
                onClick={() => set("teamSize", t)}
              />
            ))}
          </div>
        </div>
        <div className="onb-section">
          <div className="onb-label">
            <DollarSign className="size-4" /> What is your current monthly revenue?
          </div>
          <div className="onb-grid cols-3">
            {REVENUES.map((r) => (
              <Pill
                key={r}
                label={r}
                selected={form.monthlyRevenue === r}
                onClick={() => set("monthlyRevenue", r)}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  function renderRole() {
    return (
      <div className="onb-section">
        <div className="onb-label">
          <Briefcase className="size-4" /> Select your role
        </div>
        <div className="onb-grid cols-3">
          {ROLES.map((r) => (
            <Pill key={r} label={r} selected={form.role === r} onClick={() => set("role", r)} />
          ))}
        </div>
      </div>
    );
  }

  function renderBusiness() {
    const toggleCat = (c: string) =>
      set(
        "businessCategories",
        form.businessCategories.includes(c)
          ? form.businessCategories.filter((x) => x !== c)
          : [...form.businessCategories, c],
      );
    return (
      <>
        <div className="onb-section">
          <div className="onb-label">
            <Building2 className="size-4" /> Business model
          </div>
          <div className="onb-grid cols-3">
            {BUSINESS_MODELS.map((m) => (
              <Pill
                key={m.value}
                label={m.label}
                selected={form.businessModel === m.value}
                onClick={() => set("businessModel", m.value)}
              />
            ))}
          </div>
        </div>
        <div className="onb-section">
          <div className="onb-label">
            <Tag className="size-4" /> Business category (select all that apply)
          </div>
          <div className="onb-grid cols-4">
            {BUSINESS_CATEGORIES.map((c) => (
              <Pill
                key={c}
                label={c}
                selected={form.businessCategories.includes(c)}
                onClick={() => toggleCat(c)}
              />
            ))}
          </div>
        </div>
      </>
    );
  }
}

function Pill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`onb-pill${selected ? " selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
