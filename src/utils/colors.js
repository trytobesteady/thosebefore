// 8 distinct colors — stable per person ID
const COLORS = [
  { bg: "#3b82f6", dark: "#2563eb" }, // blue-500
  { bg: "#ef4444", dark: "#dc2626" }, // red-500
  { bg: "#10b981", dark: "#059669" }, // emerald-500
  { bg: "#f59e0b", dark: "#d97706" }, // amber-500
  { bg: "#8b5cf6", dark: "#7c3aed" }, // violet-500
  { bg: "#ec4899", dark: "#db2777" }, // pink-500
  { bg: "#14b8a6", dark: "#0d9488" }, // teal-500
  { bg: "#f97316", dark: "#ea580c" }, // orange-500
];

export function getColorForId(id) {
  // Simple hash of entity ID (e.g. "Q762") → stable index
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}
