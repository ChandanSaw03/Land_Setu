/* Bhoomi Predict: explainable situation-based acquisition delay estimator.
   Transparent heuristic, not a trained ML model. */
(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function forecast(p){
  const has=k=>p[k]!==null&&p[k]!==undefined&&p[k]!=='';
  const num=k=>has(k)&&Number.isFinite(Number(p[k]))?Math.max(0,Number(p[k])):null;
  if(p.status==='Completed')return {days:0,low:0,high:0,coverage:'Closed',drivers:[],missing:[]};
  let total=0;const drivers=[];
  const add=(name,value,why)=>{const d=Math.max(0,Math.round(value));if(d){total+=d;drivers.push({name,days:d,why});}};
  const approval=num('approval_delay_days');if(approval!==null)add('Approval backlog',approval*.55,approval+' recorded approval-delay days; partial carry-forward');
  const disputes=num('dispute_count');if(disputes!==null)add('Land disputes',Math.min(120,disputes*8),disputes+' disputes; up to 8 days each, capped');
  [['compensation_completion','Compensation',.55],['possession_progress','Possession',.7],['rehabilitation_progress','Rehabilitation',.25]].forEach(([key,label,weight])=>{const v=num(key);if(v!==null&&v<100)add(label+' pending',Math.min(120,(100-v)*weight),(100-v)+'% remains');});
  const historic=num('historical_department_delay_days');if(historic!==null)add('Department history',Math.min(45,historic*.2),historic+' historical delay days; partial carry-forward');
  let overdue=0;if(p.expected_completion){const due=new Date(p.expected_completion+'T00:00:00');if(!Number.isNaN(due.getTime())){const today=new Date();today.setHours(0,0,0,0);overdue=Math.max(0,Math.floor((today-due)/86400000));}}
  const progress=num('progress');if(overdue&&progress!==null&&progress<100)add('Past completion target',Math.min(180,overdue*(1-progress/100)),'Target passed by '+overdue+' days at '+progress+'% overall progress');
  total=Math.min(365,Math.round(total));
  const missing=['approval_delay_days','dispute_count','compensation_completion','possession_progress','rehabilitation_progress'].filter(k=>!has(k));
  const coverage=missing.length>=4?'Low':missing.length>=2?'Limited':missing.length===1?'Moderate':'Better';
  if(missing.length>=4&&drivers.length===0)return {days:null,low:null,high:null,coverage:'Insufficient',drivers:[],missing};
  const spread=coverage==='Low'?Math.max(21,Math.round(total*.5)):coverage==='Limited'?Math.max(14,Math.round(total*.35)):Math.max(7,Math.round(total*.25));
  return {days:total,low:Math.max(0,total-spread),high:Math.min(365,total+spread),coverage,drivers:drivers.sort((a,b)=>b.days-a.days),missing};
 }
 async function load(){
  const host=document.getElementById('bhoomiPredictMount');if(!host)return;
  if(!supabaseClient||!currentUser){host.innerHTML='<p>Please sign in to calculate project forecasts.</p>';return;}
  host.innerHTML='<p style="color:#657087">Calculating project delay forecasts…</p>';
  const fields='id,project_code,name,state,district,status,progress,expected_completion,approval_delay_days,dispute_count,compensation_completion,possession_progress,rehabilitation_progress,historical_department_delay_days';
  const [projectResult,caseResult]=await Promise.all([supabaseClient.from('projects').select(fields).order('created_at',{ascending:false}),supabaseClient.from('legal_cases').select('project_id,status')]);
  const {data,error}=projectResult;
  if(error){host.innerHTML='<p style="color:#a33">Could not load project records: '+esc(error.message)+'</p>';return;}
  if(caseResult.error){host.innerHTML='<p style="color:#a33">Could not load linked dispute records: '+esc(caseResult.error.message)+'</p>';return;}
  if(!data?.length){host.innerHTML='<p>No projects are available for prediction yet.</p>';return;}
  const activeCounts={};(caseResult.data||[]).filter(c=>!['Resolved','Closed'].includes(c.status)).forEach(c=>activeCounts[c.project_id]=(activeCounts[c.project_id]||0)+1);
  const rows=data.map(p=>({p,f:forecast({...p,dispute_count:activeCounts[p.id]??p.dispute_count})})).sort((a,b)=>(b.f.days??-1)-(a.f.days??-1));
  const usable=rows.filter(x=>Number.isFinite(x.f.days));
  const average=usable.length?Math.round(usable.reduce((n,x)=>n+x.f.days,0)/usable.length):null;
  host.innerHTML='<div class="stats"><div class="stat"><div><strong>'+rows.length+'</strong><span>Projects forecast</span></div></div><div class="stat"><div><strong>'+(average===null?'—':average+' days')+'</strong><span>Average estimated delay · '+usable.length+' with sufficient inputs</span></div></div><div class="stat"><div><strong>'+rows.filter(x=>x.f.days>90).length+'</strong><span>Over 90-day forecast</span></div></div><div class="stat"><div><strong>'+rows.filter(x=>x.f.coverage==='Low').length+'</strong><span>Low data coverage</span></div></div></div>'+
  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px;margin-top:14px">'+rows.map(({p,f})=>'<article class="panel"><div style="display:flex;justify-content:space-between;gap:12px"><div><h3 style="margin:0">'+esc(p.name||p.project_code||'Unnamed project')+'</h3><p style="margin:4px 0;color:#657087;font-size:13px">'+esc([p.district,p.state].filter(Boolean).join(', ')||'Location not set')+'</p></div><span class="status '+(f.days===null?'medium':f.days>90?'risk':f.days>30?'medium':'track')+'">'+(f.days===null?'Needs data':f.days>90?'High delay':f.days>30?'Watch':'Lower delay')+'</span></div><div style="display:flex;align-items:baseline;gap:8px;margin:14px 0 2px"><strong style="font-size:32px;color:#173d69">'+(f.days===null?'—':f.days)+'</strong><b>'+(f.days===null?'forecast unavailable':'days estimated')+'</b></div><p style="font-size:13px;color:#657087;margin:0">'+(f.days===null?'Add progress figures or linked dispute records to calculate a forecast.':'Likely range: '+f.low+'–'+f.high+' days · '+f.coverage+' data coverage')+'</p>'+(f.drivers.length?'<ul style="font-size:13px;line-height:1.6;padding-left:18px;margin:12px 0">'+f.drivers.slice(0,5).map(d=>'<li><b>'+esc(d.name)+': +'+d.days+' days</b><br><span style="color:#657087">'+esc(d.why)+'</span></li>').join('')+'</ul>':'<p style="color:#657087;font-size:13px">No delay drivers were found in the available fields.</p>')+(f.missing.length?'<p style="font-size:12px;color:#986b2c">Missing inputs: '+esc(f.missing.join(', '))+'</p>':'')+'</article>').join('')+'</div>'+
  '<p style="font-size:12px;color:#748095;margin-top:14px">Method: weighted, explainable schedule-risk heuristic based on saved project conditions. The range is a data-coverage allowance, not a statistically validated confidence interval. Not a trained ML model; verify records and use human review. This is not a guaranteed completion date.</p>';
 }
 function mount(){
  if(page!=='ai-predictions')return;
  const content=document.querySelector('#content');if(!content||document.getElementById('bhoomiPredictMount'))return;
  const section=document.createElement('section');section.style.margin='16px 0';
  section.innerHTML='<div class="page-head"><div><h2 style="margin:0">Bhoomi Predict · Acquisition delay forecast</h2><p style="margin:5px 0 0;color:#657087">Estimate additional delay from the current situation of each project.</p></div><button class="secondary" id="bhoomiRefresh">↻ Recalculate</button></div><div id="bhoomiPredictMount"></div>';
  const first=content.querySelector('.panel');if(first)content.insertBefore(section,first);else content.prepend(section);
  document.getElementById('bhoomiRefresh').addEventListener('click',load);load();
 }
 window.bhoomiPredictForecast=forecast;
 const prior=render;
 if(typeof prior==='function')render=function(){prior();if(page==='ai-predictions')setTimeout(mount,0);};
 document.addEventListener('click',e=>{if(e.target.closest('[data-page="ai-predictions"]'))setTimeout(mount,50);});
 document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,50));
})();
