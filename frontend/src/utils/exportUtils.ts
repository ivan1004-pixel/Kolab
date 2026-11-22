/**
 * Utilidades de exportación de Kolab (RF-80, RF-81, RF-82).
 * Permiten descargar reportes CSV y generar vistas PDF imprimibles limpias sin dependencias externas.
 */

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportHtmlToPdf(title: string, sectionsHtml: string) {
  const win = window.open('', '_blank', 'width=900,height=720');
  if (!win) {
    window.print();
    return;
  }
  const safeTitle = title.replace(/[<>]/g, '');
  win.document.open();
  win.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle} · Kolab</title>
  <style>
    body { font-family: 'Nunito', system-ui, -apple-system, sans-serif; color: #123642; margin: 32px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #157f3c; padding-bottom: 12px; margin-bottom: 24px; }
    .brand { font-size: 20px; font-weight: 900; color: #157f3c; }
    .date { font-size: 12px; color: #4b6a62; }
    h1 { font-size: 22px; margin: 0 0 8px; color: #0c3e21; }
    h2 { font-size: 16px; margin: 20px 0 8px; color: #157f3c; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    th, td { border: 1px solid #cfe3d0; padding: 8px 10px; text-align: left; }
    th { background: #e8f3e6; color: #0c3e21; font-weight: 800; }
    .card { border: 1px solid #cfe3d0; border-radius: 10px; padding: 14px; margin-bottom: 12px; background: #fbfdfb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #dcfce7; color: #0c3e21; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <span class="brand">KOLAB · Reporte Académico</span>
    <span class="date">Generado: ${new Date().toLocaleString('es-MX')}</span>
  </div>
  <h1>${safeTitle}</h1>
  ${sectionsHtml}
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}

export function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
