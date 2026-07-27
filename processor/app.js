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

function addStudyDataSheet(workbook, rows, metadata) {
  const sheet = workbook.addWorksheet("Study Data", {
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }]
  });
  sheet.mergeCells("A1:I2");
  sheet.getCell("A1").value = "LineFlow Study Data";
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

function addYamazumiSheet(workbook, rows, metadata) {
  const sheet = workbook.addWorksheet("Yamazumi", {
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
  sheet.getCell(1, 1).value = `${metadata.studyName} — Current State Yamazumi`;
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
