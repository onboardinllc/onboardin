import React, { useState, useEffect } from 'react';
import Landing from './pages/Landing';

// --- Placeholder for Dashboard (We will build this out fully next) ---
const DashboardPlaceholder = () => (
    <div className="min-h-screen pt-24 px-12 animate-fade-in">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Admin Console</h1>
        <p className="text-gray-400 mt-4">Secure Area - Connect your API keys here.</p>
    </div>
);

// --- Main Layout ---
const App = () => {
    const [currentView, setCurrentView] = useState('landing');
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });

    // Background Waves Animation
    const BackgroundWaves = () => (
        <div className="fixed top-0 left-0 w-full h-full z-[-1] overflow-hidden pointer-events-none">
            <svg className="w-[200%] h-full animate-[waveMove_20s_linear_infinite]" viewBox="0 0 1000 100" preserveAspectRatio="none">
                <path d="M0,50 C150,80 350,20 500,50 C650,80 850,20 1000,50 V100 H0 Z" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
            </svg>
        </div>
    );

    // Navbar Logic
    const Navbar = () => {
        const handleLogoRightClick = (e) => {
            e.preventDefault();
            setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
        };

        return (
            <nav className="fixed top-0 left-0 w-full z-50 px-6 py-6 flex justify-between items-center transition-all duration-500">
                <div 
                    className="cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => setCurrentView('landing')}
                    onContextMenu={handleLogoRightClick}
                >
                    <img src="/Onboardin.png" alt="Onboardin" className="h-10 md:h-12 w-auto object-contain" />
                </div>
                <div className="flex gap-6 md:gap-8 text-sm md:text-base tracking-widest uppercase">
                    <button onClick={() => setCurrentView('dashboard')} className="bg-transparent border-none cursor-pointer font-bold text-purple-300 hover:text-white transition-colors">
                        {currentView === 'dashboard' ? 'Admin Suite' : 'Login'}
                    </button>
                </div>
            </nav>
        );
    };

    // Close context menu on click
    useEffect(() => {
        const closeMenu = () => setContextMenu({ ...contextMenu, visible: false });
        if (contextMenu.visible) document.addEventListener('click', closeMenu);
        return () => document.removeEventListener('click', closeMenu);
    }, [contextMenu]);

    return (
        <div className="min-h-screen text-white relative font-sans">
            <BackgroundWaves />
            <Navbar />
            
            <main>
                {currentView === 'landing' ? (
                    <Landing onNavigate={setCurrentView} />
                ) : (
                    <DashboardPlaceholder />
                )}
            </main>

            {/* Context Menu for Brand Kit */}
            {contextMenu.visible && (
                <div 
                    className="fixed z-[1000] bg-[#140a28]/95 border border-white/20 backdrop-blur-md rounded-lg py-2 min-w-[200px] shadow-2xl animate-fade-in"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="px-5 py-2 hover:bg-white/10 cursor-pointer flex items-center gap-3 text-sm text-purple-300" onClick={() => alert("Downloading Brand Kit...")}>
                        <i className="ph ph-download-simple"></i>
                        <span>Download Brand Kit</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;