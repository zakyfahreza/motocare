/** Ikon SVG garis (stroke = currentColor). Dibuat lewat DOM API, tanpa innerHTML. */
const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  oil: [['path', { d: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' }]],
  wrench: [['path', { d: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z' }]],
  cart: [
    ['path', { d: 'M3 4h2l2.4 11h10.2L20 8H6.2' }],
    ['circle', { cx: '9', cy: '20', r: '1.3' }],
    ['circle', { cx: '17', cy: '20', r: '1.3' }],
  ],
  motor: [
    ['circle', { cx: '5', cy: '17', r: '3' }],
    ['circle', { cx: '19', cy: '17', r: '3' }],
    ['path', { d: 'M5 17l4-7h5l5 7M9 10 7.5 6H4.5M14 10l2-4h3' }],
  ],
  chart: [['path', { d: 'M4 20V11M10 20V5M16 20v-7M21 20H3' }]],
  settings: [
    ['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }],
    ['circle', { cx: '15', cy: '7', r: '2' }],
    ['circle', { cx: '9', cy: '17', r: '2' }],
  ],
  chevron: [['path', { d: 'M9 6l6 6-6 6' }]],
};

export function icon(name, size = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  (ICONS[name] || []).forEach(([tag, attrs]) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    svg.appendChild(el);
  });
  return svg;
}
