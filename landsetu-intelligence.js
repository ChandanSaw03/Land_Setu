/* LandSetu Autonomous Acquisition Intelligence UI */
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v?new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Not scanned yet';
  let loading=false,projects=[],sources=[],documents=[],predictions=[],alerts=[];
  let lastAutoScan=0;
  const invoke=async(body)=>{
    if(!supabaseClient||!currentUser)throw new Error('Please sign in first.');
    const {data,error}=await supabaseClient.functions.invoke('landsetu-intelligence',{body});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    return data;
  };
  async function refresh(){
    if(!supabaseClient||!currentUser)return;
    const queries=await Promise.all([
      supabaseClient.from('projects').select('id,name,project_code,state,district').order('name'),
      supabaseClient.from('intelligence_sources').select('*').order('name'),
      supabaseClient.from('intelligence_documents').select('id,title,source_url,document_type,extraction_status,verification_status,published_on,created_at,project_id').order('created_at',{ascending:false}).limit(15),
      supabaseClient.from('ai_delay_predictions').select('*').order('generated_at',{ascending:false}).limit(12),
      supabaseClient.from('intelligence_alerts').select('*').order('created_at',{ascending:false}).limit(15)
    ]);
    [projects,sources,documents,predictions,alerts]=queries.map((r,i)=>r.error?(i===0?[]:[]):r.data||[]);
    draw();
    const due=sources.some(s=>s.enabled&&(!s.last_checked_at||(Date.now()-new Date(s.last_checked_at).getTime())>24*60*60*1000));
    if(due && Date.now()-lastAutoScan>10*60*1000 && ['national_admin','state_admin','project_manager','analyst'].includes(currentRole())){
      lastAutoScan=Date.now();
      scan(true);
    }
  }
  function draw(){
    const host=document.getElementById('landsetuIntelligenceMount');if(!host)return;
    const canRun=['national_admin','state_admin','project_manager','analyst'].includes(currentRole());
    const canVerify=['national_admin','state_admin'].includes(currentRole());
    const projectOptions=projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name||p.project_code)+' · '+esc([p.district,p.state].filter(Boolean).join(', '))+'</option>').join('');
    const latest=predictions.slice(0,6).map(p=>'<div class="ls-int-row"><div><b>'+esc((projects.find(x=>x.id===p.project_id)||{}).name||'Project forecast')+'</b><small>'+fmt(p.generated_at)+' · '+esc(p.model_version)+'</small><p>'+esc(p.explanation||'No explanation returned')+'</p></div><div class="ls-int-metric"><b>'+(p.predicted_additional_days==null?'—':p.predicted_additional_days+' days')+'</b><span>'+esc(p.risk_level||'Unknown')+' risk</span><small>Range '+(p.range_min_days??'—')+'–'+(p.range_max_days??'—')+' days</small></div></div>').join('')||'<p class="ls-int-empty">No AI forecasts yet. Select a project and run Bhoomi Predict.</p>';
    const sourceRows=sources.map(s=>'<div class="ls-int-source"><div><b>'+esc(s.name)+'</b><small>'+esc(s.url)+'</small></div><div><span class="ls-int-state '+(s.last_status==='ok'?'ok':s.last_status==='error'?'bad':'')+'">'+esc(s.last_status||'Not scanned')+'</span><small>'+fmt(s.last_checked_at)+'</small></div></div>').join('');
    const docRows=documents.map(d=>'<div class="ls-int-row"><div><b>'+esc(d.title)+'</b><small>'+esc(d.document_type||'Government document')+' · '+fmt(d.created_at)+'</small><p><span class="ls-int-tag">'+esc(d.extraction_status)+'</span> <span class="ls-int-tag">'+esc(d.verification_status)+'</span></p>'+(d.source_url?'<a href="'+esc(d.source_url)+'" target="_blank" rel="noopener">Open source document ↗</a>':'')+'</div><div class="ls-int-actions">'+(canVerify&&d.verification_status==='unverified'?'<button data-verify="'+esc(d.id)+'" data-decision="verified">Verify</button><button class="quiet" data-verify="'+esc(d.id)+'" data-decision="rejected">Reject</button>':'')+'</div></div>').join('')||'<p class="ls-int-empty">No documents discovered or analysed yet.</p>';
    const alertRows=alerts.map(a=>'<div class="ls-int-alert '+esc(a.severity)+'"><b>'+esc(a.title)+'</b><p>'+esc(a.message)+'</p><small>'+fmt(a.created_at)+' · '+esc(a.severity)+'</small></div>').join('')||'<p class="ls-int-empty">No intelligence alerts yet.</p>';
    host.innerHTML='<div class="ls-int-toolbar"><div><span class="ls-int-kicker">LANDSETU INTELLIGENCE ENGINE</span><h2>Autonomous acquisition intelligence</h2><p>Government-source monitoring, document extraction, evidence-led risk analysis and delay forecasting.</p></div><button class="secondary" id="lsIntRefresh">↻ Refresh</button></div>'+
      '<div class="ls-int-actionsbar"><button class="primary" id="lsIntScan" '+(!canRun?'disabled':'')+'>⌕ Scan official sources</button><span id="lsIntStatus" aria-live="polite">Source scans run on demand and when a source is due for refresh.</span></div>'+
      '<div class="ls-int-grid"><section class="panel"><h3>1 · Government data sources</h3><p class="ls-int-muted">Official portals and guidance pages. A discovered link is not treated as verified parcel data.</p>'+sourceRows+'</section>'+
      '<section class="panel"><h3>2 · Document intelligence</h3><p class="ls-int-muted">Upload a text-readable PDF. AI extracts sections, survey numbers, villages, areas, parties and dates for admin review.</p><div class="ls-int-upload"><label>Link document to project (optional)<select id="lsIntProject"><option value="">Auto-match / Unassigned</option>'+projectOptions+'</select></label><input id="lsIntFile" type="file" accept="application/pdf,.pdf"><button class="primary" id="lsIntAnalyze" '+(!canRun?'disabled':'')+'>Extract document facts</button></div><div class="ls-int-docs">'+docRows+'</div></section></div>'+
      '<section class="panel ls-int-predict"><div class="ls-int-toolbar"><div><h3>3–5 · Bhoomi Predict: project delay and risk</h3><p class="ls-int-muted">AI analyses linked parcels, disputes, milestones, awards and project stage. Missing evidence is reported, not invented.</p></div></div><div class="ls-int-runrow"><select id="lsIntForecastProject"><option value="">Select project</option>'+projectOptions+'</select><button class="primary" id="lsIntPredict" '+(!canRun?'disabled':'')+'>Predict selected project</button><button class="secondary" id="lsIntPredictAll" '+(!canRun?'disabled':'')+'>Predict all projects</button></div>'+latest+'</section>'+
      '<div class="ls-int-grid"><section class="panel"><h3>6 · Risk and government update alerts</h3>'+alertRows+'</section><section class="panel"><h3>7 · Admin verification</h3><p class="ls-int-muted">AI-extracted records remain unverified until an authorised state or national administrator reviews the source and approves them.</p><div class="ls-int-docs">'+docRows+'</div></section></div>'+
      '<p class="ls-int-foot">AI provider: OpenAI API via a protected Supabase Edge Function. Predictions are estimates, not legal determinations or guaranteed completion dates. Source access and document quality vary by government portal.</p>';
    document.getElementById('lsIntRefresh')?.addEventListener('click',refresh);
    document.getElementById('lsIntScan')?.addEventListener('click',()=>scan(false));
    document.getElementById('lsIntAnalyze')?.addEventListener('click',analyze);
    document.getElementById('lsIntPredict')?.addEventListener('click',()=>predictOne(document.getElementById('lsIntForecastProject')?.value));
    document.getElementById('lsIntPredictAll')?.addEventListener('click',predictAll);
    host.querySelectorAll('[data-verify]').forEach(btn=>btn.addEventListener('click',()=>verify(btn.dataset.verify,btn.dataset.decision)));
  }
  function status(message){const el=document.getElementById('lsIntStatus');if(el)el.textContent=message;}
  async function scan(automatic){
    if(loading)return;loading=true;status(automatic?'Refreshing government sources due for update…':'Scanning official government source pages…');
    try{const r=await invoke({action:'scan_sources'});status((automatic?'Automatic refresh':'Source scan')+' complete: '+r.results.filter(x=>x.status==='ok').length+'/'+r.results.length+' sources reachable.');await refreshNoAuto();}
    catch(e){status('Source scan failed: '+e.message);}
    finally{loading=false;}
  }
  async function refreshNoAuto(){
    const r=await Promise.all([
      supabaseClient.from('intelligence_sources').select('*').order('name'),
      supabaseClient.from('intelligence_documents').select('id,title,source_url,document_type,extraction_status,verification_status,published_on,created_at,project_id').order('created_at',{ascending:false}).limit(15),
      supabaseClient.from('ai_delay_predictions').select('*').order('generated_at',{ascending:false}).limit(12),
      supabaseClient.from('intelligence_alerts').select('*').order('created_at',{ascending:false}).limit(15)
    ]);
    sources=r[0].data||[];documents=r[1].data||[];predictions=r[2].data||[];alerts=r[3].data||[];draw();
  }
  async function analyze(){
    const file=document.getElementById('lsIntFile')?.files?.[0];if(!file){status('Choose a PDF first.');return;}
    if(file.size>18*1024*1024){status('PDF is too large. Please use a file under 18 MB.');return;}
    loading=true;status('Reading PDF pages and extracting text…');
    try{
      const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      const buffer=await file.arrayBuffer(),pdf=await pdfjs.getDocument({data:buffer}).promise;
      let text='';
      for(let i=1;i<=Math.min(pdf.numPages,100);i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+='\n'+content.items.map(x=>x.str).join(' ');}
      const images=[];
      if(text.trim().length<100){
        for(let i=1;i<=Math.min(pdf.numPages,8);i++){
          const page=await pdf.getPage(i),viewport=page.getViewport({scale:1.35});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
          images.push(canvas.toDataURL('image/jpeg',0.72));
        }
      }
      if(text.trim().length<100&&images.length===0)throw new Error('Could not render readable PDF pages for OCR.');
      status('Sending '+pdf.numPages+'-page document to AI for text extraction'+(images.length?' and scanned-page OCR':'')+'…');
      const r=await invoke({action:'analyze_document',title:file.name,text,images,project_id:document.getElementById('lsIntProject')?.value||null});
      status('Extracted document saved for review. '+(r.extracted?.survey_numbers?.length||0)+' survey number(s) detected; status remains unverified.');
      await refreshNoAuto();
    }catch(e){status('Document analysis failed: '+e.message);}
    finally{loading=false;}
  }
  async function predictOne(id){
    if(!id){status('Select a project first.');return;}
    loading=true;status('Bhoomi Predict is analysing project, parcel, legal and acquisition records…');
    try{const r=await invoke({action:'predict_project',project_id:id});status('AI forecast saved. Estimated additional delay: '+(r.prediction.predicted_additional_days??'insufficient data')+' days.');await refreshNoAuto();}
    catch(e){status('AI prediction failed: '+e.message);}
    finally{loading=false;}
  }
  async function predictAll(){
    if(!projects.length){status('No projects found.');return;}
    loading=true;let completed=0;status('Generating forecasts for '+projects.length+' projects…');
    try{
      for(const p of projects){status('Analysing '+(p.name||p.project_code)+' ('+(completed+1)+'/'+projects.length+')…');await invoke({action:'predict_project',project_id:p.id});completed++;}
      status('Finished: '+completed+' project forecast(s) saved.');await refreshNoAuto();
    }catch(e){status('Stopped after '+completed+' forecast(s): '+e.message);}
    finally{loading=false;}
  }
  async function verify(id,decision){
    if(!confirm(decision==='verified'?'Verify this extracted government record?':'Reject this extracted government record?'))return;
    try{await invoke({action:'verify_document',document_id:id,decision});status('Document review saved.');await refreshNoAuto();}
    catch(e){status('Verification failed: '+e.message);}
  }
  function mount(){
    if(page!=='ai-predictions'||!supabaseClient||!currentUser)return;
    const content=document.querySelector('#content');if(!content||document.getElementById('landsetuIntelligencePanel'))return;
    const panel=document.createElement('section');panel.id='landsetuIntelligencePanel';panel.style.margin='0 0 18px';
    panel.innerHTML='<div id="landsetuIntelligenceMount"></div>';
    content.prepend(panel);refresh();
  }
  const style=document.createElement('style');
  style.textContent=`
  #landsetuIntelligencePanel .ls-int-toolbar{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin:0 0 12px}
  #landsetuIntelligencePanel h2{font-size:23px;margin:4px 0}#landsetuIntelligencePanel h3{margin:0 0 8px;font-size:16px}
  #landsetuIntelligencePanel .ls-int-kicker{font-size:10px;letter-spacing:1.4px;font-weight:800;color:#4774a6}
  #landsetuIntelligencePanel .ls-int-toolbar p,#landsetuIntelligencePanel .ls-int-muted{color:#68758a;font-size:13px;margin:4px 0 10px;line-height:1.5}
  #landsetuIntelligencePanel .ls-int-actionsbar,#landsetuIntelligencePanel .ls-int-runrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}
  #landsetuIntelligencePanel .ls-int-actionsbar span{font-size:12px;color:#68758a}
  #landsetuIntelligencePanel .ls-int-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:14px;margin:14px 0}
  #landsetuIntelligencePanel .ls-int-source,#landsetuIntelligencePanel .ls-int-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:12px 0;border-top:1px solid #edf0f5;min-width:0}
  #landsetuIntelligencePanel .ls-int-source small,#landsetuIntelligencePanel .ls-int-row small{display:block;color:#788397;font-size:11px;margin-top:4px;overflow-wrap:anywhere}
  #landsetuIntelligencePanel .ls-int-source>div:last-child{text-align:right;flex-shrink:0}
  #landsetuIntelligencePanel .ls-int-state,#landsetuIntelligencePanel .ls-int-tag{font-size:10px;padding:4px 7px;border-radius:20px;background:#f1f4f8;color:#596579}
  #landsetuIntelligencePanel .ls-int-state.ok{background:#e8f5ed;color:#28764a}#landsetuIntelligencePanel .ls-int-state.bad{background:#fff0ed;color:#a43d32}
  #landsetuIntelligencePanel .ls-int-upload{display:grid;gap:9px;margin:12px 0 16px}
  #landsetuIntelligencePanel .ls-int-upload label{display:grid;gap:6px;font-size:12px;color:#657087}
  #landsetuIntelligencePanel select,#landsetuIntelligencePanel input[type=file]{padding:9px;border:1px solid #dce3ec;border-radius:8px;background:#fff;max-width:100%}
  #landsetuIntelligencePanel .ls-int-actions{display:flex;gap:6px;flex-wrap:wrap}
  #landsetuIntelligencePanel .ls-int-actions button{border:1px solid #dce3ec;background:#fff;border-radius:7px;padding:6px 9px;font-size:11px}
  #landsetuIntelligencePanel .ls-int-actions button.quiet{color:#9a4b42}
  #landsetuIntelligencePanel .ls-int-row p{font-size:12px;color:#69768b;margin:6px 0}
  #landsetuIntelligencePanel .ls-int-row a{font-size:11px;color:#2865a8}
  #landsetuIntelligencePanel .ls-int-metric{text-align:right;min-width:95px}
  #landsetuIntelligencePanel .ls-int-metric>b{display:block;font-size:21px;color:#183d67}
  #landsetuIntelligencePanel .ls-int-metric span,#landsetuIntelligencePanel .ls-int-metric small{display:block;font-size:11px;color:#68758a;margin-top:3px}
  #landsetuIntelligencePanel .ls-int-alert{padding:10px 12px;border-top:1px solid #edf0f5;border-left:3px solid #9aa9bd;margin-top:8px}
  #landsetuIntelligencePanel .ls-int-alert.high,#landsetuIntelligencePanel .ls-int-alert.critical{border-left-color:#c65d52}
  #landsetuIntelligencePanel .ls-int-alert p{font-size:12px;color:#68758a;margin:5px 0}
  #landsetuIntelligencePanel .ls-int-empty{color:#778397;font-size:13px;padding:12px 0}
  #landsetuIntelligencePanel .ls-int-foot{font-size:11px;color:#7b8798;margin:12px 0}
  @media(max-width:600px){#landsetuIntelligencePanel .ls-int-row{flex-direction:column}#landsetuIntelligencePanel .ls-int-metric{text-align:left}}
  `;
  document.head.appendChild(style);
  const previousRender=window.render;
  if(typeof previousRender==='function')window.render=function(){previousRender();if(page==='ai-predictions')setTimeout(mount,0);};
  window.addEventListener('landsetu:authenticated',()=>setTimeout(mount,100));
  document.addEventListener('click',e=>{if(e.target.closest('[data-page="ai-predictions"]'))setTimeout(mount,100);});
  setTimeout(mount,200);
})();