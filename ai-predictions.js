/* LandSetu independent land-conflict trend model.
 * Source: user-provided landportal-LCW-LCI-NOCONF.csv.
 * No contributor model, contributor scores, or contributor-submitted inputs are used.
 * The source ends in 2018, so projections are historical research estimates only.
 */
const LAND_CONFLICT_DATA = [
  [1912,1],[1916,1],[1921,1],[1938,1],[1941,1],[1946,1],[1950,2],[1952,2],[1955,1],[1956,1],
  [1959,1],[1960,2],[1962,2],[1967,1],[1970,4],[1972,3],[1973,2],[1974,2],[1975,1],[1976,2],
  [1978,5],[1979,2],[1980,7],[1981,1],[1982,1],[1983,3],[1984,1],[1985,2],[1987,4],[1988,1],
  [1989,3],[1990,2],[1991,3],[1992,6],[1993,2],[1994,6],[1995,3],[1996,3],[1997,4],[1998,4],
  [1999,1],[2000,7],[2001,7],[2002,8],[2003,9],[2004,6],[2005,12],[2006,15],[2007,23],[2008,28],
  [2009,31],[2010,18],[2011,27],[2012,26],[2013,28],[2014,33],[2015,67],[2016,69],[2017,54],[2018,25]
].map(([year,value])=>({year,value}));

const AI_MODEL_NAME = 'OLS linear trend · latest 10 observations';
const AI_TRAINING_WINDOW = 10;
let aiForecastHorizon = 5;

function aiEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function aiFitTrend(rows) {
  const sample=rows.slice(-AI_TRAINING_WINDOW);
  const origin=sample[0].year;
  const xs=sample.map(r=>r.year-origin), ys=sample.map(r=>r.value);
  const meanX=xs.reduce((a,b)=>a+b,0)/xs.length, meanY=ys.reduce((a,b)=>a+b,0)/ys.length;
  const denom=xs.reduce((s,x)=>s+(x-meanX)**2,0);
  const slope=denom?xs.reduce((s,x,i)=>s+(x-meanX)*(ys[i]-meanY),0)/denom:0;
  const intercept=meanY-slope*meanX;
  return {slope,intercept,origin,trainedThrough:sample[sample.length-1].year,sampleSize:sample.length,
    predict:year=>Math.max(0,slope*(year-origin)+intercept)};
}
function aiBacktest(rows) {
  const start=Math.max(AI_TRAINING_WINDOW,rows.length-10), errors=[], naiveErrors=[];
  for(let i=start;i<rows.length;i++){
    const train=rows.slice(Math.max(0,i-AI_TRAINING_WINDOW),i);
    const model=aiFitTrend(train);
    errors.push(Math.abs(rows[i].value-model.predict(rows[i].year)));
    naiveErrors.push(Math.abs(rows[i].value-rows[i-1].value));
  }
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  return {trendMae:mean(errors),naiveMae:mean(naiveErrors),testCount:errors.length};
}
function aiForecast(rows,horizon) {
  const fit=aiFitTrend(rows),last=rows[rows.length-1];
  return Array.from({length:horizon},(_,i)=>{
    const year=last.year+i+1;
    return {year,value:Math.round(fit.predict(year))};
  });
}
function aiTrendChart(rows,forecast) {
  const W=920,H=300,L=54,R=20,T=18,B=38, minYear=1912,maxYear=forecast[forecast.length-1]?.year||2018;
  const maxValue=Math.max(80,...rows.map(x=>x.value),...forecast.map(x=>x.value));
  const x=year=>L+(year-minYear)/(maxYear-minYear)*(W-L-R);
  const y=value=>H-B-(value/maxValue)*(H-T-B);
  const points=rows.map(r=>x(r.year)+','+y(r.value)).join(' ');
  const fpoints=[{year:rows[rows.length-1].year,value:rows[rows.length-1].value},...forecast].map(r=>x(r.year)+','+y(r.value)).join(' ');
  const grid=[0,20,40,60,80].map(v=>'<line x1="'+L+'" y1="'+y(v)+'" x2="'+(W-R)+'" y2="'+y(v)+'" stroke="#e8edf4"/><text x="'+(L-12)+'" y="'+(y(v)+4)+'" text-anchor="end" fill="#758197" font-size="11">'+v+'</text>').join('');
  const dots=rows.map(r=>'<circle cx="'+x(r.year)+'" cy="'+y(r.value)+'" r="2.7" fill="#557da8"/>').join('');
  return '<div style="overflow-x:auto"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Reported land conflicts by year and historical trend projection" style="width:100%;min-width:580px;height:auto;display:block">'+grid+
    '<polyline points="'+points+'" fill="none" stroke="#557da8" stroke-width="2.2" stroke-linejoin="round"/>'+dots+
    '<polyline points="'+fpoints+'" fill="none" stroke="#d18b43" stroke-width="3" stroke-dasharray="7 5" stroke-linejoin="round"/>'+
    '<text x="'+L+'" y="'+(H-8)+'" fill="#758197" font-size="11">1912</text><text x="'+x(2000)+'" y="'+(H-8)+'" text-anchor="middle" fill="#758197" font-size="11">2000</text><text x="'+(W-R)+'" y="'+(H-8)+'" text-anchor="end" fill="#758197" font-size="11">'+maxYear+'</text></svg></div>'+
    '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;color:#667085;font-size:12px"><span>● Historical dataset</span><span style="color:#bd7b31">┄┄ Model projection</span></div>';
}
function aiPredictionPage() {
  const first=LAND_CONFLICT_DATA[0],last=LAND_CONFLICT_DATA[LAND_CONFLICT_DATA.length-1];
  const peak=LAND_CONFLICT_DATA.reduce((a,b)=>b.value>a.value?b:a,LAND_CONFLICT_DATA[0]);
  const fit=aiFitTrend(LAND_CONFLICT_DATA),backtest=aiBacktest(LAND_CONFLICT_DATA);
  const forecast=aiForecast(LAND_CONFLICT_DATA,aiForecastHorizon);
  const next=forecast[0],end=forecast[forecast.length-1];
  const forecastRows=forecast.map(r=>'<tr><td>'+r.year+'</td><td><b>'+r.value+'</b></td><td><span class="status medium">Trend estimate</span></td></tr>').join('');
  const backtestText=backtest.trendMae==null?'Not available':backtest.trendMae.toFixed(1)+' events';
  const naiveText=backtest.naiveMae==null?'Not available':backtest.naiveMae.toFixed(1)+' events';
  return '<div class="page-head"><div><h1>AI Predictions</h1><p>Independent India land-conflict trend analysis from the supplied historical dataset</p></div><button class="secondary" id="aiRefresh">Recalculate</button></div>'+
    '<div class="panel" style="margin-bottom:16px;border-left:4px solid #d18b43"><b>Research projection only — the source data ends in 2018.</b><p style="margin:6px 0 0;color:#657087">This model cannot provide a reliable current 2026 forecast or project-specific risk score. Upload recent observations before using it for current operational decisions.</p></div>'+
    '<div class="stats"><div class="stat"><div class="stat-icon">▤</div><div><strong>'+LAND_CONFLICT_DATA.length+'</strong><span>Historical observations</span></div></div><div class="stat"><div class="stat-icon">◷</div><div><strong>'+first.year+'–'+last.year+'</strong><span>Dataset coverage</span></div></div><div class="stat"><div class="stat-icon red">↗</div><div><strong>'+peak.value+' · '+peak.year+'</strong><span>Highest recorded value</span></div></div><div class="stat"><div class="stat-icon green">◎</div><div><strong>'+last.value+'</strong><span>Last recorded value · 2018</span></div></div></div>'+
    '<div class="panel" style="margin:16px 0"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h3 style="margin:0">Historical trend and model projection</h3><p style="color:#657087;margin:5px 0 0">Reported number of land conflicts in India · '+AI_MODEL_NAME+'</p></div><label style="display:flex;gap:8px;align-items:center">Projection length <select id="aiHorizon" style="padding:8px;border:1px solid #d8deea;border-radius:8px"><option value="3" '+(aiForecastHorizon===3?'selected':'')+'>3 years</option><option value="5" '+(aiForecastHorizon===5?'selected':'')+'>5 years</option></select></label></div>'+aiTrendChart(LAND_CONFLICT_DATA,forecast)+'</div>'+
    '<div class="panel" style="margin-bottom:16px"><h3>Estimated values after the last recorded year</h3><p style="color:#657087;margin-top:4px">These are retrospective model projections for 2019 onward, not observed counts.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Year</th><th>Estimated reported conflicts</th><th>Type</th></tr></thead><tbody>'+forecastRows+'</tbody></table></div></div>'+
    '<div class="panel" style="margin-bottom:16px"><h3>Model quality and transparency</h3><div class="stats"><div class="stat"><div><strong>'+backtestText+'</strong><span>Trend model MAE · rolling last 10 tests</span></div></div><div class="stat"><div><strong>'+naiveText+'</strong><span>Last-observation baseline MAE</span></div></div><div class="stat"><div><strong>'+fit.slope.toFixed(2)+'</strong><span>Trend slope · events per year</span></div></div><div class="stat"><div><strong>'+fit.sampleSize+'</strong><span>Observations used to fit trend</span></div></div></div><p style="color:#657087;margin:10px 0 0">The trend model is not better than the simple last-observation baseline in this small rolling backtest. Treat the output as an exploratory trend line, not a validated forecast. No confidence percentage is displayed.</p></div>'+
    '<div class="panel"><h3>Dataset and method</h3><ul style="line-height:1.8;color:#596579"><li><b>Source file:</b> landportal-LCW-LCI-NOCONF.csv (provided in this conversation)</li><li><b>Indicator:</b> LCW-LCI-NOCONF — Number of reported land conflicts (India)</li><li><b>Fields used:</b> time (year) and value (reported count)</li><li><b>Method:</b> ordinary least-squares linear regression on the latest 10 observations; estimates are rounded to whole counts and floored at zero</li><li><b>Contributor independence:</b> no contributor model, contributor contribution score, or contributor-submitted data is read by this module</li><li><b>Limitations:</b> sparse historical observations, reporting changes, no state/district/project features, and no records after 2018</li></ul></div>';
}
function aiBindPredictionPage() {
  document.getElementById('aiRefresh')?.addEventListener('click',()=>render());
  document.getElementById('aiHorizon')?.addEventListener('change',e=>{
    aiForecastHorizon=Number(e.target.value)===3?3:5;render();
  });
}
const aiOriginalRender=render;
render=function(){
  if(page==='ai-predictions'){
    document.querySelectorAll('.nav button').forEach(b=>{
      b.classList.toggle('active',b.dataset.page===page);
      b.hidden=!pageAllowed(b.dataset.page);
    });
    document.querySelector('#content').innerHTML=aiPredictionPage();
    aiBindPredictionPage();
    return;
  }
  return aiOriginalRender();
};
const aiOriginalPageAllowed=pageAllowed;
pageAllowed=function(p){
  if(p==='ai-predictions')return true;
  return aiOriginalPageAllowed(p);
};
document.querySelector('[data-page="ai-predictions"]')?.addEventListener('click',()=>{
  if(!pageAllowed('ai-predictions'))return;
  page='ai-predictions';render();window.scrollTo(0,0);
});


// Live project-level assessment. This is a transparent rule-based index,
// not a trained ML probability model and not based on contributor submissions.
let aiProjectRows=[];
let aiProjectLoadState='idle';
let aiProjectLoadError='';
let aiProjectLoadToken=0;

function aiProjectAssessment(p) {
  const fields=['status','progress','approval_delay_days','dispute_count','compensation_completion','possession_progress','rehabilitation_progress','historical_department_delay_days','expected_completion','source_updated_at'];
  const present=k=>p[k]!==null&&p[k]!==undefined&&p[k]!=='';
  const missing=fields.filter(k=>!present(k));
  const factors=[];
  let score=0;
  const add=(key,label,points,detail,action)=>{
    if(points>0){score+=points;factors.push({key,label,points,detail,action});}
  };
  if(p.status==='Completed'){
    return {score:0,level:'Low',coverage:fields.length-missing.length,total:fields.length,coveragePct:Math.round((fields.length-missing.length)/fields.length*100),missing,reasons:['Project is marked completed.'],factors:[],action:'Keep closure records and final compliance evidence up to date.',priority:'Routine'};
  }
  if(p.status==='On Hold')add('status','Project status',24,'Project is currently on hold.','Confirm the hold reason, accountable authority and restart conditions.');
  else if(p.status==='At Risk')add('status','Project status',18,'Project status is marked at risk.','Review the latest blocker and assign an owner with a due date.');
  else if(p.status==='In Progress')add('status','Project status',4,'Project remains in progress.','Keep milestones and dependencies updated.');
  const numeric=(key)=>present(key)&&Number.isFinite(Number(p[key]))?Number(p[key]):null;
  const delay=numeric('approval_delay_days');
  if(delay!==null){if(delay>90)add('approval','Approval delay',18,delay+' days of approval delay are recorded.','Escalate the pending approval and record the responsible department.');else if(delay>30)add('approval','Approval delay',11,delay+' days of approval delay are recorded.','Set a dated approval follow-up with the responsible department.');else if(delay>0)add('approval','Approval delay',4,delay+' days of approval delay are recorded.','Track the pending approval at the next review.');}
  const disputes=numeric('dispute_count');
  if(disputes!==null){if(disputes>=10)add('disputes','Land disputes',18,disputes+' disputes are recorded.','Prioritise the dispute register and assign resolution owners.');else if(disputes>=3)add('disputes','Land disputes',12,disputes+' disputes are recorded.','Review pending disputes and set resolution dates.');else if(disputes>0)add('disputes','Land disputes',5,disputes+' dispute(s) are recorded.','Confirm the current status of each recorded dispute.');}
  for(const [key,label] of [['compensation_completion','Compensation'],['possession_progress','Possession'],['rehabilitation_progress','Rehabilitation']]){
    const v=numeric(key);
    if(v!==null){const bounded=Math.max(0,Math.min(100,v));if(bounded<30)add(key,label+' progress',12,label+' completion is '+bounded+'%.','Review '+label.toLowerCase()+' bottlenecks and publish a dated recovery plan.');else if(bounded<60)add(key,label+' progress',7,label+' completion is '+bounded+'%.','Monitor '+label.toLowerCase()+' milestones and unblock pending actions.');}
  }
  const historic=numeric('historical_department_delay_days');
  if(historic!==null){if(historic>90)add('historic','Historical department delays',9,'Historical departmental delay is '+historic+' days.','Check whether the same department dependency is affecting the current schedule.');else if(historic>30)add('historic','Historical department delays',5,'Historical departmental delay is '+historic+' days.','Track the department dependency in the next review.');}
  const progress=numeric('progress')??0;
  if(p.expected_completion){
    const due=new Date(p.expected_completion+'T00:00:00');
    if(!Number.isNaN(due.getTime())){const now=new Date();now.setHours(0,0,0,0);const days=Math.ceil((due-now)/86400000);
      if(days<0&&progress<100)add('schedule','Schedule slippage',16,'Expected completion passed '+Math.abs(days)+' days ago; recorded progress is '+progress+'%.','Re-baseline the schedule and document the critical path.');
      else if(days<=90&&progress<70)add('schedule','Schedule pressure',8,'Completion is due in '+days+' days with '+progress+'% progress.','Review remaining milestones and confirm a realistic completion plan.');
    }
  }
  score=Math.max(0,Math.min(100,Math.round(score)));
  const level=score>=70?'Critical':score>=50?'High':score>=25?'Medium':'Low';
  const priority=level==='Critical'?'Immediate':level==='High'?'High':level==='Medium'?'Watch':'Routine';
  const ordered=[...factors].sort((a,b)=>b.points-a.points);
  const action=ordered[0]?.action||'Continue routine monitoring and keep project records current.';
  const freshness=present('source_updated_at')?Math.floor((Date.now()-new Date(p.source_updated_at).getTime())/86400000):null;
  const freshnessLabel=freshness===null?'Update date missing':freshness<0?'Date needs review':freshness<=30?'Updated within 30 days':freshness<=90?'Update is 31–90 days old':'Update is over 90 days old';
  return {score,level,priority,coverage:fields.length-missing.length,total:fields.length,coveragePct:Math.round((fields.length-missing.length)/fields.length*100),missing,factors:ordered,reasons:ordered.map(x=>x.detail).concat(ordered.length?[]:['No major risk trigger found in the available fields.']),action,freshnessLabel};
}
function aiProjectPriority(a){
  return a.level==='Critical'?0:a.level==='High'?1:a.level==='Medium'?2:3;
}
async function aiFetchProjectRows(){
  const token=++aiProjectLoadToken;
  aiProjectLoadState='loading';aiProjectLoadError='';render();
  try{
    if(!supabaseClient||!currentUser)throw new Error('Please sign in again to load project records.');
    const {data,error}=await supabaseClient.from('projects')
      .select('id,project_code,name,state,district,status,progress,risk_level,expected_completion,acquisition_stage,approval_delay_days,dispute_count,compensation_completion,possession_progress,rehabilitation_progress,historical_department_delay_days,source_verified,source_updated_at')
      .order('created_at',{ascending:false});
    if(error)throw error;
    if(token!==aiProjectLoadToken)return;
    aiProjectRows=data||[];
    aiProjectLoadState='ready';
  }catch(error){
    if(token!==aiProjectLoadToken)return;
    aiProjectLoadError=error?.message||'Could not load project data.';
    aiProjectLoadState='error';
  }
  if(page==='ai-predictions')render();
}
const aiHistoricalPredictionPage=aiPredictionPage;
aiPredictionPage=function(){
  const historical=aiHistoricalPredictionPage();
  let live='';
  if(aiProjectLoadState==='loading'||aiProjectLoadState==='idle'){
    live='<div class="panel" style="margin:16px 0"><h3>Live project risk intelligence</h3><p style="color:#657087">Loading current project records from Supabase…</p></div>';
  }else if(aiProjectLoadState==='error'){
    live='<div class="panel" style="margin:16px 0;border-left:4px solid #c65d5d"><h3>Could not load live project records</h3><p>'+aiEscape(aiProjectLoadError)+'</p><button class="secondary" id="aiProjectRefresh">Try again</button></div>';
  }else{
    const rows=aiProjectRows.map(p=>({p,a:aiProjectAssessment(p)})).sort((x,y)=>aiProjectPriority(x.a)-aiProjectPriority(y.a)||y.a.score-x.a.score);
    const counts={Critical:0,High:0,Medium:0,Low:0};
    rows.forEach(x=>counts[x.a.level]++);
    const avgCoverage=rows.length?Math.round(rows.reduce((n,x)=>n+x.a.coveragePct,0)/rows.length):0;
    const averageScore=rows.length?Math.round(rows.reduce((n,x)=>n+x.a.score,0)/rows.length):0;
    const topDrivers={};
    rows.forEach(x=>x.a.factors.slice(0,2).forEach(f=>topDrivers[f.label]=(topDrivers[f.label]||0)+1));
    const driverRows=Object.entries(topDrivers).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const driverHtml=driverRows.length?driverRows.map(([label,count])=>'<div class="bar-row"><span>'+aiEscape(label)+'</span><div class="bar"><i style="width:'+Math.round(count/Math.max(1,rows.length)*100)+'%"></i></div><b>'+count+'</b></div>').join(''):'<p style="color:#657087">No active risk drivers are present in the current records.</p>';
    const cards=rows.length?rows.map(({p,a},idx)=>{
      const reasons=a.reasons.map(r=>'<li>'+aiEscape(r)+'</li>').join('');
      const factors=a.factors.length?a.factors.map(f=>'<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #edf0f5;font-size:13px"><span><b>'+aiEscape(f.label)+'</b><br><span style="color:#657087">'+aiEscape(f.detail)+'</span></span><b style="white-space:nowrap;color:#a65b37">+'+f.points+'</b></div>').join(''):'<p style="color:#657087;font-size:13px">No active scoring triggers.</p>';
      return '<article class="panel" style="min-width:0"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><span style="font-size:11px;color:#657087;font-weight:700">PRIORITY #'+(idx+1)+'</span><h3 style="margin:3px 0 4px">'+aiEscape(p.name||p.project_code||'Unnamed project')+'</h3><p style="margin:0;color:#657087;font-size:13px">'+aiEscape([p.district,p.state].filter(Boolean).join(', ')||'Location not set')+'</p></div><span class="status '+(a.level==='Critical'||a.level==='High'?'risk':a.level==='Low'?'track':'medium')+'">'+a.level+' risk</span></div><div style="display:flex;align-items:baseline;gap:8px;margin:16px 0 4px"><strong style="font-size:34px">'+a.score+'</strong><span style="color:#657087">/100 risk index</span><span style="margin-left:auto;font-size:12px;font-weight:700;color:#657087">'+a.priority+' priority</span></div><div style="height:8px;background:#edf1f6;border-radius:99px;overflow:hidden"><div style="height:100%;width:'+a.score+'%;background:'+(a.score>=70?'#bd5b54':a.score>=50?'#d18b43':a.score>=25?'#c4a34d':'#4e9a78')+'"></div></div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:9px 0 12px;font-size:12px;color:#657087"><span>Data coverage: '+a.coverage+'/'+a.total+' ('+a.coveragePct+'%)</span><span>'+aiEscape(a.freshnessLabel||'Update date missing')+'</span></div><details><summary style="cursor:pointer;color:#1557c0;font-weight:650;font-size:13px">View risk drivers and evidence ('+a.factors.length+')</summary><div style="margin-top:8px">'+factors+'</div></details><div style="padding:11px;background:#f5f8fc;border-radius:9px;font-size:13px;margin-top:12px"><b>Recommended next action:</b> '+aiEscape(a.action)+'</div>'+(a.missing.length?'<p style="font-size:12px;color:#9a6b2d;margin:10px 0 0">Missing inputs: '+aiEscape(a.missing.join(', '))+'</p>':'')+'</article>';
    }).join(''):'<div class="panel"><h3>No project records found</h3><p style="color:#657087">Add projects to LandSetu to generate project-level assessments.</p></div>';
    const ranking=rows.map(({p,a},i)=>'<tr><td>'+(i+1)+'</td><td><b>'+aiEscape(p.name||p.project_code||'Unnamed project')+'</b><br><small>'+aiEscape([p.district,p.state].filter(Boolean).join(', '))+'</small></td><td>'+a.score+'/100</td><td><span class="status '+(a.level==='Critical'||a.level==='High'?'risk':a.level==='Low'?'track':'medium')+'">'+a.level+'</span></td><td>'+a.coveragePct+'%</td><td>'+aiEscape(a.priority)+'</td></tr>').join('');
    live='<section style="margin:16px 0"><div class="page-head" style="margin-bottom:12px"><div><h2 style="margin:0">Live project risk intelligence</h2><p style="margin:5px 0 0;color:#657087">Explainable assessment from saved project records · sorted by review priority</p></div><button class="secondary" id="aiProjectRefresh">↻ Refresh data</button></div><div class="stats"><div class="stat"><div><strong>'+rows.length+'</strong><span>Projects assessed</span></div></div><div class="stat"><div><strong>'+counts.Critical+'</strong><span>Critical</span></div></div><div class="stat"><div><strong>'+counts.High+'</strong><span>High</span></div></div><div class="stat"><div><strong>'+avgCoverage+'%</strong><span>Average data coverage</span></div></div></div><div class="insights-grid" style="margin:14px 0"><div class="panel"><h3>Portfolio risk overview</h3><div style="display:flex;align-items:baseline;gap:8px"><strong style="font-size:34px">'+averageScore+'</strong><span style="color:#657087">average risk index / 100</span></div><div class="bars" style="margin-top:14px">'+['Critical','High','Medium','Low'].map(k=>'<div class="bar-row"><span>'+k+'</span><div class="bar"><i style="width:'+(rows.length?counts[k]/rows.length*100:0)+'%"></i></div><b>'+counts[k]+'</b></div>').join('')+'</div></div><div class="panel"><h3>Most common risk drivers</h3><div class="bars">'+driverHtml+'</div></div></div><div class="panel" style="margin-bottom:14px"><h3>Priority register</h3><div class="table-wrap"><table class="data-table" style="min-width:680px"><thead><tr><th>Rank</th><th>Project</th><th>Risk index</th><th>Band</th><th>Data coverage</th><th>Priority</th></tr></thead><tbody>'+ranking+'</tbody></table></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px">'+cards+'</div><p style="font-size:12px;color:#748095;margin-top:14px">Method note: this is a transparent rule-based screening index, not a trained ML model, legal opinion or probability of project failure. Missing data lowers coverage but is never treated as zero risk. Risk bands help prioritise human review; verify source records before taking action.</p></section>';
  }
  return historical.replace('<div class="panel" style="margin-bottom:16px;border-left:4px solid #d18b43">',live+'<div class="panel" style="margin-bottom:16px;border-left:4px solid #d18b43">');
};
const aiPreviousBindPredictionPage=aiBindPredictionPage;
aiBindPredictionPage=function(){
  aiPreviousBindPredictionPage();
  document.getElementById('aiProjectRefresh')?.addEventListener('click',aiFetchProjectRows);
};
const aiRenderBeforeLiveProjects=render;
render=function(){
  aiRenderBeforeLiveProjects();
  if(page==='ai-predictions'&&aiProjectLoadState==='idle')aiFetchProjectRows();
};
