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
const minimumStationCountInput = document.getElementById("minimumStationCount");
const maximumStationCountInput = document.getElementById("maximumStationCount");
const confirmBalanceBtn = document.getElementById("confirmBalanceBtn");
const optimizationResult = document.getElementById("optimizationResult");
const optimizationSummary = document.getElementById("optimizationSummary");
const scenarioComparisonBody = document.getElementById("scenarioComparisonBody");
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
let futureStateScenarios = [];
let futureStationPool = [];
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
    [metadata.taktLabel || "Takt Time (sec)", metadata.taktTime || "", "Observer", metadata.observer],
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

function addPrecedenceRelationshipsSheet(workbook, futurePlan) {
  const sheet = workbook.addWorksheet("Precedence Relationships", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }]
  });
  sheet.mergeCells("A1:H2");
  sheet.getCell("A1").value = "LineFlow Future-State Precedence Audit";
  applyTitleStyle(sheet.getCell("A1"));
  sheet.getRow(1).height = 26;
  sheet.getRow(2).height = 12;

  sheet.getCell("A3").value = "Validation Result";
  sheet.getCell("A3").font = { bold: true, color: { argb: "FF536071" } };
  sheet.getCell("B3").value = futurePlan.valid ? "PASS" : "FAIL";
  sheet.getCell("B3").font = {
    bold: true,
    color: { argb: futurePlan.valid ? "FF1F7A4D" : "FFB4232C" }
  };
  sheet.getCell("D3").value = "Relationships Checked";
  sheet.getCell("D3").font = { bold: true, color: { argb: "FF536071" } };
  sheet.getCell("E3").value = futurePlan.auditRows.length;

  const headers = [
    "Predecessor", "Pred. Station", "Pred. Sequence",
    "Successor", "Succ. Station", "Succ. Sequence", "Result", "Validation Detail"
  ];
  sheet.getRow(5).values = headers;
  headers.forEach((_, index) => applyHeaderStyle(sheet.getRow(5).getCell(index + 1)));

  if (futurePlan.auditRows.length === 0) {
    sheet.getCell("A6").value = "No precedence relationships were defined.";
    sheet.mergeCells("A6:H6");
    sheet.getCell("A6").font = { italic: true, color: { argb: "FF6D7785" } };
  } else {
    futurePlan.auditRows.forEach((audit, index) => {
      const row = sheet.getRow(index + 6);
      row.values = [
        audit.predecessor,
        audit.predecessorStation,
        audit.predecessorSequence,
        audit.successor,
        audit.successorStation,
        audit.successorSequence,
        audit.result,
        audit.detail
      ];
      row.alignment = { vertical: "middle", wrapText: true };
      row.getCell(7).font = {
        bold: true,
        color: { argb: audit.result === "PASS" ? "FF1F7A4D" : "FFB4232C" }
      };
    });
  }

  sheet.columns = [
    { width: 35 }, { width: 19 }, { width: 16 }, { width: 35 },
    { width: 19 }, { width: 16 }, { width: 12 }, { width: 48 }
  ];
  if (futurePlan.auditRows.length) {
    sheet.autoFilter = { from: "A5", to: `H${futurePlan.auditRows.length + 5}` };
  }
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addScenarioSummarySheet(workbook, scenarios, metadata) {
  const sheet = workbook.addWorksheet("Scenario Summary", {
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }]
  });
  sheet.mergeCells("A1:H2");
  sheet.getCell("A1").value = `${metadata.studyName} — Line Balance Scenario Summary`;
  applyTitleStyle(sheet.getCell("A1"));
  sheet.getRow(1).height = 28;

  sheet.getCell("A3").value = "Required Takt (sec)";
  sheet.getCell("A3").font = { bold: true, color: { argb: "FF536071" } };
  sheet.getCell("B3").value = metadata.requiredTakt || "Not entered";
  sheet.getCell("D3").value = "Recommended Staffing";
  sheet.getCell("D3").font = { bold: true, color: { argb: "FF536071" } };
  const recommended = metadata.requiredTakt > 0
    ? scenarios.find((scenario) => scenario.solution && scenario.solution.minimumTakt <= metadata.requiredTakt + 0.001)
    : null;
  sheet.getCell("E3").value = recommended
    ? `${recommended.stationCount} stations`
    : metadata.requiredTakt > 0 ? "Target not met in range" : "Enter required takt to recommend";

  const headers = [
    "Stations", "Status", "Minimum Takt (sec)", "Line Efficiency",
    "Bottleneck Station", "Required Takt Met?", "Precedence", "Notes"
  ];
  sheet.getRow(5).values = headers;
  headers.forEach((_, index) => applyHeaderStyle(sheet.getRow(5).getCell(index + 1)));

  scenarios.forEach((scenario, index) => {
    const row = sheet.getRow(index + 6);
    if (!scenario.solution) {
      row.values = [scenario.stationCount, "INFEASIBLE", "", "", "", "", "NOT RUN", scenario.error || "No feasible assignment."];
      row.getCell(2).font = { bold: true, color: { argb: "FFB4232C" } };
      for (let col = 1; col <= 8; col += 1) applyThinBorder(row.getCell(col));
      return;
    }
    const solution = scenario.solution;
    const bottlenecks = solution.activeStations
      .filter((station) => Math.abs(solution.loads[station] - solution.minimumTakt) <= 0.001)
      .join(", ");
    const targetMet = metadata.requiredTakt > 0
      ? (solution.minimumTakt <= metadata.requiredTakt + 0.001 ? "YES" : "NO")
      : "Not entered";
    row.values = [
      scenario.stationCount,
      solution.status.toUpperCase(),
      solution.minimumTakt,
      solution.efficiency,
      bottlenecks,
      targetMet,
      solution.futurePlan.valid ? "PASS" : "FAIL",
      `${solution.futurePlan.auditRows.length} relationships checked`
    ];
    row.getCell(3).numFmt = "0.000";
    row.getCell(4).numFmt = "0.0%";
    row.getCell(6).font = {
      bold: true,
      color: { argb: targetMet === "YES" ? "FF1F7A4D" : targetMet === "NO" ? "FFB4232C" : "FF536071" }
    };
    row.getCell(7).font = {
      bold: true,
      color: { argb: solution.futurePlan.valid ? "FF1F7A4D" : "FFB4232C" }
    };
    for (let col = 1; col <= 8; col += 1) applyThinBorder(row.getCell(col));
  });

  sheet.columns = [
    { width: 20 }, { width: 14 }, { width: 22 }, { width: 22 },
    { width: 28 }, { width: 22 }, { width: 15 }, { width: 34 }
  ];
  if (scenarios.length) sheet.autoFilter = { from: "A5", to: `H${scenarios.length + 5}` };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addScenarioPrecedenceRelationshipsSheet(workbook, scenarios) {
  const sheet = workbook.addWorksheet("Precedence Relationships", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }]
  });
  sheet.mergeCells("A1:I2");
  sheet.getCell("A1").value = "LineFlow Multi-Scenario Precedence Audit";
  applyTitleStyle(sheet.getCell("A1"));
  sheet.getRow(1).height = 26;

  const feasible = scenarios.filter((scenario) => scenario.solution);
  const allValid = feasible.every((scenario) => scenario.solution.futurePlan.valid);
  sheet.getCell("A3").value = "Overall Result";
  sheet.getCell("A3").font = { bold: true, color: { argb: "FF536071" } };
  sheet.getCell("B3").value = allValid ? "PASS" : "FAIL";
  sheet.getCell("B3").font = { bold: true, color: { argb: allValid ? "FF1F7A4D" : "FFB4232C" } };
  sheet.getCell("D3").value = "Scenarios Checked";
  sheet.getCell("D3").font = { bold: true, color: { argb: "FF536071" } };
  sheet.getCell("E3").value = feasible.length;

  const headers = [
    "Stations", "Predecessor", "Pred. Station", "Pred. Sequence",
    "Successor", "Succ. Station", "Succ. Sequence", "Result", "Validation Detail"
  ];
  sheet.getRow(5).values = headers;
  headers.forEach((_, index) => applyHeaderStyle(sheet.getRow(5).getCell(index + 1)));

  let rowNumber = 6;
  feasible.forEach((scenario) => {
    scenario.solution.futurePlan.auditRows.forEach((audit) => {
      const row = sheet.getRow(rowNumber);
      row.values = [
        scenario.stationCount,
        audit.predecessor,
        audit.predecessorStation,
        audit.predecessorSequence,
        audit.successor,
        audit.successorStation,
        audit.successorSequence,
        audit.result,
        audit.detail
      ];
      row.alignment = { vertical: "middle", wrapText: true };
      row.getCell(8).font = { bold: true, color: { argb: audit.result === "PASS" ? "FF1F7A4D" : "FFB4232C" } };
      for (let col = 1; col <= 9; col += 1) applyThinBorder(row.getCell(col));
      rowNumber += 1;
    });
  });
  if (rowNumber === 6) {
    sheet.mergeCells("A6:I6");
    sheet.getCell("A6").value = "No precedence relationships were defined in a feasible scenario.";
    sheet.getCell("A6").font = { italic: true, color: { argb: "FF6D7785" } };
  }
  sheet.columns = [
    { width: 18 }, { width: 31 }, { width: 18 }, { width: 20 }, { width: 31 },
    { width: 18 }, { width: 15 }, { width: 11 }, { width: 48 }
  ];
  if (rowNumber > 6) sheet.autoFilter = { from: "A5", to: `I${rowNumber - 1}` };
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

  sheet.getCell("A3").value = metadata.taktLabel || "Takt Time (sec)";
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
  sheet.getColumn(1).width = 28;

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
  sheet.getCell(summaryStart, 3).value = metadata.taktSummaryLabel || "Takt (sec)";
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
    colorCell.value = null;
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

function getCurrentBalanceStations() {
  return [...new Set(balanceItems.map((item) => item.row.station || "Unassigned"))];
}

function buildFutureStationPool(requestedCount) {
  const currentStations = getCurrentBalanceStations();
  const maximum = Math.max(1, balanceItems.length);
  const targetCount = Math.min(maximum, Math.max(1, Math.floor(Number(requestedCount) || currentStations.length || 1)));
  const stations = currentStations.slice(0, targetCount);
  if (stations.length >= targetCount) return stations;

  const numberedNames = currentStations.map((station) => String(station).match(/^(.*?)(\d+)$/));
  const sharedPrefix = numberedNames.length > 0
    && numberedNames.every((match) => match && match[1] === numberedNames[0][1])
    ? numberedNames[0][1]
    : "";
  let nextNumber = sharedPrefix
    ? Math.max(...numberedNames.map((match) => Number(match[2]))) + 1
    : currentStations.length + 1;

  while (stations.length < targetCount) {
    let candidate = sharedPrefix ? `${sharedPrefix}${nextNumber}` : `Future Station ${nextNumber}`;
    while (stations.includes(candidate)) {
      nextNumber += 1;
      candidate = sharedPrefix ? `${sharedPrefix}${nextNumber}` : `Future Station ${nextNumber}`;
    }
    stations.push(candidate);
    nextNumber += 1;
  }
  return stations;
}

function setFutureStationCount(requestedCount, resetRestrictions = false) {
  const previousPool = [...futureStationPool];
  const nextPool = buildFutureStationPool(requestedCount);
  balanceItems.forEach((item) => {
    if (item.locked) return;
    const wasUnrestricted = resetRestrictions
      || previousPool.length === 0
      || previousPool.every((station) => item.allowedStations.includes(station));
    item.allowedStations = item.allowedStations.filter((station) => nextPool.includes(station));
    if (wasUnrestricted) {
      nextPool.forEach((station) => {
        if (!item.allowedStations.includes(station)) item.allowedStations.push(station);
      });
    }
  });
  futureStationPool = nextPool;
  invalidateFutureState();
  if (selectedBalanceId) selectBalanceItem(selectedBalanceId);
  return nextPool;
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
  const currentCount = Math.max(1, getCurrentBalanceStations().length);
  const maximumCount = Math.min(Math.max(1, includedRows.length), currentCount + 3);
  futureStationPool = buildFutureStationPool(maximumCount);
  balanceItems.forEach((item) => { item.allowedStations = [...futureStationPool]; });
  [minimumStationCountInput, maximumStationCountInput].forEach((input) => {
    input.min = "1";
    input.max = String(Math.max(1, includedRows.length));
  });
  minimumStationCountInput.value = String(currentCount);
  maximumStationCountInput.value = String(maximumCount);
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
  getBalanceStations().forEach((station, index) => {
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
  futureStateScenarios = [];
  optimizationResult.hidden = true;
  exportFutureBtn.disabled = true;
}

function getBalanceStations() {
  return futureStationPool.length ? [...futureStationPool] : getCurrentBalanceStations();
}

function assignmentVariable(itemIndex, stationIndex) {
  return `x_${itemIndex}_${stationIndex}`;
}

function activeVariable(stationIndex) {
  return `y_${stationIndex}`;
}

function buildLineBalanceModel(glpk) {
  const stations = getBalanceStations();
  const binaries = [];
  const totalWork = balanceItems.reduce((sum, item) => sum + item.row.durationSeconds, 0);
  const bounds = [{ name: "max_load", type: glpk.GLP_DB, lb: 0, ub: Math.max(totalWork, 0) }];
  const subjectTo = [];
  const objectiveVars = [{ name: "max_load", coef: 1 }];

  stations.forEach((station, stationIndex) => {
    const y = activeVariable(stationIndex);
    binaries.push(y);
    bounds.push({ name: y, type: glpk.GLP_FX, lb: 1, ub: 1 });

    const loadVars = balanceItems.map((item, itemIndex) => ({
      name: assignmentVariable(itemIndex, stationIndex),
      coef: item.row.durationSeconds
    }));
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
        name: "minimize_takt_for_fixed_station_count",
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

function extractLineBalanceSolution(glpk, solveResult, stations, requiredTakt = 0) {
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

  // Every requested future station is fixed active in the model. Keep the full
  // station list even if a solver omits fixed variables from its result map.
  const activeStations = [...stations];
  const totalWork = balanceItems.reduce((sum, item) => sum + item.row.durationSeconds, 0);
  const maxLoad = Math.max(...activeStations.map((station) => loads[station]), 0);
  const efficiency = activeStations.length && maxLoad ? totalWork / (activeStations.length * maxLoad) : 0;

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
    takt: maxLoad,
    minimumTakt: maxLoad,
    requiredTakt
  };
}

function compareBalanceItems(a, b) {
  return a.stage - b.stage
    || a.row.sequence - b.row.sequence
    || balanceItems.indexOf(a) - balanceItems.indexOf(b);
}

function buildFutureStatePlan(solution) {
  const stationIndex = new Map(solution.stations.map((station, index) => [station, index]));
  const orderedEntriesByStation = Object.fromEntries(solution.activeStations.map((station) => [station, []]));
  const entryById = new Map();
  const violations = [];

  balanceEdges.forEach((edge) => {
    const predecessorStation = solution.assignmentById[edge.from];
    const successorStation = solution.assignmentById[edge.to];
    if (!stationIndex.has(predecessorStation) || !stationIndex.has(successorStation)) {
      violations.push({ edge, reason: "A process is missing a future-state station assignment." });
    } else if (stationIndex.get(predecessorStation) > stationIndex.get(successorStation)) {
      violations.push({ edge, reason: "The predecessor is assigned to a later station than its successor." });
    }
  });

  solution.activeStations.forEach((station) => {
    const stationItems = balanceItems
      .filter((item) => solution.assignmentById[item.id] === station)
      .sort(compareBalanceItems);
    const stationIds = new Set(stationItems.map((item) => item.id));
    const indegree = new Map(stationItems.map((item) => [item.id, 0]));
    const successors = new Map(stationItems.map((item) => [item.id, []]));

    balanceEdges.forEach((edge) => {
      if (!stationIds.has(edge.from) || !stationIds.has(edge.to)) return;
      indegree.set(edge.to, indegree.get(edge.to) + 1);
      successors.get(edge.from).push(edge.to);
    });

    const ready = stationItems.filter((item) => indegree.get(item.id) === 0).sort(compareBalanceItems);
    const orderedItems = [];
    while (ready.length) {
      const item = ready.shift();
      orderedItems.push(item);
      successors.get(item.id).forEach((successorId) => {
        indegree.set(successorId, indegree.get(successorId) - 1);
        if (indegree.get(successorId) === 0) {
          ready.push(balanceItemById(successorId));
          ready.sort(compareBalanceItems);
        }
      });
    }

    if (orderedItems.length !== stationItems.length) {
      violations.push({ reason: `${station} contains a circular precedence relationship.` });
      return;
    }

    orderedEntriesByStation[station] = orderedItems.map((item, index) => {
      const entry = {
        item,
        sequence: (index + 1) * 10,
        station,
        row: {
          ...item.row,
          sequence: (index + 1) * 10,
          station,
          originalSequence: item.row.sequence,
          balanceId: item.id
        }
      };
      entryById.set(item.id, entry);
      return entry;
    });
  });

  const auditRows = balanceEdges.map((edge) => {
    const predecessor = entryById.get(edge.from);
    const successor = entryById.get(edge.to);
    let result = "PASS";
    let detail = "Predecessor is assigned to an earlier station.";
    if (!predecessor || !successor) {
      result = "FAIL";
      detail = "A process is missing from the future-state sequence.";
    } else if (predecessor.station === successor.station) {
      if (predecessor.sequence < successor.sequence) {
        detail = "Same station; predecessor is sequenced first.";
      } else {
        result = "FAIL";
        detail = "Same station; successor is sequenced before predecessor.";
      }
    } else if (stationIndex.get(predecessor.station) > stationIndex.get(successor.station)) {
      result = "FAIL";
      detail = "Predecessor is assigned to a later station.";
    }
    if (result === "FAIL") violations.push({ edge, reason: detail });
    return {
      predecessor: predecessor?.item.row.description || "Missing process",
      predecessorStation: predecessor?.station || "Unassigned",
      predecessorSequence: predecessor?.sequence || "",
      successor: successor?.item.row.description || "Missing process",
      successorStation: successor?.station || "Unassigned",
      successorSequence: successor?.sequence || "",
      result,
      detail
    };
  });

  return {
    rows: solution.activeStations.flatMap((station) => orderedEntriesByStation[station].map((entry) => entry.row)),
    orderedEntriesByStation,
    auditRows,
    violations,
    valid: violations.length === 0
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

function renderScenarioComparison(scenarios) {
  scenarioComparisonBody.innerHTML = "";
  const requiredTakt = Number(taktTimeInput.value) || 0;
  scenarios.forEach((scenario) => {
    const row = document.createElement("tr");
    row.dataset.stationCount = String(scenario.stationCount);
    if (!scenario.solution) {
      [scenario.stationCount, "Infeasible", "—", "—", "—", "Not run"].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      const action = document.createElement("td");
      action.textContent = scenario.error || "No feasible assignment.";
      action.className = "scenario-status-fail";
      row.appendChild(action);
      scenarioComparisonBody.appendChild(row);
      return;
    }

    const solution = scenario.solution;
    const bottlenecks = solution.activeStations
      .filter((station) => Math.abs(solution.loads[station] - solution.minimumTakt) <= 0.001)
      .join(", ");
    const target = requiredTakt > 0
      ? (solution.minimumTakt <= requiredTakt + 0.001 ? "Met" : "Not met")
      : "Not entered";
    [
      scenario.stationCount,
      `${solution.minimumTakt.toFixed(3)} sec`,
      `${(solution.efficiency * 100).toFixed(1)}%`,
      bottlenecks,
      target,
      solution.futurePlan.valid ? "PASS" : "FAIL"
    ].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 4 && requiredTakt > 0) cell.className = target === "Met" ? "scenario-status-pass" : "scenario-status-fail";
      if (index === 5) cell.className = solution.futurePlan.valid ? "scenario-status-pass" : "scenario-status-fail";
      row.appendChild(cell);
    });
    const action = document.createElement("td");
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "secondary-button scenario-view-button";
    viewButton.textContent = "View";
    viewButton.addEventListener("click", () => renderFutureState(solution));
    action.appendChild(viewButton);
    row.appendChild(action);
    scenarioComparisonBody.appendChild(row);
  });
}

function renderFutureState(solution, scrollToResult = true) {
  futureStateSolution = solution;
  optimizationResult.hidden = false;
  const targetComparison = solution.requiredTakt > 0
    ? ` The required ${solution.requiredTakt.toFixed(1)} second takt is ${solution.minimumTakt <= solution.requiredTakt + 0.001 ? "achievable" : "not achievable"} with this station count.`
    : "";
  optimizationSummary.textContent = `${solution.status} solution: the lowest achievable takt with ${solution.activeStations.length} station${solution.activeStations.length === 1 ? "" : "s"} is ${solution.minimumTakt.toFixed(3)} seconds.${targetComparison} ${solution.futurePlan.auditRows.length} precedence relationship${solution.futurePlan.auditRows.length === 1 ? "" : "s"} validated.`;

  optimizationMetrics.innerHTML = "";
  addOptimizationMetric("Future stations", String(solution.activeStations.length));
  addOptimizationMetric("Total work", `${solution.totalWork.toFixed(1)} sec`);
  addOptimizationMetric("Minimum takt", `${solution.minimumTakt.toFixed(3)} sec`);
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
    taktLabel.textContent = `Min takt ${solution.minimumTakt.toFixed(1)}`;
    taktLine.appendChild(taktLabel);

    const stack = document.createElement("div");
    stack.className = "future-stack";
    stack.style.height = `${Math.min(100, solution.loads[station] / solution.takt * 100)}%`;
    const stationEntries = solution.futurePlan.orderedEntriesByStation[station];
    stationEntries.forEach((entry) => {
      const item = entry.item;
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
  solution.futurePlan.rows.forEach((futureRow) => {
      const item = balanceItemById(futureRow.balanceId);
      const row = document.createElement("tr");
      [
        futureRow.sequence,
        futureRow.description,
        item.row.station,
        futureRow.station,
        futureRow.durationSeconds.toFixed(3)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      futureAssignmentBody.appendChild(row);
    });
  scenarioComparisonBody.querySelectorAll("tr").forEach((row) => {
    row.classList.toggle("selected-scenario", Number(row.dataset.stationCount) === solution.activeStations.length);
  });
  if (scrollToResult) optimizationResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function optimizeLineBalance() {
  const minimumCount = Math.floor(Number(minimumStationCountInput.value) || 0);
  const maximumCount = Math.floor(Number(maximumStationCountInput.value) || 0);
  if (minimumCount < 1 || maximumCount > balanceItems.length || minimumCount > maximumCount) {
    setStatus(`Enter a valid station range between 1 and ${balanceItems.length}.`, true);
    return;
  }

  setFutureStationCount(maximumCount);
  const baselinePool = [...futureStationPool];
  const baselineAllowed = new Map(balanceItems.map((item) => [item.id, [...item.allowedStations]]));
  const requiredTakt = Number(taktTimeInput.value) || 0;

  confirmBalanceBtn.disabled = true;
  confirmBalanceBtn.textContent = "Calculating 0%";
  exportFutureBtn.disabled = true;
  setStatus(`Preparing ${maximumCount - minimumCount + 1} line-balance scenarios…`);
  try {
    const glpk = await getGlpkSolver();
    const scenarios = [];
    const scenarioTotal = maximumCount - minimumCount + 1;
    for (let stationCount = minimumCount; stationCount <= maximumCount; stationCount += 1) {
      const completed = stationCount - minimumCount;
      confirmBalanceBtn.textContent = `Calculating ${Math.round(completed / scenarioTotal * 100)}%`;
      setStatus(`Calculating minimum takt for ${stationCount} station${stationCount === 1 ? "" : "s"} (${completed + 1} of ${scenarioTotal})…`);

      const scenarioPool = buildFutureStationPool(stationCount);
      futureStationPool = scenarioPool;
      balanceItems.forEach((item) => {
        if (item.locked) return;
        const originalAllowed = baselineAllowed.get(item.id) || [];
        const wasUnrestricted = baselinePool.every((station) => originalAllowed.includes(station));
        item.allowedStations = wasUnrestricted
          ? [...scenarioPool]
          : scenarioPool.filter((station) => originalAllowed.includes(station));
      });

      const unavailableLocks = balanceItems.filter((item) => item.locked && !scenarioPool.includes(item.row.station || "Unassigned"));
      const noStations = balanceItems.filter((item) => !item.locked && item.allowedStations.length === 0);
      if (unavailableLocks.length || noStations.length) {
        const error = unavailableLocks.length
          ? `${unavailableLocks[0].row.description} is locked to unavailable ${unavailableLocks[0].row.station}.`
          : `${noStations.length} process${noStations.length === 1 ? " has" : "es have"} no allowed station.`;
        scenarios.push({ stationCount, solution: null, error });
        continue;
      }

      const { model, stations: modelStations } = buildLineBalanceModel(glpk);
      const solveResult = await glpk.solve(model, {
        msglev: glpk.GLP_MSG_OFF,
        presol: true,
        mipgap: 0.001,
        tmlim: 15
      });
      if (![glpk.GLP_OPT, glpk.GLP_FEAS].includes(solveResult.result.status)) {
        scenarios.push({
          stationCount,
          solution: null,
          error: "No feasible assignment satisfies precedence, locks, and allowed-station rules."
        });
        continue;
      }
      const solution = extractLineBalanceSolution(glpk, solveResult, modelStations, requiredTakt);
      solution.futurePlan = buildFutureStatePlan(solution);
      if (!solution.futurePlan.valid) {
        scenarios.push({ stationCount, solution: null, error: "Generated sequence failed precedence validation." });
        continue;
      }
      scenarios.push({ stationCount, solution });
    }

    futureStationPool = baselinePool;
    balanceItems.forEach((item) => { item.allowedStations = [...(baselineAllowed.get(item.id) || [])]; });
    futureStateScenarios = scenarios;
    const feasible = scenarios.filter((scenario) => scenario.solution);
    if (!feasible.length) throw new Error("No feasible scenarios were found in the selected station range.");

    renderScenarioComparison(scenarios);
    const recommended = requiredTakt > 0
      ? feasible.find((scenario) => scenario.solution.minimumTakt <= requiredTakt + 0.001)
      : null;
    const selected = recommended || feasible[0];
    renderFutureState(selected.solution, false);
    optimizationResult.scrollIntoView({ behavior: "smooth", block: "start" });
    exportFutureBtn.disabled = false;
    setStatus(`${feasible.length} of ${scenarios.length} scenarios calculated. ${recommended ? `${recommended.stationCount} stations is the first scenario that meets the required takt.` : "Review the comparison and export all scenarios in one workbook."}`);
  } catch (error) {
    console.error(error);
    invalidateFutureState();
    setStatus(`Scenario calculation failed: ${error.message}`, true);
  } finally {
    futureStationPool = baselinePool;
    balanceItems.forEach((item) => { item.allowedStations = [...(baselineAllowed.get(item.id) || [])]; });
    confirmBalanceBtn.disabled = false;
    confirmBalanceBtn.textContent = "Calculate Scenarios";
  }
}

async function generateFutureStateWorkbook() {
  if (!futureStateScenarios.length) return;
  const feasibleScenarios = futureStateScenarios.filter((scenario) => scenario.solution);
  if (!feasibleScenarios.length) return;
  const invalidScenario = feasibleScenarios.find((scenario) => !scenario.solution.futurePlan.valid);
  if (invalidScenario) {
    setStatus(`Export blocked: the ${invalidScenario.stationCount}-station scenario failed precedence validation.`, true);
    return;
  }
  const baseMetadata = {
    studyName: studyNameInput.value.trim() || "LineFlow Study",
    product: productNameInput.value.trim(),
    observer: observerNameInput.value.trim()
  };
  const currentMetadata = {
    ...baseMetadata,
    taktTime: Number(taktTimeInput.value) || 0,
    taktLabel: "Required Takt Time (sec)",
    taktSummaryLabel: "Required Takt (sec)"
  };
  const currentRows = balanceItems
    .map((item) => ({ ...item.row }))
    .sort((a, b) => a.station.localeCompare(b.station) || a.sequence - b.sequence);

  exportFutureBtn.disabled = true;
  exportFutureBtn.textContent = "Generating…";
  setStatus(`Building one workbook with ${feasibleScenarios.length} future-state scenarios…`);
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "LineFlow";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Line Balance Scenario Comparison";

    addScenarioSummarySheet(workbook, futureStateScenarios, {
      ...baseMetadata,
      requiredTakt: Number(taktTimeInput.value) || 0
    });
    addStudyDataSheet(workbook, currentRows, currentMetadata, {
      sheetName: "Current State Data",
      title: "LineFlow Current State Data"
    });
    addPaagSheet(workbook, currentRows, currentMetadata);
    addYamazumiSheet(workbook, currentRows, currentMetadata, {
      sheetName: "Current State Yamazumi",
      stateLabel: "Current State"
    });
    addScenarioPrecedenceRelationshipsSheet(workbook, futureStateScenarios);
    feasibleScenarios.forEach((scenario) => {
      const futureMetadata = {
        ...baseMetadata,
        taktTime: scenario.solution.minimumTakt,
        taktLabel: "Minimum Achievable Takt (sec)",
        taktSummaryLabel: "Minimum Takt (sec)"
      };
      addStudyDataSheet(workbook, scenario.solution.futurePlan.rows, futureMetadata, {
        sheetName: `${scenario.stationCount}-Stn Data`,
        title: `LineFlow ${scenario.stationCount}-Station Future State Data`
      });
      addYamazumiSheet(workbook, scenario.solution.futurePlan.rows, futureMetadata, {
        sheetName: `${scenario.stationCount}-Stn Yamazumi`,
        stateLabel: `${scenario.stationCount}-Station Future State`
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const minimumCount = futureStateScenarios[0].stationCount;
    const maximumCount = futureStateScenarios[futureStateScenarios.length - 1].stationCount;
    link.download = `${safeFileName(baseMetadata.studyName)}-${minimumCount}-to-${maximumCount}-station-line-balance-scenarios.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Scenario workbook generated with ${feasibleScenarios.length} future-state options and combined precedence validation.`);
  } catch (error) {
    console.error(error);
    setStatus(`Future-state workbook generation failed: ${error.message}`, true);
  } finally {
    exportFutureBtn.disabled = false;
    exportFutureBtn.textContent = "Export Scenario Workbook";
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
minimumStationCountInput.addEventListener("change", () => {
  const minimumCount = Math.floor(Number(minimumStationCountInput.value) || 0);
  const maximumCount = Math.floor(Number(maximumStationCountInput.value) || 0);
  invalidateFutureState();
  if (minimumCount < 1 || minimumCount > maximumCount) {
    setStatus(`Minimum stations must be between 1 and the maximum of ${maximumCount}.`, true);
    return;
  }
  setStatus(`LineFlow will compare every scenario from ${minimumCount} through ${maximumCount} stations.`);
});
maximumStationCountInput.addEventListener("change", () => {
  const minimumCount = Math.floor(Number(minimumStationCountInput.value) || 0);
  const maximumCount = Math.floor(Number(maximumStationCountInput.value) || 0);
  if (maximumCount < minimumCount || maximumCount > balanceItems.length) {
    setStatus(`Maximum stations must be between ${minimumCount} and ${balanceItems.length}.`, true);
    return;
  }
  setFutureStationCount(maximumCount);
  setStatus(`LineFlow will compare every scenario from ${minimumCount} through ${maximumCount} stations.`);
});
confirmBalanceBtn.addEventListener("click", optimizeLineBalance);
exportFutureBtn.addEventListener("click", generateFutureStateWorkbook);
window.addEventListener("resize", () => {
  if (!balanceWorkspace.hidden) requestAnimationFrame(drawPrecedenceLines);
});
precedenceCanvas.addEventListener("scroll", () => {
  if (!balanceWorkspace.hidden) requestAnimationFrame(drawPrecedenceLines);
});
