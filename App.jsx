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
        // Logic for brand kit download would go here
    };

    return (
        <div className="min-h-screen text-white relative font-sans selection:bg-purple-500/30">
            <BackgroundWaves />
            
            {/* Navbar with Cinematic Fade-In linked to Landing video state */}
            <nav className={`fixed top-0 left-0 w-full z-50 px-8 py-8 flex justify-between items-center transition-all duration-1000 ${uiVisible || currentView !== 'landing' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <div 
                    className="cursor-pointer nav-link flex items-center"
                    onClick={() => setCurrentView('landing')}
                    onContextMenu={handleLogoRightClick}
                >
                    <img src="/Onboardin.png" alt="Onboardin" className="h-10 md:h-12 w-auto object-contain" />
                </div>
                <div className="flex gap-8 text-sm md:text-base tracking-[0.2em] uppercase font-light">
                    <button 
                        onClick={() => setCurrentView('dashboard')} 
                        className="nav-link bg-transparent border-none cursor-pointer text-purple-300 font-bold hover:text-white transition-colors"
                    >
                        {currentView === 'dashboard' ? 'Admin' : 'Login'}
                    </button>
                </div>
            </nav>

            {/* Custom Brand Kit Context Menu (Right-click Logo) */}
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
            
            <main>
                {currentView === 'landing' ? (
                    <Landing 
                        onNavigate={setCurrentView} 
                        uiVisible={uiVisible} 
                        setUiVisible={setUiVisible} 
                    />
                ) : (
                    <Dashboard />
                )}
            </main>
        </div>
    );
};

export default App;