import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

// GreenScreen — canvas chroma key video engine
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

            // VIDEO CROP
            const cropRight = 0.0;
            const sourceWidth = width * (1 - cropRight);

            if (canvas.width !== sourceWidth) canvas.width = sourceWidth;
            if (canvas.height !== height) canvas.height = height;

            ctx.drawImage(video, 0, 0, sourceWidth, height, 0, 0, sourceWidth, height);

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

// Landing — public marketing page
const Landing = ({ onNavigate, uiVisible, setUiVisible }) => {
    const handleVideoEnd = () => {
        setUiVisible(true);
    };

    useEffect(() => {
        const timer = setTimeout(() => setUiVisible(true), 4000);
        return () => clearTimeout(timer);
    }, [setUiVisible]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden relative z-10">
            
            {/* Custom Animations for Mind Map & Fluid Threads */}
            <style>{`
                @keyframes drift {
                    0%, 100% { transform: translate(0px, 0px); }
                    25% { transform: translate(6px, -10px); }
                    50% { transform: translate(-4px, -18px); }
                    75% { transform: translate(-8px, -8px); }
                }
                @keyframes pulseLine {
                    0%, 100% { stroke-dashoffset: 0; opacity: 0.2; }
                    50% { stroke-dashoffset: 20; opacity: 0.5; }
                }
                .animate-drift { animation: drift 8s ease-in-out infinite; }
                .animate-drift-delayed { animation: drift 10s ease-in-out infinite 1.5s; }
                .animate-drift-slow { animation: drift 12s ease-in-out infinite 3s; }
                .fluid-thread { 
                    stroke-dasharray: 100;
                    animation: pulseLine 4s ease-in-out infinite;
                }
            `}</style>

            <div className={`transition-all duration-[1500ms] ease-in-out ${uiVisible ? 'scale-[0.65] -translate-y-24 opacity-80' : 'scale-100 opacity-100'}`}>
                <GreenScreen videoUrl="/Onboardin-Ongreen.mp4" onVideoEnd={handleVideoEnd} /> 
            </div>

            <div className={`text-center z-10 transition-all duration-1000 delay-500 absolute bottom-32 md:bottom-44 w-full px-4 ${uiVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                
                {/* Mind Map Button Logic */}
                <div className="relative inline-block group">
                    {/* Mind Map Nodes (Hidden by default, visible on hover) */}
                    <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out">
                        
                        {/* Node 1: Tax (Top Left) */}
                        <div className="absolute -top-16 -left-20 md:-left-32 animate-drift">
                            <div className="relative flex flex-col items-center">
                                <div className="w-2.5 h-2.5 bg-blue-400 rounded-full shadow-[0_0_15px_rgba(59,130,246,1)] z-10 relative"></div>
                                {/* Fluid Thread: Adjusted to connect dot to button center */}
                                <svg className="absolute top-1 left-1 w-[250px] h-[150px] overflow-visible pointer-events-none z-0">
                                    <path 
                                        d="M 0,0 Q 80,40 200,80" 
                                        fill="none" 
                                        stroke="rgba(59,130,246,0.4)" 
                                        strokeWidth="1" 
                                        className="fluid-thread"
                                    />
                                </svg>
                                <span className="text-[10px] uppercase tracking-[0.2em] text-blue-200 mt-2 font-bold drop-shadow-[0_0_8px_rgba(59,130,246,0.8)] whitespace-nowrap">Tax Auto</span>
                            </div>
                        </div>

                        {/* Node 2: Legal (Top Right) */}
                        <div className="absolute -top-20 -right-20 md:-right-32 animate-drift-delayed">
                            <div className="relative flex flex-col items-center">
                                <div className="w-2.5 h-2.5 bg-purple-400 rounded-full shadow-[0_0_15px_rgba(168,85,247,1)] z-10 relative"></div>
                                <svg className="absolute top-1 right-1 w-[250px] h-[150px] overflow-visible pointer-events-none z-0">
                                    <path 
                                        d="M 0,0 Q -80,40 -200,80" 
                                        fill="none" 
                                        stroke="rgba(168,85,247,0.4)" 
                                        strokeWidth="1" 
                                        className="fluid-thread"
                                    />
                                </svg>
                                <span className="text-[10px] uppercase tracking-[0.2em] text-purple-200 mt-2 font-bold drop-shadow-[0_0_8px_rgba(168,85,247,0.8)] whitespace-nowrap">Legal Docs</span>
                            </div>
                        </div>

                        {/* Node 3: Compliance (Bottom Center) */}
                        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 animate-drift-slow">
                            <div className="relative flex flex-col items-center">
                                <div className="w-2.5 h-2.5 bg-green-400 rounded-full shadow-[0_0_15px_rgba(74,222,128,1)] z-10 relative"></div>
                                <svg className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[100px] h-[150px] overflow-visible pointer-events-none z-0">
                                    <path 
                                        d="M 0,0 Q 0,-40 0,-110" 
                                        fill="none" 
                                        stroke="rgba(74,222,128,0.4)" 
                                        strokeWidth="1" 
                                        className="fluid-thread"
                                    />
                                </svg>
                                <span className="text-[10px] uppercase tracking-[0.2em] text-green-200 mt-2 font-bold drop-shadow-[0_0_8px_rgba(74,222,128,0.8)] whitespace-nowrap">Compliance</span>
                            </div>
                        </div>
                    </div>

                    <button onClick={onNavigate} className="relative z-20 px-12 py-5 border border-white/20 rounded-full uppercase tracking-[0.4em] font-black text-sm transition-all duration-[600ms] hover:border-white/90 hover:bg-white/5 hover:shadow-[0_0_35px_rgba(255,255,255,0.2)] active:scale-95 bg-[#1a0b2e]/80 backdrop-blur-md">
                        Start Building
                    </button>
                </div>

                <p className="text-gray-400 text-[10px] md:text-xs mt-16 font-medium tracking-[0.5em] uppercase opacity-50">
                    Automate. Integrate. Scale.
                </p>
            </div>
        </div>
    );
};

// Features — service overview grid
const Features = () => {
    const features = [
        { icon: "ph-megaphone", title: "Marketing Automation", desc: "Automated campaign creation, content scheduling, and multi-channel publishing." },
        { icon: "ph-shield-check", title: "Digital Rights Management", desc: "Protect your IP from day one — automated DRM filing, licensing documentation, and ownership records." },
        { icon: "ph-robot", title: "AI Agents", desc: "Deploy autonomous agents for tax, legal, and operational workflows." },
        { icon: "ph-chart-line", title: "Accounting", desc: "Real-time synchronization of invoices, expenses, and payroll data." },
        { icon: "ph-rocket-launch", title: "Business Development", desc: "Structured sprint cycles, milestone tracking, and growth playbooks to move from zero to revenue." },
        { icon: "ph-paper-plane-tilt", title: "Emails", desc: "Transactional and lifecycle emails with high deliverability — onboarding flows, invoices, and alerts." },
        { icon: "ph-receipt", title: "Taxes", desc: "Automated sales tax calculation and filing compliance." },
        { icon: "ph-database", title: "Databases", desc: "Scalable postgres database management included in every tier." },
        { icon: "ph-scales", title: "Legal Compliance", desc: "Auto-generated policies and consent management." }
    ];

    return (
        <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] min-h-screen relative z-10">
            <div className="text-center mb-16">
                <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-4">Automate to Scale</h1>
                <p className="text-gray-400 text-xs md:text-sm tracking-[0.2em] uppercase opacity-70">Everything you need to automate your enterprise</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {features.map((f, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl hover:bg-white/10 transition-all group">
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                            <i className={`ph ${f.icon} text-2xl text-blue-400`}></i>
                        </div>
                        <h3 className="text-lg font-bold mb-3 uppercase tracking-wide">{f.title}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Pricing — tiered plans
const Pricing = ({ onContact }) => {
    return (
        <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] min-h-screen flex flex-col items-center relative z-10">
            <div className="text-center mb-16">
                <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-4">Scalable Pricing</h1>
                <p className="text-gray-400 text-xs md:text-sm tracking-[0.2em] uppercase opacity-70">Start free, upgrade as you grow</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full">
                {/* Starter Tier */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl flex flex-col hover:border-white/20 transition-all">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-blue-300 mb-2">Starter</h3>
                    <div className="text-4xl font-bold mb-6">$0 <span className="text-sm text-gray-500 font-normal">/mo</span></div>
                    <ul className="space-y-4 mb-8 text-sm text-gray-300 flex-1">
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Entity Formation Guide</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Basic Accounting Sync</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> 1 AI Agent </li>
                        <li className="flex items-center gap-3 opacity-50"><i className="ph ph-x text-gray-600"></i> Compliance Automation</li>
                    </ul>
                    <button onClick={onContact} className="w-full py-4 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-colors">Start Free</button>
                </div>

                {/* Growth Tier */}
                <div className="bg-gradient-to-b from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-2xl p-8 backdrop-blur-xl flex flex-col relative transform md:-translate-y-4 shadow-2xl">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-purple-500 text-white text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">Most Popular</div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-purple-300 mb-2">Growth</h3>
                    <div className="text-4xl font-bold mb-6">$49 <span className="text-sm text-gray-500 font-normal">/mo</span></div>
                    <ul className="space-y-4 mb-8 text-sm text-gray-300 flex-1">
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> State Compliance Automation</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Full Integration Suite</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> 3 AI Agents</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Priority Support</li>
                    </ul>
                    <button onClick={onContact} className="w-full py-4 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors">Get Started</button>
                </div>

                {/* Enterprise Tier */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl flex flex-col hover:border-white/20 transition-all">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">Enterprise</h3>
                    <div className="text-4xl font-bold mb-6">Custom</div>
                    <ul className="space-y-4 mb-8 text-sm text-gray-300 flex-1">
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Turnkey Incorporation & Audit</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Unlimited Users & AI Models</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Dedicated Account Manager</li>
                        <li className="flex items-center gap-3"><i className="ph ph-check text-green-400"></i> Full Compliance SLA</li>
                    </ul>
                    <button onClick={onContact} className="w-full py-4 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-colors">Contact Sales</button>
                </div>
            </div>
        </div>
    );
};

// Signup — client intake / onboarding form
const Signup = ({ setCurrentView }) => {
    const [step, setStep] = useState(1);
    const [companyName, setCompanyName] = useState('');
    const [founderName, setFounderName] = useState('');
    const [workEmail, setWorkEmail] = useState('');
    const [fundingStage, setFundingStage] = useState('Pre-Seed');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleStep1 = (e) => {
        e.preventDefault();
        setError('');
        setStep(2);
    };

    const handleCreateAccount = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
        if (!supabase) { setError('Auth not configured.'); return; }
        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email: workEmail,
            password,
            options: {
                data: {
                    company_name: companyName,
                    founder_name: founderName,
                    funding_stage: fundingStage,
                },
            },
        });
        setLoading(false);
        if (error) { setError(error.message); return; }
        setSuccess(true);
    };

    return (
        <div className="pt-32 px-8 md:px-16 animate-[fadeIn_1s_ease-out] flex flex-col items-center min-h-[60vh] relative z-10">
            <div className="w-full max-w-md">
                <div className="mb-10 text-center">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter mb-3">Get Started</h1>
                    <p className="text-xs text-gray-400 uppercase tracking-[0.3em] opacity-70">Client intake — takes about a minute</p>
                </div>

                {success ? (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center space-y-6">
                        <div className="w-12 h-12 bg-green-400/10 rounded-full flex items-center justify-center mx-auto">
                            <i className="ph ph-check-circle text-2xl text-green-400"></i>
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed">Account created — check your email to confirm, then sign in.</p>
                        <button
                            onClick={() => setCurrentView('dashboard')}
                            className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                        >
                            Go to Login
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 text-center mb-6">Step {step} of 2</p>

                        {step === 1 ? (
                            <form onSubmit={handleStep1} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
                                <div className="space-y-6">
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Company Name</label>
                                        <input
                                            type="text"
                                            value={companyName}
                                            onChange={e => setCompanyName(e.target.value)}
                                            required
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                            placeholder="Acme Corp"
                                        />
                                    </div>
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Founder Name</label>
                                        <input
                                            type="text"
                                            value={founderName}
                                            onChange={e => setFounderName(e.target.value)}
                                            required
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                            placeholder="Jane Smith"
                                        />
                                    </div>
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Work Email</label>
                                        <input
                                            type="email"
                                            value={workEmail}
                                            onChange={e => setWorkEmail(e.target.value)}
                                            required
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                            placeholder="jane@acmecorp.com"
                                        />
                                    </div>
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Funding Stage</label>
                                        <select
                                            value={fundingStage}
                                            onChange={e => setFundingStage(e.target.value)}
                                            required
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="Pre-Seed">Pre-Seed</option>
                                            <option value="Seed">Seed</option>
                                            <option value="Series A">Series A</option>
                                            <option value="Series B+">Series B+</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full py-4 mt-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-[0.2em] transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                                    >
                                        Continue
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleCreateAccount} className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
                                <div className="space-y-6">
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Password</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            required
                                            minLength={8}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/60 transition-all"
                                            placeholder="••••••••••••"
                                        />
                                    </div>
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 group-hover:text-purple-400 transition-colors">Confirm Password</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
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
                                        {loading ? 'Creating Account…' : 'Create Account'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setStep(1); setError(''); }}
                                        className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors"
                                    >
                                        ← Back
                                    </button>
                                </div>
                            </form>
                        )}
                    </>
                )}

                <div className="mt-8 text-center">
                    <p
                        className="text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors cursor-pointer"
                        onClick={() => setCurrentView('dashboard')}
                    >
                        Already have access? Sign in
                    </p>
                </div>
            </div>
        </div>
    );
};

// Dashboard — protected client console
const Dashboard = ({ setCurrentView }) => {
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

                    {adminLoading ? (
                        <div className="space-y-3">
                            {[1,2,3].map(i => <div key={i} className="w-full h-16 bg-white/5 rounded-xl animate-pulse" />)}
                        </div>
                    ) : (
                        <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
                            <div className="grid grid-cols-[2fr_2fr_1fr_2fr_1fr] gap-0 px-6 py-3 border-b border-white/5">
                                {['Company','Founder','Stage','Progress','Joined'].map(h => (
                                    <span key={h} className="text-[10px] uppercase tracking-widest text-gray-500">{h}</span>
                                ))}
                            </div>
                            {allClients.filter(c => !c.is_admin).length === 0 ? (
                                <div className="px-6 py-12 text-center text-gray-600 text-sm">No clients yet.</div>
                            ) : (
                                allClients.filter(c => !c.is_admin).map((client, i) => {
                                    const step = client.onboarding_step ?? 0;
                                    const pct = Math.round((step / 7) * 100);
                                    const joined = new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                    return (
                                        <div key={client.id} className={`grid grid-cols-[2fr_2fr_1fr_2fr_1fr] gap-0 px-6 py-4 items-center ${i % 2 === 0 ? '' : 'bg-white/[0.02]'} hover:bg-white/5 transition-colors`}>
                                            <div>
                                                <p className="text-sm font-medium text-white">{client.company_name}</p>
                                                <p className="text-[10px] text-gray-500">{client.email}</p>
                                            </div>
                                            <span className="text-sm text-gray-300">{client.founder_name}</span>
                                            <span className="text-[9px] uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full w-fit">{client.funding_stage || '—'}</span>
                                            <div className="pr-4">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] text-gray-500">{stepLabels[step] || 'Complete'}</span>
                                                    <span className="text-[10px] text-gray-500">{pct}%</span>
                                                </div>
                                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-500">{joined}</span>
                                        </div>
                                    );
                                })
                            )}
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
                <div className="max-w-4xl mx-auto">
                    <div className="flex justify-between items-center mb-12">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
                                    return (
                                        <div key={i} className="flex items-center gap-3">
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
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">System Status</h3>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-sm text-gray-300">All systems operational</span>
                        </div>
                    </div>
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

// BackgroundWaves — animated SVG ambient layer
const BackgroundWaves = ({ visible }) => (
    <div className={`fixed bottom-0 left-0 w-full h-1/2 z-0 overflow-hidden pointer-events-none transition-opacity duration-[2000ms] ease-in-out ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <style>{`
            @keyframes organicWave {
                0% { transform: translateX(0) translateY(0) scaleY(1); }
                33% { transform: translateX(-15%) translateY(-5px) scaleY(0.9); }
                66% { transform: translateX(-30%) translateY(5px) scaleY(1.1); }
                100% { transform: translateX(-50%) translateY(0) scaleY(1); }
            }
            .animate-organic-wave {
                animation: organicWave 18s linear infinite;
            }
        `}</style>
        <svg className="w-[200%] h-full animate-organic-wave" viewBox="0 0 1000 100" preserveAspectRatio="none">
            {/* Very thin, wavy paths only (removed straight horizontal line/fills) */}
            <path d="M0,50 C150,80 350,20 500,50 C650,80 850,20 1000,50" fill="none" stroke="rgba(100, 149, 237, 0.08)" strokeWidth="0.3" />
            <path d="M0,40 C150,20 350,60 500,40 C650,20 850,60 1000,40" fill="none" stroke="rgba(147, 112, 219, 0.08)" strokeWidth="0.3" style={{ animationDelay: '-4s' }} />
            <path d="M0,60 C200,85 400,35 600,60 800,85 1000,35 1200,60" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="0.3" style={{ animationDelay: '-8s' }} />
        </svg>
    </div>
);

const InquiryBanner = ({ onDismiss }) => {
    useEffect(() => {
        const t = setTimeout(onDismiss, 5000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.4s_ease-out]">
            <div className="flex items-center gap-4 bg-[#1a0b2e]/90 border border-purple-500/30 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl">
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
            <div className="flex items-center gap-4 bg-[#1a0b2e]/90 border border-blue-500/30 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl">
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
    const [uiVisible, setUiVisible] = useState(true);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
    const [showInquiry, setShowInquiry] = useState(false);
    const [showBrandKit, setShowBrandKit] = useState(false);

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
        <div className="min-h-screen text-white relative font-sans selection:bg-purple-500/30 bg-[#1a0b2e]">
            <BackgroundWaves visible={uiVisible || currentView !== 'landing'} />

            <nav className={`fixed top-0 left-0 w-full z-50 px-8 py-8 md:px-16 md:py-12 flex justify-between items-center transition-all duration-1000 ${uiVisible || currentView !== 'landing' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <div
                    className="cursor-pointer nav-link flex items-center group"
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
                    <button onClick={() => setCurrentView('features')} className={`nav-link transition-opacity hidden sm:block ${currentView === 'features' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Features</button>
                    <button onClick={() => setCurrentView('pricing')} className={`nav-link transition-opacity hidden sm:block ${currentView === 'pricing' ? 'text-purple-300 opacity-100' : 'opacity-60 hover:opacity-100'}`}>Pricing</button>
                    <button onClick={() => handleAction(currentView === 'dashboard' ? 'contact' : 'admin')} className="nav-link text-purple-300 hover:text-white transition-colors">{currentView === 'dashboard' ? 'Support' : 'Login'}</button>
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
                {currentView === 'landing' && (
                    <Landing onNavigate={() => setCurrentView('dashboard')} uiVisible={uiVisible} setUiVisible={setUiVisible} />
                )}
                {currentView === 'dashboard' && <Dashboard setCurrentView={setCurrentView} />}
                {currentView === 'signup' && <Signup setCurrentView={setCurrentView} />}
                {currentView === 'features' && <Features />}
                {currentView === 'pricing' && <Pricing onContact={() => handleAction('contact')} />}
            </main>
        </div>
    );
};

export default App;