/* Workbook extensions. Keep exports compatible with the processor's ExcelJS runtime. */
const LineFlowReports = (() => {
  const quote = name => `'${name.replace(/'/g, "''")}'`;
  const formula = (text, result) => ({ formula: text, result });
  const stationOf = row => row.station || "Unassigned";
  // SUMIF treats *, ? and ~ specially; station names must match literally.
  const criteria = value => value.replace(/~/g, "~~").replace(/\*/g, "~*").replace(/\?/g, "~?").replace(/"/g, '""');
  const total = rows => rows.reduce((sum, row) => sum + row.durationSeconds, 0);

  function title(sheet, text, endColumn) {
    sheet.mergeCells(1, 1, 2, endColumn);
    sheet.getCell("A1").value = text;
    applyTitleStyle(sheet.getCell("A1"));
    sheet.getRow(1).height = 28;
    sheet.getRow(2).height = 12;
  }

  function readProductionInputs() {
    const ids = ["shiftHours", "shiftsPerDay", "breakMinutes", "downtimeMinutes"];
    const values = ids.map(id => document.getElementById(id).value);
    const [hours, shifts, breaks, downtime] = values.map(Number);
    if (values.some(value => value.trim() === "") || !values.every(value => Number.isFinite(Number(value)))
      || hours < 0 || hours > 24 || !Number.isInteger(shifts) || shifts < 1
      || hours * shifts > 24 || breaks < 0 || downtime < 0 || breaks + downtime > hours * 60) {
      throw new Error("Check daily production time: enter all four values, keep scheduled hours at or below 24 per day, and keep breaks plus downtime within the shift.");
    }
    return { hours, shifts, breaks, downtime };
  }

  function addDailyCapacity(workbook, options, production) {
    const sheet = workbook.addWorksheet("Daily Capacity", { views: [{ showGridLines: false }] });
    title(sheet, "Daily production capacity", 7);
    sheet.columns = [{width:27},{width:17},{width:20},{width:19},{width:20},{width:20},{width:22},{width:3},{width:3},{width:24},{width:23},{width:21}];
    sheet.mergeCells("A3:G3");
    sheet.getCell("A3").value = "Edit amber cells. Capacity assumes steady-state flow, one unit per cycle, and one operator per station.";
    sheet.getCell("A3").alignment = { wrapText: true, vertical: "middle" };
    sheet.getRow(3).height = 30;
    [
      [5,"Hours per shift",production.hours], [6,"Shifts per day",production.shifts],
      [7,"Break min / shift",production.breaks], [8,"Downtime min / shift",production.downtime]
    ].forEach(([r,label,value]) => {
      sheet.getCell(r,1).value = label;
      sheet.getCell(r,2).value = value;
      sheet.getCell(r,2).fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFFFE7AB"} };
      sheet.getCell(r,2).numFmt = r === 6 ? "0" : "0.00";
      sheet.getCell(r,2).dataValidation = { type:r===6?"whole":"decimal",operator:"between",formulae:[r===6?1:0,r===5||r===6?24:1440],allowBlank:false,showErrorMessage:true,errorStyle:"stop",errorTitle:"Invalid production time",error:"Enter a nonnegative time or a positive whole shift count." };
      sheet.getRow(r).height = 24;
    });
    const netShift = production.hours*60-production.breaks-production.downtime;
    const netDay = netShift*production.shifts;
    sheet.getCell("A10").value = "Net minutes / shift";
    sheet.getCell("B10").value = formula('IF(COUNT(B5:B8)<>4,"Enter all inputs",IF(OR(B5<0,B5>24,B6<1,B6<>INT(B6),B5*B6>24,B7<0,B8<0,B7+B8>B5*60),"Check time inputs",B5*60-B7-B8))',netShift);
    sheet.getCell("A11").value = "Net minutes / day";
    sheet.getCell("B11").value = formula('IF(ISNUMBER(B10),B10*B6,"")',netDay);
    sheet.getCell("A12").value = "Net seconds / day";
    sheet.getCell("B12").value = formula('IF(ISNUMBER(B11),B11*60,"")',netDay*60);
    for (let r=10;r<=12;r++) { sheet.getCell(r,2).numFmt="#,##0.00"; sheet.getRow(r).height=24; }
    sheet.mergeCells("A14:G14");
    sheet.getCell("A14").value = "Units/day = net seconds/day ÷ bottleneck cycle time, rounded down. Startup, scrap, and unplanned losses are excluded.";
    sheet.getCell("A14").alignment = {wrapText:true,vertical:"middle"}; sheet.getRow(14).height=32;
    sheet.getRow(16).values = ["Scenario","Operators","Cycle time (sec)","Units / net hour","Net hours / day","Whole units / day","Labor hours / day",null,null,"Scenario","Operator / Station","Work per unit (sec)"];
    [1,2,3,4,5,6,7,10,11,12].forEach(c=>applyHeaderStyle(sheet.getCell(16,c)));
    sheet.getRow(16).height = 32;
    let loadRow=17;
    options.forEach((option,index) => {
      const stations=[...new Set(option.rows.map(stationOf))];
      const first=loadRow;
      const source=quote(option.dataSheet);
      const last=option.rows.length+6;
      stations.forEach(station=>{
        sheet.getCell(loadRow,10).value=option.label;
        sheet.getCell(loadRow,11).value=station;
        sheet.getCell(loadRow,12).value=formula(`SUMIF(${source}!$B$7:$B$${last},"${criteria(station)}",${source}!$D$7:$D$${last})`,total(option.rows.filter(row=>stationOf(row)===station)));
        sheet.getCell(loadRow,12).numFmt="0.000";
        sheet.getRow(loadRow).height=26;
        loadRow++;
      });
      const r=index+17;
      const cycle=Math.max(...stations.map(station=>total(option.rows.filter(row=>stationOf(row)===station))),0);
      sheet.getCell(r,1).value=option.label;
      sheet.getCell(r,2).value=stations.length;
      sheet.getCell(r,3).value=formula(`MAX(L${first}:L${loadRow-1})`,cycle);
      sheet.getCell(r,4).value=formula(`IF(C${r}>0,3600/C${r},"n.a.")`,cycle>0?3600/cycle:"n.a.");
      sheet.getCell(r,5).value=formula('IF(ISNUMBER($B$11),$B$11/60,"")',netDay/60);
      sheet.getCell(r,6).value=formula(`IF(NOT(ISNUMBER($B$12)),"",IF(C${r}>0,INT($B$12/C${r}),"n.a."))`,cycle>0?Math.floor(netDay*60/cycle):"n.a.");
      sheet.getCell(r,7).value=formula(`IF(ISNUMBER(E${r}),B${r}*E${r},"")`,stations.length*netDay/60);
      [3,4,5,7].forEach(c=>sheet.getCell(r,c).numFmt=c===3?"0.000":"0.00");
      sheet.getCell(r,6).numFmt="#,##0";
    });
    const noteRow=Math.max(loadRow,17+options.length)+2;
    sheet.mergeCells(noteRow,1,noteRow,7);
    sheet.getCell(noteRow,1).value="Operator assignments are export snapshots. Timing edits update capacity; rerun line balancing in the processor to optimize again.";
    sheet.getCell(noteRow,1).alignment={wrapText:true}; sheet.getRow(noteRow).height=32;
    sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:L${noteRow}`};
  }

  function addOperatorPaag(workbook, rows, options) {
    const sheet=workbook.addWorksheet(`${options.count}-Stn PAAG`,{views:[{showGridLines:false}]});
    title(sheet,`${options.title} — ${options.count}-operator Process at a Glance`,5);
    sheet.getColumn(1).width=24;
    for(let c=2;c<=5;c++)sheet.getColumn(c).width=27;
    sheet.mergeCells("A3:E3");
    sheet.getCell("A3").value="Grouped by assigned operator, in precedence-valid work order. Photos and layout are captured at export.";
    sheet.getCell("A3").alignment={wrapText:true}; sheet.getRow(3).height=30;
    const source=quote(options.dataSheet);
    let top=5;
    const stations=[...new Set(rows.map(stationOf))];
    stations.forEach(station=>{
      const assigned=rows.map((row,index)=>({row,sourceRow:index+7})).filter(entry=>stationOf(entry.row)===station);
      for(let offset=0;offset<assigned.length;offset+=4){
        const batch=assigned.slice(offset,offset+4);
        sheet.mergeCells(top,1,top,5);
        sheet.getCell(top,1).value=`${station} · Elements ${offset+1}–${offset+batch.length} of ${assigned.length}`;
        applyHeaderStyle(sheet.getCell(top,1)); sheet.getRow(top).height=26;
        [[1,"Process number"],[2,"Description"],[5,"Process sketch"],[13,"Tool"],[14,"Category"],[15,"Time (sec)"]].forEach(([r,label])=>{
          sheet.getCell(top+r,1).value=label;applyHeaderStyle(sheet.getCell(top+r,1));
        });
        sheet.mergeCells(top+2,1,top+4,1);sheet.mergeCells(top+5,1,top+12,1);
        batch.forEach(({row,sourceRow},index)=>{
          const col=index+2;
          [[1,"A",row.sequence],[2,"C",row.description],[13,"F",row.tool||"None"],[14,"E",row.category],[15,"D",row.durationSeconds]].forEach(([r,c,value])=>{
            sheet.getCell(top+r,col).value=formula(`${source}!${c}${sourceRow}`,value);
            sheet.getCell(top+r,col).alignment={vertical:"middle",wrapText:true,horizontal:r===2?"left":"center"};
          });
          sheet.mergeCells(top+2,col,top+4,col);sheet.mergeCells(top+5,col,top+12,col);
          sheet.getCell(top+15,col).numFmt="0.000";
          if(row.imageDataUrl){
            const id=workbook.addImage({base64:row.imageDataUrl,extension:imageExtension(row.imageFile)});
            sheet.addImage(id,{tl:{col:col-1+0.06,row:top+4.15},ext:{width:174,height:170},editAs:"oneCell"});
          }else{sheet.getCell(top+5,col).value="No snapshot";sheet.getCell(top+5,col).alignment={horizontal:"center",vertical:"middle"};}
          for(let r=top+1;r<=top+15;r++)applyThinBorder(sheet.getCell(r,col));
        });
        for(let r=top+1;r<=top+15;r++)sheet.getRow(r).height=r>=top+5&&r<=top+12?18:26;
        sheet.getCell(top+17,1).value="Operator total (sec)";
        sheet.getCell(top+17,2).value=formula(`SUMIF(${source}!$B$7:$B$${rows.length+6},"${criteria(station)}",${source}!$D$7:$D$${rows.length+6})`,total(assigned.map(entry=>entry.row)));
        sheet.getCell(top+17,2).numFmt="0.000";sheet.getRow(top+17).height=26;
        sheet.getRow(top+18).addPageBreak(); top+=20;
      }
    });
    sheet.pageSetup={orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:E${top-2}`,printTitlesRow:"1:3"};
  }

  function criticalPath(items,edges) {
    const nodes=items.map(item=>({id:item.id,row:item.row,pred:[],succ:[],es:0,ef:0,ls:0,lf:0,level:0}));
    const map=new Map(nodes.map(node=>[node.id,node]));
    if(map.size!==nodes.length)throw new Error("Duplicate process IDs in precedence network.");
    const seen=new Set();
    edges.forEach(edge=>{
      if(!map.has(edge.from)||!map.has(edge.to))throw new Error("A precedence arrow refers to a missing process.");
      const key=JSON.stringify([edge.from,edge.to]);if(seen.has(key))return;seen.add(key);
      map.get(edge.from).succ.push(edge.to);map.get(edge.to).pred.push(edge.from);
    });
    const indegree=new Map(nodes.map(node=>[node.id,node.pred.length]));
    const ready=nodes.filter(node=>!node.pred.length);const ordered=[];
    while(ready.length){
      const node=ready.shift();
      const duration=Number(node.row.durationSeconds);
      if(!Number.isFinite(duration)||duration<0)throw new Error("Critical path requires finite, nonnegative durations.");
      node.es=Math.max(0,...node.pred.map(id=>map.get(id).ef));node.ef=node.es+duration;
      node.level=node.pred.length?Math.max(...node.pred.map(id=>map.get(id).level))+1:0;
      ordered.push(node);
      node.succ.forEach(id=>{indegree.set(id,indegree.get(id)-1);if(!indegree.get(id))ready.push(map.get(id));});
    }
    if(ordered.length!==nodes.length)throw new Error("Critical path cannot be calculated for circular precedence.");
    const duration=Math.max(0,...nodes.map(node=>node.ef));
    [...ordered].reverse().forEach(node=>{
      node.lf=node.succ.length?Math.min(...node.succ.map(id=>map.get(id).ls)):duration;
      node.ls=node.lf-node.row.durationSeconds;node.float=Math.max(0,node.ls-node.es);node.critical=node.float<0.000001;
    });
    return {nodes:ordered,map,duration,edges:[...seen].map(key=>{const[from,to]=JSON.parse(key);return{from,to};})};
  }

  function networkImage(network) {
    const layers=[];network.nodes.forEach(node=>(layers[node.level]??=[]).push(node));
    const boxW=250,boxH=110,gapX=90,gapY=34,pad=45;
    const width=pad*2+layers.length*(boxW+gapX)+150;
    const height=Math.max(240,Math.max(1,...layers.map(layer=>layer.length))*(boxH+gapY)+pad*2);
    const canvas=document.createElement("canvas");
    const scale=Math.min(1,12000/width,12000/height,Math.sqrt(40000000/(width*height)));
    canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
    const ctx=canvas.getContext("2d");ctx.scale(scale,scale);ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);
    const positions=new Map();layers.forEach((layer,x)=>layer.forEach((node,y)=>positions.set(node.id,{x:pad+75+x*(boxW+gapX),y:pad+y*(boxH+gapY)})));
    const arrow=(x1,y1,x2,y2,color)=>{
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x1,y1);const bend=(x1+x2)/2;ctx.bezierCurveTo(bend,y1,bend,y2,x2,y2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-9,y2-5);ctx.lineTo(x2-9,y2+5);ctx.closePath();ctx.fill();
    };
    const start={x:pad,y:height/2},finish={x:width-pad-12,y:height/2};
    network.nodes.forEach(node=>{
      const p=positions.get(node.id);
      if(!node.pred.length)arrow(start.x+20,start.y,p.x,p.y+boxH/2,node.critical?"#bd3045":"#a4aab6");
      if(!node.succ.length)arrow(p.x+boxW,p.y+boxH/2,finish.x-20,finish.y,node.critical?"#bd3045":"#a4aab6");
    });
    network.edges.forEach(edge=>{
      const a=positions.get(edge.from),b=positions.get(edge.to),from=network.map.get(edge.from),to=network.map.get(edge.to);
      const critical=from.critical&&to.critical&&Math.abs(from.ef-to.es)<0.000001;
      arrow(a.x+boxW,a.y+boxH/2,b.x,b.y+boxH/2,critical?"#bd3045":"#a4aab6");
    });
    [[start,"Start"],[finish,"Finish"]].forEach(([p,label])=>{
      ctx.fillStyle="#172033";ctx.beginPath();ctx.arc(p.x,p.y,22,0,Math.PI*2);ctx.fill();
      ctx.font="12px Arial";ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.fillText(label,p.x,p.y+4);ctx.textAlign="left";
    });
    network.nodes.forEach((node,index)=>{
      const p=positions.get(node.id);ctx.fillStyle=node.critical?"#fff0f2":"#f0f3fa";ctx.strokeStyle=node.critical?"#bd3045":"#5366c7";ctx.lineWidth=2;
      ctx.fillRect(p.x,p.y,boxW,boxH);ctx.strokeRect(p.x,p.y,boxW,boxH);
      ctx.fillStyle="#172033";ctx.font="bold 14px Arial";ctx.fillText(`P${index+1}  ${node.row.durationSeconds.toFixed(3)} sec`,p.x+12,p.y+21);
      ctx.font="13px Arial";
      const words=String(node.row.description).split(/\s+/);let line="",lines=[];
      words.forEach(word=>{const next=line?line+" "+word:word;if(ctx.measureText(next).width>boxW-24&&line){lines.push(line);line=word;}else line=next;});lines.push(line);
      lines.slice(0,2).forEach((text,i)=>{while(ctx.measureText(text).width>boxW-24)text=text.slice(0,-2)+"…";ctx.fillText(text,p.x+12,p.y+43+i*17);});
      ctx.font="12px Arial";ctx.fillText(`ES ${node.es.toFixed(2)}   EF ${node.ef.toFixed(2)}`,p.x+12,p.y+83);
      ctx.fillText(`Float ${node.float.toFixed(2)}${node.critical?"  · Critical":""}`,p.x+12,p.y+101);
    });
    return{data:canvas.toDataURL("image/png"),width:canvas.width,height:canvas.height};
  }

  function addCriticalPath(workbook,items,edges,sourceRows,dataSheet) {
    const network=criticalPath(items,edges);
    const sheet=workbook.addWorksheet("Critical Path",{views:[{state:"frozen",ySplit:7,showGridLines:false}]});
    title(sheet,"Precedence critical path network",10);
    sheet.columns=[{width:26},{width:35},{width:24},...Array.from({length:6},()=>({width:17})),{width:18}];
    sheet.getCell("A3").value="Critical path (sec)";
    sheet.getCell("B3").value=formula(`MAX(F8:F${network.nodes.length+7})`,network.duration);sheet.getCell("B3").numFmt="0.000";
    sheet.mergeCells("A4:J4");sheet.getCell("A4").value="Precedence-only elapsed time for one unit. Parallel tasks may overlap; operator limits and transfer delays are excluded. This is not line cycle time.";
    sheet.getRow(4).height=30;sheet.getCell("A4").alignment={wrapText:true};
    sheet.mergeCells("A5:J5");sheet.getCell("A5").value=edges.length?"Only the arrows you defined are dependencies. Stage positions do not add dependencies.":"No arrows defined: tasks are treated as independent. Add dependencies in Line Balancing before interpreting the critical path.";
    sheet.getRow(5).height=30;sheet.getCell("A5").alignment={wrapText:true};
    sheet.getRow(7).values=["Process ID","Description","Predecessors","Duration (sec)","Earliest start","Earliest finish","Latest start","Latest finish","Total float","Critical?"];
    sheet.getRow(7).height=32;for(let c=1;c<=10;c++)applyHeaderStyle(sheet.getCell(7,c));
    const rowById=new Map(network.nodes.map((node,index)=>[node.id,index+8]));
    const sourceById=new Map(sourceRows.map((row,index)=>[row.balanceId,index+7]));
    network.nodes.forEach((node,index)=>{
      const r=index+8,sourceRow=sourceById.get(node.id);
      if(!sourceRow)throw new Error("A critical-path process is missing from the exported data.");
      sheet.getCell(r,1).value=`P${index+1}`;
      sheet.getCell(r,2).value=formula(`${quote(dataSheet)}!C${sourceRow}`,node.row.description);
      sheet.getCell(r,3).value=node.pred.map(id=>`P${rowById.get(id)-7}`).join(", ")||"Start";
      sheet.getCell(r,4).value=formula(`${quote(dataSheet)}!D${sourceRow}`,node.row.durationSeconds);
      sheet.getCell(r,5).value=formula(node.pred.length?`MAX(${node.pred.map(id=>`F${rowById.get(id)}`).join(",")})`:"0",node.es);
      sheet.getCell(r,6).value=formula(`E${r}+D${r}`,node.ef);
      sheet.getCell(r,8).value=formula(node.succ.length?`MIN(${node.succ.map(id=>`G${rowById.get(id)}`).join(",")})`:"$B$3",node.lf);
      sheet.getCell(r,7).value=formula(`H${r}-D${r}`,node.ls);
      sheet.getCell(r,9).value=formula(`MAX(0,G${r}-E${r})`,node.float);
      sheet.getCell(r,10).value=formula(`IF(I${r}<0.000001,"Critical","")`,node.critical?"Critical":"");
      for(let c=4;c<=9;c++)sheet.getCell(r,c).numFmt="0.000";
      sheet.getRow(r).height=40;sheet.getRow(r).alignment={wrapText:true,vertical:"middle"};
    });
    sheet.addConditionalFormatting({ref:`A8:J${network.nodes.length+7}`,rules:[{type:"expression",formulae:['$J8="Critical"'],style:{fill:{type:"pattern",pattern:"solid",bgColor:{argb:"FFFFE4E9"}}}}]});
    const image=networkImage(network),top=network.nodes.length+11;
    sheet.mergeCells(top-1,1,top-1,10);sheet.getCell(top-1,1).value="Network at export: red nodes and arrows mark critical paths. The timing table recalculates in Excel; regenerate this diagram after changing durations or arrows.";
    sheet.getCell(top-1,1).alignment={wrapText:true};sheet.getRow(top-1).height=32;
    const id=workbook.addImage({base64:image.data,extension:"png"});
    const diagramScale=Math.min(1,1450/image.width);
    const diagramHeight=image.height*diagramScale;
    sheet.addImage(id,{tl:{col:0,row:top-1},ext:{width:image.width*diagramScale,height:diagramHeight},editAs:"oneCell"});
    const bottom=top+Math.ceil(diagramHeight/20)+1;
    for(let r=top;r<=bottom;r++)sheet.getRow(r).height=15;
    sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:J${bottom}`};
    return network;
  }

  return {readProductionInputs,addDailyCapacity,addOperatorPaag,criticalPath,networkImage,addCriticalPath};
})();
if (typeof module !== "undefined") module.exports = LineFlowReports;
