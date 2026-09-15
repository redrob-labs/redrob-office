import { useEffect, useRef } from "react";
import { useWorkResult } from "./work-result";
import type { WorkProgressEvent } from "../../shared/office-api";

/** Listens for main-process work stage events and advances ResultPane steps. */
export function WorkProgressListener(): null {
  const { progress, setActiveStep, failProgress } = useWorkResult();
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    return window.office.onWorkProgress((event: WorkProgressEvent) => {
      const current = progressRef.current;
      if (current && event.operation !== current.operation) return;
      if (event.status === "error") {
        failProgress(event.stepId);
        return;
      }
      setActiveStep(event.stepId);
    });
  }, [setActiveStep, failProgress]);

  return null;
}
