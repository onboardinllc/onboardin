import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { getCategories as getProcedureCategories } from './lib/procedures';
import {
    buildIntakeAnswers,
    evaluateAcceptCriteria,
    getComplianceVaultCategories,
    mergeProfileIntoIntake,
    resolveComplianceSlug,
} from './lib/compliance';
import Step06Panel from './components/Step06Panel';
import ComplianceCalendar from './components/ComplianceCalendar';
import AdminObligationsPanel from './components/AdminObligationsPanel';
import DocumentFillPanel from './components/DocumentFillPanel';
import { canAccessComplianceCalendar, enrichObligation, obligationStats } from './lib/compliance-obligations';
import { buildDraftPayload, buildActivePayload, serializeIntake } from './lib/compliance-intake-persist';
import { legalTemplateUrl, isFillableTemplateUrl } from './lib/template-urls.js';

const LOGO_PNG = '/Onboardin.png';
const LOGO_SVG = '/favicon.svg';

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
        let animationFrameId;

        const processFrame = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.paused || video.ended) return;

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const width = video.videoWidth;
            const height = video.videoHeight;

            // VIDEO CROP : trim right to remove suffix text, trim left to re-center
            const cropLeft = 0.15;
            const cropRight = 0.30;
            const sourceX = width * cropLeft;
            const sourceWidth = width * (1 - cropLeft - cropRight);

            if (canvas.width !== sourceWidth) canvas.width = sourceWidth;
            if (canvas.height !== height) canvas.height = height;

            ctx.drawImage(video, sourceX, 0, sourceWidth, height, 0, 0, sourceWidth, height);

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

        if (isPlaying) {
            processFrame();
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying]);

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
            {useLogo ? (
                <img
                    src={LOGO_PNG}
                    alt="Onboardin"
                    className={`w-full h-full object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all duration-[1500ms] ease-out ${
                        logoEntered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    onError={(e) => {
                        if (!e.currentTarget.src.endsWith('favicon.svg')) e.currentTarget.src = LOGO_SVG;
                    }}
                />
            ) : (
                <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-opacity duration-1000"
                    style={{ opacity: isPlaying ? 1 : 0 }}
                />
            )}
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
const MindMapCanvas = ({ active }) => {
    const canvasRef = useRef(null);
    const stateRef = useRef(null);
    const rafRef = useRef(null);
    const activeRef = useRef(active);
    activeRef.current = active;
    // Easter egg: when the user is actively making a text selection on the page,
    // the planet labels become visible. Otherwise they stay hidden.
    const selectingRef = useRef(false);
    useEffect(() => {
        const onSelectionChange = () => {
            const sel = window.getSelection();
            selectingRef.current = !!(sel && sel.toString().length > 0);
        };
        document.addEventListener('selectionchange', onSelectionChange);
        return () => document.removeEventListener('selectionchange', onSelectionChange);
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
            const isActive = activeRef.current;

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

                // Easter egg: labels show only when the user is actively selecting text on the page.
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
                    <MindMapCanvas active={hovered} />
                    <button
                        onClick={onNavigate}
                        className="relative z-20 px-12 py-4 rounded-full uppercase tracking-[0.35em] font-black text-base transition-all duration-[600ms] active:scale-95 bg-[#0d0820]/80 backdrop-blur-md border border-purple-500/25 text-purple-200/80 shadow-[0_0_18px_rgba(139,92,246,0.18),inset_0_0_18px_rgba(139,92,246,0.06)] hover:border-purple-400/50 hover:text-purple-100 hover:shadow-[0_0_32px_rgba(139,92,246,0.35),inset_0_0_24px_rgba(139,92,246,0.10)]"
                    >
                        Start Building
                    </button>
                </div>

                <p className="text-gray-400 text-sm md:text-base mt-8 font-medium tracking-[0.5em] uppercase opacity-50">
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

// -- Jurisdiction + entity data ------------------------------------------------

const REGIONS = {
    'United States': [
        'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
        'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
        'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
        'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
        'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
        'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
        'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
        'Wisconsin','Wyoming',
    ],
    'Canada': [
        'Alberta','British Columbia','Manitoba','New Brunswick',
        'Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut',
        'Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
    ],
    'CARICOM': [
        'Antigua and Barbuda','Bahamas','Barbados','Belize','Dominica','Grenada',
        'Guyana','Haiti','Jamaica','Montserrat','Saint Kitts and Nevis','Saint Lucia',
        'Saint Vincent and the Grenadines','Suriname','Trinidad and Tobago',
    ],
    'Latin America': [
        'Argentina','Bolivia','Brazil','Chile','Colombia','Costa Rica','Cuba',
        'Dominican Republic','Ecuador','El Salvador','Guatemala','Honduras','Mexico',
        'Nicaragua','Panama','Paraguay','Peru','Uruguay','Venezuela',
    ],
};

const ENTITY_TYPES = ['LLC','C-Corp','S-Corp','Limited Company (Ltd)','PLC','Sole Proprietor','Non-Profit','Partnership'];

// Returns recommended entity + reason based on intent signals
function recommendEntity(fundingStage, businessIntent, sellsTo, country) {
    const intent = (businessIntent || '').toLowerCase();
    const sells = (sellsTo || '').toLowerCase();
    const isCaricom = (REGIONS['CARICOM'] || []).includes(country);

    const wantsVC = fundingStage === 'Seed' || fundingStage === 'Series A' || fundingStage === 'Series B+';
    const isEnterprise = sells.includes('enterprise') || sells.includes('b2b') || sells.includes('business');
    const isNonProfit = intent.includes('nonprofit') || intent.includes('non-profit') || intent.includes('charity') || intent.includes('501');

    if (isNonProfit) return { entity: 'Non-Profit', reason: 'Non-profit status enables tax exemption and grant eligibility.' };

    if (isCaricom) {
        if (wantsVC) return { entity: 'PLC', reason: 'Public Limited Companies suit venture-scale businesses in CARICOM jurisdictions.' };
        return { entity: 'Limited Company (Ltd)', reason: 'Limited Companies are the standard private structure across CARICOM.' };
    }

    if (wantsVC) return { entity: 'C-Corp', reason: 'C-Corps are the standard for venture-backed companies; VCs and stock options require it.' };
    if (!wantsVC && (fundingStage === 'Pre-Seed' || !fundingStage)) return { entity: 'LLC', jurisdiction_hint: 'Wyoming', reason: 'Wyoming LLC: $100 to form, $60/yr to maintain, no state income tax, no franchise tax. Best low-cost US start for founders not yet raising institutional capital.' };
    if (isEnterprise) return { entity: 'LLC', reason: 'LLCs offer pass-through taxation and flexibility, ideal before a fundraise.' };
    return { entity: 'LLC', reason: 'LLCs are the most common structure for early-stage startups: simple, flexible, founder-friendly.' };
}

// Upload button for vault cards. Label activation, matching the admin upload pattern.
const VaultUploadButton = ({ disabled, onFile, fullWidth }) => (
    <label className={`transition-colors ${disabled ? 'text-gray-600 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${fullWidth ? 'inline-flex items-center gap-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 hover:text-purple-300 hover:border-purple-500/30' : 'inline-flex text-gray-400 hover:text-purple-300'}`}>
        <i className="ph ph-upload-simple text-base"></i>
        {fullWidth && <span>Upload document</span>}
        <input type="file" className="hidden" disabled={disabled}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
);

// Returns document categories required for a given entity type + country
function getDocCategoriesInline(entityType, country, jurisdiction) {
    const isJamaica = country === 'Jamaica' || jurisdiction === 'Jamaica';
    const isUS = !isJamaica && (country === 'United States' || jurisdiction === 'Delaware' || jurisdiction === 'Wyoming');
    const isCA = country === 'Canada';

    const isJM = isJamaica;

    const base = [
        {
            id: 'gov_id',
            label: 'Government ID',
            icon: 'ph-identification-card',
            desc: 'Passport or government-issued photo ID for each founder.',
            required: true,
            process: isJM ? {
                title: 'Get your Government ID',
                pick: 'Pick the fastest option for you:',
                tracks: [
                    {
                        label: 'Passport (recommended)',
                        time: '7 days standard, same-day available',
                        cost: '$6,500 JMD standard / $21,500 JMD same-day',
                        steps: [
                            { action: 'Go to the PICA online portal or visit their Kingston office at 25 Constant Spring Road.', url: 'https://www.pica.gov.jm', cta: 'Open PICA website' },
                            { action: 'Bring: birth certificate, 2 passport photos, valid ID (e.g., driver\'s license or old passport), and payment.' },
                            { action: 'Choose "New Application" if first passport, or "Renewal" if renewing. Pay at counter.' },
                            { action: 'Collect in 7 working days (standard) or same-day if submitted by 11 AM at head office.' },
                        ],
                    },
                    {
                        label: "Voter's ID (free, slower)",
                        time: '3 to 6 months',
                        cost: 'Free',
                        steps: [
                            { action: 'Register online at the Electoral Office of Jamaica portal or visit your parish office.', url: 'https://www.eoj.com.jm', cta: 'Open EOJ website' },
                            { action: 'Bring: birth certificate and proof of address (utility bill or bank statement).' },
                            { action: 'Complete the registration form. ID is mailed to your address within 3 to 6 months.' },
                            { action: 'Apply immediately. This takes time. Use your passport if you need ID sooner.' },
                        ],
                    },
                ],
            } : {
                title: 'Government ID',
                pick: 'Any one of these is accepted:',
                tracks: [
                    { label: 'Passport', time: 'Varies by country', cost: 'Varies', steps: [{ action: 'Use your existing passport, or apply at your national passport authority.' }] },
                    { label: "Driver's License", time: 'Varies', cost: 'Varies', steps: [{ action: 'A current government-issued driver\'s license with photo is accepted.' }] },
                    { label: 'National ID', time: 'Varies', cost: 'Often free', steps: [{ action: 'A government-issued national identity card is accepted.' }] },
                ],
            }
        },
        {
            id: 'founder_docs',
            label: 'Founder Documents',
            icon: 'ph-user-list',
            desc: 'Signed founder agreement covering equity, vesting, IP, and dispute resolution.',
            required: true,
            templateUrl: legalTemplateUrl('founder_agreement'),
            fillEnabled: true,
            process: {
                title: 'Draft and sign your Founder Agreement',
                pick: null,
                tracks: [
                    {
                        label: 'Using our template',
                        time: '1 to 2 days',
                        cost: 'Free',
                        steps: [
                            { action: 'Download the Onboardin Founder Agreement template.', url: legalTemplateUrl('founder_agreement'), cta: 'Download template' },
                            { action: 'Fill in: each founder\'s full legal name, equity percentage, vesting schedule (4-year / 1-year cliff recommended), and role.' },
                            { action: 'Review the IP assignment clause. It must state all work done for the company belongs to the company.' },
                            { action: isJM ? 'Add a shotgun clause for dispute resolution. This lets any founder buy out the other at a set price to break deadlocks.' : 'Add a buyout or deadlock clause so disputes have a defined resolution path.' },
                            { action: 'All founders sign the document. Have signatures witnessed if possible.' },
                        ],
                    },
                ],
            }
        },
    ];

    if (entityType === 'LLC' || entityType === 'C-Corp' || entityType === 'S-Corp') {
        base.push({
            id: 'articles',
            label: isJM ? 'Certificate of Incorporation' : (entityType === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation'),
            icon: 'ph-file-text',
            desc: isJM ? 'Certificate of Incorporation from the Companies Office of Jamaica.' : (entityType === 'LLC' ? 'State-issued articles of organization.' : 'State-issued articles of incorporation.'),
            required: false,
            process: isJM ? {
                title: 'Incorporate at the Companies Office of Jamaica',
                pick: null,
                tracks: [
                    {
                        label: 'COJ Standard (4 to 6 days)',
                        time: '4 to 6 working days',
                        cost: '~$28,000 JMD (registration + stamp duty)',
                        steps: [
                            { action: 'Search your proposed company name at the COJ to confirm availability. Reserve it using Form 6 (J$3,000 JMD, holds name 90 days).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6.pdf', cta: 'Download Form 6', portalUrl: 'https://www.orcjamaica.com', portalCta: 'COJ portal' },
                            { action: 'Download and complete the BRF1 "Super Form". This single form registers your company AND handles NIS and GCT registration automatically.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/brf1.pdf', cta: 'Download BRF1', portalUrl: 'https://www.orcjamaica.com/Forms.aspx', portalCta: 'COJ forms portal' },
                            { action: 'Gather: TRN for all directors and shareholders, valid ID for each, proof of registered address, and the completed Form 1A (Articles of Incorporation).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-1a.pdf', cta: 'Download Form 1A' },
                            { action: 'Submit the Beneficial Ownership Return (BOR) forms: Form A for individuals, Form B for corporate shareholders. Required by law.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-a.pdf', cta: 'Download Form A (BOR)' },
                            { action: 'Submit all forms at the COJ office (14 Camp Road, Kingston) or via their online portal. Pay the fee at the counter. Same-day processing if submitted before 11 AM.' },
                            { action: 'Receive your Certificate of Incorporation (typically 4 to 6 days standard). Upload it here.' },
                        ],
                    },
                ],
            } : {
                title: entityType === 'LLC' ? 'File Articles of Organization' : 'File Articles of Incorporation',
                pick: null,
                tracks: [
                    {
                        label: 'Already formed',
                        time: 'N/A',
                        cost: 'N/A',
                        steps: [{ action: 'Upload your state-issued articles document below.' }],
                    },
                    {
                        label: 'Not yet formed',
                        time: 'Varies by state',
                        cost: 'Varies by state',
                        steps: [{ action: 'Your Navigator will file this for you as part of your onboarding. No action needed yet.' }],
                    },
                ],
            }
        });
        base.push({
            id: 'operating_agreement',
            label: isJM ? 'Shareholders Agreement' : (entityType === 'LLC' ? 'Operating Agreement' : 'Bylaws / Shareholder Agreement'),
            icon: 'ph-handshake',
            desc: isJM ? 'Private shareholders agreement defining transfer restrictions and reserved matters.' : 'Internal governance document outlining ownership and management structure.',
            required: false,
            templateUrl: isJM ? legalTemplateUrl('jm_shareholders_agreement') : (entityType === 'LLC' ? legalTemplateUrl('llc_operating_agreement') : legalTemplateUrl('corp_bylaws')),
            fillEnabled: true,
            process: isJM ? {
                title: 'Draft your Shareholders Agreement',
                pick: null,
                tracks: [
                    {
                        label: 'Using our template',
                        time: '1 to 3 days',
                        cost: 'Free (template) or $50,000+ JMD with an attorney',
                        steps: [
                            { action: 'Download the Onboardin Shareholders Agreement template.', url: legalTemplateUrl('jm_shareholders_agreement'), cta: 'Download template' },
                            { action: 'Define transfer restrictions: include a Right of First Refusal so shares cannot be sold to outside parties without offering existing shareholders first.' },
                            { action: 'List your Reserved Matters. Decisions requiring 75% or 100% board approval, such as taking on debt, issuing new shares, or selling the company.' },
                            { action: 'Add drag-along and tag-along rights to protect minority shareholders in an acquisition.' },
                            { action: 'All shareholders sign the agreement. This document is private. Do not file it with the COJ.' },
                        ],
                    },
                ],
            } : {
                title: entityType === 'LLC' ? 'Draft your Operating Agreement' : 'Draft your Bylaws',
                pick: null,
                tracks: [
                    {
                        label: 'Using our template',
                        time: '1 to 2 days',
                        cost: 'Free',
                        steps: [
                            { action: 'Download and complete the template.', url: entityType === 'LLC' ? legalTemplateUrl('llc_operating_agreement') : legalTemplateUrl('corp_bylaws'), cta: 'Download template' },
                            { action: 'Fill in member names, ownership percentages, voting rules, and management structure.' },
                            { action: 'All members/directors sign the document.' },
                        ],
                    },
                ],
            }
        });
    }

    if (entityType === 'Non-Profit') {
        base.push({
            id: 'nonprofit_docs',
            label: 'Non-Profit Formation Docs',
            icon: 'ph-certificate',
            desc: 'Articles of incorporation, bylaws, and board member list.',
            required: false,
        });
    }

    if (isJamaica) {
        base.push({
            id: 'personal_trn',
            label: 'Personal TRN',
            icon: 'ph-receipt',
            desc: 'Taxpayer Registration Number required for all directors before incorporation.',
            required: true,
            process: {
                title: 'Get your personal TRN',
                pick: null,
                tracks: [
                    {
                        label: 'In person at TAJ (same-day, free)',
                        time: 'Same day',
                        cost: 'Free',
                        steps: [
                            { action: 'Go to any Tax Administration Jamaica office. Locate the TRN desk.', url: 'https://www.jamaicatax.gov.jm', cta: 'Find TAJ offices' },
                            { action: 'Bring: valid Passport OR Driver\'s License. If you have neither: Voter\'s ID plus Birth Certificate.' },
                            { action: 'Complete Form 1 (Application for Taxpayer Registration, Individuals). Provided at the counter at no charge.' },
                            { action: 'Your TRN is issued the same day. Record it. Every subsequent step requires it.' },
                        ],
                    },
                    {
                        label: 'Overseas / by mail (2 to 5 weeks)',
                        time: '2 to 5 weeks',
                        cost: 'Free',
                        steps: [
                            { action: 'Download Form 1 from the TAJ website.', url: 'https://www.jamaicatax.gov.jm/documents/10181/11382/form1.pdf', cta: 'Download Form 1' },
                            { action: 'Complete the form. Have your ID notarized by a Notary Public in your country.' },
                            { action: 'Mail the notarized package to: Tax Administration Jamaica, TRN Unit, 101 Old Hope Road, Kingston 6.' },
                            { action: 'TRN is mailed back within 2 to 5 weeks.' },
                        ],
                    },
                ],
            },
        });
        base.push({
            id: 'jam_brc',
            label: 'BRC / Tax Compliance Certificate',
            icon: 'ph-certificate',
            desc: 'Business Registration Certificate and Tax Compliance Certificate. Issued automatically on COJ incorporation.',
            required: true,
            templateUrl: 'https://www.orcjamaica.com/forms/',
            process: {
                title: 'Get and maintain your BRC and TCC',
                pick: null,
                tracks: [
                    {
                        label: 'Initial issuance (automatic with COJ filing)',
                        time: 'Issued with Certificate of Incorporation',
                        cost: 'Included in COJ incorporation fee (~J$28,000)',
                        steps: [
                            { action: 'Your BRC and initial 90-day TCC are issued automatically when COJ processes your BRF1 Super Form. No separate application.' },
                            { action: 'Find your company TRN on the COJ confirmation letter. Record it. Required for banking and all tax filings.' },
                            { action: 'Upload your BRC or Certificate of Incorporation here.' },
                        ],
                    },
                    {
                        label: 'TCC renewal (every 90 days, free)',
                        time: 'Same day online / 2 to 7 days in person',
                        cost: 'Free',
                        steps: [
                            { action: 'Log in to the TAJ eServices portal with your company TRN.', url: 'https://www.jamaicatax.gov.jm', cta: 'Open TAJ portal' },
                            { action: 'TAJ now auto-renews TCCs electronically for compliant taxpayers. Check if renewal happened automatically before visiting in person.' },
                            { action: 'If auto-renewal failed: ensure all statutory deductions (NIS, NHT, HEART) are paid and filed. TAJ verifies electronically. No clearance letters required since 2024.' },
                            { action: 'Submit digital TCC renewal if auto-renewal did not trigger. Same-day online, or 2 to 7 days via branch.' },
                            { action: 'Download your renewed TCC and upload it here. Banks require a current TCC.' },
                        ],
                    },
                ],
            },
        });
        base.push({
            id: 'nis_nht_heart',
            label: 'NIS / NHT / HEART Registration',
            icon: 'ph-users-three',
            desc: 'Statutory employer registrations. Automatic via BRF1 Super Form at incorporation.',
            required: true,
            process: {
                title: 'Employer statutory registrations',
                pick: null,
                tracks: [
                    {
                        label: 'Via BRF1 Super Form (if incorporating now)',
                        time: 'Included with COJ filing',
                        cost: 'Free. Part of COJ process',
                        steps: [
                            { action: 'The BRF1 Super Form handles NIS, NHT, and HEART registration simultaneously when you incorporate at COJ. No separate applications needed.' },
                            { action: 'Confirm your NIS Employer Reference Number appears in your COJ confirmation documents. If missing, contact MLSS.', url: 'https://www.mlss.gov.jm', cta: 'MLSS contact' },
                            { action: 'Confirm NHT registration via the NHT Employer Portal. Your company TRN is the login.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT portal' },
                            { action: 'HEART registration triggers automatically once monthly payroll exceeds J$14,444. No advance application needed.' },
                        ],
                    },
                    {
                        label: 'Separate registration (existing company or missed in BRF1)',
                        time: '2 to 5 working days per agency',
                        cost: 'Free',
                        steps: [
                            { action: 'NIS: Complete Form R1 (Employer/Business Registration). Bring Certificate of Incorporation, company TRN, valid ID for all directors.', url: 'https://www.mlss.gov.jm', cta: 'Download Form R1' },
                            { action: 'NHT: Apply at the NHT Employer Portal or any NHT branch. Bring Certificate of Incorporation and company TRN.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT portal' },
                            { action: 'File monthly statutory remittances using Form S01 on TAJ eServices for all three (NIS + NHT + HEART in one submission).', url: 'https://www.jamaicatax.gov.jm', cta: 'TAJ eServices' },
                        ],
                    },
                ],
            },
        });
        base.push({
            id: 'gct_registration',
            label: 'GCT Registration',
            icon: 'ph-percent',
            desc: 'General Consumption Tax registration. Mandatory above J$15M annual turnover.',
            required: false,
            process: {
                title: 'Register for General Consumption Tax',
                pick: null,
                tracks: [
                    {
                        label: 'Online at TAJ eServices',
                        time: 'Same day (near-instant)',
                        cost: 'Free',
                        steps: [
                            { action: 'GCT is mandatory once annual gross turnover exceeds J$15,000,000. You must register within 21 days of crossing the threshold. Voluntary registration is permitted below it.' },
                            { action: 'Log in to the TAJ eServices portal and navigate to GCT Registration.', url: 'https://www.jamaicatax.gov.jm', cta: 'TAJ eServices' },
                            { action: 'Complete Form GCT-1. Provide: company TRN, Certificate of Incorporation, financial records proving threshold breach, and director IDs.' },
                            { action: 'Once registered, file and remit GCT monthly. Standard GCT rate is 15%.' },
                        ],
                    },
                ],
            },
        });
        base.push({
            id: 'coj_annual_return',
            label: 'COJ Annual Return',
            icon: 'ph-calendar-check',
            desc: 'Annual return filed with the Companies Office of Jamaica. J$5,000 fee. Late: J$100/day.',
            required: true,
            process: {
                title: 'File your Annual Return with COJ',
                pick: null,
                tracks: [
                    {
                        label: 'Online or in person at COJ',
                        time: '~10 working days standard / same-day for extra J$1,500 to 4,000',
                        cost: 'J$5,000 standard. Late fee: J$100/day up to J$10,000 maximum.',
                        steps: [
                            { action: 'File within 42 days of your company financial year end. Failure triggers J$100/day in penalties, capped at J$10,000.' },
                            { action: 'Complete Form 19A (Profit-Making Company Annual Return).', url: 'https://www.orcjamaica.com', cta: 'COJ portal' },
                            { action: 'Attach an updated Beneficial Ownership Return (BOR). Use Form A for individuals, Form B for corporate shareholders. Required every year since 2023.' },
                            { action: 'Pay J$5,000 at the COJ counter or online. Request same-day processing for an additional J$1,500 to 4,000 if you need the stamped return quickly.' },
                            { action: 'Retain the COJ-stamped Form 19A. Banks and government agencies may request it.' },
                        ],
                    },
                ],
            },
        });
    }

    if (isUS || isCA) {
        base.push({
            id: 'registered_agent',
            label: 'Registered Agent',
            icon: 'ph-map-pin',
            desc: 'Required physical state address to receive legal documents on behalf of your company.',
            required: true,
            process: isUS ? {
                title: 'Appoint a Registered Agent',
                pick: null,
                tracks: [
                    {
                        label: 'Northwest Registered Agent ($125/yr)',
                        time: 'Instant',
                        cost: '$125/year',
                        steps: [
                            { action: 'Go to Northwest Registered Agent and select your state of formation.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest Registered Agent' },
                            { action: 'Purchase the registered agent service. You receive a state street address immediately.' },
                            { action: 'Use this address as your Registered Agent address on your formation documents.' },
                        ],
                    },
                    {
                        label: 'ZenBusiness ($199/yr, includes filing)',
                        time: 'Instant',
                        cost: '$199/year',
                        steps: [
                            { action: 'ZenBusiness handles both registered agent service and the state formation filing.', url: 'https://www.zenbusiness.com', cta: 'ZenBusiness' },
                        ],
                    },
                ],
            } : null,
        });
        base.push({
            id: 'tax_id',
            label: isUS ? 'EIN Confirmation' : 'Business Number (CRA)',
            icon: 'ph-receipt',
            desc: isUS ? 'IRS Employer Identification Number. Required for banking and tax filings.' : 'Canada Revenue Agency business number confirmation.',
            required: true,
            templateUrl: isUS ? 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf' : 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/registering-your-business/bro-how-register.html',
            process: isUS ? {
                title: 'Get your EIN from the IRS',
                pick: 'Choose your method:',
                tracks: [
                    {
                        label: 'Online (US persons with SSN, instant)',
                        time: 'Immediate',
                        cost: 'Free',
                        steps: [
                            { action: 'Go to the IRS EIN Assistant. Available Monday to Friday 7am to 10pm ET.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                            { action: 'Select your entity type (LLC or Corporation) and state of formation.' },
                            { action: 'Enter the responsible party\'s SSN or ITIN and complete the form. EIN displayed immediately.' },
                            { action: 'Download the CP 575 confirmation letter and upload it here.' },
                        ],
                    },
                    {
                        label: 'By fax (international founders, 4 business days)',
                        time: '4 business days',
                        cost: 'Free',
                        steps: [
                            { action: 'Download Form SS-4 (Rev. Dec 2025 or later).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                            { action: 'On Line 7b write "Foreign" (no SSN). Line 7a must be a natural person\'s name as the Responsible Party.' },
                            { action: 'Fax the completed form to: +1-304-707-9471 (International fax line). Include a return fax number on your cover sheet.' },
                            { action: 'EIN arrives by fax within 4 business days. Physical CP 575 letter arrives by mail in 4 to 6 weeks. Upload whichever you receive first.' },
                        ],
                    },
                    {
                        label: 'By phone (international founders, immediate)',
                        time: 'Immediate during the call',
                        cost: 'Free',
                        steps: [
                            { action: 'Call the IRS international EIN line: +1-267-941-1099. Monday to Friday 6am to 11pm ET.' },
                            { action: 'Have your completed Form SS-4 in front of you. The agent will ask for information on the form and issue your EIN verbally.' },
                            { action: 'Write down the EIN immediately. CP 575 confirmation arrives by mail in 4 to 6 weeks.' },
                        ],
                    },
                ],
            } : null,
        });
        base.push({
            id: 'boi_report',
            label: 'BOI Report (FinCEN)',
            icon: 'ph-shield-check',
            desc: 'Beneficial Ownership Information. Domestic U.S.-formed entities exempt under March 2025 IFR.',
            required: false,
            process: isUS ? {
                title: 'Beneficial Ownership Information (BOI) Report',
                pick: null,
                tracks: [
                    {
                        label: 'March 2025 IFR. Domestic US entities not reporting companies',
                        time: 'N/A for domestic entities',
                        cost: 'Free',
                        steps: [
                            { action: 'Domestic U.S.-formed LLCs and C-Corps are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor fincen.gov/boi for the final rule.' },
                            { action: 'Foreign-formed entities registered to do business in the US must file within 30 days of registration.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                        ],
                    },
                ],
            } : null,
        });
        if (entityType === 'LLC' || entityType === 'S-Corp') {
            base.push({
                id: 'us_annual_tax',
                label: jurisdiction === 'Wyoming' ? 'Wyoming Annual Report' : 'Delaware Annual Franchise Tax',
                icon: 'ph-calendar-check',
                desc: jurisdiction === 'Wyoming'
                    ? 'Annual report and $62 license tax. Due on your formation anniversary month each year.'
                    : 'Flat $300/year Delaware LLC tax. Due June 1. No report form required.',
                required: true,
                process: {
                    title: jurisdiction === 'Wyoming' ? 'File Wyoming Annual Report' : 'Pay Delaware LLC Annual Tax',
                    pick: null,
                    tracks: [
                        jurisdiction === 'Wyoming' ? {
                            label: 'Online at WyoBiz',
                            time: 'Due 1st of your formation anniversary month',
                            cost: '$62 minimum ($60 tax + $2 online fee). Over $300K in assets: $0.0002 per dollar.',
                            steps: [
                                { action: 'Log in to the Wyoming Secretary of State WyoBiz portal.', url: 'https://wyobiz.wyo.gov', cta: 'WyoBiz portal' },
                                { action: 'File before the 1st of your formation anniversary month. A 60-day grace period applies with no penalty; after 60 days, Wyoming may dissolve your LLC.' },
                                { action: 'Report member/manager information and confirm your registered agent. Pay $62 minimum online.' },
                            ],
                        } : {
                            label: 'Online at Delaware eCorp',
                            time: 'Due June 1 annually',
                            cost: '$300/year flat. Increasing to $400 for 2026 tax year (payable 2027).',
                            steps: [
                                { action: 'Delaware LLCs pay a flat annual tax. No annual report form. Payment only.' },
                                { action: 'Pay by June 1 each year at the Delaware payment portal.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                                { action: 'Late payments incur a $200 penalty plus 1.5% monthly interest.' },
                            ],
                        },
                    ],
                },
            });
        }
        if (entityType === 'C-Corp') {
            base.push({
                id: 'us_annual_tax',
                label: 'Delaware Franchise Tax',
                icon: 'ph-calendar-check',
                desc: 'Annual Delaware franchise tax for C-Corps. Due March 1. Minimum $225 total.',
                required: true,
                process: {
                    title: 'Pay Delaware Annual Franchise Tax',
                    pick: null,
                    tracks: [
                        {
                            label: 'Online at Delaware eCorp',
                            time: 'Due March 1 annually',
                            cost: 'Min $175 tax (Authorized Shares) or $400 (Assumed Par Value) + $50 mandatory Annual Report fee.',
                            steps: [
                                { action: 'Delaware offers two calculation methods. Pay whichever is lower.' },
                                { action: 'Authorized Shares Method: $175 for 1 to 5,000 shares. $250 for 5,001 to 10,000. $85 per additional 10,000 above that.' },
                                { action: 'Assumed Par Value Method: divide gross assets by issued shares to get assumed par value. Multiply authorized shares × assumed par × 0.004%. Minimum $400.' },
                                { action: 'Most startups with 10M shares at $0.0001 par and under $1M in assets pay the minimum ($175 or $400 depending on method). Calculate both.' },
                                { action: 'Pay online plus the mandatory $50 Annual Report fee.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                                { action: 'Deadline: March 1. Late penalty: $200 + 1.5%/month interest.' },
                            ],
                        },
                    ],
                },
            });
        }
    }

    base.push({
        id: 'banking',
        label: 'Banking Details',
        icon: 'ph-bank',
        desc: isJamaica ? 'Business bank account letter or voided cheque from your Jamaican bank.' : isUS ? 'US business bank account, required for accepting payments and filing taxes.' : 'Voided cheque or bank letter confirming your business account.',
        required: false,
        process: isJamaica ? {
            title: 'Open a business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'NCB SME On-The-Go (lowest cost)',
                    time: '5 to 7 working days',
                    cost: 'J$2,000 minimum deposit',
                    steps: [
                        { action: 'Prepare a 12-month Cash Flow Projection and a Board Resolution. The Board Resolution must explicitly state: (1) authorisation to open the account, (2) names of authorised signatories, (3) signing mandate e.g. "any two to sign", and (4) specific authority for NCB e-Link online banking access.', url: 'https://www.jncb.com/Business/SME-Corner/SME-On-The-Go', cta: 'NCB SME page' },
                        { action: 'Submit the online application via the NCB portal and upload digital copies of your BRC, TCC, and IDs for all directors.' },
                        { action: 'Attend an in-branch appointment to sign the Signature Card, FATCA forms, and have original documents physically verified. Bring all originals.' },
                        { action: 'If requested by the branch manager, provide professional reference letters from an Attorney, JP, or Chartered Accountant.' },
                        { action: 'Account number issued in 1 to 3 days. NCB Business Online access takes an additional 3 to 5 days. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'JMMB Business (better for SaaS / ACH)',
                    time: '3 to 5 working days (plus mandatory site visit)',
                    cost: 'J$1,000 minimum deposit. Monthly fee: J$1,035.',
                    steps: [
                        { action: 'Gather Form 23 (List of Directors, from COJ) and prepare a 3-year Cash Flow Projection. JMMB requires this for startup accounts.', url: 'https://jm.jmmb.com/business-banking', cta: 'JMMB Business' },
                        { action: 'Draft a Board Resolution authorising the JMMB relationship. Must include: all authorised signers with specimen signatures, and the Company Seal or Stamp.' },
                        { action: 'Obtain two character references for each director. Eligible referees: Justice of the Peace, Notary Public, Minister of Religion, Lawyer, Medical Doctor, or a JMMB client of over 2 years. No family members.' },
                        { action: 'Complete Business Account Opening Form AOB-032023. Attach BRC, TCC, Articles of Incorporation, Certificate of Incorporation, and proof of address for all signatories.' },
                        { action: 'A JMMB representative will conduct a mandatory physical site visit to your business premises. Schedule this in advance.' },
                        { action: 'Account approval and JMMB Moneyline online banking credentials arrive within 24 to 48 hours of the site visit. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Scotiabank Business (USD-friendly)',
                    time: '48 to 72 hours after appointment',
                    cost: 'J$10,000 minimum balance (Chequing). Monthly service charge: J$1,035.',
                    steps: [
                        { action: 'Book a business banking appointment at your nearest Scotiabank branch.', url: 'https://jm.scotiabank.com/business-banking.html', cta: 'Scotiabank Business' },
                        { action: 'Bring: Certificate of Incorporation, Articles of Incorporation, company TRN, directors\' TRNs, and proof of address (utility bill under 6 months old).' },
                        { action: 'Provide two character references. From a Justice of the Peace or another bank.' },
                        { action: 'Bring a Directors\' Resolution authorising the account, listing authorised signatories and signing mandate.' },
                        { action: 'Provide 12 months of bank statements or audited financials.' },
                        { action: 'In-branch signing of Signature Card, Operation of Account Agreement, and Business Services Application. Account active within 48 to 72 hours. Download your bank letter and upload it here.' },
                    ],
                },
            ],
        } : isUS ? {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (best for startups and international founders)',
                    time: '1 to 3 business days',
                    cost: 'Free. No minimum balance, no monthly fees.',
                    steps: [
                        { action: 'Apply online at Mercury. No branch visit required. Accepts international founders with a US entity.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: formation documents (Articles / Certificate), EIN confirmation, government ID for all owners over 25%, and Operating Agreement or Bylaws.' },
                        { action: 'Account typically approved in 1 to 3 business days. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Relay (great for multi-account cash management)',
                    time: '2 to 4 business days',
                    cost: 'Free. No minimum balance.',
                    steps: [
                        { action: 'Apply at Relay. Supports up to 20 sub-accounts. Useful for separating operating cash, payroll, and tax reserves.', url: 'https://relayfi.com', cta: 'Relay bank' },
                        { action: 'Provide: formation documents, EIN, government ID.' },
                        { action: 'Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Brex (VC-backed startups)',
                    time: '1 to 2 business days',
                    cost: 'Free. Includes corporate card with no personal guarantee.',
                    steps: [
                        { action: 'Apply at Brex. Built for funded startups. Recommended if you\'re raising or have raised.', url: 'https://www.brex.com', cta: 'Brex' },
                        { action: 'Provide: formation documents, EIN, cap table.' },
                    ],
                },
            ],
        } : null,
    });

    return base;
}

function getDocCategories(entityType, country, jurisdiction) {
    const fromModule = getProcedureCategories(country, entityType, jurisdiction);
    if (fromModule?.length) return fromModule;
    return getDocCategoriesInline(entityType, country, jurisdiction);
}

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
                    entity_type: entityType || recommendation.entity,
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
                                                <span className="text-base font-bold text-white">{recommendation.entity}</span>
                                                <span className="text-sm uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full">Recommended</span>
                                            </div>
                                            <p className="text-base text-gray-400 leading-relaxed">{recommendation.reason}</p>
                                        </div>
                                    ) : (
                                        <div className="group">
                                            <label className={labelClass}>Entity Type</label>
                                            <select value={entityType} onChange={e => setEntityType(e.target.value)} required className={`${inputClass} appearance-none cursor-pointer`}>
                                                <option value="">Select your entity type</option>
                                                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

// Dashboard. Protected client console
const Dashboard = ({ setCurrentView, setUnreadCount }) => {
    const [session, setSession] = useState(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showReset, setShowReset] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetStatus, setResetStatus] = useState(null); // 'sent' | error string | null
    const [clientProfile, setClientProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState(false);
    const [allClients, setAllClients] = useState([]);
    const [adminLoading, setAdminLoading] = useState(false);
    const [advancingId, setAdvancingId] = useState(null);
    const [armedDeleteId, setArmedDeleteId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    // Phase A. Admin filters
    const [adminSearch, setAdminSearch] = useState('');
    const [adminPlanFilter, setAdminPlanFilter] = useState('all'); // 'all' | 'starter' | 'growth' | 'past_due'
    const [adminLifecycleFilter, setAdminLifecycleFilter] = useState('all'); // 'all' | 'onboarding' | 'active' | 'paused' | 'churned' | 'archived'
    const [updatingLifecycleId, setUpdatingLifecycleId] = useState(null);
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientDocs, setClientDocs] = useState([]);
    const [clientMessages, setClientMessages] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [messageInput, setMessageInput] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [msgScheduled, setMsgScheduled] = useState(false);
    const [msgScheduleAt, setMsgScheduleAt] = useState('');
    const [msgSendEmail, setMsgSendEmail] = useState(false);
    const [msgEmailSubject, setMsgEmailSubject] = useState('');
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [adminUploadError, setAdminUploadError] = useState('');
    const [myDocs, setMyDocs] = useState([]);
    const [myMessages, setMyMessages] = useState([]);
    const [myDocsLoading, setMyDocsLoading] = useState(false);
    const [myMessagesLoading, setMyMessagesLoading] = useState(false);
    const [clientMessageInput, setClientMessageInput] = useState('');
    const [clientMsgScheduled, setClientMsgScheduled] = useState(false);
    const [clientMsgScheduleAt, setClientMsgScheduleAt] = useState('');
    const [sendingClientMessage, setSendingClientMessage] = useState(false);
    const [clientUploading, setClientUploading] = useState(false);
    const [vaultUploadError, setVaultUploadError] = useState('');
    // Formation assistant
    const [agentQuestion, setAgentQuestion] = useState('');
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentAnswer, setAgentAnswer] = useState(() => { try { return localStorage.getItem('oq_last_answer') || ''; } catch { return ''; } });
    const [agentError, setAgentError] = useState('');
    // Jurisdiction-tailored blueprint (starter questions + required docs)
    const [blueprint, setBlueprint] = useState(null);
    const [complianceBlueprint, setComplianceBlueprint] = useState(null);
    const [complianceArtifacts, setComplianceArtifacts] = useState([]);
    const [complianceIntake, setComplianceIntake] = useState({});
    const [draftStatus, setDraftStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
    const intakeDirtyRef = React.useRef(false);
    const autosaveTimerRef = React.useRef(null);
    const lastSavedPayloadRef = React.useRef(null);
    const [completingStep06, setCompletingStep06] = useState(false);
    const [step06Error, setStep06Error] = useState('');
    const [advanceStepError, setAdvanceStepError] = useState('');
    // Questions the user has already asked. Persisted in localStorage per user
    const [answeredQuestions, setAnsweredQuestions] = useState([]);
    // Capital readiness. Partner intro request state
    const [capitalRequestSent, setCapitalRequestSent] = useState(false);
    const [activePhaseTab, setActivePhaseTab] = useState('foundation'); // 'foundation' | 'operations' | 'infrastructure'
    const [capitalRequesting, setCapitalRequesting] = useState(false);
    // Jurisdiction setup (for clients who skipped step 2/3 during signup)
    const [showJurisdictionSetup, setShowJurisdictionSetup] = useState(false);
    const [setupCountry, setSetupCountry] = useState('United States');
    const [setupJurisdiction, setSetupJurisdiction] = useState('');
    const [setupIntent, setSetupIntent] = useState('');
    const [setupSellsTo, setSetupSellsTo] = useState('');
    const [setupEntity, setSetupEntity] = useState('');
    const [dashTab, setDashTab] = useState(() => {
        const h = window.location.hash.replace('#', '');
        return ['overview','pipeline','vault','compliance','messages','capital','navigator'].includes(h) ? h : 'overview';
    });
    const [msgInbox, setMsgInbox] = useState('assistant');
    const msgInboxDefaulted = React.useRef(false);
    const myMessagesLoadedRef = React.useRef(false);
    const switchTab = (id) => {
        setDashTab(id);
        history.replaceState(null, '', '#' + id);
    };
    const [showPricing, setShowPricing] = useState(false);
    const [alertDismissed, setAlertDismissed] = useState(false);
    const [expandedVaultCard, setExpandedVaultCard] = useState(null);
    const [vaultFillCat, setVaultFillCat] = useState(null);
    const [vaultProcess, setVaultProcess] = useState(null);
    const [vaultProcessTrack, setVaultProcessTrack] = useState(0);
    const [vaultStepsDone, setVaultStepsDone] = useState({}); // { catId_trackIdx_stepIdx: true }
    const [vaultReminderStep, setVaultReminderStep] = useState(null); // { catId, trackIdx, stepIdx, stepText }
    const [vaultReminderDays, setVaultReminderDays] = useState('3');
    const [vaultReminderSending, setVaultReminderSending] = useState(false);
    const [vaultReminderSent, setVaultReminderSent] = useState({});
    const [setupEntityOverride, setSetupEntityOverride] = useState(false);
    const [savingSetup, setSavingSetup] = useState(false);
    const [adminInternalNotes, setAdminInternalNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [deliverableStep, setDeliverableStep] = useState('');
    const [clientComplianceArtifacts, setClientComplianceArtifacts] = useState([]);
    const [clientObligations, setClientObligations] = useState([]);
    const [clientObligationsLoading, setClientObligationsLoading] = useState(false);
    const [clientObligationsError, setClientObligationsError] = useState('');
    const [adminClientObligations, setAdminClientObligations] = useState([]);
    const [adminObligationsLoading, setAdminObligationsLoading] = useState(false);
    const [overdueQueue, setOverdueQueue] = useState([]);
    const [adminMsgTab, setAdminMsgTab] = useState('team');
    const [statusReportCache, setStatusReportCache] = useState({});
    const [statusReportLoading, setStatusReportLoading] = useState(false);
    const fileInputRef = React.useRef(null);

    const msgThread = (m) => m.thread || (m.is_ai_generated ? 'assistant' : 'team');

    useEffect(() => {
        if (!supabase) return;
        supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!session || !supabase) return;
        setProfileLoading(true);
        setProfileError(false);
        supabase
            .from('clients')
            .select('*')
            .eq('id', session.user.id)
            .single()
            .then(({ data, error }) => {
                setProfileLoading(false);
                if (error) {
                    setProfileError(true);
                } else {
                    setClientProfile(data);
                    
                    // Load last AI answer from messages table. Works across devices
                    if (!data.is_admin) {
                        supabase
                            .from('messages')
                            .select('body')
                            .eq('client_id', session.user.id)
                            .eq('is_ai_generated', true)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .then(({ data: msgs }) => {
                                if (msgs && msgs.length > 0 && msgs[0].body) {
                                    setAgentAnswer(msgs[0].body);
                                    try { localStorage.setItem('oq_last_answer', msgs[0].body); } catch {}
                                }
                            });
                    }

                    if (data?.is_admin) {
                        setAdminLoading(true);
                        Promise.all([
                            supabase.from('clients').select('*').order('created_at', { ascending: false }),
                            supabase.from('overdue_obligations').select('*'),
                        ]).then(([{ data: clients }, { data: overdue }]) => {
                            setAdminLoading(false);
                            setAllClients(clients || []);
                            setOverdueQueue(overdue || []);
                        });
                    }
                }
            });
    }, [session]);

    useEffect(() => {
        if (!session || !supabase) return;
        const channel = supabase
            .channel('client-profile-' + session.user.id)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'clients',
                filter: `id=eq.${session.user.id}`,
            }, ({ new: updated }) => {
                setClientProfile(prev => ({ ...prev, ...updated }));
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [session]);

    useEffect(() => {
        if (!session || !supabase || clientProfile?.is_admin || dashTab !== 'messages') return;
        supabase.from('clients').update({ client_last_read_at: new Date().toISOString() }).eq('id', session.user.id).then(() => {
            setUnreadCount(0);
        });
    }, [session?.user?.id, dashTab, clientProfile?.is_admin]);

    useEffect(() => {
        msgInboxDefaulted.current = false;
        myMessagesLoadedRef.current = false;
    }, [session?.user?.id]);

    useEffect(() => {
        if (!clientProfile || msgInboxDefaulted.current) return;
        const plan = clientProfile.plan ?? 'starter';
        const isPaid = plan === 'growth' || plan === 'enterprise';
        setMsgInbox(isPaid ? 'team' : 'assistant');
        msgInboxDefaulted.current = true;
    }, [clientProfile?.id, clientProfile?.plan]);

    // Seed jurisdiction setup form from saved profile so editing pre-fills instead of starting blank
    useEffect(() => {
        if (!clientProfile) return;
        if (clientProfile.country) setSetupCountry(clientProfile.country);
        if (clientProfile.jurisdiction) setSetupJurisdiction(clientProfile.jurisdiction);
        if (clientProfile.business_intent) setSetupIntent(clientProfile.business_intent);
        if (clientProfile.sells_to) setSetupSellsTo(clientProfile.sells_to);
        if (clientProfile.entity_type) {
            setSetupEntity(clientProfile.entity_type);
            setSetupEntityOverride(true);
        }
    }, [clientProfile]);

    // Load answered questions + vault state: Supabase first, localStorage as fallback cache
    useEffect(() => {
        if (!session || !clientProfile) return;
        const uid = session.user.id;
        // answered_questions
        if (clientProfile.answered_questions?.length) {
            setAnsweredQuestions(clientProfile.answered_questions);
            try { localStorage.setItem(`oq_answered_${uid}`, JSON.stringify(clientProfile.answered_questions)); } catch {}
        } else {
            try { setAnsweredQuestions(JSON.parse(localStorage.getItem(`oq_answered_${uid}`) || '[]')); } catch {}
        }
        // vault_steps_done
        if (clientProfile.vault_steps_done && Object.keys(clientProfile.vault_steps_done).length) {
            setVaultStepsDone(clientProfile.vault_steps_done);
            try { localStorage.setItem(`oq_vsteps_${uid}`, JSON.stringify(clientProfile.vault_steps_done)); } catch {}
        } else {
            try { setVaultStepsDone(JSON.parse(localStorage.getItem(`oq_vsteps_${uid}`) || '{}')); } catch {}
        }
        // vault_reminders_sent
        if (clientProfile.vault_reminders_sent && Object.keys(clientProfile.vault_reminders_sent).length) {
            setVaultReminderSent(clientProfile.vault_reminders_sent);
            try { localStorage.setItem(`oq_vrem_${uid}`, JSON.stringify(clientProfile.vault_reminders_sent)); } catch {}
        } else {
            try { setVaultReminderSent(JSON.parse(localStorage.getItem(`oq_vrem_${uid}`) || '{}')); } catch {}
        }
    }, [clientProfile?.id]);

    // Helper: call send-scheduled edge function
    const fireSendScheduled = async () => {
        if (!supabase || !session) return;
        try {
            const { data: { session: s } } = await supabase.auth.getSession();
            await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/send-scheduled', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${s.access_token}`, 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA' },
            });
        } catch {}
    };

    // On login: fire send-scheduled for any overdue messages
    useEffect(() => {
        if (!session || !supabase) return;
        fireSendScheduled();
    }, [session?.user?.id]);

    // Fetch jurisdiction-tailored blueprint (starter questions + doc checklist) once the profile is loaded
    // Cached in localStorage so it doesn't re-fetch every login
    useEffect(() => {
        if (!session || !supabase || !clientProfile || clientProfile.is_admin) return;
        if (!clientProfile.country && !clientProfile.entity_type) return;
        const cacheKey = `oq_blueprint_${session.user.id}_${clientProfile.country}_${clientProfile.entity_type}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) { try { setBlueprint(JSON.parse(cached)); return; } catch {} }
        let cancelled = false;
        (async () => {
            try {
                const { data: { session: authSession } } = await supabase.auth.getSession();
                const res = await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/client-blueprint', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authSession.access_token}`,
                        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA',
                    },
                    body: '{}',
                });
                const json = await res.json();
                if (!cancelled && json.starter_questions) {
                    setBlueprint(json);
                    localStorage.setItem(cacheKey, JSON.stringify(json));
                }
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [session, clientProfile?.country, clientProfile?.entity_type, clientProfile?.funding_stage]);

    const refreshComplianceArtifacts = React.useCallback(() => {
        if (!session || !supabase || clientProfile?.is_admin) return Promise.resolve();
        return supabase.from('compliance_artifacts').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false })
            .then(({ data }) => {
                const rows = data || [];
                setComplianceArtifacts(rows);
                // Do not overwrite in-progress edits — user may be mid-typing
                if (!intakeDirtyRef.current) {
                    const intakeRow = rows.find((a) => a.kind === 'compliance_intake');
                    if (intakeRow) setComplianceIntake(buildIntakeAnswers(intakeRow));
                }
            });
    }, [session?.user?.id, clientProfile?.is_admin]);

    const autosaveDraftIntake = React.useCallback(async (answers) => {
        if (!supabase || !session || !complianceBlueprint) return;
        const payload = buildDraftPayload({
            clientId: session.user.id,
            blueprintId: complianceBlueprint.id,
            lastResearched: complianceBlueprint.last_researched,
            intakeAnswers: answers,
            jurisdiction: complianceBlueprint.jurisdiction,
        });
        const serialized = payload.artifact_path;
        if (serialized === lastSavedPayloadRef.current) {
            intakeDirtyRef.current = false;
            return;
        }
        setDraftStatus('saving');
        const existing = complianceArtifacts.find((a) => a.kind === 'compliance_intake');
        let error;
        if (existing) {
            ({ error } = await supabase.from('compliance_artifacts').update(payload).eq('id', existing.id));
        } else {
            ({ error } = await supabase.from('compliance_artifacts').insert(payload));
        }
        if (error) {
            setDraftStatus('error');
        } else {
            lastSavedPayloadRef.current = serialized;
            intakeDirtyRef.current = false;
            setDraftStatus('saved');
            // Refresh artifact list to pick up new row id (without disturbing intake state)
            supabase.from('compliance_artifacts').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false })
                .then(({ data }) => { if (data) setComplianceArtifacts(data); });
        }
    }, [supabase, session?.user?.id, complianceBlueprint, complianceArtifacts]);

    const handleIntakeChange = React.useCallback((updater) => {
        setComplianceIntake((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            intakeDirtyRef.current = true;
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = setTimeout(() => {
                autosaveDraftIntake(next);
            }, 900);
            return next;
        });
    }, [autosaveDraftIntake]);

    const handleIntakePromoted = React.useCallback((answers) => {
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }
        intakeDirtyRef.current = false;
        lastSavedPayloadRef.current = serializeIntake(answers);
        setComplianceIntake(answers);
        setDraftStatus(null);
    }, []);

    const refreshClientObligations = React.useCallback(() => {
        if (!session || !supabase || clientProfile?.is_admin) return Promise.resolve();
        setClientObligationsLoading(true);
        setClientObligationsError('');
        return supabase
            .from('compliance_obligations')
            .select('*')
            .eq('client_id', session.user.id)
            .order('due_date', { ascending: true, nullsFirst: false })
            .then(({ data, error }) => {
                if (error) {
                    setClientObligationsError(error.message);
                    setClientObligations([]);
                } else {
                    setClientObligations(data || []);
                }
            })
            .finally(() => setClientObligationsLoading(false));
    }, [session?.user?.id, clientProfile?.is_admin]);

    const refreshAdminClientObligations = React.useCallback((clientId) => {
        if (!supabase || !clientId) return Promise.resolve();
        setAdminObligationsLoading(true);
        return supabase
            .from('compliance_obligations')
            .select('*')
            .eq('client_id', clientId)
            .order('due_date', { ascending: true, nullsFirst: false })
            .then(({ data, error }) => {
                if (!error) setAdminClientObligations(data || []);
            })
            .finally(() => setAdminObligationsLoading(false));
    }, []);

    const refreshOverdueQueue = React.useCallback(() => {
        if (!supabase) return Promise.resolve();
        return supabase
            .from('overdue_obligations')
            .select('*')
            .then(({ data }) => setOverdueQueue(data || []));
    }, []);

    useEffect(() => {
        if (!session || !supabase || !clientProfile || clientProfile.is_admin) return;
        refreshComplianceArtifacts();
    }, [session?.user?.id, clientProfile?.id, clientProfile?.is_admin, refreshComplianceArtifacts]);

    // Flush pending autosave on tab hide or page unload
    useEffect(() => {
        const flush = () => {
            if (intakeDirtyRef.current && autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveDraftIntake(complianceIntake);
            }
        };
        window.addEventListener('beforeunload', flush);
        document.addEventListener('visibilitychange', flush);
        return () => {
            window.removeEventListener('beforeunload', flush);
            document.removeEventListener('visibilitychange', flush);
        };
    }, [autosaveDraftIntake, complianceIntake]);

    useEffect(() => {
        if (!session || !supabase || !clientProfile || clientProfile.is_admin) return;
        const access = canAccessComplianceCalendar(clientProfile);
        if (access.access) refreshClientObligations();
    }, [session?.user?.id, clientProfile?.id, clientProfile?.lifecycle, clientProfile?.onboarding_step, clientProfile?.plan, clientProfile?.is_admin, refreshClientObligations]);

    useEffect(() => {
        if (!session || !supabase || !clientProfile || clientProfile.is_admin) return;
        const step = clientProfile.onboarding_step ?? 0;
        if (step < 5) return;
        const slug = resolveComplianceSlug(clientProfile.country || 'United States', clientProfile.jurisdiction || '', clientProfile.entity_type || '');
        if (!slug) return;
        let cancelled = false;
        (async () => {
            let fromEdge = false;
            try {
                const { data: { session: authSession } } = await supabase.auth.getSession();
                if (authSession?.access_token) {
                    try {
                        const res = await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/client-blueprint', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${authSession.access_token}`,
                                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA',
                            },
                            body: JSON.stringify({ mode: 'compliance' }),
                        });
                        const json = await res.json();
                        if (!cancelled && json.procedure_kind === 'compliance') {
                            setComplianceBlueprint(json);
                            fromEdge = true;
                        }
                    } catch { /* edge unavailable. Fall through to DB */ }
                }
                if (!cancelled && !fromEdge) {
                    const { data: row } = await supabase.from('procedure_guides').select('blueprint').eq('slug', slug).maybeSingle();
                    if (!cancelled && row?.blueprint?.procedure_kind === 'compliance') setComplianceBlueprint(row.blueprint);
                }
            } catch { /* concierge-only jurisdictions */ }
        })();
        return () => { cancelled = true; };
    }, [session, clientProfile?.id, clientProfile?.onboarding_step, clientProfile?.country, clientProfile?.jurisdiction, clientProfile?.entity_type]);

    const refreshMyMessages = React.useCallback((opts = {}) => {
        if (!session || !supabase || clientProfile?.is_admin) return;
        const silent = opts.silent ?? false;
        if (!silent || !myMessagesLoadedRef.current) {
            setMyMessagesLoading(true);
        }
        supabase.from('messages').select('*').eq('client_id', session.user.id).order('created_at', { ascending: true })
            .then(({ data }) => {
                setMyMessages(data || []);
                setMyMessagesLoading(false);
                myMessagesLoadedRef.current = true;
            });
    }, [session?.user?.id, clientProfile?.is_admin]);

    useEffect(() => {
        if (!clientProfile || clientProfile.is_admin) return;
        const unread = myMessages.filter(m =>
            m.is_admin_message && msgThread(m) === 'team' && m.sent_at &&
            m.created_at > (clientProfile.client_last_read_at || '')
        ).length;
        setUnreadCount(unread);
    }, [myMessages, clientProfile?.client_last_read_at, clientProfile?.is_admin]);

    useEffect(() => {
        if (!session || !supabase || !clientProfile || clientProfile.is_admin) return;
        setMyDocsLoading(true);
        supabase.from('documents').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false })
            .then(({ data }) => { setMyDocs(data || []); setMyDocsLoading(false); });
        myMessagesLoadedRef.current = false;
        refreshMyMessages();
    }, [session?.user?.id, clientProfile?.id, clientProfile?.is_admin, refreshMyMessages]);

    useEffect(() => {
        if (!session || !supabase || clientProfile?.is_admin) return;
        const channel = supabase
            .channel('client-msgs-' + session.user.id)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'messages',
                filter: `client_id=eq.${session.user.id}`,
            }, () => { refreshMyMessages({ silent: true }); })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [session?.user?.id, clientProfile?.is_admin, refreshMyMessages]);

    useEffect(() => {
        if (!session || !supabase || !selectedClient) return;
        const channel = supabase
            .channel('admin-msgs-' + selectedClient.id)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'messages',
                filter: `client_id=eq.${selectedClient.id}`,
            }, () => {
                supabase.from('messages').select('*').eq('client_id', selectedClient.id).order('created_at', { ascending: true })
                    .then(({ data }) => setClientMessages(data || []));
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [session, selectedClient?.id]);

    const handleClientUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !supabase) return;
        setClientUploading(true);
        const path = `${session.user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file);
        if (!uploadError) {
            const { error: dbError } = await supabase.from('documents').insert({
                client_id: session.user.id,
                name: file.name,
                path,
                size: file.size,
                uploaded_by: session.user.id,
            });
            if (!dbError) {
                setMyDocs(prev => [{ name: file.name, path, size: file.size, created_at: new Date().toISOString() }, ...prev]);
            }
        }
        setClientUploading(false);
        e.target.value = '';
    };

    const handleClientMessage = async (e) => {
        e.preventDefault();
        if (!clientMessageInput.trim() || !supabase) return;
        setSendingClientMessage(true);
        const payload = {
            client_id: session.user.id,
            sender_id: session.user.id,
            body: clientMessageInput.trim(),
            is_admin_message: false,
            thread: 'team',
            scheduled_at: clientMsgScheduled && clientMsgScheduleAt ? new Date(clientMsgScheduleAt).toISOString() : null,
        };
        const { error } = await supabase.from('messages').insert(payload);
        if (!error) {
            await fireSendScheduled();
            if (clientMsgScheduled && clientMsgScheduleAt) {
                const delay = new Date(clientMsgScheduleAt).getTime() - Date.now();
                if (delay > 0) setTimeout(() => fireSendScheduled(), delay);
            }
            refreshMyMessages({ silent: true });
            setClientMessageInput('');
            setClientMsgScheduled(false);
            setClientMsgScheduleAt('');
        }
        setSendingClientMessage(false);
    };

    const openClientDetail = async (client) => {
        setSelectedClient(client);
        setAdminMsgTab('team');
        setMessageInput('');
        setMsgScheduled(false);
        setMsgScheduleAt('');
        setMsgSendEmail(false);
        setMsgEmailSubject('');
        setAdminUploadError('');
        setAdminInternalNotes(client.internal_notes || '');
        setDetailLoading(true);
        setClientDocs([]);
        setClientMessages([]);
        setClientComplianceArtifacts([]);
        setAdminClientObligations([]);
        setAdminObligationsLoading(true);
        const [{ data: docs }, { data: msgs }, { data: compliance }, { data: obligations }] = await Promise.all([
            supabase.from('documents').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
            supabase.from('messages').select('*').eq('client_id', client.id).order('created_at', { ascending: true }),
            supabase.from('compliance_artifacts').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
            supabase.from('compliance_obligations').select('*').eq('client_id', client.id).order('due_date', { ascending: true, nullsFirst: false }),
            supabase.from('clients').update({ admin_last_read_at: new Date().toISOString() }).eq('id', client.id)
        ]);
        setClientDocs(docs || []);
        setClientMessages(msgs || []);
        setClientComplianceArtifacts(compliance || []);
        setAdminClientObligations(obligations || []);
        setAdminObligationsLoading(false);
        setDetailLoading(false);
    };

    const handleBoostCredits = async () => {
        if (!supabase || !selectedClient) return;
        const { error } = await supabase.from('clients').update({ daily_ai_credits: 5, updated_at: new Date().toISOString() }).eq('id', selectedClient.id);
        if (!error) {
            setAllClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, daily_ai_credits: 5 } : c));
            setSelectedClient(prev => ({ ...prev, daily_ai_credits: 5 }));
        }
    };

    const handlePlanChange = async (plan) => {
        if (!supabase || !selectedClient) return;
        const { error } = await supabase.from('clients').update({ plan, updated_at: new Date().toISOString() }).eq('id', selectedClient.id);
        if (!error) {
            setAllClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, plan } : c));
            setSelectedClient(prev => ({ ...prev, plan }));
        }
    };

    const handleUpdateInternalNotes = async () => {
        if (!supabase || !selectedClient) return;
        setSavingNotes(true);
        const { error } = await supabase
            .from('clients')
            .update({ internal_notes: adminInternalNotes, updated_at: new Date().toISOString() })
            .eq('id', selectedClient.id);
        if (!error) {
            setAllClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, internal_notes: adminInternalNotes } : c));
            setSelectedClient(prev => ({ ...prev, internal_notes: adminInternalNotes }));
        }
        setSavingNotes(false);
    };

    const handleAdminMessage = async (e) => {
        e.preventDefault();
        if (!messageInput.trim() || !supabase || !selectedClient) return;
        setSendingMessage(true);
        const payload = {
            client_id: selectedClient.id,
            sender_id: session.user.id,
            body: messageInput.trim(),
            is_admin_message: true,
            thread: 'team',
            send_email: msgSendEmail,
            email_subject: msgSendEmail && msgEmailSubject.trim() ? msgEmailSubject.trim() : null,
            scheduled_at: msgScheduled && msgScheduleAt ? new Date(msgScheduleAt).toISOString() : null,
        };
        const { error } = await supabase.from('messages').insert(payload);
        if (!error) {
            await fireSendScheduled();
            if (msgScheduled && msgScheduleAt) {
                const delay = new Date(msgScheduleAt).getTime() - Date.now();
                if (delay > 0) setTimeout(() => fireSendScheduled(), delay);
            }
            const { data: msgs } = await supabase.from('messages').select('*').eq('client_id', selectedClient.id).order('created_at', { ascending: true });
            setClientMessages(msgs || []);
            setMessageInput('');
            setMsgScheduled(false);
            setMsgScheduleAt('');
            setMsgSendEmail(false);
            setMsgEmailSubject('');
        }
        setSendingMessage(false);
    };

    const handleAdminUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !supabase || !selectedClient) return;
        setUploadingDoc(true);
        setAdminUploadError('');
        const path = `${selectedClient.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file);
        if (uploadError) {
            setAdminUploadError(`Upload failed: ${uploadError.message}`);
            setUploadingDoc(false);
            e.target.value = '';
            return;
        }
        const { error: dbError } = await supabase.from('documents').insert({
            client_id: selectedClient.id,
            name: file.name,
            path,
            size: file.size,
            uploaded_by: session.user.id,
            step_index: deliverableStep !== '' ? parseInt(deliverableStep) : null
        });
        if (dbError) {
            setAdminUploadError(`Saved the file, but could not record it: ${dbError.message}`);
        } else {
            setClientDocs(prev => [{ name: file.name, path, size: file.size, step_index: deliverableStep !== '' ? parseInt(deliverableStep) : null, created_at: new Date().toISOString() }, ...prev]);
            setDeliverableStep('');
        }
        setUploadingDoc(false);
        e.target.value = '';
    };

    const handleAgentQuestion = async (e, isWelcome = false) => {
        if (e) e.preventDefault();
        if (!agentQuestion.trim() && !isWelcome) return;
        if (!supabase || !session) return;
        // Mark this question as answered so it stops showing as a suggestion
        if (!isWelcome && agentQuestion.trim()) {
            const updated = [...new Set([...answeredQuestions, agentQuestion.trim()])];
            setAnsweredQuestions(updated);
            try { localStorage.setItem(`oq_answered_${session.user.id}`, JSON.stringify(updated)); } catch {}
            supabase.from('clients').update({ answered_questions: updated }).eq('id', session.user.id).then(() => {});
        }

        setAgentLoading(true);
        setAgentError('');
        try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            const res = await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/agent-formation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authSession.access_token}`,
                },
                body: JSON.stringify({ question: isWelcome ? '' : agentQuestion.trim(), isWelcome }),
            });
            const json = await res.json();
            if (json.answer) {
                setAgentAnswer(json.answer);
                try { localStorage.setItem('oq_last_answer', json.answer); } catch {}
                // Refresh profile for credits
                const { data: prof } = await supabase.from('clients').select('*').eq('id', session.user.id).single();
                setClientProfile(prof);
                // Refresh messages
                const { data: msgs } = await supabase.from('messages').select('*').eq('client_id', session.user.id).order('created_at', { ascending: true });
                setMyMessages(msgs || []);
            } else {
                setAgentError(json.error || 'No response. Try again.');
            }
        } catch {
            setAgentError('Could not reach formation assistant.');
        }
        setAgentLoading(false);
        setAgentQuestion('');
    };

    const handleTogglePrivacy = async () => {
        if (!supabase || !session) return;
        const newVal = !clientProfile.share_ai_data;
        const { error } = await supabase.from('clients').update({ share_ai_data: newVal }).eq('id', session.user.id);
        if (!error) setClientProfile(prev => ({ ...prev, share_ai_data: newVal }));
    };

    const PARTNER_REGISTRY = [
        // Banking
        { slug: 'sendana', name: 'Sendana', category: 'banking', icon: 'ph-bank', color: '#3daedd',
          tagline: 'USD accounts, USDC wallet, Visa card. Open with local ID.',
          url: 'https://usesendana.com',
          jurisdictions: ['Jamaica','Barbados','Trinidad and Tobago','Guyana','Belize','Grenada','Saint Lucia','Antigua and Barbuda','Dominica','Saint Kitts and Nevis','Saint Vincent and the Grenadines','Suriname','Haiti','Bahamas','CARICOM'],
          stages: ['Pre-Seed','Seed','Series A','Series B+','Bootstrapped'],
          match_weight: 95,
          why: (p) => `Jamaica and Caribbean-native banking platform. Pre-verified KYC from your Onboardin procedure means faster signup.`,
        },
        { slug: 'mercury', name: 'Mercury', category: 'banking', icon: 'ph-bank', color: '#60a5fa',
          tagline: 'US business banking built for startups. No fees, API access.',
          url: 'https://mercury.com',
          jurisdictions: ['United States','Delaware','Wyoming','Florida','New York','California','Texas'],
          stages: ['Pre-Seed','Seed','Series A','Series B+'],
          match_weight: 90,
          why: (p) => `Top-rated US startup bank. Works for ${p.entity_type || 'your entity type'} and integrates with Stripe, QuickBooks, and your cap table tools.`,
        },
        { slug: 'relay', name: 'Relay', category: 'banking', icon: 'ph-bank', color: '#34d399',
          tagline: 'US business banking with 20 accounts and spend controls.',
          url: 'https://relayfi.com',
          jurisdictions: ['United States','Delaware','Wyoming','Florida'],
          stages: ['Pre-Seed','Seed','Bootstrapped'],
          match_weight: 75,
          why: (p) => `Good fit for early-stage US ${p.entity_type || 'entities'} that need multiple accounts for revenue, payroll, and taxes.`,
        },
        // Accounting
        { slug: 'wave', name: 'Wave', category: 'accounting', icon: 'ph-calculator', color: '#fbbf24',
          tagline: 'Free accounting, invoicing, and receipt scanning.',
          url: 'https://waveapps.com',
          jurisdictions: ['United States','Canada','Jamaica','United Kingdom'],
          stages: ['Pre-Seed','Seed','Bootstrapped'],
          match_weight: 85,
          why: (p) => `Free tier covers invoicing and books for early-stage ${p.entity_type || 'companies'}. On the Onboardin integration roadmap.`,
        },
        { slug: 'numeral', name: 'Numeral Tax', category: 'accounting', icon: 'ph-receipt', color: '#c084fc',
          tagline: 'Jamaica GCT, corporate tax, and compliance filing.',
          url: 'https://numeraltax.com',
          jurisdictions: ['Jamaica'],
          stages: ['Pre-Seed','Seed','Series A','Bootstrapped'],
          match_weight: 92,
          why: (p) => `Jamaica-specialist. Handles GCT, corporate income tax, and TAJ filings for ${p.entity_type || 'Jamaica companies'}.`,
        },
        // Legal / Compliance
        { slug: 'termly', name: 'Termly', category: 'compliance', icon: 'ph-shield-check', color: '#f87171',
          tagline: 'Privacy policy, cookie consent, and compliance documents.',
          url: 'https://termly.io',
          jurisdictions: ['United States','United Kingdom','Canada','Jamaica','European Union'],
          stages: ['Pre-Seed','Seed','Series A','Bootstrapped'],
          match_weight: 70,
          why: (p) => `Generates GDPR, CCPA, and DPDPA-compliant privacy policies. Covers ${p.sells_to === 'Consumers' ? 'consumer-facing' : 'B2B'} use cases.`,
        },
        // Payments
        { slug: 'stripe', name: 'Stripe', category: 'payments', icon: 'ph-credit-card', color: '#7c3aed',
          tagline: 'Global payment processing with 135+ currencies.',
          url: 'https://stripe.com',
          jurisdictions: ['United States','Canada','United Kingdom','Jamaica'],
          stages: ['Pre-Seed','Seed','Series A','Series B+','Bootstrapped'],
          match_weight: 80,
          why: (p) => `Supports ${p.entity_type || 'your entity'} in ${p.jurisdiction || 'your jurisdiction'}. Free to start, 2.9% + 30c per transaction.`,
        },
        // Domain / Infrastructure
        { slug: 'namecheap', name: 'Namecheap', category: 'infrastructure', icon: 'ph-globe', color: '#2dd4bf',
          tagline: 'Domain registration and email hosting from $9/yr.',
          url: 'https://namecheap.com',
          jurisdictions: ['*'],
          stages: ['Pre-Seed','Seed','Series A','Series B+','Bootstrapped'],
          match_weight: 65,
          why: () => `Low-cost domains and email. Onboardin is a registered reseller. Apply through the Infrastructure pipeline step.`,
        },
    ];

    const getPartnerMatches = (profile) => {
        if (!profile) return [];
        const jurisdiction = profile.jurisdiction || profile.country || '';
        const stage = profile.funding_stage || 'Pre-Seed';
        const isCARICOM = ['Jamaica','Barbados','Trinidad and Tobago','Guyana','Belize','Grenada',
            'Saint Lucia','Antigua and Barbuda','Dominica','Saint Kitts and Nevis',
            'Saint Vincent and the Grenadines','Suriname','Haiti','Bahamas'].includes(jurisdiction);
        const isUS = ['United States','Delaware','Wyoming','Florida','New York','California','Texas'].includes(jurisdiction);

        return PARTNER_REGISTRY.map(p => {
            const jFit = p.jurisdictions.includes('*') || p.jurisdictions.includes(jurisdiction) || (isCARICOM && p.jurisdictions.includes('CARICOM'));
            const sFit = p.stages.includes(stage);
            const baseWeight = p.match_weight;
            const score = (jFit ? 50 : 0) + (sFit ? 30 : 0) + (baseWeight / 100 * 20);
            return { ...p, score, jFit, sFit, why: p.why(profile) };
        })
        .filter(p => p.score > 40)
        .sort((a, b) => b.score - a.score);
    };

    const handleRequestCapitalIntro = async () => {
        if (!supabase || !session || capitalRequesting) return;
        setCapitalRequesting(true);
        const body = `[CAPITAL INTRO REQUEST]\nCountry: ${clientProfile?.country || 'unspecified'}\nJurisdiction: ${clientProfile?.jurisdiction || 'unspecified'}\nStage: ${clientProfile?.funding_stage || 'unspecified'}\nEntity: ${clientProfile?.entity_type || 'unspecified'}\nBusiness: ${clientProfile?.business_intent || 'unspecified'}\n\nThe founder would like an introduction to a capital source matched to this profile.`;
        const { error } = await supabase.from('messages').insert({
            client_id: session.user.id,
            sender_id: session.user.id,
            body,
            is_admin_message: false,
        });
        if (!error) {
            setCapitalRequestSent(true);
            setMyMessages(prev => [...prev, { sender_id: session.user.id, body, is_admin_message: false, created_at: new Date().toISOString() }]);
        }
        setCapitalRequesting(false);
    };

    const handleSaveJurisdiction = async (e) => {
        e.preventDefault();
        if (!supabase || !session) return;
        setSavingSetup(true);
        const rec = recommendEntity(clientProfile?.funding_stage, setupIntent, setupSellsTo, setupCountry);
        const finalEntity = setupEntityOverride ? setupEntity : rec.entity;
        await supabase.from('clients').update({
            country: setupCountry,
            jurisdiction: setupJurisdiction,
            entity_type: finalEntity,
            business_intent: setupIntent,
            sells_to: setupSellsTo,
            updated_at: new Date().toISOString(),
        }).eq('id', session.user.id);
        setClientProfile(prev => ({ ...prev, country: setupCountry, jurisdiction: setupJurisdiction, entity_type: finalEntity, business_intent: setupIntent, sells_to: setupSellsTo }));
        setShowJurisdictionSetup(false);
        setSavingSetup(false);
    };

    const handleUpgrade = () => {
        setShowPricing(true);
    };

    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const handleStripeCheckout = async () => {
        if (!supabase || !session) return;
        setCheckoutLoading(true);
        try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            const res = await fetch(`https://qatfiicpkunabpphwqee.supabase.co/functions/v1/create-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authSession.access_token}`,
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA',
                },
            });
            const json = await res.json();
            if (json.url) {
                window.location.href = json.url;
            }
        } catch {}
        setCheckoutLoading(false);
    };

    const getSignedUrl = async (path) => {
        const { data } = await supabase.storage.from('client-documents').createSignedUrl(path, 60);
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    };

    const handleSignIn = async (e) => {
        e.preventDefault();
        if (!supabase) { setError('Auth not configured.'); return; }
        setLoading(true);
        setError('');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
        setLoading(false);
    };

    const handleSignOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    const handleReset = async (e) => {
        e.preventDefault();
        if (!supabase) { setResetStatus('Auth not configured.'); return; }
        setResetLoading(true);
        setResetStatus(null);
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
        setResetLoading(false);
        if (error) {
            setResetStatus(error.message);
        } else {
            setResetStatus('sent');
        }
    };

    const onboardingSteps = [
        { label: 'Account Created',          icon: 'ph-user-circle',       phase: 'foundation',    tier: 'starter' },
        { label: 'Entity Formation',          icon: 'ph-buildings',         phase: 'foundation',    tier: 'starter' },
        { label: 'Tax Registration',          icon: 'ph-identification-badge', phase: 'operations', tier: 'growth' },
        { label: 'Business Banking',          icon: 'ph-bank',              phase: 'operations',    tier: 'growth' },
        { label: 'IP & Contract Templates',   icon: 'ph-scroll',            phase: 'operations',    tier: 'growth' },
        { label: 'Privacy & Compliance',      icon: 'ph-shield-check',      phase: 'operations',    tier: 'growth' },
        { label: 'Landing Page Deployed',     icon: 'ph-globe',             phase: 'infrastructure',tier: 'growth' },
        { label: 'Repository Provision',      icon: 'ph-github-logo',       phase: 'infrastructure',tier: 'growth' },
        { label: 'CRM Connection',            icon: 'ph-address-book',      phase: 'infrastructure',tier: 'growth' },
        { label: 'Analytics Live',            icon: 'ph-chart-line',        phase: 'infrastructure',tier: 'growth' },
        { label: 'First AI Agent Deployed',   icon: 'ph-robot',             phase: 'infrastructure',tier: 'growth' },
    ];
    const currentStep = clientProfile?.onboarding_step ?? 0;

    const checkStep06Gate = async (clientId) => {
        const client = allClients.find((c) => c.id === clientId) || selectedClient;
        if (!client || !supabase) return { pass: false, missing: ['Client not found'] };
        const slug = resolveComplianceSlug(client.country || 'United States', client.jurisdiction || '', client.entity_type || '');
        if (!slug) return { pass: false, missing: ['No compliance procedure for this jurisdiction (concierge required)'] };
        const [{ data: artifacts }, { data: docs }, { data: guide }] = await Promise.all([
            supabase.from('compliance_artifacts').select('*').eq('client_id', clientId),
            supabase.from('documents').select('*').eq('client_id', clientId),
            supabase.from('procedure_guides').select('blueprint').eq('slug', slug).eq('is_active', true).maybeSingle(),
        ]);
        const bp = guide?.blueprint;
        if (!bp) return { pass: false, missing: ['Compliance procedure guide not found'] };
        const intakeRow = (artifacts || []).find((a) => a.kind === 'compliance_intake');
        const intake = mergeProfileIntoIntake(buildIntakeAnswers(intakeRow), client, bp.intake_questions || []);
        if (!intakeRow?.artifact_path) {
            return { pass: false, missing: ['Compliance intake not started. Client must open Step 06 from dashboard'] };
        }
        if (intakeRow.status === 'draft') {
            return { pass: false, missing: ['Compliance intake saved as draft. Client must save intake to finish'] };
        }
        return evaluateAcceptCriteria(bp, intake, artifacts || [], docs || []);
    };

    const handleAdvanceStep = async (clientId, currentStep) => {
        if (currentStep >= 11 || !supabase) return;
        setAdvancingId(clientId);
        setAdvanceStepError('');
        if (currentStep === 5) {
            const gate = await checkStep06Gate(clientId);
            if (!gate.pass) {
                setAdvanceStepError(`Step 06 incomplete: ${gate.missing.join(', ')}`);
                setAdvancingId(null);
                return;
            }
        }
        const { error } = await supabase
            .from('clients')
            .update({ onboarding_step: currentStep + 1, updated_at: new Date().toISOString() })
            .eq('id', clientId);
        if (!error) {
            setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, onboarding_step: currentStep + 1 } : c));
            if (selectedClient?.id === clientId) setSelectedClient(prev => ({ ...prev, onboarding_step: currentStep + 1 }));
        }
        setAdvancingId(null);
    };

    const handleClientCompleteStep06 = async () => {
        if (!supabase || !session || !clientProfile) return;
        setCompletingStep06(true);
        setStep06Error('');
        const plan = clientProfile.plan ?? 'starter';
        const isPaid = plan === 'growth' || plan === 'enterprise';
        if (!isPaid) {
            setStep06Error('Growth plan required to complete this step.');
            setCompletingStep06(false);
            return;
        }
        if (!complianceBlueprint) {
            setStep06Error('Compliance procedure not loaded. Refresh or try again in a moment.');
            setCompletingStep06(false);
            return;
        }
        const intakeRow = complianceArtifacts.find((a) => a.kind === 'compliance_intake');
        const merged = mergeProfileIntoIntake(
            { ...buildIntakeAnswers(intakeRow), ...complianceIntake },
            clientProfile,
            complianceBlueprint.intake_questions || [],
        );
        const { pass, missing } = evaluateAcceptCriteria(complianceBlueprint, merged, complianceArtifacts, myDocs);
        if (!pass) {
            setStep06Error(`Complete checklist first: ${missing.join(', ')}`);
            setCompletingStep06(false);
            return;
        }
        const intakePayload = buildActivePayload({
            clientId: session.user.id,
            blueprintId: complianceBlueprint.id,
            lastResearched: complianceBlueprint.last_researched,
            intakeAnswers: merged,
            jurisdiction: complianceBlueprint.jurisdiction,
        });
        const { error: intakeErr } = intakeRow
            ? await supabase.from('compliance_artifacts').update(intakePayload).eq('id', intakeRow.id)
            : await supabase.from('compliance_artifacts').insert(intakePayload);
        if (intakeErr) {
            setStep06Error(intakeErr.message);
            setCompletingStep06(false);
            return;
        }
        handleIntakePromoted(merged);
        const step = clientProfile.onboarding_step ?? 0;
        if (step !== 5) {
            setCompletingStep06(false);
            return;
        }
        const { error } = await supabase
            .from('clients')
            .update({ onboarding_step: 6, updated_at: new Date().toISOString() })
            .eq('id', session.user.id);
        if (error) {
            setStep06Error(error.message);
        } else {
            setClientProfile((prev) => ({ ...prev, onboarding_step: 6 }));
        }
        setCompletingStep06(false);
    };

    const handleRollbackStep = async (clientId, currentStep) => {
        if (currentStep <= 0 || !supabase) return;
        const { error } = await supabase
            .from('clients')
            .update({ onboarding_step: currentStep - 1, updated_at: new Date().toISOString() })
            .eq('id', clientId);
        if (!error) {
            setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, onboarding_step: currentStep - 1 } : c));
            if (selectedClient?.id === clientId) setSelectedClient(prev => ({ ...prev, onboarding_step: currentStep - 1 }));
        }
    };

    const handleLifecycleChange = async (clientId, newLifecycle) => {
        if (!supabase) return;
        setUpdatingLifecycleId(clientId);
        const { error } = await supabase
            .from('clients')
            .update({ lifecycle: newLifecycle, updated_at: new Date().toISOString() })
            .eq('id', clientId);
        if (!error) {
            setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, lifecycle: newLifecycle } : c));
            if (selectedClient?.id === clientId) setSelectedClient(prev => ({ ...prev, lifecycle: newLifecycle }));
            if (newLifecycle === 'active') {
                await supabase.rpc('seed_obligations_for_client', { p_client_id: clientId });
                if (selectedClient?.id === clientId) await refreshAdminClientObligations(clientId);
                refreshOverdueQueue();
            }
        }
        setUpdatingLifecycleId(null);
    };

    const handleVaultStepToggle = (catId, trackIdx, stepIdx) => {
        const key = `${catId}_${trackIdx}_${stepIdx}`;
        const updated = { ...vaultStepsDone, [key]: !vaultStepsDone[key] };
        if (!updated[key]) delete updated[key];
        setVaultStepsDone(updated);
        try { localStorage.setItem(`oq_vsteps_${session.user.id}`, JSON.stringify(updated)); } catch {}
        supabase.from('clients').update({ vault_steps_done: updated }).eq('id', session.user.id).then(() => {});
    };

    const handleVaultReminder = async (catId, trackIdx, stepIdx, stepText, days) => {
        if (!supabase || !session) return;
        setVaultReminderSending(true);
        const sendAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        // Store as a message so admin can see and trigger it
        await supabase.from('messages').insert({
            client_id: session.user.id,
            body: `[REMINDER SET] In ${days} day${days > 1 ? 's' : ''} (${new Date(sendAt).toLocaleDateString()}): "${stepText}"`,
            is_admin_message: false,
            is_ai_generated: false,
            seen: true,
            scheduled_at: sendAt,
            metadata: { type: 'reminder', catId, trackIdx, stepIdx },
        });
        const remKey = `${catId}_${trackIdx}_${stepIdx}`;
        const updated = { ...vaultReminderSent, [remKey]: { days, sendAt } };
        setVaultReminderSent(updated);
        try { localStorage.setItem(`oq_vrem_${session.user.id}`, JSON.stringify(updated)); } catch {}
        supabase.from('clients').update({ vault_reminders_sent: updated }).eq('id', session.user.id).then(() => {});
        setVaultReminderStep(null);
        setVaultReminderSending(false);
    };

    const handleSetPlan = async (clientId, plan) => {
        if (!supabase) return;
        await supabase.from('clients').update({ plan, updated_at: new Date().toISOString() }).eq('id', clientId);
        setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, plan } : c));
    };

    const handleDeleteUser = async (clientId) => {
        if (!supabase || !session) return;
        setDeletingId(clientId);
        setDeleteError('');
        try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            const res = await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/admin-delete-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authSession.access_token}`,
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA',
                },
                body: JSON.stringify({ user_id: clientId }),
            });
            const json = await res.json();
            if (json.ok) {
                setAllClients(prev => prev.filter(c => c.id !== clientId));
                if (selectedClient?.id === clientId) setSelectedClient(null);
            } else {
                setDeleteError(json.error || 'Delete failed');
            }
        } catch {
            setDeleteError('Could not reach delete service');
        }
        setArmedDeleteId(null);
        setDeletingId(null);
    };

    const stepLabels = ['Account Created','Entity Formation','Tax Registration','Business Banking','IP & Contract Templates','Privacy & Compliance','Landing Page Deployed','Repository Provision','CRM Connection','Analytics Live','First AI Agent Deployed'];

    if (session && clientProfile?.is_admin) {
        return (
            <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] min-h-screen relative z-10">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-wrap justify-between items-start gap-4 mb-12">
                        <div>
                            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter">Admin Console</h1>
                            <p className="text-sm text-gray-500 uppercase tracking-widest mt-1">{session.user.email}</p>
                        </div>
                        <span className="text-xs uppercase tracking-widest text-green-400 border border-green-400/20 px-3 py-1.5 rounded-full bg-green-400/5 self-center">
                            {allClients.filter(c => !c.is_admin).length} {allClients.filter(c => !c.is_admin).length === 1 ? 'Client' : 'Clients'}
                        </span>
                    </div>

                    {deleteError && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-base text-red-200">
                            {deleteError}
                        </div>
                    )}

                    {/* Phase A: Action queue: clients waiting on admin attention */}
                    {(() => {
                        const nonAdmin = allClients.filter(c => !c.is_admin);
                        const unread = nonAdmin.filter(c => c.last_message_at > c.admin_last_read_at);
                        const stale = nonAdmin.filter(c => {
                            const step = c.onboarding_step ?? 0;
                            if (step >= 7 || step === 0) return false;
                            const updated = c.updated_at ? new Date(c.updated_at) : new Date(c.created_at);
                            const ageDays = (Date.now() - updated.getTime()) / 86400000;
                            return ageDays > 7;
                        });
                        const overdueClients = [...new Set((overdueQueue || []).map((o) => o.client_id))];
                        const total = unread.length + stale.length + overdueClients.length;
                        if (total === 0 || adminLoading) return null;
                        return (
                            <div className="mb-6 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-5 backdrop-blur-xl">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center">
                                            <i className="ph ph-bell text-purple-300 text-base"></i>
                                        </div>
                                        <div>
                                            <h3 className="text-sm uppercase tracking-widest text-purple-200">Needs your attention</h3>
                                            <p className="text-base text-gray-400 mt-0.5">{total} item{total !== 1 ? 's' : ''} across {Math.max(unread.length, stale.length)} client{nonAdmin.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {unread.length > 0 && (
                                        <div className="bg-black/30 rounded-xl p-3">
                                            <p className="text-sm uppercase tracking-widest text-blue-300 mb-2">Unread messages · {unread.length}</p>
                                            <div className="space-y-1">
                                                {unread.slice(0, 3).map(c => (
                                                    <button key={c.id} onClick={() => openClientDetail(c)} className="block w-full text-left text-base text-gray-300 hover:text-white transition-colors">→ {c.company_name}</button>
                                                ))}
                                                {unread.length > 3 && <p className="text-sm text-gray-600">+ {unread.length - 3} more</p>}
                                            </div>
                                        </div>
                                    )}
                                    {stale.length > 0 && (
                                        <div className="bg-black/30 rounded-xl p-3">
                                            <p className="text-sm uppercase tracking-widest text-yellow-300 mb-2">Stale &gt; 7 days · {stale.length}</p>
                                            <div className="space-y-1">
                                                {stale.slice(0, 3).map(c => (
                                                    <button key={c.id} onClick={() => openClientDetail(c)} className="block w-full text-left text-base text-gray-300 hover:text-white transition-colors">→ {c.company_name} <span className="text-gray-600">· step {c.onboarding_step}</span></button>
                                                ))}
                                                {stale.length > 3 && <p className="text-sm text-gray-600">+ {stale.length - 3} more</p>}
                                            </div>
                                        </div>
                                    )}
                                    {overdueClients.length > 0 && (
                                        <div className="bg-black/30 rounded-xl p-3 md:col-span-2">
                                            <p className="text-sm uppercase tracking-widest text-red-300 mb-2">Overdue obligations · {overdueClients.length} client{overdueClients.length !== 1 ? 's' : ''}</p>
                                            <div className="space-y-1">
                                                {overdueClients.slice(0, 5).map((clientId) => {
                                                    const c = nonAdmin.find((x) => x.id === clientId);
                                                    const items = overdueQueue.filter((o) => o.client_id === clientId);
                                                    const top = items[0];
                                                    return (
                                                        <button key={clientId} onClick={() => c && openClientDetail(c)} className="block w-full text-left text-base text-gray-300 hover:text-white transition-colors">
                                                            → {c?.company_name || top?.company_name || 'Client'}
                                                            <span className="text-gray-600"> · {items.length} due · {top?.title}</span>
                                                        </button>
                                                    );
                                                })}
                                                {overdueClients.length > 5 && <p className="text-sm text-gray-600">+ {overdueClients.length - 5} more</p>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Phase A: Filter bar */}
                    {!adminLoading && (
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                            <div className="flex-1 min-w-[200px] relative">
                                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-base"></i>
                                <input
                                    type="text"
                                    value={adminSearch}
                                    onChange={e => setAdminSearch(e.target.value)}
                                    placeholder="Search company, founder, email…"
                                    className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-base text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all"
                                />
                            </div>
                            <select value={adminPlanFilter} onChange={e => setAdminPlanFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-base text-gray-300 focus:outline-none focus:border-purple-500/50">
                                <option value="all">All plans</option>
                                <option value="starter">Starter</option>
                                <option value="growth">Growth</option>
                                <option value="enterprise">Enterprise</option>
                                <option value="past_due">Past Due</option>
                            </select>
                            <select value={adminLifecycleFilter} onChange={e => setAdminLifecycleFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-base text-gray-300 focus:outline-none focus:border-purple-500/50">
                                <option value="all">All lifecycles</option>
                                <option value="onboarding">Onboarding</option>
                                <option value="active">Active</option>
                                <option value="paused">Paused</option>
                                <option value="churned">Churned</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                    )}

                    {adminLoading ? (
                        <div className="space-y-3">
                            {[1,2,3].map(i => <div key={i} className="w-full h-16 bg-white/5 rounded-xl animate-pulse" />)}
                        </div>
                    ) : (<div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
                            {/* Desktop header, hidden on mobile */}
                            <div className="hidden md:grid md:grid-cols-[minmax(180px,2fr)_minmax(120px,1.2fr)_90px_100px_110px_60px_minmax(140px,1.5fr)_90px_90px_80px] gap-0 px-6 py-3 border-b border-white/5">
                                {['Company','Founder','Stage','Plan','Lifecycle','Credits','Progress','Joined','',''].map((h, i) => (
                                    <span key={i} className="text-xs uppercase tracking-widest text-gray-500">{h}</span>
                                ))}
                            </div>
                            {(() => {
                                const q = adminSearch.trim().toLowerCase();
                                const filtered = allClients.filter(c => !c.is_admin).filter(c => {
                                    if (q && !((c.company_name || '').toLowerCase().includes(q) || (c.founder_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))) return false;
                                    if (adminPlanFilter !== 'all' && (c.plan ?? 'starter') !== adminPlanFilter) return false;
                                    if (adminLifecycleFilter !== 'all' && (c.lifecycle ?? 'onboarding') !== adminLifecycleFilter) return false;
                                    return true;
                                });
                                if (filtered.length === 0) {
                                    return <div className="px-6 py-12 text-center text-gray-600 text-base">{allClients.filter(c => !c.is_admin).length === 0 ? 'No clients yet.' : 'No clients match these filters.'}</div>;
                                }
                                return filtered.map((client, i) => {
                                    const step = client.onboarding_step ?? 0;
                                    const pct = Math.round((step / 11) * 100);
                                    const joined = new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                    const isComplete = step >= 11;
                                    const isAdvancing = advancingId === client.id;
                                    const hasUnread = client.last_message_at > client.admin_last_read_at;
                                    const p = client.plan ?? 'starter';
                                    const planColor = p === 'growth' ? 'text-green-300 border-green-500/30 bg-green-500/10' : p === 'enterprise' ? 'text-purple-200 border-purple-500/30 bg-purple-500/10' : p === 'past_due' ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-gray-500 border-white/10 bg-white/5';
                                    const lc = client.lifecycle ?? 'onboarding';
                                    const lcColor = lc === 'active' ? 'text-green-300 bg-green-400/10' : lc === 'paused' ? 'text-yellow-300 bg-yellow-400/10' : lc === 'churned' ? 'text-red-300 bg-red-400/10' : lc === 'archived' ? 'text-gray-500 bg-white/5' : 'text-blue-300 bg-blue-400/10';
                                    const planSelect = (
                                        <select
                                            value={p}
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => { e.stopPropagation(); handleSetPlan(client.id, e.target.value); }}
                                            className={`text-xs uppercase tracking-widest px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none appearance-none whitespace-nowrap w-full max-w-[96px] ${planColor}`}
                                            style={{colorScheme:'dark'}}
                                        >
                                            <option value="starter">Free</option>
                                            <option value="growth">Growth</option>
                                            <option value="enterprise">Enterprise</option>
                                            <option value="past_due">Past Due</option>
                                        </select>
                                    );
                                    const advanceBtn = (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAdvanceStep(client.id, step); }}
                                            disabled={isComplete || isAdvancing}
                                            className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-lg border transition-all disabled:opacity-20 disabled:cursor-not-allowed border-purple-500/30 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400/50"
                                        >{isAdvancing ? '…' : isComplete ? '✓' : 'Advance'}</button>
                                    );
                                    const deleteBtn = armedDeleteId === client.id ? (
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(client.id); }} disabled={deletingId === client.id}
                                            className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-lg border border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-all disabled:opacity-40">
                                            {deletingId === client.id ? '…' : 'Confirm'}
                                        </button>
                                    ) : (
                                        <button onClick={(e) => { e.stopPropagation(); setArmedDeleteId(client.id); setDeleteError(''); }}
                                            className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-lg border border-white/10 text-gray-500 hover:border-red-500/40 hover:text-red-300 transition-all">
                                            Delete
                                        </button>
                                    );

                                    return (
                                        <div key={client.id} className={`${i % 2 === 0 ? '' : 'bg-white/[0.02]'} hover:bg-white/5 transition-colors ${selectedClient?.id === client.id ? 'bg-purple-500/5 border-l-2 border-purple-500/50' : ''}`}>
                                            {/* Desktop row */}
                                            <div onClick={() => openClientDetail(client)} className="hidden md:grid md:grid-cols-[minmax(180px,2fr)_minmax(120px,1.2fr)_90px_100px_110px_60px_minmax(140px,1.5fr)_90px_90px_80px] gap-0 px-6 py-3 items-center cursor-pointer">
                                                <div className="flex items-center gap-2 min-w-0 pr-3">
                                                    {hasUnread && <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse flex-shrink-0"></div>}
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">{client.company_name}</p>
                                                        <p className="text-xs text-gray-500 truncate">{client.email}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs text-gray-300 truncate pr-2">{client.founder_name}</span>
                                                <span className="text-xs uppercase tracking-widest text-purple-300 border border-purple-400/20 px-2 py-0.5 rounded-full whitespace-nowrap">{client.funding_stage || 'n/a'}</span>
                                                {planSelect}
                                                <span className={`text-xs uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap ${lcColor}`}>{lc}</span>
                                                <span className="text-xs text-gray-400">{client.daily_ai_credits}</span>
                                                <div className="pr-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs text-gray-500 truncate pr-1">{isComplete ? 'Done' : stepLabels[step]}</span>
                                                        <span className="text-xs text-gray-600 flex-shrink-0">{pct}%</span>
                                                    </div>
                                                    <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                                <span className="text-xs text-gray-500 whitespace-nowrap">{joined}</span>
                                                <div className="flex items-center">{advanceBtn}</div>
                                                <div className="flex items-center pl-2">{deleteBtn}</div>
                                            </div>

                                            {/* Mobile card */}
                                            <div onClick={() => openClientDetail(client)} className="md:hidden px-4 py-4 cursor-pointer">
                                                <div className="flex items-start justify-between gap-3 mb-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            {hasUnread && <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse flex-shrink-0"></div>}
                                                            <p className="text-sm font-semibold text-white truncate">{client.company_name}</p>
                                                        </div>
                                                        <p className="text-xs text-gray-500 truncate mt-0.5">{client.founder_name} · {client.email}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                                        {planSelect}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    <span className="text-xs uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full">{client.funding_stage || 'n/a'}</span>
                                                    <span className={`text-xs uppercase tracking-widest px-2 py-1 rounded-full ${lcColor}`}>{lc}</span>
                                                    <span className="text-xs text-gray-500">{client.daily_ai_credits} credits</span>
                                                    <span className="text-xs text-gray-500">{joined}</span>
                                                </div>
                                                <div className="mb-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs text-gray-500">{isComplete ? 'Complete' : stepLabels[step]}</span>
                                                        <span className="text-xs text-gray-500">{pct}%</span>
                                                    </div>
                                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                                    {advanceBtn}
                                                    {deleteBtn}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    )}

                    {/* Client detail panel */}
                    {selectedClient && (
                        <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden animate-[fadeIn_0.3s_ease-out]">
                            {/* Detail header */}
                            <div className="px-6 py-4 bg-white/[0.03] border-b border-white/5 flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="flex items-center gap-3 mr-auto min-w-0">
                                    <div className="min-w-0">
                                        <p className="text-base font-semibold text-white truncate">{selectedClient.company_name || selectedClient.founder_name}</p>
                                        <p className="text-xs text-gray-500 truncate">{selectedClient.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${selectedClient.share_ai_data ? 'bg-green-400' : 'bg-gray-600'}`}></div>
                                        <span className={`text-xs uppercase tracking-widest ${selectedClient.share_ai_data ? 'text-green-400' : 'text-gray-500'}`}>
                                            {selectedClient.share_ai_data ? 'AI Shared' : 'AI Private'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-600 border border-white/10 rounded px-2 py-0.5">{selectedClient.daily_ai_credits} credits</span>
                                    <button onClick={handleBoostCredits} className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs font-bold uppercase tracking-widest text-blue-300 hover:bg-blue-500/20 transition-all">
                                        Boost
                                    </button>
                                    <button onClick={() => setSelectedClient(null)} className="text-gray-500 hover:text-white transition-colors ml-1">
                                        <i className="ph ph-x text-lg"></i>
                                    </button>
                                </div>
                            </div>
                            {/* Detail data grid */}
                            <div className="px-6 py-4 bg-white/[0.03] border-b border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-gray-500">Founder</p>
                                    <p className="text-sm text-gray-300">{selectedClient.founder_name}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-gray-500">Jurisdiction</p>
                                    <p className="text-sm text-gray-300">{selectedClient.jurisdiction || selectedClient.country || 'Not set'}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-gray-500">Entity Type</p>
                                    <p className="text-sm text-purple-300">{selectedClient.entity_type || 'Not set'}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-gray-500">Funding Stage</p>
                                    <p className="text-sm text-purple-300">{selectedClient.funding_stage || 'Not set'}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <p className="text-xs uppercase tracking-widest text-gray-500">Business Intent</p>
                                    <p className="text-sm text-gray-300 leading-relaxed truncate" title={selectedClient.business_intent}>{selectedClient.business_intent || 'No intent provided'}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <p className="text-xs uppercase tracking-widest text-gray-500">Target Market</p>
                                    <p className="text-sm text-gray-300">{selectedClient.sells_to || 'Not provided'}</p>
                                </div>
                            </div>

                            {detailLoading ? (
                                <div className="p-6 space-y-3">
                                    {[1,2].map(i => <div key={i} className="w-full h-10 bg-white/5 rounded animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/5">
                                    {/* Internal Notes */}
                                    <div className="p-6 flex flex-col">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-sm uppercase tracking-widest text-gray-500">Internal Notes</h4>
                                            {adminInternalNotes !== selectedClient.internal_notes && (
                                                <button onClick={handleUpdateInternalNotes} disabled={savingNotes} className="text-sm uppercase tracking-widest text-blue-400 hover:text-blue-300">
                                                    {savingNotes ? 'Saving…' : 'Save'}
                                                </button>
                                            )}
                                        </div>
                                        <textarea
                                            value={adminInternalNotes}
                                            onChange={e => setAdminInternalNotes(e.target.value)}
                                            placeholder="Private admin notes (not visible to client)…"
                                            className="flex-1 min-h-[120px] bg-black/20 border border-white/5 rounded-xl p-4 text-base text-gray-400 focus:outline-none focus:border-white/10 transition-all resize-none leading-relaxed"
                                        />
                                    </div>

                                    {/* Documents */}
                                    <div className="p-6 overflow-hidden">
                                        <div className="flex flex-col gap-2 mb-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm uppercase tracking-widest text-gray-500">Documents</h4>
                                                <label className="cursor-pointer text-xs uppercase tracking-widest text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-lg hover:bg-purple-500/10 transition-all flex-shrink-0">
                                                    {uploadingDoc ? '…' : '+ Upload'}
                                                    <input type="file" className="hidden" onChange={handleAdminUpload} disabled={uploadingDoc} />
                                                </label>
                                            </div>
                                            <select
                                                value={deliverableStep}
                                                onChange={e => setDeliverableStep(e.target.value)}
                                                className="w-full bg-black/60 border border-white/20 rounded-lg px-2 py-1.5 text-xs uppercase tracking-widest text-gray-200 focus:outline-none focus:border-purple-500/50 cursor-pointer"
                                                style={{colorScheme:'dark'}}
                                            >
                                                <option value="">General</option>
                                                {stepLabels.map((label, idx) => (
                                                    <option key={idx} value={idx}>Step {idx + 1}: {label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {adminUploadError && (
                                            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
                                                <i className="ph ph-warning-circle text-base flex-shrink-0"></i>
                                                <span className="flex-1">{adminUploadError}</span>
                                                <button type="button" onClick={() => setAdminUploadError('')} className="text-red-400/70 hover:text-red-300 transition-colors">
                                                    <i className="ph ph-x text-base"></i>
                                                </button>
                                            </div>
                                        )}
                                        {clientDocs.length === 0 ? (
                                            <p className="text-base text-gray-600 italic">No documents yet.</p>
                                        ) : (
                                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                {clientDocs.map((doc, i) => (
                                                    <div key={i} onClick={() => getSignedUrl(doc.path)} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-all group">
                                                        <i className="ph ph-file text-gray-400 group-hover:text-blue-400 transition-colors flex-shrink-0"></i>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-base text-gray-300 truncate">{doc.name}</p>
                                                            {doc.step_index !== null && (
                                                                <p className="text-sm text-blue-400/60 uppercase tracking-widest mt-0.5">Deliverable: {stepLabels[doc.step_index]}</p>
                                                            )}
                                                        </div>
                                                        <i className="ph ph-download-simple text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0"></i>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Messages */}
                                    <div className="p-6 flex flex-col min-h-0">
                                        {/* Tab switcher */}
                                        <div className="flex gap-1 border-b border-white/5 mb-4 pb-px">
                                            {[
                                                { id: 'team', label: 'Team', count: clientMessages.filter(m => msgThread(m) === 'team').length },
                                                { id: 'ai', label: 'AI', count: clientMessages.filter(m => msgThread(m) === 'assistant' && m.share_with_admin !== false).length },
                                            ].map(t => (
                                                <button key={t.id} type="button" onClick={() => setAdminMsgTab(t.id)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-widest transition-all ${adminMsgTab === t.id ? 'text-purple-200 border-b-2 border-purple-400 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}>
                                                    {t.label}
                                                    {t.count > 0 && <span className="text-xs text-gray-600">{t.count}</span>}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="space-y-3 max-h-40 overflow-y-auto mb-4 pr-1 shrink-0">
                                            {(() => {
                                                const msgs = adminMsgTab === 'team'
                                                    ? clientMessages.filter(m => msgThread(m) === 'team')
                                                    : clientMessages.filter(m => msgThread(m) === 'assistant' && m.share_with_admin !== false);
                                                if (msgs.length === 0) return <p className="text-sm text-gray-600 italic">{adminMsgTab === 'team' ? 'No team messages yet.' : 'No AI messages yet.'}</p>;
                                                return msgs.map((msg, i) => (
                                                    <div key={i} className={`flex ${msg.is_admin_message ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${msg.is_admin_message ? 'bg-purple-500/20 text-purple-100' : 'bg-white/5 text-gray-300'}`}>
                                                            {msg.body}
                                                            {msg.scheduled_at && !msg.sent_at && <span className="block text-xs text-blue-400/60 mt-1">Scheduled · {new Date(msg.scheduled_at).toLocaleDateString()}</span>}
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                        {adminMsgTab === 'team' && <>
                                            <div className="flex flex-wrap items-center gap-2 mb-3" onClick={e => e.stopPropagation()}>
                                                <button type="button" data-admin-msg-opt="schedule" onClick={() => setMsgScheduled(v => !v)}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs uppercase tracking-widest transition-all ${msgScheduled ? 'border-blue-400/50 bg-blue-500/15 text-blue-200' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}>
                                                    <i className={`ph ${msgScheduled ? 'ph-calendar-check' : 'ph-calendar'} text-sm`}></i>
                                                    Schedule
                                                </button>
                                                <button type="button" data-admin-msg-opt="email" onClick={() => setMsgSendEmail(v => !v)}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs uppercase tracking-widest transition-all ${msgSendEmail ? 'border-purple-400/50 bg-purple-500/15 text-purple-200' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}>
                                                    <i className={`ph ${msgSendEmail ? 'ph-envelope-simple-open' : 'ph-envelope-simple'} text-sm`}></i>
                                                    Also email
                                                </button>
                                            </div>
                                            {msgScheduled && (
                                                <input type="datetime-local" value={msgScheduleAt} onChange={e => setMsgScheduleAt(e.target.value)}
                                                    className="w-full mb-3 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                                            )}
                                            {msgSendEmail && (
                                                <input type="text" value={msgEmailSubject} onChange={e => setMsgEmailSubject(e.target.value)}
                                                    placeholder="Email subject (optional)…"
                                                    className="w-full mb-3 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                                            )}
                                            <form onSubmit={handleAdminMessage} className="flex gap-2 mt-auto">
                                                <input type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)}
                                                    placeholder="Send a note…"
                                                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all" />
                                                <button type="submit" disabled={sendingMessage || !messageInput.trim()} className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-xs font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                                    {sendingMessage ? '…' : msgScheduled ? 'Queue' : 'Send'}
                                                </button>
                                            </form>
                                        </>}
                                    </div>
                                </div>
                            )}

                            {/* Phase A: Lifecycle + onboarding step controls */}
                            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm uppercase tracking-widest text-gray-500 mb-2">Lifecycle</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['onboarding','active','paused','churned','archived'].map(lc => {
                                            const active = (selectedClient.lifecycle ?? 'onboarding') === lc;
                                            return (
                                                <button
                                                    key={lc}
                                                    onClick={() => handleLifecycleChange(selectedClient.id, lc)}
                                                    disabled={updatingLifecycleId === selectedClient.id}
                                                    className={`text-sm uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all disabled:opacity-40 ${active ? 'bg-purple-500/20 border-purple-500/40 text-purple-200' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}
                                                >
                                                    {lc}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm uppercase tracking-widest text-gray-500 mb-2">Onboarding Step</p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleRollbackStep(selectedClient.id, selectedClient.onboarding_step ?? 0)}
                                            disabled={(selectedClient.onboarding_step ?? 0) <= 0}
                                            className="text-sm uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:border-yellow-500/40 hover:text-yellow-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                            title="Roll back one step (e.g. if a filing was rejected)"
                                        >
                                            ← Rollback
                                        </button>
                                        <span className="text-base text-gray-400">Step {selectedClient.onboarding_step ?? 0} of 11 · {stepLabels[selectedClient.onboarding_step ?? 0] || 'Complete'}</span>
                                    </div>
                                    {advanceStepError && (
                                        <p className="text-xs text-red-400 mt-2">{advanceStepError}</p>
                                    )}
                                </div>
                            </div>

                            {(selectedClient.onboarding_step ?? 0) >= 5 && (<div className="px-6 py-4 border-t border-white/5">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm uppercase tracking-widest text-gray-500">Step 06, Compliance Artifacts</p>
                                        <span className="text-xs uppercase tracking-widest text-purple-400/60 border border-purple-500/20 px-2 py-0.5 rounded-full">{clientComplianceArtifacts.length} rows</span>
                                    </div>
                                    {clientComplianceArtifacts.length === 0 ? (
                                        <p className="text-sm text-gray-600 italic">No compliance artifacts yet.</p>) : (
                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                            {clientComplianceArtifacts.map((a) => (
                                                <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-white/5 rounded-lg">
                                                    <i className="ph ph-shield-check text-gray-500 flex-shrink-0"></i>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-gray-300 truncate">{a.label}</p>
                                                        <p className="text-xs text-gray-600 truncate">{a.kind}{a.hosted_url ? ` · ${a.hosted_url}` : ''}</p>
                                                    </div>
                                                    <span className={`text-xs uppercase tracking-widest border px-2 py-0.5 rounded-full flex-shrink-0 ${a.status === 'active' ? 'text-green-300 bg-green-400/10 border-green-400/20' : a.status === 'draft' ? 'text-yellow-300 bg-yellow-400/10 border-yellow-400/20' : 'text-gray-400 bg-white/5 border-white/10'}`}>{a.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-600 mt-3 italic">Upload deliverables to Step 6 (Privacy & Compliance) via Documents above.</p>
                                </div>
                            )}

                            {/* Ticket #08: Recurring obligations (compliance_obligations). Not Step 06. */}
                            <AdminObligationsPanel
                                client={selectedClient}
                                obligations={adminClientObligations}
                                loading={adminObligationsLoading}
                                onRefresh={async () => {
                                    await refreshAdminClientObligations(selectedClient.id);
                                    refreshOverdueQueue();
                                }}
                                supabase={supabase}
                                session={session}
                            />

                            {/* Status Report */}
                            <div className="px-6 py-5 border-t border-white/5">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                    <div>
                                        <p className="text-sm uppercase tracking-widest text-gray-500">Status Report</p>
                                        <p className="text-xs text-gray-600 mt-0.5">AI-generated brief on this client. Saved per generation.</p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (!selectedClient || statusReportLoading) return;
                                            setStatusReportLoading(true);
                                            try {
                                                const prompt = `You are an operations advisor at Onboardin, a business formation and automation platform. Generate a concise internal status report on the following client to help the admin understand their progress, blockers, and next best actions.\n\nClient: ${selectedClient.company_name || selectedClient.founder_name}\nFounder: ${selectedClient.founder_name}\nEmail: ${selectedClient.email}\nJurisdiction: ${selectedClient.jurisdiction || selectedClient.country || 'Not set'}\nEntity Type: ${selectedClient.entity_type || 'Not set'}\nFunding Stage: ${selectedClient.funding_stage || 'Not set'}\nBusiness Intent: ${selectedClient.business_intent || 'Not provided'}\nTarget Market: ${selectedClient.sells_to || 'Not provided'}\nPlan: ${selectedClient.plan || 'starter'}\nLifecycle: ${selectedClient.lifecycle || 'onboarding'}\nOnboarding Step: ${selectedClient.onboarding_step ?? 0} of 11\nAI Credits Remaining: ${selectedClient.daily_ai_credits}\nInternal Notes: ${selectedClient.internal_notes || 'None'}\n\nWrite a 3-5 sentence report covering: current status, what they have completed, any blockers or gaps, and what the admin should prioritize next. Be direct and specific. No fluff.`;
                                                const res = await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/agent-formation', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
                                                    body: JSON.stringify({ question: prompt, clientId: selectedClient.id, mode: 'admin-report' }),
                                                });
                                                const data = await res.json();
                                                const report = data.answer || data.error || 'No response.';
                                                setStatusReportCache(prev => ({ ...prev, [selectedClient.id]: report }));
                                                await supabase.from('admin_status_reports').insert({
                                                    client_id: selectedClient.id,
                                                    admin_id: session.user.id,
                                                    report,
                                                    created_at: new Date().toISOString(),
                                                });
                                            } catch (e) {
                                                setStatusReport('Failed to generate report. Try again.');
                                            }
                                            setStatusReportLoading(false);
                                        }}
                                        disabled={statusReportLoading}
                                        className="px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/20 transition-all disabled:opacity-40 flex items-center gap-2"
                                    >
                                        {statusReportLoading ? <><span className="animate-spin inline-block w-3 h-3 border border-purple-400/40 border-t-purple-300 rounded-full"></span> Generating…</> : <><i className="ph ph-sparkle"></i> Generate Report</>}
                                    </button>
                                </div>
                                {statusReportCache[selectedClient.id] && (
                                    <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl p-4 text-sm text-gray-300 leading-relaxed animate-[fadeIn_0.3s_ease-out]">
                                        {statusReportCache[selectedClient.id]}
                                    </div>
                                )}
                                {!statusReportCache[selectedClient.id] && !statusReportLoading && (
                                    <p className="text-xs text-gray-600 italic">No report generated yet. Click Generate to create one.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (session) {
        const memberSince = clientProfile?.created_at
            ? new Date(clientProfile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : null;

        return (
            <>
            <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] min-h-screen relative z-10 overflow-x-hidden">
                <div className="max-w-3xl mx-auto space-y-4">
                    <div className="flex justify-between items-center mb-8 min-w-0">
                        <div className="min-w-0 overflow-hidden">
                            {profileLoading ? (
                                <div className="w-48 h-8 bg-white/5 rounded animate-pulse mb-2"></div>
                            ) : (
                                <h1 className="text-2xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter leading-tight break-words">
                                    {clientProfile?.company_name || 'Console'}
                                </h1>
                            )}
                            <p className="text-xs md:text-base text-gray-500 uppercase tracking-widest mt-1 truncate">{session.user.email}</p>
                        </div>
                    </div>

                    {/* Quick setup banner. Shown when jurisdiction/entity not yet set */}
                    {!profileLoading && clientProfile && !clientProfile.jurisdiction && !clientProfile.entity_type && !showJurisdictionSetup && (
                        <div className="mb-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-purple-500/20 rounded-2xl p-5 flex items-center justify-between gap-4 animate-[fadeIn_0.4s_ease-out]">
                            <div className="flex items-center gap-4">
                                <div className="w-9 h-9 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                    <i className="ph ph-rocket-launch text-purple-300 text-lg"></i>
                                </div>
                                <div>
                                    <p className="text-base font-bold text-white">Finish setting up your account</p>
                                    <p className="text-sm text-gray-400 mt-0.5">Add your location, entity type, and domain to unlock your full onboarding plan.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowJurisdictionSetup(true); switchTab('vault'); }}
                                className="flex-shrink-0 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-sm font-bold uppercase tracking-widest text-purple-200 hover:bg-purple-500/30 transition-all"
                            >
                                Quick Setup →
                            </button>
                        </div>
                    )}

                    {/* Alert strip. Past_due or other urgent states */}
                    {!profileLoading && !alertDismissed && clientProfile && canAccessComplianceCalendar(clientProfile).access && (() => {
                        const enriched = clientObligations.map(enrichObligation);
                        const overdueItems = enriched.filter((o) => o.effectiveStatus === 'overdue');
                        if (overdueItems.length === 0) return null;
                        const top = overdueItems[0];
                        return (
                            <div className="flex items-center gap-3 bg-red-500/6 border border-red-500/20 rounded-xl px-4 py-3 animate-[fadeIn_0.3s_ease-out] mb-4">
                                <i className="ph ph-warning-circle text-red-400 text-xl flex-shrink-0"></i>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-red-300">{top.title} overdue</p>
                                    <p className="text-xs text-gray-500 mt-0.5 truncate">{top.penalty_note || top.description || 'Action required to stay in good standing.'}</p>
                                </div>
                                <button onClick={() => switchTab('compliance')} className="flex-shrink-0 px-3 py-1.5 bg-red-500/15 border border-red-500/30 rounded-lg text-xs font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/25 transition-all">View</button>
                                <button onClick={() => setAlertDismissed(true)} className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors ml-1"><i className="ph ph-x text-sm"></i></button>
                            </div>
                        );
                    })()}

                    {!profileLoading && !alertDismissed && clientProfile && (() => {
                        const plan = clientProfile.plan ?? 'starter';
                        if (plan === 'past_due') return (
                            <div className="flex items-center gap-3 bg-red-500/6 border border-red-500/20 rounded-xl px-4 py-3 animate-[fadeIn_0.3s_ease-out]">
                                <i className="ph ph-warning-circle text-red-400 text-xl flex-shrink-0"></i>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-red-300">Payment failed</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Your last payment didn't go through. Update your payment method to restore full access.</p>
                                </div>
                                <button onClick={handleUpgrade} className="flex-shrink-0 px-3 py-1.5 bg-red-500/15 border border-red-500/30 rounded-lg text-xs font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/25 transition-all">Fix now</button>
                                <button onClick={() => setAlertDismissed(true)} className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors ml-1"><i className="ph ph-x text-sm"></i></button>
                            </div>
                        );
                        return null;
                    })()}

                    {/* Tab nav */}
                    {!profileLoading && (
                        <div className="flex gap-1 mb-6 border-b border-white/5 overflow-x-auto pb-px scrollbar-hide" style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
                            {(() => {
                                const complianceBadge = canAccessComplianceCalendar(clientProfile)
                                    ? obligationStats(clientObligations.map(enrichObligation)).overdue
                                    : 0;
                                return [
                                { id: 'overview',  icon: 'ph-squares-four',   label: 'Overview' },
                                { id: 'pipeline',  icon: 'ph-list-checks',    label: 'Pipeline' },
                                { id: 'vault',     icon: 'ph-folder-open',    label: 'Vault' },
                                { id: 'compliance', icon: 'ph-calendar-check', label: 'Compliance', badge: complianceBadge, badgeRed: complianceBadge > 0 },
                                { id: 'messages',  icon: 'ph-chat-text',      label: 'Messages', badge: myMessages.filter(m => m.is_admin_message && !m.seen).length },
                                { id: 'capital',   icon: 'ph-chart-line-up',  label: 'Capital' },
                                { id: 'navigator', icon: 'ph-compass',          label: 'Navigator' },
                            ];
                            })().map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => switchTab(t.id)}
                                    className={`relative flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-xs md:text-sm uppercase tracking-widest whitespace-nowrap transition-all ${dashTab === t.id ? 'text-purple-200 border-b-2 border-purple-400 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <i className={`ph ${t.icon} text-base`}></i>
                                    {t.label}
                                    {t.badge > 0 && <span className={`ml-1 w-4 h-4 rounded-full text-sm flex items-center justify-center text-white font-bold ${t.badgeRed ? 'bg-red-500' : 'bg-blue-500'}`}>{t.badge}</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Overview tab. Profile + progress */}
                    {dashTab === 'overview' && <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4">
                        {/* Client Profile card */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                            <h3 className="text-sm uppercase tracking-widest text-gray-500 mb-4">Client Profile</h3>
                            {profileLoading ? (
                                <div className="space-y-3">
                                    <div className="w-full h-4 bg-white/5 rounded animate-pulse"></div>
                                    <div className="w-3/4 h-4 bg-white/5 rounded animate-pulse"></div>
                                    <div className="w-1/2 h-4 bg-white/5 rounded animate-pulse"></div>
                                </div>
                            ) : profileError || !clientProfile ? (
                                <p className="text-base text-gray-500 italic">Profile data unavailable.</p>
                            ) : (
                                <div className="space-y-3">
                                    {clientProfile.founder_name && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm uppercase tracking-widest text-gray-500">Founder</span>
                                            <span className="text-base text-gray-200">{clientProfile.founder_name}</span>
                                        </div>
                                    )}
                                    {clientProfile.funding_stage && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm uppercase tracking-widest text-gray-500">Stage</span>
                                            <span className="text-sm uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full">{clientProfile.funding_stage}</span>
                                        </div>
                                    )}
                                    {clientProfile.status && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm uppercase tracking-widest text-gray-500">Status</span>
                                            <span className="text-sm uppercase tracking-widest text-blue-300 bg-blue-400/10 px-2 py-1 rounded-full">{clientProfile.status}</span>
                                        </div>
                                    )}
                                    {memberSince && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm uppercase tracking-widest text-gray-500">Member Since</span>
                                            <span className="text-base text-gray-400">{memberSince}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Onboarding Progress. Phased tabs with tier gating */}
                        {(() => {
                            const plan = clientProfile?.plan ?? 'starter';
                            const isPaid = plan === 'growth' || plan === 'enterprise';
                            const phases = [
                                { id: 'foundation', label: 'Foundation' },
                                { id: 'operations', label: 'Operations' },
                                { id: 'infrastructure', label: 'Infrastructure' },
                            ];
                            const tabSteps = onboardingSteps.filter(s => s.phase === activePhaseTab);
                            // index in the full array of the first step in this phase
                            const phaseStartIdx = onboardingSteps.findIndex(s => s.phase === activePhaseTab);
                            return (
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm uppercase tracking-widest text-gray-500">Onboarding Progress</h3>
                                        <span className="text-sm uppercase tracking-widest text-purple-300">{currentStep} / {onboardingSteps.length}</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/5 rounded-full mb-5 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-700"
                                            style={{ width: `${(currentStep / onboardingSteps.length) * 100}%` }}
                                        />
                                    </div>
                                    {/* Phase tabs */}
                                    <div className="flex gap-1 mb-5 border-b border-white/5">
                                        {phases.map(p => {
                                            const active = activePhaseTab === p.id;
                                            const phaseSteps = onboardingSteps.filter(s => s.phase === p.id);
                                            const phaseTier = phaseSteps[0]?.tier || 'starter';
                                            const locked = phaseTier === 'growth' && !isPaid;
                                            return (
                                                <button
                                                    key={p.id}
                                                    onClick={() => setActivePhaseTab(p.id)}
                                                    className={`relative flex items-center gap-1 px-3 py-2 text-xs uppercase tracking-widest whitespace-nowrap transition-all ${active ? 'text-purple-200 border-b-2 border-purple-400 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}
                                                >
                                                    {p.label}
                                                    {locked && <i className="ph ph-lock-simple text-xs text-gray-600"></i>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="space-y-3">
                                        {tabSteps.map((step, localIdx) => {
                                            const i = phaseStartIdx + localIdx;
                                            const done = i < currentStep;
                                            const active = i === currentStep;
                                            const locked = step.tier === 'growth' && !isPaid;
                                            const stepDeliverable = myDocs.find(d => d.step_index === i);
                                            return (
                                                <div key={i} className="flex flex-col gap-1">
                                                    <div className={`flex items-center gap-3 ${locked ? 'opacity-50' : ''}`}>
                                                        {done ? (
                                                            <i className="ph ph-check-circle text-green-400 text-base flex-shrink-0"></i>
                                                        ) : active ? (
                                                            <i className={`ph ${step.icon} text-purple-400 text-base flex-shrink-0`}></i>
                                                        ) : locked ? (
                                                            <i className="ph ph-lock-simple text-gray-700 text-base flex-shrink-0"></i>
                                                        ) : (
                                                            <i className="ph ph-circle text-gray-700 text-base flex-shrink-0"></i>
                                                        )}
                                                        <span className={`text-sm md:text-base min-w-0 ${done ? 'text-gray-200' : active ? 'text-purple-200' : locked ? 'text-gray-600' : 'text-gray-500'}`}>{step.label}</span>
                                                        {active && !locked && <span className="ml-auto flex-shrink-0 text-xs uppercase tracking-widest text-purple-400 border border-purple-400/20 px-2 py-0.5 rounded-full">In Progress</span>}
                                                        {locked && (
                                                            <button onClick={handleUpgrade} className="ml-auto flex-shrink-0 text-xs uppercase tracking-widest text-gray-500 hover:text-purple-300 transition-colors">
                                                                Unlock with Growth →
                                                            </button>
                                                        )}
                                                    </div>
                                                    {stepDeliverable && !locked && (
                                                        <div onClick={() => getSignedUrl(stepDeliverable.path)} className="ml-7 flex items-center gap-2 py-1 px-2 bg-blue-500/10 border border-blue-500/20 rounded-lg cursor-pointer hover:bg-blue-500/20 transition-all group w-fit">
                                                            <i className="ph ph-file-arrow-down text-blue-400 text-sm"></i>
                                                            <span className="text-sm uppercase tracking-widest text-blue-300 group-hover:text-blue-200">Download Deliverable</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-5 italic">
                                        {activePhaseTab === 'foundation' && 'We take you as far as we can without cost. Foundation steps are always on the house.'}
                                        {activePhaseTab === 'operations' && !isPaid && 'Operations covers tax registration, business banking, IP templates, and privacy compliance. Unlock with Growth.'}
                                        {activePhaseTab === 'operations' && isPaid && 'Tax, banking, IP, and privacy. Your specialist will work alongside the AI guide through each.'}
                                        {activePhaseTab === 'infrastructure' && !isPaid && 'Infrastructure covers your landing page, repo, CRM, analytics, and first AI agent. Unlock with Growth.'}
                                        {activePhaseTab === 'infrastructure' && isPaid && 'Your digital infrastructure. Built and configured to your business profile.'}
                                    </p>
                                    {activePhaseTab === 'operations' && currentStep >= 5 && (
                                        <Step06Panel
                                            locked={!isPaid}
                                            onUpgrade={handleUpgrade}
                                            blueprint={complianceBlueprint}
                                            intake={complianceIntake}
                                            setIntake={handleIntakeChange}
                                            onIntakePromoted={handleIntakePromoted}
                                            artifacts={complianceArtifacts}
                                            docs={myDocs}
                                            clientProfile={clientProfile}
                                            supabase={supabase}
                                            session={session}
                                            onRefreshArtifacts={refreshComplianceArtifacts}
                                            onRefreshDocs={() => supabase.from('documents').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false }).then(({ data }) => setMyDocs(data || []))}
                                            onCompleteStep={handleClientCompleteStep06}
                                            completingStep={completingStep06}
                                            stepError={step06Error}
                                            currentStep={currentStep}
                                            draftStatus={draftStatus}
                                        />
                                    )}
                                </div>
                            );
                        })()}
                    </div>}

                    {/* Pipeline tab. Full 11-step onboarding detail */}
                    {dashTab === 'pipeline' && (() => {
                        const plan = clientProfile?.plan ?? 'starter';
                        const isPaid = plan === 'growth' || plan === 'enterprise';
                        const phases = [
                            { id: 'foundation', label: 'Foundation' },
                            { id: 'operations', label: 'Operations' },
                            { id: 'infrastructure', label: 'Infrastructure' },
                        ];
                        return (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm uppercase tracking-widest text-gray-500">Onboarding Pipeline</h3>
                                    <span className="text-sm uppercase tracking-widest text-purple-300">{currentStep} / {onboardingSteps.length}</span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full mb-5 overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-700" style={{ width: `${(currentStep / onboardingSteps.length) * 100}%` }} />
                                </div>
                                <div className="flex gap-1 mb-5 border-b border-white/5">
                                    {phases.map(p => {
                                        const active = activePhaseTab === p.id;
                                        const phaseSteps = onboardingSteps.filter(s => s.phase === p.id);
                                        const locked = phaseSteps[0]?.tier === 'growth' && !isPaid;
                                        return (
                                            <button key={p.id} onClick={() => setActivePhaseTab(p.id)}
                                                className={`relative flex items-center gap-1 px-3 py-2 text-xs uppercase tracking-widest whitespace-nowrap transition-all ${active ? 'text-purple-200 border-b-2 border-purple-400 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}>
                                                {p.label}
                                                {locked && <i className="ph ph-lock-simple text-xs text-gray-600"></i>}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="space-y-3">
                                    {onboardingSteps.filter(s => s.phase === activePhaseTab).map((step, localIdx) => {
                                        const phaseStartIdx = onboardingSteps.findIndex(s => s.phase === activePhaseTab);
                                        const i = phaseStartIdx + localIdx;
                                        const done = i < currentStep;
                                        const active = i === currentStep;
                                        const locked = step.tier === 'growth' && !isPaid;
                                        const stepDeliverable = myDocs.find(d => d.step_index === i);
                                        return (
                                            <div key={i} className="flex flex-col gap-1">
                                                <div className={`flex items-center gap-3 ${locked ? 'opacity-50' : ''}`}>
                                                    {done ? <i className="ph ph-check-circle text-green-400 text-base flex-shrink-0"></i>
                                                        : active ? <i className={`ph ${step.icon} text-purple-400 text-base flex-shrink-0`}></i>
                                                        : locked ? <i className="ph ph-lock-simple text-gray-700 text-base flex-shrink-0"></i>
                                                        : <i className="ph ph-circle text-gray-700 text-base flex-shrink-0"></i>}
                                                    <span className={`text-base ${done ? 'text-gray-200' : active ? 'text-purple-200' : locked ? 'text-gray-600' : 'text-gray-500'}`}>{step.label}</span>
                                                    {active && !locked && <span className="ml-auto text-sm uppercase tracking-widest text-purple-400 border border-purple-400/20 px-2 py-0.5 rounded-full">In Progress</span>}
                                                    {locked && <button onClick={handleUpgrade} className="ml-auto text-sm uppercase tracking-widest text-gray-500 hover:text-purple-300 transition-colors">Unlock with Growth →</button>}
                                                </div>
                                                {stepDeliverable && !locked && (
                                                    <div onClick={() => getSignedUrl(stepDeliverable.path)} className="ml-7 flex items-center gap-2 py-1 px-2 bg-blue-500/10 border border-blue-500/20 rounded-lg cursor-pointer hover:bg-blue-500/20 transition-all group w-fit">
                                                        <i className="ph ph-file-arrow-down text-blue-400 text-sm"></i>
                                                        <span className="text-sm uppercase tracking-widest text-blue-300 group-hover:text-blue-200">Download Deliverable</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {activePhaseTab === 'operations' && currentStep >= 5 && (
                                    <Step06Panel
                                        locked={!isPaid}
                                        onUpgrade={handleUpgrade}
                                        blueprint={complianceBlueprint}
                                        intake={complianceIntake}
                                        setIntake={handleIntakeChange}
                                        onIntakePromoted={handleIntakePromoted}
                                        artifacts={complianceArtifacts}
                                        docs={myDocs}
                                        clientProfile={clientProfile}
                                        supabase={supabase}
                                        session={session}
                                        onRefreshArtifacts={refreshComplianceArtifacts}
                                        onRefreshDocs={() => supabase.from('documents').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false }).then(({ data }) => setMyDocs(data || []))}
                                        onCompleteStep={handleClientCompleteStep06}
                                        completingStep={completingStep06}
                                        stepError={step06Error}
                                        currentStep={currentStep}
                                        draftStatus={draftStatus}
                                    />
                                )}
                            </div>
                        );
                    })()}

                    {/* Formation Assistant. Overview tab only */}
                    {dashTab === 'overview' && <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0">
                                    <svg viewBox="0 0 73 85.4" className="w-7 h-7">
                                        <path d="M36.9 8.7c-44.4.8-44.4 66.8 0 67.6 44.4-.8 44.4-66.8 0-67.6" fill="#b6499b"/>
                                        <path d="M1.3 41c.2 13.9 6.6 23.6 15.5 29.2C-3.3 53.8 3.4 13.9 36.9 13.3c31.9.5 39.5 36.8 22.8 54.3 7-5.8 11.8-14.7 12-26.7C70.9-5.3 2.1-5.3 1.3 41" fill="#1b8dcd"/>
                                        <path d="M36.9 23c-35.4.6-35.4 53.3 0 53.9 35.4-.6 35.4-53.3 0-53.9" fill="#fefefe"/>
                                        <path d="M36.9 33.1c-22.2.4-22.2 33.4 0 33.7 22.2-.4 22.2-33.4 0-33.7" fill="#b6499b"/>
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm uppercase tracking-widest text-gray-500">Assistant</h3>
                                    <p className="text-sm text-gray-600 mt-0.5">Bespoke advice for {clientProfile?.company_name}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1">
                                <span className="text-xs uppercase tracking-widest text-gray-500">{clientProfile?.daily_ai_credits ?? 0} Credits remaining</span>
                                <div className="flex items-center gap-2 cursor-pointer group" onClick={handleTogglePrivacy}>
                                    <span className="text-xs uppercase tracking-widest text-gray-600 group-hover:text-gray-400 transition-colors">{clientProfile?.share_ai_data ? 'AI Data shared' : 'AI Data private'}</span>
                                    <div className={`w-6 h-3 rounded-full relative transition-colors ${clientProfile?.share_ai_data ? 'bg-purple-500/40' : 'bg-white/10'}`}>
                                        <div className={`absolute top-0.5 w-2 h-2 rounded-full transition-all ${clientProfile?.share_ai_data ? 'right-0.5 bg-purple-300' : 'left-0.5 bg-gray-500'}`} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {agentAnswer && (
                            <div className="mb-4 bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 text-base text-gray-300 leading-relaxed animate-[fadeIn_0.4s_ease-out] relative"
                                dangerouslySetInnerHTML={{ __html:
                                    agentAnswer
                                        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                                        .replace(/\*(.+?)\*/g, '<em>$1</em>')
                                        .replace(/^- (.+)/gm, '<li class="ml-4 list-disc">$1</li>')
                                        .replace(/\n/g, '<br/>')
                                }}
                            >
                            </div>
                        )}
                        {agentError && (
                            <p className="mb-3 text-sm uppercase tracking-widest text-red-400">{agentError}</p>
                        )}

                        {(() => {
                            const allQ = blueprint?.starter_questions?.length ? blueprint.starter_questions : [
                                'What entity type should I form?',
                                'What are my first filing steps?',
                                'Do I need a tax ID before opening a bank account?',
                                'What documents do I need to collect first?',
                            ];
                            const unanswered = allQ.filter(q => !answeredQuestions.some(a => a.toLowerCase() === q.toLowerCase()));
                            if (!unanswered.length) return null;
                            return (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {unanswered.map(q => (
                                        <button key={q} type="button"
                                            onClick={() => setAgentQuestion(q)}
                                            className="text-xs uppercase tracking-widest border border-white/10 text-gray-500 px-2.5 py-1.5 rounded-lg hover:border-purple-500/30 hover:text-purple-300 transition-all text-left">
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            );
                        })()}

                        <form onSubmit={handleAgentQuestion} className="flex gap-2">
                            <input
                                type="text"
                                value={agentQuestion}
                                onChange={e => setAgentQuestion(e.target.value)}
                                placeholder="Ask a question..."
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 transition-all"
                                disabled={agentLoading}
                            />
                            <button type="submit" disabled={agentLoading || !agentQuestion.trim()}
                                className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-sm font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                {agentLoading ? '…' : 'Ask'}
                            </button>
                        </form>
                    </div>}

                    {/* Vault tab. Documents */}
                    {dashTab === 'vault' && <>{/* Documents: categorized by entity + jurisdiction */}
                    {(() => {
                        const hasJurisdiction = clientProfile?.jurisdiction || clientProfile?.entity_type;
                        const entityType = clientProfile?.entity_type || 'LLC';
                        const country = clientProfile?.country || 'United States';
                        const jurisdiction = clientProfile?.jurisdiction || '';
                        const baseCategories = getDocCategories(entityType, country, jurisdiction);
                        // Layer in any AI-suggested doc categories the baseline doesn't already cover
                        const baseIds = new Set(baseCategories.map(c => c.id));
                        const aiExtras = (blueprint?.required_documents || [])
                            .filter(d => d.id && !baseIds.has(d.id))
                            .map(d => ({ id: d.id, label: d.label, icon: 'ph-sparkle', desc: d.desc, required: false, suggested: true }));
                        const complianceExtras = ((clientProfile?.onboarding_step ?? 0) >= 5 && complianceBlueprint)
                            ? getComplianceVaultCategories(complianceBlueprint).filter((c) => !baseIds.has(c.id))
                            : [];
                        const categories = [...baseCategories, ...aiExtras, ...complianceExtras];
                        // Group uploaded docs by category tag
                        const docsByCategory = {};
                        myDocs.forEach(doc => {
                            const cat = doc.category || 'other';
                            if (!docsByCategory[cat]) docsByCategory[cat] = [];
                            docsByCategory[cat].push(doc);
                        });
                        const allRequiredFilled = categories.filter(c => c.required).every(c => (docsByCategory[c.id] || []).length > 0);

                        return (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm uppercase tracking-widest text-gray-500">Documents</h3>
                                        {hasJurisdiction && (
                                            <p className="text-sm text-gray-600 mt-0.5">
                                                {entityType} : {jurisdiction || country}
                                                <button onClick={() => setShowJurisdictionSetup(true)} className="ml-2 text-purple-400 hover:text-purple-300 transition-colors">edit</button>
                                            </p>
                                        )}
                                    </div>
                                    {allRequiredFilled && (
                                        <span className="text-sm uppercase tracking-widest text-green-300 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full">Ready</span>
                                    )}
                                </div>

                                {/* Jurisdiction setup prompt */}
                                {!hasJurisdiction && !showJurisdictionSetup && (
                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
                                        <p className="text-base text-gray-300 leading-relaxed">Tell us where you're building and what kind of business. We'll show you exactly what documents you need.</p>
                                        <button onClick={() => setShowJurisdictionSetup(true)} className="text-sm uppercase tracking-widest text-blue-300 border border-blue-500/30 px-3 py-2 rounded-lg hover:bg-blue-500/10 transition-all">Set Up →</button>
                                    </div>
                                )}

                                {/* Inline jurisdiction setup form */}
                                {showJurisdictionSetup && (
                                    <form onSubmit={handleSaveJurisdiction} className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-4 animate-[fadeIn_0.3s_ease-out]">
                                        <div>
                                            <label className="block text-sm uppercase tracking-widest text-gray-500 mb-1">Country / Region</label>
                                            <select value={setupCountry} onChange={e => { setSetupCountry(e.target.value); setSetupJurisdiction(''); }} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                                                {Object.keys(REGIONS).map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm uppercase tracking-widest text-gray-500 mb-1">{setupCountry === 'United States' ? 'State' : setupCountry === 'Canada' ? 'Province' : 'Country'}</label>
                                            <select value={setupJurisdiction} onChange={e => setSetupJurisdiction(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                                                <option value="">Select…</option>
                                                {(REGIONS[setupCountry] || []).map(j => <option key={j} value={j}>{j}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm uppercase tracking-widest text-gray-500 mb-1">What are you building?</label>
                                            <input type="text" value={setupIntent} onChange={e => setSetupIntent(e.target.value)} placeholder="e.g. SaaS platform for HR teams" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm uppercase tracking-widest text-gray-500 mb-1">Who do you sell to?</label>
                                            <select value={setupSellsTo} onChange={e => setSetupSellsTo(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                                                <option value="">Select…</option>
                                                <option value="b2b">Businesses (B2B)</option>
                                                <option value="b2c">Consumers (B2C)</option>
                                                <option value="b2b2c">Both (B2B2C)</option>
                                                <option value="enterprise">Enterprise</option>
                                                <option value="government">Government / Public sector</option>
                                                <option value="nonprofit">Non-profits / NGOs</option>
                                            </select>
                                        </div>
                                        {(() => {
                                            const rec = recommendEntity(clientProfile?.funding_stage, setupIntent, setupSellsTo);
                                            return (
                                                <div>
                                                    <label className="block text-sm uppercase tracking-widest text-gray-500 mb-1">Entity Type</label>
                                                    {!setupEntityOverride ? (
                                                        <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                                                            <span className="text-base text-white">{rec.entity} <span className="text-sm text-purple-400 ml-1">recommended</span></span>
                                                            <button type="button" onClick={() => setSetupEntityOverride(true)} className="text-sm uppercase tracking-widest text-gray-500 hover:text-purple-300 transition-colors">Change</button>
                                                        </div>
                                                    ) : (
                                                        <select value={setupEntity} onChange={e => setSetupEntity(e.target.value)} required className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                                                            <option value="">Select…</option>
                                                            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        <div className="flex gap-2 pt-1">
                                            <button type="button" onClick={() => setShowJurisdictionSetup(false)} className="py-2 px-3 border border-white/10 rounded-lg text-sm uppercase tracking-widest text-gray-500 hover:text-white transition-all">Cancel</button>
                                            <button type="submit" disabled={savingSetup} className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-40">{savingSetup ? 'Saving…' : 'Save'}</button>
                                        </div>
                                    </form>
                                )}

                                {vaultUploadError && (
                                    <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
                                        <i className="ph ph-warning-circle text-base flex-shrink-0"></i>
                                        <span className="flex-1">{vaultUploadError}</span>
                                        <button type="button" onClick={() => setVaultUploadError('')} className="text-red-400/70 hover:text-red-300 transition-colors">
                                            <i className="ph ph-x text-base"></i>
                                        </button>
                                    </div>
                                )}

                                {/* Document category columns */}
                                {hasJurisdiction && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {categories.map(cat => {
                                            const catDocs = docsByCategory[cat.id] || [];
                                            const hasDoc = catDocs.length > 0;
                                            const isExpanded = expandedVaultCard === cat.id;
                                            const canExpand = !hasDoc && (cat.guidance || cat.process);
                                            const uploadInput = (
                                                <VaultUploadButton
                                                    disabled={clientUploading}
                                                    onFile={async (file) => {
                                                        if (!supabase) return;
                                                        setVaultUploadError('');
                                                        setClientUploading(true);
                                                        const path = `${session.user.id}/${cat.id}/${Date.now()}-${file.name}`;
                                                        const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file);
                                                        if (uploadError) {
                                                            setVaultUploadError(`Upload failed: ${uploadError.message}`);
                                                        } else {
                                                            const { error: dbError } = await supabase.from('documents').insert({ client_id: session.user.id, name: file.name, path, size: file.size, uploaded_by: session.user.id, category: cat.id });
                                                            if (dbError) {
                                                                setVaultUploadError(`Saved the file, but could not record it: ${dbError.message}`);
                                                            } else {
                                                                setMyDocs(prev => [{ name: file.name, path, size: file.size, category: cat.id, created_at: new Date().toISOString() }, ...prev]);
                                                                setExpandedVaultCard(null);
                                                            }
                                                        }
                                                        setClientUploading(false);
                                                    }}
                                                />
                                            );
                                            return (<div
                                                    key={cat.id}
                                                    className={`border rounded-xl p-4 space-y-3 transition-all ${hasDoc ? 'border-green-400/20 bg-green-400/5' : isExpanded ? 'border-purple-400/30 bg-purple-500/8' : cat.required ? 'border-purple-500/20 bg-purple-500/5' : 'border-white/5 bg-white/[0.02]'}`}
                                                >
                                                    {/* Header row, upload lives here, no expand trigger */}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <i className={`ph ${cat.icon} text-base ${hasDoc ? 'text-green-400' : isExpanded ? 'text-purple-300' : cat.required ? 'text-purple-400' : 'text-gray-500'}`}></i>
                                                            <div>
                                                                <p className="text-base font-bold text-white leading-tight">{cat.label}</p>
                                                                {cat.required && !hasDoc && <span className="text-sm uppercase tracking-widest text-purple-400">Required</span>}
                                                                {hasDoc && <span className="text-sm uppercase tracking-widest text-green-400">{catDocs.length} file{catDocs.length > 1 ? 's' : ''}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 flex-shrink-0">
                                                            {cat.templateUrl && (
                                                                <a href={cat.templateUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400/80 hover:text-blue-300 transition-colors" title="Download Template">
                                                                    <i className="ph ph-file-arrow-down text-base"></i>
                                                                </a>)}
                                                            {uploadInput}
                                                        </div>
                                                    </div>
                                                    {/* Card body */}
                                                    <p className="text-sm text-gray-500 leading-relaxed">{cat.desc}</p>
                                                    {cat.fillEnabled && isFillableTemplateUrl(cat.templateUrl) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setVaultProcess(null); setVaultFillCat(cat); }}
                                                            className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                                                        >
                                                            <i className="ph ph-magic-wand text-xs"></i>
                                                            Preview with my info
                                                        </button>
                                                    )}
                                                    {!hasDoc && cat.process && (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setVaultProcess(cat); setVaultProcessTrack(0); }}
                                                            className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors"
                                                        >
                                                            <i className="ph ph-arrow-right text-xs"></i>
                                                            How to get this
                                                        </button>
                                                    )}
                                                    {hasDoc && (
                                                        <div className="space-y-1.5">
                                                            {catDocs.map((doc, i) => (
                                                                <div key={i} onClick={() => getSignedUrl(doc.path)} className="flex items-center gap-2 p-2 bg-black/20 rounded-lg hover:bg-black/40 cursor-pointer transition-all group">
                                                                    <i className="ph ph-file text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0 text-base"></i>
                                                                    <span className="text-sm text-gray-400 truncate flex-1 group-hover:text-gray-200">{doc.name}</span>
                                                                    <i className="ph ph-download-simple text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0 text-base"></i>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Document fill panel — preview + assistant fill for fillEnabled cards */}
                    {vaultFillCat && (
                        <DocumentFillPanel
                            cat={vaultFillCat}
                            clientProfile={clientProfile}
                            complianceIntake={complianceIntake}
                            supabase={supabase}
                            session={session}
                            onClose={() => setVaultFillCat(null)}
                            onDocumentSigned={(doc) => {
                                setMyDocs(prev => [doc, ...prev]);
                                setVaultFillCat(null);
                            }}
                        />
                    )}

                    {/* Vault process panel. Full-screen overlay showing step-by-step doc process */}
                    {vaultProcess && (() => {
                        const cat = vaultProcess;
                        const proc = cat.process;
                        const tracks = proc.tracks || [];
                        const track = tracks[vaultProcessTrack] || tracks[0];
                        const uploadOnFile = async (file) => {
                            if (!supabase) return;
                            setVaultUploadError('');
                            setClientUploading(true);
                            const path = `${session.user.id}/${cat.id}/${Date.now()}-${file.name}`;
                            const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file);
                            if (uploadError) { setVaultUploadError(uploadError.message); }
                            else {
                                const { error: dbError } = await supabase.from('documents').insert({ client_id: session.user.id, name: file.name, path, size: file.size, uploaded_by: session.user.id, category: cat.id });
                                if (!dbError) { setMyDocs(prev => [{ name: file.name, path, size: file.size, category: cat.id, created_at: new Date().toISOString() }, ...prev]); setVaultProcess(null); }
                            }
                            setClientUploading(false);
                        };
                        return (
                            <>
                                {/* Backdrop */}
                                <div className="fixed inset-0 z-40 bg-[#03020a]/80 backdrop-blur-sm" onClick={() => setVaultProcess(null)} />
                                {/* Panel */}
                                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-16 px-4">
                                    <div className="w-full max-w-lg bg-[#0e0c1a] border border-white/10 rounded-2xl shadow-2xl animate-[fadeIn_0.2s_ease-out]">
                                        {/* Header */}
                                        <div className="flex items-start justify-between p-6 border-b border-white/5">
                                            <div>
                                                <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">{cat.label}</p>
                                                <h2 className="text-lg font-bold text-white">{proc.title}</h2>
                                            </div>
                                            <button onClick={() => setVaultProcess(null)} className="text-gray-600 hover:text-gray-300 transition-colors mt-1">
                                                <i className="ph ph-x text-lg"></i>
                                            </button>
                                        </div>
                                        {/* Track selector */}
                                        {tracks.length > 1 && (
                                            <div className="px-6 pt-5">
                                                <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">{proc.pick || 'Choose your path:'}</p>
                                                <div className="flex flex-col gap-2">
                                                    {tracks.map((t, i) => (
                                                        <button key={i} onClick={() => setVaultProcessTrack(i)}
                                                            className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${vaultProcessTrack === i ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/5 bg-white/[0.02] hover:border-white/10'}`}>
                                                            <div>
                                                                <p className="text-sm font-semibold text-white">{t.label}</p>
                                                                <p className="text-xs text-gray-500">{t.time} · {t.cost}</p>
                                                            </div>
                                                            {vaultProcessTrack === i && <i className="ph ph-check-circle text-purple-400 text-lg flex-shrink-0"></i>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Steps */}
                                        <div className="p-6 space-y-3">
                                            {tracks.length === 1 && (
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="text-xs text-gray-500">{track.time}</span>
                                                    <span className="text-gray-700">·</span>
                                                    <span className="text-xs text-gray-500">{track.cost}</span>
                                                </div>
                                            )}
                                            {track.steps.map((step, i) => {
                                                const stepKey = `${cat.id}_${vaultProcessTrack}_${i}`;
                                                const isDone = !!vaultStepsDone[stepKey];
                                                const hasReminder = !!vaultReminderSent[stepKey];
                                                const isReminderOpen = vaultReminderStep?.stepKey === stepKey;
                                                return (
                                                <div key={i} className={`flex gap-3 p-3 rounded-lg transition-all ${isDone ? 'bg-green-500/5 border border-green-500/10' : 'border border-transparent'}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleVaultStepToggle(cat.id, vaultProcessTrack, i)}
                                                        className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 transition-all ${isDone ? 'bg-green-500/30 border-green-400/50' : 'bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30'}`}
                                                    >
                                                        {isDone
                                                            ? <i className="ph ph-check text-green-400 text-[10px]"></i>
                                                            : <span className="text-[10px] font-bold text-purple-300">{i + 1}</span>
                                                        }
                                                    </button>
                                                    <div className="min-w-0 flex-1 space-y-1.5">
                                                        <p className={`text-sm leading-relaxed ${isDone ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{step.action}</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {step.url && !isDone && (
                                                                <a href={step.url} target="_blank" rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-400/50 bg-purple-500/5 hover:bg-purple-500/10 px-3 py-1.5 rounded-lg transition-all">
                                                                    <i className="ph ph-arrow-square-out text-xs"></i>
                                                                    {step.cta || 'Open link'}
                                                                </a>
                                                            )}
                                                            {step.portalUrl && !isDone && (
                                                                <a href={step.portalUrl} target="_blank" rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all">
                                                                    <i className="ph ph-globe text-xs"></i>
                                                                    {step.portalCta || 'Open filing portal'}
                                                                </a>
                                                            )}
                                                            {!isDone && !hasReminder && !isReminderOpen && (
                                                                <button type="button"
                                                                    onClick={() => setVaultReminderStep({ stepKey, stepText: step.action.slice(0, 80) })}
                                                                    className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-lg transition-all">
                                                                    <i className="ph ph-bell text-xs"></i>
                                                                    Remind me
                                                                </button>
                                                            )}
                                                            {hasReminder && !isDone && (
                                                                <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 rounded-lg">
                                                                    <i className="ph ph-bell-ringing text-xs"></i>
                                                                    Reminder set for {vaultReminderSent[stepKey].days} day{vaultReminderSent[stepKey].days > 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {isReminderOpen && (
                                                            <div className="flex items-center gap-2 mt-1 animate-[fadeIn_0.15s_ease-out]">
                                                                <span className="text-xs text-gray-500">Remind me in</span>
                                                                {['1','3','7','14'].map(d => (
                                                                    <button key={d} type="button"
                                                                        onClick={() => setVaultReminderDays(d)}
                                                                        className={`text-xs px-2 py-1 rounded-md border transition-all ${vaultReminderDays === d ? 'border-purple-500/50 bg-purple-500/20 text-purple-300' : 'border-white/10 text-gray-500 hover:border-white/20'}`}>
                                                                        {d}d
                                                                    </button>
                                                                ))}
                                                                <button type="button" disabled={vaultReminderSending}
                                                                    onClick={() => handleVaultReminder(cat.id, vaultProcessTrack, i, vaultReminderStep.stepText, parseInt(vaultReminderDays))}
                                                                    className="text-xs px-3 py-1 rounded-md bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                                                    {vaultReminderSending ? '…' : 'Set'}
                                                                </button>
                                                                <button type="button" onClick={() => setVaultReminderStep(null)} className="text-gray-600 hover:text-gray-400">
                                                                    <i className="ph ph-x text-xs"></i>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                        {/* Upload */}
                                        <div className="px-6 pb-6">
                                            <p className="text-xs uppercase tracking-widest text-gray-600 mb-3">Once you have the document:</p>
                                            <VaultUploadButton disabled={clientUploading} onFile={uploadOnFile} fullWidth />
                                            {vaultUploadError && <p className="text-xs text-red-400 mt-2">{vaultUploadError}</p>}
                                        </div>
                                    </div>
                                </div>
                            </>
                        );
                    })()}</>}

                    {/* Compliance tab: Ticket #08 recurring obligations (not Step 06) */}
                    {dashTab === 'compliance' && (
                        <ComplianceCalendar
                            clientProfile={clientProfile}
                            obligations={clientObligations}
                            loading={clientObligationsLoading}
                            error={clientObligationsError}
                            onRefresh={refreshClientObligations}
                            supabase={supabase}
                            session={session}
                            onUpgrade={handleUpgrade}
                        />
                    )}

                    {/* Messages tab */}
                    {dashTab === 'messages' && (() => {
                        const plan = clientProfile?.plan ?? 'starter';
                        const isPaid = plan === 'growth' || plan === 'enterprise';
                        const navigatorUnlocked = (clientProfile?.onboarding_step ?? 0) >= 11;
                        const teamMessages = myMessages.filter(m => msgThread(m) === 'team' && (!m.is_admin_message || m.sent_at || !m.scheduled_at));
                        const assistantMessages = myMessages.filter(m => msgThread(m) === 'assistant');
                        return (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                            {/* Sub-tab nav */}
                            <div className="flex gap-1 border-b border-white/5 mb-5 pb-px">
                                {/* Assistant first */}
                                {[
                                    { id: 'assistant', icon: 'ph-sparkle', label: 'Assistant', badge: assistantMessages.filter(m => m.is_admin_message && !m.seen).length },
                                ].map(t => (
                                    <button key={t.id} onClick={() => setMsgInbox(t.id)}
                                        className={`relative flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-widest whitespace-nowrap transition-all ${msgInbox === t.id ? 'text-purple-200 border-b-2 border-purple-400 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}>
                                        <i className={`ph ${t.icon} text-base`}></i>
                                        {t.label}
                                        {t.badge > 0 && <span className="ml-1 w-4 h-4 bg-blue-500 rounded-full text-xs flex items-center justify-center text-white font-bold">{t.badge}</span>}
                                    </button>
                                ))}
                                {/* Onboardin tab. Greyed + disabled on free tier */}
                                {(() => {
                                    const badge = teamMessages.filter(m => m.is_admin_message && !m.seen).length;
                                    const active = msgInbox === 'team';
                                    return (
                                        <button onClick={() => setMsgInbox('team')}
                                            className={`relative flex items-center gap-0 px-3 py-2 whitespace-nowrap transition-all ${active ? 'text-purple-200 border-b-2 border-purple-400 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}>
                                            <svg viewBox="0 0 73 85.4" className="w-6 h-6 flex-shrink-0" style={{opacity: isPaid ? 1 : 0.25, marginBottom: '2px'}}>
                                                <path d="M36.9 8.7c-44.4.8-44.4 66.8 0 67.6 44.4-.8 44.4-66.8 0-67.6" fill="#b6499b"/>
                                                <path d="M1.3 41c.2 13.9 6.6 23.6 15.5 29.2C-3.3 53.8 3.4 13.9 36.9 13.3c31.9.5 39.5 36.8 22.8 54.3 7-5.8 11.8-14.7 12-26.7C70.9-5.3 2.1-5.3 1.3 41" fill="#1b8dcd"/>
                                                <path d="M36.9 23c-35.4.6-35.4 53.3 0 53.9 35.4-.6 35.4-53.3 0-53.9" fill="#fefefe"/>
                                                <path d="M36.9 33.1c-22.2.4-22.2 33.4 0 33.7 22.2-.4 22.2-33.4 0-33.7" fill="#b6499b"/>
                                            </svg>
                                            <span className="text-base tracking-widest" style={{fontWeight:400,letterSpacing:'0.08em',opacity: isPaid ? 1 : 0.25}}>nboardin</span>
                                            {badge > 0 && <span className="ml-1 w-4 h-4 bg-blue-500 rounded-full text-xs flex items-center justify-center text-white font-bold">{badge}</span>}
                                        </button>
                                    );
                                })()}
                                {/* Navigator last */}
                                {[
                                    { id: 'navigator', icon: 'ph-compass', label: 'Navigator' },
                                ].map(t => (
                                    <button key={t.id} onClick={() => setMsgInbox(t.id)}
                                        className={`relative flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-widest whitespace-nowrap transition-all ${msgInbox === t.id ? 'text-purple-200 border-b-2 border-purple-400 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}>
                                        <i className={`ph ${t.icon} text-base`}></i>
                                        {t.label}
                                        {t.badge > 0 && <span className="ml-1 w-4 h-4 bg-blue-500 rounded-full text-xs flex items-center justify-center text-white font-bold">{t.badge}</span>}
                                    </button>
                                ))}
                            </div>

                            {/* Team inbox */}
                            {msgInbox === 'team' && (
                                !isPaid ? (
                                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                                        <svg viewBox="0 0 73 85.4" className="w-10 h-10 opacity-20">
                                            <path d="M36.9 8.7c-44.4.8-44.4 66.8 0 67.6 44.4-.8 44.4-66.8 0-67.6" fill="#b6499b"/>
                                            <path d="M1.3 41c.2 13.9 6.6 23.6 15.5 29.2C-3.3 53.8 3.4 13.9 36.9 13.3c31.9.5 39.5 36.8 22.8 54.3 7-5.8 11.8-14.7 12-26.7C70.9-5.3 2.1-5.3 1.3 41" fill="#1b8dcd"/>
                                            <path d="M36.9 23c-35.4.6-35.4 53.3 0 53.9 35.4-.6 35.4-53.3 0-53.9" fill="#fefefe"/>
                                            <path d="M36.9 33.1c-22.2.4-22.2 33.4 0 33.7 22.2-.4 22.2-33.4 0-33.7" fill="#b6499b"/>
                                        </svg>
                                        <p className="text-sm uppercase tracking-widest text-gray-600">Direct access to your Onboardin team unlocks on the Growth plan.</p>
                                        <button onClick={handleUpgrade} className="mt-1 text-sm uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10 transition-all">
                                            Upgrade to Growth →
                                        </button>
                                    </div>
                                ) : <>
                                <div className="space-y-3 max-h-64 overflow-y-auto mb-4 pr-1">
                                    {myMessagesLoading && teamMessages.length === 0 ? (
                                        <div className="w-full h-8 bg-white/5 rounded animate-pulse" />
                                    ) : teamMessages.length === 0 ? (
                                        <p className="text-base text-gray-600 italic">Your Onboardin team will message you here.</p>
                                    ) : teamMessages.map((msg) => (
                                        <div key={msg.id} className={`flex ${msg.is_admin_message ? 'justify-start' : 'justify-end'}`}>
                                            <div className="max-w-[80%] flex flex-col gap-1">
                                                <div className={`px-3 py-2 rounded-xl text-base leading-relaxed relative ${msg.scheduled_at && !msg.sent_at ? 'opacity-60 border border-dashed border-white/20' : ''} ${msg.is_admin_message ? 'bg-white/5 text-gray-300' : 'bg-purple-500/20 text-purple-100'}`}>
                                                    {msg.scheduled_at && !msg.sent_at && <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-blue-400 rounded-full" title="Scheduled"></div>}
                                                    {msg.body}
                                                </div>
                                                <p className={`text-xs uppercase tracking-widest text-gray-600 ${msg.is_admin_message ? 'text-left' : 'text-right'}`}>
                                                    {msg.scheduled_at && !msg.sent_at
                                                        ? `Scheduled · ${new Date(msg.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                                                        : msg.is_admin_message ? 'Onboardin Team' : 'You'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={handleClientMessage} className="flex gap-2">
                                    <input type="text" value={clientMessageInput} onChange={e => setClientMessageInput(e.target.value)}
                                        placeholder="Message your team…"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 transition-all" />
                                    <button type="submit" disabled={sendingClientMessage || !clientMessageInput.trim()}
                                        className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-sm font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                        {sendingClientMessage ? '…' : 'Send'}
                                    </button>
                                </form>
                            </>)}

                            {/* Assistant inbox */}
                            {msgInbox === 'assistant' && <>
                                <div className="space-y-3 max-h-64 overflow-y-auto mb-4 pr-1">
                                    {myMessagesLoading && assistantMessages.length === 0 ? (
                                        <div className="w-full h-8 bg-white/5 rounded animate-pulse" />
                                    ) : assistantMessages.length === 0 ? (
                                        <p className="text-base text-gray-600 italic">Messages from the AI assistant will appear here.</p>
                                    ) : assistantMessages.map((msg) => (
                                        <div key={msg.id} className={`flex ${msg.is_admin_message ? 'justify-start' : 'justify-end'}`}>
                                            <div className="max-w-[80%] flex flex-col gap-1">
                                                <div className={`px-3 py-2 rounded-xl text-base leading-relaxed relative ${msg.is_admin_message ? 'bg-white/5 text-gray-300' : 'bg-purple-500/20 text-purple-100'}`}>
                                                    <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-green-400 rounded-full" title="AI Assistant"></div>
                                                    {msg.body}
                                                </div>
                                                <p className={`text-xs uppercase tracking-widest text-gray-600 ${msg.is_admin_message ? 'text-left' : 'text-right'}`}>
                                                    {msg.is_admin_message ? 'AI Assistant' : 'You'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>}

                            {/* Navigator inbox */}
                            {msgInbox === 'navigator' && (
                                navigatorUnlocked ? (
                                    <div className="space-y-3">
                                        <p className="text-base text-gray-400 leading-relaxed">Navigator routes you to vetted partners, capital sources, and channels matched to your profile once all onboarding steps are complete.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                                        <i className="ph ph-compass text-4xl text-gray-700"></i>
                                        <p className="text-sm uppercase tracking-widest text-gray-600">Navigator unlocks when all 11 pipeline steps are complete.</p>
                                        <p className="text-sm text-gray-600">You are on step {clientProfile?.onboarding_step ?? 0} of 11.</p>
                                    </div>
                                )
                            )}
                        </div>
                        );
                    })()}

                    {/* Capital tab */}
                    {dashTab === 'capital' && (() => {
                        const plan = clientProfile?.plan ?? 'starter';
                        const isPaid = plan === 'growth' || plan === 'enterprise';

                        /*--- scaf ---*/
                        // Readiness score : deterministic checks, each missing = -20
                        const checks = [
                            { label: 'Entity formed', pass: (clientProfile?.onboarding_step ?? 0) >= 2 },
                            { label: 'Jurisdiction confirmed', pass: !!clientProfile?.jurisdiction },
                            { label: 'Entity type set', pass: !!clientProfile?.entity_type },
                            { label: 'Funding stage set', pass: !!clientProfile?.funding_stage },
                            { label: 'Founder docs uploaded', pass: myDocs.some(d => d.category === 'founder_docs') },
                        ];
                        const passed = checks.filter(c => c.pass).length;
                        const score = Math.round((passed / checks.length) * 100);
                        const status = score >= 80 ? 'Ready' : score >= 60 ? 'Almost there' : 'Not ready';
                        const statusColor = score >= 80 ? 'text-green-300 bg-green-400/10 border-green-400/20' : score >= 60 ? 'text-yellow-300 bg-yellow-400/10 border-yellow-400/20' : 'text-gray-400 bg-white/5 border-white/10';

                        if (!isPaid) {
                            return (
                                <div className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-500/15 rounded-2xl p-6 backdrop-blur-xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm uppercase tracking-widest text-gray-500">Capital Readiness</h3>
                                        <span className="text-sm uppercase tracking-widest text-purple-300 bg-purple-400/10 border border-purple-400/20 px-2 py-1 rounded-full">Growth</span>
                                    </div>
                                    <p className="text-base text-gray-400 leading-relaxed mb-4">Diagnose whether your business is ready to approach capital, and request introductions to vetted financing partners. Available on the Growth plan.</p>
                                    <button onClick={handleUpgrade} className="text-sm uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10 transition-all">
                                        Upgrade to unlock →
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-5">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm uppercase tracking-widest text-gray-500">Capital Readiness</h3>
                                </div>
                                {/* Readiness Score */}
                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm uppercase tracking-widest text-gray-500">Your Readiness Score</p>
                                            <p className="text-3xl font-bold text-white mt-1">{score}<span className="text-base text-gray-500 font-normal">/100</span></p>
                                        </div>
                                        <span className={`text-sm uppercase tracking-widest border px-2 py-1 rounded-full ${statusColor}`}>{status}</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-500 ${score >= 80 ? 'bg-green-400' : score >= 60 ? 'bg-yellow-400' : 'bg-gray-500'}`} style={{ width: `${score}%` }} />
                                    </div>
                                    <ul className="space-y-1.5 pt-1">
                                        {checks.map((c, i) => (
                                            <li key={i} className="flex items-center gap-2 text-base">
                                                <i className={`ph ${c.pass ? 'ph-check-circle text-green-400' : 'ph-circle-dashed text-gray-600'} text-base flex-shrink-0`}></i>
                                                <span className={c.pass ? 'text-gray-300' : 'text-gray-500'}>{c.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                {/* Capital Partners. Empty state */}
                                <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <i className="ph ph-handshake text-purple-300 text-base"></i>
                                        <p className="text-sm uppercase tracking-widest text-gray-500">Capital Partners</p>
                                    </div>
                                    {capitalRequestSent ? (
                                        <div className="flex items-start gap-2 py-2">
                                            <i className="ph ph-check-circle text-green-400 text-base flex-shrink-0 mt-0.5"></i>
                                            <p className="text-base text-gray-300 leading-relaxed">Request received. Our team will review your profile and message you with matched capital sources within 1 to 2 business days.</p>
                                        </div>
                                    ) : (<>
                                            <p className="text-base text-gray-400 leading-relaxed mb-3">No direct partners are live in your region yet. While we build out integrations, our team can do a manual capital-source intro on request, matched to your stage, country, and business model.</p>
                                            <button
                                                onClick={handleRequestCapitalIntro}
                                                disabled={capitalRequesting || score < 60}
                                                className="text-sm uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                title={score < 60 ? 'Reach at least 60/100 readiness to request an intro' : 'Request a manual intro'}
                                            >
                                                {capitalRequesting ? 'Sending…' : 'Request capital intro'}
                                            </button>
                                        </>)}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Navigator tab */}
                    {dashTab === 'navigator' && (() => {
                        const plan = clientProfile?.plan ?? 'starter';
                        const isPaid = plan === 'growth' || plan === 'enterprise';
                        const matches = getPartnerMatches(clientProfile);

                        const categories = [
                            { id: 'banking',        label: 'Banking',        icon: 'ph-bank' },
                            { id: 'accounting',     label: 'Accounting',     icon: 'ph-calculator' },
                            { id: 'payments',       label: 'Payments',       icon: 'ph-credit-card' },
                            { id: 'compliance',     label: 'Compliance',     icon: 'ph-shield-check' },
                            { id: 'infrastructure', label: 'Infrastructure', icon: 'ph-globe' },
                        ];

                        return (
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <i className="ph ph-compass text-blue-300 text-xl"></i>
                                                <h3 className="text-sm uppercase tracking-widest text-gray-400">Lead Navigator</h3>
                                            </div>
                                            <p className="text-base text-gray-400 leading-relaxed max-w-lg">Partners matched to your jurisdiction, entity type, and stage. Every match includes a reason. No generic recommendations.</p>
                                        </div>
                                        {!isPaid && (
                                            <span className="text-xs uppercase tracking-widest text-purple-300 bg-purple-400/10 border border-purple-400/20 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">Growth unlocks all</span>
                                        )}
                                    </div>
                                    {clientProfile?.jurisdiction && (
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            <span className="text-xs text-gray-500 border border-white/10 px-2 py-1 rounded-full">{clientProfile.jurisdiction}</span>
                                            {clientProfile.entity_type && <span className="text-xs text-gray-500 border border-white/10 px-2 py-1 rounded-full">{clientProfile.entity_type}</span>}
                                            {clientProfile.funding_stage && <span className="text-xs text-gray-500 border border-white/10 px-2 py-1 rounded-full">{clientProfile.funding_stage}</span>}
                                        </div>
                                    )}
                                </div>

                                {/* Partner categories */}
                                {categories.map(cat => {
                                    const catMatches = matches.filter(m => m.category === cat.id);
                                    if (catMatches.length === 0) return null;
                                    return (
                                        <div key={cat.id}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <i className={`ph ${cat.icon} text-gray-500 text-base`}></i>
                                                <p className="text-xs uppercase tracking-widest text-gray-500">{cat.label}</p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {catMatches.map((partner, idx) => {
                                                    const isTopMatch = idx === 0;
                                                    const isLocked = !isPaid && idx > 0;
                                                    return (
                                                        <div
                                                            key={partner.slug}
                                                            className={`relative bg-white/5 border rounded-2xl p-5 backdrop-blur-xl transition-all ${isTopMatch ? 'border-blue-400/25' : 'border-white/10'} ${isLocked ? 'opacity-60' : ''}`}
                                                        >
                                                            {isTopMatch && (
                                                                <span className="absolute top-3 right-3 text-xs uppercase tracking-widest text-blue-300 bg-blue-400/10 border border-blue-400/20 px-2 py-0.5 rounded-full">Top match</span>
                                                            )}
                                                            {isLocked && (
                                                                <span className="absolute top-3 right-3 text-xs uppercase tracking-widest text-purple-300 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-full">Growth</span>
                                                            )}
                                                            <div className="flex items-start gap-3 mb-3">
                                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: partner.color + '20', border: `1px solid ${partner.color}40` }}>
                                                                    <i className={`ph ${partner.icon} text-base`} style={{ color: partner.color }}></i>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-base font-semibold text-white leading-tight">{partner.name}</p>
                                                                    <p className="text-sm text-gray-500 mt-0.5 leading-snug">{partner.tagline}</p>
                                                                </div>
                                                            </div>
                                                            <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3 mb-4">
                                                                <p className="text-sm text-gray-400 leading-relaxed">
                                                                    <i className="ph ph-info text-blue-400 mr-1.5 text-sm"></i>
                                                                    {partner.why}
                                                                </p>
                                                            </div>
                                                            {isLocked ? (
                                                                <button onClick={handleUpgrade} className="w-full py-2 text-xs uppercase tracking-widest text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/10 transition-all">
                                                                    Upgrade to unlock →
                                                                </button>
                                                            ) : (
                                                                <a
                                                                    href={partner.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center justify-center gap-1.5 w-full py-2 text-xs uppercase tracking-widest text-blue-300 border border-blue-400/25 rounded-lg hover:bg-blue-400/10 transition-all"
                                                                >
                                                                    Visit {partner.name}
                                                                    <i className="ph ph-arrow-up-right text-xs"></i>
                                                                </a>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* No matches state */}
                                {matches.length === 0 && (
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl text-center">
                                        <i className="ph ph-compass text-gray-600 text-3xl mb-3 block"></i>
                                        <p className="text-sm uppercase tracking-widest text-gray-500 mb-2">Set your jurisdiction first</p>
                                        <p className="text-base text-gray-500">Complete your profile in Overview to see matched partners.</p>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Billing. Overview tab only */}
                    {dashTab === 'overview' && (() => {
                        const plan = clientProfile?.plan ?? 'starter';
                        const isPaid = plan === 'growth' || plan === 'enterprise';
                        const isPastDue = plan === 'past_due';
                        return (<div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm uppercase tracking-widest text-gray-500">Billing</h3>
                                    {isPaid && <span className="text-sm uppercase tracking-widest text-green-300 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full">Growth: Active</span>}
                                    {isPastDue && <span className="text-sm uppercase tracking-widest text-red-300 bg-red-400/10 border border-red-400/20 px-2 py-1 rounded-full">Payment Failed</span>}
                                    {!isPaid && !isPastDue && <span className="text-sm uppercase tracking-widest text-gray-400 bg-white/5 border border-white/10 px-2 py-1 rounded-full">Starter, Free</span>}
                                </div>
                                {isPaid ? (
                                    <p className="text-base text-gray-400 leading-relaxed">You're on the Growth plan. Full access to all features and priority support.</p>) : isPastDue ? (
                                    <div className="space-y-3">
                                        <p className="text-base text-red-300 leading-relaxed">Your last payment failed. Update your payment method to restore access.</p>
                                        <button onClick={handleUpgrade} className="w-full py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 transition-all">
                                            Update Payment Method
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-base font-bold text-white mb-1">Growth <span className="text-gray-500 font-normal text-base">$49 / mo</span></p>
                                            <ul className="space-y-1 text-base text-gray-400">
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-base"></i>State Compliance Automation</li>
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-base"></i>Full Integration Suite</li>
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-base"></i>3 AI Agents</li>
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-base"></i>Priority Support</li>
                                            </ul>
                                        </div>
                                        <button onClick={handleUpgrade} className="w-full py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-purple-500/30 rounded-lg text-sm font-bold uppercase tracking-wider text-purple-200 hover:from-blue-500/30 hover:to-purple-500/30 hover:border-purple-400/50 transition-all">
                                            Upgrade to Growth
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
            {showPricing && (
                <Pricing
                    visible={showPricing}
                    onDismiss={() => setShowPricing(false)}
                    onContact={() => setShowPricing(false)}
                    onUpgrade={handleStripeCheckout}
                    checkoutLoading={checkoutLoading}
                />
            )}
            </>
        );
    }

    return (
        <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] flex flex-col items-center min-h-[60vh] relative z-10">
            <div className="w-full max-w-md">
                <div className="mb-10 text-center">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-3">{Math.random() < 0.5 ? 'GET ONBOARD' : 'WELCOME ONBOARD'}</h1>
                    <p className="text-base text-gray-400 uppercase tracking-widest opacity-70">Open your client dashboard</p>
                </div>

                <form onSubmit={handleSignIn} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
                    <div className="space-y-6">
                        <div className="group">
                            <label className="block text-sm uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-base text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                placeholder="you@example.com"
                            />
                        </div>
                        <div className="group">
                            <label className="block text-sm uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-base text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                placeholder="••••••••••••"
                            />
                        </div>
                        {error && (
                            <p className="text-red-400 text-sm uppercase tracking-widest">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 mt-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-base font-bold uppercase tracking-wider transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] disabled:opacity-40"
                        >
                            {loading ? 'Signing In...' : 'Sign In'}
                        </button>
                        <div className="text-center pt-2">
                            <p
                                className="text-sm uppercase tracking-wider text-gray-500 hover:text-purple-300 transition-colors cursor-pointer"
                                onClick={() => setCurrentView('signup')}
                            >
                                Request Access
                            </p>
                        </div>
                    </div>
                </form>

                <div className="mt-12 text-center">
                    {!showReset ? (
                        <p
                            className="text-sm uppercase tracking-wider cursor-pointer opacity-30 hover:opacity-100 transition-opacity"
                            onClick={() => { setShowReset(true); setResetStatus(null); }}
                        >
                            Recover Access Credentials
                        </p>
                    ) : (<form onSubmit={handleReset} className="bg-black/40 border border-white/10 rounded-lg p-4 text-left space-y-3">
                            {resetStatus === 'sent' ? (
                                <p className="text-sm uppercase tracking-widest text-green-400 text-center py-1">
                                    Reset link sent, check your inbox.
                                </p>) : (
                                <>
                                    <div className="group">
                                        <label className="block text-sm uppercase tracking-widest text-gray-500 mb-1 group-focus-within:text-purple-400 transition-colors">Email</label>
                                        <input
                                            type="email"
                                            value={resetEmail}
                                            onChange={e => setResetEmail(e.target.value)}
                                            required
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                            placeholder="you@example.com"
                                        />
                                    </div>
                                    {resetStatus && (
                                        <p className="text-red-400 text-sm uppercase tracking-widest">{resetStatus}</p>
                                    )}
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="submit"
                                            disabled={resetLoading}
                                            className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-40"
                                        >
                                            {resetLoading ? 'Sending…' : 'Send Reset Link'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowReset(false); setResetStatus(null); setResetEmail(''); }}
                                            className="py-2 px-3 border border-white/10 rounded-lg text-sm uppercase tracking-widest text-gray-500 hover:text-white hover:border-white/30 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}
                        </form>
                    )}
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
        supabase.auth.getSession().then(({ data: { session } }) => setAppSession(session));
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
        setCurrentView('landing');
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
            setCurrentView('dashboard');
        }
    };

    return (<div className={`min-h-screen text-white relative font-sans selection:bg-purple-500/30 ${theme === 'earth' ? 'bg-[#01030c]' : 'bg-[#03020a]'}`}>
            {theme === 'earth' ? <EarthBackground visible={true} /> : <GalaxyBackground visible={true} />}

            <nav className={`fixed top-0 left-0 w-full z-50 px-8 py-8 md:px-16 md:py-12 flex justify-center items-center transition-all duration-700 ${currentView !== 'landing' || navReady ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                {/* nav logo, muted, kept for reference */}
                <div
                    className="cursor-pointer nav-link flex items-center group opacity-0 pointer-events-none absolute left-8 md:left-16"
                    onClick={() => setCurrentView('landing')}
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
                        <span className="nav-link text-purple-200 hidden sm:inline truncate max-w-[200px]" title={appProfile?.company_name || appSession.user.email}>
                            {appProfile?.is_admin ? 'Admin Console' : (appProfile?.company_name || appSession.user.email)}
                        </span>
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
                    <div className="flex items-center gap-8 md:gap-12 text-sm md:text-base tracking-widest uppercase font-bold">
                        <button onClick={() => navigateTo('features')} className={`nav-link transition-opacity hidden sm:block ${currentView === 'features' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Features</button>
                        <button onClick={() => navigateTo('pricing')} className={`nav-link transition-opacity hidden sm:block ${currentView === 'pricing' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Pricing</button>
                        <button onClick={() => navigateTo('support')} className={`nav-link transition-opacity hidden sm:block relative ${currentView === 'support' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                            Support
                            {unreadCount > 0 && <span className="absolute -top-2 -right-3 w-4 h-4 bg-blue-500 text-white text-sm flex items-center justify-center rounded-full animate-pulse tracking-none">{unreadCount}</span>}
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
