import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download } from 'lucide-react';

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsv(columns, rows) {
  const escapeCell = (value) => {
    const str = String(value ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(',')).join('\n');
  return `${header}\n${body}`;
}

/**
 * `columns`: [{ label, value: (row) => string }].
 * `rows`: fallback data (e.g. the currently visible page) if `fetchAll` isn't given.
 * `fetchAll`: optional async () => rows[] - when provided, exports pull the
 * complete filtered result set instead of just what's on screen.
 * `serverExport`: optional { csv: () => Promise<AxiosResponse<Blob>>, pdf: () => Promise<AxiosResponse<Blob>> } -
 * when provided (e.g. the backend's own /reports/export/csv|pdf endpoints),
 * these are used instead of building the file client-side.
 */
export default function ExportButtons({ columns, rows, fetchAll, filename, title, serverExport }) {
  const [csvExporting, setCsvExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const noData = rows.length === 0 && !fetchAll && !serverExport;

  const getRows = async () => {
    if (fetchAll) return fetchAll();
    return rows;
  };

  const runExport = async (format) => {
    const setLoading = format === 'csv' ? setCsvExporting : setPdfExporting;
    setLoading(true);
    try {
      if (serverExport) {
        const response = format === 'csv' ? await serverExport.csv() : await serverExport.pdf();
        const mimeType = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/pdf';
        downloadBlob(response.data, `${filename}.${format}`, mimeType);
        return;
      }

      const data = await getRows();
      if (data.length === 0) return;

      if (format === 'csv') {
        downloadBlob(toCsv(columns, data), `${filename}.csv`, 'text/csv;charset=utf-8;');
      } else {
        const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' });
        doc.setFontSize(14);
        doc.text(title, 14, 16);
        autoTable(doc, {
          startY: 22,
          head: [columns.map((c) => c.label)],
          body: data.map((row) => columns.map((c) => c.value(row))),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [79, 70, 229] },
        });
        doc.save(`${filename}.pdf`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="export-buttons">
      <button className="export-btn" onClick={() => runExport('csv')} disabled={csvExporting || noData}>
        <Download size={14} />
        {csvExporting ? 'Exporting…' : 'CSV'}
      </button>
      <button className="export-btn" onClick={() => runExport('pdf')} disabled={pdfExporting || noData}>
        <Download size={14} />
        {pdfExporting ? 'Exporting…' : 'PDF'}
      </button>
    </div>
  );
}
