/* LandSetu AI Predictions integration.
 * Adapted from the contributor BhoomiPredict baseline; uses LandSetu auth and project RLS.
 * This is a transparent heuristic, not a trained or calibrated ML model.
 */
let aiPredictionRows = [];
let aiFeedbackRows = [];
const AI_PREDICTION_METHOD = 'rule-based-v1';

function aiEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function aiCanUpdate() {
  return ['national_admin','state_admin','project_manager'].includes(currentRole());
}
function aiPredict(project) {
  const factors = [];
  let observations = 0;
  const add = (name, points, detail) => { if (points > 0) factors.push({name,points,detail}); };
  if (project.approval_delay_days != null) { observations++; add('Approval delay',Math.min(25,Math.round(project.approval_delay_days/4),),project.approval_delay_days+' day(s) recorded'); }
  if (project.dispute_count != null) { observations++; add('Disputes / objections',Math.min(20,project.dispute_count*5),project.dispute_count+' open dispute(s) recorded'); }
  if (project.compensation_completion != null) { observations++; add('Compensation backlog',Math.round((100-project.compensation_completion)*0.15),project.compensation_completion+'% compensation completion'); }
  if (project.possession_progress != null) { observations++; add('Possession backlog',Math.round((100-project.possession_progress)*0.12),project.possession_progress+'% possession progress'); }
  if (project.rehabilitation_progress != null) { observations++; add('Rehabilitation backlog',Math.round((100-project.rehabilitation_progress)*0.10),project.rehabilitation_progress+'% rehabilitation progress'); }
  if (project.historical_department_delay_days != null) { observations++; add('Historical department delays',Math.min(15,Math.round(project.historical_department_delay_days/10)),project.historical_department_delay_days+' historical delay day(s) entered'); }
  if (project.expected_completion && project.status !== 'Completed') {
    observations++;
    if (project.expected_completion < new Date().toISOString().slice(0,10)) add('Past expected completion',20,'Expected completion date has passed');
  }
  const score = Math.min(100,factors.reduce((sum,f)=>sum+f.points,0));
  const level = !observations ? 'Insufficient data' : score>=70?'Critical':score>=50?'High':score>=25?'Medium':'Low';
  return {score,level,observations,factors:factors.sort((a,b)=>b.points-a.points)};
}
function aiSuggestedActions(p,prediction) {
  const a=[];
  if(prediction.level==='Insufficient data') a.push('Verify source records and enter available acquisition indicators.');
  if(Number(p.approval_delay_days)>0) a.push('Ask the approving department for a dated resolution plan.');
  if(Number(p.dispute_count)>0) a.push('Triage open objections and schedule documented resolution meetings.');
  if(p.compensation_completion!=null&&Number(p.compensation_completion)<100) a.push('Reconcile award and payment records; prioritize eligible pending cases.');
  if(p.possession_progress!=null&&Number(p.possession_progress)<100) a.push('Validate parcel-wise possession status and record constraints.');
  if(p.rehabilitation_progress!=null&&Number(p.rehabilitation_progress)<100) a.push('Review affected-family cases and agree rehabilitation milestones.');
  if(!a.length&&prediction.score<25) a.push('Continue routine monitoring and update source records at the next review.');
  return a.slice(0,3);
}
async function loadAiPredictions() {
  if(!supabaseClient||!currentUser) return;
  const {data,error}=await supabaseClient.from('projects').select('id,project_code,name,state,district,status,progress,expected_completion,acquisition_stage,compensation_completion,approval_delay_days,dispute_count,possession_progress,rehabilitation_progress,historical_department_delay_days,source_name,source_record_id,source_verified,source_updated_at').order('created_at',{ascending:false});
  if(error){toast('Could not load AI prediction inputs: '+error.message);aiPredictionRows=[];return;}
  aiPredictionRows=data||[];
  const {data:feedback,error:feedbackError}=await supabaseClient.from('project_feedback').select('id,project_id,actual_status,actual_progress,actual_delay_days,prediction_level,prediction_score,prediction_method,verified,recorded_at,notes').order('recorded_at',{ascending:false}).limit(100);
  aiFeedbackRows=feedbackError?[]:(feedback||[]);
}
function aiPredictionPage() {
  const scored=aiPredictionRows.map(p=>({p,pred:aiPredict(p)})).sort((a,b)=>b.pred.score-a.pred.score);
  const usable=scored.filter(x=>x.pred.observations>0).length;
  const high=scored.filter(x=>['High','Critical'].includes(x.pred.level)).length;
  const verified=aiPredictionRows.filter(p=>p.source_verified).length;
  const cards='<div class="stats"><div class="stat"><div class="stat-icon">◷</div><div><strong>'+usable+'/'+scored.length+'</strong><span>Projects with usable inputs</span></div></div><div class="stat"><div class="stat-icon red">!</div><div><strong>'+high+'</strong><span>High / critical flags</span></div></div><div class="stat"><div class="stat-icon green">✓</div><div><strong>'+verified+'</strong><span>Verified source records</span></div></div><div class="stat"><div class="stat-icon orange">ⓘ</div><div><strong>Baseline</strong><span>Rule-based · not ML</span></div></div></div>';
  const rows=scored.map(({p,pred})=>{
    const cls=['High','Critical'].includes(pred.level)?'risk':pred.level==='Medium'||pred.level==='Insufficient data'?'medium':'track';
    const factors=pred.factors.length?pred.factors.slice(0,4).map(f=>'<li>'+aiEscape(f.name)+' (+'+f.points+') — '+aiEscape(f.detail)+'</li>').join(''):'<li>No positive risk factors in entered fields.</li>';
    const actions=aiSuggestedActions(p,pred).map(x=>'<li>'+aiEscape(x)+'</li>').join('');
    const source=aiEscape(p.source_name||'Source not recorded')+' · '+(p.source_verified?'verified':'unverified');
    const edit=aiCanUpdate()?'<button class="view" data-ai-edit="'+aiEscape(p.id)+'">Update inputs</button>':'View only';
    return '<tr><td><b>'+aiEscape(p.name)+'</b><small>'+aiEscape(p.state)+' · '+aiEscape(p.district)+' · '+aiEscape(p.acquisition_stage||'Stage not recorded')+'</small></td><td><span class="status '+cls+'">'+pred.level+'</span><small>'+(pred.observations?pred.score+' / 100 screening score':'No usable indicator data')+'</small></td><td><ul style="margin:0;padding-left:18px;white-space:normal">'+factors+'</ul></td><td><ul style="margin:0;padding-left:18px;white-space:normal">'+actions+'</ul></td><td>'+source+'<small>'+(p.source_updated_at||'')+'</small></td><td>'+edit+'</td></tr>';
  }).join('');
  const options=aiPredictionRows.map(p=>'<option value="'+aiEscape(p.id)+'">'+aiEscape(p.name)+' — '+aiEscape(p.state)+'</option>').join('');
  const form=aiCanUpdate()?'<div class="panel" style="margin:18px 0"><h3>Update prediction inputs</h3><form id="aiInputForm" class="form-grid"><label>Project<select name="project_id" required><option value="">Select project</option>'+options+'</select></label><label>Acquisition stage<select name="acquisition_stage"><option>Planning</option><option>Notification</option><option>Valuation</option><option>Compensation</option><option>Possession</option><option>Rehabilitation</option><option>Completed</option></select></label><label>Compensation completion (%)<input name="compensation_completion" type="number" min="0" max="100" step="0.01"></label><label>Approval delay (days)<input name="approval_delay_days" type="number" min="0" step="1"></label><label>Disputes / objections<input name="dispute_count" type="number" min="0" step="1"></label><label>Possession progress (%)<input name="possession_progress" type="number" min="0" max="100" step="0.01"></label><label>Rehabilitation progress (%)<input name="rehabilitation_progress" type="number" min="0" max="100" step="0.01"></label><label>Historical department delay (days)<input name="historical_department_delay_days" type="number" min="0" step="1"></label><label>Source name<input name="source_name" maxlength="160"></label><label>Source record ID<input name="source_record_id" maxlength="120"></label><label>Source updated<input name="source_updated_at" type="date"></label><label><span>Source verified</span><input name="source_verified" type="checkbox"></label><div style="grid-column:1/-1"><button class="primary" type="submit">Save prediction inputs</button></div></form></div>':'';
  const feedback=aiFeedbackRows.slice(0,10).map(f=>'<tr><td>'+aiEscape(f.recorded_at?new Date(f.recorded_at).toLocaleDateString('en-IN'):'')+'</td><td>'+aiEscape(aiPredictionRows.find(p=>p.id===f.project_id)?.name||'Project')+'</td><td>'+aiEscape(f.actual_status)+' · '+Number(f.actual_progress)+'%</td><td>'+Number(f.actual_delay_days)+' days</td><td>'+aiEscape(f.prediction_level||'—')+' / '+aiEscape(f.prediction_method||AI_PREDICTION_METHOD)+'</td><td>'+(f.verified?'Verified':'Unverified')+'</td></tr>').join('');
  return '<div class="page-head"><div><h1>AI Predictions</h1><p>Project delay-risk screening, contributing factors and recommended actions</p></div><button class="secondary" id="aiRefresh">Refresh data</button></div><div class="panel" style="margin-bottom:16px"><b>Transparent screening baseline — not a trained machine-learning model.</b><p style="margin:6px 0 0;color:#657087">Scores are heuristic indicators from recorded project fields. They are not calibrated probabilities, official forecasts or guarantees. Missing inputs are not treated as zero. Verify source provenance before relying on results.</p></div>'+cards+form+'<div class="panel" style="margin-bottom:16px"><h3>Project risk screening and explanations</h3><div class="table-wrap"><table class="data-table" style="min-width:1120px"><thead><tr><th>Project</th><th>Risk</th><th>Contributing factors</th><th>Suggested actions</th><th>Source provenance</th><th>Inputs</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">No projects available.</td></tr>')+'</tbody></table></div></div><div class="panel"><h3>Recent officer feedback</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Project</th><th>Actual outcome</th><th>Actual delay</th><th>Saved baseline</th><th>Verification</th></tr></thead><tbody>'+(feedback||'<tr><td colspan="6">No feedback recorded yet.</td></tr>')+'</tbody></table></div></div>';
}
function aiBindPredictionPage() {
  $('#aiRefresh')?.addEventListener('click',async()=>{await loadAiPredictions();render();});
  $('#aiInputForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,d=Object.fromEntries(new FormData(form));
    const numeric=['compensation_completion','approval_delay_days','dispute_count','possession_progress','rehabilitation_progress','historical_department_delay_days'];
    const payload={acquisition_stage:d.acquisition_stage,source_name:d.source_name.trim()||null,source_record_id:d.source_record_id.trim()||null,source_updated_at:d.source_updated_at||null,source_verified:form.elements.source_verified.checked};
    for(const key of numeric){const value=d[key];payload[key]=value===''?null:Number(value);if(payload[key]!==null&&(!Number.isFinite(payload[key])||payload[key]<0||(['compensation_completion','possession_progress','rehabilitation_progress'].includes(key)&&payload[key]>100)))return toast('Please enter valid non-negative values; progress fields must be 0–100.');}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Saving…';
    const {error}=await supabaseClient.from('projects').update(payload).eq('id',d.project_id);
    if(error){toast('Could not save prediction inputs: '+error.message);button.disabled=false;button.textContent='Save prediction inputs';return;}
    await recordActivity(d.project_id,'AI prediction inputs updated','Acquisition indicators and source provenance updated.');
    toast('Prediction inputs saved.');await loadProjects();await loadAiPredictions();render();
  });
  document.querySelectorAll('[data-ai-edit]').forEach(button=>button.addEventListener('click',()=>{
    const p=aiPredictionRows.find(x=>x.id===button.dataset.aiEdit);const form=$('#aiInputForm');if(!p||!form)return;
    form.elements.project_id.value=p.id;form.elements.acquisition_stage.value=p.acquisition_stage||'Planning';
    for(const key of ['compensation_completion','approval_delay_days','dispute_count','possession_progress','rehabilitation_progress','historical_department_delay_days','source_name','source_record_id','source_updated_at'])form.elements[key].value=p[key]??'';
    form.elements.source_verified.checked=!!p.source_verified;form.scrollIntoView({behavior:'smooth',block:'center'});
  }));
}
const aiOriginalRender=render;
render=function(){
  if(page==='ai-predictions'){
    document.querySelectorAll('.nav button').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.hidden=!pageAllowed(b.dataset.page)});
    $('#content').innerHTML=aiPredictionPage();aiBindPredictionPage();return;
  }
  return aiOriginalRender();
};
const aiOriginalPageAllowed=pageAllowed;
pageAllowed=function(p){if(p==='ai-predictions')return currentRole()!=='viewer';return aiOriginalPageAllowed(p);};
document.querySelector('[data-page="ai-predictions"]')?.addEventListener('click',async()=>{if(!pageAllowed('ai-predictions'))return;page='ai-predictions';await loadAiPredictions();render();window.scrollTo(0,0);});
window.addEventListener('landsetu:authenticated',()=>{if(page==='ai-predictions')loadAiPredictions().then(render);});
