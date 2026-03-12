"use client";

import type { TripStatus } from "@/types/route";

interface TripStatusBadgeProps {
  status: TripStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<TripStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  pending: { 
    label: "Pending", 
    color: "text-gray-700", 
    bgColor: "bg-gray-100", 
    icon: "⏳" 
  },
  in_progress: { 
    label: "In Progress", 
    color: "text-md-green", 
    bgColor: "bg-md-green/10", 
    icon: "🚀" 
  },
  paused: { 
    label: "Paused", 
    color: "text-md-yellow", 
    bgColor: "bg-md-yellow/10", 
    icon: "⏸" 
  },
  completed: { 
    label: "Completed", 
    color: "text-blue-600", 
    bgColor: "bg-blue-50", 
    icon: "✅" 
  },
  cancelled: { 
    label: "Cancelled", 
    color: "text-md-red", 
    bgColor: "bg-md-red/10", 
    icon: "✕" 
  },
};

export default function TripStatusBadge({ status, size = "md", showLabel = true }: TripStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  return (
    <span 
      className={`inline-flex items-center gap-1.5 rounded-full font-medium
                  ${config.bgColor} ${config.color} ${sizeClasses[size]}`}
    >
      <span className={status === "in_progress" ? "animate-pulse" : ""}>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
