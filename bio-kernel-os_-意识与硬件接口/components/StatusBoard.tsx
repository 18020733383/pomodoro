
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BioCall } from '../types';

interface StatusBoardProps {
  calls: BioCall[];
}

const StatusBoard: React.FC<StatusBoardProps> = ({ calls }) => {
  const chartData = calls.map(c => ({
    time: new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    level: c.parameters.level,
    system: c.parameters.system
  }));

  const lastCall = calls[calls.length - 1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '心血管负载', value: lastCall?.parameters.system === '心血管' ? `${lastCall.parameters.level}%` : '稳定' },
          { label: '神经活跃度', value: lastCall?.parameters.system === '神经网络' ? `${lastCall.parameters.level}%` : '标准' },
          { label: '内核温度', value: '36.8°C' },
          { label: '系统架构', value: 'Carbon-v2.5' }
        ].map((stat, i) => (
          <div key={i} className="bg-black/40 p-3 rounded border border-green-900/20 bio-border">
            <div className="text-xs text-green-700 uppercase tracking-widest">{stat.label}</div>
            <div className="text-xl font-mono text-green-400">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-black/40 p-4 rounded border border-green-900/20 h-64">
        <h3 className="text-xs text-green-700 mb-4 uppercase tracking-widest">硬件指标波动 (实时)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#14532d" vertical={false} />
            <XAxis dataKey="time" stroke="#166534" fontSize={10} />
            <YAxis stroke="#166534" fontSize={10} domain={[0, 100]} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#000', border: '1px solid #14532d', color: '#22c55e' }}
              itemStyle={{ color: '#22c55e' }}
            />
            <Area type="monotone" dataKey="level" stroke="#22c55e" fillOpacity={1} fill="url(#colorLevel)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StatusBoard;
