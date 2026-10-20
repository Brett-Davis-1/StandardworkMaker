const test=require('node:test');
const assert=require('node:assert/strict');
const stats=require('../cycleanalysis/statistics.js');
const rows=values=>values.map((seconds,i)=>({unit:i+1,seconds}));
const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('CSV imports BOM, quoted fields, CRLF, and zero values',()=>{
  assert.deepEqual(stats.parseCsv('\uFEFF"unit_number","cycle_time_seconds"\r\n"1","0"\r\n2,1.25\r\n'),rows([0,1.25]));
});
test('CSV rejects missing, negative, nonfinite, duplicate, reordered, or omitted units',()=>{
  for(const body of ['1,\n','1,-1\n','1,Infinity\n','1,1\n1,2\n','2,1\n1,2\n','1,1\n3,2\n','1,1,extra\n']){
    assert.throws(()=>stats.parseCsv('unit_number,cycle_time_seconds\n'+body));
  }
  assert.throws(()=>stats.parseCsv('unit_number,unit_number,cycle_time_seconds\n1,1,2'));
  assert.throws(()=>stats.parseCsv('unit_number,cycle_time_seconds\n1,"1'));
});
test('SPC reproduces the NIST individual-observation example',()=>{
  const s=stats.analyze(rows([49.6,47.6,49.9,51.3,47.8,51.2,52.6,52.4,53.6,52.1]));
  close(s.mean,50.81);close(s.mrMean,16.9/9);close(s.ucl,50.81+3*(16.9/9)/1.128);close(s.lcl,50.81-3*(16.9/9)/1.128);close(s.mrUcl,3.267*(16.9/9));
  assert.deepEqual(s.signals,[]);assert.equal(s.moving[0],null);
});
test('sample deviation, inclusive percentiles, and histogram counts are correct',()=>{
  const s=stats.analyze(rows([1,2,3,4,5]));close(s.mean,3);close(s.median,3);close(s.sd,Math.sqrt(2.5));close(s.p95,4.8);
  close(s.skew,0);assert.equal(s.bins.reduce((a,b)=>a+b.count,0),5);
});
test('outliers are flagged but retained in every calculation',()=>{
  const s=stats.analyze(rows([...Array(29).fill(10),100]));
  assert.equal(s.n,30);assert.equal(s.max,100);assert.deepEqual(s.signals,[30]);assert.deepEqual(s.mrSignals,[30]);close(s.mean,13);
});
test('single-unit, constant, and zero datasets remain defined',()=>{
  const one=stats.analyze(rows([0]));assert.equal(one.sd,null);assert.equal(one.ucl,null);assert.equal(one.fits.length,0);assert.equal(one.bins[0].count,1);
  const flat=stats.analyze(rows(Array(30).fill(10)));assert.equal(flat.sd,0);assert.equal(flat.mrMean,0);assert.deepEqual(flat.signals,[]);assert.equal(flat.fits.length,0);
  const zero=stats.analyze(rows([0,1,2,3,4,5,6,7]));assert.deepEqual(zero.fits.map(f=>f.name),['Normal']);
});
test('normal and lognormal likelihoods include the same observation scale',()=>{
  const values=[1,2,3,4,5,6,7,8],s=stats.analyze(rows(values));
  for(const fit of s.fits)close(fit.aic,4-2*values.reduce((sum,x)=>sum+Math.log(stats.density(fit,x)),0));
  assert.equal(s.fits.length,2);
});
test('SPC is sequence-sensitive; distribution is order-independent',()=>{
  const a=stats.analyze(rows([1,2,3,4,5,6,7,8])),b=stats.analyze(rows([1,8,2,7,3,6,4,5]));
  close(a.mean,b.mean);close(a.sd,b.sd);assert.deepEqual(a.bins,b.bins);assert.notEqual(a.mrMean,b.mrMean);
});
