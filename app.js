(() => {
  const FALLBACK_CHECKLIST = [
    {
      sectionId: "section1",
      title: "1. 모니터링 솔루션(JENNIFER)",
      groups: [
        {
          groupId: "section1-group1",
          title: "1-1. 액티브 서비스",
          type: "grid",
          cornerHeader: "",
          columns: ["SP", "IM", "OP", "MO", "RD", "FI", "TM", "BA", "CAO"],
          rows: [
            { rowId: "exception", label: "특이사항 여부" },
            { rowId: "cpu", label: "CPU 사용률 이상여부" }
          ]
        },
        {
          groupId: "section1-group2",
          title: "1-2. 기타 특이사항",
          type: "notes"
        }
      ]
    },
    {
      sectionId: "section2",
      title: "2. 연계솔루션(eCross)",
      groups: [
        {
          groupId: "section2-group1",
          title: "2-1. 서버별 전문상태",
          type: "grid",
          cornerHeader: "",
          columns: [
            "ONTRS",
            "EXTRS",
            "NASVR",
            "PITRS",
            "MOEHR",
            "PPSPR",
            "DITRS",
            "VOC SVR"
          ],
          rows: [{ rowId: "exception", label: "특이사항 여부" }]
        },
        {
          groupId: "section2-group2",
          title: "2-2. 기타 특이사항",
          type: "notes"
        }
      ]
    },
    {
      sectionId: "section3",
      title: "3. 시스템 기타 특이사항",
      groups: [
        {
          groupId: "section3-group1",
          title: "3-1. 통합 점검",
          type: "grid",
          cornerHeader: "",
          columns: ["점검"],
          rows: [{ rowId: "exception", label: "특이사항 여부" }]
        },
        {
          groupId: "section3-group2",
          title: "3-2. 기타 특이사항",
          type: "notes"
        }
      ]
    }
  ];

  let checklistDefinition = [];

  const state = {
    items: {},
    notes: {},
    inspectors: []
  };

  const itemMetadata = {};
  const noteMetadata = {};
  const cellElements = new Map();
  const noteElements = new Map();
  const allItemIds = [];
  const noteDependencies = new Map();
  const SAVE_DEBOUNCE_MS = 500;

  let persistTimer = null;
  let lastSavedSignature = "";
  let hasRendered = false;

  const dom = {};

  async function init() {
    cacheDom();
    bindGlobalEvents();
    setDashboardTitle();
    try {
      checklistDefinition = await fetchChecklist();
    } catch (error) {
      console.warn("Failed to fetch checklist definition, using fallback.", error);
      checklistDefinition = FALLBACK_CHECKLIST;
    }

    try {
      const savedState = await fetchSavedState();
      if (savedState) {
        mergeSavedState(savedState);
      }
    } catch (error) {
      console.warn("Failed to load saved state, starting fresh.", error);
    }

    renderChecklist();
    renderInspectors();
    updateProgress();
    toggleNotesAvailability();
    lastSavedSignature = stateSignature(buildStatePayload());
    hasRendered = true;
  }

  function cacheDom() {
    dom.title = document.getElementById("dashboardTitle");
    dom.completedCount = document.getElementById("completedCount");
    dom.completionPercent = document.getElementById("completionPercent");
    dom.progressFill = document.getElementById("progressFill");
    dom.checklistContainer = document.getElementById("checklistContainer");
    dom.inspectorInput = document.getElementById("inspectorInput");
    dom.inspectorList = document.getElementById("inspectorList");
    dom.addInspectorBtn = document.getElementById("addInspectorBtn");
    dom.exportExcelBtn = document.getElementById("exportExcelBtn");
    dom.exportPdfBtn = document.getElementById("exportPdfBtn");
    dom.resetBtn = document.getElementById("resetBtn");
  }

  function bindGlobalEvents() {
    dom.addInspectorBtn.addEventListener("click", handleAddInspector);
    dom.inspectorInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAddInspector();
      }
    });
    dom.exportExcelBtn.addEventListener("click", exportToExcel);
    dom.exportPdfBtn.addEventListener("click", exportToPdf);
    dom.resetBtn.addEventListener("click", resetDashboard);
  }

  function setDashboardTitle() {
    const today = new Date();
    dom.title.textContent = `${formatDate(today)} 온비드 일일점검 체크리스트`;
  }

  function renderChecklist() {
    dom.checklistContainer.innerHTML = "";
    allItemIds.length = 0;
    cellElements.clear();
    noteElements.clear();
    noteDependencies.clear();

    checklistDefinition.forEach(section => {
      const sectionEl = document.createElement("section");
      sectionEl.className = "section";

      const headerEl = document.createElement("div");
      headerEl.className = "section__header";
      headerEl.textContent = section.title;
      sectionEl.appendChild(headerEl);

      let previousGroupItemIds = [];

      section.groups.forEach(group => {
        const groupEl = document.createElement("div");
        groupEl.className = "group";

        const groupTitle = document.createElement("h3");
        groupTitle.className = "group__title";
        groupTitle.textContent = group.title;
        groupEl.appendChild(groupTitle);

        if (group.type === "grid") {
          const groupItemIds = renderGrid(group, section, groupEl);
          previousGroupItemIds = groupItemIds.slice();
        } else if (group.type === "notes") {
          renderNotes(group, section, groupEl, previousGroupItemIds);
        }

        sectionEl.appendChild(groupEl);
      });

      dom.checklistContainer.appendChild(sectionEl);
    });
  }

  function renderGrid(group, section, container) {
    const table = document.createElement("table");
    table.className = "check-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const cornerHeaderText = typeof group.cornerHeader === "string" ? group.cornerHeader : "";
    const cornerHeader = document.createElement("th");
    cornerHeader.className = "row-label";
    cornerHeader.textContent = cornerHeaderText;
    headerRow.appendChild(cornerHeader);

    group.columns.forEach(columnLabel => {
      const th = document.createElement("th");
      th.textContent = columnLabel;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const currentGroupItemIds = [];

    group.rows.forEach(row => {
      const rowEl = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.className = "row-label";
      labelCell.textContent = row.label;
      rowEl.appendChild(labelCell);

      group.columns.forEach(columnLabel => {
        const itemId = buildItemId(section.sectionId, group.groupId, row.rowId, columnLabel);
        currentGroupItemIds.push(itemId);
        allItemIds.push(itemId);

        if (!state.items[itemId]) {
          state.items[itemId] = { selection: null, checkedAt: null };
        }

        itemMetadata[itemId] = {
          sectionTitle: section.title,
          groupTitle: group.title,
          rowLabel: row.label,
          columnLabel
        };

        const td = document.createElement("td");
        const cell = document.createElement("div");
        cell.className = "check-cell";
        cell.dataset.itemId = itemId;

        const toggleWrapper = document.createElement("div");
        toggleWrapper.className = "yn-toggle";

        ["Y", "N"].forEach(value => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = value;
          button.value = value;
          button.addEventListener("click", () => handleSelection(itemId, value));
          toggleWrapper.appendChild(button);
        });

        cell.appendChild(toggleWrapper);
        td.appendChild(cell);
        rowEl.appendChild(td);

        cellElements.set(itemId, cell);
        applySelectionVisual(itemId);
      });

      tbody.appendChild(rowEl);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    return currentGroupItemIds;
  }

  function renderNotes(group, section, container, dependencyItemIds) {
    const noteId = `${section.sectionId}_${group.groupId}_note`;
    if (typeof state.notes[noteId] !== "string") {
      state.notes[noteId] = "";
    }

    noteMetadata[noteId] = {
      sectionTitle: section.title,
      groupTitle: group.title
    };

    const notesWrapper = document.createElement("div");
    notesWrapper.className = "notes-block";
    notesWrapper.dataset.noteId = noteId;
    notesWrapper.dataset.dependsOn = dependencyItemIds.join(",");

    const textarea = document.createElement("textarea");
    textarea.placeholder = "특이사항 내용은 Y 선택 시 입력 가능합니다.";
    textarea.value = state.notes[noteId];
    textarea.disabled = dependencyItemIds.length > 0;
    textarea.addEventListener("input", () => {
      state.notes[noteId] = textarea.value;
      schedulePersist();
    });

    notesWrapper.appendChild(textarea);
    container.appendChild(notesWrapper);
    noteElements.set(noteId, textarea);
    noteDependencies.set(noteId, dependencyItemIds.slice());
  }

  function handleSelection(itemId, value) {
    state.items[itemId] = {
      selection: value,
      checkedAt: new Date().toISOString()
    };
    applySelectionVisual(itemId);
    updateProgress();
    toggleNotesAvailability();
    schedulePersist();
  }

  function applySelectionVisual(itemId) {
    const cell = cellElements.get(itemId);
    if (!cell) return;

    const { selection } = state.items[itemId] || { selection: null };

    cell.classList.remove("value-Y", "value-N");
    const buttons = cell.querySelectorAll("button");
    buttons.forEach(button => {
      button.classList.toggle("active", button.value === selection);
    });

    if (!selection) {
      return;
    }

    cell.classList.add(`value-${selection}`);
  }

  function updateProgress() {
    const total = allItemIds.length;
    const completed = allItemIds.filter(id => !!state.items[id]?.selection).length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    dom.completedCount.textContent = `${completed}/${total}`;
    dom.completionPercent.textContent = `${percent}%`;
    dom.progressFill.style.width = `${percent}%`;
    dom.progressFill.setAttribute("aria-valuenow", String(percent));
  }

  function toggleNotesAvailability() {
    noteElements.forEach((textarea, noteId) => {
      const dependencies = noteDependencies.get(noteId) || [];
      if (dependencies.length === 0) {
        textarea.disabled = false;
        textarea.parentElement.classList.add("enabled");
        return;
      }

      const hasY = dependencies.some(
        depId => state.items[depId]?.selection === "Y"
      );

      textarea.disabled = !hasY;
      textarea.parentElement.classList.toggle("enabled", hasY);

      if (!hasY) {
        textarea.value = "";
        state.notes[noteId] = "";
      }
    });
  }

  function handleAddInspector() {
    const value = dom.inspectorInput.value.trim();
    if (!value) {
      return;
    }
    state.inspectors.push(value);
    dom.inspectorInput.value = "";
    renderInspectors();
    schedulePersist();
  }

  function renderInspectors() {
    dom.inspectorList.innerHTML = "";
    state.inspectors.forEach((name, index) => {
      const chip = document.createElement("span");
      chip.className = "inspector-chip";
      chip.textContent = name;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", `${name} 삭제`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        state.inspectors.splice(index, 1);
        renderInspectors();
        schedulePersist();
      });

      chip.appendChild(removeBtn);
      dom.inspectorList.appendChild(chip);
    });
  }

  function buildExportTables() {
    const headerRow = [
      "섹션",
      "점검 항목",
      "세부 항목",
      "대상",
      "여부",
      "점검 시간",
      "메모"
    ];

    const itemRows = allItemIds.map(itemId => {
      const meta = itemMetadata[itemId];
      const data = state.items[itemId] || { selection: "", checkedAt: "" };
      return [
        meta.sectionTitle,
        meta.groupTitle,
        meta.rowLabel,
        meta.columnLabel,
        data.selection || "",
        data.checkedAt ? formatDateTime(new Date(data.checkedAt)) : "",
        ""
      ];
    });

    const noteRows = [];
    noteElements.forEach((textarea, noteId) => {
      const meta = noteMetadata[noteId];
      const text = state.notes[noteId] || "";
      if (!text) {
        return;
      }
      noteRows.push([
        meta.sectionTitle,
        meta.groupTitle,
        "특이사항",
        "",
        "",
        "",
        text.replace(/\n/g, " ")
      ]);
    });

    return {
      headerRow,
      itemRows,
      noteRows
    };
  }

  function exportToExcel() {
    const { headerRow, itemRows, noteRows } = buildExportTables();
    const today = formatDate(new Date());
    const inspectors = state.inspectors.join(", ") || "-";
    const total = allItemIds.length;
    const completed = allItemIds.filter(id => !!state.items[id]?.selection).length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    const metaTable = `
      <table border="1" cellpadding="6" cellspacing="0">
        <tr><th>점검일자</th><td>${escapeHtml(today)}</td></tr>
        <tr><th>점검자</th><td>${escapeHtml(inspectors)}</td></tr>
        <tr><th>진척도</th><td>${escapeHtml(`${completed}/${total} (${percent}%)`)}</td></tr>
      </table>
    `;

    const checklistTable = `
      <table border="1" cellpadding="6" cellspacing="0">
        <thead>
          <tr>${headerRow.map(cell => `<th>${cell}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${renderRowsHtml(itemRows)}
          ${renderRowsHtml(noteRows)}
        </tbody>
      </table>
    `;

    const htmlContent = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(dom.title.textContent)}</title>
        </head>
        <body>
          <h1>${escapeHtml(dom.title.textContent)}</h1>
          ${metaTable}
          <br/>
          ${checklistTable}
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], {
      type: "application/vnd.ms-excel"
    });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `onbid-daily-check-${today}.xls`);
  }

  function exportToPdf() {
    const { headerRow, itemRows, noteRows } = buildExportTables();
    const today = formatDate(new Date());
    const inspectors = state.inspectors.join(", ") || "-";
    const total = allItemIds.length;
    const completed = allItemIds.filter(id => !!state.items[id]?.selection).length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    const metaTable = `
      <table class="meta">
        <tr><th>점검일자</th><td>${escapeHtml(today)}</td></tr>
        <tr><th>점검자</th><td>${escapeHtml(inspectors)}</td></tr>
        <tr><th>진척도</th><td>${escapeHtml(`${completed}/${total} (${percent}%)`)}</td></tr>
      </table>
    `;

    const checklistTable = `
      <table class="checklist">
        <thead>
          <tr>${headerRow.map(cell => `<th>${cell}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${renderRowsHtml(itemRows)}
          ${renderRowsHtml(noteRows)}
        </tbody>
      </table>
    `;

    const styles = `
      <style>
        body { font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; padding: 24px; color: #222; }
        h1 { text-align: center; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #888; padding: 8px; font-size: 13px; }
        thead th { background: #f0e3c5; }
        table.meta { width: auto; margin-bottom: 32px; }
        table.meta th { background: #d7a64a; color: #fff; width: 110px; }
        table.meta td { width: 240px; }
      </style>
    `;

    const content = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(dom.title.textContent)}</title>
          ${styles}
        </head>
        <body>
          <h1>${escapeHtml(dom.title.textContent)}</h1>
          ${metaTable}
          ${checklistTable}
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      alert("팝업 차단 설정을 해제한 후 다시 시도해주세요.");
      return;
    }
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }

  function resetDashboard() {
    const shouldReset =
      window.confirm("모든 입력 내용을 초기화하시겠습니까?");
    if (!shouldReset) {
      return;
    }

    allItemIds.forEach(itemId => {
      state.items[itemId] = { selection: null, checkedAt: null };
      applySelectionVisual(itemId);
    });

    noteElements.forEach((textarea, noteId) => {
      textarea.value = "";
      state.notes[noteId] = "";
    });

    state.inspectors = [];
    renderInspectors();
    updateProgress();
    toggleNotesAvailability();
    schedulePersist();
  }

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function fetchChecklist() {
    if (typeof fetch !== "function") {
      return FALLBACK_CHECKLIST;
    }
    const response = await fetch("/api/checklist", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Checklist fetch failed with status ${response.status}`);
    }
    return response.json();
  }

  async function fetchSavedState() {
    if (typeof fetch !== "function") {
      return null;
    }
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`State fetch failed with status ${response.status}`);
    }
    return response.json();
  }

  function mergeSavedState(savedState) {
    if (!savedState || typeof savedState !== "object") {
      return;
    }
    if (savedState.items && typeof savedState.items === "object") {
      Object.assign(state.items, savedState.items);
    }
    if (savedState.notes && typeof savedState.notes === "object") {
      Object.assign(state.notes, savedState.notes);
    }
    if (Array.isArray(savedState.inspectors)) {
      state.inspectors = savedState.inspectors.slice(0, 20);
    }
  }

  function buildStatePayload() {
    return {
      items: state.items,
      notes: state.notes,
      inspectors: state.inspectors
    };
  }

  function schedulePersist() {
    if (!hasRendered || typeof fetch !== "function") {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = window.setTimeout(persistState, SAVE_DEBOUNCE_MS);
  }

  async function persistState() {
    const payload = buildStatePayload();
    const signature = stateSignature(payload);
    if (signature === lastSavedSignature) {
      persistTimer = null;
      return;
    }
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`State save failed (${response.status})`);
      }
      lastSavedSignature = signature;
    } catch (error) {
      console.warn("Failed to persist state:", error);
    } finally {
      persistTimer = null;
    }
  }

  function stateSignature(payload) {
    try {
      return JSON.stringify(payload);
    } catch (error) {
      console.warn("Failed to stringify state payload:", error);
      return "";
    }
  }

  function buildItemId(sectionId, groupId, rowId, columnLabel) {
    return `${sectionId}__${groupId}__${rowId}__${sanitizeIdSegment(
      columnLabel
    )}`;
  }

  function sanitizeIdSegment(value) {
    return value.replace(/\s+/g, "-").replace(/[^\w-]/g, "").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderRowsHtml(rows) {
    if (!rows.length) {
      return "";
    }
    return rows
      .map(
        row =>
          `<tr>${row
            .map(cell => `<td>${escapeHtml(cell || "")}</td>`)
            .join("")}</tr>`
      )
      .join("");
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateTime(date) {
    const datePart = formatDate(date);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${datePart} ${hours}:${minutes}:${seconds}`;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
