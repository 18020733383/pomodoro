
import React, { useEffect, useRef } from 'react';
import { BioCall } from '../types';

interface TerminalProps {
  calls: BioCall[];
  isProcessing: boolean;
}

const Terminal: React.FC<TerminalProps> = ({ calls, isProcessing }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [calls, isProcessing]);

  return (
    <div className="bg-black/80 rounded-lg border border-green-900/50 p-4 h-[500px] flex flex-col font-mono text-sm overflow-hidden terminal-glow">
      <div className="flex items-center gap-2 mb-4 border-b border-green-900/30 pb-2">
        <div className="w-3 h-3 rounded-full bg-red-500/50" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
        <div className="w-3 h-3 rounded-full bg-green-500/50" />
        <span className="text-green-500/70 ml-2">bio-kernel@localhost:~/logs</span>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
        {calls.length === 0 && !isProcessing && (
          <div className="text-green-900 italic">等待意识指令输入...</div>
        )}
        
        {calls.map((call) => (
          <div key={call.id} className="animate-in fade-in duration-500">
            <div className="text-blue-400 mb-1 flex justify-between">
              <span>&gt; {call.userInput}</span>
              <span className="text-xs text-gray-600">{new Date(call.timestamp).toLocaleTimeString()}</span>
            </div>
            <pre className="bg-green-950/20 p-2 rounded border border-green-900/20 text-green-400 overflow-x-auto">
              <code>{call.code}</code>
            </pre>
            <div className="text-gray-400 mt-1 text-xs pl-2 border-l border-green-500/30">
              <span className="text-green-600 font-bold">[内核解释]</span> {call.explanation}
            </div>
          </div>
        ))}
        
        {isProcessing && (
          <div className="flex items-center gap-2 text-green-400">
            <span className="animate-pulse">_</span>
            <span className="animate-bounce">指令编译中...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Terminal;
