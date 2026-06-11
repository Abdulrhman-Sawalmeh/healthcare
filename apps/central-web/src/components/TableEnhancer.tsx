import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const enhancedAttribute = "data-enhanced-table";

function getCellText(row: HTMLTableRowElement, index: number) {
  return (row.cells[index]?.textContent ?? "").trim();
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function enhanceTable(table: HTMLTableElement, index: number) {
  if (table.dataset.enhancedTable === "true") {
    return;
  }

  const body = table.tBodies[0];
  const rows = Array.from(body?.rows ?? []);
  const headers = Array.from(table.tHead?.rows[0]?.cells ?? table.rows[0]?.cells ?? []).map(
    (cell, headerIndex) => cell.textContent?.trim() || `عمود ${headerIndex + 1}`
  );

  if (rows.length < 2 || headers.length === 0) {
    return;
  }

  table.dataset.enhancedTable = "true";
  const shell = table.closest(".table-shell, .table-wrapper") ?? table.parentElement;
  if (!shell || shell.previousElementSibling?.getAttribute(enhancedAttribute) === "true") {
    return;
  }

  let currentPage = 1;
  let pageSize = 10;
  let filteredRows = rows;

  const controls = document.createElement("div");
  controls.className = "table-controls";
  controls.setAttribute(enhancedAttribute, "true");
  controls.dir = "rtl";

  const search = document.createElement("input");
  search.className = "toolbar-input table-search";
  search.type = "search";
  search.placeholder = "بحث متقدم داخل الجدول...";
  search.setAttribute("aria-label", "بحث داخل الجدول");

  const columnFilter = document.createElement("select");
  columnFilter.className = "toolbar-input table-filter";
  columnFilter.setAttribute("aria-label", "فلترة حسب العمود");
  columnFilter.innerHTML = `<option value="all">كل الأعمدة</option>${headers
    .map((header, headerIndex) => `<option value="${headerIndex}">${header}</option>`)
    .join("")}`;

  const pageSizeSelect = document.createElement("select");
  pageSizeSelect.className = "toolbar-input table-page-size";
  pageSizeSelect.setAttribute("aria-label", "عدد الصفوف في الصفحة");
  pageSizeSelect.innerHTML = [10, 25, 50, 100]
    .map((size) => `<option value="${size}">${size} صف</option>`)
    .join("");

  const exportCsv = document.createElement("button");
  exportCsv.className = "ghost-button table-action-button";
  exportCsv.type = "button";
  exportCsv.textContent = "Excel";

  const exportPdf = document.createElement("button");
  exportPdf.className = "ghost-button table-action-button";
  exportPdf.type = "button";
  exportPdf.textContent = "PDF";

  const status = document.createElement("span");
  status.className = "table-status";
  status.setAttribute("aria-live", "polite");

  const previous = document.createElement("button");
  previous.className = "ghost-button table-action-button";
  previous.type = "button";
  previous.textContent = "السابق";

  const next = document.createElement("button");
  next.className = "ghost-button table-action-button";
  next.type = "button";
  next.textContent = "التالي";

  controls.append(search, columnFilter, pageSizeSelect, exportCsv, exportPdf, status, previous, next);
  shell.insertAdjacentElement("beforebegin", controls);

  function render() {
    const term = search.value.trim().toLowerCase();
    const selectedColumn = columnFilter.value;

    filteredRows = rows.filter((row) => {
      if (!term) {
        return true;
      }

      if (selectedColumn === "all") {
        return row.textContent?.toLowerCase().includes(term) ?? false;
      }

      return getCellText(row, Number(selectedColumn)).toLowerCase().includes(term);
    });

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const visibleRows = new Set(filteredRows.slice(start, start + pageSize));

    rows.forEach((row) => {
      row.hidden = !visibleRows.has(row);
    });

    status.textContent = `عرض ${filteredRows.length === 0 ? 0 : start + 1}-${Math.min(
      start + pageSize,
      filteredRows.length
    )} من ${filteredRows.length}`;
    previous.disabled = currentPage <= 1;
    next.disabled = currentPage >= totalPages;
  }

  function exportRows() {
    const csvRows = [headers, ...filteredRows.map((row) => headers.map((_, i) => getCellText(row, i)))];
    downloadFile(
      `table-${index + 1}.csv`,
      `\uFEFF${csvRows.map((row) => row.map(csvEscape).join(",")).join("\n")}`,
      "text/csv;charset=utf-8"
    );
  }

  function printRows() {
    const printable = window.open("", "_blank", "width=1024,height=768");
    if (!printable) {
      return;
    }

    const tableRows = filteredRows
      .map(
        (row) =>
          `<tr>${headers.map((_, i) => `<td>${getCellText(row, i)}</td>`).join("")}</tr>`
      )
      .join("");

    printable.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>تصدير PDF</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #17322d; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d8e2dd; padding: 10px; text-align: right; }
            th { background: #eef7f2; }
          </style>
        </head>
        <body>
          <h1>تصدير الجدول</h1>
          <table>
            <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  }

  search.addEventListener("input", () => {
    currentPage = 1;
    render();
  });
  columnFilter.addEventListener("change", () => {
    currentPage = 1;
    render();
  });
  pageSizeSelect.addEventListener("change", () => {
    pageSize = Number(pageSizeSelect.value);
    currentPage = 1;
    render();
  });
  previous.addEventListener("click", () => {
    currentPage -= 1;
    render();
  });
  next.addEventListener("click", () => {
    currentPage += 1;
    render();
  });
  exportCsv.addEventListener("click", exportRows);
  exportPdf.addEventListener("click", printRows);

  render();
}

export function TableEnhancer() {
  const location = useLocation();

  useEffect(() => {
    const id = window.setTimeout(() => {
      document
        .querySelectorAll<HTMLTableElement>(".table-shell table, .table-wrapper table, table.data-table")
        .forEach(enhanceTable);
    }, 80);

    return () => window.clearTimeout(id);
  }, [location.pathname]);

  return null;
}
