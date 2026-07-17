// Service state machine — mirrors service-state-machine.md and the
// schedule_portal.card_transition() RPC. Keep the two in sync.

export const STATUSES = [
  'unscheduled', 'scheduled', 'assigned', 'in_progress',
  'on_hold', 'completed', 'rework', 'invoiced', 'paid', 'cancelled',
]

// Allowed { from: [to, ...] } transitions.
const EDGES = {
  unscheduled: ['scheduled'],
  scheduled: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['on_hold', 'completed'],
  on_hold: ['in_progress'],
  completed: ['rework', 'invoiced'],
  rework: ['in_progress'],
  invoiced: ['paid'],
  paid: [],
  cancelled: [],
}

// cancelled is reachable from anything except paid (per contract).
export function allowedTransitions(from) {
  const base = EDGES[from] ? [...EDGES[from]] : []
  if (from !== 'paid' && from !== 'cancelled') base.push('cancelled')
  return base
}

export const STATUS_META = {
  unscheduled: { label: 'Unscheduled', color: '#94a3b8' },
  scheduled: { label: 'Scheduled', color: '#6366f1' },
  assigned: { label: 'Assigned', color: '#0ea5e9' },
  in_progress: { label: 'In progress', color: '#f59e0b' },
  on_hold: { label: 'On hold', color: '#a855f7' },
  completed: { label: 'Completed', color: '#22c55e' },
  rework: { label: 'Rework', color: '#ef4444' },
  invoiced: { label: 'Invoiced', color: '#14b8a6' },
  paid: { label: 'Paid', color: '#16a34a' },
  cancelled: { label: 'Cancelled', color: '#64748b' },
}
