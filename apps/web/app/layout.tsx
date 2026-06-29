import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "AUTO VISUAL AI",
  description:
    "Automatically turn a talking-head video into a professionally edited short-form video.",
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: ReactNode }) {
  const tree = (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );

  // Only mount ClerkProvider when keys exist, so the app renders without auth.
  return clerkEnabled ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
