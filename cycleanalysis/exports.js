/* Use the processor's ExcelJS format and artifact-authored native chart templates. */
const CycleExports = (() => {
  const quote=name=>`'${name.replace(/'/g,"''")}'`;
  const xml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
  const f=(formula,result)=>({formula,result:result===null?"n.a.":result});
  function header(sheet,row,values) {
    sheet.getRow(row).values=values;
    sheet.getRow(row).height=32;
    values.forEach((_,i)=>{const c=sheet.getCell(row,i+1);c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF26364F"}};c.font={name:"Arial",size:10,bold:true,color:{argb:"FFFFFFFF"}};c.alignment={wrapText:true,vertical:"middle"};});
  }
  function title(sheet,value,last=8) {
    sheet.mergeCells(2,1,2,last);sheet.getCell("A2").value=value;
    sheet.getCell("A2").font={name:"Arial",size:16,bold:true,color:{argb:"FF26364F"}};
    sheet.getRow(2).height=30;
  }
  function makeWorkbook(ExcelJS,studies,reportTitle) {
    const wb=new ExcelJS.Workbook();wb.creator="LineFlow";wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
    const comparison=wb.addWorksheet("Comparison",{views:[{showGridLines:false}]});
    comparison.columns=[{width:36},...Array.from({length:8},()=>({width:17}))];
    title(comparison,reportTitle,9);
    comparison.mergeCells("A3:I3");comparison.getCell("A3").value="Each study is analyzed separately. Cycle times exclude any paused time. Compare like-for-like processes and conditions.";
    comparison.getCell("A3").alignment={wrapText:true};comparison.getRow(3).height=32;
    header(comparison,5,["Study","Units","Mean (sec)","Median (sec)","Std dev (sec)","P95 (sec)","I flags","MR flags","Example data?"]);
    const bundles=[];
    studies.forEach((study,index)=>{
      const s=study.stats,num=index+1,reportName=`${num} Report`,dataName=`${num} Data`,source=quote(dataName),reportRef=quote(reportName),last=s.n+6;
      const report=wb.addWorksheet(reportName,{views:[{showGridLines:false}]});
      const data=wb.addWorksheet(dataName,{views:[{state:"frozen",ySplit:6,showGridLines:false}]});
      report.columns=Array.from({length:8},()=>({width:14}));
      data.columns=Array.from({length:18},()=>({width:18}));
      for(let r=1;r<=87;r++)report.getRow(r).height=20;
      title(report,study.name);
      report.mergeCells("A3:H3");report.getCell("A3").value=study.example?"ILLUSTRATIVE EXAMPLE — not client measurements":`Source: ${study.source}`;
      report.getCell("A3").alignment={wrapText:true};report.getRow(3).height=30;
      const values=`${source}!$B$7:$B$${last}`,ranges=`${source}!$C$8:$C$${last}`,logs=`${source}!$J$7:$J$${last}`;
      const normal=s.fits.find(fit=>fit.name==="Normal"),lognormal=s.fits.find(fit=>fit.name==="Lognormal");
      const logValues=s.min>0?study.rows.map(row=>Math.log(row.seconds)):[];
      const logMean=logValues.length?logValues.reduce((sum,value)=>sum+value,0)/s.n:null;
      const logSigma=logValues.length?Math.sqrt(logValues.reduce((sum,value)=>sum+(value-logMean)**2,0)/s.n):null;
      const cells=[
        ["A4","Units"],["B4",s.n],["C4","Mean (sec)"],["D4",f(`AVERAGE(${values})`,s.mean)],["E4","Median (sec)"],["F4",f(`MEDIAN(${values})`,s.median)],["G4","Std dev (sec)"],["H4",f(`IF(B4>1,STDEV(${values}),"n.a.")`,s.sd)],
        ["A6","Min (sec)"],["B6",f(`MIN(${values})`,s.min)],["C6","Max (sec)"],["D6",f(`MAX(${values})`,s.max)],["E6","P95 (sec)"],["F6",f(`PERCENTILE(${values},0.95)`,s.p95)],["G6","Skewness"],["H6",f(`IF(AND(B4>2,D6>B6),SKEW(${values}),"n.a.")`,s.skew)],
        ["A8","MR mean"],["B8",s.n>1?f(`AVERAGE(${ranges})`,s.mrMean):"n.a."],["C8","I LCL"],["D8",f('IF(ISNUMBER(B8),D4-3*B8/1.128,"n.a.")',s.lcl)],["E8","I UCL"],["F8",f('IF(ISNUMBER(B8),D4+3*B8/1.128,"n.a.")',s.ucl)],["G8","MR UCL"],["H8",f('IF(ISNUMBER(B8),3.267*B8,"n.a.")',s.mrUcl)],
        ["A10","Normal μ"],["B10",f("D4",s.mean)],["C10","Normal σ (MLE)"],["D10",f(`STDEVP(${values})`,s.sd===null?0:Math.sqrt((s.n-1)/s.n)*s.sd)],["E10","Log μ"],["F10",f(`IF(MIN(${values})>0,AVERAGE(${logs}),"n.a.")`,lognormal?.mu??logMean)],["G10","Log σ (MLE)"],["H10",f(`IF(MIN(${values})>0,STDEVP(${logs}),"n.a.")`,lognormal?.sigma??logSigma)],
        ["A12","Normal AIC"],["B12",f('IF(AND(B4>=8,D10>0),4+B4*(LN(2*PI())+1+2*LN(D10)),"n.a.")',normal?.aic??null)],["C12","Lognormal AIC"],["D12",f(`IF(AND(B4>=8,B6>0,D10>0),4+B4*(LN(2*PI())+1+2*LN(H10))+2*SUM(${logs}),"n.a.")`,lognormal?.aic??null)],["E12","I flags"],["F12",f(`COUNTIF(${source}!Q7:Q${last},"Flag")`,s.signals.length)],["G12","MR flags"],["H12",f(`COUNTIF(${source}!R7:R${last},"Flag")`,s.mrSignals.length)]
      ];
      cells.forEach(([address,value])=>{const c=report.getCell(address);c.value=value;c.font={name:"Arial",size:10};c.alignment={vertical:"middle",wrapText:true};if(["B","D","F","H"].includes(address[0])){c.numFmt="0.000";c.font.bold=true;}});
      report.getCell("B4").numFmt="0";report.getCell("F12").numFmt="0";report.getCell("H12").numFmt="0";
      report.mergeCells("A14:H14");report.getCell("A14").value="Lower AIC favors a model only relative to the candidates; it is not proof of fit. Limits use the whole study and only the beyond-limit rule.";
      report.getCell("A14").alignment={wrapText:true};report.getRow(14).height=32;
      const notes=[
        "Charts and statistics update when existing Data cells change. Re-import to add/remove units or change histogram bin count.",
        "Histogram bin count is fixed at export. Bin edges recalculate with min/max; fit lines show expected bin counts at bin midpoints.",
        "No units are excluded. Paused time is absent from the source CSV. This report cannot measure disruption frequency or delay penalties.",
        "Fewer than 20 units gives preliminary limits. Check independence, skew, and process changes before monitoring. Control limits are not specifications.",
        "I limits = mean ± 3 × MR mean / 1.128. MR UCL = 3.267 × MR mean; MR LCL = 0. Only beyond-limit flags are tested.",
        "P95 uses inclusive linear interpolation. Standard deviation uses n−1. Normal/lognormal estimates use maximum likelihood; each model has 2 parameters."
      ];
      notes.forEach((note,i)=>{report.mergeCells(80+i,1,80+i,8);report.getCell(80+i,1).value=note;report.getCell(80+i,1).alignment={wrapText:true};report.getCell(80+i,1).font={name:"Arial",size:9};report.getRow(80+i).height=30;});
      report.pageSetup={orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:"A1:H85"};
      report.getRow(47).addPageBreak();report.getRow(79).addPageBreak();
      title(data,`Source observations — ${study.name}`,10);
      data.mergeCells("A3:J3");data.getCell("A3").value=`${study.example?"ILLUSTRATIVE EXAMPLE. ":""}Source: ${study.source}. Columns A/B are inputs; keep unit order. Other columns calculate.`;
      data.getCell("A3").alignment={wrapText:true};data.getRow(3).height=30;
      data.mergeCells("A4:R4");data.getCell("A4").value="Methods: https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc322.htm | https://www.itl.nist.gov/div898/handbook/eda/section3/eda3669.htm | https://stat.ethz.ch/R-manual/R-devel/library/stats/html/AIC.html";
      data.getCell("A4").alignment={wrapText:true};data.getRow(4).height=30;
      header(data,6,["Unit","Cycle time (sec)","Moving range","Mean","I LCL","I UCL","MR mean","MR UCL","MR LCL","Log time","Bin lower","Bin upper","Bin midpoint (sec)","Observed count","Normal fit","Lognormal fit","I signal","MR signal"]);
      const cache={A:[],B:[],C:[],D:[],E:[],F:[],G:[],H:[],I:[],M:[],N:[],O:[],P:[]};
      study.rows.forEach((row,i)=>{
        const r=i+7;data.getRow(r).values=[row.unit,row.seconds,i?f(`ABS(B${r}-B${r-1})`,s.moving[i]):null,f(`${reportRef}!D4`,s.mean),f(`${reportRef}!D8`,s.lcl),f(`${reportRef}!F8`,s.ucl),f(`${reportRef}!B8`,s.mrMean),f(`${reportRef}!H8`,s.mrUcl),0,f(`IF(B${r}>0,LN(B${r}),"n.a.")`,row.seconds>0?Math.log(row.seconds):null)];
        data.getCell(r,2).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFE7AB"}};
        data.getCell(r,17).value=f(`IF(AND(ISNUMBER(E${r}),ISNUMBER(F${r}),F${r}>E${r}),IF(OR(B${r}<E${r},B${r}>F${r}),"Flag","Within"),"n.a.")`,s.sigma>0?(s.signals.includes(row.unit)?"Flag":"Within"):"n.a.");
        data.getCell(r,18).value=i?f(`IF(AND(ISNUMBER(H${r}),H${r}>0),IF(C${r}>H${r},"Flag","Within"),"n.a.")`,s.mrMean>0?(s.mrSignals.includes(row.unit)?"Flag":"Within"):"n.a."):"n.a.";
        [row.unit,row.seconds,s.moving[i],s.mean,s.lcl,s.ucl,s.mrMean,s.mrUcl,0].forEach((v,j)=>cache["ABCDEFGHI"[j]].push(v));
      });
      s.bins.forEach((bin,i)=>{
        const r=i+7,count=s.bins.length,mid=(bin.low+bin.high)/2,width=bin.high-bin.low;
        const lowerFormula=`IF(${reportRef}!D6=${reportRef}!B6,MAX(0,${reportRef}!B6-0.5),${reportRef}!B6+${i}*(${reportRef}!D6-${reportRef}!B6)/${count})`;
        const upperFormula=`IF(${reportRef}!D6=${reportRef}!B6,K${r}+MAX(1,${reportRef}!B6-K${r}+0.5),${reportRef}!B6+${i+1}*(${reportRef}!D6-${reportRef}!B6)/${count})`;
        data.getCell(r,11).value=f(lowerFormula,bin.low);data.getCell(r,12).value=f(upperFormula,bin.high);data.getCell(r,13).value=f(`ROUND((K${r}+L${r})/2,3)`,Number(mid.toFixed(3)));
        data.getCell(r,14).value=f(`COUNTIFS(${values},">="&K${r},${values},"${i===count-1?"<=":"<"}"&L${r})`,bin.count);
        const normalValue=normal?CycleStats.density(normal,mid)*s.n*width:null,logValue=lognormal?CycleStats.density(lognormal,mid)*s.n*width:null;
        data.getCell(r,15).value=f(`IF(AND(${reportRef}!B4>=8,${reportRef}!D10>0),NORMDIST(M${r},${reportRef}!B10,${reportRef}!D10,FALSE)*${reportRef}!B4*(L${r}-K${r}),"")`,normalValue);
        data.getCell(r,16).value=f(`IF(AND(${reportRef}!B4>=8,${reportRef}!B6>0,${reportRef}!D10>0),EXP(-0.5*((LN(M${r})-${reportRef}!F10)/${reportRef}!H10)^2)/(M${r}*${reportRef}!H10*SQRT(2*PI()))*${reportRef}!B4*(L${r}-K${r}),"")`,logValue);
        cache.M.push(Number(mid.toFixed(3)));cache.N.push(bin.count);cache.O.push(normalValue);cache.P.push(logValue);
      });
      for(let c=2;c<=16;c++)data.getColumn(c).numFmt="0.000";
      data.getColumn(14).numFmt="0";
      data.addConditionalFormatting({
        ref:`Q7:R${last}`,
        rules:[{type:"containsText",operator:"containsText",text:"Flag",style:{
          font:{bold:true,color:{argb:"FFB02D49"}},
          fill:{type:"pattern",pattern:"solid",bgColor:{argb:"FFFFE4EA"}}
        }}]
      });
      const cr=index+6;comparison.getRow(cr).values=[study.name,f(`${reportRef}!B4`,s.n),f(`${reportRef}!D4`,s.mean),f(`${reportRef}!F4`,s.median),f(`${reportRef}!H4`,s.sd),f(`${reportRef}!F6`,s.p95),f(`${reportRef}!F12`,s.signals.length),f(`${reportRef}!H12`,s.mrSignals.length),study.example?"Yes":"No"];
      comparison.getRow(cr).height=30;comparison.getCell(cr,1).alignment={wrapText:true};
      for(let c=3;c<=6;c++)comparison.getCell(cr,c).numFmt="0.000";
      bundles.push({sheetId:report.id,dataName,cache});
    });
    comparison.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1};
    return {wb,bundles};
  }
  function bindChart(template,bundle) {
    return template.replace(/<c:(numRef|strRef)>([\s\S]*?)<\/c:\1>/g,(all,type,body)=>{
      const match=body.match(/<c:f>[^<]*!\$([A-Z]+)\$\d+:\$[A-Z]+\$\d+<\/c:f>/);
      if(!match)throw new Error("Chart template has an unsupported reference.");
      const column=match[1],values=bundle.cache[column];
      if(!values)throw new Error(`Missing chart data ${column}.`);
      const cacheName=type==="numRef"?"numCache":"strCache";
      const points=values.map((value,i)=>value===null?"":`<c:pt idx="${i}"><c:v>${xml(type==="strRef"?Number(value.toFixed(3)):value)}</c:v></c:pt>`).join("");
      return `<c:${type}><c:f>${xml(quote(bundle.dataName))}!$${column}$7:$${column}$${values.length+6}</c:f><c:${cacheName}>${type==="numRef"?"<c:formatCode>0.000</c:formatCode>":""}<c:ptCount val="${values.length}"/>${points}</c:${cacheName}></c:${type}>`;
    });
  }
  async function build(ExcelJS,JSZip,template,studies,reportTitle) {
    const {wb,bundles}=makeWorkbook(ExcelJS,studies,reportTitle);
    const zip=await JSZip.loadAsync(await wb.xlsx.writeBuffer());
    let contentTypes=await zip.file("[Content_Types].xml").async("string");
    const relationships=items=>`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
    for(let i=0;i<bundles.length;i++){
      const bundle=bundles[i],drawing=`cycle${i+1}`,sheetPath=`xl/worksheets/sheet${bundle.sheetId}.xml`;
      let rid=0;zip.file(`xl/drawings/${drawing}.xml`,template.drawing.replace(/r:id="[^"]+"/g,()=>`r:id="rId${++rid}"`));
      const chartRels=[];
      for(let j=0;j<template.charts.length;j++){
        const chart=`cycle${i+1}-${j+1}`;
        zip.file(`xl/charts/${chart}.xml`,bindChart(template.charts[j],bundle));
        chartRels.push(`<Relationship Id="rId${j+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${chart}.xml"/>`);
        contentTypes=contentTypes.replace("</Types>",`<Override PartName="/xl/charts/${chart}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      }
      zip.file(`xl/drawings/_rels/${drawing}.xml.rels`,relationships(chartRels.join("")));
      let sheetXml=await zip.file(sheetPath).async("string");
      sheetXml=sheetXml.replace("</worksheet>",'<drawing r:id="rIdNativeCharts"/></worksheet>');
      zip.file(sheetPath,sheetXml);
      const relPath=`xl/worksheets/_rels/sheet${bundle.sheetId}.xml.rels`;
      const rel=`<Relationship Id="rIdNativeCharts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${drawing}.xml"/>`;
      zip.file(relPath,zip.file(relPath)?(await zip.file(relPath).async("string")).replace("</Relationships>",`${rel}</Relationships>`):relationships(rel));
      contentTypes=contentTypes.replace("</Types>",`<Override PartName="/xl/drawings/${drawing}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    }
    zip.file("[Content_Types].xml",contentTypes);
    return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
  }
  return {makeWorkbook,bindChart,build};
})();
if(typeof module!=="undefined")module.exports=CycleExports;
