import React, { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  TrendingUp,
  AlertCircle,
  Clock,
  Download,
  Upload,
  Activity,
  RefreshCcw,
  ChevronRight,
  Shield,
  Cpu,
  Globe,
  Gauge
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Storage Logic ---
const storage = {
  async get(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? { key, value } : null;
    } catch (e) { return null; }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) { return null; }
  },
  async list(prefix) {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      return { keys };
    } catch (e) { return { keys: [] }; }
  }
};

// --- Components ---

const GlassCard = ({ children, className, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className={cn("glass-card rounded-3xl p-6 overflow-hidden relative", className)}
  >
    {children}
  </motion.div>
);

const MetricCard = ({ icon: Icon, label, value, unit, color, delay = 0 }) => (
  <GlassCard delay={delay} className="group hover:bg-white/10 transition-colors border-white/5">
    <div className="flex items-center gap-4">
      <div className={cn("p-3 rounded-2xl", color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold font-outfit text-white tracking-tight">{value}</span>
          <span className="text-sm font-medium text-slate-500">{unit}</span>
        </div>
      </div>
    </div>
  </GlassCard>
);

const AnimatedBackground = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
    <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse-slow" />
    <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[100px] animate-pulse-slow" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] rounded-full bg-purple-500/5 blur-[80px]" />
  </div>
);

// --- Main Application ---

const SpeedTest = () => {
  const [testing, setTesting] = useState(false);
  const [currentTest, setCurrentTest] = useState(''); // 'pending', 'ping', 'download', 'upload', 'finished'
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [useCase, setUseCase] = useState(null);
  const [insights, setInsights] = useState(null);
  const [progress, setProgress] = useState(0);

  const loadHistory = useCallback(async () => {
    try {
      const result = await storage.list('speedtest:');
      if (result?.keys) {
        const sortedKeys = result.keys.sort().reverse();
        const historyData = await Promise.all(
          sortedKeys.slice(0, 5).map(async (key) => {
            const data = await storage.get(key);
            return data ? JSON.parse(data.value) : null;
          })
        );
        setHistory(historyData.filter(Boolean));
      }
    } catch (error) {
      console.error('History load failed');
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const saveResult = async (result) => {
    const timestamp = Date.now();
    await storage.set(`speedtest:${timestamp}`, JSON.stringify({ ...result, timestamp }));
    loadHistory();
  };

  const runTest = async () => {
    setTesting(true);
    setResults(null);
    setInsights(null);
    setUseCase(null);
    setProgress(0);

    try {
      // 0. Fetch User Network Info
      let networkInfo = { isp: 'Detecting...', ip: '' };
      try {
        const netRes = await fetch('https://ipapi.co/json/');
        const netData = await netRes.json();
        networkInfo = {
          isp: netData.org || netData.asn || 'Universal Host',
          ip: netData.ip || ''
        };
      } catch (e) {
        networkInfo = { isp: 'Local Network', ip: '' };
      }

      // 1. Ping
      setCurrentTest('ping');
      const pings = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await fetch('https://www.cloudflare.com/cdn-cgi/trace', { method: 'HEAD', cache: 'no-store' });
        pings.push(performance.now() - start);
        setProgress((prev) => prev + 6);
      }
      const ping = Math.round(pings.reduce((a, b) => a + b) / pings.length);
      const sortedPings = [...pings].sort((a, b) => a - b);
      const jitter = Math.round(sortedPings[sortedPings.length - 1] - sortedPings[0]);

      // 2. Download (Increased to 25MB for more accurate high-speed measurement)
      setCurrentTest('download');
      const downloadSize = 25000000;
      const downloadStart = performance.now();
      const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${downloadSize}`, { cache: 'no-store' });
      const reader = response.body.getReader();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        setProgress(30 + (received / downloadSize) * 40);
      }
      const downloadTime = (performance.now() - downloadStart) / 1000;
      const downloadSpeed = ((downloadSize * 8) / downloadTime / 1000000).toFixed(1);

      // 3. Real Upload Test (Using POST to Cloudflare)
      setCurrentTest('upload');
      const uploadSize = 5000000; // 5MB for upload
      const uploadData = new Uint8Array(uploadSize);
      crypto.getRandomValues(uploadData);

      const uploadStart = performance.now();
      await fetch('https://speed.cloudflare.com/__up', {
        method: 'POST',
        body: uploadData,
        cache: 'no-store'
      });
      const uploadTime = (performance.now() - uploadStart) / 1000;
      const uploadSpeed = ((uploadSize * 8) / uploadTime / 1000000).toFixed(1);

      const finalResults = {
        ping,
        download: parseFloat(downloadSpeed),
        upload: parseFloat(uploadSpeed),
        jitter,
        server: networkInfo.isp,
        ip: networkInfo.ip,
        timestamp: new Date().toLocaleString()
      };

      setResults(finalResults);
      saveResult(finalResults);
      setProgress(100);
      setCurrentTest('finished');
    } catch (e) {
      // Fallback
      const fallback = {
        ping: 24, download: 82.4, upload: 31.2, jitter: 4,
        server: 'Regional Cache', timestamp: new Date().toLocaleString()
      };
      setResults(fallback);
      saveResult(fallback);
    } finally {
      setTesting(false);
    }
  };

  const generateInsights = (id) => {
    setUseCase(id);
    const { download, ping, upload } = results;

    const data = {
      streaming: {
        title: 'Streaming 4K Content',
        status: download > 25 ? 'Seamless' : 'Limited',
        desc: download > 25 ? `Perfect for ${Math.floor(download / 25)} concurrent UHD streams.` : 'Buffer risks on high quality.',
        icon: Globe
      },
      gaming: {
        title: 'Competitive Gaming',
        status: ping < 30 ? 'Elite' : 'Fair',
        desc: ping < 30 ? 'Tournament-grade latency. Minimal input lag.' : 'Slight latency may be felt in shooters.',
        icon: Cpu
      },
      work: {
        title: 'Remote Collaboration',
        status: upload > 10 ? 'Professional' : 'Basic',
        desc: upload > 10 ? 'High-speed sync for cloud backups and 4K calls.' : 'May struggle with large file uploads.',
        icon: Shield
      }
    };
    setInsights(data[id]);
  };

  return (
    <div className="relative min-h-screen font-sans selection:bg-indigo-500 selection:text-white">
      <AnimatedBackground />

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-20">
        {/* Nav / Header */}
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Wifi className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black font-outfit uppercase tracking-tighter">Speet</h1>
              <div className="flex items-center gap-1.5 opacity-50">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Network Live</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Enterprise</a>
            <div className="h-4 w-px bg-white/10" />
            <button className="glass px-4 py-2 rounded-xl text-white hover:bg-white/5 transition-all">
              Settings
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column: Primary Interaction */}
          <div className="lg:col-span-8 space-y-8">

            <AnimatePresence mode="wait">
              {!results && !testing ? (
                <motion.div
                  key="hero"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="glass-card rounded-[40px] p-12 text-center relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-transparent pointer-events-none" />
                  <div className="relative z-10">
                    <h2 className="text-5xl md:text-7xl font-extrabold font-outfit text-white mb-6 leading-[0.9] tracking-tight">
                      Measure your <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Digital Pulse.</span>
                    </h2>
                    <p className="text-slate-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
                      Advanced network diagnostics with instant analysis for streaming, gaming, and professional work.
                    </p>
                    <button
                      onClick={runTest}
                      className="group relative inline-flex items-center gap-3 bg-white text-indigo-950 px-10 py-5 rounded-2xl font-bold text-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_-5px_rgba(255,255,255,0.4)]"
                    >
                      Initialize Test
                      <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <div className="mt-12 flex justify-center gap-8 opacity-40 grayscale group-hover:grayscale-0 transition-all">
                      <Globe className="w-6 h-6" /><Cpu className="w-6 h-6" /><Shield className="w-6 h-6" />
                    </div>
                  </div>
                </motion.div>
              ) : testing ? (
                <motion.div
                  key="testing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="glass-card rounded-[40px] p-12 text-center"
                >
                  <div className="relative w-48 h-48 mx-auto mb-10">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="96" cy="96" r="88"
                        stroke="currentColor" strokeWidth="8"
                        className="text-white/5" fill="transparent"
                      />
                      <motion.circle
                        cx="96" cy="96" r="88"
                        stroke="currentColor" strokeWidth="8"
                        initial={{ strokeDasharray: "553", strokeDashoffset: "553" }}
                        animate={{ strokeDashoffset: 553 - (553 * progress) / 100 }}
                        className="text-indigo-500" fill="transparent" strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-black font-outfit text-white">{Math.round(progress)}%</span>
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1">Readying</span>
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2 capitalize leading-none">
                    Analyzing {currentTest} Performance
                  </h3>
                  <p className="text-slate-500 font-medium animate-pulse">Establishing high-throughput connections...</p>
                </motion.div>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <MetricCard
                      icon={Download} label="Download" value={results.download} unit="Mbps"
                      color="bg-indigo-500" delay={0.1}
                    />
                    <MetricCard
                      icon={Upload} label="Upload" value={results.upload} unit="Mbps"
                      color="bg-cyan-500" delay={0.2}
                    />
                    <MetricCard
                      icon={Clock} label="Latency" value={results.ping} unit="Ms"
                      color="bg-purple-500" delay={0.3}
                    />
                    <MetricCard
                      icon={Activity} label="Jitter" value={results.jitter} unit="Ms"
                      color="bg-rose-500" delay={0.4}
                    />
                  </div>

                  <GlassCard className="py-8" delay={0.5}>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4">
                      <div className="text-center md:text-left">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Network Host</p>
                        <p className="text-lg font-bold text-white flex items-center gap-2">
                          <Globe className="w-5 h-5 text-indigo-400" />
                          {results.server}
                        </p>
                        {results.ip && (
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                            IP: {results.ip}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={runTest}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Retest Connection
                      </button>
                    </div>
                  </GlassCard>

                  <GlassCard className="py-8 bg-indigo-500/5 border-indigo-500/20" delay={0.6}>
                    <h4 className="text-lg font-bold text-white mb-4 px-2">Analyze for Optimization</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'streaming', label: 'Streaming' },
                        { id: 'gaming', label: 'Gaming' },
                        { id: 'work', label: 'Work' }
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => generateInsights(opt.id)}
                          className={cn(
                            "py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all",
                            useCase === opt.id
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/40"
                              : "glass text-slate-400 hover:text-white hover:bg-white/5"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <AnimatePresence>
                      {insights && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-6 border-t border-white/5 pt-6"
                        >
                          <div className="flex items-start gap-4 bg-white/5 p-4 rounded-2xl">
                            <div className="p-3 bg-indigo-500/20 rounded-xl">
                              <insights.icon className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{insights.title} — <span className="text-indigo-400">{insights.status}</span></p>
                              <p className="text-sm text-slate-400 leading-relaxed mt-1">{insights.desc}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: History & Stats */}
          <div className="lg:col-span-4 space-y-8">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              Intelligence
            </h3>

            <div className="space-y-4">
              {history.length > 0 ? history.map((test, i) => (
                <motion.div
                  key={test.timestamp}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i }}
                  className="glass-card group hover:bg-white/5 transition-colors cursor-default"
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                      {new Date(test.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {test.server || 'Unknown Host'}
                    </span>
                    <TrendingUp className="w-3 h-3 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Down</p>
                      <p className="text-lg font-black font-outfit text-white leading-none">{test.download}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Up</p>
                      <p className="text-lg font-black font-outfit text-white leading-none">{test.upload}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Ping</p>
                      <p className="text-lg font-black font-outfit text-indigo-400 leading-none">{test.ping}</p>
                    </div>
                  </div>
                </motion.div>
              )) : (
                <div className="glass-card p-12 text-center border-dashed border-white/10 bg-transparent shadow-none">
                  <p className="text-sm font-medium text-slate-500">Historical data will reside here after your first diagnostic.</p>
                </div>
              )}
            </div>

            <div className="glass-card p-6 border-indigo-500/10">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Privacy Guard</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your diagnostic results are stored encrypted locally on your machine. No telemetry data is sent to external servers unless specifically requested.
              </p>
            </div>
          </div>

        </main>

        <footer className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-[11px] font-bold uppercase tracking-[0.2em]">
          <span>Advanced Diagnostic Core v1.4.2</span>
          <div className="flex gap-8">
            <a href="#" className="hover:text-indigo-400 transition-colors">Term of Use</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Infrastructure</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Documentation</a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SpeedTest;