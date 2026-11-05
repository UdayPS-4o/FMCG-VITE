import { useEffect, useRef } from 'react';

/**
 * Canvas effects for festival themes (see context/FestivalThemeContext).
 *
 *   <FestiveBurst effect="rockets" | "chakri" playKey={n} />
 *       Full-screen overlay that plays once per playKey and then stops:
 *       rockets launch from the bottom edge (behind the bottom nav) for ~5 s;
 *       two chakris spin over the product tiles for ~2.5 s.
 *
 *   <FestiveLights />
 *       Fairy-light curtains + marigold toran filling its (relative) parent.
 *       Loops while on screen; pauses when scrolled away or the app is hidden.
 *
 * New festivals (snowfall, fireworks, ...) get a new effect here plus a matching
 * key in server/routes/app/festivalThemes.js EFFECTS.
 */

interface Particle {
    x: number; y: number; vx: number; vy: number;
    life: number; max: number; color: string; size: number;
    gravity?: number; twinkle?: boolean;
}

// Saturated colours only: the app's pages are near-white, so white/pale sparks would vanish
const BURST_COLORS = ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#ef4444', '#a855f7'];

/** Sizes a canvas to its CSS box at device pixel ratio (max 2) and returns its 2D context in CSS pixels. */
const fitCanvas = (canvas: HTMLCanvasElement) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: width, h: height };
};

const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
};

/** Soft radial glow. `color` must be '#rrggbb' so it can fade to the same colour at 0 alpha (fading to transparent black would leave a grey haze on light backgrounds). */
const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, `${color}00`);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
};

/**
 * Timing: all speeds/lifetimes are in "60 fps frames". Each frame advances by
 * dt = real elapsed time / 16.7 ms, so effects last the same on 60, 90 and
 * 120 Hz phones (and on slow phones that drop frames).
 */
const frameDelta = (now: number, last: number) => (last ? Math.min((now - last) / (1000 / 60), 3) : 1);

/** Moves, draws and culls particles; returns the survivors. */
const stepParticles = (ctx: CanvasRenderingContext2D, parts: Particle[], h: number, tick: number, dt: number) =>
    parts.filter(p => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.gravity ?? 0) * dt; p.vx *= 0.982 ** dt; p.life -= dt;
        const fade = Math.max(p.life / p.max, 0);
        dot(ctx, p.x, p.y, p.size, p.color, p.twinkle ? fade * (0.6 + 0.4 * Math.sin(tick / 3 + p.x)) : fade);
        return p.life > 0 && p.y < h + 10;
    });

/* ── One-shot overlay: rockets / chakri ─────────────────────────────────────── */

const ROCKET_LAUNCH_FRAMES = 300; // ~5 s of launches at 60 fps
const CHAKRI_FRAMES = 150;        // ~2.5 s, last 0.5 s fades out

export const FestiveBurst = ({ effect, playKey }: { effect: 'rockets' | 'chakri'; playKey: number }) => {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const { ctx, w, h } = fitCanvas(canvas);
        let parts: Particle[] = [];
        let rockets: { x: number; y: number; vy: number; color: string; targetY: number }[] = [];
        let tick = 0;
        let dt = 1;
        let last = 0;
        let nextLaunch = 1;
        let raf = 0;

        const rocketsFrame = () => {
            if (tick < ROCKET_LAUNCH_FRAMES && tick >= nextLaunch) {
                nextLaunch += 38;
                rockets.push({
                    x: w * (0.1 + Math.random() * 0.8),
                    y: h + 6, // bottom edge of the screen, behind the bottom nav
                    vy: -(h / 85 + Math.random() * 1.5),
                    color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
                    targetY: h * (0.12 + Math.random() * 0.25),
                });
            }
            rockets = rockets.filter(r => {
                r.y += r.vy * dt; r.vy *= 0.992 ** dt;
                parts.push({ x: r.x + (Math.random() - 0.5) * 2, y: r.y + 5, vx: (Math.random() - 0.5) * 0.4, vy: 0.8, life: 18, max: 18, color: Math.random() < 0.5 ? '#f97316' : '#f59e0b', size: 1.8 });
                if (r.y <= r.targetY) {
                    glow(ctx, r.x, r.y, 45, r.color, 0.6);
                    for (let k = 0; k < 64; k++) {
                        const a = (k / 64) * Math.PI * 2, sp = 1.6 + Math.random() * 2.6;
                        parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 65, max: 65, color: r.color, size: 2.2, gravity: 0.04, twinkle: true });
                    }
                    return false;
                }
                glow(ctx, r.x, r.y, 9, r.color, 0.7);
                ctx.globalAlpha = 1;
                ctx.fillStyle = r.color;
                ctx.fillRect(r.x - 1.5, r.y - 5, 3, 10);
                return true;
            });
            return tick < ROCKET_LAUNCH_FRAMES || rockets.length > 0;
        };

        // Two chakris over the product grid
        const chakris = [[w * 0.28, h * 0.58], [w * 0.7, h * 0.74]];
        const chakriFrame = () => {
            if (tick > CHAKRI_FRAMES) return false;
            const fade = tick > CHAKRI_FRAMES - 30 ? (CHAKRI_FRAMES - tick) / 30 : 1;
            const R = Math.min(w * 0.11, 46);
            chakris.forEach(([x, y], j) => {
                const a = tick * 0.42 * (j ? -1 : 1);
                glow(ctx, x, y, R * 2.4, '#ffaa3c', 0.45 * fade);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(a);
                ctx.globalAlpha = fade;
                ctx.lineWidth = Math.max(3, R / 7);
                ['#fff1c1', '#fbbf24', '#f97316', '#dc2626'].forEach((c, k) => {
                    ctx.strokeStyle = c;
                    ctx.beginPath();
                    ctx.arc(0, 0, R - k * (R / 5), 0, Math.PI * 1.55);
                    ctx.stroke();
                });
                ctx.restore();
                if (fade > 0.2) {
                    for (let k = 0, n = Math.round(9 * dt); k < n; k++) {
                        const b = a + (k * Math.PI * 2) / 9 + Math.random() * 0.2, sp = 3 + Math.random() * 3.5;
                        const color = Math.random() < 0.4 ? '#fff6d0' : Math.random() < 0.5 ? '#fbbf24' : '#fb923c';
                        parts.push({ x: x + Math.cos(b) * R, y: y + Math.sin(b) * R, vx: Math.cos(b + 1.35) * sp, vy: Math.sin(b + 1.35) * sp, life: 26, max: 26, color, size: 1.8, gravity: 0.06 });
                    }
                }
            });
            return true;
        };

        const frame = (now: number) => {
            dt = frameDelta(now, last);
            last = now;
            tick += dt;
            ctx.clearRect(0, 0, w, h);
            const emitting = effect === 'rockets' ? rocketsFrame() : chakriFrame();
            parts = stepParticles(ctx, parts, h, tick, dt);
            ctx.globalAlpha = 1;
            if (emitting || parts.length) raf = requestAnimationFrame(frame);
            else ctx.clearRect(0, 0, w, h);
        };
        raf = requestAnimationFrame(frame);

        // Stop immediately if the app goes to the background
        const onHide = () => { if (document.hidden) { cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h); } };
        document.addEventListener('visibilitychange', onHide);
        return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onHide); };
    }, [effect, playKey]);

    return (
        <canvas
            ref={ref}
            aria-hidden="true"
            // Below the bottom nav (z-50) so rockets rise from behind it
            className="pointer-events-none fixed inset-0 z-[45] h-full w-full"
        />
    );
};

/* ── Looping lights for the festive header ──────────────────────────────────── */

export const FestiveLights = () => {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        let { ctx, w, h } = fitCanvas(canvas);
        let tick = 0;
        let last = 0;
        let speckTimer = 0;
        let raf = 0;
        let visible = true;
        let parts: Particle[] = [];

        const makeStrands = () => {
            const n = Math.max(8, Math.round(w / 24));
            return Array.from({ length: n }, (_, i) => ({
                x: 6 + (i * (w - 12)) / (n - 1),
                len: h * (0.35 + ((i * 37) % 5) * 0.07 + (i % 2 ? -0.06 : 0)),
                phase: Math.random() * 6,
            }));
        };
        let strands = makeStrands();

        const draw = (now: number) => {
            const dt = frameDelta(now, last);
            last = now;
            tick += dt;
            speckTimer += dt;
            ctx.clearRect(0, 0, w, h);

            // Warm fairy-light curtain
            strands.forEach((s, i) => {
                const sway = Math.sin(tick / 70 + s.phase) * 1.5;
                ctx.globalAlpha = 0.9;
                ctx.strokeStyle = 'rgba(60,40,10,0.9)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(s.x, 20);
                ctx.lineTo(s.x + sway, 20 + s.len);
                ctx.stroke();
                for (let y = 32; y < 20 + s.len; y += 13) {
                    const f = (y - 20) / s.len, x = s.x + sway * f;
                    const tw = 0.65 + 0.35 * Math.sin(tick / 18 + i * 1.7 + y * 0.3);
                    glow(ctx, x, y, 11, '#ffbe5a', 0.35 * tw);
                    dot(ctx, x, y, 2.2, '#fff3d6', 0.95 * tw + 0.05);
                    dot(ctx, x, y, 1.1, '#ffffff', 1);
                }
            });

            // Marigold toran along the top, with hanging strings
            const beads = Math.round(w / 8);
            for (let i = 0; i <= beads; i++) {
                const x = (i / beads) * w, y = 8 + Math.sin((i / beads) * Math.PI * 3) * 4;
                dot(ctx, x, y, 5.2, i % 2 ? '#f59e0b' : '#fb923c', 1);
                dot(ctx, x - 1.5, y - 1.5, 2, '#fde68a', 0.7);
            }
            const hangs = Math.max(5, Math.round(w / 42));
            for (let k = 0; k < hangs; k++) {
                const x = ((k + 0.5) * w) / hangs;
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#15803d';
                ctx.beginPath();
                ctx.ellipse(x, 20, 4, 9, 0, 0, Math.PI * 2);
                ctx.fill();
                for (let j = 0; j < 5; j++) dot(ctx, x, 32 + j * 8, 3.6, j % 2 ? '#f59e0b' : '#ea580c', 1);
            }

            // Drifting golden specks
            if (speckTimer >= 8) {
                speckTimer -= 8;
                parts.push({ x: Math.random() * w, y: 20, vx: (Math.random() - 0.5) * 0.2, vy: 0.5 + Math.random() * 0.5, life: 240, max: 240, color: '#ffe6a8', size: 1.2, twinkle: true });
            }
            parts = stepParticles(ctx, parts, h, tick, dt);
            ctx.globalAlpha = 1;

            if (visible && !document.hidden) raf = requestAnimationFrame(draw);
        };

        // last = 0 so the first frame after a pause doesn't jump ahead
        const resume = () => { cancelAnimationFrame(raf); last = 0; if (visible && !document.hidden) raf = requestAnimationFrame(draw); };
        const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; resume(); });
        io.observe(canvas);
        const onResize = () => { ({ ctx, w, h } = fitCanvas(canvas)); strands = makeStrands(); };
        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', resume);
        resume();
        return () => {
            cancelAnimationFrame(raf);
            io.disconnect();
            window.removeEventListener('resize', onResize);
            document.removeEventListener('visibilitychange', resume);
        };
    }, []);

    return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
};
