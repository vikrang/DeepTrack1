const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export function donutChart(segments, { size = 200, stroke = 26 } = {}) {
  const total = segments.reduce((sum, s) => sum + Math.max(Number(s.value) || 0, 0), 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = segments
    .filter((s) => Number(s.value) > 0)
    .map((s) => {
      const length = total ? (Number(s.value) / total) * circumference : 0;
      const visible = Math.max(length - gap, 0.6);
      const arc = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${s.color}"
        stroke-width="${stroke}" stroke-dasharray="${visible} ${circumference - visible}"
        stroke-dashoffset="${-offset}" stroke-linecap="round"
        transform="rotate(-90 ${center} ${center})">
        <title>${s.label}: ${money(s.value)}</title>
      </circle>`;
      offset += length;
      return arc;
    })
    .join("");

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="donut" role="img" aria-label="Allocation chart">
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--line)" stroke-width="${stroke}" opacity="0.7"/>
    ${arcs}
  </svg>`;
}

export function miniBars(values, { width = 120, height = 36, color = "currentColor" } = {}) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const step = width / values.length;
  const barWidth = Math.max(step * 0.55, 3);
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${values
      .map((v, i) => {
        const h = Math.max((v / max) * (height - 4), 3);
        return `<rect x="${i * step}" y="${height - h}" width="${barWidth}" height="${h}" rx="2" fill="${color}" opacity="${0.35 + (i / values.length) * 0.65}"/>`;
      })
      .join("")}
  </svg>`;
}
