import { Loader2, Clock, XCircle, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type JobStatus = "none" | "pending" | "processing" | "running" | "ready" | "failed" | "error";

interface AnalysisStatusBadgeProps {
  status: JobStatus;
  label?: string;
  showIcon?: boolean;
  showRetry?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
  className?: string;
  testId?: string;
}

const statusConfig: Record<JobStatus, {
  icon: typeof Loader2;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
  animate?: boolean;
  tooltip?: string;
}> = {
  none: {
    icon: AlertCircle,
    label: "Not Started",
    variant: "secondary",
    className: "text-muted-foreground bg-muted",
    tooltip: "Analysis hasn't started yet"
  },
  pending: {
    icon: Clock,
    label: "Queued",
    variant: "outline",
    className: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20",
    tooltip: "Waiting in queue to be processed"
  },
  processing: {
    icon: Loader2,
    label: "Processing",
    variant: "outline",
    className: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/20",
    animate: true,
    tooltip: "Currently being processed by AI"
  },
  running: {
    icon: Loader2,
    label: "Running",
    variant: "outline",
    className: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/20",
    animate: true,
    tooltip: "Job is currently running"
  },
  ready: {
    icon: CheckCircle,
    label: "Ready",
    variant: "default",
    className: "text-green-700 bg-green-100 dark:bg-green-950/30 border-green-200",
    tooltip: "Analysis complete and ready to view"
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    variant: "destructive",
    className: "bg-red-100 dark:bg-red-950/30 text-red-700 border-red-200",
    tooltip: "Analysis encountered an error"
  },
  error: {
    icon: XCircle,
    label: "Error",
    variant: "destructive",
    className: "bg-red-100 dark:bg-red-950/30 text-red-700 border-red-200",
    tooltip: "An error occurred"
  }
};

export function AnalysisStatusBadge({
  status,
  label,
  showIcon = true,
  showRetry = false,
  onRetry,
  isRetrying = false,
  compact = false,
  className = "",
  testId
}: AnalysisStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.none;
  const Icon = config.icon;
  const displayLabel = label || config.label;

  const badge = (
    <Badge
      variant={config.variant}
      className={`${config.className} ${compact ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"} ${className}`}
      data-testid={testId || `badge-status-${status}`}
    >
      {showIcon && (
        <Icon className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} mr-1 ${config.animate ? "animate-spin" : ""}`} />
      )}
      {displayLabel}
    </Badge>
  );

  if (showRetry && (status === "failed" || status === "error") && onRetry) {
    return (
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.tooltip}</p>
          </TooltipContent>
        </Tooltip>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={onRetry}
          disabled={isRetrying}
          data-testid="button-retry-job"
        >
          <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
        </Button>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent>
        <p>{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function AnalysisStatusIndicator({ 
  status, 
  label,
  onRetry,
  isRetrying,
  isStaff = false,
  adminLink,
  testId
}: {
  status: JobStatus;
  label: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  isStaff?: boolean;
  adminLink?: string;
  testId?: string;
}) {
  const config = statusConfig[status] || statusConfig.none;
  const Icon = config.icon;

  const getContent = () => {
    switch (status) {
      case "processing":
      case "running":
        return {
          title: `${label} in Progress`,
          description: "Our AI is processing the content. This typically takes 1-3 minutes.",
          showPulse: true
        };
      case "pending":
        return {
          title: `${label} Queued`,
          description: "This content is in line to be processed. It should start shortly.",
          showPulse: false
        };
      case "failed":
      case "error":
        return {
          title: `${label} Unavailable`,
          description: isStaff 
            ? "The job failed. Check the admin panel for details and retry if needed."
            : "We couldn't process this content. This can happen with quality issues.",
          showPulse: false
        };
      case "none":
      default:
        return {
          title: `No ${label}`,
          description: `${label} hasn't been generated for this content yet.`,
          showPulse: false
        };
    }
  };

  const { title, description, showPulse } = getContent();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center" data-testid={testId || `status-indicator-${status}`}>
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
        status === "processing" || status === "running" ? "bg-primary/10" :
        status === "failed" || status === "error" ? "bg-destructive/10" :
        status === "pending" ? "bg-amber-500/10" :
        "bg-muted"
      }`}>
        <Icon className={`w-8 h-8 ${
          status === "processing" || status === "running" ? "text-primary animate-spin" :
          status === "failed" || status === "error" ? "text-destructive" :
          status === "pending" ? "text-amber-500" :
          "text-muted-foreground"
        }`} />
      </div>
      
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm mb-4">{description}</p>
      
      {showPulse && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          Processing in progress...
        </div>
      )}
      
      {(status === "failed" || status === "error") && onRetry && (
        <Button 
          variant="outline" 
          onClick={onRetry}
          disabled={isRetrying}
          data-testid="button-retry-analysis"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRetrying ? "animate-spin" : ""}`} />
          Try Again
        </Button>
      )}
      
      {isStaff && adminLink && (status === "failed" || status === "error") && (
        <a href={adminLink} className="mt-2" data-testid="link-admin-jobs">
          <Button variant="ghost" className="text-xs text-primary hover:underline">
            View Job Details
          </Button>
        </a>
      )}
    </div>
  );
}

export function getStatusFromJobStatus(jobStatus: string | undefined | null): JobStatus {
  if (!jobStatus) return "none";
  switch (jobStatus.toLowerCase()) {
    case "pending":
      return "pending";
    case "running":
    case "processing":
      return "processing";
    case "completed":
    case "ready":
      return "ready";
    case "failed":
    case "error":
      return "failed";
    default:
      return "none";
  }
}
