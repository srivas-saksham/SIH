export const systemOverview = {
  project: 'Aegis Command',
  status: 'Realtime resilience monitor',
  incident: 'Port congestion & reroute risk escalation',
  metrics: [
    { label: 'Network integrity', value: '96.2%', risk: 'green' },
    { label: 'Transit resilience', value: '78.4%', risk: 'yellow' },
    { label: 'Supplier dependency', value: '61.7%', risk: 'orange' },
    { label: 'Exposure score', value: '83.1%', risk: 'red' },
  ],
  causalBreakdown: [
    { title: 'Labor bottleneck', detail: 'Dock processing lag increased by 14%', risk: 'red' },
    { title: 'Rail transfer delay', detail: 'Cross-dock queue exceeded SLA window', risk: 'orange' },
    { title: 'Weather disruption', detail: 'Storm cell path intersects northern corridor', risk: 'yellow' },
    { title: 'Inventory buffer', detail: 'Fallback stock remains within target range', risk: 'green' },
  ],
  comparison: [
    { label: 'Baseline', value: '2.4 h' },
    { label: 'Projected', value: '5.1 h' },
    { label: 'Mitigation', value: '3.3 h' },
  ],
};
