import React, { useState, useEffect } from 'react';
import GreenScreen from '../features/GreenScreen';

const Landing = ({ onNavigate }) => {
    const [uiVisible, setUiVisible] = useState(false);

    const handleVideoEnd = () => {
        setUiVisible(true);
    };

    // Fallback: Show UI after 4 seconds if video doesn't trigger end
    useEffect(() => {
        const timer = setTimeout(() => setUiVisible(true), 4000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden relative">
            
            {/* Centered Video Hero */}
            <div className={`transition-all duration-1000 ${uiVisible ? 'scale-75 -translate-y-10' : 'scale-100'}`}>
                {/* Note: Ensure Onboardin-Ongreen.mp4 is in your /public folder */}
                <GreenScreen videoUrl="/Onboardin-Ongreen.mp4" onVideoEnd={handleVideoEnd} /> 
            </div>

            {/* Content Fades in AFTER video */}
            <div className={`text-center z-10 transition-all duration-1000 delay-300 absolute bottom-20 md:bottom-32 w-full px-4 ${uiVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                <button 
                    onClick={() => onNavigate('dashboard')} 
                    className="group relative px-10 py-4 bg-transparent border border-white/30 rounded-full overflow-hidden transition-all duration-300 hover:border-white/80 hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] cursor-pointer"
                >
                    <span className="relative z-10 font-bold tracking-[0.2em] uppercase text-sm md:text-base">Start Building</span>
                    <div className="absolute inset-0 bg-white/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
                </button>

                <p className="text-gray-400 text-xs md:text-sm mt-6 font-light tracking-wide uppercase opacity-70">
                    Automate. Integrate. Scale.
                </p>
            </div>
        </div>
    );
};

export default Landing;