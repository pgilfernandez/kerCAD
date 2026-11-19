"use client";
import { useEffect } from "react";
import { addUsageBytes, reportUsage } from "@/lib/usageMetrics";
export function UsageMetrics() {
  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    const observer = typeof PerformanceObserver === "undefined" ? null : new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        const entry = item as PerformanceResourceTiming;
        if (!entry.name.includes("/api/admin/metrics")) addUsageBytes(entry.transferSize);
      }
    });
    try { observer?.observe({ type: "resource", buffered: true }); } catch { /* Resource timing is optional. */ }
    addUsageBytes((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.transferSize ?? 0);
    const click = (event: MouseEvent) => {
      const target = (event.target as Element).closest?.("a,button");
      if (!target) return;
      const icon = target.querySelector("[data-icon]")?.getAttribute("data-icon");
      if (icon === "github" || icon === "project-overview") reportUsage(icon === "project-overview" ? "overview" : icon);
      else if (target instanceof HTMLAnchorElement && target.pathname.startsWith("/documentation")) reportUsage("documentation");
    };
    reportUsage();
    const timer = window.setInterval(() => reportUsage(), 30000);
    const visibility = () => reportUsage();
    document.addEventListener("click", click, true); document.addEventListener("visibilitychange", visibility);
    return () => { observer?.disconnect(); clearInterval(timer); document.removeEventListener("click", click, true); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return null;
}
