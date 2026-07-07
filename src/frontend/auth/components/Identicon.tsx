type IdenticonProps = {
  address: string;
  size?: number;
  radius?: number;
};

export function Identicon({ address, size = 44, radius = 12 }: IdenticonProps) {
  const hex = (address || "").replace(/^0x/, "").toLowerCase().padEnd(40, "0");
  const bytes: number[] = [];
  for (let i = 0; i < 40; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16) || 0);
  const hue = Math.round(((bytes[0] ?? 0) / 255) * 360);
  const on = `hsl(${hue} 48% 56%)`;
  const bg = `hsl(${(hue + 36) % 360} 40% 30%)`;
  const cells = 5;
  const cell = size / cells;
  const rects = [];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < 3; x++) {
      if ((bytes[y * 3 + x] ?? 0) % 2 === 0) {
        rects.push(
          <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell + 0.6} height={cell + 0.6} fill={on} />,
        );
        if (x < 2) {
          rects.push(
            <rect key={`m${x}-${y}`} x={(4 - x) * cell} y={y * cell} width={cell + 0.6} height={cell + 0.6} fill={on} />,
          );
        }
      }
    }
  }
  return (
    <span className="identicon" style={{ width: size, height: size, borderRadius: radius }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background: bg, display: "block" }}>
        {rects}
      </svg>
    </span>
  );
}
