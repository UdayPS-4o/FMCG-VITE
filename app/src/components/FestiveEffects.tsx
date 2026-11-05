import { useEffect, useRef } from 'react';

/** Festive effects layer: above page content + bottom nav (50), below the promotion popup (90) */
export const FESTIVE_FX_Z = 60;

/**
 * Canvas effects for festival themes (see context/FestivalThemeContext).
 *
 *   <FestiveBurst effect="rockets" | "chakri" playKey={n} />
 *       Full-screen overlay that plays once per playKey and then stops:
 *       a fireworks show: rockets rise and burst over the whole screen for ~7 s;
 *       two decorated chakris spin and spray sparks over the tiles for ~4.5 s.
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

/* ── Fireworks show (rockets) ────────────────────────────────────────────────
   Real-looking rockets: a bright head with a tail of sparks rises on a ballistic
   arc and bursts near its apex into one of several shell types. Drawn with
   additive blending, and the canvas is faded a little each frame instead of
   cleared, so every spark leaves a long-exposure streak. Glitter twinkles down
   across the whole page while the show runs, ending in a finale salvo. */

interface Spark {
    x: number; y: number; px: number; py: number; vx: number; vy: number;
    life: number; max: number; color: string; size: number;
    drag: number; gravity: number;
    flicker?: boolean;   // glitter: random brightness each frame
    trail?: number;      // drops a falling gold spark every N frames (willow / palm)
    crackle?: boolean;   // pops into tiny white sparks when it dies
    trailTimer?: number;
}

interface Rocket {
    x: number; y: number; vx: number; vy: number;
    hist: { x: number; y: number }[];
    shell: ShellKind; colors: [string, string];
}

type ShellKind = 'peony' | 'willow' | 'ring' | 'crackle' | 'palm';
const SHELLS: ShellKind[] = ['peony', 'peony', 'willow', 'ring', 'crackle', 'palm'];
// [main, light] pairs; the light shade is the white-hot core of each colour
const SHELL_COLORS: [string, string][] = [
    ['#ff4d6d', '#ffd6de'], ['#ffd166', '#fff3c4'], ['#4dabf7', '#d0ebff'],
    ['#69db7c', '#d3f9d8'], ['#c77dff', '#f1dcff'], ['#ff922b', '#ffe8cc'],
];
const GOLD = ['#ffd27a', '#ffb347', '#fff1c1'];
const GLITTER = ['#ffffff', '#fff6d6', '#ffe08a'];

const SHOW_FRAMES = 420;      // ~7 s of launches at 60 fps
const FINALE_FROM = 340;      // last ~1.3 s: rapid salvo
const GRAVITY = 0.085;        // rocket gravity, px / frame²
const MAX_SPARKS = 1600;      // cap for slow phones

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const createFireworksShow = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const S = Math.max(0.8, Math.min(w, h) / 380); // burst size scales with the screen
    let sparks: Spark[] = [];
    let rockets: Rocket[] = [];
    let nextLaunch = 4;
    let flash = 0;
    let flashColor = '#ffffff';

    const spark = (s: Partial<Spark> & { x: number; y: number; vx: number; vy: number; color: string }) => {
        if (sparks.length >= MAX_SPARKS) return;
        const life = s.life ?? 60;
        sparks.push({ px: s.x, py: s.y, life, max: life, size: 1.6, drag: 0.975, gravity: 0.035, ...s } as Spark);
    };

    const launch = () => {
        const x = w * rand(0.12, 0.88);
        const apex = h * rand(0.1, 0.5); // anywhere in the top half, so bursts fill the page
        const startY = h + 10; // from behind the bottom nav
        rockets.push({
            x, y: startY,
            vx: rand(-0.35, 0.35) + (w / 2 - x) * 0.0015, // lean slightly towards the middle
            vy: -Math.sqrt(2 * GRAVITY * (startY - apex)),
            hist: [], shell: pick(SHELLS), colors: pick(SHELL_COLORS),
        });
    };

    const burst = (r: Rocket) => {
        const { x, y } = r;
        const [main, light] = r.colors;
        flash = Math.max(flash, 0.16);
        flashColor = r.shell === 'willow' || r.shell === 'palm' || r.shell === 'crackle' ? '#ffcf6b' : main;
        glow(ctx, x, y, 90 * S, light.length === 7 ? light : '#ffffff', 0.55);

        // White-hot core that dies fast
        for (let k = 0; k < 14; k++) {
            const a = Math.random() * Math.PI * 2, sp = rand(0.5, 2.2) * S;
            spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: '#ffffff', life: rand(12, 22), size: 2 });
        }

        switch (r.shell) {
            case 'peony': {
                const n = 110;
                for (let k = 0; k < n; k++) {
                    const a = (k / n) * Math.PI * 2 + Math.random() * 0.05;
                    const sp = (3.6 + Math.random() * 0.6) * S * (Math.random() < 0.25 ? 0.65 : 1); // shell edge + inner layer
                    spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: Math.random() < 0.12 ? light : main, life: rand(65, 90), size: 2.1, flicker: Math.random() < 0.3 });
                }
                break;
            }
            case 'willow': {
                for (let k = 0; k < 85; k++) {
                    const a = Math.random() * Math.PI * 2, sp = rand(2.2, 3.6) * S;
                    spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: pick(GOLD), life: rand(120, 160), size: 1.7, drag: 0.962, gravity: 0.03, trail: 3 });
                }
                break;
            }
            case 'ring': {
                const tilt = rand(0.35, 0.75), rot = Math.random() * Math.PI;
                for (let k = 0; k < 70; k++) {
                    const a = (k / 70) * Math.PI * 2, sp = 3.8 * S;
                    const cx = Math.cos(a) * sp, cy = Math.sin(a) * sp * tilt; // tilted circle
                    spark({ x, y, vx: cx * Math.cos(rot) - cy * Math.sin(rot), vy: cx * Math.sin(rot) + cy * Math.cos(rot), color: main, life: rand(70, 85), size: 2 });
                }
                for (let k = 0; k < 35; k++) {
                    const a = Math.random() * Math.PI * 2, sp = rand(0.8, 1.8) * S;
                    spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: light, life: rand(50, 70), size: 1.6, flicker: true });
                }
                break;
            }
            case 'crackle': {
                for (let k = 0; k < 90; k++) {
                    const a = Math.random() * Math.PI * 2, sp = rand(1.5, 4) * S;
                    spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: pick(GOLD), life: rand(45, 70), size: 1.6, crackle: true });
                }
                break;
            }
            case 'palm': {
                const arms = 9;
                for (let k = 0; k < arms; k++) {
                    const a = (k / arms) * Math.PI * 2 + rand(-0.1, 0.1), sp = rand(3.4, 4.2) * S;
                    spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, color: '#ffd27a', life: rand(90, 110), size: 3.2, drag: 0.972, gravity: 0.04, trail: 1 });
                }
                for (let k = 0; k < 40; k++) {
                    const a = Math.random() * Math.PI * 2, sp = rand(1, 2.5) * S;
                    spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: main, life: rand(50, 70), size: 1.6, flicker: true });
                }
                break;
            }
        }
    };

    /** One frame; returns false once the show is completely over. */
    return (tick: number, dt: number) => {
        // Long-exposure fade: keep ~75% of last frame
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(0,0,0,${1 - 0.75 ** dt})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';

        // Launch schedule: singles and pairs, then a finale salvo
        if (tick < SHOW_FRAMES && tick >= nextLaunch) {
            if (tick >= FINALE_FROM) { launch(); nextLaunch += rand(7, 12); }
            else {
                launch();
                if (Math.random() < 0.35) launch();
                nextLaunch += rand(26, 48);
            }
        }

        // Sky flash on bursts
        if (flash > 0.01) {
            ctx.globalAlpha = flash * 0.35;
            ctx.fillStyle = flashColor;
            ctx.fillRect(0, 0, w, h);
            flash *= 0.8 ** dt;
        }

        // Glitter drifting down over the whole page while the show runs
        if (tick < SHOW_FRAMES + 60) {
            for (let k = 0, n = Math.round(2 * dt); k < n; k++) {
                spark({ x: Math.random() * w, y: Math.random() * h * 0.7, vx: rand(-0.15, 0.15), vy: rand(0.3, 0.9), color: pick(GLITTER), life: rand(50, 90), size: rand(0.8, 1.6), drag: 0.995, gravity: 0.004, flicker: true });
            }
        }

        // Rockets
        rockets = rockets.filter(r => {
            r.hist.push({ x: r.x, y: r.y });
            if (r.hist.length > 10) r.hist.shift();
            r.vy += GRAVITY * dt;
            r.x += r.vx * dt + Math.sin(tick / 4 + r.x) * 0.15; // slight wobble
            r.y += r.vy * dt;

            // Tapered glowing tail
            for (let i = 1; i < r.hist.length; i++) {
                const t = i / r.hist.length;
                ctx.globalAlpha = t * 0.9;
                ctx.strokeStyle = t > 0.7 ? '#fff4d6' : '#ffb347';
                ctx.lineWidth = 0.6 + t * 2.4;
                ctx.beginPath();
                ctx.moveTo(r.hist[i - 1].x, r.hist[i - 1].y);
                ctx.lineTo(i === r.hist.length - 1 ? r.x : r.hist[i].x, i === r.hist.length - 1 ? r.y : r.hist[i].y);
                ctx.stroke();
            }
            // Sparks falling off the tail
            for (let k = 0, n = Math.round(2 * dt); k < n; k++) {
                spark({ x: r.x + rand(-1.5, 1.5), y: r.y + 4, vx: rand(-0.6, 0.6), vy: rand(0.5, 1.6), color: pick(GOLD), life: rand(14, 26), size: 1.2, drag: 0.96, gravity: 0.05 });
            }
            // Bright head
            glow(ctx, r.x, r.y, 10, '#ffe7a8', 0.9);
            dot(ctx, r.x, r.y, 1.8, '#ffffff', 1);

            if (r.vy >= -0.7) { burst(r); return false; } // apex
            return true;
        });

        // Sparks as short streaks (previous → current position)
        const born: Spark[] = [];
        sparks = sparks.filter(p => {
            p.px = p.x; p.py = p.y;
            p.vx *= p.drag ** dt; p.vy = p.vy * p.drag ** dt + p.gravity * dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.life -= dt;
            const f = Math.max(p.life / p.max, 0);
            let alpha = f < 0.35 ? f / 0.35 : 1;
            if (p.flicker) alpha *= Math.random() < 0.45 ? 0.25 : 1;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * (0.5 + 0.5 * f);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(p.x + 0.01, p.y + 0.01);
            ctx.stroke();

            if (p.trail) {
                p.trailTimer = (p.trailTimer ?? 0) + dt;
                if (p.trailTimer >= p.trail) {
                    p.trailTimer = 0;
                    born.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: rand(-0.2, 0.2), vy: rand(0.2, 0.6), life: 28, max: 28, color: pick(GOLD), size: 1, drag: 0.95, gravity: 0.03 });
                }
            }
            if (p.life <= 0) {
                if (p.crackle) {
                    for (let k = 0; k < 3; k++) {
                        const a = Math.random() * Math.PI * 2, sp = rand(0.6, 1.6);
                        born.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 10, max: 10, color: '#ffffff', size: 1.3, drag: 0.9, gravity: 0, flicker: true });
                    }
                }
                return false;
            }
            return p.y < h + 20 && p.x > -20 && p.x < w + 20;
        });
        if (born.length) sparks.push(...born.slice(0, Math.max(0, MAX_SPARKS - sparks.length)));

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        return tick < SHOW_FRAMES || rockets.length > 0 || sparks.length > 0;
    };
};

/* ── Chakri (ground spinner) ─────────────────────────────────────────────────
   Drawn like the real thing: a decorated paper wheel (spiral-striped outer coil,
   dotted yellow band, red band with yellow teeth, blue centre) spinning fast,
   with two fire jets on the rim spraying long streaks of gold / white sparks.
   It ignites and speeds up, burns for a few seconds, then slows and fades. */

const CHAKRI_FRAMES = 270;   // ~4.5 s at 60 fps
const CHAKRI_IGNITE = 24;    // spin-up
const CHAKRI_FADE = 45;      // slow down + fade at the end
const SPARK_COLORS = ['#ffffff', '#fff3c4', '#ffd166', '#ffb347', '#ff8c42'];

interface Streak { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; width: number }

const ring = (ctx: CanvasRenderingContext2D, r0: number, r1: number, color: string) => {
    ctx.beginPath();
    ctx.arc(0, 0, r1, 0, Math.PI * 2);
    ctx.arc(0, 0, r0, 0, Math.PI * 2, true);
    ctx.fillStyle = color;
    ctx.fill();
};

const dotRing = (ctx: CanvasRenderingContext2D, r: number, count: number, size: number, color: string, offset = 0) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
        const a = offset + (i / count) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, size, 0, Math.PI * 2);
        ctx.fill();
    }
};

/** The decorated chakri wheel, centred on (0,0), rotated by `angle`. */
const drawChakriDisc = (ctx: CanvasRenderingContext2D, R: number, angle: number) => {
    ctx.save();
    ctx.rotate(angle);

    // Outer coil: red with spiral white / yellow stripes (the wound fuse paper)
    ring(ctx, R * 0.74, R, '#c81e1e');
    const n = 18, step = (Math.PI * 2) / n, twist = 0.45;
    for (let i = 0; i < n; i++) {
        const a = i * step;
        ctx.beginPath();
        ctx.arc(0, 0, R, a, a + step * 0.42);
        ctx.arc(0, 0, R * 0.74, a + step * 0.42 + twist, a + twist, true);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ffd23f';
        ctx.fill();
    }
    ctx.lineWidth = Math.max(1.5, R * 0.04);
    ctx.strokeStyle = '#7a0f0f';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

    // Yellow band with red dots
    ring(ctx, R * 0.6, R * 0.74, '#ffd23f');
    dotRing(ctx, R * 0.67, 16, R * 0.035, '#c81e1e');

    // Red band with yellow teeth pointing outwards
    ring(ctx, R * 0.45, R * 0.6, '#e63946');
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, da = Math.PI / 14;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - da * 0.7) * R * 0.47, Math.sin(a - da * 0.7) * R * 0.47);
        ctx.lineTo(Math.cos(a) * R * 0.585, Math.sin(a) * R * 0.585);
        ctx.lineTo(Math.cos(a + da * 0.7) * R * 0.47, Math.sin(a + da * 0.7) * R * 0.47);
        ctx.closePath();
        ctx.fill();
    }

    // White ring, blue band with white dots, yellow ring, dark centre
    ring(ctx, R * 0.4, R * 0.45, '#ffffff');
    ring(ctx, R * 0.24, R * 0.4, '#1e40af');
    dotRing(ctx, R * 0.32, 10, R * 0.03, '#ffffff', 0.3);
    ring(ctx, R * 0.15, R * 0.24, '#ffd23f');
    ctx.fillStyle = '#0b1d51';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Fixed highlight (doesn't spin) so it reads as a glossy disc
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, 0, -R * 0.35, -R * 0.4, R * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
};

const createChakriShow = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const R = Math.max(34, Math.min(Math.min(w, h) * 0.14, 72));
    const S = R / 50;
    // Two chakris over the product grid, spinning opposite ways
    const wheels = [
        { x: w * 0.3, y: h * 0.58, dir: 1, angle: 0 },
        { x: w * 0.7, y: h * 0.76, dir: -1, angle: 1.3 },
    ];
    let sparks: Streak[] = [];

    return (tick: number, dt: number) => {
        ctx.clearRect(0, 0, w, h);
        const burning = tick < CHAKRI_FRAMES;
        // 0 -> 1 while igniting, 1 while burning, -> 0 at the end
        const power = !burning ? 0
            : tick < CHAKRI_IGNITE ? tick / CHAKRI_IGNITE
                : tick > CHAKRI_FRAMES - CHAKRI_FADE ? (CHAKRI_FRAMES - tick) / CHAKRI_FADE : 1;

        wheels.forEach(wl => {
            wl.angle += wl.dir * (0.08 + 0.34 * power) * dt;
            if (power <= 0) return;

            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, wl.x, wl.y, R * 3, '#ff9f43', 0.35 * power);
            glow(ctx, wl.x, wl.y, R * 1.6, '#ffe8a3', 0.35 * power);
            ctx.globalCompositeOperation = 'source-over';

            ctx.save();
            ctx.translate(wl.x, wl.y);
            ctx.globalAlpha = Math.min(1, power * 1.4);
            drawChakriDisc(ctx, R, wl.angle);
            ctx.restore();

            // Two fire jets on the rim; sparks fly backwards along the tangent (that is what spins it)
            for (let j = 0; j < 2; j++) {
                const na = wl.angle + j * Math.PI;
                const nx = wl.x + Math.cos(na) * R, ny = wl.y + Math.sin(na) * R;
                const tangent = na - wl.dir * (Math.PI / 2);
                const count = Math.round(rand(6, 9) * power * dt);
                for (let k = 0; k < count; k++) {
                    const a = tangent + rand(-0.35, 0.35);
                    const sp = rand(4, 9.5) * S * (0.6 + 0.4 * power);
                    const life = rand(14, 30);
                    sparks.push({ x: nx, y: ny, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color: pick(SPARK_COLORS), width: rand(1, 2.4) });
                }
                // White-hot flame at the nozzle
                ctx.globalCompositeOperation = 'lighter';
                glow(ctx, nx, ny, 12 * S, '#fff6d6', 0.9 * power);
                ctx.globalCompositeOperation = 'source-over';
            }
        });

        // Sparks as motion streaks
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        sparks = sparks.filter(p => {
            p.vx *= 0.965 ** dt;
            p.vy = p.vy * 0.965 ** dt + 0.14 * dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.life -= dt;
            const f = Math.max(p.life / p.max, 0);
            ctx.globalAlpha = f;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.width * (0.4 + 0.6 * f);
            ctx.beginPath();
            ctx.moveTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            // Occasional tiny star where a spark breaks up
            if (f < 0.4 && Math.random() < 0.05) dot(ctx, p.x, p.y, 1.4, '#ffffff', f * 2);
            return p.life > 0 && p.y < h + 20;
        });
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        return burning || sparks.length > 0;
    };
};

/* ── One-shot overlay: rockets / chakri ─────────────────────────────────────── */

export const FestiveBurst = ({ effect, playKey }: { effect: 'rockets' | 'chakri'; playKey: number }) => {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const { ctx, w, h } = fitCanvas(canvas);
        let tick = 0;
        let last = 0;
        let raf = 0;
        const show = effect === 'rockets' ? createFireworksShow(ctx, w, h) : createChakriShow(ctx, w, h);

        const frame = (now: number) => {
            const dt = frameDelta(now, last);
            last = now;
            tick += dt;
            if (show(tick, dt)) raf = requestAnimationFrame(frame);
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
            // In front of the page and bottom nav (z-50); below popups like the promotion (z-90)
            className="pointer-events-none fixed inset-0 h-full w-full"
            style={{ zIndex: FESTIVE_FX_Z }}
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
