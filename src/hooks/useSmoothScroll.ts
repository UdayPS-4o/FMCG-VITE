import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Lenis smooth scrolling for the page. Only the page itself is smoothed —
 * inner scroll areas (sidebar menu, dropdown lists, wide tables, modals) keep
 * native scrolling. Mark any element `data-lenis-prevent` to opt it out entirely.
 */
export default function useSmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.1,
      allowNestedScroll: true,   // inner overflow containers scroll natively
      anchors: true,
      stopInertiaOnNavigate: true,
      // Windows Server reports "reduce motion" by default (animations off), which
      // would silently disable smoothing on our office PCs — smooth regardless.
      respectReducedMotion: false,
    });

    // Our modals lock the page with body.style.overflow = "hidden"; Lenis's own
    // autoToggle only watches <html>, so pause it ourselves while the body is locked.
    const syncLock = () => {
      if (document.body.style.overflow === "hidden") lenis.stop();
      else lenis.start();
    };
    const observer = new MutationObserver(syncLock);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    syncLock();

    return () => {
      observer.disconnect();
      lenis.destroy();
    };
  }, []);
}
