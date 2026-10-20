const CycleCharts = (() => {
  const escape = value => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const number = value => value === null || !Number.isFinite(value) ? "n.a." : value.toLocaleString("en-US",{maximumFractionDigits:3});
  const W=920,H=310,L=74,R=110,T=28,B=54;
  function frame(title,xMin,xMax,yMin,yMax,xLabel,yLabel,body) {
    if(xMax===xMin)xMax=xMin+1;
    if(yMax===yMin)yMax=yMin+1;
    const px=x=>L+(x-xMin)/(xMax-xMin)*(W-L-R);
    const py=y=>H-B-(y-yMin)/(yMax-yMin)*(H-T-B);
    let grid="";
    for(let i=0;i<=4;i++){
      const y=yMin+(yMax-yMin)*i/4;
      grid+=`<line x1="${L}" y1="${py(y)}" x2="${W-R}" y2="${py(y)}" stroke="#e2e7ef"/><text x="${L-10}" y="${py(y)+4}" text-anchor="end">${number(y)}</text>`;
      const x=xMin+(xMax-xMin)*i/4;
      grid+=`<text x="${px(x)}" y="${H-B+22}" text-anchor="middle">${number(x)}</text>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(title)}"><rect width="${W}" height="${H}" fill="white"/><g font-family="Arial,sans-serif" font-size="12" fill="#536071">${grid}<text x="${(L+W-R)/2}" y="${H-5}" text-anchor="middle">${escape(xLabel)}</text><text transform="translate(18 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle">${escape(yLabel)}</text>${body(px,py)}</g></svg>`;
  }
  function histogram(stats) {
    const bins=stats.bins,lo=bins[0].low,hi=bins.at(-1).high,width=bins[0].high-bins[0].low;
    const curves=stats.fits.map(fit=>({fit,points:Array.from({length:181},(_,i)=>{const x=lo+(hi-lo)*i/180;return{x,y:CycleStats.density(fit,x)*stats.n*width};})}));
    const max=Math.max(1,...bins.map(b=>b.count),...curves.flatMap(c=>c.points.map(p=>p.y)))*1.12;
    return frame("Cycle-time distribution",lo,hi,0,max,"Cycle time (seconds)","Units per bin",(px,py)=>{
      let body=bins.map(b=>`<rect x="${px(b.low)+1}" y="${py(b.count)}" width="${Math.max(.5,px(b.high)-px(b.low)-2)}" height="${py(0)-py(b.count)}" fill="#c5c1ed"><title>${number(b.low)}–${number(b.high)} sec: ${b.count} units</title></rect>`).join("");
      curves.forEach(({fit,points},i)=>body+=`<path d="${points.map((p,j)=>`${j?"L":"M"}${px(p.x)},${py(p.y)}`).join(" ")}" fill="none" stroke="${i?"#148477":"#6a51c6"}" stroke-width="2.5"/>`);
      body+=`<line x1="${px(stats.mean)}" y1="${T}" x2="${px(stats.mean)}" y2="${H-B}" stroke="#172033" stroke-dasharray="4 4"/><text x="${W-R+12}" y="40">Mean ${number(stats.mean)}</text>`;
      return body;
    });
  }
  function control(rows,stats,mr=false) {
    const values=mr?stats.moving:rows.map(r=>r.seconds);
    const center=mr?stats.mrMean:stats.mean, upper=mr?stats.mrUcl:stats.ucl, lower=mr?0:stats.lcl;
    const limits=upper===null?[]:[lower,center,upper];
    const all=values.filter(v=>v!==null).concat(limits);
    let low=Math.min(0,...all),high=Math.max(1,...all);
    const padding=(high-low)*.08;low-=low<0?padding:0;high+=padding;
    return frame(mr?"Moving Range chart":"Individuals chart",rows[0].unit,rows.at(-1).unit,low,high,"Unit number (recording order)","Seconds",(px,py)=>{
      let body="";
      if(upper!==null) [[upper,"UCL","#b63e57"],[center,"Mean","#148477"],[lower,"LCL","#b63e57"]].forEach(([value,label,color])=>{
        body+=`<line x1="${L}" y1="${py(value)}" x2="${W-R}" y2="${py(value)}" stroke="${color}" stroke-dasharray="5 4"/><text x="${W-R+10}" y="${py(value)+4}" fill="${color}">${label} ${number(value)}</text>`;
      });
      const points=rows.map((r,i)=>({x:r.unit,y:values[i]})).filter(p=>p.y!==null);
      body+=`<path d="${points.map((p,i)=>`${i?"L":"M"}${px(p.x)},${py(p.y)}`).join(" ")}" fill="none" stroke="#6554ba" stroke-width="1.6"/>`;
      points.forEach(p=>{
        const signal=(mr?stats.mrSignals:stats.signals).includes(p.x);
        if(signal||points.length<=250)body+=`<circle cx="${px(p.x)}" cy="${py(p.y)}" r="${signal?4.5:2.6}" fill="${signal?"#c83250":"#6554ba"}"><title>Unit ${p.x}: ${number(p.y)} seconds${signal?" — beyond limit":""}</title></circle>`;
      });
      return body;
    });
  }
  function comparison(studies) {
    const max=Math.max(1,...studies.flatMap(s=>[s.stats.mean,s.stats.p95]));
    const height=80+studies.length*56;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 ${height}" role="img" aria-label="Study average and 95th percentile comparison"><rect width="920" height="${height}" fill="white"/><g font-family="Arial" font-size="12" fill="#536071"><text x="290" y="20" fill="#6554ba">Average</text><text x="385" y="20" fill="#148477">95th percentile</text>${studies.map((s,i)=>{
      const y=50+i*56;
      return `<text x="10" y="${y+9}">${escape(s.name.length>32?s.name.slice(0,31)+"…":s.name)}</text><rect x="290" y="${y-7}" width="${s.stats.mean/max*500}" height="14" fill="#6554ba"/><text x="${300+s.stats.mean/max*500}" y="${y+5}">${number(s.stats.mean)}</text><rect x="290" y="${y+10}" width="${s.stats.p95/max*500}" height="14" fill="#148477"/><text x="${300+s.stats.p95/max*500}" y="${y+22}">${number(s.stats.p95)}</text>`;
    }).join("")}<text x="540" y="${height-8}" text-anchor="middle">Cycle time (seconds); bars start at zero</text></g></svg>`;
  }
  return {escape,number,histogram,control,comparison};
})();
