export const riskStyles = {
  green: {
    pill: 'border-risks-green/40 bg-risks-green/10 text-risks-green',
    dot: 'bg-risks-green',
  },
  yellow: {
    pill: 'border-risks-yellow/40 bg-risks-yellow/10 text-risks-yellow',
    dot: 'bg-risks-yellow',
  },
  orange: {
    pill: 'border-risks-orange/40 bg-risks-orange/10 text-risks-orange',
    dot: 'bg-risks-orange',
  },
  red: {
    pill: 'border-risks-red/40 bg-risks-red/10 text-risks-red',
    dot: 'bg-risks-red',
  },
};

export function getRiskClasses(level) {
  return riskStyles[level] ?? riskStyles.green;
}
