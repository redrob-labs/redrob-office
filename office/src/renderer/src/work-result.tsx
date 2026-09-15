import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { nowMs } from "./clock";

export interface WorkResult {
  title: string;
  body: string;
  source?: "model" | "template";
  meta?: string;
  /** Generate output kind: markdown | html | pptx | docx | hwpx | svg | … */
  outputKind?: string;
  contentFile?: string;
}

export type WorkStepStatus = "pending" | "active" | "done" | "error";

export interface WorkProgressStep {
  id: string;
  label: string;
  status: WorkStepStatus;
}

export interface WorkProgress {
  operation: string;
  title: string;
  steps: WorkProgressStep[];
  startedAt: number;
  /** Expected total duration from past runs, when known */
  etaMs: number | null;
}

interface WorkResultApi {
  result: WorkResult | null;
  progress: WorkProgress | null;
  /** Partial markdown shown under progress while slots stream in. */
  liveBody: string | null;
  setResult: (next: WorkResult | null) => void;
  setLiveBody: (body: string | null) => void;
  startProgress: (next: Omit<WorkProgress, "startedAt"> & { startedAt?: number }) => void;
  setActiveStep: (stepId: string, detail?: string) => void;
  failProgress: (stepId?: string) => void;
  clearProgress: () => void;
  clearResult: () => void;
  /** Clears result/progress only when no run is in flight. */
  clearResultIfIdle: () => void;
  cancelProgress: () => void;
}

const WorkResultContext = createContext<WorkResultApi | null>(null);

function markActive(steps: WorkProgressStep[], stepId: string): WorkProgressStep[] {
  let seen = false;
  return steps.map((step) => {
    if (step.id === stepId) {
      seen = true;
      return { ...step, status: "active" as const };
    }
    if (!seen && step.status !== "error") {
      return { ...step, status: "done" as const };
    }
    if (seen && step.status === "active") {
      return { ...step, status: "pending" as const };
    }
    return step;
  });
}

export function WorkResultProvider({ children }: { children: ReactNode }): JSX.Element {
  const [result, setResultState] = useState<WorkResult | null>(null);
  const [progress, setProgressState] = useState<WorkProgress | null>(null);
  const [liveBody, setLiveBodyState] = useState<string | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const clearProgress = useCallback(() => {
    setProgressState(null);
    setLiveBodyState(null);
  }, []);

  const setLiveBody = useCallback((body: string | null) => {
    setLiveBodyState(body);
  }, []);

  const setResult = useCallback((next: WorkResult | null) => {
    setProgressState(null);
    setLiveBodyState(null);
    setResultState(next);
  }, []);

  const clearResult = useCallback(() => {
    setProgressState(null);
    setLiveBodyState(null);
    setResultState(null);
  }, []);

  const clearResultIfIdle = useCallback(() => {
    if (progressRef.current) return;
    setResultState(null);
    setLiveBodyState(null);
  }, []);

  const cancelProgress = useCallback(() => {
    setProgressState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.status === "active" || step.status === "pending"
            ? { ...step, status: "error" as const }
            : step,
        ),
      };
    });
    try {
      void window.office.cancelWork?.();
    } catch {
      // optional API
    }
  }, []);

  const startProgress = useCallback(
    (next: Omit<WorkProgress, "startedAt"> & { startedAt?: number }) => {
      setResultState(null);
      setLiveBodyState(null);
      setProgressState({
        ...next,
        startedAt: next.startedAt ?? nowMs(),
      });
    },
    [],
  );

  const setActiveStep = useCallback((stepId: string) => {
    setProgressState((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: markActive(prev.steps, stepId) };
    });
  }, []);

  const failProgress = useCallback((stepId?: string) => {
    setProgressState((prev) => {
      if (!prev) return prev;
      const target = stepId ?? prev.steps.find((step) => step.status === "active")?.id;
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.id === target || (!target && step.status === "active")
            ? { ...step, status: "error" as const }
            : step,
        ),
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      result,
      progress,
      liveBody,
      setResult,
      setLiveBody,
      startProgress,
      setActiveStep,
      failProgress,
      clearProgress,
      clearResult,
      clearResultIfIdle,
      cancelProgress,
    }),
    [
      result,
      progress,
      liveBody,
      setResult,
      setLiveBody,
      startProgress,
      setActiveStep,
      failProgress,
      clearProgress,
      clearResult,
      clearResultIfIdle,
      cancelProgress,
    ],
  );
  return <WorkResultContext.Provider value={value}>{children}</WorkResultContext.Provider>;
}

export function useWorkResult(): WorkResultApi {
  const value = useContext(WorkResultContext);
  if (!value) {
    throw new Error("useWorkResult must be used within WorkResultProvider");
  }
  return value;
}

export async function estimateOperationMs(
  operation: string,
  fallbackMs: number,
): Promise<number> {
  try {
    const rows = await window.office.getMeasurements();
    const matched = rows.filter((row) => row.operation === operation).slice(-5);
    if (matched.length === 0) return fallbackMs;
    const sum = matched.reduce((acc, row) => acc + row.totalMs, 0);
    return Math.max(1500, Math.round(sum / matched.length));
  } catch {
    return fallbackMs;
  }
}
