import { useRef, useCallback } from "react";
import { useToast } from "./use-toast";

interface AggregatedError {
  key: string;
  count: number;
  firstMessage: string;
  timestamp: number;
}

const AGGREGATION_WINDOW_MS = 3000;
const MAX_AGGREGATED_ERRORS = 5;

const aggregatedErrors = new Map<string, AggregatedError>();
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

function getErrorKey(title: string, category?: string): string {
  return `${category || "default"}:${title}`;
}

export function useAggregatedToast() {
  const { toast, dismiss } = useToast();
  const activeToastId = useRef<string | null>(null);

  const flushErrors = useCallback(() => {
    if (aggregatedErrors.size === 0) {
      flushTimeout = null;
      return;
    }

    // Get all accumulated errors - no timestamp filter needed since we're flushing on timer
    const errors = Array.from(aggregatedErrors.values());

    if (errors.length === 1 && errors[0].count === 1) {
      toast({
        variant: "destructive",
        title: errors[0].firstMessage,
      });
    } else {
      const totalCount = errors.reduce((sum, e) => sum + e.count, 0);
      const uniqueTypes = errors.length;
      
      const description = errors
        .slice(0, MAX_AGGREGATED_ERRORS)
        .map(e => e.count > 1 ? `${e.firstMessage} (×${e.count})` : e.firstMessage)
        .join(", ");

      toast({
        variant: "destructive",
        title: `${totalCount} AI processing ${totalCount === 1 ? 'error' : 'errors'}`,
        description: uniqueTypes > MAX_AGGREGATED_ERRORS 
          ? `${description}, and ${uniqueTypes - MAX_AGGREGATED_ERRORS} more...`
          : description,
      });
    }

    aggregatedErrors.clear();
    flushTimeout = null;
  }, [toast]);

  const aggregatedError = useCallback((title: string, category?: string) => {
    const key = getErrorKey(title, category);
    const existing = aggregatedErrors.get(key);

    if (existing) {
      existing.count++;
      existing.timestamp = Date.now();
    } else {
      aggregatedErrors.set(key, {
        key,
        count: 1,
        firstMessage: title,
        timestamp: Date.now(),
      });
    }

    if (!flushTimeout) {
      flushTimeout = setTimeout(flushErrors, AGGREGATION_WINDOW_MS);
    }
  }, [flushErrors]);

  const clearAggregatedErrors = useCallback(() => {
    aggregatedErrors.clear();
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
  }, []);

  return {
    toast,
    dismiss,
    aggregatedError,
    clearAggregatedErrors,
  };
}
