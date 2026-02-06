import jsPDF from 'jspdf';
import type { EventItem } from '../types/models';

export function exportEventToPdf(event: EventItem) {
  const doc = new jsPDF();
  let y = 14;

  doc.setFontSize(18);
  doc.text(`GearVault Packing List: ${event.title}`, 14, y);
  y += 8;

  doc.setFontSize(11);
  doc.text(`Type: ${event.type}`, 14, y);
  y += 6;
  doc.text(`Date: ${event.dateTime ?? 'N/A'} | Location: ${event.location ?? 'N/A'}`, 14, y);
  y += 8;

  doc.setFontSize(13);
  doc.text('Checklist', 14, y);
  y += 6;

  doc.setFontSize(10);
  for (const item of event.packingChecklist) {
    const line = `[${item.packed ? 'x' : ' '}] ${item.name} x${item.quantity} ${item.priority ? `(${item.priority})` : ''}`;
    doc.text(line.slice(0, 110), 14, y);
    y += 5;
    if (y > 280) {
      doc.addPage();
      y = 14;
    }
  }

  if (event.missingItems.length > 0) {
    y += 4;
    doc.setFontSize(13);
    doc.text('Missing items', 14, y);
    y += 6;
    doc.setFontSize(10);

    for (const item of event.missingItems) {
      const line = `- ${item.name} [${item.priority}] ${item.action}: ${item.reason}`;
      doc.text(line.slice(0, 110), 14, y);
      y += 5;
      if (y > 280) {
        doc.addPage();
        y = 14;
      }
    }
  }

  doc.save(`${event.title.replace(/\s+/g, '-').toLowerCase()}-packing-list.pdf`);
}
