(() => {
  const REPORT_URL = "https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf";
  const SNAPSHOT = '2026-09-01';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN');
  const money = value => value == null ? '—' : '₹' + Number(value).toFixed(2) + ' lakh Cr';
  let loading = false;

  function mount() {
    const content = document.getElementById('content');
    const active = document.querySelector('.nav button.active[data-page="projects"]');
    const anchor = content?.querySelector('.filters');
    if (!active || !anchor || document.getElementById('officialDataPanel') || loading) return;
    const client = window.landsetuSupabase;
    if (!client) return;
    loading = true;
    const panel = document.createElement('section');
    panel.id = 'officialDataPanel';
    panel.className = 'panel';
    panel.style.margin = '16px 0';
    panel.innerHTML = '<h3>Government infrastructure data</h3><p style="color:#657087;margin:0">Loading verified MoSPI PAIMANA records…</p>';
    anchor.before(panel);

    Promise.all([
      client.from('official_infrastructure_metrics').select('*').eq('snapshot_month', SNAPSHOT).order('dimension').order('group_name'),
      client.from('official_infrastructure_projects').select('*').order('project_name')
    ]).then(([metricsResult, projectsResult]) => {
      if (metricsResult.error) throw metricsResult.error;
      if (projectsResult.error) throw projectsResult.error;
      const rows = metricsResult.data || [];
      const projects = projectsResult.data || [];
      const pick = dimension => rows.filter(row => row.dimension === dimension);
      const sectors = pick('sector').sort((a,b) => b.project_count-a.project_count);
      const ministries = pick('ministry').sort((a,b) => b.project_count-a.project_count);
      const onboarded = pick('onboarding').sort((a,b) => b.project_count-a.project_count);
      const progressGroups = [...new Set(pick('progress').map(row => row.group_name))];
      const total = sectors.reduce((sum,row) => sum + Number(row.project_count || 0), 0);
      const htmlRows = list => list.map(row => '<tr><td>'+esc(row.group_name)+'</td><td>'+num(row.project_count)+'</td><td>'+money(row.cost_lakh_crore)+'</td><td>'+money(row.expenditure_lakh_crore)+'</td></tr>').join('');
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div><h3 style="margin:0 0 5px">Government infrastructure data</h3><p style="margin:0;color:#657087">MoSPI PAIMANA · September 2026 snapshot · Central Sector projects</p></div>
          <a href="${REPORT_URL}" target="_blank" rel="noopener noreferrer">Original government report ↗</a>
        </div>
        <div class="stats" style="margin:16px 0">
          <div class="stat"><div><strong>${num(total)}</strong><span>Projects monitored</span></div></div>
          <div class="stat"><div><strong>₹37.56 lakh Cr</strong><span>Latest project cost</span></div></div>
          <div class="stat"><div><strong>₹17.73 lakh Cr</strong><span>Cumulative expenditure</span></div></div>
          <div class="stat"><div><strong>${num(onboarded.reduce((s,r)=>s+Number(r.project_count||0),0))}</strong><span>Newly onboarded in September</span></div></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
          <div><h3>Sector-wise coverage</h3><div class="table-wrap"><table class="data-table" style="min-width:570px"><thead><tr><th>Sector</th><th>Projects</th><th>Cost</th><th>Spent</th></tr></thead><tbody>${htmlRows(sectors)}</tbody></table></div></div>
          <div><h3>Newly onboarded · 83 projects</h3><div class="table-wrap"><table class="data-table" style="min-width:420px"><thead><tr><th>Ministry</th><th>New records</th></tr></thead><tbody>${onboarded.map(r=>'<tr><td>'+esc(r.group_name)+'</td><td>'+num(r.project_count)+'</td></tr>').join('')}</tbody></table></div></div>
        </div>
        <details style="margin-top:16px"><summary style="cursor:pointer;color:#1557c0;font-weight:650;padding:8px 0">View all 17 ministry totals</summary><div class="table-wrap" style="margin-top:8px"><table class="data-table" style="min-width:570px"><thead><tr><th>Ministry / Department</th><th>Projects</th><th>Cost</th><th>Spent</th></tr></thead><tbody>${htmlRows(ministries)}</tbody></table></div></details>
        <details style="margin-top:8px"><summary style="cursor:pointer;color:#1557c0;font-weight:650;padding:8px 0">View physical vs financial progress bands</summary>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0"><label for="officialProgressGroup">Dataset</label><select id="officialProgressGroup" class="pill-select">${progressGroups.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')}</select></div>
          <div class="table-wrap"><table class="data-table" style="min-width:420px"><thead><tr><th>Progress band</th><th>Physical projects</th><th>Financial projects</th></tr></thead><tbody id="officialProgressRows"></tbody></table></div>
        </details>
        <details style="margin-top:8px"><summary style="cursor:pointer;color:#1557c0;font-weight:650;padding:8px 0">View named official projects (${projects.length} records)</summary>
          <div class="table-wrap" style="margin-top:8px"><table class="data-table" style="min-width:720px"><thead><tr><th>Project</th><th>Ministry / sector</th><th>Location stated in report</th><th>Latest cost</th><th>Report status</th></tr></thead><tbody>${projects.map(p=>'<tr><td><strong>'+esc(p.project_name)+'</strong></td><td>'+esc(p.ministry)+'<br><small>'+esc(p.sector)+'</small></td><td>'+esc(p.location_label || 'Not specified in report')+'</td><td>₹'+num(p.latest_cost_crore)+' Cr</td><td>'+esc(p.source_status.replaceAll('_',' '))+'</td></tr>').join('')}</tbody></table></div>
        </details>
        <p style="font-size:12px;color:#778196;margin:14px 0 0">Coverage note: MoSPI’s report monitors 1,853 Central Sector infrastructure projects (₹150 crore and above). Sector and ministry values are reported aggregates; they are not individual site records. The report names selected commissioned and newly onboarded projects, not all 83 additions. Missing coordinates and locations are not estimated. Figures are a September 2026 snapshot, not live project status.</p>
      `;
      const select = panel.querySelector('#officialProgressGroup');
      const tbody = panel.querySelector('#officialProgressRows');
      const drawProgress = () => {
        const selected = select.value;
        tbody.innerHTML = pick('progress').filter(r => r.group_name === selected).sort((a,b) => rangesOrder(a.progress_range)-rangesOrder(b.progress_range)).map(r => '<tr><td>'+esc(r.progress_range)+'</td><td>'+num(r.physical_project_count)+'</td><td>'+num(r.financial_project_count)+'</td></tr>').join('');
      };
      select?.addEventListener('change', drawProgress);
      drawProgress();
    }).catch(error => {
      panel.innerHTML = '<h3>Government infrastructure data</h3><p style="color:#b42332">Could not load official records: '+esc(error.message || 'Database request failed')+'</p><p style="font-size:12px;color:#657087">Check that the official infrastructure tables are deployed and accessible to signed-in users.</p>';
    }).finally(() => { loading = false; });
  }
  function rangesOrder(value) { return ['0-20%','21-40%','41-60%','61-80%','81-100%'].indexOf(value); }
  const observer = new MutationObserver(() => { if (document.querySelector('.nav button.active[data-page="projects"]')) mount(); });
  const start = () => {
    const content = document.getElementById('content');
    if (content) observer.observe(content, {childList:true,subtree:true});
    mount();
  };
  window.addEventListener('landsetu:authenticated', () => { loading = false; setTimeout(mount, 0); });
  window.addEventListener('landsetu:signedout', () => { loading = false; document.getElementById('officialDataPanel')?.remove(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();