"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";

const NAV = [
  { label: "Overview",               path: "/dashboard",       match: ["/dashboard"],                        icon: "▪" },
  { label: "Information Harnessing", path: "/",                match: ["/"],                                 icon: "▪" },
  { label: "Knowledge Harnessing",   path: "/processing",      match: ["/processing"],                       icon: "▪" },
  { label: "Inference Harnessing",   path: "/query",           match: ["/query", "/planning"],               icon: "▪" },
  { label: "Outcome Harnessing",     path: "/recommendations", match: ["/recommendations"],                  icon: "▪" },
  { label: "Benchmarking",           path: "/benchmarking",    match: ["/benchmarking", "/wiki", "/quality"],icon: "▪" },
  { label: "Storage",                path: "/storage",         match: ["/storage"],                          icon: "▪" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [user, setUser] = useState("");

  useEffect(() => {
    const name = sessionStorage.getItem("domain_label") ?? "";
    setWorkspaceName(name);
    setIsProcessing(pathname === "/processing");
    setUser(localStorage.getItem("orch_user") ?? "admin");
  }, [pathname]);

  function handleLogout() {
    document.cookie = "orch_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("orch_logged_in");
    localStorage.removeItem("orch_user");
    router.replace("/login");
  }

  if (pathname === "/login") return null;

  const activeIndex = NAV.findIndex((s) => s.match.includes(pathname));

  return (
    <nav className="fixed top-0 left-0 bottom-0 z-50 w-64 flex flex-col bg-white border-r border-dborder"
         style={{ boxShadow: "1px 0 0 0 #e2e6f0" }}>

      {/* Brand */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-3 h-[60px] px-5 border-b border-dborder flex-shrink-0 hover:bg-bg2 transition-colors text-left w-full"
      >
        <div className="flex items-center justify-center flex-shrink-0 w-8 h-8">
          <Image src="/c5i-logo.png" alt="C5i" width={44} height={25} className="object-contain" priority />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-t1 leading-tight tracking-tight">Domain Harnessing</div>
          <div className="text-[11px] text-t3 leading-tight">System</div>
        </div>
      </button>

      {/* Active workspace chip */}
      {workspaceName && (
        <div className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 bg-bg2 border border-dborder rounded-lg flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isProcessing ? "bg-amber-500 animate-pulse" : "bg-green-500"}`} />
          <span className="text-[11px] font-medium text-t2 truncate">{workspaceName}</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-col mt-3 flex-1 overflow-y-auto px-2">
        {/* Section label */}
        <div className="px-3 mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-t3">Navigation</span>
        </div>

        {NAV.map((step, i) => {
          const isActive = activeIndex === i;
          return (
            <button
              key={i}
              onClick={() => router.push(step.path)}
              className={`
                relative w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
                transition-all duration-150 mb-0.5
                ${isActive
                  ? "bg-accent/8 text-accent"
                  : "text-t2 hover:bg-bg2 hover:text-t1"
                }
              `}
            >
              {/* Active left indicator */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-r" />
              )}
              <span className={`text-[10px] flex-shrink-0 ${isActive ? "text-accent" : "text-t3"}`}>
                {isActive ? "●" : "○"}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-dborder px-3 py-3 flex-shrink-0">
        {/* Status badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 mb-3 rounded-lg bg-bg2 border border-dborder">
          {isProcessing ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              <span className="text-[11px] font-medium text-amber-700">Processing…</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-[11px] font-medium text-green-700">System Ready</span>
            </>
          )}
        </div>

        {/* User row */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[11px] font-bold text-white uppercase select-none flex-shrink-0">
            {user.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-t1 truncate">{user}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-[11px] text-t3 hover:text-t1 px-2 py-1 rounded-md hover:bg-bg2 transition-colors flex-shrink-0"
          >
            ↩
          </button>
        </div>
      </div>
    </nav>
  );
}
