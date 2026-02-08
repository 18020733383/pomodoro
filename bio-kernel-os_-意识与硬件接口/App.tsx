
import React, { useState, useCallback, useEffect } from 'react';
import { translateToBioCode } from './services/geminiService';
import { BioCall } from './types';
import Terminal from './components/Terminal';
import StatusBoard from './components/StatusBoard';

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [calls, setCalls] = useState<BioCall[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    
    try {
      // Build context from previous calls
      const history = calls
        .slice(-5) // Take last 5 calls for context
        .map(c => `Input: ${c.userInput} -> Code: ${c.code}`)
        .join('\n');

      const result = await translateToBioCode(input, history);
      
      const newCall: BioCall = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        userInput: input,
        code: result.code,
        explanation: result.explanation,
        parameters: result.parameters,
      };

      setCalls(prev => [...prev, newCall]);
      setInput('');
    } catch (err) {
      setError('内核同步失败：无法连接到生物接口。');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto">
      {/* Header */}
      <header className="w-full mb-8 flex flex-col md:flex-row justify-between items-end md:items-center gap-4 border-b border-green-900/30 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-green-500 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-green-500 animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.8)]" />
            BIO-KERNEL OS <span className="text-xs font-normal border border-green-800 px-2 py-0.5 rounded text-green-800">v2.5.0-ALPHA</span>
          </h1>
          <p className="text-green-900 text-sm mt-1 uppercase tracking-widest font-mono"> Consciousness-to-Hardware Bridge Interface </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs text-green-900 font-mono">CONNECTION: ENCRYPTED</p>
          <p className="text-xs text-green-900 font-mono">UPTIME: 14:22:05</p>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Left: Visualization & Stats */}
        <div className="lg:col-span-5 space-y-8 order-2 lg:order-1">
          <StatusBoard calls={calls} />
          
          <div className="p-6 bg-green-950/10 rounded-xl border border-green-900/20 bio-border">
            <h2 className="text-green-500 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-widest">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              实验构想
            </h2>
            <p className="text-green-800 text-xs leading-relaxed">
              如果意识是运行在生物硬件上的软件，那么我们日常的每一个行为——从“喝杯咖啡”到“感到焦虑”——实际上都是对底层硬件 API 的某种形式调用。本程序利用大语言模型（Gemini 3 Pro）的推理能力，尝试将这种抽象的“软件行为”映射到具体的“硬件逻辑”中。
            </p>
          </div>
        </div>

        {/* Right: Terminal & Input */}
        <div className="lg:col-span-7 flex flex-col gap-6 order-1 lg:order-2">
          <Terminal calls={calls} isProcessing={isProcessing} />
          
          <div className="relative group">
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="在此输入您的意识指令或当前生理状态 (例如: '我感到困倦', '刚跑完5公里')..."
                className="w-full bg-black border border-green-900/50 rounded-lg p-5 pl-12 focus:outline-none focus:border-green-500 text-green-100 placeholder:text-green-950 transition-all font-mono shadow-inner"
                disabled={isProcessing}
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-green-900">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              </div>
              <button 
                type="submit"
                disabled={isProcessing || !input.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-green-600 hover:bg-green-500 disabled:bg-green-900 text-black px-4 py-2 rounded text-xs font-bold transition-colors uppercase tracking-widest shadow-[0_0_10px_rgba(34,197,94,0.4)]"
              >
                {isProcessing ? 'EXEC...' : 'COMPILE'}
              </button>
            </form>
            {error && <p className="text-red-500 text-xs mt-2 font-mono">ERROR: {error}</p>}
          </div>
        </div>
      </div>

      {/* Footer Decoration */}
      <footer className="mt-12 w-full text-center border-t border-green-900/10 pt-8 opacity-30">
        <div className="flex justify-center gap-8 mb-4">
          <div className="flex flex-col items-center">
            <div className="w-1 h-12 bg-green-900/50 mb-2" />
            <span className="text-[10px] text-green-900 uppercase font-mono tracking-tighter">Neural Interface</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-1 h-8 bg-green-900/50 mb-2" />
            <span className="text-[10px] text-green-900 uppercase font-mono tracking-tighter">System Integrity</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-1 h-16 bg-green-900/50 mb-2" />
            <span className="text-[10px] text-green-900 uppercase font-mono tracking-tighter">Bio-Clock Sync</span>
          </div>
        </div>
        <p className="text-[10px] text-green-900 uppercase font-mono tracking-[0.3em]">
          All hardware calls are simulations. Biological integrity is not guaranteed.
        </p>
      </footer>
    </div>
  );
};

export default App;
