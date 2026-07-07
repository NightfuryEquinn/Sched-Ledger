import { useState } from "react";

function Donut({ data, size = 220, thickness = 30, onHover, activeId }) {
  // data: [{id,label,value,color}]
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = size / 2;
  const r = R - thickness / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const segs = data.map((d) => {
    const frac = d.value / total;
    const seg = { ...d, frac, offset: acc, dash: frac * C };
    acc += frac;
    return seg;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <g transform={`rotate(-90 ${R} ${R})`}>
        {segs.map((s) => {
          const dim = activeId && activeId !== s.id;
          return (
            <circle
              key={s.id}
              cx={R} cy={R} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={activeId === s.id ? thickness + 4 : thickness}
              strokeDasharray={`${Math.max(s.dash - 1.5, 0)} ${C - Math.max(s.dash - 1.5, 0)}`}
              strokeDashoffset={-s.offset * C}
              strokeLinecap="butt"
              opacity={dim ? 0.32 : 1}
              style={{ transition: "opacity .2s, stroke-width .2s, r .2s", cursor: "pointer" }}
              onMouseEnter={() => onHover && onHover(s.id)}
              onMouseLeave={() => onHover && onHover(null)}
            />
          );
        })}
      </g>
    </svg>
  );
}

function AreaTrend({ points, width = 720, height = 200, accent, budgetLine, showDots }) {
  // points: [{x: label, v: number}]
  const padL = 8, padR = 8, padT = 14, padB = 22;
  const W = width, H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxV = Math.max(budgetLine || 0, ...points.map((p) => p.v), 1);
  const nice = Math.ceil(maxV / 100) * 100 || maxV;
  const x = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / nice) * innerH;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const gid = "ag" + Math.round((accent || "").length + width);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.26" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={padL} x2={W - padR} y1={padT + innerH * (1 - g)} y2={padT + innerH * (1 - g)}
          stroke="var(--hair)" strokeWidth="1" />
      ))}
      {budgetLine ? (
        <line x1={padL} x2={W - padR} y1={y(budgetLine)} y2={y(budgetLine)}
          stroke="var(--ink-soft)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
      ) : null}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {showDots && points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.v)} r="3" fill="var(--surface)" stroke={accent} strokeWidth="2" />
      ))}
      {/* x labels (sparse) */}
      {points.map((p, i) => {
        const step = Math.ceil(points.length / 8);
        if (i % step !== 0 && i !== points.length - 1) return null;
        return (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="var(--ink-faint)"
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontFamily="var(--font-mono)">{p.x}</text>
        );
      })}
    </svg>
  );
}

function MoMBars({ months, accent, height = 220, activeKey, onSelect, budget }) {
  // months: [{key,label,spent}]
  const W = 720, H = height;
  const padL = 8, padR = 8, padT = 16, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxV = Math.max(budget || 0, ...months.map((m) => m.spent), 1);
  const nice = Math.ceil(maxV / 200) * 200 || maxV;
  const slot = innerW / months.length;
  const bw = Math.min(slot * 0.5, 54);
  const y = (v) => padT + innerH - (v / nice) * innerH;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {[0.5, 1].map((g) => (
        <line key={g} x1={padL} x2={W - padR} y1={padT + innerH * (1 - g)} y2={padT + innerH * (1 - g)}
          stroke="var(--hair)" />
      ))}
      {budget ? (
        <line x1={padL} x2={W - padR} y1={y(budget)} y2={y(budget)}
          stroke="var(--ink-soft)" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.55" />
      ) : null}
      {months.map((m, i) => {
        const cx = padL + slot * i + slot / 2;
        const active = m.key === activeKey;
        const h = innerH - (y(m.spent) - padT);
        const labelEvery = months.length > 24 ? 5 : months.length > 14 ? 3 : months.length > 8 ? 2 : 1;
        const showLabel = i % labelEvery === 0 || i === months.length - 1;
        return (
          <g key={m.key} style={{ cursor: "pointer" }} onClick={() => onSelect && onSelect(m.key)}>
            <rect x={cx - bw / 2} y={y(m.spent)} width={bw} height={Math.max(h, 1)} rx="6"
              fill={accent} opacity={active ? 1 : 0.32}
              style={{ transition: "opacity .2s" }} />
            {showLabel ? (
              <text x={cx} y={H - 9} fontSize="11" textAnchor="middle"
                fill={active ? "var(--ink)" : "var(--ink-faint)"}
                fontFamily="var(--font-mono)" fontWeight={active ? 700 : 400}>{m.label}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function MiniSpark({ values, color, width = 90, height = 28 }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const rng = max - min || 1;
  const x = (i) => (i / (values.length - 1)) * width;
  const y = (v) => height - 2 - ((v - min) / rng) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export { Donut, AreaTrend, MoMBars, MiniSpark };
