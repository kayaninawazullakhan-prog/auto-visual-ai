"use client";

import "./aurora.css";

/**
 * Fixed, full-screen layered aurora that sits behind all app content.
 * Three drifting, screen-blended radial blobs (purple / indigo / violet) over a
 * faint perspective grid, plus a subtle noise/vignette for depth. Pure CSS
 * keyframes (transform/opacity only) so it stays cheap on the GPU and respects
 * `prefers-reduced-motion`.
 */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      {/* deep base wash */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0612] via-background to-[#080510]" />

      {/* drifting aurora blobs */}
      <div className="aurora-blob aurora-blob--a" />
      <div className="aurora-blob aurora-blob--b" />
      <div className="aurora-blob aurora-blob--c" />

      {/* faint perspective grid */}
      <div className="aurora-grid" />

      {/* top glow + bottom vignette to anchor content */}
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

export default AuroraBackground;
