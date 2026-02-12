import React, { useState, useEffect } from 'react';
import Landing from './pages/Landing';
import Dashboard from './pages/dashboard/Dashboard';

// --- Background Component (Motion Lines) ---
const BackgroundWaves = () => (
    <div className="fixed top-0 left-0 w-full h-full z-[-1] overflow-hidden pointer-events-none">
        <svg className="w-[200%] h-full animate-wave" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path d="M0,50 C150,80 350,20 500,50 C650,80 850,20 1000,50 V100 H0 Z" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
            <path d="M0,50 C150,30 350,70 500,50 C650,30 850,70 1000,50 V100 H0 Z" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" style={{ animationDelay: '-8s' }} />
        </svg>
    </div>
);

const App = () => {
    const [currentView, setCurrentView] = useState('landing');
    const [uiVisible, setUiVisible] = useState(false);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });

    const handleLogoRightClick = (e) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    };

    // Close context menu on any click outside
    useEffect(() => {
        const closeMenu = () => setContextMenu(prev => ({ ...prev, visible: false }));
        if (contextMenu.visible) window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [contextMenu.visible]);

    const downloadBrandKit = () => {
        alert("Preparing Onboardin Brand Kit Download...");
    };

    return (
        <div className="min-h-screen text-white relative font-sans selection:bg-purple-500/30">
            <BackgroundWaves />
            
            {/* Navbar matching prototype layout and styling */}
            <nav className={`fixed top-0 left-0 w-full z-50 px-6 py-6 md:px-12 md:py-8 flex justify-between items-center transition-all duration-1000 ${uiVisible || currentView !== 'landing' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <div 
                    className="cursor-pointer nav-link flex items-center"
                    onClick={() => setCurrentView('landing')}
                    onContextMenu={handleLogoRightClick}
                >
                    <img src="/Onboardin.png" alt="Onboardin" className="h-10 md:h-12 w-auto object-contain" />
                </div>
                
                <div className="flex items-center gap-6 md:gap-10 text-[10px] md:text-xs tracking-[0.3em] uppercase font-bold">
                    <button 
                        onClick={() => setCurrentView('features')} 
                        className="nav-link bg-transparent border-none cursor-pointer hidden sm:block hover:text-purple-300 transition-colors"
                    >
                        Features
                    </button>
                    <button 
                        onClick={() => setCurrentView('pricing')} 
                        className="nav-link bg-transparent border-none cursor-pointer hidden sm:block hover:text-purple-300 transition-colors"
                    >
                        Pricing
                    </button>
                    <button 
                        onClick={() => setCurrentView('dashboard')} 
                        className="nav-link bg-transparent border-none cursor-pointer text-purple-300 hover:text-white transition-colors"
                    >
                        {currentView === 'dashboard' ? 'Admin Suite' : 'Login'}
                    </button>
                </div>
            </nav>

            {/* Custom Brand Kit Context Menu */}
            {contextMenu.visible && (
                <div 
                    className="custom-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div 
                        className="p-4 hover:bg-white/10 cursor-pointer flex items-center gap-3 text-sm text-purple-300 transition-colors" 
                        onClick={downloadBrandKit}
                    >
                        <i className="ph ph-download-simple text-lg"></i>
                        <span className="font-bold tracking-wider uppercase text-[11px]">Download Brand Kit</span>
                    </div>
                </div>
            )}
            
            <main className="relative z-10">
                {currentView === 'landing' ? (
                    <Landing 
                        onNavigate={setCurrentView} 
                        uiVisible={uiVisible} 
                        setUiVisible={setUiVisible} 
                    />
                ) : currentView === 'dashboard' ? (
                    <Dashboard />
                ) : (
                    /* Placeholder for Features/Pricing to maintain layout integrity */
                    <div className="h-screen flex items-center justify-center animate-[fadeIn_1s_ease-out]">
                        <div className="text-center">
                            <h2 className="text-4xl md:text-6xl font-bold mb-4 uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">
                                {currentView}
                            </h2>
                            <p className="text-gray-400 tracking-widest text-xs uppercase mb-8">This module is under deployment.</p>
                            <button 
                                onClick={() => setCurrentView('landing')} 
                                className="px-8 py-3 border border-white/20 rounded-full text-[10px] tracking-[0.2em] uppercase hover:bg-white/10 transition-colors"
                            >
                                Return Home
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;