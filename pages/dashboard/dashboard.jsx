import React from 'react';

const IntegrationCard = ({ icon, name, desc }) => (
    <div className="bg-white/5 border border-white/10 p-6 rounded-xl hover:bg-white/10 transition-all duration-300 backdrop-blur-md group cursor-pointer">
        <div className="text-3xl mb-4 text-blue-400 group-hover:text-purple-400 transition-colors">
            {icon}
        </div>
        <h3 className="text-xl font-bold mb-2">{name}</h3>
        <p className="text-gray-300 text-sm leading-relaxed">{desc}</p>
    </div>
);

const Dashboard = () => {
    return (
        <div className="pt-28 px-6 md:px-16 min-h-screen animate-[fadeIn_1s_ease-out]">
            <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400 uppercase tracking-tighter">Admin Console</h1>
                    <p className="text-sm text-gray-400 mt-2">Backend Automation & Service Integration</p>
                </div>
                <div className="hidden md:block text-right">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-green-400 border border-green-400/20 px-4 py-2 rounded-full bg-green-400/5">System Status: Active</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Environment Variables Section */}
                <div className="col-span-1 md:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                        <i className="ph ph-shield-check text-purple-400"></i> API Environment
                    </h3>
                    <div className="space-y-5">
                        {[
                            { label: 'OPENAI_KEY', value: 'sk-proj-........................' },
                            { label: 'WAVE_TOKEN', value: 'wv-auth-........................' },
                            { label: 'SUPABASE_URL', value: 'https://onboardin.supabase.co' }
                        ].map((item) => (
                            <div key={item.label} className="flex flex-col md:flex-row gap-3 md:items-center">
                                <span className="w-36 text-xs font-bold text-gray-500 tracking-widest uppercase">{item.label}</span>
                                <div className="flex-1 flex gap-2">
                                    <input 
                                        type="password" 
                                        value={item.value} 
                                        disabled 
                                        className="flex-1 bg-black/40 border border-white/5 rounded-lg px-4 py-3 text-sm text-gray-400 font-mono focus:outline-none" 
                                    />
                                    <button className="text-[10px] font-bold bg-white/5 px-5 py-2 rounded-lg hover:bg-white/10 transition-all uppercase tracking-widest border border-white/5">Edit</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Deployments Section */}
                <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
                    <h3 className="text-xl font-bold mb-6">Deployments</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-white/5 p-5 rounded-xl border border-white/5 hover:border-green-500/30 transition-all cursor-pointer group">
                            <div className="flex items-center gap-3">
                                <i className="ph ph-robot text-xl text-blue-400 group-hover:scale-110 transition-transform"></i>
                                <span className="text-sm font-medium">Clawbot v2.1</span>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        </div>
                        <div className="flex items-center justify-between bg-white/5 p-5 rounded-xl border border-white/5 opacity-40 cursor-not-allowed">
                            <div className="flex items-center gap-3">
                                <i className="ph ph-receipt text-xl text-gray-500"></i>
                                <span className="text-sm font-medium">Tax Agent</span>
                            </div>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">Standby</span>
                        </div>
                    </div>
                    <div className="mt-8 pt-6 border-t border-white/5 text-center">
                        <button className="text-[10px] text-purple-300 font-bold uppercase tracking-widest hover:text-white transition-colors">Launch New Worker</button>
                    </div>
                </div>
            </div>

            {/* Integration Grid */}
            <div className="mt-12">
                <h3 className="text-xl font-bold mb-6 opacity-60 uppercase tracking-widest text-sm">Connected Services</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                    <IntegrationCard 
                        icon={<i className="ph ph-github-logo"></i>} 
                        name="GitHub" 
                        desc="Deployment Pipeline: Stable" 
                    />
                    <IntegrationCard 
                        icon={<i className="ph ph-waves"></i>} 
                        name="Wave" 
                        desc="Accounting Sync: Active" 
                    />
                    <IntegrationCard 
                        icon={<i className="ph ph-shield-check"></i>} 
                        name="Termly" 
                        desc="Compliance: Up-to-date" 
                    />
                    <IntegrationCard 
                        icon={<i className="ph ph-paper-plane-tilt"></i>} 
                        name="Resend" 
                        desc="Queue: 0 Pending" 
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;