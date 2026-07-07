"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * DemoModeProvider — installs the fetch + EventSource mock interceptors
 * when NEXT_PUBLIC_DEMO_MODE=true and auto-logs in so the demo opens
 * straight to the dashboard without a password prompt.
 */
export default function DemoModeProvider() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Auto-login: set the same flags the login page sets
    if (typeof window !== "undefined") {
      document.cookie = "orch_logged_in=true; path=/; SameSite=Lax";
      localStorage.setItem("orch_logged_in", "true");
      localStorage.setItem("orch_user", "demo");

      // Pre-seed a domain so the sidebar workspace chip shows something
      if (!sessionStorage.getItem("domain_label")) {
        sessionStorage.setItem("domain_label", "supply_chain_logistics");
        sessionStorage.setItem("job_id", "job-sc-001");
      }

      // Redirect away from login if that's where we landed
      if (pathname === "/login") {
        router.replace("/dashboard");
      }
    }

    // Install mock interceptors dynamically (tree-shaken in production)
    import("../lib/mockFetch").then(({ installMockFetch, installMockEventSource }) => {
      installMockFetch();
      installMockEventSource();
      console.info(
        "%c[DHS DEMO MODE] All API calls intercepted with embedded demo data. No backend required.",
        "color:#6c5cf7;font-weight:700;font-size:12px"
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
