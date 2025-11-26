import React from 'react';
import { ResponsiveContainer, RadarChart as RechartsRadar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';
import { ScoringBreakdown } from '../types';

interface Props {
  scoring: ScoringBreakdown;
}

const RadarChart: React.FC<Props> = ({ scoring }) => {
  const data = [
    { subject: 'Skill (x1)', A: scoring.factors.x1 * 100, fullMark: 100, label: 'Abilità' },
    { subject: 'Efficienza (x2)', A: scoring.factors.x2 * 100, fullMark: 100, label: 'Efficienza' },
    { subject: 'Prob. (x3)', A: scoring.factors.x3 * 100, fullMark: 100, label: 'Probabilità' },
    { subject: 'Sicurezza (x4)', A: scoring.factors.x4 * 100, fullMark: 100, label: 'Sicurezza' },
    { subject: 'Crescita (x5)', A: scoring.factors.x5 * 100, fullMark: 100, label: 'Crescita' },
    { subject: 'Utilità (x6)', A: scoring.factors.x6 * 100, fullMark: 100, label: 'Utilità' },
    { subject: 'Urgenza (x7)', A: scoring.factors.x7 * 100, fullMark: 100, label: 'Urgenza' },
    { subject: 'Costanza (x8)', A: scoring.factors.x8 * 100, fullMark: 100, label: 'Costanza' },
    { subject: 'Fiducia (x9)', A: scoring.factors.x9 * 100, fullMark: 100, label: 'Fiducia' },
  ];

  return (
    <div className="w-full h-64 text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadar cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#475569" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Punteggio Fattore"
            dataKey="A"
            stroke="#818cf8"
            fill="#818cf8"
            fillOpacity={0.6}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
            itemStyle={{ color: '#818cf8' }}
          />
        </RechartsRadar>
      </ResponsiveContainer>
    </div>
  );
};

export default RadarChart;