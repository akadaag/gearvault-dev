export function getDaysUntilEvent(dateTime: string): { text: string; colorClass: string } {
  const eventDate = new Date(dateTime);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0)  return { text: `${Math.abs(days)}d ago`, colorClass: 'overdue' };
  if (days === 0) return { text: 'Today',               colorClass: 'today' };
  if (days === 1) return { text: '1 day',               colorClass: 'urgent' };
  if (days <= 5)  return { text: `${days} days`,        colorClass: 'upcoming' };
  return           { text: `${days} days`,              colorClass: 'later' };
}
