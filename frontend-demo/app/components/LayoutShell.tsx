"use client";

import { usePathname } from "next/navigation";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  return (
    <div className={isLogin ? "" : "pl-60"}>
      {children}
    </div>
  );
}
