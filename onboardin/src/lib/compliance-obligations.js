/**
 * Ticket #08 — Recurring compliance obligations (maintenance phase).
 * Separate from Step 06 (#07) one-time privacy/compliance artifacts.
 */

export function computeObligationStatus(obligation) {
  if (!obligation) return 'upcoming';
  if (obligation.status === 'done' || obligation.status === 'waived') return obligation.status;
  if (!obligation.due_date) return obligation.status || 'upcoming';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${obligation.due_date}T00:00:00`);
  const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);
  const reminderDays = obligation.reminder_days ?? 14;

  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= reminderDays) return 'due-soon';
  return 'upcoming';
}

export function daysUntilDue(dueDate) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function enrichObligation(row) {
  const status = computeObligationStatus(row);
  const days = daysUntilDue(row.due_date);
  return { ...row, effectiveStatus: status, daysUntil: days };
}

export function canAccessComplianceCalendar(profile) {
  const plan = profile?.plan ?? 'starter';
  const isPaid = plan === 'growth' || plan === 'enterprise';
  if (!isPaid) return { access: false, reason: 'growth' };

  const lifecycle = profile?.lifecycle ?? 'onboarding';
  const step = profile?.onboarding_step ?? 0;
  if (lifecycle === 'active' || step >= 7) return { access: true };
  return { access: false, reason: 'lifecycle' };
}

export function statusPillClass(status) {
  switch (status) {
    case 'overdue':
      return 'bg-red-400/10 text-red-300 border-red-400/20';
    case 'due-soon':
      return 'bg-amber-400/10 text-amber-300 border-amber-400/20';
    case 'done':
      return 'bg-green-400/10 text-green-300 border-green-400/20';
    case 'waived':
      return 'bg-white/5 text-gray-400 border-white/10';
    default:
      return 'bg-blue-400/10 text-blue-300 border-blue-400/20';
  }
}

export function statusBorderClass(status) {
  switch (status) {
    case 'overdue':
      return 'border-l-red-400';
    case 'due-soon':
      return 'border-l-amber-400';
    case 'done':
      return 'border-l-green-400/60 opacity-70';
    case 'waived':
      return 'border-l-white/10 opacity-50';
    default:
      return 'border-l-blue-400/50';
  }
}

export function statusLabel(status, daysUntil) {
  if (status === 'done') return 'Done';
  if (status === 'waived') return 'Waived';
  if (status === 'overdue' && daysUntil != null) return `${Math.abs(daysUntil)} days late`;
  if (status === 'due-soon' && daysUntil != null) return daysUntil === 0 ? 'Due today' : `${daysUntil} days`;
  if (daysUntil != null && daysUntil > 0) return `${daysUntil} days`;
  return 'Upcoming';
}

export function categoryIcon(category) {
  switch (category) {
    case 'tax':
      return 'ph-receipt';
    case 'statutory':
      return 'ph-users';
    case 'corporate':
      return 'ph-buildings';
    default:
      return 'ph-file-text';
  }
}

export function categoryIconBg(status) {
  switch (status) {
    case 'overdue':
      return 'bg-red-400/10 text-red-300';
    case 'due-soon':
      return 'bg-amber-400/10 text-amber-300';
    case 'done':
      return 'bg-green-400/10 text-green-300';
    default:
      return 'bg-blue-400/10 text-blue-300';
  }
}

export function formatDueDateParts(dueDate) {
  if (!dueDate) return { day: '—', month: '' };
  const d = new Date(`${dueDate}T00:00:00`);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
}

export function groupObligationsForCalendar(obligations) {
  const overdue = [];
  const byMonth = new Map();
  const completed = [];

  obligations.forEach((ob) => {
    const status = ob.effectiveStatus || computeObligationStatus(ob);
    if (status === 'done' || status === 'waived') {
      completed.push(ob);
      return;
    }
    if (status === 'overdue') {
      overdue.push(ob);
      return;
    }
    if (!ob.due_date) {
      const key = 'No date';
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(ob);
      return;
    }
    const d = new Date(`${ob.due_date}T00:00:00`);
    const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(ob);
  });

  const months = [...byMonth.entries()].sort((a, b) => {
    const da = a[1][0]?.due_date ? new Date(`${a[1][0].due_date}T00:00:00`).getTime() : 0;
    const db = b[1][0]?.due_date ? new Date(`${b[1][0].due_date}T00:00:00`).getTime() : 0;
    return da - db;
  });

  return { overdue, months, completed };
}

export function obligationStats(obligations) {
  let overdue = 0;
  let dueSoon = 0;
  let upcoming = 0;
  let completed = 0;

  obligations.forEach((ob) => {
    const status = ob.effectiveStatus || computeObligationStatus(ob);
    if (status === 'done' || status === 'waived') completed += 1;
    else if (status === 'overdue') overdue += 1;
    else if (status === 'due-soon') dueSoon += 1;
    else upcoming += 1;
  });

  return { overdue, dueSoon, upcoming, completed };
}