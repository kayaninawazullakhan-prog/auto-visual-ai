"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Settings, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Sticky glass top bar: AUTO VISUAL AI wordmark + an animated pill tab nav.
 * The active pill is a single shared element animated between tabs with
 * framer-motion `layoutId`, so navigating slides the highlight smoothly.
 */
export function TopNav() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-primary to-indigo-500 shadow-lg shadow-primary/30 transition-transform group-hover:scale-105">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute inset-0 rounded-xl bg-primary/40 blur-md transition-opacity group-hover:opacity-80" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-sm font-bold tracking-tight text-transparent sm:text-base">
              AUTO VISUAL AI
            </span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:block">
              Video Studio
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 p-1 backdrop-blur-md">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4",
                  active
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-600/90 via-primary/90 to-indigo-500/90 shadow-lg shadow-primary/30"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10 hidden sm:inline">
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export default TopNav;
