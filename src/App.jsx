import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

// GreenScreen : canvas chroma key video engine
const GreenScreen = ({ videoUrl, onVideoEnd }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showFallback, setShowFallback] = useState(false);

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
                    setShowFallback(true);
                });
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isPlaying) {
                setShowFallback(true);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [isPlaying]);

    return (
        <div className="relative flex justify-center items-center w-full max-w-xl h-[35vh] md:h-[45vh]">
            <video
                ref={videoRef}
                src={videoUrl}
                className="hidden"
                muted
                playsInline
                crossOrigin="anonymous"
                onLoadedData={handlePlay}
                onEnded={onVideoEnd}
                onError={() => setShowFallback(true)}
            />

            {!showFallback ? (
                <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-opacity duration-1000"
                    style={{ opacity: isPlaying ? 1 : 0 }}
                />
            ) : (
                <div className="text-center">
                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 uppercase">
                        Onboardin
                    </h1>
                </div>
            )}
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

    // Each planet: orbital radius, base angular speed, phase offset, color, label
    const PLANETS = [
        { label: 'Tax',        color: [59,130,246],  orbit: 125, speed: 0.0008, phase: 0 },
        { label: 'Legal',      color: [168,85,247],  orbit: 155, speed: 0.0006, phase: 1.26 },
        { label: 'Compliance', color: [74,222,128],  orbit: 183, speed: 0.00045,phase: 2.51 },
        { label: 'Accounting', color: [251,191,36],  orbit: 210, speed: 0.00035,phase: 3.77 },
        { label: 'AI Agents',  color: [239,68,68],   orbit: 236, speed: 0.00028,phase: 5.03 },
    ];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const W = canvas.width = 560;
        const H = canvas.height = 360;
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
                // smoothly grow/shrink orbital radius
                const targetR = isActive ? p.orbit : 0;
                p.r += (targetR - p.r) * 0.055;

                // advance angle (faster while expanding, kepler-ish)
                const angularVel = p.speed * (1 + Math.max(0, (p.orbit - p.r) / p.orbit) * 2);
                p.theta += angularVel;

                const x = cx + Math.cos(p.theta) * p.r;
                const y = cy + Math.sin(p.theta) * p.r * 0.38; // flatten into ellipse

                // trail
                p.trail.push({ x, y, a: 0.35 });
                if (p.trail.length > 38) p.trail.shift();

                if (p.r < 4) return; // collapsed, skip drawing

                const [r,g,b] = p.color;
                const presence = Math.min(1, p.r / p.orbit); // 0→1 as orbit expands

                // orbit ring (faint ellipse)
                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(1, 0.38);
                ctx.beginPath();
                ctx.arc(0, 0, p.r, 0, Math.PI * 2);
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

                // planet dot with glow
                const grd = ctx.createRadialGradient(x, y, 0, x, y, 9);
                grd.addColorStop(0, `rgba(${r},${g},${b},${0.9 * presence})`);
                grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.beginPath();
                ctx.arc(x, y, 9, 0, Math.PI * 2);
                ctx.fillStyle = grd;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(x, y, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r},${g},${b},${presence})`;
                ctx.shadowColor = `rgb(${r},${g},${b})`;
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;

                // label : appears as orbit opens
                if (presence > 0.5) {
                    ctx.font = `bold ${Math.round(8 * presence)}px sans-serif`;
                    ctx.fillStyle = `rgba(${r},${g},${b},${(presence - 0.5) * 2 * 0.8})`;
                    ctx.textAlign = 'center';
                    // label above or below depending on y position
                    const labelOffset = y < cy ? -12 : 14;
                    ctx.fillText(p.label.toUpperCase(), x, y + labelOffset);
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
            width={560}
            height={360}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ opacity: 1, width: 560, height: 360 }}
        />
    );
};

// Landing — public marketing page
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

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden relative z-10">
            {/* Center logo — clickable for brand kit */}
            <div
                className={`transition-all duration-[1500ms] ease-in-out cursor-pointer ${uiVisible ? 'scale-[0.65] opacity-90' : 'scale-100 opacity-100'}`}
                style={{ marginBottom: uiVisible ? '-4rem' : '0' }}
                onClick={handleLogoClick}
                title="Brand Kit"
            >
                <GreenScreen videoUrl="/Onboardin-Ongreen.mp4" onVideoEnd={handleVideoEnd} />
            </div>

            {/* Brand kit panel — slides in below logo, pushes button down */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${uiVisible && showBrandPanel ? 'max-h-32 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`}>
                <div className="flex items-center gap-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl px-6 py-4 mt-2">
                    <i className="ph ph-download-simple text-blue-400 text-lg flex-shrink-0"></i>
                    <div className="flex-1">
                        <p className="text-xs font-bold text-white tracking-wide">Brand Kit</p>
                        <p className="text-[10px] text-gray-500 tracking-widest uppercase">Logos, colors & assets</p>
                    </div>
                    <button
                        onClick={() => { onBrandKit(); setShowBrandPanel(false); }}
                        className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-blue-300 hover:bg-blue-500/30 transition-all"
                    >
                        Download
                    </button>
                    <button onClick={() => setShowBrandPanel(false)} className="text-gray-600 hover:text-gray-300 transition-colors ml-1">
                        <i className="ph ph-x text-sm"></i>
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
                        className="relative z-20 px-12 py-4 rounded-full uppercase tracking-[0.35em] font-black text-xs transition-all duration-[600ms] active:scale-95 bg-[#0d0820]/80 backdrop-blur-md border border-purple-500/25 text-purple-200/80 shadow-[0_0_18px_rgba(139,92,246,0.18),inset_0_0_18px_rgba(139,92,246,0.06)] hover:border-purple-400/50 hover:text-purple-100 hover:shadow-[0_0_32px_rgba(139,92,246,0.35),inset_0_0_24px_rgba(139,92,246,0.10)]"
                    >
                        Start Building
                    </button>
                </div>

                <p className="text-gray-400 text-[10px] md:text-xs mt-8 font-medium tracking-[0.5em] uppercase opacity-50">
                    Launch faster. Scale smarter.
                </p>
            </div>
        </div>
    );
};

// Features — service overview grid
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
    return (
        <>
            {/* Backdrop — full screen, click to dismiss */}
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
            {/* Scrollable content — pointer-events-none on wrapper so backdrop stays clickable at sides */}
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
                            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-4">Operational Excellence</h1>
                            <p className="text-gray-400 text-xs md:text-sm tracking-[0.2em] uppercase opacity-70">A complete suite for founders who value their time</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {features.map((f, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-white/20 transition-colors duration-300 group">
                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-300">
                                        <i className={`ph ${f.icon} text-2xl text-blue-400`}></i>
                                    </div>
                                    <h3 className="text-lg font-bold mb-3 uppercase tracking-wide">{f.title}</h3>
                                    <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

// Pricing — tiered plans
const Pricing = ({ onContact, onDismiss, visible }) => {
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    return (
        <>
            {/* Backdrop — full screen, click to dismiss */}
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
            {/* Scrollable content — pointer-events-none on wrapper so backdrop stays clickable at sides */}
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
                        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-4">Plans for every stage</h1>
                        <p className="text-gray-400 text-xs md:text-sm tracking-[0.2em] uppercase opacity-70">Grow at your own pace with modular business automation</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col hover:border-white/20 transition-colors duration-300">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-blue-300 mb-2">Starter</h3>
                            <div className="text-4xl font-bold mb-6">$0 <span className="text-sm text-gray-500 font-normal">/mo</span></div>
                            <ul className="space-y-4 mb-8 text-sm text-gray-300 flex-1">
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Step-by-step formation guides</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Real-time accounting sync</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Formation Assistant access</li>
                                <li className="flex items-center gap-3 opacity-50"><i className="ph ph-x text-gray-600"></i> Automated compliance filings</li>
                            </ul>
                            <button onClick={onContact} className="w-full py-4 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-colors">Start Free</button>
                        </div>
                        <div className="bg-gradient-to-b from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-2xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-purple-500 text-white text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">Most Popular</div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-purple-300 mb-2">Growth</h3>
                            <div className="text-4xl font-bold mb-6">$49 <span className="text-sm text-gray-500 font-normal">/mo</span></div>
                            <ul className="space-y-4 mb-8 text-sm text-gray-300 flex-1">
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Automated state filings</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Full integration suite</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Three specialized AI agents</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Priority response times</li>
                            </ul>
                            <button onClick={onContact} className="w-full py-4 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors">Get Started</button>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col hover:border-white/20 transition-colors duration-300">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">Enterprise</h3>
                            <div className="text-4xl font-bold mb-6">Custom</div>
                            <ul className="space-y-4 mb-8 text-sm text-gray-300 flex-1">
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Turnkey incorporation & audit</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Unlimited users & models</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Dedicated account manager</li>
                                <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Custom compliance SLAs</li>
                            </ul>
                            <button onClick={onContact} className="w-full py-4 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-colors">Contact Sales</button>
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
                            <p className="text-gray-400 text-xs md:text-sm tracking-[0.2em] uppercase opacity-70">Connect with our team or explore our knowledge base</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {channels.map((c, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-white/20 transition-colors duration-300 group flex flex-col">
                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                        <i className={`ph ${c.icon} text-2xl text-blue-400`}></i>
                                    </div>
                                    <h3 className="text-lg font-bold mb-3 uppercase tracking-wide">{c.title}</h3>
                                    <p className="text-gray-400 text-sm leading-relaxed flex-1 mb-6">{c.desc}</p>
                                    {c.form ? (
                                        <button onClick={onContact} className="w-full py-3 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-colors">{c.action}</button>
                                    ) : (
                                        <a href={c.href} className="w-full py-3 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-colors text-center">{c.action}</a>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="text-center mt-10">
                            <p className="text-gray-500 text-[10px] tracking-[0.3em] uppercase">Average first response · under 4 hours</p>
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
    if (isEnterprise && fundingStage === 'Pre-Seed') return { entity: 'LLC', reason: 'LLCs offer pass-through taxation and flexibility, ideal before a fundraise.' };
    return { entity: 'LLC', reason: 'LLCs are the most common structure for early-stage startups: simple, flexible, founder-friendly.' };
}

// Returns document categories required for a given entity type + country
function getDocCategories(entityType, country, jurisdiction) {
    const isUS = country === 'United States';
    const isCA = country === 'Canada';
    const base = [
        {
            id: 'gov_id',
            label: 'Government ID',
            icon: 'ph-identification-card',
            desc: 'Passport or government-issued photo ID for each founder.',
            required: true,
        },
        {
            id: 'founder_docs',
            label: 'Founder Documents',
            icon: 'ph-user-list',
            desc: 'Signed founder agreement, equity split, and any existing IP assignments.',
            required: true,
        },
    ];

    if (entityType === 'LLC' || entityType === 'C-Corp' || entityType === 'S-Corp') {
        base.push({
            id: 'articles',
            label: entityType === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation',
            icon: 'ph-file-text',
            desc: entityType === 'LLC'
                ? 'State-issued articles of organization (if already formed).'
                : 'State-issued articles of incorporation (if already formed).',
            required: false,
        });
        base.push({
            id: 'operating_agreement',
            label: entityType === 'LLC' ? 'Operating Agreement' : 'Bylaws / Shareholder Agreement',
            icon: 'ph-handshake',
            desc: 'Internal governance document outlining ownership and management structure.',
            required: false,
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

    if (isUS || isCA) {
        base.push({
            id: 'tax_id',
            label: isUS ? 'EIN Confirmation' : 'Business Number (CRA)',
            icon: 'ph-receipt',
            desc: isUS
                ? 'IRS EIN confirmation letter (CP 575) if you already have one.'
                : 'Canada Revenue Agency business number confirmation (if registered).',
            required: false,
        });
    }

    base.push({
        id: 'banking',
        label: 'Banking Details',
        icon: 'ph-bank',
        desc: 'Voided check or bank letter for business account (used for accounting setup).',
        required: false,
    });

    return base;
}

// -- Signup --------------------------------------------------------------------

const Signup = ({ setCurrentView }) => {
    const [step, setStep] = useState(1);
    const [companyName, setCompanyName] = useState('');
    const [founderName, setFounderName] = useState('');
    const [workEmail, setWorkEmail] = useState('');
    const [fundingStage, setFundingStage] = useState('Pre-Seed');
    // Step 3 — jurisdiction + entity
    const [country, setCountry] = useState('United States');
    const [jurisdiction, setJurisdiction] = useState('');
    const [businessIntent, setBusinessIntent] = useState('');
    const [sellsTo, setSellsTo] = useState('');
    const [entityType, setEntityType] = useState('');
    const [entityOverride, setEntityOverride] = useState(false);
    // Step 3 — domain + email
    const [hasDomain, setHasDomain] = useState(null); // true | false | null
    const [existingDomain, setExistingDomain] = useState('');
    const [domainQuery, setDomainQuery] = useState('');
    const [domainResults, setDomainResults] = useState([]);
    const [domainSearching, setDomainSearching] = useState(false);
    const [chosenDomain, setChosenDomain] = useState('');
    const [hasBusinessEmail, setHasBusinessEmail] = useState(null); // true | false | null
    const [workspaceSeats, setWorkspaceSeats] = useState(1);
    const [workspacePlan, setWorkspacePlan] = useState('business_starter');
    // Step 5 — password
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

    const inputClass = "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all";
    const labelClass = "block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors";

    return (
        <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] flex flex-col items-center min-h-[60vh] relative z-10">
            <div className="w-full max-w-md">
                <div className="mb-10 text-center">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-3">Get Started</h1>
                    <p className="text-xs text-gray-400 uppercase tracking-[0.3em] opacity-70">Client intake: should take about a minute</p>
                </div>

                {success ? (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center space-y-6">
                        <div className="w-12 h-12 bg-green-400/10 rounded-full flex items-center justify-center mx-auto">
                            <i className="ph ph-check-circle text-2xl text-green-400"></i>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-white">You're in.</p>
                            <p className="text-xs text-gray-400 leading-relaxed">Check your email to confirm your address. You can explore your dashboard in the meantime.</p>
                        </div>
                        <button onClick={() => setCurrentView('dashboard')} className="w-full py-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-purple-500/30 rounded-lg text-xs font-bold uppercase tracking-[0.2em] text-purple-200 hover:from-blue-500/30 hover:to-purple-500/30 transition-all">Go to Dashboard →</button>
                    </div>
                ) : (
                    <>
                        {/* Step indicator */}
                        <div className="flex items-center gap-2 justify-center mb-8">
                            {Array.from({ length: totalSteps }, (_, i) => (
                                <div key={i} className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i < step ? 'bg-purple-500' : 'bg-white/10'}`} />
                            ))}
                        </div>
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 text-center mb-6">Step {step} of {totalSteps}</p>

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
                                <button type="submit" className="w-full py-4 mt-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all">Continue</button>
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
                                    <button type="button" onClick={() => setStep(1)} className="py-4 px-4 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-all">← Back</button>
                                    <button type="submit" className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all">Continue</button>
                                </div>
                                <button type="button" onClick={() => { setJurisdiction(''); setStep(3); }} className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors">Decide later</button>
                            </form>
                        )}

                        {/* Step 3: Domain + business email */}
                        {step === 3 && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                {/* Domain */}
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Business Domain</p>
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        {[{ val: true, label: 'I have one', icon: 'ph-check' }, { val: false, label: 'Need one', icon: 'ph-magnifying-glass' }].map(opt => (
                                            <button key={String(opt.val)} type="button" onClick={() => { setHasDomain(opt.val); setChosenDomain(''); setDomainResults([]); }}
                                                className={`flex items-center gap-2 justify-center py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${hasDomain === opt.val ? 'border-purple-500/50 bg-purple-500/10 text-purple-200' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
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
                                                    className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
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
                                                                    ? <i className="ph ph-check-circle text-purple-400 text-sm"></i>
                                                                    : r.available
                                                                        ? <i className="ph ph-circle text-green-400 text-sm"></i>
                                                                        : <i className="ph ph-x-circle text-gray-600 text-sm"></i>}
                                                                <span className="text-sm text-white">{r.domain}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                {r.available
                                                                    ? <span className="text-xs text-green-400">{r.price}/yr</span>
                                                                    : <span className="text-[10px] text-gray-600 uppercase tracking-widest">Taken</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {domainResults.length === 0 && !domainSearching && (
                                                <p className="text-[10px] text-gray-600 italic">Search to see available domains. We register it on your behalf and set up DNS.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Business email */}
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Business Email</p>
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        {[{ val: true, label: 'I have one', icon: 'ph-check' }, { val: false, label: 'Set one up', icon: 'ph-envelope' }].map(opt => (
                                            <button key={String(opt.val)} type="button" onClick={() => setHasBusinessEmail(opt.val)}
                                                className={`flex items-center gap-2 justify-center py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${hasBusinessEmail === opt.val ? 'border-purple-500/50 bg-purple-500/10 text-purple-200' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
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
                                                        <p className="text-sm font-bold text-white">Google Workspace</p>
                                                        <p className="text-[10px] text-gray-500">Professional email, Drive, Meet, and more</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {[
                                                        { id: 'business_starter', label: 'Business Starter', price: '$6/user/mo', desc: '30 GB Drive, Meet, Chat' },
                                                        { id: 'business_standard', label: 'Business Standard', price: '$12/user/mo', desc: '2 TB Drive, recordings' },
                                                    ].map(plan => (
                                                        <div key={plan.id} onClick={() => setWorkspacePlan(plan.id)}
                                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${workspacePlan === plan.id ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 hover:border-white/20'}`}>
                                                            <p className="text-xs font-bold text-white mb-0.5">{plan.label}</p>
                                                            <p className="text-[10px] text-blue-300 mb-1">{plan.price}</p>
                                                            <p className="text-[10px] text-gray-500">{plan.desc}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <label className="text-[10px] uppercase tracking-widest text-gray-500 whitespace-nowrap">Seats</label>
                                                    <div className="flex items-center gap-2">
                                                        <button type="button" onClick={() => setWorkspaceSeats(s => Math.max(1, s - 1))} className="w-7 h-7 border border-white/10 rounded text-gray-300 hover:border-white/30 transition-all text-sm">−</button>
                                                        <span className="text-sm text-white w-6 text-center">{workspaceSeats}</span>
                                                        <button type="button" onClick={() => setWorkspaceSeats(s => Math.min(50, s + 1))} className="w-7 h-7 border border-white/10 rounded text-gray-300 hover:border-white/30 transition-all text-sm">+</button>
                                                    </div>
                                                    <span className="text-[10px] text-gray-500 ml-2">
                                                        ≈ {workspacePlan === 'business_starter' ? `$${6 * workspaceSeats}` : `$${12 * workspaceSeats}`}/mo
                                                    </span>
                                                </div>
                                                <p className="text-[9px] text-gray-600 leading-relaxed">We set up the workspace, configure your domain's MX records, and deliver login credentials. Billed directly through Onboardin.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setStep(2)} className="py-4 px-4 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-all">← Back</button>
                                    <button type="button" onClick={handleStep3} className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all">Continue</button>
                                </div>
                                <button type="button" onClick={() => setStep(4)} className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors">Decide later</button>
                            </div>
                        )}

                        {/* Step 4: Entity recommendation */}
                        {step === 4 && (
                            <form onSubmit={handleStep4} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Recommended structure</p>
                                    {!entityOverride ? (
                                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-base font-bold text-white">{recommendation.entity}</span>
                                                <span className="text-[9px] uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full">Recommended</span>
                                            </div>
                                            <p className="text-xs text-gray-400 leading-relaxed">{recommendation.reason}</p>
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
                                    <button type="button" onClick={() => { setEntityOverride(v => !v); setEntityType(''); }} className="mt-3 text-[9px] uppercase tracking-widest text-gray-500 hover:text-purple-300 transition-colors">
                                        {entityOverride ? '← Use recommendation' : 'I know what I need →'}
                                    </button>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setStep(3)} className="py-4 px-4 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-all">← Back</button>
                                    <button type="submit" className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all">Continue</button>
                                </div>
                                <button type="button" onClick={() => setStep(5)} className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors">Decide later</button>
                            </form>
                        )}

                        {/* Step 5 — Password */}
                        {step === 5 && (
                            <form onSubmit={handleCreateAccount} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
                                <div className="group"><label className={labelClass}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className={inputClass} placeholder="••••••••••••" /></div>
                                <div className="group"><label className={labelClass}>Confirm Password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={inputClass} placeholder="••••••••••••" /></div>
                                {error && <p className="text-red-400 text-[11px] uppercase tracking-widest">{error}</p>}
                                <button type="submit" disabled={loading} className="w-full py-4 mt-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-40">
                                    {loading ? 'Creating Account…' : 'Create Account'}
                                </button>
                                <button type="button" onClick={() => { setStep(4); setError(''); }} className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors">← Back</button>
                            </form>
                        )}
                    </>
                )}

                <div className="mt-8 text-center">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors cursor-pointer" onClick={() => setCurrentView('dashboard')}>
                        Already have access? Sign in
                    </p>
                </div>
            </div>
        </div>
    );
};

// Dashboard — protected client console
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
    // Phase A — admin filters
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
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [myDocs, setMyDocs] = useState([]);
    const [myMessages, setMyMessages] = useState([]);
    const [myDocsLoading, setMyDocsLoading] = useState(false);
    const [myMessagesLoading, setMyMessagesLoading] = useState(false);
    const [clientMessageInput, setClientMessageInput] = useState('');
    const [sendingClientMessage, setSendingClientMessage] = useState(false);
    const [clientUploading, setClientUploading] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutError, setCheckoutError] = useState('');
    // Formation assistant
    const [agentQuestion, setAgentQuestion] = useState('');
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentAnswer, setAgentAnswer] = useState('');
    const [agentError, setAgentError] = useState('');
    // Jurisdiction-tailored blueprint (starter questions + required docs)
    const [blueprint, setBlueprint] = useState(null);
    // Capital readiness — partner intro request state
    const [capitalRequestSent, setCapitalRequestSent] = useState(false);
    const [capitalRequesting, setCapitalRequesting] = useState(false);
    // Jurisdiction setup (for clients who skipped step 2/3 during signup)
    const [showJurisdictionSetup, setShowJurisdictionSetup] = useState(false);
    const [setupCountry, setSetupCountry] = useState('United States');
    const [setupJurisdiction, setSetupJurisdiction] = useState('');
    const [setupIntent, setSetupIntent] = useState('');
    const [setupSellsTo, setSetupSellsTo] = useState('');
    const [setupEntity, setSetupEntity] = useState('');
    const [setupEntityOverride, setSetupEntityOverride] = useState(false);
    const [savingSetup, setSavingSetup] = useState(false);
    const [adminInternalNotes, setAdminInternalNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [deliverableStep, setDeliverableStep] = useState('');
    const fileInputRef = React.useRef(null);

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
                    
                    // Trigger first welcome message if it's a new client and no messages yet
                    if (!data.is_admin) {
                        supabase.from('messages').select('id').eq('client_id', session.user.id).limit(1)
                            .then(({ data: msgs }) => {
                                if (!msgs || msgs.length === 0) {
                                    handleAgentQuestion(null, true);
                                }
                            });
                    }

                    if (data?.is_admin) {
                        setAdminLoading(true);
                        supabase
                            .from('clients')
                            .select('*')
                            .order('created_at', { ascending: false })
                            .then(({ data: clients }) => {
                                setAdminLoading(false);
                                setAllClients(clients || []);
                            });
                    }
                }
            });
    }, [session]);

    useEffect(() => {
        if (!session || !supabase || clientProfile?.is_admin) return;
        // Update client last read when profile is loaded
        supabase.from('clients').update({ client_last_read_at: new Date().toISOString() }).eq('id', session.user.id).then(() => {
            setUnreadCount(0);
        });
    }, [session, clientProfile]);

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

    // Fetch jurisdiction-tailored blueprint (starter questions + doc checklist) once the profile is loaded
    useEffect(() => {
        if (!session || !supabase || !clientProfile || clientProfile.is_admin) return;
        if (!clientProfile.country && !clientProfile.entity_type) return; // need at least one signal
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
                if (!cancelled && json.starter_questions) setBlueprint(json);
            } catch {
                // fail quietly — fallback questions live in the component
            }
        })();
        return () => { cancelled = true; };
    }, [session, clientProfile?.country, clientProfile?.entity_type, clientProfile?.funding_stage]);

    useEffect(() => {
        if (!session || !supabase || clientProfile?.is_admin) return;
        setMyDocsLoading(true);
        setMyMessagesLoading(true);
        supabase.from('documents').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false })
            .then(({ data }) => { setMyDocs(data || []); setMyDocsLoading(false); });
        supabase.from('messages').select('*').eq('client_id', session.user.id).order('created_at', { ascending: true })
            .then(({ data }) => {
                setMyMessages(data || []);
                setMyMessagesLoading(false);
                if (clientProfile && data) {
                    const unread = data.filter(m => m.is_admin_message && m.created_at > clientProfile.client_last_read_at).length;
                    setUnreadCount(unread);
                }
            });
    }, [session, clientProfile]);

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
        const { error } = await supabase.from('messages').insert({
            client_id: session.user.id,
            sender_id: session.user.id,
            body: clientMessageInput.trim(),
            is_admin_message: false,
        });
        if (!error) {
            setMyMessages(prev => [...prev, { sender_id: session.user.id, body: clientMessageInput.trim(), is_admin_message: false, created_at: new Date().toISOString() }]);
            setClientMessageInput('');
        }
        setSendingClientMessage(false);
    };

    const openClientDetail = async (client) => {
        setSelectedClient(client);
        setAdminInternalNotes(client.internal_notes || '');
        setDetailLoading(true);
        setClientDocs([]);
        setClientMessages([]);
        const [{ data: docs }, { data: msgs }] = await Promise.all([
            supabase.from('documents').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
            supabase.from('messages').select('*').eq('client_id', client.id).order('created_at', { ascending: true }),
            supabase.from('clients').update({ admin_last_read_at: new Date().toISOString() }).eq('id', client.id)
        ]);
        setClientDocs(docs || []);
        setClientMessages(msgs || []);
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
        const { error } = await supabase.from('messages').insert({
            client_id: selectedClient.id,
            sender_id: session.user.id,
            body: messageInput.trim(),
            is_admin_message: true,
        });
        if (!error) {
            setClientMessages(prev => [...prev, { sender_id: session.user.id, body: messageInput.trim(), is_admin_message: true, created_at: new Date().toISOString() }]);
            setMessageInput('');
        }
        setSendingMessage(false);
    };

    const handleAdminUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !supabase || !selectedClient) return;
        setUploadingDoc(true);
        const path = `${selectedClient.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file);
        if (!uploadError) {
            const { error: dbError } = await supabase.from('documents').insert({
                client_id: selectedClient.id,
                name: file.name,
                path,
                size: file.size,
                uploaded_by: session.user.id,
                step_index: deliverableStep !== '' ? parseInt(deliverableStep) : null
            });
            if (!dbError) {
                setClientDocs(prev => [{ name: file.name, path, size: file.size, step_index: deliverableStep !== '' ? parseInt(deliverableStep) : null, created_at: new Date().toISOString() }, ...prev]);
                setDeliverableStep('');
            }
        }
        setUploadingDoc(false);
        e.target.value = '';
    };

    const handleAgentQuestion = async (e, isWelcome = false) => {
        if (e) e.preventDefault();
        if (!agentQuestion.trim() && !isWelcome) return;
        if (!supabase || !session) return;

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

    const handleUpgrade = async () => {
        if (!supabase || !session) return;
        setCheckoutLoading(true);
        setCheckoutError('');
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
            } else {
                setCheckoutError('Could not start checkout. Try again shortly.');
            }
        } catch {
            setCheckoutError('Could not start checkout. Try again shortly.');
        }
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
        { label: 'Account created', icon: 'ph-user-circle' },
        { label: 'Entity formation', icon: 'ph-buildings' },
        { label: 'Landing page deployed', icon: 'ph-globe' },
        { label: 'GitHub repo provisioned', icon: 'ph-github-logo' },
        { label: 'CRM connected', icon: 'ph-address-book' },
        { label: 'Analytics live', icon: 'ph-chart-line' },
        { label: 'First AI agent deployed', icon: 'ph-robot' },
    ];
    const currentStep = clientProfile?.onboarding_step ?? 0;

    const handleAdvanceStep = async (clientId, currentStep) => {
        if (currentStep >= 7 || !supabase) return;
        setAdvancingId(clientId);
        const { error } = await supabase
            .from('clients')
            .update({ onboarding_step: currentStep + 1, updated_at: new Date().toISOString() })
            .eq('id', clientId);
        if (!error) {
            setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, onboarding_step: currentStep + 1 } : c));
        }
        setAdvancingId(null);
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
        }
        setUpdatingLifecycleId(null);
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

    const stepLabels = ['Account created','Entity formation','Landing page deployed','GitHub repo provisioned','CRM connected','Analytics live','First AI agent deployed'];

    if (session && clientProfile?.is_admin) {
        return (
            <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] min-h-screen relative z-10">
                <div className="max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-12">
                        <div>
                            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter">Admin Console</h1>
                            <p className="text-xs text-gray-500 uppercase tracking-[0.3em] mt-1">{session.user.email}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] uppercase tracking-[0.3em] text-green-400 border border-green-400/20 px-4 py-2 rounded-full bg-green-400/5">{allClients.filter(c => !c.is_admin).length} Clients</span>
                            <button onClick={handleSignOut} className="px-6 py-2 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-400 hover:text-white hover:border-white/30 transition-all">Sign Out</button>
                        </div>
                    </div>

                    {deleteError && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-200">
                            {deleteError}
                        </div>
                    )}

                    {/* Phase A — Action queue: clients waiting on admin attention */}
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
                        const capitalReq = nonAdmin.filter(c => c.last_message_at > c.admin_last_read_at);
                        const total = unread.length + stale.length;
                        if (total === 0 || adminLoading) return null;
                        return (
                            <div className="mb-6 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-5 backdrop-blur-xl">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center">
                                            <i className="ph ph-bell text-purple-300 text-sm"></i>
                                        </div>
                                        <div>
                                            <h3 className="text-[10px] uppercase tracking-widest text-purple-200">Needs your attention</h3>
                                            <p className="text-xs text-gray-400 mt-0.5">{total} item{total !== 1 ? 's' : ''} across {Math.max(unread.length, stale.length)} client{nonAdmin.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {unread.length > 0 && (
                                        <div className="bg-black/30 rounded-xl p-3">
                                            <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-2">Unread messages · {unread.length}</p>
                                            <div className="space-y-1">
                                                {unread.slice(0, 3).map(c => (
                                                    <button key={c.id} onClick={() => openClientDetail(c)} className="block w-full text-left text-xs text-gray-300 hover:text-white transition-colors">→ {c.company_name}</button>
                                                ))}
                                                {unread.length > 3 && <p className="text-[10px] text-gray-600">+ {unread.length - 3} more</p>}
                                            </div>
                                        </div>
                                    )}
                                    {stale.length > 0 && (
                                        <div className="bg-black/30 rounded-xl p-3">
                                            <p className="text-[9px] uppercase tracking-widest text-yellow-300 mb-2">Stale &gt; 7 days · {stale.length}</p>
                                            <div className="space-y-1">
                                                {stale.slice(0, 3).map(c => (
                                                    <button key={c.id} onClick={() => openClientDetail(c)} className="block w-full text-left text-xs text-gray-300 hover:text-white transition-colors">→ {c.company_name} <span className="text-gray-600">· step {c.onboarding_step}</span></button>
                                                ))}
                                                {stale.length > 3 && <p className="text-[10px] text-gray-600">+ {stale.length - 3} more</p>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Phase A — Filter bar */}
                    {!adminLoading && (
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                            <div className="flex-1 min-w-[200px] relative">
                                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"></i>
                                <input
                                    type="text"
                                    value={adminSearch}
                                    onChange={e => setAdminSearch(e.target.value)}
                                    placeholder="Search company, founder, email…"
                                    className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all"
                                />
                            </div>
                            <select value={adminPlanFilter} onChange={e => setAdminPlanFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500/50">
                                <option value="all">All plans</option>
                                <option value="starter">Starter</option>
                                <option value="growth">Growth</option>
                                <option value="past_due">Past Due</option>
                            </select>
                            <select value={adminLifecycleFilter} onChange={e => setAdminLifecycleFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500/50">
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
                    ) : (
                        <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
                            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_2fr_1fr_auto_auto] gap-0 px-6 py-3 border-b border-white/5">
                                {['Company','Founder','Stage','Plan','Lifecycle','Credits','Progress','Joined','',''].map((h, i) => (
                                    <span key={i} className="text-[10px] uppercase tracking-widest text-gray-500">{h}</span>
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
                                    return <div className="px-6 py-12 text-center text-gray-600 text-sm">{allClients.filter(c => !c.is_admin).length === 0 ? 'No clients yet.' : 'No clients match these filters.'}</div>;
                                }
                                return filtered.map((client, i) => {
                                    const step = client.onboarding_step ?? 0;
                                    const pct = Math.round((step / 7) * 100);
                                    const joined = new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                    const isComplete = step >= 7;
                                    const isAdvancing = advancingId === client.id;
                                    const hasUnread = client.last_message_at > client.admin_last_read_at;

                                    return (
                                        <div key={client.id} onClick={() => openClientDetail(client)} className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_2fr_1fr_auto_auto] gap-0 px-6 py-4 items-center cursor-pointer ${i % 2 === 0 ? '' : 'bg-white/[0.02]'} hover:bg-white/5 transition-colors ${selectedClient?.id === client.id ? 'bg-purple-500/5 border-l-2 border-purple-500/50' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                {hasUnread && <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse flex-shrink-0" title="New Message"></div>}
                                                <div>
                                                    <p className="text-sm font-medium text-white">{client.company_name}</p>
                                                    <p className="text-[10px] text-gray-500">{client.email}</p>
                                                </div>
                                            </div>
                                            <span className="text-sm text-gray-300">{client.founder_name}</span>
                                            <span className="text-[9px] uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full w-fit">{client.funding_stage || '—'}</span>
                                            {(() => {
                                                const p = client.plan ?? 'starter';
                                                if (p === 'growth') return <span className="text-[9px] uppercase tracking-widest text-green-300 bg-green-400/10 px-2 py-1 rounded-full w-fit">Growth</span>;
                                                if (p === 'past_due') return <span className="text-[9px] uppercase tracking-widest text-red-300 bg-red-400/10 px-2 py-1 rounded-full w-fit">Past Due</span>;
                                                return <span className="text-[9px] uppercase tracking-widest text-gray-500 bg-white/5 px-2 py-1 rounded-full w-fit">Free</span>;
                                            })()}
                                            {(() => {
                                                const lc = client.lifecycle ?? 'onboarding';
                                                const palette = lc === 'active' ? 'text-green-300 bg-green-400/10' : lc === 'paused' ? 'text-yellow-300 bg-yellow-400/10' : lc === 'churned' ? 'text-red-300 bg-red-400/10' : lc === 'archived' ? 'text-gray-500 bg-white/5' : 'text-blue-300 bg-blue-400/10';
                                                return <span className={`text-[9px] uppercase tracking-widest px-2 py-1 rounded-full w-fit ${palette}`}>{lc}</span>;
                                            })()}
                                            <span className="text-xs text-gray-400">{client.daily_ai_credits}</span>
                                            <div className="pr-4">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] text-gray-500">{isComplete ? 'Complete' : stepLabels[step]}</span>
                                                    <span className="text-[10px] text-gray-500">{pct}%</span>
                                                </div>
                                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-500">{joined}</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleAdvanceStep(client.id, step); }}
                                                disabled={isComplete || isAdvancing}
                                                className="ml-4 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-lg border transition-all disabled:opacity-20 disabled:cursor-not-allowed border-purple-500/30 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400/50"
                                                title={isComplete ? 'All steps complete' : `Advance to: ${stepLabels[step + 1] || 'Complete'}`}
                                            >
                                                {isAdvancing ? '…' : isComplete ? '✓' : 'Advance'}
                                            </button>
                                            {armedDeleteId === client.id ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteUser(client.id); }}
                                                    disabled={deletingId === client.id}
                                                    className="ml-2 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-lg border border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-all disabled:opacity-40"
                                                    title="Confirm permanent delete"
                                                >
                                                    {deletingId === client.id ? '…' : 'Confirm'}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setArmedDeleteId(client.id); setDeleteError(''); }}
                                                    className="ml-2 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-lg border border-white/10 text-gray-500 hover:border-red-500/40 hover:text-red-300 transition-all"
                                                    title="Delete this client account"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    )}

                    {/* Client detail panel */}
                    {selectedClient && (
                        <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden animate-[fadeIn_0.3s_ease-out]">
                            <div className="px-6 py-4 bg-white/[0.03] border-b border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4 relative">
                                <div className="absolute top-4 right-6 flex items-center gap-3">
                                    <div className="flex flex-col items-end">
                                        <span className={`text-[8px] uppercase tracking-widest ${selectedClient.share_ai_data ? 'text-green-400' : 'text-gray-500'}`}>
                                            {selectedClient.share_ai_data ? 'AI Chat: Shared' : 'AI Chat: Private'}
                                        </span>
                                        <span className="text-[9px] text-gray-600">{selectedClient.daily_ai_credits} credits</span>
                                    </div>
                                    <button onClick={handleBoostCredits} className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-[9px] font-bold uppercase tracking-widest text-blue-300 hover:bg-blue-500/20 transition-all">
                                        Boost
                                    </button>
                                    <button onClick={() => setSelectedClient(null)} className="text-gray-500 hover:text-white transition-colors ml-2">
                                        <i className="ph ph-x text-lg"></i>
                                    </button>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500">Founder</p>
                                    <p className="text-xs text-gray-300">{selectedClient.founder_name}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500">Jurisdiction</p>
                                    <p className="text-xs text-gray-300">{selectedClient.jurisdiction || selectedClient.country || 'Not set'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500">Entity Type</p>
                                    <p className="text-xs text-purple-300">{selectedClient.entity_type || 'Not set'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500">Funding Stage</p>
                                    <p className="text-xs text-purple-300">{selectedClient.funding_stage || 'Not set'}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500">Business Intent</p>
                                    <p className="text-xs text-gray-300 leading-relaxed truncate" title={selectedClient.business_intent}>{selectedClient.business_intent || 'No intent provided'}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500">Target Market</p>
                                    <p className="text-xs text-gray-300">{selectedClient.sells_to || 'Not provided'}</p>
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
                                            <h4 className="text-[10px] uppercase tracking-widest text-gray-500">Internal Notes</h4>
                                            {adminInternalNotes !== selectedClient.internal_notes && (
                                                <button onClick={handleUpdateInternalNotes} disabled={savingNotes} className="text-[9px] uppercase tracking-widest text-blue-400 hover:text-blue-300">
                                                    {savingNotes ? 'Saving…' : 'Save'}
                                                </button>
                                            )}
                                        </div>
                                        <textarea
                                            value={adminInternalNotes}
                                            onChange={e => setAdminInternalNotes(e.target.value)}
                                            placeholder="Private admin notes (not visible to client)…"
                                            className="flex-1 min-h-[120px] bg-black/20 border border-white/5 rounded-xl p-4 text-xs text-gray-400 focus:outline-none focus:border-white/10 transition-all resize-none leading-relaxed"
                                        />
                                    </div>

                                    {/* Documents */}
                                    <div className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[10px] uppercase tracking-widest text-gray-500">Documents</h4>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={deliverableStep}
                                                    onChange={e => setDeliverableStep(e.target.value)}
                                                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[9px] uppercase tracking-widest text-gray-400 focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
                                                >
                                                    <option value="">General</option>
                                                    {stepLabels.map((label, idx) => (
                                                        <option key={idx} value={idx}>Step {idx + 1}: {label}</option>
                                                    ))}
                                                </select>
                                                <label className="cursor-pointer text-[9px] uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-1 rounded-lg hover:bg-purple-500/10 transition-all">
                                                    {uploadingDoc ? '…' : '+ Upload'}
                                                    <input type="file" className="hidden" onChange={handleAdminUpload} disabled={uploadingDoc} />
                                                </label>
                                            </div>
                                        </div>
                                        {clientDocs.length === 0 ? (
                                            <p className="text-xs text-gray-600 italic">No documents yet.</p>
                                        ) : (
                                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                {clientDocs.map((doc, i) => (
                                                    <div key={i} onClick={() => getSignedUrl(doc.path)} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-all group">
                                                        <i className="ph ph-file text-gray-400 group-hover:text-blue-400 transition-colors flex-shrink-0"></i>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-gray-300 truncate">{doc.name}</p>
                                                            {doc.step_index !== null && (
                                                                <p className="text-[9px] text-blue-400/60 uppercase tracking-widest mt-0.5">Deliverable: {stepLabels[doc.step_index]}</p>
                                                            )}
                                                        </div>
                                                        <i className="ph ph-download-simple text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0"></i>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Messages */}
                                    <div className="p-6 flex flex-col">
                                        <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Messages</h4>
                                        <div className="flex-1 space-y-3 max-h-64 overflow-y-auto mb-4 pr-1">
                                            {clientMessages.length === 0 ? (
                                                <p className="text-xs text-gray-600 italic">No messages yet.</p>
                                            ) : (
                                                clientMessages.map((msg, i) => (
                                                    <div key={i} className={`flex ${msg.is_admin_message ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${msg.is_admin_message ? 'bg-purple-500/20 text-purple-100' : 'bg-white/5 text-gray-300'}`}>
                                                            {msg.body}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <form onSubmit={handleAdminMessage} className="flex gap-2">
                                            <input
                                                type="text"
                                                value={messageInput}
                                                onChange={e => setMessageInput(e.target.value)}
                                                placeholder="Send a note…"
                                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-all"
                                            />
                                            <button type="submit" disabled={sendingMessage || !messageInput.trim()} className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                                {sendingMessage ? '…' : 'Send'}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* Phase A — Lifecycle + onboarding step controls */}
                            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 mb-2">Lifecycle</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['onboarding','active','paused','churned','archived'].map(lc => {
                                            const active = (selectedClient.lifecycle ?? 'onboarding') === lc;
                                            return (
                                                <button
                                                    key={lc}
                                                    onClick={() => handleLifecycleChange(selectedClient.id, lc)}
                                                    disabled={updatingLifecycleId === selectedClient.id}
                                                    className={`text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all disabled:opacity-40 ${active ? 'bg-purple-500/20 border-purple-500/40 text-purple-200' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}
                                                >
                                                    {lc}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 mb-2">Onboarding Step</p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleRollbackStep(selectedClient.id, selectedClient.onboarding_step ?? 0)}
                                            disabled={(selectedClient.onboarding_step ?? 0) <= 0}
                                            className="text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:border-yellow-500/40 hover:text-yellow-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                            title="Roll back one step (e.g. if a filing was rejected)"
                                        >
                                            ← Rollback
                                        </button>
                                        <span className="text-xs text-gray-400">Step {selectedClient.onboarding_step ?? 0} of 7 · {stepLabels[selectedClient.onboarding_step ?? 0] || 'Complete'}</span>
                                    </div>
                                </div>
                            </div>

                            {/*-- scaf --
                              Recurring Obligations : see migrations/_scaffold_recurring_obligations.sql
                              Implement when client.lifecycle === 'active'. Query public.obligations for this client.
                              Show upcoming/due/overdue with due_at; allow admin to mark filed + attach proof.
                            */}
                            {(selectedClient.lifecycle ?? 'onboarding') === 'active' && (
                                <div className="px-6 py-4 border-t border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[9px] uppercase tracking-widest text-gray-500">Recurring Obligations</p>
                                        <span className="text-[8px] uppercase tracking-widest text-purple-400/60 border border-purple-500/20 px-2 py-0.5 rounded-full">Scaffold</span>
                                    </div>
                                    <p className="text-xs text-gray-600 italic">Annual report, franchise tax, BOI/CTA, registered agent renewal tracking will appear here once obligations are seeded for this client's jurisdiction.</p>
                                </div>
                            )}

                            {/*-- scaf --
                              Audit Log : see migrations/_scaffold_audit_log.sql
                              Query public.audit_log where client_id = selectedClient.id order by created_at desc.
                              Show actor email + action + payload diff. Paginate at 25.
                            */}
                            <div className="px-6 py-4 border-t border-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500">Audit Log</p>
                                    <span className="text-[8px] uppercase tracking-widest text-purple-400/60 border border-purple-500/20 px-2 py-0.5 rounded-full">Scaffold</span>
                                </div>
                                <p className="text-xs text-gray-600 italic">Per-client change history (step advances, rollbacks, lifecycle changes, document uploads, admin notes) will appear here once the audit_log table is enabled.</p>
                            </div>

                            {/*-- scaf --
                              Message Templates : see migrations/_scaffold_message_templates.sql
                              Dropdown above the message composer; selecting fills the textarea with body,
                              substituting (founder_name), (company_name), (jurisdiction), (entity_type).
                            */}
                            {/*-- scaf --
                              AI-Suggested Admin Reply
                              Button next to Send. Calls a new edge function 'admin-reply-suggest' with the last N
                              messages + client profile. Returns a draft for admin to edit before sending.
                            */}
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
            <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] min-h-screen relative z-10">
                <div className="max-w-4xl mx-auto space-y-4">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            {profileLoading ? (
                                <div className="w-48 h-8 bg-white/5 rounded animate-pulse mb-2"></div>
                            ) : (
                                <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter">
                                    {clientProfile?.company_name || 'Console'}
                                </h1>
                            )}
                            <p className="text-xs text-gray-500 uppercase tracking-[0.3em] mt-1">{session.user.email}</p>
                        </div>
                        <button onClick={handleSignOut} className="px-6 py-2 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-400 hover:text-white hover:border-white/30 transition-all">
                            Sign Out
                        </button>
                    </div>

                    {/* Quick setup banner — shown when jurisdiction/entity not yet set */}
                    {!profileLoading && clientProfile && !clientProfile.jurisdiction && !clientProfile.entity_type && !showJurisdictionSetup && (
                        <div className="mb-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-purple-500/20 rounded-2xl p-5 flex items-center justify-between gap-4 animate-[fadeIn_0.4s_ease-out]">
                            <div className="flex items-center gap-4">
                                <div className="w-9 h-9 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                    <i className="ph ph-rocket-launch text-purple-300 text-lg"></i>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">Finish setting up your account</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Add your location, entity type, and domain to unlock your full onboarding plan.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowJurisdictionSetup(true)}
                                className="flex-shrink-0 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-purple-200 hover:bg-purple-500/30 transition-all"
                            >
                                Quick Setup →
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Client Profile card */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                            <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Client Profile</h3>
                            {profileLoading ? (
                                <div className="space-y-3">
                                    <div className="w-full h-4 bg-white/5 rounded animate-pulse"></div>
                                    <div className="w-3/4 h-4 bg-white/5 rounded animate-pulse"></div>
                                    <div className="w-1/2 h-4 bg-white/5 rounded animate-pulse"></div>
                                </div>
                            ) : profileError || !clientProfile ? (
                                <p className="text-xs text-gray-500 italic">Profile data unavailable.</p>
                            ) : (
                                <div className="space-y-3">
                                    {clientProfile.founder_name && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] uppercase tracking-widest text-gray-500">Founder</span>
                                            <span className="text-sm text-gray-200">{clientProfile.founder_name}</span>
                                        </div>
                                    )}
                                    {clientProfile.funding_stage && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] uppercase tracking-widest text-gray-500">Stage</span>
                                            <span className="text-[9px] uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full">{clientProfile.funding_stage}</span>
                                        </div>
                                    )}
                                    {clientProfile.status && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] uppercase tracking-widest text-gray-500">Status</span>
                                            <span className="text-[9px] uppercase tracking-widest text-blue-300 bg-blue-400/10 px-2 py-1 rounded-full">{clientProfile.status}</span>
                                        </div>
                                    )}
                                    {memberSince && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] uppercase tracking-widest text-gray-500">Member Since</span>
                                            <span className="text-xs text-gray-400">{memberSince}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Onboarding Checklist card */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] uppercase tracking-widest text-gray-500">Onboarding Progress</h3>
                                <span className="text-[10px] uppercase tracking-widest text-purple-300">{currentStep} / {onboardingSteps.length}</span>
                            </div>
                            <div className="w-full h-1 bg-white/5 rounded-full mb-5 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-700"
                                    style={{ width: `${(currentStep / onboardingSteps.length) * 100}%` }}
                                />
                            </div>
                            <div className="space-y-3">
                                {onboardingSteps.map((step, i) => {
                                    const done = i < currentStep;
                                    const active = i === currentStep;
                                    const stepDeliverable = myDocs.find(d => d.step_index === i);
                                    return (
                                        <div key={i} className="flex flex-col gap-1">
                                            <div className="flex items-center gap-3">
                                                {done ? (
                                                    <i className="ph ph-check-circle text-green-400 text-base flex-shrink-0"></i>
                                                ) : active ? (
                                                    <i className={`ph ${step.icon} text-purple-400 text-base flex-shrink-0`}></i>
                                                ) : (
                                                    <i className="ph ph-circle text-gray-700 text-base flex-shrink-0"></i>
                                                )}
                                                <span className={`text-sm ${done ? 'text-gray-200' : active ? 'text-purple-200' : 'text-gray-600'}`}>{step.label}</span>
                                                {active && <span className="ml-auto text-[9px] uppercase tracking-widest text-purple-400 border border-purple-400/20 px-2 py-0.5 rounded-full">In Progress</span>}
                                            </div>
                                            {stepDeliverable && (
                                                <div onClick={() => getSignedUrl(stepDeliverable.path)} className="ml-7 flex items-center gap-2 py-1 px-2 bg-blue-500/10 border border-blue-500/20 rounded-lg cursor-pointer hover:bg-blue-500/20 transition-all group w-fit">
                                                    <i className="ph ph-file-arrow-down text-blue-400 text-[10px]"></i>
                                                    <span className="text-[9px] uppercase tracking-widest text-blue-300 group-hover:text-blue-200">Download Deliverable</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Formation Assistant */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                    <i className="ph ph-robot text-purple-300 text-sm"></i>
                                </div>
                                <div>
                                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500">Formation Assistant</h3>
                                    <p className="text-[10px] text-gray-600 mt-0.5">Bespoke advice for {clientProfile?.company_name}</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className="text-[9px] uppercase tracking-widest text-gray-500">{clientProfile?.daily_ai_credits ?? 0} Credits remaining</span>
                                <div className="flex items-center gap-2 cursor-pointer group" onClick={handleTogglePrivacy}>
                                    <span className="text-[8px] uppercase tracking-widest text-gray-600 group-hover:text-gray-400 transition-colors">{clientProfile?.share_ai_data ? 'AI Data shared with team' : 'AI Data private'}</span>
                                    <div className={`w-6 h-3 rounded-full relative transition-colors ${clientProfile?.share_ai_data ? 'bg-purple-500/40' : 'bg-white/10'}`}>
                                        <div className={`absolute top-0.5 w-2 h-2 rounded-full transition-all ${clientProfile?.share_ai_data ? 'right-0.5 bg-purple-300' : 'left-0.5 bg-gray-500'}`} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {agentAnswer && (
                            <div className="mb-4 bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap animate-[fadeIn_0.4s_ease-out] relative">
                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.5)]" title="AI Generated"></div>
                                {agentAnswer}
                            </div>
                        )}
                        {agentError && (
                            <p className="mb-3 text-[10px] uppercase tracking-widest text-red-400">{agentError}</p>
                        )}

                        <div className="flex flex-wrap gap-2 mb-4">
                            {(blueprint?.starter_questions?.length ? blueprint.starter_questions : [
                                'What entity type should I form?',
                                'What are my first filing steps?',
                                'Do I need a tax ID before opening a bank account?',
                                'What documents do I need to collect first?',
                            ]).map(q => (
                                <button key={q} type="button"
                                    onClick={() => setAgentQuestion(q)}
                                    className="text-[9px] uppercase tracking-widest border border-white/10 text-gray-500 px-2.5 py-1.5 rounded-lg hover:border-purple-500/30 hover:text-purple-300 transition-all">
                                    {q}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleAgentQuestion} className="flex gap-2">
                            <input
                                type="text"
                                value={agentQuestion}
                                onChange={e => setAgentQuestion(e.target.value)}
                                placeholder="Ask about entity formation, filings, or your structure."
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-all"
                                disabled={agentLoading}
                            />
                            <button type="submit" disabled={agentLoading || !agentQuestion.trim()}
                                className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                {agentLoading ? '…' : 'Ask'}
                            </button>
                        </form>
                    </div>

                    {/* Documents: categorized by entity + jurisdiction */}
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
                        const categories = [...baseCategories, ...aiExtras];
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
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500">Documents</h3>
                                        {hasJurisdiction && (
                                            <p className="text-[10px] text-gray-600 mt-0.5">
                                                {entityType} : {jurisdiction || country}
                                                <button onClick={() => setShowJurisdictionSetup(true)} className="ml-2 text-purple-400 hover:text-purple-300 transition-colors">edit</button>
                                            </p>
                                        )}
                                    </div>
                                    {allRequiredFilled && (
                                        <span className="text-[9px] uppercase tracking-widest text-green-300 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full">Ready</span>
                                    )}
                                </div>

                                {/* Jurisdiction setup prompt */}
                                {!hasJurisdiction && !showJurisdictionSetup && (
                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
                                        <p className="text-xs text-gray-300 leading-relaxed">Tell us where you're building and what kind of business. We'll show you exactly what documents you need.</p>
                                        <button onClick={() => setShowJurisdictionSetup(true)} className="text-[9px] uppercase tracking-widest text-blue-300 border border-blue-500/30 px-3 py-2 rounded-lg hover:bg-blue-500/10 transition-all">Set Up →</button>
                                    </div>
                                )}

                                {/* Inline jurisdiction setup form */}
                                {showJurisdictionSetup && (
                                    <form onSubmit={handleSaveJurisdiction} className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-4 animate-[fadeIn_0.3s_ease-out]">
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Country / Region</label>
                                            <select value={setupCountry} onChange={e => { setSetupCountry(e.target.value); setSetupJurisdiction(''); }} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                                                {Object.keys(REGIONS).map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">{setupCountry === 'United States' ? 'State' : setupCountry === 'Canada' ? 'Province' : 'Country'}</label>
                                            <select value={setupJurisdiction} onChange={e => setSetupJurisdiction(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                                                <option value="">Select…</option>
                                                {(REGIONS[setupCountry] || []).map(j => <option key={j} value={j}>{j}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">What are you building?</label>
                                            <input type="text" value={setupIntent} onChange={e => setSetupIntent(e.target.value)} placeholder="e.g. SaaS platform for HR teams" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Who do you sell to?</label>
                                            <select value={setupSellsTo} onChange={e => setSetupSellsTo(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
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
                                                    <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Entity Type</label>
                                                    {!setupEntityOverride ? (
                                                        <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                                                            <span className="text-sm text-white">{rec.entity} <span className="text-[9px] text-purple-400 ml-1">recommended</span></span>
                                                            <button type="button" onClick={() => setSetupEntityOverride(true)} className="text-[9px] uppercase tracking-widest text-gray-500 hover:text-purple-300 transition-colors">Change</button>
                                                        </div>
                                                    ) : (
                                                        <select value={setupEntity} onChange={e => setSetupEntity(e.target.value)} required className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                                                            <option value="">Select…</option>
                                                            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        <div className="flex gap-2 pt-1">
                                            <button type="button" onClick={() => setShowJurisdictionSetup(false)} className="py-2 px-3 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-all">Cancel</button>
                                            <button type="submit" disabled={savingSetup} className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40">{savingSetup ? 'Saving…' : 'Save'}</button>
                                        </div>
                                    </form>
                                )}

                                {/* Document category columns */}
                                {hasJurisdiction && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {categories.map(cat => {
                                            const catDocs = docsByCategory[cat.id] || [];
                                            return (
                                                <div key={cat.id} className={`border rounded-xl p-4 space-y-3 transition-all ${catDocs.length > 0 ? 'border-green-400/20 bg-green-400/5' : cat.required ? 'border-purple-500/20 bg-purple-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <i className={`ph ${cat.icon} text-base ${catDocs.length > 0 ? 'text-green-400' : cat.required ? 'text-purple-400' : 'text-gray-500'}`}></i>
                                                            <div>
                                                                <p className="text-xs font-bold text-white leading-tight">{cat.label}</p>
                                                                {cat.required && catDocs.length === 0 && <span className="text-[8px] uppercase tracking-widest text-purple-400">Required</span>}
                                                                {catDocs.length > 0 && <span className="text-[8px] uppercase tracking-widest text-green-400">{catDocs.length} file{catDocs.length > 1 ? 's' : ''}</span>}
                                                            </div>
                                                        </div>
                                                        <label className="cursor-pointer flex-shrink-0">
                                                            <i className={`ph ph-upload-simple text-sm transition-colors ${clientUploading ? 'text-gray-600' : 'text-gray-400 hover:text-purple-300'}`}></i>
                                                            <input type="file" className="hidden" disabled={clientUploading} onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file || !supabase) return;
                                                                setClientUploading(true);
                                                                const path = `${session.user.id}/${cat.id}/${Date.now()}-${file.name}`;
                                                                const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file);
                                                                if (!uploadError) {
                                                                    const { error: dbError } = await supabase.from('documents').insert({
                                                                        client_id: session.user.id,
                                                                        name: file.name,
                                                                        path,
                                                                        size: file.size,
                                                                        uploaded_by: session.user.id,
                                                                        category: cat.id,
                                                                    });
                                                                    if (!dbError) {
                                                                        setMyDocs(prev => [{ name: file.name, path, size: file.size, category: cat.id, created_at: new Date().toISOString() }, ...prev]);
                                                                    }
                                                                }
                                                                setClientUploading(false);
                                                                e.target.value = '';
                                                            }} />
                                                        </label>
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 leading-relaxed">{cat.desc}</p>
                                                    {catDocs.length > 0 && (
                                                        <div className="space-y-1.5">
                                                            {catDocs.map((doc, i) => (
                                                                <div key={i} onClick={() => getSignedUrl(doc.path)} className="flex items-center gap-2 p-2 bg-black/20 rounded-lg hover:bg-black/40 cursor-pointer transition-all group">
                                                                    <i className="ph ph-file text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0 text-xs"></i>
                                                                    <span className="text-[10px] text-gray-400 truncate flex-1 group-hover:text-gray-200">{doc.name}</span>
                                                                    <i className="ph ph-download-simple text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0 text-xs"></i>
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

                    {/* Messages */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Messages</h3>
                        <div className="space-y-3 max-h-48 overflow-y-auto mb-4 pr-1">
                            {myMessagesLoading ? (
                                <div className="w-full h-8 bg-white/5 rounded animate-pulse" />
                            ) : myMessages.length === 0 ? (
                                <p className="text-xs text-gray-600 italic">Your Onboardin team will message you here.</p>
                            ) : (
                                    myMessages.map((msg, i) => (
                                        <div key={i} className={`flex ${msg.is_admin_message ? 'justify-start' : 'justify-end'}`}>
                                            <div className="max-w-[80%] flex flex-col gap-1">
                                                <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed relative ${msg.is_admin_message ? 'bg-white/5 text-gray-300' : 'bg-purple-500/20 text-purple-100'}`}>
                                                    {msg.is_ai_generated && <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-green-400 rounded-full" title="AI Assistant"></div>}
                                                    {msg.body}
                                                </div>
                                                <p className={`text-[8px] uppercase tracking-widest text-gray-600 ${msg.is_admin_message ? 'text-left' : 'text-right'}`}>
                                                    {msg.is_admin_message ? (msg.is_ai_generated ? 'AI Assistant' : 'Onboardin Team') : 'You'}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                        <form onSubmit={handleClientMessage} className="flex gap-2">
                            <input
                                type="text"
                                value={clientMessageInput}
                                onChange={e => setClientMessageInput(e.target.value)}
                                placeholder="Send a message…"
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-all"
                            />
                            <button type="submit" disabled={sendingClientMessage || !clientMessageInput.trim()} className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                {sendingClientMessage ? '…' : 'Send'}
                            </button>
                        </form>
                    </div>

                    {/* Capital Readiness — Growth tier; Starter sees an upsell */}
                    {(() => {
                        const plan = clientProfile?.plan ?? 'starter';
                        const isPaid = plan === 'growth';

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
                                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500">Capital Readiness</h3>
                                        <span className="text-[9px] uppercase tracking-widest text-purple-300 bg-purple-400/10 border border-purple-400/20 px-2 py-1 rounded-full">Growth</span>
                                    </div>
                                    <p className="text-xs text-gray-400 leading-relaxed mb-4">Diagnose whether your business is ready to approach capital, and request introductions to vetted financing partners. Available on the Growth plan.</p>
                                    <button onClick={handleUpgrade} disabled={checkoutLoading} className="text-[10px] uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10 transition-all disabled:opacity-40">
                                        {checkoutLoading ? 'Redirecting…' : 'Upgrade to unlock →'}
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-5">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500">Capital Readiness</h3>
                                </div>
                                {/* Readiness Score */}
                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-gray-500">Your Readiness Score</p>
                                            <p className="text-3xl font-bold text-white mt-1">{score}<span className="text-base text-gray-500 font-normal">/100</span></p>
                                        </div>
                                        <span className={`text-[9px] uppercase tracking-widest border px-2 py-1 rounded-full ${statusColor}`}>{status}</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-500 ${score >= 80 ? 'bg-green-400' : score >= 60 ? 'bg-yellow-400' : 'bg-gray-500'}`} style={{ width: `${score}%` }} />
                                    </div>
                                    <ul className="space-y-1.5 pt-1">
                                        {checks.map((c, i) => (
                                            <li key={i} className="flex items-center gap-2 text-xs">
                                                <i className={`ph ${c.pass ? 'ph-check-circle text-green-400' : 'ph-circle-dashed text-gray-600'} text-sm flex-shrink-0`}></i>
                                                <span className={c.pass ? 'text-gray-300' : 'text-gray-500'}>{c.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                {/* Capital Partners — empty state */}
                                <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <i className="ph ph-handshake text-purple-300 text-sm"></i>
                                        <p className="text-[10px] uppercase tracking-widest text-gray-500">Capital Partners</p>
                                    </div>
                                    {capitalRequestSent ? (
                                        <div className="flex items-start gap-2 py-2">
                                            <i className="ph ph-check-circle text-green-400 text-base flex-shrink-0 mt-0.5"></i>
                                            <p className="text-xs text-gray-300 leading-relaxed">Request received. Our team will review your profile and message you with matched capital sources within 1–2 business days.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-xs text-gray-400 leading-relaxed mb-3">No direct partners are live in your region yet. While we build out integrations, our team can do a manual capital-source intro on request — matched to your stage, country, and business model.</p>
                                            <button
                                                onClick={handleRequestCapitalIntro}
                                                disabled={capitalRequesting || score < 60}
                                                className="text-[10px] uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                title={score < 60 ? 'Reach at least 60/100 readiness to request an intro' : 'Request a manual intro'}
                                            >
                                                {capitalRequesting ? 'Sending…' : 'Request capital intro'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Billing — last */}
                    {(() => {
                        const plan = clientProfile?.plan ?? 'starter';
                        const isPaid = plan === 'growth';
                        const isPastDue = plan === 'past_due';
                        return (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500">Billing</h3>
                                    {isPaid && <span className="text-[9px] uppercase tracking-widest text-green-300 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full">Growth — Active</span>}
                                    {isPastDue && <span className="text-[9px] uppercase tracking-widest text-red-300 bg-red-400/10 border border-red-400/20 px-2 py-1 rounded-full">Payment Failed</span>}
                                    {!isPaid && !isPastDue && <span className="text-[9px] uppercase tracking-widest text-gray-400 bg-white/5 border border-white/10 px-2 py-1 rounded-full">Starter — Free</span>}
                                </div>
                                {isPaid ? (
                                    <p className="text-xs text-gray-400 leading-relaxed">You're on the Growth plan. Full access to all features and priority support.</p>
                                ) : isPastDue ? (
                                    <div className="space-y-3">
                                        <p className="text-xs text-red-300 leading-relaxed">Your last payment failed. Update your payment method to restore access.</p>
                                        <button onClick={handleUpgrade} disabled={checkoutLoading} className="w-full py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-[10px] font-bold uppercase tracking-[0.2em] text-red-300 hover:bg-red-500/20 transition-all disabled:opacity-40">
                                            {checkoutLoading ? 'Redirecting…' : 'Update Payment Method'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-sm font-bold text-white mb-1">Growth <span className="text-gray-500 font-normal text-xs">$49 / mo</span></p>
                                            <ul className="space-y-1 text-xs text-gray-400">
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-xs"></i>State Compliance Automation</li>
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-xs"></i>Full Integration Suite</li>
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-xs"></i>3 AI Agents</li>
                                                <li className="flex items-center gap-2"><i className="ph ph-check text-green-400 text-xs"></i>Priority Support</li>
                                            </ul>
                                        </div>
                                        {checkoutError && <p className="text-red-400 text-[10px] uppercase tracking-widest">{checkoutError}</p>}
                                        <button onClick={handleUpgrade} disabled={checkoutLoading} className="w-full py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-[0.2em] text-purple-200 hover:from-blue-500/30 hover:to-purple-500/30 hover:border-purple-400/50 transition-all disabled:opacity-40">
                                            {checkoutLoading ? 'Redirecting to Stripe…' : 'Upgrade to Growth'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        );
    }

    return (
        <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] flex flex-col items-center min-h-[60vh] relative z-10">
            <div className="w-full max-w-md">
                <div className="mb-10 text-center">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-3">ONBOARD</h1>
                    <p className="text-xs text-gray-400 uppercase tracking-[0.3em] opacity-70">Open your client dashboard</p>
                </div>

                <form onSubmit={handleSignIn} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
                    <div className="space-y-6">
                        <div className="group">
                            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                placeholder="you@example.com"
                            />
                        </div>
                        <div className="group">
                            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                placeholder="••••••••••••"
                            />
                        </div>
                        {error && (
                            <p className="text-red-400 text-[11px] uppercase tracking-widest">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 mt-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] disabled:opacity-40"
                        >
                            {loading ? 'Signing In...' : 'Sign In'}
                        </button>
                        <div className="text-center pt-2">
                            <p
                                className="text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors cursor-pointer"
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
                            className="text-[9px] uppercase tracking-[0.2em] cursor-pointer opacity-30 hover:opacity-100 transition-opacity"
                            onClick={() => { setShowReset(true); setResetStatus(null); }}
                        >
                            Recover Access Credentials
                        </p>
                    ) : (
                        <form onSubmit={handleReset} className="bg-black/40 border border-white/10 rounded-lg p-4 text-left space-y-3">
                            {resetStatus === 'sent' ? (
                                <p className="text-[10px] uppercase tracking-widest text-green-400 text-center py-1">
                                    Reset link sent — check your inbox.
                                </p>
                            ) : (
                                <>
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1 group-focus-within:text-purple-400 transition-colors">Email</label>
                                        <input
                                            type="email"
                                            value={resetEmail}
                                            onChange={e => setResetEmail(e.target.value)}
                                            required
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                            placeholder="you@example.com"
                                        />
                                    </div>
                                    {resetStatus && (
                                        <p className="text-red-400 text-[10px] uppercase tracking-widest">{resetStatus}</p>
                                    )}
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="submit"
                                            disabled={resetLoading}
                                            className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
                                        >
                                            {resetLoading ? 'Sending…' : 'Send Reset Link'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowReset(false); setResetStatus(null); setResetEmail(''); }}
                                            className="py-2 px-3 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-500 hover:text-white hover:border-white/30 transition-all"
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

// GalaxyBackground — canvas starfield with nebula glow and shooting stars
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
            // dense star field — 3 layers (distant tiny, mid, bright foreground)
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

            // nebulae — simple radial fills at viewport scale
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

const InquiryBanner = ({ onDismiss }) => {
    useEffect(() => {
        const t = setTimeout(onDismiss, 5000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.4s_ease-out]">
            <div className="flex items-center gap-4 bg-[#03020a]/90 border border-purple-500/30 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0"></div>
                <p className="text-xs uppercase tracking-[0.25em] text-gray-200">Inquiry received — our team will be in touch shortly.</p>
                <button onClick={onDismiss} className="ml-2 text-gray-500 hover:text-white transition-colors">
                    <i className="ph ph-x text-sm"></i>
                </button>
            </div>
        </div>
    );
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
                <p className="text-xs uppercase tracking-[0.25em] text-gray-200">Brand Kit download starting…</p>
                <button onClick={onDismiss} className="ml-2 text-gray-500 hover:text-white transition-colors">
                    <i className="ph ph-x text-sm"></i>
                </button>
            </div>
        </div>
    );
};

const App = () => {
    const [currentView, setCurrentView] = useState('landing');
    const [visibleView, setVisibleView] = useState('landing');
    const [viewVisible, setViewVisible] = useState(true);
    const [uiVisible, setUiVisible] = useState(true);
    const [navReady, setNavReady] = useState(false);

    const navigateTo = (view) => {
        if (view === visibleView) return;
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

    return (
        <div className="min-h-screen text-white relative font-sans selection:bg-purple-500/30 bg-[#03020a]">
            <GalaxyBackground visible={true} />

            <nav className={`fixed top-0 left-0 w-full z-50 px-8 py-8 md:px-16 md:py-12 flex justify-center items-center transition-all duration-700 ${currentView !== 'landing' || navReady ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                {/* nav logo — muted, kept for reference */}
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

                <div className="flex items-center gap-8 md:gap-12 text-[10px] md:text-xs tracking-[0.3em] uppercase font-bold">
                    <button onClick={() => navigateTo('features')} className={`nav-link transition-opacity hidden sm:block ${currentView === 'features' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Features</button>
                    <button onClick={() => navigateTo('pricing')} className={`nav-link transition-opacity hidden sm:block ${currentView === 'pricing' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Pricing</button>
                    <button onClick={() => navigateTo('support')} className={`nav-link transition-opacity hidden sm:block relative ${currentView === 'support' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                        Support
                        {unreadCount > 0 && <span className="absolute -top-2 -right-3 w-4 h-4 bg-blue-500 text-white text-[8px] flex items-center justify-center rounded-full animate-pulse tracking-none">{unreadCount}</span>}
                    </button>
                    <button onClick={() => handleAction('admin')} className="nav-link text-purple-300 hover:text-white transition-colors">Login</button>
                </div>
            </nav>

            {contextMenu.visible && (
                <div className="custom-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <div
                        className="p-4 hover:bg-white/10 cursor-pointer flex items-center gap-3 text-sm text-purple-300 transition-colors uppercase tracking-widest font-bold"
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

            {/* Features/Pricing/Support overlay — fade up, tap outside to dismiss */}
            {(currentView === 'features' || currentView === 'pricing' || currentView === 'support') && (
                <>
                    {currentView === 'features' && <Features onDismiss={() => navigateTo('landing')} visible={viewVisible} />}
                    {currentView === 'pricing' && <Pricing onContact={() => handleAction('contact')} onDismiss={() => navigateTo('landing')} visible={viewVisible} />}
                    {currentView === 'support' && <Support onDismiss={() => navigateTo('landing')} onContact={() => handleAction('contact')} visible={viewVisible} />}
                </>
            )}
        </div>
    );
};

export default App;