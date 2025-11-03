import React from 'react';

interface Segment {
  value: number; // 0..1 fraction
  color: string;
}

interface DonutRingProps {
  size?: number; // px
  thickness?: number; // px
  segments: Segment[];
  centerLabel?: string;
  animate?: boolean;
}

const DonutRing: React.FC<DonutRingProps> = ({ size = 140, thickness = 18, segments, centerLabel, animate = false }) => {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let start = 0;
  const stops = segments.map(s => {
    const frac = s.value / total;
    const end = start + frac;
    const css = `${s.color} ${Math.round(start * 360)}deg ${Math.round(end * 360)}deg`;
    start = end;
    return css;
  });
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: `conic-gradient(${stops.join(', ')})`,
    display: 'grid',
    placeItems: 'center',
  };
  const innerStyle: React.CSSProperties = {
    width: size - thickness * 2,
    height: size - thickness * 2,
    borderRadius: '50%',
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.08)'
  };
  return (
    <div style={style} className={`ring-mint ${animate ? 'ring-animated' : ''}`}>
      <div style={innerStyle} className="flex items-center justify-center">
        {centerLabel && <span className="text-white text-sm font-semibold">{centerLabel}</span>}
      </div>
    </div>
  );
};

export default DonutRing;