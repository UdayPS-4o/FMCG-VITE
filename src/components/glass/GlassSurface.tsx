import React from "react";
import { Glass } from "glisse";
import { useTheme } from "../../context/ThemeContext";

/** True when the Glass Obsidian theme is active — the only theme that renders Glisse components. */
export const useGlisse = () => useTheme().theme === "glass-obsidian";

/**
 * A real Glisse liquid-glass layer behind a panel's content. Drop it as the
 * first child of any positioned container and add `has-glisse` to that
 * container; it fills the container, follows its corner radius and renders
 * nothing outside Glass Obsidian.
 */
const GlassSurface: React.FC<{ className?: string }> = ({ className = "" }) => {
  if (!useGlisse()) return null;
  return <Glass aria-hidden className={`glisse-surface ${className}`} />;
};

export default GlassSurface;
