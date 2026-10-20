const $=id=>document.getElementById(id);
const esc=CycleCharts.escape,fmt=CycleCharts.number;
const studies=[];
let librariesPromise;
function setStatus(message,error=false){$("status").textContent=message;$("status").classList.toggle("error",error);}
function selected(){return studies[Number($("studySelect").value)||0];}
function addStudy(name,source,rows,example=false){studies.push({name:name.slice(0,80),source,rows,example,stats:CycleStats.analyze(rows)});}
function methodNotes(){
  return `<div class="notes"><p>Times are in seconds and exclude pauses made in the stopwatch. No observations are removed and no long cycle is automatically labeled a disruption. These data cannot recover pause durations or identify causes.</p><p>SPC: Individuals limits = mean ± 3 × average moving range / 1.128. Moving Range UCL = 3.267 × average moving range; LCL = 0. Each study supplies its own limits. Only points beyond limits are flagged; no runs or trend tests. Control limits are not specification limits. Check independence and process consistency before interpreting them.</p><p>Distribution: equal-width histogram bins (square-root rule, 3–20 bins; one for identical values). Curves show fitted density × sample count × bin width. Normal and zero-location lognormal parameters are fitted by maximum likelihood; AIC = 4 − 2 × log likelihood. Fits require 8 non-identical observations and lognormal requires all times &gt; 0. No goodness-of-fit p-value is claimed. P95 uses inclusive interpolation; sample standard deviation uses n−1.</p><p>Methods: <a href="https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc322.htm">NIST Individuals charts</a> · <a href="https://www.itl.nist.gov/div898/handbook/eda/section3/eda3669.htm">NIST lognormal distribution</a> · <a href="https://stat.ethz.ch/R-manual/R-devel/library/stats/html/AIC.html">AIC definition</a></p></div>`;
}
function reportStudy(study,printing=false){
  const s=study.stats;
  const metrics=[["Units",s.n,""],["Average",s.mean,"sec"],["Median",s.median,"sec"],["Std deviation",s.sd,"sec"],["95th percentile",s.p95,"sec"],["Range",`${fmt(s.min)}–${fmt(s.max)}`,"sec"]];
  return `<article class="report ${printing?"print-study":""}">
    ${study.example?'<div class="sample-tag">ILLUSTRATIVE EXAMPLE · not client measurements</div>':""}
    <h2>${esc(study.name)}</h2><p class="muted source">Source: ${esc(study.source)} · ${s.n} completed units · Recording order preserved</p>
    <div class="metrics">${metrics.map(([label,value,unit])=>`<div class="metric"><span>${label}</span><strong>${typeof value==="string"?esc(value):fmt(value)} <small>${unit}</small></strong></div>`).join("")}</div>
    <section class="chart-card"><h3>Distribution of cycle times</h3><div class="legend"><span style="--key:#c5c1ed">Observed units</span><span style="--key:#6a51c6">Normal fit</span><span style="--key:#148477">Lognormal fit</span><span style="--key:#172033">Average</span></div>${CycleCharts.histogram(s)}</section>
    <p>${esc(s.fitNote)} Sample skewness: <strong>${fmt(s.skew)}</strong>.</p>
    ${s.fits.length?`<table><thead><tr><th>Fitted model</th><th>Location parameter</th><th>Scale parameter</th><th>AIC (lower is better)</th></tr></thead><tbody>${s.fits.map(fit=>`<tr><td>${fit.name}</td><td>${fmt(fit.mu)}${fit.name==="Lognormal"?" (log seconds)":" sec"}</td><td>${fmt(fit.sigma)}${fit.name==="Lognormal"?" (log seconds)":" sec"}</td><td>${fmt(fit.aic)}</td></tr>`).join("")}</tbody></table>`:""}
    <div class="spc-page">
      <section class="chart-card"><h3>Individuals chart · each unit in sequence</h3>${CycleCharts.control(study.rows,s)}<p>${s.sigma>0?`Beyond-limit units: <span class="signal">${s.signals.length?s.signals.join(", "):"None"}</span>.`:"Signals unavailable: insufficient observed variation."} Limits estimated from the full study.</p></section>
      <section class="chart-card"><h3>Moving Range chart · change between consecutive units</h3>${CycleCharts.control(study.rows,s,true)}<p>${s.mrMean>0?`Beyond-limit ranges ending at unit: <span class="signal">${s.mrSignals.length?s.mrSignals.join(", "):"None"}</span>.`:"Signals unavailable: insufficient observed variation."}</p></section>
      <div class="warning">${s.warnings.map(w=>`<p>${esc(w)}</p>`).join("")}</div>
    </div>
    <details class="screen-only"><summary>View source observations and flags</summary><div class="unit-list"><table><thead><tr><th>Unit</th><th>Cycle time (sec)</th><th>Moving range</th><th>Flag</th></tr></thead><tbody>${study.rows.map((r,i)=>`<tr><td>${r.unit}</td><td>${fmt(r.seconds)}</td><td>${fmt(s.moving[i])}</td><td>${s.signals.includes(r.unit)?"Individuals":""}${s.mrSignals.includes(r.unit)?" Moving range":""}</td></tr>`).join("")}</tbody></table></div></details>
    ${printing?"":methodNotes()}</article>`;
}
function comparison(){
  return `<section class="report comparison"><h2>Compare studies</h2><p class="muted">Each file is a separate sample. Compare the same process under comparable conditions; these differences do not establish cause or statistical significance.</p>
  ${studies.some(s=>s.example)?'<p class="sample-tag">Includes illustrative example data</p>':""}
  ${CycleCharts.comparison(studies)}
  <div class="scroll-table"><table><thead><tr><th>Study</th><th>Units</th><th>Mean (sec)</th><th>Median (sec)</th><th>Std dev (sec)</th><th>P95 (sec)</th><th>I / MR flags</th></tr></thead><tbody>${studies.map(s=>`<tr><td>${esc(s.name)}</td><td>${s.stats.n}</td><td>${fmt(s.stats.mean)}</td><td>${fmt(s.stats.median)}</td><td>${fmt(s.stats.sd)}</td><td>${fmt(s.stats.p95)}</td><td>${s.stats.signals.length} / ${s.stats.mrSignals.length}</td></tr>`).join("")}</tbody></table></div></section>`;
}
function render(){
  const index=Math.min(Number($("studySelect").value)||0,studies.length-1);
  $("studySelect").replaceChildren(...studies.map((s,i)=>{const option=document.createElement("option");option.value=i;option.textContent=s.name;return option;}));
  $("studySelect").value=Math.max(0,index);
  $("workspace").hidden=!studies.length;$("empty").hidden=!!studies.length;
  if(!studies.length){$("screenReport").replaceChildren();$("printReport").replaceChildren();return;}
  $("studyLabel").value=selected().name;
  $("screenReport").innerHTML=(studies.length>1?comparison():"")+reportStudy(selected());
}
function allReports(){
  return `<div class="report"><h1 class="report-title">${esc($("reportTitle").value.trim()||"Cycle time study report")}</h1><p class="muted">LineFlow · Generated ${esc(new Date().toLocaleString())} · ${studies.length} stud${studies.length===1?"y":"ies"}</p></div>${studies.length>1?comparison():""}${studies.map(s=>reportStudy(s,true)).join("")}<section class="report print-study"><h2>Methods and interpretation</h2>${methodNotes()}</section>`;
}
$("csvInput").addEventListener("change",async()=>{
  const files=[...$("csvInput").files];const errors=[];let added=0;
  for(const file of files){
    if(studies.length>=10){errors.push("Maximum 10 studies. Remove a study before adding another.");break;}
    try{
      if(file.size>2e6)throw new Error("File exceeds 2 MB.");
      const text=await file.text(),rows=CycleStats.parseCsv(text);
      if(studies.some(s=>s.source===file.name&&JSON.stringify(s.rows)===JSON.stringify(rows)))throw new Error("This file is already loaded.");
      addStudy(file.name.replace(/\.csv$/i,""),file.name,rows);added++;
    }catch(error){errors.push(`${file.name}: ${error.message}`);}
  }
  $("csvInput").value="";render();
  setStatus(`${added} study file${added===1?"":"s"} added. Export includes all loaded studies.${errors.length?"\n"+errors.join("\n"):""}`,!!errors.length);
});
$("exampleBtn").addEventListener("click",()=>{
  if(studies.some(s=>s.example)){setStatus("Example studies are already loaded. Select one from the Study to view menu.");return;}
  if(studies.length>8){setStatus("Remove a study to make room for the two examples.",true);return;}
  const before=[28,29,27,31,28,30,29,27,28,32,29,30,28,62,31,29,28,30,27,29,31,28,30,29,27,28,29,45,30,28];
  const after=[25,26,24,25,26,25,27,24,25,26,25,24,26,25,25,27,26,24,25,26,25,24,26,25,27,25,24,26,25,25];
  [before,after].forEach((times,i)=>addStudy(i?"Example — after":"Example — before",i?"Illustrative after.csv":"Illustrative before.csv",times.map((seconds,j)=>({unit:j+1,seconds})),true));
  render();setStatus("Two illustrative studies loaded. These are examples, not measurements from your client.");
});
$("studySelect").addEventListener("change",render);
$("studyLabel").addEventListener("change",()=>{if(!selected())return;selected().name=$("studyLabel").value.trim()||selected().source;render();});
$("removeBtn").addEventListener("click",()=>{studies.splice(Number($("studySelect").value),1);render();setStatus("Study removed from this view. The original CSV file is unchanged.");});
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$("printBtn").addEventListener("click",()=>{
  $("printReport").innerHTML=allReports();window.print();
});
$("htmlBtn").addEventListener("click",async()=>{
  try{
    const response=await fetch("styles.css");if(!response.ok)throw new Error("Could not load report styles.");
    const styles=await response.text();
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc($("reportTitle").value)}</title><style>${styles}\nbody{background:#edf0f6}.saved{max-width:1100px;margin:auto;padding:24px}.saved .report{color-scheme:light}@media print{.saved{padding:0}.saved .report{border-radius:0}}</style><body><div class="saved">${allReports()}</div></body></html>`;
    download(new Blob([html],{type:"text/html;charset=utf-8"}),"lineflow-cycle-report.html");setStatus("Portable report downloaded. Open it in any browser and print or save as PDF.");
  }catch(error){setStatus(error.message,true);}
});
function loadScript(src,globalName){
  if(window[globalName])return Promise.resolve();
  return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error("Excel export could not load its library. Check your internet connection and retry."));};document.head.append(script);});
}
$("excelBtn").addEventListener("click",async()=>{
  $("excelBtn").disabled=true;setStatus("Building the Excel report with editable charts…");
  try{
    librariesPromise??=Promise.all([loadScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js","ExcelJS"),loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js","JSZip")]).catch(error=>{librariesPromise=null;throw error;});
    await librariesPromise;
    const response=await fetch("chart-template.json");if(!response.ok)throw new Error("Native chart template could not be loaded.");
    const bytes=await CycleExports.build(ExcelJS,JSZip,await response.json(),studies,$("reportTitle").value.trim()||"Cycle time study report");
    download(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),"lineflow-cycle-analysis.xlsx");
    setStatus("Excel download requested. It includes all studies, source observations, formulas, and editable charts.");
  }catch(error){console.error(error);setStatus(`Excel export failed: ${error.message}`,true);}
  finally{$("excelBtn").disabled=false;}
});
