import React, { useState } from 'react';

interface Stretchy3DToggleProps {
  checked: boolean;
  onChange: () => void;
  onLabel?: string;
  offLabel?: string;
  id?: string;
}

/**
 * Stretchy 3D Toggle — CSS recreation of the Spline "stretchy-toggle-3d" scene.
 * Renders a glossy pill track with a radial-gradient knob that elastically
 * stretches in the direction of travel, matching the reference design.
 */
const Stretchy3DToggle: React.FC<Stretchy3DToggleProps> = ({
  checked,
  onChange,
  onLabel = 'Cash',
  offLabel = 'Credit',
  id = 'stretchy-toggle',
}) => {
  const [stretching, setStretching] = useState(false);
  const [toRight, setToRight] = useState(false);

  const handleToggle = () => {
    if (stretching) return;
    setToRight(!checked);          // which direction the knob travels
    setStretching(true);
    onChange();
    setTimeout(() => setStretching(false), 420);
  };

  /* ── dimensions ───────────────────────────────────── */
  const W = 70, H = 36, R = H / 2;
  const KNOB = 26, PAD = 5;
  const knobLeft = checked ? W - KNOB - PAD : PAD;

  /* ── stretch: knob widens and the leading edge stays put ─── */
  const stretchW   = stretching ? KNOB + 10 : KNOB;
  const stretchLeft = stretching && !toRight
    ? knobLeft - 10          // moving left  → leading edge is left side
    : knobLeft;              // moving right → leading edge stays

  return (
    <div
      id={id}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, userSelect: 'none' }}
    >
      {/* ── off label ── */}
      <span style={{
        fontSize: 13, fontWeight: 600,
        color: !checked ? '#3b82f6' : '#9ca3af',
        transition: 'color .3s',
        letterSpacing: '.02em',
      }}>
        {offLabel}
      </span>

      {/* ── pill track ── */}
      <div
        role="switch"
        aria-checked={checked}
        onClick={handleToggle}
        style={{
          position: 'relative',
          width: W, height: H,
          borderRadius: R,
          cursor: 'pointer',
          flexShrink: 0,
          overflow: 'visible',          // let knob slightly overflow during stretch
          /* Glassy pill — changes colour with toggle state */
          background: checked
            ? 'linear-gradient(170deg,#bbf7d0 0%,#86efac 55%,#4ade80 100%)'
            : 'linear-gradient(170deg,#e5e7eb 0%,#d1d5db 100%)',
          boxShadow: checked
            ? 'inset 0 2px 6px rgba(16,185,129,.28), 0 1px 4px rgba(0,0,0,.10), 0 0 0 1.5px rgba(22,163,74,.25)'
            : 'inset 0 2px 6px rgba(0,0,0,.14), 0 1px 4px rgba(0,0,0,.08), 0 0 0 1.5px rgba(0,0,0,.10)',
          transition: 'background .35s ease, box-shadow .35s ease',
        }}
      >
        {/* inner top-shine strip */}
        <div style={{
          position: 'absolute',
          top: 3, left: 7, right: 7, height: 5,
          borderRadius: 3,
          background: 'rgba(255,255,255,.38)',
          pointerEvents: 'none',
        }} />

        {/* ── knob ── */}
        <div
          style={{
            position: 'absolute',
            top: (H - KNOB) / 2,
            left: stretchLeft,
            width: stretchW,
            height: KNOB,
            borderRadius: KNOB / 2,
            /* 3D radial gradient — red when OFF, green when ON */
            background: checked
              ? 'radial-gradient(circle at 36% 30%, #a7f3d0 0%, #34d399 38%, #059669 100%)'
              : 'radial-gradient(circle at 36% 30%, #fca5a5 0%, #f87171 38%, #dc2626 100%)',
            boxShadow: checked
              ? '0 3px 10px rgba(5,150,105,.55), inset 0 1px 2px rgba(255,255,255,.55)'
              : '0 3px 10px rgba(220,38,38,.42), inset 0 1px 2px rgba(255,255,255,.55)',
            /* Elastic spring for position + size, quick for colour */
            transition: [
              `left ${stretching ? '.22s ease-in' : '.38s cubic-bezier(.34,1.56,.64,1)'}`,
              `width .2s ease`,
              'background .35s ease',
              'box-shadow .35s ease',
            ].join(', '),
          }}
        />
      </div>

      {/* ── on label ── */}
      <span style={{
        fontSize: 13, fontWeight: 600,
        color: checked ? '#22c55e' : '#9ca3af',
        transition: 'color .3s',
        letterSpacing: '.02em',
      }}>
        {onLabel}
      </span>
    </div>
  );
};

export default Stretchy3DToggle;
