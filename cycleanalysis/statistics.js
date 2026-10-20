/* Pure calculations shared by the page, reports, and regression tests. */
const CycleStats = (() => {
  function parseCsv(text) {
    const records = [];
    let record = [], field = "", quoted = false, afterQuote = false;
    text = String(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { quoted = false; afterQuote = true; }
        else field += c;
      } else if (c === "," || c === "\n" || c === "\r") {
        record.push(field); field = ""; afterQuote = false;
        if (c !== ",") {
          if (record.some(value => value.trim() !== "")) records.push(record);
          record = [];
          if (c === "\r" && text[i + 1] === "\n") i++;
        }
      } else if (c === '"' && field === "" && !afterQuote) quoted = true;
      else if (afterQuote || c === '"') throw new Error("Malformed CSV quoting.");
      else field += c;
    }
    if (quoted) throw new Error("CSV has an unclosed quote.");
    record.push(field);
    if (record.some(value => value.trim() !== "")) records.push(record);
    if (records.length < 2) throw new Error("CSV needs a header and at least one completed unit.");
    const headers = records.shift().map(value => value.trim().toLowerCase());
    const unitColumn = headers.indexOf("unit_number"), timeColumn = headers.indexOf("cycle_time_seconds");
    if (unitColumn < 0 || timeColumn < 0 || new Set(headers).size !== headers.length) throw new Error("Expected unique unit_number and cycle_time_seconds columns from a LineFlow export.");
    if (records.length > 5000) throw new Error("Use at most 5,000 units per study.");
    return records.map((values, index) => {
      if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has the wrong number of columns.`);
      const unit = Number(values[unitColumn]), seconds = Number(values[timeColumn]);
      if (!/^\d+$/.test(values[unitColumn].trim()) || !Number.isSafeInteger(unit) || unit < 1) throw new Error(`CSV row ${index + 2}: unit number must be a positive integer.`);
      if (!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(values[timeColumn].trim()) || !Number.isFinite(seconds) || seconds < 0 || seconds > 1e9) throw new Error(`CSV row ${index + 2}: cycle time must be a finite, nonnegative number of seconds.`);
      if (index > 0 && unit !== Number(records[index - 1][unitColumn]) + 1) throw new Error(`CSV row ${index + 2}: unit numbers must be consecutive and in recording order. Do not sort times or omit units for SPC.`);
      return { unit, seconds };
    });
  }
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  function percentile(sorted, p) {
    const position = (sorted.length - 1) * p, lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
  }
  function analyze(rows) {
    if (!rows.length) throw new Error("A study needs at least one unit.");
    const x = rows.map(row => row.seconds), n = x.length, sorted = [...x].sort((a,b) => a-b);
    const average = mean(x), sumSquares = x.reduce((sum,value) => sum + (value-average)**2, 0);
    const sd = n > 1 ? Math.sqrt(sumSquares / (n-1)) : null;
    const median = percentile(sorted,.5), p95 = percentile(sorted,.95);
    const moving = x.map((value,index) => index ? Math.abs(value-x[index-1]) : null);
    const mrMean = n > 1 ? mean(moving.slice(1)) : null;
    const sigma = mrMean === null ? null : mrMean / 1.128;
    const lcl = sigma === null ? null : average-3*sigma, ucl = sigma === null ? null : average+3*sigma;
    const mrUcl = mrMean === null ? null : 3.267*mrMean;
    const signals = rows.filter(row => sigma > 0 && (row.seconds < lcl || row.seconds > ucl)).map(row => row.unit);
    const mrSignals = rows.filter((row,i) => mrMean > 0 && moving[i] > mrUcl).map(row => row.unit);
    const skew = n > 2 && sd > 0 ? n / ((n-1)*(n-2)) * x.reduce((sum,v)=>sum+((v-average)/sd)**3,0) : null;
    const spread = sorted[n-1]-sorted[0];
    const binCount = spread === 0 ? 1 : Math.min(20,Math.max(3,Math.ceil(Math.sqrt(n))));
    const low = spread === 0 ? Math.max(0,sorted[0] - .5) : sorted[0];
    const width = spread === 0 ? Math.max(1,sorted[0]-low+.5) : spread/binCount;
    const bins = Array.from({length:binCount},(_,i)=>({low:low+i*width,high:low+(i+1)*width,count:0}));
    x.forEach(value => bins[Math.min(binCount-1,Math.max(0,Math.floor((value-low)/width)))].count++);
    const fits = [];
    if (n >= 8 && spread > 0) {
      const mleSd = Math.sqrt(sumSquares/n);
      const logLikelihood = -n/2*(Math.log(2*Math.PI)+1+2*Math.log(mleSd));
      fits.push({name:"Normal",mu:average,sigma:mleSd,aic:4-2*logLikelihood});
      if (x.every(value=>value>0)) {
        const logs=x.map(Math.log), mu=mean(logs), logSd=Math.sqrt(logs.reduce((sum,v)=>sum+(v-mu)**2,0)/n);
        const ll=-n/2*(Math.log(2*Math.PI)+1+2*Math.log(logSd))-logs.reduce((a,b)=>a+b,0);
        fits.push({name:"Lognormal",mu,sigma:logSd,aic:4-2*ll});
      }
    }
    const ranked=[...fits].sort((a,b)=>a.aic-b.aic);
    let fitNote = "At least 8 non-identical observations are needed for exploratory distribution fits.";
    if (ranked.length===2) fitNote = ranked[1].aic-ranked[0].aic<2
      ? "Normal and lognormal have similar support (AIC difference below 2). Neither is established as the true distribution."
      : `${ranked[0].name} has lower AIC among the two fitted models. This relative comparison does not prove that either model fits well.`;
    if (ranked.length===1) fitNote="Normal fit shown. Lognormal requires every time to be above zero; no two-model comparison is available.";
    const warnings = [];
    if(n<20) warnings.push("Fewer than 20 units: control limits are preliminary. Gather more observations before using them for ongoing monitoring.");
    if(n===1) warnings.push("One unit cannot estimate variation or control limits.");
    else if(mrMean===0) warnings.push("No observed variation: limits coincide and SPC signals are unavailable. Check timer resolution.");
    warnings.push("Limits are estimated from this entire study. Flags use only points beyond the limits; runs and trend rules are not tested.");
    if(signals.length || mrSignals.length) warnings.push("Investigate flagged units before treating these limits as a stable baseline. No observations have been removed.");
    if(skew!==null && Math.abs(skew)>1) warnings.push("The sample is strongly skewed. Symmetric Individuals limits may be less informative; interpret signals with the distribution.");
    return {n,mean:average,median,p95,sd,min:sorted[0],max:sorted[n-1],skew,moving,mrMean,sigma,lcl,ucl,mrUcl,signals,mrSignals,bins,fits,fitNote,warnings};
  }
  function density(fit,x) {
    if(fit.name==="Lognormal" && x<=0) return 0;
    const value=fit.name==="Lognormal"?Math.log(x):x;
    return Math.exp(-.5*((value-fit.mu)/fit.sigma)**2)/(fit.sigma*Math.sqrt(2*Math.PI)*(fit.name==="Lognormal"?x:1));
  }
  return {parseCsv,analyze,percentile,density};
})();
if(typeof module!=="undefined") module.exports=CycleStats;
