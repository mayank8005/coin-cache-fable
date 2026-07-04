import type { CategorySlice } from "@/lib/data";

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Annulus sector path between startAngle and endAngle (degrees, clockwise from 12 o'clock). */
function sectorPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const p0 = polar(cx, cy, rOuter, a0);
  const p1 = polar(cx, cy, rOuter, a1);
  const p2 = polar(cx, cy, rInner, a1);
  const p3 = polar(cx, cy, rInner, a0);
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p3.x} ${p3.y}`,
    "Z",
  ].join(" ");
}

export default function Donut(props: {
  slices: CategorySlice[];
  centerTop: string;
  centerBottom: string;
}) {
  const size = 260;
  const c = size / 2;
  const rOuter = 118;
  const rInner = 84;
  const total = props.slices.reduce((s, x) => s + x.amountMinor, 0);

  let angle = 0;
  const paths =
    total > 0
      ? props.slices.map((s) => {
          const sweep = (s.amountMinor / total) * 360;
          const a0 = angle;
          angle += sweep;
          // Full-circle single slice: SVG arcs cannot draw 360°, so cap it.
          const a1 = Math.min(angle, a0 + 359.98);
          return <path key={s.categoryId} d={sectorPath(c, c, rOuter, rInner, a0, a1)} fill={s.color} />;
        })
      : null;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[280px]">
      <circle cx={c} cy={c} r={(rOuter + rInner) / 2} fill="none" stroke="#e6e8e3" strokeWidth={rOuter - rInner} />
      {paths}
      <text x={c} y={c - 6} textAnchor="middle" className="fill-gray-500" fontSize="14">
        {props.centerTop}
      </text>
      <text x={c} y={c + 22} textAnchor="middle" className="fill-gray-900" fontSize="24" fontWeight="700">
        {props.centerBottom}
      </text>
    </svg>
  );
}
