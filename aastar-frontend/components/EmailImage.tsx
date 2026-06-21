"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders an email address as a <canvas> image instead of DOM text, so HTML
 * scrapers / contact-harvesting bots can't read it. The address is assembled at
 * runtime from user+domain parts (never a literal "x@y" string in the markup),
 * drawn onto the canvas, and a copy button is offered for humans.
 */
export default function EmailImage({
  user,
  domain,
  className = "",
}: {
  user: string;
  domain: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  // Assemble only inside the component (kept out of the rendered HTML).
  const address = `${user}@${domain}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const fontPx = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(address).width) + 4;
    const h = fontPx + 8;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.textBaseline = "middle";
    // Theme-aware colour.
    const dark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = dark ? "#e2e8f0" : "#0f172a";
    ctx.fillText(address, 2, h / 2);
  }, [address]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <canvas ref={canvasRef} aria-label="email address (image)" />
      <button
        type="button"
        onClick={copy}
        className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2"
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
