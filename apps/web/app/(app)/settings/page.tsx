import { Settings as SettingsIcon } from "lucide-react";

import { SettingsForm } from "@/components/settings-form";

export const metadata = {
  title: "Settings · AUTO VISUAL AI",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <SettingsIcon className="h-3.5 w-3.5 text-primary" />
          Configuration
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Settings
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Connect your AI models, storage, and providers. Secret keys are stored
          securely and never shown again — leave a field blank to keep its
          current value.
        </p>
      </header>

      <SettingsForm />
    </div>
  );
}
