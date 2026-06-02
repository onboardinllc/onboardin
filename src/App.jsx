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

const ENTITY_TYPES = ['LLC','C-Corp','S-Corp','Sole Proprietor','Non-Profit','Partnership'];

// Returns recommended entity + reason based on intent signals
function recommendEntity(fundingStage, businessIntent, sellsTo) {
    const intent = (businessIntent || '').toLowerCase();
    const sells = (sellsTo || '').toLowerCase();
    const wantsVC = fundingStage === 'Seed' || fundingStage === 'Series A' || fundingStage === 'Series B+';
    const isConsumer = sells.includes('consumer') || sells.includes('b2c') || sells.includes('individual');
    const isEnterprise = sells.includes('enterprise') || sells.includes('b2b') || sells.includes('business');
    const isNonProfit = intent.includes('nonprofit') || intent.includes('non-profit') || intent.includes('charity') || intent.includes('501');

    if (isNonProfit) return { entity: 'Non-Profit', reason: 'Non-profit status enables tax exemption and grant eligibility.' };
    if (wantsVC) return { entity: 'C-Corp', reason: 'C-Corps are the standard for venture-backed companies — VCs and stock options require it.' };
    if (isEnterprise && fundingStage === 'Pre-Seed') return { entity: 'LLC', reason: 'LLCs offer pass-through taxation and flexibility — ideal before a fundraise.' };
    return { entity: 'LLC', reason: 'LLCs are the most common structure for early-stage startups — simple, flexible, and founder-friendly.' };
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

    const recommendation = recommendEntity(fundingStage, businessIntent, sellsTo);

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
                    <p className="text-xs text-gray-400 uppercase tracking-[0.3em] opacity-70">Client intake — takes about a minute</p>
                </div>

                {success ? (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center space-y-6">
                        <div className="w-12 h-12 bg-green-400/10 rounded-full flex items-center justify-center mx-auto">
                            <i className="ph ph-check-circle text-2xl text-green-400"></i>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-white">You're in.</p>
                            <p className="text-xs text-gray-400 leading-relaxed">Check your email to confirm your address — you can explore your dashboard in the meantime.</p>
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

                        {/* Step 1 — Company info */}
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

                        {/* Step 2 — Jurisdiction + intent */}
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
                                        <option value="">Select…</option>
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
                                        <option value="">Select…</option>
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
                                <button type="button" onClick={() => { setJurisdiction(''); setStep(3); }} className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors">Skip for now</button>
                            </form>
                        )}

                        {/* Step 3 — Domain + business email */}
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
                                <button type="button" onClick={() => setStep(4)} className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors">Skip for now</button>
                            </div>
                        )}

                        {/* Step 4 — Entity recommendation */}
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
                                                <option value="">Select…</option>
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
                                <button type="button" onClick={() => setStep(5)} className="w-full py-2 text-[9px] uppercase tracking-[0.2em] text-gray-500 hover:text-purple-300 transition-colors">Skip for now</button>
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
    const [advancingId, setAdvancingId] = useState(null);
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
    // Jurisdiction setup (for clients who skipped step 2/3 during signup)
    const [showJurisdictionSetup, setShowJurisdictionSetup] = useState(false);
    const [setupCountry, setSetupCountry] = useState('United States');
    const [setupJurisdiction, setSetupJurisdiction] = useState('');
    const [setupIntent, setSetupIntent] = useState('');
    const [setupSellsTo, setSetupSellsTo] = useState('');
    const [setupEntity, setSetupEntity] = useState('');
    const [setupEntityOverride, setSetupEntityOverride] = useState(false);
    const [savingSetup, setSavingSetup] = useState(false);
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
        setMyDocsLoading(true);
        setMyMessagesLoading(true);
        supabase.from('documents').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false })
            .then(({ data }) => { setMyDocs(data || []); setMyDocsLoading(false); });
        supabase.from('messages').select('*').eq('client_id', session.user.id).order('created_at', { ascending: true })
            .then(({ data }) => { setMyMessages(data || []); setMyMessagesLoading(false); });
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
        setDetailLoading(true);
        setClientDocs([]);
        setClientMessages([]);
        const [{ data: docs }, { data: msgs }] = await Promise.all([
            supabase.from('documents').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
            supabase.from('messages').select('*').eq('client_id', client.id).order('created_at', { ascending: true }),
        ]);
        setClientDocs(docs || []);
        setClientMessages(msgs || []);
        setDetailLoading(false);
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
            });
            if (!dbError) {
                setClientDocs(prev => [{ name: file.name, path, size: file.size, created_at: new Date().toISOString() }, ...prev]);
            }
        }
        setUploadingDoc(false);
        e.target.value = '';
    };

    const handleAgentQuestion = async (e) => {
        e.preventDefault();
        if (!agentQuestion.trim() || !supabase || !session) return;
        setAgentLoading(true);
        setAgentAnswer('');
        setAgentError('');
        try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            const res = await fetch('https://qatfiicpkunabpphwqee.supabase.co/functions/v1/agent-formation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authSession.access_token}`,
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA',
                },
                body: JSON.stringify({ question: agentQuestion.trim() }),
            });
            const json = await res.json();
            if (json.answer) {
                setAgentAnswer(json.answer);
            } else {
                setAgentError(json.error || 'No response. Try again.');
            }
        } catch {
            setAgentError('Could not reach formation assistant.');
        }
        setAgentLoading(false);
    };

    const handleSaveJurisdiction = async (e) => {
        e.preventDefault();
        if (!supabase || !session) return;
        setSavingSetup(true);
        const rec = recommendEntity(clientProfile?.funding_stage, setupIntent, setupSellsTo);
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
                            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_2fr_1fr_auto] gap-0 px-6 py-3 border-b border-white/5">
                                {['Company','Founder','Stage','Plan','Progress','Joined',''].map((h, i) => (
                                    <span key={i} className="text-[10px] uppercase tracking-widest text-gray-500">{h}</span>
                                ))}
                            </div>
                            {allClients.filter(c => !c.is_admin).length === 0 ? (
                                <div className="px-6 py-12 text-center text-gray-600 text-sm">No clients yet.</div>
                            ) : (
                                allClients.filter(c => !c.is_admin).map((client, i) => {
                                    const step = client.onboarding_step ?? 0;
                                    const pct = Math.round((step / 7) * 100);
                                    const joined = new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                    const isComplete = step >= 7;
                                    const isAdvancing = advancingId === client.id;
                                    return (
                                        <div key={client.id} onClick={() => openClientDetail(client)} className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_2fr_1fr_auto] gap-0 px-6 py-4 items-center cursor-pointer ${i % 2 === 0 ? '' : 'bg-white/[0.02]'} hover:bg-white/5 transition-colors ${selectedClient?.id === client.id ? 'bg-purple-500/5 border-l-2 border-purple-500/50' : ''}`}>
                                            <div>
                                                <p className="text-sm font-medium text-white">{client.company_name}</p>
                                                <p className="text-[10px] text-gray-500">{client.email}</p>
                                            </div>
                                            <span className="text-sm text-gray-300">{client.founder_name}</span>
                                            <span className="text-[9px] uppercase tracking-widest text-purple-300 bg-purple-400/10 px-2 py-1 rounded-full w-fit">{client.funding_stage || '—'}</span>
                                            {(() => {
                                                const p = client.plan ?? 'starter';
                                                if (p === 'growth') return <span className="text-[9px] uppercase tracking-widest text-green-300 bg-green-400/10 px-2 py-1 rounded-full w-fit">Growth</span>;
                                                if (p === 'past_due') return <span className="text-[9px] uppercase tracking-widest text-red-300 bg-red-400/10 px-2 py-1 rounded-full w-fit">Past Due</span>;
                                                return <span className="text-[9px] uppercase tracking-widest text-gray-500 bg-white/5 px-2 py-1 rounded-full w-fit">Free</span>;
                                            })()}
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
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* Client detail panel */}
                    {selectedClient && (
                        <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden animate-[fadeIn_0.3s_ease-out]">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                                <div>
                                    <h3 className="text-sm font-bold text-white">{selectedClient.company_name}</h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">{selectedClient.email}</p>
                                </div>
                                <button onClick={() => setSelectedClient(null)} className="text-gray-500 hover:text-white transition-colors">
                                    <i className="ph ph-x text-lg"></i>
                                </button>
                            </div>

                            {detailLoading ? (
                                <div className="p-6 space-y-3">
                                    {[1,2].map(i => <div key={i} className="w-full h-10 bg-white/5 rounded animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/5">
                                    {/* Documents */}
                                    <div className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[10px] uppercase tracking-widest text-gray-500">Documents</h4>
                                            <label className="cursor-pointer text-[9px] uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-1 rounded-lg hover:bg-purple-500/10 transition-all">
                                                {uploadingDoc ? 'Uploading…' : '+ Upload'}
                                                <input type="file" className="hidden" onChange={handleAdminUpload} disabled={uploadingDoc} />
                                            </label>
                                        </div>
                                        {clientDocs.length === 0 ? (
                                            <p className="text-xs text-gray-600 italic">No documents yet.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {clientDocs.map((doc, i) => (
                                                    <div key={i} onClick={() => getSignedUrl(doc.path)} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-all group">
                                                        <i className="ph ph-file text-gray-400 group-hover:text-blue-400 transition-colors flex-shrink-0"></i>
                                                        <span className="text-xs text-gray-300 truncate flex-1">{doc.name}</span>
                                                        <i className="ph ph-download-simple text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0"></i>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Messages */}
                                    <div className="p-6 flex flex-col">
                                        <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Messages</h4>
                                        <div className="flex-1 space-y-3 max-h-48 overflow-y-auto mb-4 pr-1">
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

                    {/* Formation Assistant */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                <i className="ph ph-robot text-purple-300 text-sm"></i>
                            </div>
                            <div>
                                <h3 className="text-[10px] uppercase tracking-widest text-gray-500">Formation Assistant</h3>
                                <p className="text-[10px] text-gray-600 mt-0.5">Ask anything about structuring, filing, or next steps</p>
                            </div>
                        </div>

                        {agentAnswer && (
                            <div className="mb-4 bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap animate-[fadeIn_0.4s_ease-out]">
                                {agentAnswer}
                            </div>
                        )}
                        {agentError && (
                            <p className="mb-3 text-[10px] uppercase tracking-widest text-red-400">{agentError}</p>
                        )}

                        <div className="flex flex-wrap gap-2 mb-4">
                            {[
                                'What entity type should I form?',
                                'What are my first filing steps?',
                                'Do I need an EIN before a bank account?',
                                "What's the difference between LLC and C-Corp?",
                            ].map(q => (
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
                                placeholder="Ask about entity formation, filings, structure…"
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-all"
                                disabled={agentLoading}
                            />
                            <button type="submit" disabled={agentLoading || !agentQuestion.trim()}
                                className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40">
                                {agentLoading ? '…' : 'Ask'}
                            </button>
                        </form>
                    </div>

                    {/* Documents — categorized by entity + jurisdiction */}
                    {(() => {
                        const hasJurisdiction = clientProfile?.jurisdiction || clientProfile?.entity_type;
                        const entityType = clientProfile?.entity_type || 'LLC';
                        const country = clientProfile?.country || 'United States';
                        const jurisdiction = clientProfile?.jurisdiction || '';
                        const categories = getDocCategories(entityType, country, jurisdiction);
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
                                                {entityType} · {jurisdiction || country}
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
                                        <p className="text-xs text-gray-300 leading-relaxed">Tell us where you're building and what kind of business — we'll show you exactly what documents you need.</p>
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
                                        <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${msg.is_admin_message ? 'bg-white/5 text-gray-300' : 'bg-purple-500/20 text-purple-100'}`}>
                                            {msg.body}
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