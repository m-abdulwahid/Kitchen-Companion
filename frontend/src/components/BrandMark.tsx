"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BrandMarkProps = {
  src: string;
  alt: string;
  className?: string;
};

export function BrandMark({ src, alt, className }: BrandMarkProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const lightbox = open ? (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-espresso/55 p-6"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label={alt}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[80vh] max-w-[min(32rem,90vw)] bg-transparent object-contain drop-shadow-2xl"
      />
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge ${alt}`}
        className="rounded-xl bg-transparent p-0"
      >
        <img src={src} alt={alt} className={`bg-transparent object-contain ${className ?? ""}`} />
      </button>
      {mounted ? createPortal(lightbox, document.body) : null}
    </>
  );
}
