"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";

// Left-sidebar navigation. Single source of nav truth.
// `match` lists every route that should highlight the entry — this is how the
// merged groups keep their secondary routes reachable while showing one nav item:
//   Inference Harnessing → /query   (also active on /planning)
//   Benchmarking         → /wiki    (also active on /quality)
const NAV = [
  { label: "Dashboard",             path: "/dashboard",       match: ["/dashboard"] },
  { label: "Knowledge Harnessing",  path: "/",                match: ["/"] },
  { label: "Information Harnessing", path: "/processing",     match: ["/processing"] },
  { label: "Inference Harnessing",  path: "/query",           match: ["/query", "/planning"] },
  { label: "Outcome Harnessing",    path: "/recommendations", match: ["/recommendations"] },
  { label: "Benchmarking",          path: "/benchmarking",    match: ["/benchmarking", "/wiki", "/quality"] },
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
    // Clear auth cookie
    document.cookie = "orch_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("orch_logged_in");
    localStorage.removeItem("orch_user");
    router.replace("/login");
  }

  // Don't render the sidebar on the login page
  if (pathname === "/login") return null;

  const activeIndex = NAV.findIndex((s) => s.match.includes(pathname));

  return (
    <nav className="fixed top-0 left-0 bottom-0 z-50 w-60 flex flex-col bg-white border-r border-dborder shadow-sm">
      {/* Brand */}
      <a
        className="flex items-center gap-3 font-sora font-bold text-lg text-t1 no-underline cursor-pointer flex-shrink-0 h-14 px-5 border-b border-dborder"
        onClick={() => router.push("/")}
      >
        <div className="flex items-center justify-center flex-shrink-0">
          <Image
            src="/c5i-logo.png"
            alt="C5i"
            width={48}
            height={27}
            className="object-contain"
            priority
          />
        </div>
        <span className="text-[15px] leading-tight">Domain Harnessing System</span>
      </a>

      {/* Workspace name */}
      {workspaceName && (
        <div className="flex items-center gap-2 px-3 py-1 bg-bg2 border border-dborder rounded-lg mx-4 mt-4 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: isProcessing ? "#d97706" : "#16a34a" }} />
          <span className="text-[12px] font-semibold text-t2 max-w-[140px] truncate">{workspaceName}</span>
        </div>
      )}

      {/* Step nav */}
      <div className="flex flex-col gap-0.5 px-3 mt-4 flex-1 overflow-y-auto">
        {NAV.map((step, i) => {
          const isActive = activeIndex === i;
          const isDone = activeIndex > i;
          return (
            <button
              key={i}
              onClick={() => router.push(step.path)}
              className={`
                w-full text-left px-3 py-2 rounded-full text-[12px] font-semibold tracking-wide border transition-all duration-150
                ${isActive
                  ? "bg-accent text-white border-accent shadow-[0_0_0_2px_rgba(124,106,248,0.25)]"
                  : isDone
                  ? "bg-accent/10 text-accent border-dborder2"
                  : "bg-transparent text-t3 border-transparent hover:text-t2 hover:bg-bg3"
                }
              `}
            >
              {step.label}
            </button>
          );
        })}
      </div>

      {/* Bottom: status + user */}
      <div className="flex flex-col gap-3 px-4 py-4 border-t border-dborder flex-shrink-0">
        {isProcessing ? (
          <span className="text-[11px] text-amber bg-amber/10 border border-amber/30 px-3 py-1 rounded-xl font-semibold animate-pulse text-center">
            ⚙ Processing
          </span>
        ) : (
          <span className="text-[11px] text-teal bg-teal/10 border border-teal/30 px-3 py-1 rounded-xl font-semibold text-center">
            ● Live
          </span>
        )}
        {/* User badge */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-white uppercase select-none flex-shrink-0">
            {user.slice(0, 1)}
          </div>
          <span className="text-[12px] font-semibold text-t2 truncate">{user}</span>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="ml-auto text-[11px] text-t3 hover:text-coral border border-dborder hover:border-coral/40 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
