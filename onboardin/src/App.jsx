import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import {
    normalizeEntityType,
    displayEntityType,
    ENTITY_TYPE_OPTIONS,
} from './lib/procedures';
import { LazySignPortal } from './lib/lazy-document-ui.jsx';
import { REGIONS, recommendEntity } from './lib/client-setup-ui.jsx';
import Dashboard from './components/Dashboard.jsx';
const LOGO_PNG = '/Onboardin.png';
const LOGO_SVG = '/favicon.svg';

// Hero crop: trims baked-in "Ai" suffix on video/PNG until CoJ branding releases full wordmark.
// Set both to 0 to show full assets.
const LOGO_CROP_LEFT = 0.15;
const LOGO_CROP_RIGHT = 0.30;

function logoCropSourceRect(width) {
    return {
        sourceX: width * LOGO_CROP_LEFT,
        sourceWidth: width * (1 - LOGO_CROP_LEFT - LOGO_CROP_RIGHT),
    };
}

function drawCroppedLogoFrame(ctx, canvas, image, width, height) {
    const { sourceX, sourceWidth } = logoCropSourceRect(width);
    if (canvas.width !== sourceWidth) canvas.width = sourceWidth;
    if (canvas.height !== height) canvas.height = height;
    ctx.drawImage(image, sourceX, 0, sourceWidth, height, 0, 0, sourceWidth, height);
}

// GreenScreen : chroma-key video first; PNG/SVG fades up only if MP4 cannot play
const GreenScreen = ({ videoUrl, onVideoEnd }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [useLogo, setUseLogo] = useState(false);
    const [logoEntered, setLogoEntered] = useState(false);

    const failToLogo = () => setUseLogo(true);

    useEffect(() => {
        if (!useLogo) {
            setLogoEntered(false);
            return;
        }
        const id = requestAnimationFrame(() => setLogoEntered(true));
        return () => cancelAnimationFrame(id);
    }, [useLogo]);

    useEffect(() => {
        if (!useLogo) return;
        let cancelled = false;

        const draw = (src) => {
            const img = new Image();
            img.onload = () => {
                if (cancelled) return;
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                drawCroppedLogoFrame(ctx, canvas, img, img.naturalWidth, img.naturalHeight);
            };
            img.onerror = () => {
                if (cancelled || src === LOGO_SVG) return;
                draw(LOGO_SVG);
            };
            img.src = src;
        };

        draw(LOGO_PNG);
        return () => { cancelled = true; };
    }, [useLogo]);

    useEffect(() => {
        let animationFrameId;

        const processFrame = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.paused || video.ended) return;

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const width = video.videoWidth;
            const height = video.videoHeight;

            drawCroppedLogoFrame(ctx, canvas, video, width, height);

            const { sourceWidth } = logoCropSourceRect(width);
            const frame = ctx.getImageData(0, 0, sourceWidth, height);
            const data = frame.data;

            // CHROMA KEY
            const similarity = 0.35;
            const smoothness = 0.12;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i + 0];
                const g = data[i + 1];
                const b = data[i + 2];

                const maxRB = Math.max(r, b);
                const greenness = (g - maxRB) / 255;

                if (greenness > similarity) {
                    const diff = greenness - similarity;
                    if (diff < smoothness) {
                        const alpha = 1 - (diff / smoothness);
                        data[i + 3] = alpha * 255;
                        data[i + 1] = maxRB;
                    } else {
                        data[i + 3] = 0;
                    }
                }
            }

            ctx.putImageData(frame, 0, 0);
            animationFrameId = requestAnimationFrame(processFrame);
        };

        if (isPlaying && !useLogo) {
            processFrame();
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, useLogo]);

    const handlePlay = () => {
        if(videoRef.current) {
            videoRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(e => {
                    console.error("Autoplay failed", e);
                    failToLogo();
                });
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isPlaying) failToLogo();
        }, 2000);
        return () => clearTimeout(timer);
    }, [isPlaying]);

    return (
        <div className="relative flex justify-center items-center w-full max-w-xl h-[35vh] md:h-[45vh]">
            <canvas
                ref={canvasRef}
                role="img"
                aria-label="Onboardin"
                className={`w-full h-full object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)] ${
                    useLogo
                        ? `transition-all duration-[1500ms] ease-out ${logoEntered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`
                        : 'transition-opacity duration-1000'
                }`}
                style={useLogo ? undefined : { opacity: isPlaying ? 1 : 0 }}
            />
            <video
                ref={videoRef}
                src={videoUrl}
                className="hidden"
                muted
                playsInline
                crossOrigin="anonymous"
                onLoadedData={handlePlay}
                onEnded={onVideoEnd}
                onError={failToLogo}
            />
        </div>
    );
};

// SolarSystemCanvas : orbital mechanics around the button
const MindMapCanvas = ({ active, copyRootRef }) => {
    const canvasRef = useRef(null);
    const stateRef = useRef(null);
    const rafRef = useRef(null);
    const activeRef = useRef(active);
    activeRef.current = active;
    const copyRootRefRef = useRef(copyRootRef);
    copyRootRefRef.current = copyRootRef;
    // Easter egg: planet labels show only while the user highlights landing copy (tagline).
    const selectingRef = useRef(false);
    useEffect(() => {
        const selectionTouchesLandingCopy = () => {
            const root = copyRootRefRef.current?.current;
            const sel = window.getSelection();
            if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
            if (!sel.toString().trim()) return false;
            return sel.containsNode(root, true);
        };
        const syncSelecting = () => {
            selectingRef.current = selectionTouchesLandingCopy();
        };
        document.addEventListener('selectionchange', syncSelecting);
        document.addEventListener('mouseup', syncSelecting);
        document.addEventListener('keyup', syncSelecting);
        return () => {
            document.removeEventListener('selectionchange', syncSelecting);
            document.removeEventListener('mouseup', syncSelecting);
            document.removeEventListener('keyup', syncSelecting);
        };
    }, []);

    // 11 planets, one per onboarding pipeline step (Account Created through First AI Agent Deployed).
    // Each has its own orbital plane (inclination), flatten ratio, and slightly different size.
    // Size reflects relative "weight" of the step in the client journey.
    // Colors echo the brand palette (blues/purples/magentas) with subtle variation.
    // Color palette also serves as the canonical Onboardin step-color system.
    // When these steps are built into the dashboard UI, the same colors carry through.
    // See documents/Onboardin - Brand Atom.md for the broader brand color reference.
    //
    // Orbital mechanics: each orbit is a real ellipse with an eccentricity (0 = circle, ~0.5 = elongated)
    // and rotation (inclination). Planets follow Kepler's second law - they sweep equal areas in equal
    // time, so they move FAST at perihelion (near point) and SLOW at aphelion (far point). This makes
    // them spend less time at the wide edges of the ellipse and more visible elsewhere.
    //
    // Inclinations are spread across the full unit circle so each planet's "wide axis" points in a
    // different direction. The combined effect: planets distribute across the whole canvas instead of
    // clustering on the left/right horizontal axis.
    //
    // baseSpeed is the mean orbital angular velocity (radians per frame).
    const PLANETS = [
        // Foundation
        { label: 'Account Created',          color: [125,211,252], orbit: 110, baseSpeed: 0.00120, phase: 0.00, inclination: 0.00,         eccentricity: 0.35, size: 3.0 }, // light blue : entry
        { label: 'Entity Formation',         color: [ 99,102,241], orbit: 130, baseSpeed: 0.00098, phase: 0.57, inclination: Math.PI*0.30, eccentricity: 0.28, size: 4.5 }, // deep indigo : foundational
        // Operations
        { label: 'Tax Registration',         color: [251,191, 36], orbit: 150, baseSpeed: 0.00081, phase: 1.14, inclination: Math.PI*0.55, eccentricity: 0.42, size: 3.5 }, // amber : treasury/tax
        { label: 'Business Banking',         color: [ 74,222,128], orbit: 168, baseSpeed: 0.00069, phase: 1.71, inclination: Math.PI*0.78, eccentricity: 0.32, size: 4.0 }, // green : money flow
        { label: 'IP & Contract Templates',  color: [139, 92,246], orbit: 184, baseSpeed: 0.00060, phase: 2.28, inclination: Math.PI*1.10, eccentricity: 0.45, size: 3.5 }, // deep purple : legal/binding
        { label: 'Privacy & Compliance',     color: [ 34,211,238], orbit: 198, baseSpeed: 0.00054, phase: 2.85, inclination: Math.PI*1.40, eccentricity: 0.25, size: 3.0 }, // cyan : shield/protective
        // Infrastructure
        { label: 'Landing Page Deployed',    color: [ 59,130,246], orbit: 211, baseSpeed: 0.00048, phase: 3.42, inclination: Math.PI*1.65, eccentricity: 0.38, size: 3.5 }, // blue : public-facing
        { label: 'Repository Provision',     color: [148,163,184], orbit: 222, baseSpeed: 0.00044, phase: 3.99, inclination: Math.PI*0.18, eccentricity: 0.30, size: 3.0 }, // slate : developer/technical
        { label: 'CRM Connection',           color: [129,140,232], orbit: 232, baseSpeed: 0.00040, phase: 4.56, inclination: Math.PI*0.42, eccentricity: 0.36, size: 3.5 }, // indigo : data connection
        { label: 'Analytics Live',           color: [ 45,212,191], orbit: 242, baseSpeed: 0.00037, phase: 5.13, inclination: Math.PI*0.92, eccentricity: 0.28, size: 3.0 }, // teal : data freshness
        { label: 'First AI Agent Deployed',  color: [192,132,252], orbit: 252, baseSpeed: 0.00034, phase: 5.70, inclination: Math.PI*1.25, eccentricity: 0.48, size: 4.5 }, // bright purple : AI/finale
    ];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const W = canvas.width = 820;
        const H = canvas.height = 560;
        const cx = W / 2, cy = H / 2;

        if (!stateRef.current) {
            stateRef.current = {
                planets: PLANETS.map(p => ({
                    ...p,
                    // current orbital angle starts at phase
                    theta: p.phase,
                    // current rendered radius (starts at 0, expands on hover)
                    r: 0,
                    // trail: last N positions
                    trail: [],
                    // smoothed label anchor position (lags planet so labels don't jitter)
                    lx: null,
                    ly: null,
                })),
                t: 0,
            };
        }
        const { planets } = stateRef.current;

        const tick = () => {
            stateRef.current.t++;
            const t = stateRef.current.t;
            // Keep orbits expanded while tagline is highlighted (mouse leaves button to select copy).
            const isActive = activeRef.current || selectingRef.current;

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, W, H);

            planets.forEach((p, i) => {
                // Smoothly grow/shrink orbital radius (the "expand into view" effect on hover)
                const targetR = isActive ? p.orbit : 0;
                p.r += (targetR - p.r) * 0.055;

                // === Keplerian motion (real orbital mechanics) ===
                // Semi-major axis a = current displayed radius
                // Eccentricity e is the planet's elongation (0 = circle, 0.5 = quite elongated)
                // Semi-minor axis b = a * sqrt(1 - e^2)
                // Heliocentric distance at current theta: r = a(1-e^2) / (1 + e*cos(theta))
                // Kepler's 2nd law: dθ/dt = baseSpeed * (a/r)^2
                //   (planets sweep equal areas in equal time, so they move FAST near the star
                //    at perihelion and SLOW at aphelion)
                const a = p.r;
                const e = p.eccentricity;
                const oneMinusE2 = 1 - e * e;
                const radiusAtTheta = a * oneMinusE2 / (1 + e * Math.cos(p.theta));
                const aOverR = a / Math.max(radiusAtTheta, 0.0001);
                // Speed boost while orbit is still expanding so planets feel "lively" on hover
                const expandBoost = 1 + Math.max(0, (p.orbit - p.r) / p.orbit) * 1.5;
                const angularVel = p.baseSpeed * aOverR * aOverR * expandBoost;
                p.theta += angularVel;

                // Position on ellipse (planet's own frame), then rotate by inclination.
                // Note: the focus of the ellipse sits at the center (where the button is),
                // so we offset the ellipse by a*e along x so the focus is at origin.
                const bMinor = a * Math.sqrt(oneMinusE2);
                const ex = a * Math.cos(p.theta) - a * e;  // focus-centered: shift by a*e
                const ey = bMinor * Math.sin(p.theta);
                const ci = Math.cos(p.inclination);
                const si = Math.sin(p.inclination);
                const x = cx + ex * ci - ey * si;
                const y = cy + ex * si + ey * ci;

                // trail
                p.trail.push({ x, y, a: 0.35 });
                if (p.trail.length > 38) p.trail.shift();

                if (p.r < 4) return; // collapsed, skip drawing

                const [r,g,b] = p.color;
                const presence = Math.min(1, p.r / p.orbit); // 0→1 as orbit expands

                // Orbit ring (faint ellipse) - drawn to match the actual Keplerian orbit:
                // - semi-major axis a, semi-minor axis bMinor = a*sqrt(1-e^2)
                // - focus-centered: shift the ellipse by a*e so the focus sits at the canvas center
                // - rotated by inclination so each planet's orbit has its own plane
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(p.inclination);
                ctx.translate(-a * e, 0);
                ctx.beginPath();
                ctx.ellipse(0, 0, a, bMinor, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${r},${g},${b},${0.06 * presence})`;
                ctx.lineWidth = 0.8;
                ctx.stroke();
                ctx.restore();

                // trail fade
                p.trail.forEach((pt, ti) => {
                    const tf = ti / p.trail.length;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 1.5 * tf, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${r},${g},${b},${tf * 0.25 * presence})`;
                    ctx.fill();
                });

                // thread to center : curved inward like gravity
                const cp1x = (x + cx) / 2 + (y - cy) * 0.3;
                const cp1y = (y + cy) / 2 - (x - cx) * 0.3;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(cp1x, cp1y, cx, cy);
                const pulseAlpha = (0.1 + 0.08 * Math.sin(t * 0.04 + i)) * presence;
                ctx.strokeStyle = `rgba(${r},${g},${b},${pulseAlpha})`;
                ctx.lineWidth = 0.8;
                ctx.setLineDash([4, 7]);
                ctx.lineDashOffset = -(t * 0.5);
                ctx.stroke();
                ctx.setLineDash([]);

                // planet dot with glow (size + glow radius scaled per planet)
                const glowRadius = p.size * 2.6;
                const grd = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
                grd.addColorStop(0, `rgba(${r},${g},${b},${0.9 * presence})`);
                grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = grd;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(x, y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r},${g},${b},${presence})`;
                ctx.shadowColor = `rgb(${r},${g},${b})`;
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;

                // Easter egg: labels show only while the landing tagline is highlighted.
                // Each planet is one of the 11 pipeline steps; the labels reveal what they map to.
                // To stop them flying around with the planet (hard to read), we smooth-track
                // the label's anchor position toward the planet over many frames, and clamp it
                // to the canvas bounds so long labels never get cut off at the edges.
                if (selectingRef.current && presence > 0.3 && p.label) {
                    // Smoothed anchor (lerp toward planet position, slow factor for stability)
                    if (p.lx == null) { p.lx = x; p.ly = y; }
                    p.lx += (x - p.lx) * 0.04;
                    p.ly += (y - p.ly) * 0.04;

                    const labelOffset = p.ly < cy ? -(p.size + 10) : (p.size + 16);
                    let labelY = p.ly + labelOffset;

                    ctx.font = `600 ${Math.round(9 * presence)}px Inter, sans-serif`;
                    // Mostly white with a hint of planet-color (mix ~75% white, 25% planet hue)
                    // so labels stay readable on dark backgrounds while still grouping with their planet.
                    const lr = Math.round(r * 0.25 + 255 * 0.75);
                    const lg = Math.round(g * 0.25 + 255 * 0.75);
                    const lb = Math.round(b * 0.25 + 255 * 0.75);
                    ctx.fillStyle = `rgba(${lr},${lg},${lb},${presence * 0.75})`;
                    ctx.textAlign = 'center';

                    // Clamp x so the label never gets cut off horizontally
                    const labelText = p.label.toUpperCase();
                    const halfTextWidth = ctx.measureText(labelText).width / 2;
                    const margin = 6;
                    const labelX = Math.max(halfTextWidth + margin, Math.min(W - halfTextWidth - margin, p.lx));

                    ctx.fillText(labelText, labelX, labelY);
                } else {
                    // Reset smoothed anchor when label is hidden so next reveal pops at planet
                    p.lx = null;
                    p.ly = null;
                }
            });

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [active]);

    return (
        <canvas
            ref={canvasRef}
            width={820}
            height={560}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ opacity: 1, width: 820, height: 560 }}
        />
    );
};

// Landing. Public marketing page
const Landing = ({ onNavigate, uiVisible, setUiVisible, onBrandKit, onElementsReady }) => {
    const [hovered, setHovered] = useState(false);
    const [showBrandPanel, setShowBrandPanel] = useState(false);
    const [elementsVisible, setElementsVisible] = useState(false);
    const landingCopyRef = useRef(null);

    const handleVideoEnd = () => setUiVisible(true);

    useEffect(() => {
        const timer = setTimeout(() => setUiVisible(true), 4000);
        return () => clearTimeout(timer);
    }, [setUiVisible]);

    useEffect(() => {
        if (!uiVisible) return;
        const timer = setTimeout(() => {
            setElementsVisible(true);
            onElementsReady?.();
        }, 1500);
        return () => clearTimeout(timer);
    }, [uiVisible]);

    const handleLogoClick = () => {
        setShowBrandPanel(v => !v);
    };

    return (<div className="flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden relative z-10">
            {/* Center logo. Clickable for brand kit */}
            <div
                className={`transition-all duration-[1500ms] ease-in-out cursor-pointer relative z-30 ${uiVisible ? 'scale-[0.65] opacity-90' : 'scale-100 opacity-100'}`}
                style={{ marginBottom: uiVisible ? '-4rem' : '0' }}
                onClick={handleLogoClick}
                title="Brand Kit"
            >
                <GreenScreen videoUrl="/Onboardin-Ongreen.mp4" onVideoEnd={handleVideoEnd} />
            </div>

            {/* Brand kit panel, slides in below logo, pushes button down */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${uiVisible && showBrandPanel ? 'max-h-32 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`}>
                <div className="flex items-center gap-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl px-6 py-4 mt-2">
                    <i className="ph ph-download-simple text-blue-400 text-lg flex-shrink-0"></i>
                    <div className="flex-1">
                        <p className="text-base font-bold text-white tracking-wide">Brand Kit</p>
                        <p className="text-sm text-gray-500 tracking-widest uppercase">Logos, colors & assets</p>
                    </div>
                    <button
                        onClick={() => { onBrandKit(); setShowBrandPanel(false); }}
                        className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-sm font-bold uppercase tracking-widest text-blue-300 hover:bg-blue-500/30 transition-all"
                    >
                        Download
                    </button>
                    <button onClick={() => setShowBrandPanel(false)} className="text-gray-600 hover:text-gray-300 transition-colors ml-1">
                        <i className="ph ph-x text-base"></i>
                    </button>
                </div>
            </div>

            {/* Button + orbit canvas */}
            <div className={`text-center z-10 transition-all duration-700 ${elementsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                <div
                    className="relative inline-block"
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    <MindMapCanvas active={hovered} copyRootRef={landingCopyRef} />
                    <button
                        onClick={onNavigate}
                        className="relative z-20 select-none px-12 py-4 rounded-full uppercase tracking-[0.35em] font-black text-base transition-all duration-[600ms] active:scale-95 bg-[#0d0820]/80 backdrop-blur-md border border-purple-500/25 text-purple-200/80 shadow-[0_0_18px_rgba(139,92,246,0.18),inset_0_0_18px_rgba(139,92,246,0.06)] hover:border-purple-400/50 hover:text-purple-100 hover:shadow-[0_0_32px_rgba(139,92,246,0.35),inset_0_0_24px_rgba(139,92,246,0.10)]"
                    >
                        Start Building
                    </button>
                </div>

                <p
                    ref={landingCopyRef}
                    className="text-gray-400 text-sm md:text-base mt-8 font-medium tracking-[0.5em] uppercase opacity-50 select-text"
                >
                    Launch faster. Scale smarter.
                </p>
            </div>
        </div>
    );
};

// Features. Service overview grid
const Features = ({ onDismiss, visible }) => {
    const features = [
        { icon: "ph-megaphone", title: "Marketing Automation", desc: "Marketing that never sleeps. We handle the campaign scheduling and cross-platform shipping while you focus on the product." },
        { icon: "ph-shield-check", title: "Digital Rights Management", desc: "IP protection for the paranoid. Secure your assets with automated DRM filing and ownership records that stand up to scrutiny." },
        { icon: "ph-robot", title: "AI Agents", desc: "Hire your first non-human team member. Specialized agents for the boring stuff: tax, legal, and operational overhead." },
        { icon: "ph-chart-line", title: "Accounting", desc: "Books that actually make sense. Real-time synchronization of every invoice and payroll detail. Zero surprises." },
        { icon: "ph-rocket-launch", title: "Business Development", desc: "Build momentum from day one. Move from zero to revenue with aggressive sprint cycles and growth playbooks." },
        { icon: "ph-paper-plane-tilt", title: "Emails", desc: "Delivery that isn't a gamble. Transactional pipes built to land in the inbox, not the junk folder." },
        { icon: "ph-receipt", title: "Taxes", desc: "The tax man won't bother you. Automated calculations and filing compliance built into your core workflow." },
        { icon: "ph-database", title: "Databases", desc: "Industrial strength data. Managed Postgres that scales as fast as your ambition. Professional infra, included." },
        { icon: "ph-scales", title: "Legal Compliance", desc: "Legal work without the legal bills. Auto-generated policies and consent tools that just work." }
    ];

    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    return (<>
            {/* Backdrop, full screen, click to dismiss */}
            <div
                className={`fixed inset-0 z-20 ${visible ? '' : 'pointer-events-none'}`}
                style={{
                    opacity: visible ? 1 : 0,
                    transition: `opacity 320ms ${ease}`,
                    backgroundColor: 'rgba(3, 2, 10, 0.35)',
                    backdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
                    WebkitBackdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
                }}
                onClick={onDismiss}
            />
            {/* Scrollable content. Pointer-events-none on wrapper so backdrop stays clickable at sides */}
            <div
                className={`fixed inset-0 z-30 overflow-y-auto pointer-events-none ${visible ? '' : 'invisible'}`}
                style={{
                    opacity: visible ? 1 : 0,
                    transition: `opacity 380ms ${ease}`,
                }}
            >
                <div className="min-h-full flex flex-col items-center py-28 px-8">
                    <div
                        className={`w-full max-w-3xl ${visible ? 'pointer-events-auto' : 'pointer-events-none'}`}
                        style={{
                            transform: visible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 14px, 0)',
                            transition: `transform 560ms ${ease}`,
                            willChange: 'transform, opacity',
                        }}
                    >
                        <div className="text-center mb-12">
                            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-4">Operational Excellence</h1>
                            <p className="text-gray-400 text-base md:text-base tracking-wider uppercase opacity-70">A complete suite for founders who value their time</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {features.map((f, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-white/20 transition-colors duration-300 group">
                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-300">
                                        <i className={`ph ${f.icon} text-2xl text-blue-400`}></i>
                                    </div>
                                    <h3 className="text-lg font-bold mb-3 uppercase tracking-wide">{f.title}</h3>
                                    <p className="text-gray-400 text-base leading-relaxed">{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

// Pricing. Tiered plans
const Pricing = ({ onContact, onDismiss, visible, onUpgrade, checkoutLoading }) => {
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const [yearly, setYearly] = React.useState(false);
    const monthlyPrice = 49;
    const yearlyMonthly = 39;
    const yearlyTotal = yearlyMonthly * 12;
    const price = yearly ? yearlyMonthly : monthlyPrice;
    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-20 ${visible ? '' : 'pointer-events-none'}`}
                style={{
                    opacity: visible ? 1 : 0,
                    transition: `opacity 320ms ${ease}`,
                    backgroundColor: 'rgba(3, 2, 10, 0.35)',
                    backdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
                    WebkitBackdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
                }}
                onClick={onDismiss}
            />
            <div
                className={`fixed inset-0 z-30 overflow-y-auto pointer-events-none ${visible ? '' : 'invisible'}`}
                style={{ opacity: visible ? 1 : 0, transition: `opacity 380ms ${ease}` }}
            >
                <div className="min-h-full flex flex-col items-center py-28 px-8">
                <div
                    className={`w-full max-w-3xl ${visible ? 'pointer-events-auto' : 'pointer-events-none'}`}
                    style={{
                        transform: visible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 14px, 0)',
                        transition: `transform 560ms ${ease}`,
                        willChange: 'transform, opacity',
                    }}
                >
                    <div className="text-center mb-10">
                        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-4">Plans for every stage</h1>
                        <p className="text-gray-400 text-sm tracking-wider uppercase opacity-70 mb-6">Grow at your own pace with modular business automation</p>
                        {/* Monthly / Yearly toggle */}
                        <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-2 py-1.5">
                            <button
                                onClick={() => setYearly(false)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${!yearly ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >Monthly</button>
                            <button
                                onClick={() => setYearly(true)}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${yearly ? 'bg-purple-500/30 text-purple-200' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Yearly
                                <span className="text-[9px] bg-green-500/20 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">Save 20%</span>
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                        {/* Starter */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col hover:border-white/20 transition-colors duration-300">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-blue-300 mb-2">Starter</h3>
                            <div className="text-4xl font-bold mb-6">$0 <span className="text-sm text-gray-500 font-normal">/mo</span></div>
                            <ul className="space-y-3 mb-8 text-sm text-gray-300 flex-1">
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Step-by-step formation guides</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Real-time accounting sync</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Formation Assistant access</li>
                                <li className="flex items-center gap-3 opacity-50"><i className="ph ph-x text-gray-600"></i> Automated compliance filings</li>
                            </ul>
                            <button onClick={onContact} className="w-full py-3 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors">Start Free</button>
                        </div>
                        {/* Growth */}
                        <div className="bg-gradient-to-b from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-2xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1 rounded-full whitespace-nowrap">Most Popular</div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-purple-300 mb-2">Growth</h3>
                            <div className="text-4xl font-bold mb-1">${price} <span className="text-sm text-gray-500 font-normal">/mo</span></div>
                            {yearly && <p className="text-xs text-green-400 mb-5">Billed ${yearlyTotal}/yr. Save ${(monthlyPrice - yearlyMonthly) * 12}/yr</p>}
                            {!yearly && <div className="mb-5" />}
                            <ul className="space-y-3 mb-8 text-sm text-gray-300 flex-1">
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Automated state filings</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Full integration suite</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Three specialized AI agents</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Priority response times</li>
                            </ul>
                            <button onClick={onUpgrade || onContact} disabled={checkoutLoading} className="w-full py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors disabled:opacity-50">
                                {checkoutLoading ? 'Redirecting…' : 'Get Started'}
                            </button>
                        </div>
                        {/* Enterprise */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col hover:border-white/20 transition-colors duration-300">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">Enterprise</h3>
                            <div className="text-4xl font-bold mb-6">Custom</div>
                            <ul className="space-y-3 mb-8 text-sm text-gray-300 flex-1">
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Turnkey incorporation & audit</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Unlimited users & models</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Dedicated account manager</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Custom compliance SLAs</li>
                            </ul>
                            <button onClick={onContact} className="w-full py-3 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors">Contact Sales</button>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        </>
    );
};

// Support : contact channels overlay
const Support = ({ onDismiss, onContact, visible }) => {
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    
    /*--- scaf ---*/
    const channels = [
        { icon: 'ph-envelope-simple', title: 'Email', desc: 'Direct line to our specialists. We usually reply within a few hours on business days.', action: 'support@onboardin.llc', href: 'mailto:support@onboardin.llc' },
        { icon: 'ph-lifebuoy', title: 'Priority Support', desc: 'Same-day responses and private Slack channels for our Growth and Enterprise partners.', action: 'Open ticket', form: true },
        { icon: 'ph-book-open', title: 'Knowledge Base', desc: 'Explore guides on entity formation, integrations, and operational automation.', action: 'Browse docs', href: 'mailto:support@onboardin.llc?subject=Docs%20request' },
        { icon: 'ph-chats-circle', title: 'Sales & Partnerships', desc: 'Custom integrations, enterprise volume, and reseller program inquiries.', action: 'Talk to sales', form: true },
    ];
    return (
        <>
            <div
                className="fixed inset-0 z-20"
                style={{
                    opacity: visible ? 1 : 0,
                    transition: `opacity 320ms ${ease}`,
                    backgroundColor: 'rgba(3, 2, 10, 0.35)',
                    backdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
                    WebkitBackdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
                }}
                onClick={onDismiss}
            />
            <div
                className="fixed inset-0 z-30 overflow-y-auto pointer-events-none"
                style={{
                    opacity: visible ? 1 : 0,
                    transition: `opacity 380ms ${ease}`,
                }}
            >
                <div className="min-h-full flex flex-col items-center py-28 px-8">
                    <div
                        className="w-full max-w-3xl pointer-events-auto"
                        style={{
                            transform: visible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 14px, 0)',
                            transition: `transform 560ms ${ease}`,
                            willChange: 'transform, opacity',
                        }}
                    >
                        <div className="text-center mb-12">
                            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-4">Direct Access</h1>
                            <p className="text-gray-400 text-base md:text-base tracking-wider uppercase opacity-70">Connect with our team or explore our knowledge base</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {channels.map((c, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-white/20 transition-colors duration-300 group flex flex-col">
                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                        <i className={`ph ${c.icon} text-2xl text-blue-400`}></i>
                                    </div>
                                    <h3 className="text-lg font-bold mb-3 uppercase tracking-wide">{c.title}</h3>
                                    <p className="text-gray-400 text-base leading-relaxed flex-1 mb-6">{c.desc}</p>
                                    {c.form ? (
                                        <button onClick={onContact} className="w-full py-3 border border-white/20 rounded-xl text-base font-bold uppercase tracking-wider hover:bg-white/10 transition-colors">{c.action}</button>
                                    ) : (
                                        <a href={c.href} className="w-full py-3 border border-white/20 rounded-xl text-base font-bold uppercase tracking-wider hover:bg-white/10 transition-colors text-center">{c.action}</a>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="text-center mt-10">
                            <p className="text-gray-500 text-sm tracking-widest uppercase">Average first response · under 4 hours</p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

// -- Signup --------------------------------------------------------------------

const Signup = ({ setCurrentView }) => {
    const [step, setStep] = useState(1);
    const [companyName, setCompanyName] = useState('');
    const [founderName, setFounderName] = useState('');
    const [workEmail, setWorkEmail] = useState('');
    const [fundingStage, setFundingStage] = useState('Pre-Seed');
    // Step 3. Jurisdiction + entity
    const [country, setCountry] = useState('United States');
    const [jurisdiction, setJurisdiction] = useState('');
    const [businessIntent, setBusinessIntent] = useState('');
    const [sellsTo, setSellsTo] = useState('');
    const [entityType, setEntityType] = useState('');
    const [entityOverride, setEntityOverride] = useState(false);
    // Step 3. Domain + email
    const [hasDomain, setHasDomain] = useState(null); // true | false | null
    const [existingDomain, setExistingDomain] = useState('');
    const [domainQuery, setDomainQuery] = useState('');
    const [domainResults, setDomainResults] = useState([]);
    const [domainSearching, setDomainSearching] = useState(false);
    const [chosenDomain, setChosenDomain] = useState('');
    const [hasBusinessEmail, setHasBusinessEmail] = useState(null); // true | false | null
    const [workspaceSeats, setWorkspaceSeats] = useState(1);
    const [workspacePlan, setWorkspacePlan] = useState('business_starter');
    // Step 5. Password
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const totalSteps = 5;

    /*--- scaf ---*/
    const recommendation = recommendEntity(fundingStage, businessIntent, sellsTo, country);

    const handleStep1 = (e) => { e.preventDefault(); setError(''); setStep(2); };
    const handleStep2 = (e) => {
        e.preventDefault();
        setError('');
        // Pre-fill domain query from company name
        if (!domainQuery) setDomainQuery(companyName.toLowerCase().replace(/[^a-z0-9]/g, ''));
        setStep(3);
    };
    const handleStep3 = (e) => {
        e.preventDefault();
        setError('');
        if (!entityOverride) setEntityType(recommendation.entity);
        setStep(4);
    };
    const handleStep4 = (e) => { e.preventDefault(); setError(''); setStep(5); };

    const handleDomainSearch = async () => {
        if (!domainQuery.trim()) return;
        setDomainSearching(true);
        setDomainResults([]);
        try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            const res = await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/domain-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA',
                    ...(authSession ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
                },
                body: JSON.stringify({ domain: domainQuery }),
            });
            const json = await res.json();
            setDomainResults(json.results || []);
        } catch {
            setDomainResults([]);
        }
        setDomainSearching(false);
    };

    const handleCreateAccount = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
        if (!supabase) { setError('Auth not configured.'); return; }
        setLoading(true);
        const finalDomain = hasDomain ? existingDomain : chosenDomain;
        const { error } = await supabase.auth.signUp({
            email: workEmail,
            password,
            options: {
                data: {
                    company_name: companyName,
                    founder_name: founderName,
                    funding_stage: fundingStage,
                    country,
                    jurisdiction,
                    entity_type: normalizeEntityType(entityType || recommendation.entity),
                    business_intent: businessIntent,
                    sells_to: sellsTo,
                    domain: finalDomain || null,
                    domain_owned: hasDomain ?? null,
                    workspace_plan: hasBusinessEmail === false ? workspacePlan : null,
                    workspace_seats: hasBusinessEmail === false ? workspaceSeats : null,
                },
            },
        });
        setLoading(false);
        if (error) { setError(error.message); return; }
        setSuccess(true);
    };

    const inputClass = "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-base text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all";
    const labelClass = "block text-sm uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors";

    return (
        <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] flex flex-col items-center min-h-[60vh] relative z-10">
            <div className="w-full max-w-md">
                <div className="mb-10 text-center">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-3">Get Started</h1>
                    <p className="text-base text-gray-400 uppercase tracking-widest opacity-70">Client intake: should take about a minute</p>
                </div>

                {success ? (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center space-y-6">
                        <div className="w-12 h-12 bg-green-400/10 rounded-full flex items-center justify-center mx-auto">
                            <i className="ph ph-check-circle text-2xl text-green-400"></i>
                        </div>
                        <div className="space-y-1">
                            <p className="text-base font-bold text-white">You're in.</p>
                            <p className="text-base text-gray-400 leading-relaxed">Check your email to confirm your address. You can explore your dashboard in the meantime.</p>
                        </div>
                        <button onClick={() => setCurrentView('dashboard')} className="w-full py-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-purple-500/30 rounded-lg text-base font-bold uppercase tracking-wider text-purple-200 hover:from-blue-500/30 hover:to-purple-500/30 transition-all">Go to Dashboard →</button>
                    </div>
                ) : (
                    <>
                        {/* Step indicator */}
                        <div className="flex items-center gap-2 justify-center mb-8">
                            {Array.from({ length: totalSteps }, (_, i) => (
                                <div key={i} className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i < step ? 'bg-purple-500' : 'bg-white/10'}`} />
                            ))}
                        </div>
                        <p className="text-sm uppercase tracking-widest text-gray-500 text-center mb-6">Step {step} of {totalSteps}</p>

                        {/* Step 1: Company info */}
                        {step === 1 && (
                            <form onSubmit={handleStep1} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                <div className="group"><label className={labelClass}>Company Name</label><input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} required className={inputClass} placeholder="Acme Corp" /></div>
                                <div className="group"><label className={labelClass}>Founder Name</label><input type="text" value={founderName} onChange={e => setFounderName(e.target.value)} required className={inputClass} placeholder="Jane Smith" /></div>
                                <div className="group"><label className={labelClass}>Work Email</label><input type="email" value={workEmail} onChange={e => setWorkEmail(e.target.value)} required className={inputClass} placeholder="jane@acmecorp.com" /></div>
                                <div className="group">
                                    <label className={labelClass}>Funding Stage</label>
                                    <select value={fundingStage} onChange={e => setFundingStage(e.target.value)} required className={`${inputClass} appearance-none cursor-pointer`}>
                                        <option value="Pre-Seed">Pre-Seed</option>
                                        <option value="Seed">Seed</option>
                                        <option value="Series A">Series A</option>
                                        <option value="Series B+">Series B+</option>
                                    </select>
                                </div>
                                <button type="submit" className="w-full py-4 mt-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-base font-bold uppercase tracking-wider transition-all">Continue</button>
                            </form>
                        )}

                        {/* Step 2: Jurisdiction + intent */}
                        {step === 2 && (
                            <form onSubmit={handleStep2} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                <div className="group">
                                    <label className={labelClass}>Country / Region</label>
                                    <select value={country} onChange={e => { setCountry(e.target.value); setJurisdiction(''); }} required className={`${inputClass} appearance-none cursor-pointer`}>
                                        {Object.keys(REGIONS).map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div className="group">
                                    <label className={labelClass}>{country === 'United States' ? 'State' : country === 'Canada' ? 'Province / Territory' : 'Country'}</label>
                                    <select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} required className={`${inputClass} appearance-none cursor-pointer`}>
                                        <option value="">Select your region</option>
                                        {(REGIONS[country] || []).map(j => <option key={j} value={j}>{j}</option>)}
                                    </select>
                                </div>
                                <div className="group">
                                    <label className={labelClass}>What are you building?</label>
                                    <input type="text" value={businessIntent} onChange={e => setBusinessIntent(e.target.value)} className={inputClass} placeholder="e.g. SaaS platform for HR teams" />
                                </div>
                                <div className="group">
                                    <label className={labelClass}>Who do you sell to?</label>
                                    <select value={sellsTo} onChange={e => setSellsTo(e.target.value)} className={`${inputClass} appearance-none cursor-pointer`}>
                                        <option value="">Select your target market</option>
                                        <option value="b2b">Businesses (B2B)</option>
                                        <option value="b2c">Consumers (B2C)</option>
                                        <option value="b2b2c">Both (B2B2C)</option>
                                        <option value="enterprise">Enterprise</option>
                                        <option value="government">Government / Public sector</option>
                                        <option value="nonprofit">Non-profits / NGOs</option>
                                    </select>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setStep(1)} className="py-4 px-4 border border-white/10 rounded-lg text-sm uppercase tracking-widest text-gray-500 hover:text-white transition-all">← Back</button>
                                    <button type="submit" className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-base font-bold uppercase tracking-wider transition-all">Continue</button>
                                </div>
                                <button type="button" onClick={() => { setJurisdiction(''); setStep(3); }} className="w-full py-2 text-sm uppercase tracking-wider text-gray-500 hover:text-purple-300 transition-colors">Decide later</button>
                            </form>
                        )}

                        {/* Step 3: Domain + business email */}
                        {step === 3 && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                {/* Domain */}
                                <div>
                                    <p className="text-sm uppercase tracking-widest text-gray-500 mb-4">Business Domain</p>
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        {[{ val: true, label: 'I have one', icon: 'ph-check' }, { val: false, label: 'Need one', icon: 'ph-magnifying-glass' }].map(opt => (
                                            <button key={String(opt.val)} type="button" onClick={() => { setHasDomain(opt.val); setChosenDomain(''); setDomainResults([]); }}
                                                className={`flex items-center gap-2 justify-center py-3 rounded-xl border text-base font-bold uppercase tracking-widest transition-all ${hasDomain === opt.val ? 'border-purple-500/50 bg-purple-500/10 text-purple-200' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                                                <i className={`ph ${opt.icon}`}></i>{opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {hasDomain === true && (
                                        <input type="text" value={existingDomain} onChange={e => setExistingDomain(e.target.value)} placeholder="yourbusiness.com" className={inputClass} />
                                    )}
                                    {hasDomain === false && (
                                        <div className="space-y-3">
                                            <div className="flex gap-2">
                                                <input type="text" value={domainQuery} onChange={e => setDomainQuery(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleDomainSearch())}
                                                    placeholder="yourbusiness" className={`${inputClass} flex-1`} />
                                                <button type="button" onClick={handleDomainSearch} disabled={domainSearching || !domainQuery}
                                                    className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-sm font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                                    {domainSearching ? '…' : 'Search'}
                                                </button>
                                            </div>
                                            {domainResults.length > 0 && (
                                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                                    {domainResults.map(r => (
                                                        <div key={r.domain} onClick={() => r.available && setChosenDomain(r.domain)}
                                                            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${!r.available ? 'border-white/5 opacity-40 cursor-not-allowed' : chosenDomain === r.domain ? 'border-purple-500/50 bg-purple-500/10 cursor-pointer' : 'border-white/10 hover:border-white/20 cursor-pointer'}`}>
                                                            <div className="flex items-center gap-2">
                                                                {chosenDomain === r.domain
                                                                    ? <i className="ph ph-check-circle text-purple-400 text-base"></i>
                                                                    : r.available
                                                                        ? <i className="ph ph-circle text-green-400 text-base"></i>
                                                                        : <i className="ph ph-x-circle text-gray-600 text-base"></i>}
                                                                <span className="text-base text-white">{r.domain}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                {r.available
                                                                    ? <span className="text-base text-green-400">{r.price}/yr</span>
                                                                    : <span className="text-sm text-gray-600 uppercase tracking-widest">Taken</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {domainResults.length === 0 && !domainSearching && (
                                                <p className="text-sm text-gray-600 italic">Search to see available domains. We register it on your behalf and set up DNS.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Business email */}
                                <div>
                                    <p className="text-sm uppercase tracking-widest text-gray-500 mb-4">Business Email</p>
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        {[{ val: true, label: 'I have one', icon: 'ph-check' }, { val: false, label: 'Set one up', icon: 'ph-envelope' }].map(opt => (
                                            <button key={String(opt.val)} type="button" onClick={() => setHasBusinessEmail(opt.val)}
                                                className={`flex items-center gap-2 justify-center py-3 rounded-xl border text-base font-bold uppercase tracking-widest transition-all ${hasBusinessEmail === opt.val ? 'border-purple-500/50 bg-purple-500/10 text-purple-200' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                                                <i className={`ph ${opt.icon}`}></i>{opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {hasBusinessEmail === false && (
                                        <div className="space-y-3">
                                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <i className="ph ph-google-logo text-blue-400 text-xl"></i>
                                                    <div>
                                                        <p className="text-base font-bold text-white">Google Workspace</p>
                                                        <p className="text-sm text-gray-500">Professional email, Drive, Meet, and more</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {[
                                                        { id: 'business_starter', label: 'Business Starter', price: '$6/user/mo', desc: '30 GB Drive, Meet, Chat' },
                                                        { id: 'business_standard', label: 'Business Standard', price: '$12/user/mo', desc: '2 TB Drive, recordings' },
                                                    ].map(plan => (
                                                        <div key={plan.id} onClick={() => setWorkspacePlan(plan.id)}
                                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${workspacePlan === plan.id ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 hover:border-white/20'}`}>
                                                            <p className="text-base font-bold text-white mb-0.5">{plan.label}</p>
                                                            <p className="text-sm text-blue-300 mb-1">{plan.price}</p>
                                                            <p className="text-sm text-gray-500">{plan.desc}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <label className="text-sm uppercase tracking-widest text-gray-500 whitespace-nowrap">Seats</label>
                                                    <div className="flex items-center gap-2">
                                                        <button type="button" onClick={() => setWorkspaceSeats(s => Math.max(1, s - 1))} className="w-7 h-7 border border-white/10 rounded text-gray-300 hover:border-white/30 transition-all text-base">−</button>
                                                        <span className="text-base text-white w-6 text-center">{workspaceSeats}</span>
                                                        <button type="button" onClick={() => setWorkspaceSeats(s => Math.min(50, s + 1))} className="w-7 h-7 border border-white/10 rounded text-gray-300 hover:border-white/30 transition-all text-base">+</button>
                                                    </div>
                                                    <span className="text-sm text-gray-500 ml-2">
                                                        ≈ {workspacePlan === 'business_starter' ? `$${6 * workspaceSeats}` : `$${12 * workspaceSeats}`}/mo
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 leading-relaxed">We set up the workspace, configure your domain's MX records, and deliver login credentials. Billed directly through Onboardin.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setStep(2)} className="py-4 px-4 border border-white/10 rounded-lg text-sm uppercase tracking-widest text-gray-500 hover:text-white transition-all">← Back</button>
                                    <button type="button" onClick={handleStep3} className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-base font-bold uppercase tracking-wider transition-all">Continue</button>
                                </div>
                                <button type="button" onClick={() => setStep(4)} className="w-full py-2 text-sm uppercase tracking-wider text-gray-500 hover:text-purple-300 transition-colors">Decide later</button>
                            </div>
                        )}

                        {/* Step 4: Entity recommendation */}
                        {step === 4 && (
                            <form onSubmit={handleStep4} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                <div>
                                    <p className="text-sm uppercase tracking-widest text-gray-500 mb-4">Recommended structure</p>
                                    {!entityOverride ? (
                                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-base font-bold text-white">{displayEntityType(recommendation.entity)}</span>
                                                <span className="text-sm uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full">Recommended</span>
                                            </div>
                                            <p className="text-base text-gray-400 leading-relaxed">{recommendation.reason}</p>
                                        </div>
                                    ) : (
                                        <div className="group">
                                            <label className={labelClass}>Entity Type</label>
                                            <select value={entityType} onChange={e => setEntityType(e.target.value)} required className={`${inputClass} appearance-none cursor-pointer`}>
                                                <option value="">Select your entity type</option>
                                                {ENTITY_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <button type="button" onClick={() => { setEntityOverride(v => !v); setEntityType(''); }} className="mt-3 text-sm uppercase tracking-widest text-gray-500 hover:text-purple-300 transition-colors">
                                        {entityOverride ? '← Use recommendation' : 'I know what I need →'}
                                    </button>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setStep(3)} className="py-4 px-4 border border-white/10 rounded-lg text-sm uppercase tracking-widest text-gray-500 hover:text-white transition-all">← Back</button>
                                    <button type="submit" className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-base font-bold uppercase tracking-wider transition-all">Continue</button>
                                </div>
                                <button type="button" onClick={() => setStep(5)} className="w-full py-2 text-sm uppercase tracking-wider text-gray-500 hover:text-purple-300 transition-colors">Decide later</button>
                            </form>
                        )}

                        {/* Step 5: Password */}
                        {step === 5 && (
                            <form onSubmit={handleCreateAccount} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                <div className="group"><label className={labelClass}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className={inputClass} placeholder="••••••••••••" /></div>
                                <div className="group"><label className={labelClass}>Confirm Password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={inputClass} placeholder="••••••••••••" /></div>
                                {error && <p className="text-red-400 text-sm uppercase tracking-widest">{error}</p>}
                                <button type="submit" disabled={loading} className="w-full py-4 mt-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-base font-bold uppercase tracking-wider transition-all disabled:opacity-40">
                                    {loading ? 'Creating Account…' : 'Create Account'}
                                </button>
                                <button type="button" onClick={() => { setStep(4); setError(''); }} className="w-full py-2 text-sm uppercase tracking-wider text-gray-500 hover:text-purple-300 transition-colors">← Back</button>
                            </form>
                        )}
                    </>
                )}

                <div className="mt-8 text-center">
                    <p className="text-sm uppercase tracking-wider text-gray-500 hover:text-purple-300 transition-colors cursor-pointer" onClick={() => setCurrentView('dashboard')}>
                        Already have access? Sign in
                    </p>
                </div>
            </div>
        </div>
    );
};

// GalaxyBackground. Canvas starfield with nebula glow and shooting stars
const GalaxyBackground = ({ visible }) => {
    const canvasRef = useRef(null);
    const stateRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let W = window.innerWidth, H = window.innerHeight;
        canvas.width = W; canvas.height = H;

        const resize = () => {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);

        const rand = (a, b) => a + Math.random() * (b - a);

        if (!stateRef.current) {
            // dense star field: 3 layers (distant tiny, mid, bright foreground)
            const stars = [
                ...Array.from({ length: 420 }, () => { const x=Math.random(),y=Math.random(); const cx=Math.abs(x-0.5),cy=Math.abs(y-0.5); const nearCenter=(cx<0.18&&cy<0.18); return { x, y, r: nearCenter?rand(0.1,0.3):rand(0.2,0.7), alpha: nearCenter?rand(0.1,0.25):rand(0.2,0.55), twinkleSpeed: rand(0.03,0.10), twinkleOffset: Math.random()*Math.PI*2, drift: rand(-0.00002,0.00002), color: [255,255,255] }; }),
                ...Array.from({ length: 140 }, () => { const x=Math.random(),y=Math.random(); const cx=Math.abs(x-0.5),cy=Math.abs(y-0.5); const nearCenter=(cx<0.18&&cy<0.18); return { x, y, r: nearCenter?rand(0.4,0.7):rand(0.7,1.4), alpha: nearCenter?rand(0.15,0.3):rand(0.4,0.8), twinkleSpeed: rand(0.05,0.14), twinkleOffset: Math.random()*Math.PI*2, drift: rand(-0.00004,0.00004), color: [220,210,255] }; }),
                ...Array.from({ length: 22  }, () => { const x=Math.random(),y=Math.random(); const cx=Math.abs(x-0.5),cy=Math.abs(y-0.5); const nearCenter=(cx<0.22&&cy<0.22); return { x, y, r: nearCenter?rand(0.5,0.9):rand(1.4,2.4), alpha: nearCenter?rand(0.2,0.4):rand(0.6,1.0), twinkleSpeed: rand(0.06,0.16), twinkleOffset: Math.random()*Math.PI*2, drift: rand(-0.00006,0.00006), color: [200,180,255] }; }),
            ];

            // nebulae defined as simple radial gradients at absolute positions
            const nebulae = [
                { x: 0.78, y: 0.15, r: 0.38, color: [88,28,220],   alpha: 0.13 },
                { x: 0.18, y: 0.60, r: 0.32, color: [29,78,216],   alpha: 0.11 },
                { x: 0.50, y: 0.45, r: 0.48, color: [109,40,217],  alpha: 0.08 },
                { x: 0.85, y: 0.72, r: 0.26, color: [16,185,129],  alpha: 0.07 },
                { x: 0.28, y: 0.22, r: 0.30, color: [147,51,234],  alpha: 0.09 },
            ];

            const shooters = Array.from({ length: 5 }, (_, i) => ({
                x: 0, y: 0, vx: 0, vy: 0, len: 0,
                life: 0, maxLife: 0, active: false,
                nextIn: rand(60, 300) + i * 80,
            }));

            stateRef.current = { stars, nebulae, shooters };
        }

        const { stars, nebulae, shooters } = stateRef.current;

        const tick = (t) => {
            const ctx = canvas.getContext('2d');

            // deep space base
            const bg = ctx.createRadialGradient(W*0.5, H*0.35, 0, W*0.5, H*0.55, W*0.9);
            bg.addColorStop(0,    'rgb(18,9,40)');
            bg.addColorStop(0.45, 'rgb(10,5,24)');
            bg.addColorStop(1,    'rgb(3,2,10)');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // nebulae. Simple radial fills at viewport scale
            nebulae.forEach(n => {
                const nx = n.x * W, ny = n.y * H, nr = n.r * Math.min(W, H);
                const [r,g,b] = n.color;
                const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
                grd.addColorStop(0,    `rgba(${r},${g},${b},${n.alpha})`);
                grd.addColorStop(0.4,  `rgba(${r},${g},${b},${n.alpha * 0.5})`);
                grd.addColorStop(1,    `rgba(${r},${g},${b},0)`);
                ctx.beginPath();
                ctx.arc(nx, ny, nr, 0, Math.PI * 2);
                ctx.fillStyle = grd;
                ctx.fill();
            });

            // stars
            const now = t / 1000;
            stars.forEach(s => {
                s.x += s.drift;
                if (s.x < 0) s.x += 1;
                if (s.x > 1) s.x -= 1;
                const twinkle = 0.5 + 0.5 * Math.sin(now * s.twinkleSpeed + s.twinkleOffset);
                const a = s.alpha * (0.82 + 0.18 * twinkle);
                const [cr,cg,cb] = s.color;
                ctx.beginPath();
                ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
                ctx.fill();
                if (s.r > 1.3 && twinkle > 0.75) {
                    const glow = ctx.createRadialGradient(s.x*W, s.y*H, 0, s.x*W, s.y*H, s.r*5);
                    glow.addColorStop(0, `rgba(${cr},${cg},${cb},${a * 0.4})`);
                    glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
                    ctx.beginPath();
                    ctx.arc(s.x * W, s.y * H, s.r * 5, 0, Math.PI * 2);
                    ctx.fillStyle = glow;
                    ctx.fill();
                }
            });

            // shooting stars
            shooters.forEach(sh => {
                if (!sh.active) {
                    sh.nextIn--;
                    if (sh.nextIn <= 0) {
                        sh.x = rand(0.05, 0.6);
                        sh.y = rand(0.02, 0.35);
                        sh.vx = rand(0.003, 0.007);
                        sh.vy = rand(0.001, 0.003);
                        sh.len = rand(0.06, 0.16);
                        sh.life = 0;
                        sh.maxLife = rand(40, 80);
                        sh.active = true;
                    }
                    return;
                }
                sh.life++;
                const fade = sh.life < 8 ? sh.life / 8 : sh.life > sh.maxLife - 10 ? (sh.maxLife - sh.life) / 10 : 1;
                const x1 = sh.x * W, y1 = sh.y * H;
                const mag = Math.sqrt(sh.vx*sh.vx + sh.vy*sh.vy);
                const x0 = x1 - (sh.vx/mag) * sh.len * W * 0.5;
                const y0 = y1 - (sh.vy/mag) * sh.len * H * 0.5;
                const grad = ctx.createLinearGradient(x0, y0, x1, y1);
                grad.addColorStop(0, `rgba(255,255,255,0)`);
                grad.addColorStop(0.7, `rgba(200,180,255,${fade * 0.5})`);
                grad.addColorStop(1, `rgba(255,255,255,${fade * 0.9})`);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                sh.x += sh.vx;
                sh.y += sh.vy;
                if (sh.life >= sh.maxLife || sh.x > 1 || sh.y > 1) {
                    sh.active = false;
                    sh.nextIn = rand(300, 900);
                }
            });

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full z-0 pointer-events-none"
            style={{ opacity: visible ? 1 : 0, transition: 'opacity 2s ease' }}
        />
    );
};

// EarthBackground. Midnight Caribbean: deep ocean blue base, warm gold fireflies, bioluminescent blue glows
const EarthBackground = ({ visible }) => {
    const canvasRef = useRef(null);
    const stateRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let W = canvas.width = window.innerWidth;
        let H = canvas.height = window.innerHeight;
        const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize);
        const rand = (a, b) => a + Math.random() * (b - a);

        if (!stateRef.current) {
            // particles. Warm gold fireflies + cool bioluminescent blue/teal
            const fireflies = Array.from({ length: 110 }, () => {
                const kind = Math.random();
                return {
                    x: Math.random(), y: Math.random(),
                    r: rand(0.6, 2.0),
                    alpha: rand(0.15, 0.65),
                    pulseSpeed: rand(0.015, 0.055),
                    pulseOffset: Math.random() * Math.PI * 2,
                    dx: rand(-0.00007, 0.00007),
                    dy: rand(-0.00003, 0.00003),
                    // gold firefly / blue-green bioluminescent / deep teal
                    color: kind > 0.55 ? [201, 162, 42] : kind > 0.25 ? [30, 160, 220] : [20, 210, 180],
                };
            });
            // ambient depth glows. Ocean blue from below, warm amber from top (surface light)
            const glows = [
                { x: 0.50, y: 0.0,  r: 0.70, color: [180, 130, 40],  alpha: 0.06 }, // surface warmth top center
                { x: 0.15, y: 0.05, r: 0.45, color: [160, 110, 25],  alpha: 0.05 }, // surface warmth top left
                { x: 0.82, y: 0.08, r: 0.40, color: [140, 100, 20],  alpha: 0.04 }, // surface warmth top right
                { x: 0.30, y: 0.60, r: 0.55, color: [15,  80, 160],  alpha: 0.07 }, // ocean depth blue
                { x: 0.75, y: 0.70, r: 0.50, color: [10,  60, 140],  alpha: 0.08 }, // ocean depth blue
                { x: 0.50, y: 0.90, r: 0.65, color: [5,   40, 100],  alpha: 0.09 }, // deep abyss
                { x: 0.10, y: 0.80, r: 0.40, color: [20, 120, 160],  alpha: 0.05 }, // teal mid-depth
                { x: 0.88, y: 0.45, r: 0.38, color: [20, 100, 180],  alpha: 0.05 }, // blue mid-depth
            ];
            stateRef.current = { fireflies, glows };
        }

        const { fireflies, glows } = stateRef.current;

        const tick = (t) => {
            const ctx = canvas.getContext('2d');

            // base. Warm amber at surface fading to deep midnight blue-black at the bottom
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0,    'rgb(12, 18, 10)');  // dark warm green-black at top (shoreline)
            bg.addColorStop(0.18, 'rgb(6,  14, 22)');  // transition into ocean
            bg.addColorStop(0.50, 'rgb(3,  9,  22)');  // midnight blue
            bg.addColorStop(0.80, 'rgb(2,  5,  18)');  // deep ocean
            bg.addColorStop(1,    'rgb(1,  3,  12)');  // abyss
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // ambient depth glows
            glows.forEach(n => {
                const nx = n.x * W, ny = n.y * H, nr = n.r * Math.min(W, H);
                const [r, g, b] = n.color;
                const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
                grd.addColorStop(0,   `rgba(${r},${g},${b},${n.alpha})`);
                grd.addColorStop(0.45,`rgba(${r},${g},${b},${n.alpha * 0.35})`);
                grd.addColorStop(1,   `rgba(${r},${g},${b},0)`);
                ctx.beginPath();
                ctx.arc(nx, ny, nr, 0, Math.PI * 2);
                ctx.fillStyle = grd;
                ctx.fill();
            });

            // fireflies / bioluminescent particles
            const now = t / 1000;
            fireflies.forEach(f => {
                f.x += f.dx; f.y += f.dy;
                if (f.x < 0) f.x = 1; if (f.x > 1) f.x = 0;
                if (f.y < 0) f.y = 1; if (f.y > 1) f.y = 0;
                const pulse = 0.5 + 0.5 * Math.sin(now * f.pulseSpeed * 60 + f.pulseOffset);
                const a = f.alpha * (0.55 + 0.45 * pulse);
                const [cr, cg, cb] = f.color;
                const fx = f.x * W, fy = f.y * H;
                const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, f.r * 7);
                glow.addColorStop(0, `rgba(${cr},${cg},${cb},${a * 0.45})`);
                glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
                ctx.beginPath();
                ctx.arc(fx, fy, f.r * 7, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(fx, fy, f.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
                ctx.fill();
            });

            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full z-0 pointer-events-none"
            style={{ opacity: visible ? 1 : 0, transition: 'opacity 2s ease' }}
        />
    );
};

const InquiryBanner = ({ onDismiss }) => {
    useEffect(() => {
        const t = setTimeout(onDismiss, 5000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (<div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.4s_ease-out]">
            <div className="flex items-center gap-4 bg-[#03020a]/90 border border-purple-500/30 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0"></div>
                <p className="text-base uppercase tracking-widest text-gray-200">Inquiry received, our team will be in touch shortly.</p>
                <button onClick={onDismiss} className="ml-2 text-gray-500 hover:text-white transition-colors">
                    <i className="ph ph-x text-base"></i>
                </button>
            </div>
        </div>);
};

const BrandKitToast = ({ onDismiss }) => {
    useEffect(() => {
        const t = setTimeout(onDismiss, 3500);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.4s_ease-out]">
            <div className="flex items-center gap-4 bg-[#03020a]/90 border border-blue-500/30 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl">
                <i className="ph ph-download-simple text-blue-400 text-lg flex-shrink-0"></i>
                <p className="text-base uppercase tracking-widest text-gray-200">Brand Kit download starting…</p>
                <button onClick={onDismiss} className="ml-2 text-gray-500 hover:text-white transition-colors">
                    <i className="ph ph-x text-base"></i>
                </button>
            </div>
        </div>
    );
};

const App = () => {
    const [theme, setTheme] = useState(() => { try { return localStorage.getItem('oq_theme') || 'space'; } catch { return 'space'; } });
    const toggleTheme = () => setTheme(t => { const next = t === 'space' ? 'earth' : 'space'; try { localStorage.setItem('oq_theme', next); } catch {} return next; });
    const [currentView, setCurrentView] = useState('landing');
    const [visibleView, setVisibleView] = useState('landing');
    const [viewVisible, setViewVisible] = useState(true);
    const [uiVisible, setUiVisible] = useState(true);
    const [navReady, setNavReady] = useState(false);
    const prevViewRef = useRef('landing');

    const navigateTo = (view) => {
        if (view === visibleView) return;
        prevViewRef.current = visibleView;
        setViewVisible(false);
        setTimeout(() => {
            setCurrentView(view);
            setVisibleView(view);
            requestAnimationFrame(() => requestAnimationFrame(() => setViewVisible(true)));
        }, 180);
    };
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
    const [showInquiry, setShowInquiry] = useState(false);
    const [showBrandKit, setShowBrandKit] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    // Session awareness at App level so the top nav can swap between marketing and authenticated states
    const [appSession, setAppSession] = useState(null);
    const [appProfile, setAppProfile] = useState(null);

    useEffect(() => {
        if (!supabase) return;
        supabase.auth.getSession().then(({ data: { session } }) => {
            setAppSession(session);
            // Signed-in members land in their console, not the marketing page
            if (session) {
                setCurrentView((v) => (v === 'landing' ? 'dashboard' : v));
                setVisibleView((v) => (v === 'landing' ? 'dashboard' : v));
            }
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setAppSession(session);
            if (!session) setAppProfile(null);
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!appSession || !supabase) { setAppProfile(null); return; }
        supabase.from('clients').select('company_name,is_admin').eq('id', appSession.user.id).single()
            .then(({ data }) => setAppProfile(data));
    }, [appSession]);

    const handleAppSignOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        navigateTo('landing');
    };

    const handleLogoRightClick = (e) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    };

    useEffect(() => {
        const closeMenu = () => setContextMenu(prev => ({ ...prev, visible: false }));
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    const handleAction = (type) => {
        if (type === 'contact') {
            setShowInquiry(true);
        } else if (type === 'admin') {
            navigateTo('dashboard');
        }
    };

    // Sign portal - early exit, no vault chrome
    const signPortalToken = (() => {
        const hash = window.location.hash.replace(/^#/, '');
        const qIdx = hash.indexOf('?');
        if (qIdx < 0) return null;
        const segment = hash.slice(0, qIdx);
        if (segment !== 'sign') return null;
        return new URLSearchParams(hash.slice(qIdx + 1)).get('token') || null;
    })();

    if (signPortalToken) {
        return (
            <div className={`min-h-screen text-white relative font-sans ${theme === 'earth' ? 'bg-[#01030c]' : 'bg-[#03020a]'}`}>
                {theme === 'earth' ? <EarthBackground visible={true} /> : <GalaxyBackground visible={true} />}
                <div className="relative z-10">
                    <LazySignPortal token={signPortalToken} />
                </div>
            </div>
        );
    }

    return (<div className={`min-h-screen text-white relative font-sans selection:bg-purple-500/30 ${theme === 'earth' ? 'bg-[#01030c]' : 'bg-[#03020a]'}`}>
            {theme === 'earth' ? <EarthBackground visible={true} /> : <GalaxyBackground visible={true} />}

            <nav className={`fixed top-0 left-0 w-full z-50 select-none px-8 py-8 md:px-16 md:py-12 flex justify-center items-center transition-all duration-700 ${currentView !== 'landing' || navReady ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                {/* nav logo, muted, kept for reference */}
                <div
                    className="cursor-pointer nav-link flex items-center group opacity-0 pointer-events-none absolute left-8 md:left-16"
                    onClick={() => navigateTo('landing')}
                    onContextMenu={handleLogoRightClick}
                >
                    <div className="h-8 md:h-9 overflow-hidden transition-transform duration-500 group-hover:scale-105 w-[80px] md:w-[90px]">
                        <img
                            src="/Onboardin.png"
                            alt="Onboardin"
                            className="h-full w-auto max-w-none object-left"
                        />
                    </div>
                </div>

                {appSession ? (/* Authenticated nav, identity + sign out */
                    <div className="flex items-center gap-4 md:gap-6 text-sm md:text-base tracking-widest uppercase font-bold">
                        <button
                            onClick={() => navigateTo('dashboard')}
                            className="nav-link text-purple-200 truncate max-w-[140px] sm:max-w-[200px] uppercase"
                            title={appProfile?.company_name || appSession.user.email}
                        >
                            {appProfile?.is_admin ? 'Admin Console' : (appProfile?.company_name || appSession.user.email)}
                        </button>
                        <button onClick={toggleTheme}
                            className="nav-link text-gray-500 hover:text-white transition-colors flex items-center gap-1.5">
                            {theme === 'space'
                                ? <><i className="ph ph-leaf text-base"></i><span className="hidden sm:inline text-xs tracking-widest uppercase">Earth Strong</span></>
                                : <><i className="ph ph-planet text-base"></i><span className="hidden sm:inline text-xs tracking-widest uppercase">Space is the Place</span></>
                            }
                        </button>
                        <button onClick={handleAppSignOut} className="nav-link text-gray-500 hover:text-white transition-colors">Sign Out</button>
                    </div>
                ) : (/* Marketing nav, pre-auth */
                    <div className="flex items-center gap-3 sm:gap-6 md:gap-10 text-xs sm:text-sm md:text-base tracking-wider sm:tracking-widest uppercase font-bold">
                        <button onClick={() => navigateTo('features')} className={`nav-link transition-opacity ${currentView === 'features' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Features</button>
                        <button onClick={() => navigateTo('pricing')} className={`nav-link transition-opacity ${currentView === 'pricing' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Pricing</button>
                        <button onClick={() => navigateTo('support')} className={`nav-link transition-opacity relative ${currentView === 'support' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                            Support
                            {unreadCount > 0 && <span className="absolute -top-2 -right-3 w-4 h-4 bg-blue-500 text-white text-sm flex items-center justify-center rounded-full animate-pulse tracking-none">{unreadCount}</span>}
                        </button>
                        <button onClick={toggleTheme}
                            className="nav-link text-gray-500 hover:text-white transition-colors flex items-center gap-1.5">
                            {theme === 'space'
                                ? <><i className="ph ph-leaf text-base"></i><span className="hidden sm:inline text-xs tracking-widest uppercase">Earth Strong</span></>
                                : <><i className="ph ph-planet text-base"></i><span className="hidden sm:inline text-xs tracking-widest uppercase">Space is the Place</span></>
                            }
                        </button>
                        <button onClick={() => handleAction('admin')} className="nav-link text-purple-300 hover:text-white transition-colors">Login</button>
                    </div>
                )}
            </nav>

            {contextMenu.visible && (
                <div className="custom-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <div
                        className="p-4 hover:bg-white/10 cursor-pointer flex items-center gap-3 text-base text-purple-300 transition-colors uppercase tracking-widest font-bold"
                        onClick={() => setShowBrandKit(true)}
                    >
                        <i className="ph ph-download-simple text-lg"></i>
                        <span>Download Brand Kit</span>
                    </div>
                </div>
            )}

            {showInquiry && <InquiryBanner onDismiss={() => setShowInquiry(false)} />}
            {showBrandKit && <BrandKitToast onDismiss={() => setShowBrandKit(false)} />}


            <main className="relative z-10">
                {(currentView === 'landing' || currentView === 'features' || currentView === 'pricing' || currentView === 'support') && (
                    <Landing onNavigate={() => navigateTo('dashboard')} uiVisible={uiVisible} setUiVisible={setUiVisible} onBrandKit={() => setShowBrandKit(true)} onElementsReady={() => setNavReady(true)} />
                )}
                {currentView === 'dashboard' && <Dashboard setCurrentView={navigateTo} setUnreadCount={setUnreadCount} />}
                {currentView === 'signup' && <Signup setCurrentView={navigateTo} />}
            </main>

            {/* Features/Pricing/Support overlay. Fade up, tap outside to dismiss */}
            {(currentView === 'features' || currentView === 'pricing' || currentView === 'support') && (
                <>
                    {currentView === 'features' && <Features onDismiss={() => navigateTo('landing')} visible={viewVisible} />}
                    {currentView === 'pricing' && <Pricing onContact={() => handleAction('contact')} onDismiss={() => navigateTo(prevViewRef.current)} visible={viewVisible} />}
                    {currentView === 'support' && <Support onDismiss={() => navigateTo('landing')} onContact={() => handleAction('contact')} visible={viewVisible} />}
                </>
            )}
        </div>
    );
};

export default App;
