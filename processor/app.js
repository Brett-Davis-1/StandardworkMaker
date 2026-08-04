const zipInput = document.getElementById("zipInput");
const dropZone = document.getElementById("dropZone");
const studyList = document.getElementById("studyList");
const reviewBody = document.getElementById("reviewBody");
const fileCount = document.getElementById("fileCount");
const elementCount = document.getElementById("elementCount");
const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const studyNameInput = document.getElementById("studyName");
const productNameInput = document.getElementById("productName");
const taktTimeInput = document.getElementById("taktTime");
const observerNameInput = document.getElementById("observerName");
const lineBalanceBtn = document.getElementById("lineBalanceBtn");
const balanceWorkspace = document.getElementById("balanceWorkspace");
const closeBalanceBtn = document.getElementById("closeBalanceBtn");
const addStageBtn = document.getElementById("addStageBtn");
const connectBtn = document.getElementById("connectBtn");
const connectionHint = document.getElementById("connectionHint");
const precedenceCanvas = document.getElementById("precedenceCanvas");
const precedenceLines = document.getElementById("precedenceLines");
const stageGrid = document.getElementById("stageGrid");
const processEditor = document.getElementById("processEditor");
const selectedProcessName = document.getElementById("selectedProcessName");
const selectedProcessMeta = document.getElementById("selectedProcessMeta");
const lockProcessInput = document.getElementById("lockProcessInput");
const allowedStations = document.getElementById("allowedStations");
const predecessorList = document.getElementById("predecessorList");
const balanceSummary = document.getElementById("balanceSummary");
const confirmBalanceBtn = document.getElementById("confirmBalanceBtn");
const optimizationResult = document.getElementById("optimizationResult");
const optimizationSummary = document.getElementById("optimizationSummary");
const optimizationMetrics = document.getElementById("optimizationMetrics");
const futureYamazumi = document.getElementById("futureYamazumi");
const futureAssignmentBody = document.getElementById("futureAssignmentBody");
const exportFutureBtn = document.getElementById("exportFutureBtn");

const categories = ["Value Added", "Non-Value Added", "Walking", "Waiting", "Other"];
const categoryColors = {
  "Value Added": "70AD47",
  "Non-Value Added": "E85D68",
  "Walking": "F4A261",
  "Waiting": "A5ADBA",
  "Other": "8B7BFF"
};

let loadedStudies = [];
let reviewRows = [];
let balanceItems = [];
let balanceEdges = [];
let balanceStageCount = 4;
let selectedBalanceId = "";
let connectionSourceId = "";
let draggedBalanceId = "";
let connectionPointerMoved = false;
let ignoreNextConnectorClick = false;
let futureStateSolution = null;
let glpkPromise = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function safeFileName(value) {
  return String(value || "lineflow-study")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "lineflow-study";
}

function imageExtension(path) {
  const ext = String(path || "").split(".").pop().toLowerCase();
  return ext === "png" ? "png" : "jpeg";
}

async function loadStudyFiles(files) {
  const zipFiles = [...files].filter((file) => file.name.toLowerCase().endsWith(".zip"));
  if (zipFiles.length === 0) {
    setStatus("Select at least one LineFlow ZIP file.", true);
    return;
  }

  setStatus(`Opening ${zipFiles.length} study file${zipFiles.length === 1 ? "" : "s"}…`);
  const startingStudyNumber = loadedStudies.length + 1;

  for (let fileIndex = 0; fileIndex < zipFiles.length; fileIndex += 1) {
    const file = zipFiles[fileIndex];
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestEntry = zip.file("study.json");
      if (!manifestEntry) throw new Error("study.json is missing");

      const manifest = JSON.parse(await manifestEntry.async("string"));
      if (manifest.schema !== "lineflow-study" || manifest.schemaVersion !== "1.0") {
        throw new Error("unsupported LineFlow study format");
      }

      const stationName = `Operator ${startingStudyNumber + fileIndex}`;
      const rows = [];
      for (const process of manifest.processes || []) {
        let imageDataUrl = "";
        if (process.imageFile && zip.file(process.imageFile)) {
          const base64 = await zip.file(process.imageFile).async("base64");
          imageDataUrl = `data:image/${imageExtension(process.imageFile)};base64,${base64}`;
        }

        rows.push({
          include: true,
          studyId: manifest.studyId,
          sourceFile: file.name,
          sequence: Number(process.processNumber) || (rows.length + 1) * 10,
          station: stationName,
          description: process.name || `Process ${rows.length + 1}`,
          durationSeconds: Number(process.durationSeconds) || 0,
          category: "Value Added",
          tool: "",
          imageFile: process.imageFile || "",
          imageDataUrl
        });
      }

      loadedStudies.push({
        name: file.name,
        studyId: manifest.studyId,
        totalSeconds: Number(manifest.totalElapsedSeconds) || 0
      });
      reviewRows.push(...rows);
    } catch (error) {
      console.error(error);
      setStatus(`${file.name} could not be opened: ${error.message}`, true);
    }
  }

  renderStudyList();
  renderReviewRows();
  setStatus(`${loadedStudies.length} study file${loadedStudies.length === 1 ? "" : "s"} ready for review.`);
  zipInput.value = "";
}

function renderStudyList() {
  studyList.innerHTML = "";
  loadedStudies.forEach((study) => {
    const chip = document.createElement("span");
    chip.className = "study-chip";
    chip.textContent = `${study.name} · ${study.totalSeconds.toFixed(1)} sec`;
    studyList.appendChild(chip);
  });
  fileCount.textContent = `${loadedStudies.length} ${loadedStudies.length === 1 ? "study" : "studies"}`;
}

function makeInput(type, value, className, onChange) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.className = className || "";
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function makeCell(child) {
  const td = document.createElement("td");
  if (typeof child === "string") td.textContent = child;
  else td.appendChild(child);
  return td;
}

function renderReviewRows() {
  reviewBody.innerHTML = "";
  if (reviewRows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty-state";
    td.textContent = "Open a study ZIP to begin.";
    tr.appendChild(td);
    reviewBody.appendChild(tr);
    generateBtn.disabled = true;
    elementCount.textContent = "0 elements";
    return;
  }

  reviewRows.forEach((row) => {
    const tr = document.createElement("tr");

    const include = document.createElement("input");
    include.type = "checkbox";
    include.checked = row.include;
    include.addEventListener("change", () => {
      row.include = include.checked;
      updateCounts();
    });
    tr.appendChild(makeCell(include));

    tr.appendChild(makeCell(makeInput("number", row.sequence, "table-input", (value) => {
      row.sequence = Number(value) || 0;
    })));
    tr.appendChild(makeCell(makeInput("text", row.station, "table-input", (value) => {
      row.station = value.trim();
    })));
    tr.appendChild(makeCell(makeInput("text", row.description, "description-input", (value) => {
      row.description = value;
    })));
    tr.appendChild(makeCell(makeInput("number", row.durationSeconds, "table-input", (value) => {
      row.durationSeconds = Math.max(0, Number(value) || 0);
    })));

    const category = document.createElement("select");
    category.className = "table-input";
    categories.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === row.category;
      category.appendChild(option);
    });
    category.addEventListener("change", () => {
      row.category = category.value;
    });
    tr.appendChild(makeCell(category));

    tr.appendChild(makeCell(makeInput("text", row.tool, "table-input", (value) => {
      row.tool = value;
    })));

    if (row.imageDataUrl) {
      const image = document.createElement("img");
      image.className = "image-preview";
      image.src = row.imageDataUrl;
      image.alt = `Snapshot for ${row.description}`;
      tr.appendChild(makeCell(image));
    } else {
      const noImage = document.createElement("span");
      noImage.className = "no-image";
      noImage.textContent = "No image";
      tr.appendChild(makeCell(noImage));
    }

    reviewBody.appendChild(tr);
  });
  updateCounts();
}

function updateCounts() {
  const included = reviewRows.filter((row) => row.include).length;
  elementCount.textContent = `${included} ${included === 1 ? "element" : "elements"}`;
  generateBtn.disabled = included === 0;
  lineBalanceBtn.disabled = included < 2;
}

function applyTitleStyle(cell) {
  cell.font = { name: "Aptos Display", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172033" } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applyHeaderStyle(cell) {
  cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5366C7" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFCDD3DF" } },
    left: { style: "thin", color: { argb: "FFCDD3DF" } },
    bottom: { style: "thin", color: { argb: "FFCDD3DF" } },
    right: { style: "thin", color: { argb: "FFCDD3DF" } }
  };
}

function applyThinBorder(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFD9DEE8" } },
    left: { style: "thin", color: { argb: "FFD9DEE8" } },
    bottom: { style: "thin", color: { argb: "FFD9DEE8" } },
    right: { style: "thin", color: { argb: "FFD9DEE8" } }
  };
}

function addStudyDataSheet(workbook, rows, metadata, options = {}) {
  const sheetName = options.sheetName || "Study Data";
  const title = options.title || "LineFlow Study Data";
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }]
  });
  sheet.mergeCells("A1:I2");
  sheet.getCell("A1").value = title;
  applyTitleStyle(sheet.getCell("A1"));
  sheet.getRow(1).height = 26;
  sheet.getRow(2).height = 12;

  const info = [
    ["Study Name", metadata.studyName, "Product", metadata.product],
    ["Takt Time (sec)", metadata.taktTime || "", "Observer", metadata.observer],
    ["Generated", new Date(), "Included Elements", rows.length]
  ];
  info.forEach((values, index) => {
    const row = sheet.getRow(index + 3);
    row.values = values;
    row.getCell(1).font = { bold: true, color: { argb: "FF536071" } };
    row.getCell(3).font = { bold: true, color: { argb: "FF536071" } };
  });
  sheet.getCell("B5").numFmt = "yyyy-mm-dd hh:mm";

  const headers = ["Sequence", "Operator / Station", "Description", "Duration (sec)", "Category", "Tool", "Image File", "Source ZIP", "Study ID"];
  sheet.getRow(6).values = headers;
  headers.forEach((_, index) => applyHeaderStyle(sheet.getRow(6).getCell(index + 1)));

  rows.forEach((item, index) => {
    const row = sheet.getRow(index + 7);
    row.values = [
      item.sequence, item.station, item.description, item.durationSeconds,
      item.category, item.tool, item.imageFile, item.sourceFile, item.studyId
    ];
    row.getCell(4).numFmt = "0.000";
    row.alignment = { vertical: "middle", wrapText: true };
  });

  sheet.columns = [
    { width: 12 }, { width: 21 }, { width: 35 }, { width: 16 }, { width: 21 },
    { width: 22 }, { width: 42 }, { width: 34 }, { width: 38 }
  ];
  sheet.autoFilter = { from: "A6", to: `I${rows.length + 6}` };
  sheet.getColumn(5).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
    if (rowNumber > 6) {
      cell.dataValidation = { type: "list", allowBlank: false, formulae: [`"${categories.join(",")}"`] };
    }
  });
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addPaagSheet(workbook, rows, metadata) {
  const sheet = workbook.addWorksheet("Process at a Glance", {
    views: [{ showGridLines: false }]
  });
  const lastColumn = Math.max(2, rows.length + 1);
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell(1, 1).value = `${metadata.studyName} — Process at a Glance`;
  applyTitleStyle(sheet.getCell(1, 1));
  sheet.getRow(1).height = 30;

  const labels = [
    [3, "Process Number"],
    [4, "Process Description"],
    [7, "Process Sketch"],
    [18, "Tool"],
    [19, "Category"],
    [20, "Time (sec)"]
  ];
  labels.forEach(([rowNumber, label]) => {
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = label;
    applyHeaderStyle(cell);
  });
  sheet.mergeCells("A4:A6");
  sheet.mergeCells("A7:A17");

  rows.forEach((item, index) => {
    const col = index + 2;
    sheet.getColumn(col).width = 24;
    sheet.getCell(3, col).value = item.sequence;
    sheet.getCell(3, col).font = { bold: true, size: 14 };
    sheet.getCell(3, col).alignment = { horizontal: "center", vertical: "middle" };
    sheet.mergeCells(4, col, 6, col);
    sheet.getCell(4, col).value = item.description;
    sheet.getCell(4, col).alignment = { wrapText: true, vertical: "top", horizontal: "left" };
    sheet.mergeCells(7, col, 17, col);
    sheet.getCell(7, col).alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell(18, col).value = item.tool || "None";
    sheet.getCell(19, col).value = item.category;
    sheet.getCell(20, col).value = item.durationSeconds;
    sheet.getCell(20, col).numFmt = "0.000";

    if (item.imageDataUrl) {
      const imageId = workbook.addImage({
        base64: item.imageDataUrl,
        extension: imageExtension(item.imageFile)
      });
      sheet.addImage(imageId, {
        tl: { col: col - 1 + 0.08, row: 6.15 },
        ext: { width: 155, height: 180 },
        editAs: "oneCell"
      });
    } else {
      sheet.getCell(7, col).value = "No snapshot";
      sheet.getCell(7, col).font = { italic: true, color: { argb: "FF8A94A3" } };
    }
  });

  sheet.getColumn(1).width = 22;
  sheet.getRow(3).height = 32;
  [4, 5, 6].forEach((row) => { sheet.getRow(row).height = 28; });
  for (let row = 7; row <= 17; row += 1) sheet.getRow(row).height = 18;
  [18, 19, 20].forEach((row) => { sheet.getRow(row).height = 30; });

  for (let row = 3; row <= 20; row += 1) {
    for (let col = 1; col <= lastColumn; col += 1) {
      applyThinBorder(sheet.getCell(row, col));
      if (col > 1 && row >= 18) sheet.getCell(row, col).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  }
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    printArea: `A1:${sheet.getColumn(lastColumn).letter}20`
  };
}

function addYamazumiSheet(workbook, rows, metadata, options = {}) {
  const sheetName = options.sheetName || "Yamazumi";
  const stateLabel = options.stateLabel || "Current State";
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: false }]
  });
  const stations = [...new Set(rows.map((row) => row.station || "Unassigned"))];
  const totals = stations.map((station) => ({
    station,
    total: rows.filter((row) => (row.station || "Unassigned") === station)
      .reduce((sum, row) => sum + row.durationSeconds, 0)
  }));
  const takt = Number(metadata.taktTime) || 0;
  const maxSeconds = Math.max(takt, ...totals.map((item) => item.total), 1);
  const secondsPerBlock = Math.max(1, Math.ceil(maxSeconds / 45));
  const blockCount = Math.ceil(maxSeconds / secondsPerBlock);
  const chartTop = 10;
  const chartBottom = chartTop + blockCount - 1;

  const lastColumn = Math.max(2, stations.length + 1);
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell(1, 1).value = `${metadata.studyName} — ${stateLabel} Yamazumi`;
  applyTitleStyle(sheet.getCell(1, 1));
  sheet.getRow(1).height = 30;

  sheet.getCell("A3").value = "Takt Time (sec)";
  sheet.getCell("B3").value = takt || "Not entered";
  sheet.getCell("A4").value = "Scale";
  sheet.getCell("B4").value = `${secondsPerBlock} second${secondsPerBlock === 1 ? "" : "s"} per block`;
  sheet.getCell("A3").font = sheet.getCell("A4").font = { bold: true, color: { argb: "FF536071" } };

  stations.forEach((station, index) => {
    const col = index + 2;
    const header = sheet.getCell(chartBottom + 1, col);
    header.value = station;
    applyHeaderStyle(header);
    sheet.getColumn(col).width = 24;
  });
  sheet.getColumn(1).width = 15;

  for (let block = 0; block < blockCount; block += 1) {
    const rowNumber = chartBottom - block;
    sheet.getRow(rowNumber).height = 15;
    sheet.getCell(rowNumber, 1).value = (block + 1) * secondsPerBlock;
    sheet.getCell(rowNumber, 1).numFmt = "0";
    sheet.getCell(rowNumber, 1).alignment = { horizontal: "right", vertical: "middle" };
    for (let col = 2; col <= lastColumn; col += 1) {
      applyThinBorder(sheet.getCell(rowNumber, col));
    }
  }

  stations.forEach((station, stationIndex) => {
    const stationRows = rows.filter((row) => (row.station || "Unassigned") === station);
    let cursor = chartBottom;
    stationRows.forEach((item) => {
      const blocks = Math.max(1, Math.round(item.durationSeconds / secondsPerBlock));
      const start = Math.max(chartTop, cursor - blocks + 1);
      for (let rowNumber = start; rowNumber <= cursor; rowNumber += 1) {
        const cell = sheet.getCell(rowNumber, stationIndex + 2);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${categoryColors[item.category] || categoryColors.Other}` }
        };
      }
      const labelCell = sheet.getCell(Math.floor((start + cursor) / 2), stationIndex + 2);
      labelCell.value = `${item.sequence} ${item.description}\n${item.durationSeconds.toFixed(1)} sec`;
      labelCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      labelCell.font = { size: 8, bold: true, color: { argb: "FF172033" } };
      cursor = start - 1;
    });
  });

  if (takt > 0) {
    const taktRow = Math.max(chartTop, chartBottom - Math.ceil(takt / secondsPerBlock) + 1);
    for (let col = 1; col <= lastColumn; col += 1) {
      sheet.getCell(taktRow, col).border = {
        ...sheet.getCell(taktRow, col).border,
        top: { style: "thick", color: { argb: "FFE63946" } }
      };
    }
    sheet.getCell(taktRow, 1).note = "Red line represents takt time.";
  }

  const summaryStart = chartBottom + 4;
  sheet.getCell(summaryStart, 1).value = "Operator / Station";
  sheet.getCell(summaryStart, 2).value = "Total Work (sec)";
  sheet.getCell(summaryStart, 3).value = "Takt (sec)";
  sheet.getCell(summaryStart, 4).value = "Difference";
  for (let col = 1; col <= 4; col += 1) applyHeaderStyle(sheet.getCell(summaryStart, col));
  totals.forEach((item, index) => {
    const rowNumber = summaryStart + index + 1;
    sheet.getCell(rowNumber, 1).value = item.station;
    sheet.getCell(rowNumber, 2).value = item.total;
    sheet.getCell(rowNumber, 3).value = takt || "";
    sheet.getCell(rowNumber, 4).value = takt ? takt - item.total : "";
    [2, 3, 4].forEach((col) => { sheet.getCell(rowNumber, col).numFmt = "0.000"; });
  });

  const legendStart = summaryStart;
  categories.forEach((category, index) => {
    const rowNumber = legendStart + index;
    const colorCell = sheet.getCell(rowNumber, lastColumn + 2);
    colorCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${categoryColors[category]}` } };
    colorCell.value = " ";
    sheet.getCell(rowNumber, lastColumn + 3).value = category;
  });
  sheet.getColumn(lastColumn + 2).width = 4;
  sheet.getColumn(lastColumn + 3).width = 22;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
}

async function generateWorkbook() {
  const rows = reviewRows
    .filter((row) => row.include)
    .sort((a, b) => a.station.localeCompare(b.station) || a.sequence - b.sequence);
  if (rows.length === 0) return;

  const taktTime = Number(taktTimeInput.value) || 0;
  const metadata = {
    studyName: studyNameInput.value.trim() || "LineFlow Study",
    product: productNameInput.value.trim(),
    taktTime,
    observer: observerNameInput.value.trim()
  };

  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";
  setStatus("Building the editable Excel workbook…");

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "LineFlow";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Process at a Glance and Yamazumi";

    addStudyDataSheet(workbook, rows, metadata);
    addPaagSheet(workbook, rows, metadata);
    addYamazumiSheet(workbook, rows, metadata);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(metadata.studyName)}-lineflow-workbook.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Workbook generated. Check your Downloads folder.");
  } catch (error) {
    console.error(error);
    setStatus(`Workbook generation failed: ${error.message}`, true);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate Excel Workbook";
  }
}

function balanceItemById(id) {
  return balanceItems.find((item) => item.id === id);
}

function initializeBalanceItems() {
  const includedRows = reviewRows.filter((row) => row.include);
  const stageSize = Math.max(1, Math.ceil(includedRows.length / balanceStageCount));
  balanceItems = includedRows.map((row, index) => ({
    id: `process-${index + 1}`,
    row,
    stage: Math.min(balanceStageCount - 1, Math.floor(index / stageSize)),
    locked: false,
    allowedStations: [...new Set(includedRows.map((item) => item.station || "Unassigned"))]
  }));
  balanceEdges = [];
  selectedBalanceId = "";
  connectionSourceId = "";
}

function startBalanceConnection(id) {
  connectionSourceId = id;
  connectionPointerMoved = false;
  connectBtn.textContent = "Cancel connection";
  connectionHint.textContent = `Drag the arrow to the process that must happen after ${balanceItemById(id).row.description}.`;
  stageGrid.querySelectorAll(".process-card").forEach((card) => {
    card.classList.toggle("connection-source", card.dataset.balanceId === id);
  });
}

function cancelBalanceConnection(message = "Connection cancelled. Select a process card to continue.") {
  connectionSourceId = "";
  connectionPointerMoved = false;
  connectBtn.textContent = "Connect predecessor";
  connectionHint.textContent = message;
  precedenceLines.querySelector(".precedence-draft")?.remove();
  stageGrid.querySelectorAll(".process-card").forEach((card) => card.classList.remove("connection-source"));
}

function finishBalanceConnection(targetId) {
  const sourceId = connectionSourceId;
  if (!sourceId || !targetId || sourceId === targetId) {
    cancelBalanceConnection();
    return false;
  }
  const added = addBalanceEdge(sourceId, targetId);
  cancelBalanceConnection(added
    ? "Relationship added. Drag another arrow or continue editing constraints."
    : connectionHint.textContent);
  renderBalanceWorkspace();
  selectBalanceItem(targetId);
  return added;
}

function renderBalanceWorkspace() {
  stageGrid.innerHTML = "";
  stageGrid.style.setProperty("--stage-count", balanceStageCount);
  for (let stageIndex = 0; stageIndex < balanceStageCount; stageIndex += 1) {
    const stage = document.createElement("section");
    stage.className = "precedence-stage";
    stage.dataset.stage = stageIndex;

    const heading = document.createElement("div");
    heading.className = "precedence-stage-heading";
    const title = document.createElement("strong");
    title.textContent = stageIndex === 0 ? "Starting processes" : `Stage ${stageIndex + 1}`;
    const subtitle = document.createElement("span");
    subtitle.textContent = stageIndex === 0 ? "No predecessor required" : "Available after predecessors";
    heading.append(title, subtitle);

    const body = document.createElement("div");
    body.className = "precedence-stage-body";
    body.addEventListener("dragover", (event) => {
      event.preventDefault();
      body.classList.add("drag-over");
    });
    body.addEventListener("dragleave", () => body.classList.remove("drag-over"));
    body.addEventListener("drop", (event) => {
      event.preventDefault();
      body.classList.remove("drag-over");
      const item = balanceItemById(draggedBalanceId);
      if (!item) return;
      item.stage = stageIndex;
      renderBalanceWorkspace();
      selectBalanceItem(item.id);
    });

    balanceItems.filter((item) => item.stage === stageIndex).forEach((item) => {
      const card = document.createElement("div");
      card.className = "process-card";
      card.dataset.balanceId = item.id;
      card.draggable = true;
      if (item.id === selectedBalanceId) card.classList.add("selected");
      if (item.id === connectionSourceId) card.classList.add("connection-source");

      const cardSelect = document.createElement("button");
      cardSelect.type = "button";
      cardSelect.className = "process-card-select";
      const sequence = document.createElement("span");
      sequence.className = "process-sequence";
      sequence.textContent = `${item.row.sequence}`;
      const name = document.createElement("strong");
      name.textContent = item.row.description;
      const meta = document.createElement("span");
      meta.className = "process-meta";
      meta.textContent = `${item.row.durationSeconds.toFixed(1)} sec · ${item.row.station}${item.locked ? " · Locked" : ""}`;
      cardSelect.append(sequence, name, meta);

      const connector = document.createElement("button");
      connector.type = "button";
      connector.className = "process-connector";
      connector.textContent = "→";
      connector.setAttribute("aria-label", `Draw precedence arrow from ${item.row.description}`);

      card.addEventListener("dragstart", () => { draggedBalanceId = item.id; });
      card.addEventListener("dragend", () => {
        draggedBalanceId = "";
        requestAnimationFrame(drawPrecedenceLines);
      });
      cardSelect.addEventListener("click", () => handleBalanceCardClick(item.id));
      connector.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ignoreNextConnectorClick = true;
        startBalanceConnection(item.id);
        connector.setPointerCapture?.(event.pointerId);
        drawPrecedenceLines({ clientX: event.clientX, clientY: event.clientY });
      });
      connector.addEventListener("pointermove", (event) => {
        if (connectionSourceId !== item.id) return;
        connectionPointerMoved = true;
        drawPrecedenceLines({ clientX: event.clientX, clientY: event.clientY });
      });
      connector.addEventListener("pointerup", (event) => {
        if (connectionSourceId !== item.id) return;
        if (!connectionPointerMoved) {
          drawPrecedenceLines();
          return;
        }
        const target = document.elementFromPoint?.(event.clientX, event.clientY);
        const targetCard = target?.closest?.(".process-card");
        finishBalanceConnection(targetCard?.dataset.balanceId || "");
      });
      connector.addEventListener("click", (event) => {
        event.stopPropagation();
        if (ignoreNextConnectorClick) {
          ignoreNextConnectorClick = false;
          return;
        }
        if (connectionSourceId === item.id) cancelBalanceConnection();
        else startBalanceConnection(item.id);
      });
      card.append(cardSelect, connector);
      body.appendChild(card);
    });

    stage.append(heading, body);
    stageGrid.appendChild(stage);
  }
  balanceSummary.textContent = `${balanceItems.length} processes · ${balanceEdges.length} precedence relationship${balanceEdges.length === 1 ? "" : "s"}`;
  requestAnimationFrame(drawPrecedenceLines);
}

function handleBalanceCardClick(id) {
  if (connectionSourceId && connectionSourceId !== id) {
    finishBalanceConnection(id);
    return;
  }
  selectBalanceItem(id);
}

function selectBalanceItem(id) {
  selectedBalanceId = id;
  const item = balanceItemById(id);
  if (!item) return;
  processEditor.hidden = false;
  selectedProcessName.textContent = item.row.description;
  selectedProcessMeta.textContent = `${item.row.durationSeconds.toFixed(3)} sec · Currently ${item.row.station}`;
  lockProcessInput.checked = item.locked;
  connectBtn.disabled = false;
  allowedStations.innerHTML = "";
  [...new Set(balanceItems.map((candidate) => candidate.row.station || "Unassigned"))].forEach((station, index) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.allowedStations.includes(station);
    checkbox.disabled = item.locked;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) item.allowedStations.push(station);
      else item.allowedStations = item.allowedStations.filter((name) => name !== station);
      invalidateFutureState();
    });
    const text = document.createElement("span");
    text.textContent = station;
    label.append(checkbox, text);
    allowedStations.appendChild(label);
  });
  renderPredecessorList();
  stageGrid.querySelectorAll(".process-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.balanceId === id);
  });
}

function renderPredecessorList() {
  predecessorList.innerHTML = "";
  const predecessors = balanceEdges.filter((edge) => edge.to === selectedBalanceId);
  if (predecessors.length === 0) {
    predecessorList.textContent = "None assigned";
    return;
  }
  predecessors.forEach((edge) => {
    const predecessor = balanceItemById(edge.from);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "relationship-chip";
    remove.textContent = `${predecessor?.row.description || "Process"} ×`;
    remove.addEventListener("click", () => {
      balanceEdges = balanceEdges.filter((candidate) => candidate !== edge);
      invalidateFutureState();
      renderBalanceWorkspace();
      selectBalanceItem(selectedBalanceId);
    });
    predecessorList.appendChild(remove);
  });
}

function hasPath(from, to, visited = new Set()) {
  if (from === to) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  return balanceEdges
    .filter((edge) => edge.from === from)
    .some((edge) => hasPath(edge.to, to, visited));
}

function addBalanceEdge(from, to) {
  if (from === to) {
    connectionHint.textContent = "A process cannot precede itself.";
    return false;
  }
  if (balanceEdges.some((edge) => edge.from === from && edge.to === to)) {
    connectionHint.textContent = "That precedence relationship already exists.";
    return false;
  }
  if (hasPath(to, from)) {
    setStatus("That relationship would create a circular precedence loop.", true);
    connectionHint.textContent = "That arrow would create a circular relationship, so it was not added.";
    return false;
  }
  const predecessor = balanceItemById(from);
  const successor = balanceItemById(to);
  if (predecessor && successor && predecessor.stage >= successor.stage) {
    if (predecessor.stage === balanceStageCount - 1) balanceStageCount += 1;
    successor.stage = predecessor.stage + 1;
  }
  balanceEdges.push({ from, to });
  invalidateFutureState();
  return true;
}

function invalidateFutureState() {
  futureStateSolution = null;
  optimizationResult.hidden = true;
}

function getBalanceStations() {
  return [...new Set(balanceItems.map((item) => item.row.station || "Unassigned"))];
}

function assignmentVariable(itemIndex, stationIndex) {
  return `x_${itemIndex}_${stationIndex}`;
}

function activeVariable(stationIndex) {
  return `y_${stationIndex}`;
}

function buildLineBalanceModel(glpk, takt) {
  const stations = getBalanceStations();
  const binaries = [];
  const bounds = [{ name: "max_load", type: glpk.GLP_DB, lb: 0, ub: takt }];
  const subjectTo = [];
  const totalWork = balanceItems.reduce((sum, item) => sum + item.row.durationSeconds, 0);
  const activeStationWeight = (totalWork + takt + 1) * 1000;
  const objectiveVars = [{ name: "max_load", coef: 1 }];

  stations.forEach((station, stationIndex) => {
    const y = activeVariable(stationIndex);
    binaries.push(y);
    objectiveVars.push({ name: y, coef: activeStationWeight });

    const loadVars = balanceItems.map((item, itemIndex) => ({
      name: assignmentVariable(itemIndex, stationIndex),
      coef: item.row.durationSeconds
    }));
    subjectTo.push({
      name: `capacity_${stationIndex}`,
      vars: [...loadVars, { name: y, coef: -takt }],
      bnds: { type: glpk.GLP_UP, lb: 0, ub: 0 }
    });
    subjectTo.push({
      name: `max_load_${stationIndex}`,
      vars: [...loadVars, { name: "max_load", coef: -1 }],
      bnds: { type: glpk.GLP_UP, lb: 0, ub: 0 }
    });
    subjectTo.push({
      name: `use_active_${stationIndex}`,
      vars: [
        ...balanceItems.map((item, itemIndex) => ({ name: assignmentVariable(itemIndex, stationIndex), coef: 1 })),
        { name: y, coef: -1 }
      ],
      bnds: { type: glpk.GLP_LO, lb: 0, ub: 0 }
    });
    if (stationIndex > 0) {
      subjectTo.push({
        name: `contiguous_${stationIndex}`,
        vars: [
          { name: activeVariable(stationIndex), coef: 1 },
          { name: activeVariable(stationIndex - 1), coef: -1 }
        ],
        bnds: { type: glpk.GLP_UP, lb: 0, ub: 0 }
      });
    }
  });

  balanceItems.forEach((item, itemIndex) => {
    const assignmentVars = stations.map((station, stationIndex) => {
      const name = assignmentVariable(itemIndex, stationIndex);
      binaries.push(name);
      const isAllowed = item.locked
        ? station === (item.row.station || "Unassigned")
        : item.allowedStations.includes(station);
      if (!isAllowed) bounds.push({ name, type: glpk.GLP_FX, lb: 0, ub: 0 });
      subjectTo.push({
        name: `link_${itemIndex}_${stationIndex}`,
        vars: [
          { name, coef: 1 },
          { name: activeVariable(stationIndex), coef: -1 }
        ],
        bnds: { type: glpk.GLP_UP, lb: 0, ub: 0 }
      });
      return { name, coef: 1 };
    });
    subjectTo.push({
      name: `assign_${itemIndex}`,
      vars: assignmentVars,
      bnds: { type: glpk.GLP_FX, lb: 1, ub: 1 }
    });
  });

  balanceEdges.forEach((edge, edgeIndex) => {
    const predecessorIndex = balanceItems.findIndex((item) => item.id === edge.from);
    const successorIndex = balanceItems.findIndex((item) => item.id === edge.to);
    if (predecessorIndex < 0 || successorIndex < 0) return;
    const vars = [];
    stations.forEach((station, stationIndex) => {
      vars.push({ name: assignmentVariable(predecessorIndex, stationIndex), coef: stationIndex });
      vars.push({ name: assignmentVariable(successorIndex, stationIndex), coef: -stationIndex });
    });
    subjectTo.push({
      name: `precedence_${edgeIndex}`,
      vars,
      bnds: { type: glpk.GLP_UP, lb: 0, ub: 0 }
    });
  });

  return {
    stations,
    model: {
      name: "LineFlow_Balance",
      objective: {
        direction: glpk.GLP_MIN,
        name: "minimize_operators_then_peak_load",
        vars: objectiveVars
      },
      subjectTo,
      bounds,
      binaries
    }
  };
}

async function getGlpkSolver() {
  if (!glpkPromise) {
    glpkPromise = import("https://cdn.jsdelivr.net/npm/glpk.js@5.0.0/dist/index.js")
      .then((module) => module.default());
  }
  return glpkPromise;
}

function extractLineBalanceSolution(glpk, solveResult, stations, takt) {
  const vars = solveResult.result.vars || {};
  const assignmentById = {};
  const loads = Object.fromEntries(stations.map((station) => [station, 0]));
  const itemsByStation = Object.fromEntries(stations.map((station) => [station, []]));

  balanceItems.forEach((item, itemIndex) => {
    const stationIndex = stations.findIndex((station, index) => vars[assignmentVariable(itemIndex, index)] > 0.5);
    if (stationIndex < 0) throw new Error(`No operator was assigned to ${item.row.description}.`);
    const station = stations[stationIndex];
    assignmentById[item.id] = station;
    loads[station] += item.row.durationSeconds;
    itemsByStation[station].push(item);
  });

  const activeStations = stations.filter((station, index) => vars[activeVariable(index)] > 0.5);
  const totalWork = balanceItems.reduce((sum, item) => sum + item.row.durationSeconds, 0);
  const maxLoad = Math.max(...activeStations.map((station) => loads[station]), 0);
  const efficiency = activeStations.length ? totalWork / (activeStations.length * takt) : 0;

  return {
    status: solveResult.result.status === glpk.GLP_OPT ? "Optimal" : "Feasible",
    stations,
    activeStations,
    assignmentById,
    loads,
    itemsByStation,
    totalWork,
    maxLoad,
    efficiency,
    takt
  };
}

function addOptimizationMetric(label, value) {
  const metric = document.createElement("div");
  metric.className = "optimization-metric";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = value;
  metric.append(labelEl, valueEl);
  optimizationMetrics.appendChild(metric);
}

function renderFutureState(solution) {
  optimizationResult.hidden = false;
  optimizationSummary.textContent = `${solution.status} solution using ${solution.activeStations.length} operator${solution.activeStations.length === 1 ? "" : "s"} at a ${solution.takt.toFixed(1)} second takt.`;

  optimizationMetrics.innerHTML = "";
  addOptimizationMetric("Operators", String(solution.activeStations.length));
  addOptimizationMetric("Total work", `${solution.totalWork.toFixed(1)} sec`);
  addOptimizationMetric("Maximum load", `${solution.maxLoad.toFixed(1)} sec`);
  addOptimizationMetric("Line efficiency", `${(solution.efficiency * 100).toFixed(1)}%`);

  futureYamazumi.innerHTML = "";
  futureYamazumi.style.setProperty("--future-stations", solution.activeStations.length);
  solution.activeStations.forEach((station) => {
    const stationEl = document.createElement("div");
    stationEl.className = "future-station";
    const barArea = document.createElement("div");
    barArea.className = "future-bar-area";
    const taktLine = document.createElement("div");
    taktLine.className = "future-takt-line";
    const taktLabel = document.createElement("span");
    taktLabel.textContent = `Takt ${solution.takt.toFixed(1)}`;
    taktLine.appendChild(taktLabel);

    const stack = document.createElement("div");
    stack.className = "future-stack";
    stack.style.height = `${Math.min(100, solution.loads[station] / solution.takt * 100)}%`;
    const stationItems = [...solution.itemsByStation[station]].sort((a, b) => a.stage - b.stage || a.row.sequence - b.row.sequence);
    stationItems.forEach((item) => {
      const segment = document.createElement("div");
      segment.className = "future-segment";
      segment.style.flexGrow = String(Math.max(item.row.durationSeconds, 0.001));
      segment.style.setProperty("--segment-color", `#${categoryColors[item.row.category] || categoryColors.Other}`);
      segment.title = `${item.row.description}: ${item.row.durationSeconds.toFixed(1)} sec (${item.row.category})`;
      if (item.row.durationSeconds / solution.takt >= 0.055) {
        segment.textContent = `${item.row.description} · ${item.row.durationSeconds.toFixed(1)}`;
      }
      stack.appendChild(segment);
    });
    barArea.append(taktLine, stack);

    const name = document.createElement("div");
    name.className = "future-station-name";
    name.textContent = station;
    const total = document.createElement("div");
    total.className = "future-station-total";
    total.textContent = `${solution.loads[station].toFixed(1)} sec · ${(solution.loads[station] / solution.takt * 100).toFixed(1)}% of takt`;
    stationEl.append(barArea, name, total);
    futureYamazumi.appendChild(stationEl);
  });

  futureAssignmentBody.innerHTML = "";
  balanceItems
    .slice()
    .sort((a, b) => solution.stations.indexOf(solution.assignmentById[a.id]) - solution.stations.indexOf(solution.assignmentById[b.id]) || a.stage - b.stage || a.row.sequence - b.row.sequence)
    .forEach((item) => {
      const row = document.createElement("tr");
      [
        item.row.sequence,
        item.row.description,
        item.row.station,
        solution.assignmentById[item.id],
        item.row.durationSeconds.toFixed(3)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      futureAssignmentBody.appendChild(row);
    });
  optimizationResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function optimizeLineBalance() {
  const takt = Number(taktTimeInput.value) || 0;
  if (takt <= 0) {
    setStatus("Enter a takt time greater than zero before balancing the line.", true);
    return;
  }
  const tooLong = balanceItems.filter((item) => item.row.durationSeconds > takt);
  if (tooLong.length) {
    setStatus(`${tooLong[0].row.description} is longer than takt and cannot be assigned without splitting the work element.`, true);
    return;
  }
  const noStations = balanceItems.filter((item) => item.allowedStations.length === 0);
  if (noStations.length) {
    setStatus(`${noStations.length} process${noStations.length === 1 ? " has" : "es have"} no allowed operator.`, true);
    return;
  }

  confirmBalanceBtn.disabled = true;
  confirmBalanceBtn.textContent = "Optimizing…";
  setStatus("Solving the future-state line balance locally in your browser…");
  try {
    const glpk = await getGlpkSolver();
    const { model, stations } = buildLineBalanceModel(glpk, takt);
    const solveResult = await glpk.solve(model, {
      msglev: glpk.GLP_MSG_OFF,
      presol: true,
      mipgap: 0.001,
      tmlim: 15
    });
    if (![glpk.GLP_OPT, glpk.GLP_FEAS].includes(solveResult.result.status)) {
      throw new Error("No feasible assignment satisfies the current takt, precedence, locks, and allowed-operator rules.");
    }
    futureStateSolution = extractLineBalanceSolution(glpk, solveResult, stations, takt);
    renderFutureState(futureStateSolution);
    setStatus("Balanced future state generated. Review the Yamazumi and assignments below.");
  } catch (error) {
    console.error(error);
    invalidateFutureState();
    setStatus(`Line balancing failed: ${error.message}`, true);
  } finally {
    confirmBalanceBtn.disabled = false;
    confirmBalanceBtn.textContent = "Generate Balanced Line";
  }
}

async function generateFutureStateWorkbook() {
  if (!futureStateSolution) return;
  const metadata = {
    studyName: studyNameInput.value.trim() || "LineFlow Study",
    product: productNameInput.value.trim(),
    taktTime: futureStateSolution.takt,
    observer: observerNameInput.value.trim()
  };
  const currentRows = balanceItems
    .map((item) => ({ ...item.row }))
    .sort((a, b) => a.station.localeCompare(b.station) || a.sequence - b.sequence);
  const futureRows = balanceItems
    .map((item) => ({ ...item.row, station: futureStateSolution.assignmentById[item.id] }))
    .sort((a, b) => a.station.localeCompare(b.station) || a.sequence - b.sequence);

  exportFutureBtn.disabled = true;
  exportFutureBtn.textContent = "Generating…";
  setStatus("Building the current- and future-state Excel workbook…");
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "LineFlow";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Optimized Line Balance";

    addStudyDataSheet(workbook, currentRows, metadata, {
      sheetName: "Current State Data",
      title: "LineFlow Current State Data"
    });
    addPaagSheet(workbook, currentRows, metadata);
    addYamazumiSheet(workbook, currentRows, metadata, {
      sheetName: "Current State Yamazumi",
      stateLabel: "Current State"
    });
    addStudyDataSheet(workbook, futureRows, metadata, {
      sheetName: "Future State Data",
      title: "LineFlow Proposed Future State Data"
    });
    addYamazumiSheet(workbook, futureRows, metadata, {
      sheetName: "Future State Yamazumi",
      stateLabel: "Proposed Future State"
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(metadata.studyName)}-future-state-line-balance.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Future-state workbook generated. Check your Downloads folder.");
  } catch (error) {
    console.error(error);
    setStatus(`Future-state workbook generation failed: ${error.message}`, true);
  } finally {
    exportFutureBtn.disabled = false;
    exportFutureBtn.textContent = "Export Future-State Workbook";
  }
}

function drawPrecedenceLines(pointer = null) {
  const canvasRect = precedenceCanvas.getBoundingClientRect();
  precedenceLines.innerHTML = `
    <defs>
      <marker id="precedenceArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b7bff"></path>
      </marker>
    </defs>`;
  precedenceLines.setAttribute("width", precedenceCanvas.scrollWidth);
  precedenceLines.setAttribute("height", precedenceCanvas.scrollHeight);
  balanceEdges.forEach((edge) => {
    const from = stageGrid.querySelector(`[data-balance-id="${edge.from}"]`);
    const to = stageGrid.querySelector(`[data-balance-id="${edge.to}"]`);
    if (!from || !to) return;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const x1 = fromRect.right - canvasRect.left + precedenceCanvas.scrollLeft;
    const y1 = fromRect.top + fromRect.height / 2 - canvasRect.top + precedenceCanvas.scrollTop;
    const x2 = toRect.left - canvasRect.left + precedenceCanvas.scrollLeft;
    const y2 = toRect.top + toRect.height / 2 - canvasRect.top + precedenceCanvas.scrollTop;
    const bend = Math.max(30, Math.abs(x2 - x1) / 2);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.setAttribute("class", "precedence-path");
    path.setAttribute("marker-end", "url(#precedenceArrow)");
    precedenceLines.appendChild(path);
  });
  if (pointer && connectionSourceId) {
    const from = stageGrid.querySelector(`[data-balance-id="${connectionSourceId}"]`);
    if (!from) return;
    const fromRect = from.getBoundingClientRect();
    const x1 = fromRect.right - canvasRect.left + precedenceCanvas.scrollLeft;
    const y1 = fromRect.top + fromRect.height / 2 - canvasRect.top + precedenceCanvas.scrollTop;
    const x2 = pointer.clientX - canvasRect.left + precedenceCanvas.scrollLeft;
    const y2 = pointer.clientY - canvasRect.top + precedenceCanvas.scrollTop;
    const bend = Math.max(30, Math.abs(x2 - x1) / 2);
    const draft = document.createElementNS("http://www.w3.org/2000/svg", "path");
    draft.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    draft.setAttribute("class", "precedence-path precedence-draft");
    precedenceLines.appendChild(draft);
  }
}

function openBalanceWorkspace() {
  initializeBalanceItems();
  invalidateFutureState();
  balanceWorkspace.hidden = false;
  renderBalanceWorkspace();
  balanceWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("Line balancing workspace opened. Current workbook generation is unchanged.");
}

zipInput.addEventListener("change", () => loadStudyFiles(zipInput.files));
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  loadStudyFiles(event.dataTransfer.files);
});
generateBtn.addEventListener("click", generateWorkbook);
lineBalanceBtn.addEventListener("click", openBalanceWorkspace);
closeBalanceBtn.addEventListener("click", () => { balanceWorkspace.hidden = true; });
addStageBtn.addEventListener("click", () => {
  balanceStageCount += 1;
  renderBalanceWorkspace();
});
connectBtn.addEventListener("click", () => {
  if (!selectedBalanceId) return;
  if (connectionSourceId) {
    cancelBalanceConnection();
    return;
  }
  startBalanceConnection(selectedBalanceId);
});
lockProcessInput.addEventListener("change", () => {
  const item = balanceItemById(selectedBalanceId);
  if (!item) return;
  item.locked = lockProcessInput.checked;
  if (item.locked) item.allowedStations = [item.row.station || "Unassigned"];
  invalidateFutureState();
  renderBalanceWorkspace();
  selectBalanceItem(item.id);
});
confirmBalanceBtn.addEventListener("click", optimizeLineBalance);
exportFutureBtn.addEventListener("click", generateFutureStateWorkbook);
window.addEventListener("resize", () => {
  if (!balanceWorkspace.hidden) requestAnimationFrame(drawPrecedenceLines);
});
precedenceCanvas.addEventListener("scroll", () => {
  if (!balanceWorkspace.hidden) requestAnimationFrame(drawPrecedenceLines);
});
