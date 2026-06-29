import type { ReactNode } from "react";

import { AuroraBackground } from "@/components/aurora-background";
import { TopNav } from "@/components/top-nav";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <AuroraBackground />
      <TopNav />
      <main className="relative flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
