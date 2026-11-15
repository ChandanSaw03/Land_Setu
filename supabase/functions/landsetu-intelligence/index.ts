import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body, status=200) => new Response(JSON.stringify(body), { status, headers: cors });
const clean = (v, max=500) => String(v ?? "").slice(0,max);
const sha256 = async (s) => {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const asJson = (raw) => {
  if (typeof raw !== "string") return raw;
  const cleaned = raw.replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();
  return JSON.parse(cleaned);
};
async function callAI(prompt, system) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not configured in Supabase Edge Function secrets. Add it before running document extraction or AI predictions.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"gpt-4.1-mini",
      input:[
        {role:"system",content:[{type:"input_text",text:system}]},
        {role:"user",content:[{type:"input_text",text:prompt}]}
      ],
      text:{format:{type:"json_object"}}
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "AI provider request failed");
  const output = (data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text;
  if (!output) throw new Error("AI returned no structured output");
  return asJson(output);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  if (req.method !== "POST") return json({error:"POST required"},405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Supabase Edge Function environment is incomplete.");
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({error:"Sign-in required"},401);
    const userClient = createClient(url,anonKey,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if (userError || !user) return json({error:"Session is invalid or expired"},401);
    const admin = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:profile,error:profileError}=await admin.from("profiles").select("role,assigned_state").eq("id",user.id).maybeSingle();
    if (profileError || !profile) return json({error:"User profile could not be verified"},403);
    const allowed = ["national_admin","state_admin","project_manager","analyst"].includes(profile.role);
    if (!allowed) return json({error:"Your account is not permitted to run acquisition intelligence"},403);
    const canAccessProject = async (projectId) => {
      if (profile.role === "national_admin" || profile.role === "analyst") return true;
      if (!projectId) return false;
      const {data:project} = await admin.from("projects").select("id,state").eq("id",projectId).maybeSingle();
      if (!project) return false;
      if (profile.role === "state_admin") return project.state === profile.assigned_state;
      if (profile.role === "project_manager") {
        const {data:assignment} = await admin.from("project_assignments").select("project_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle();
        return !!assignment;
      }
      return false;
    };
    const body = await req.json();
    const action = clean(body.action,60);

    if (action === "scan_sources") {
      const {data:sources,error}=await admin.from("intelligence_sources").select("*").eq("enabled",true);
      if (error) throw error;
      const results=[];
      for (const source of (sources||[])) {
        let status="ok", httpStatus=null, found=0, summary="", errorMessage=null;
        try {
          const res=await fetch(source.url,{headers:{"User-Agent":"LandSetu-Official-Source-Monitor/1.0 (+public government source monitoring)","Accept":"text/html,application/pdf,*/*"},redirect:"follow"});
          httpStatus=res.status;
          if (!res.ok) throw new Error("HTTP "+res.status);
          const contentType=res.headers.get("content-type")||"";
          if (contentType.includes("pdf") || source.url.toLowerCase().endsWith(".pdf")) {
            const hash=await sha256(source.url);
            const {error:docError}=await admin.from("intelligence_documents").upsert({
              source_id:source.id,title:source.name+" · source document",source_url:source.url,
              document_type:"official_guideline",document_hash:hash,extraction_status:"pending"
            },{onConflict:"source_url,document_hash",ignoreDuplicates:true});
            if(docError) throw docError;
            found=1; summary="Official PDF source is reachable; queued for document review/extraction.";
          } else {
            const html=(await res.text()).slice(0,1500000);
            const anchors=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
            const candidates=[];
            for(const a of anchors){
              try {
                const href=new URL(a[1],source.url).href;
                const label=a[2].replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
                if (/\.pdf(?:\?|$)/i.test(href) || /land acquisition|notification|gazette|section 3[acd]|award|compensation/i.test(label)) {
                  if (!candidates.some(x=>x.url===href)) candidates.push({url:href,label:label||"Official notice"});
                }
              } catch {}
            }
            for(const item of candidates.slice(0,40)){
              const hash=await sha256(item.url);
              const {error:docError}=await admin.from("intelligence_documents").upsert({
                source_id:source.id,title:clean(item.label||"Government notice",240),source_url:item.url,
                document_type:/\.pdf(?:\?|$)/i.test(item.url)?"gazette_or_notice":"source_listing",
                document_hash:hash,extraction_status:"pending"
              },{onConflict:"source_url,document_hash",ignoreDuplicates:true});
              if(!docError) found++;
            }
            summary="Source page fetched. "+found+" potentially relevant notice/document links discovered; page text is not treated as verified parcel data.";
          }
        } catch(e) { status="error"; errorMessage=clean(e.message,800); summary="Source could not be read automatically. Check the portal manually."; }
        await admin.from("intelligence_sources").update({last_checked_at:new Date().toISOString(),last_status:status}).eq("id",source.id);
        await admin.from("intelligence_scan_runs").insert({source_id:source.id,status,http_status:httpStatus,discovered_count:found,summary,error_message:errorMessage});
        results.push({source:source.name,status,http_status:httpStatus,discovered:found,summary,error:errorMessage});
      }
      return json({ok:true,results});
    }

    if (action === "analyze_document") {
      const text=clean(body.text,180000);
      if(text.trim().length<100) throw new Error("The document did not contain enough readable text. Try a text-based PDF or a clearer scan.");
      const extracted=await callAI(text,
        "You are a careful Indian land-acquisition document analyst. Extract only facts explicitly supported by the supplied document. Never infer an owner, survey number, area, award, case status or legal outcome. Return valid JSON with keys: document_type, title, notification_number, statutory_section, published_date (YYYY-MM-DD or null), state, district, tehsil, villages (array), survey_numbers (array of strings), land_areas (array of {survey_number,area,unit,land_type,ownership}), named_parties (array), case_numbers (array), important_dates (array of {date,event}), project_names (array), summary, potential_alerts (array of {severity,title,message,related_survey_number}). Put uncertain items in an uncertainties array. Use null/empty arrays when absent. Include a short source_quote for every key fact where possible.");
      let projectId=body.project_id||null, parcelId=body.parcel_id||null;
      const projectName=Array.isArray(extracted.project_names)?extracted.project_names[0]:null;
      if(!projectId && projectName){
        const {data:projects}=await admin.from("projects").select("id,name,project_code,state,district");
        const match=(projects||[]).find(p=>text.toLowerCase().includes(String(p.name||"").toLowerCase()) || (p.project_code && text.toLowerCase().includes(p.project_code.toLowerCase())));
        if(match) projectId=match.id;
      }
      if(projectId && !(await canAccessProject(projectId))) return json({error:"You do not have access to the selected project."},403);
      const sourceUrl=clean(body.source_url,1500)||null;
      const hash=await sha256(text);
      const {data:doc,error:docError}=await admin.from("intelligence_documents").insert({
        project_id:projectId,parcel_id:parcelId,source_id:body.source_id||null,
        title:clean(extracted.title||body.title||"Uploaded acquisition document",240),
        source_url:sourceUrl,document_type:clean(extracted.document_type||"government_document",80),
        published_on:extracted.published_date||null,document_hash:hash,extracted_data:extracted,
        extraction_status:"completed",verification_status:"unverified",created_by:user.id
      }).select("id").single();
      if(docError) throw docError;
      if(projectId && Array.isArray(extracted.potential_alerts)){
        for(const a of extracted.potential_alerts.slice(0,20)){
          await admin.from("intelligence_alerts").insert({
            project_id:projectId,parcel_id:parcelId,document_id:doc.id,
            alert_type:"document_finding",severity:["low","medium","high","critical"].includes(a.severity)?a.severity:"medium",
            title:clean(a.title||"New document finding",220),message:clean(a.message||"AI extracted a finding that requires human review.",1200),evidence_url:sourceUrl
          });
        }
      }
      return json({ok:true,document_id:doc.id,project_id:projectId,extracted,verification_status:"unverified"});
    }

    if (action === "predict_project") {
      const projectId=clean(body.project_id,80);
      if(!projectId) throw new Error("Choose a project before generating a forecast.");
      const [{data:project,error:pError},{data:parcels,error:parcelError},{data:cases,error:caseError},{data:milestones},{data:awards}] = await Promise.all([
        admin.from("projects").select("*").eq("id",projectId).single(),
        admin.from("land_parcels").select("*").eq("project_id",projectId).limit(250),
        admin.from("legal_cases").select("*").eq("project_id",projectId).limit(250),
        admin.from("acquisition_milestones").select("*").eq("project_id",projectId).limit(100),
        admin.from("acquisition_awards").select("*").eq("project_id",projectId).limit(100)
      ]);
      if(pError) throw pError; if(parcelError) throw parcelError; if(caseError) throw caseError;
      if(!(await canAccessProject(projectId))) return json({error:"You do not have access to this project."},403);
      const snapshot={project,parcels:parcels||[],legal_cases:cases||[],acquisition_milestones:milestones||[],awards:awards||[]};
      const result=await callAI(JSON.stringify(snapshot).slice(0,140000),
        "You are Bhoomi Predict, an evidence-led Indian land acquisition delay analyst. Estimate remaining calendar days to complete the current acquisition scope, not days already elapsed. Use project and parcel stage, 3A/3C/3D notification dates, objections, active court cases/stays, title/ownership conflicts, survey mismatch, award preparation, compensation payment, approvals, possession and R&R milestones. Do not assume statutory deadlines are actual durations. Do not invent missing data. Distinguish recorded facts from assumptions. Return valid JSON: predicted_additional_days (integer or null), range_min_days (integer or null), range_max_days (integer or null), estimated_completion_date (YYYY-MM-DD or null), risk_score (0-100 or null), risk_level (Low/Medium/High/Critical/Insufficient data), data_completeness (0-100), drivers (array of {factor,observed_evidence,estimated_delay_days,confidence}), recommendations (array of {action,owner_role,urgency}), explanation, missing_data (array), limitations. If insufficient evidence, return null days and Insufficient data. Never claim statistical confidence unless supported by validation data.");
      const record={
        project_id:projectId,model_version:"bhoomi-predict-llm-v1",
        predicted_additional_days:Number.isInteger(result.predicted_additional_days)?Math.max(0,result.predicted_additional_days):null,
        range_min_days:Number.isInteger(result.range_min_days)?Math.max(0,result.range_min_days):null,
        range_max_days:Number.isInteger(result.range_max_days)?Math.max(0,result.range_max_days):null,
        estimated_completion_date:result.estimated_completion_date||null,
        risk_score:Number.isInteger(result.risk_score)?Math.max(0,Math.min(100,result.risk_score)):null,
        risk_level:result.risk_level||"Insufficient data",drivers:result.drivers||[],recommendations:result.recommendations||[],
        data_completeness:Number.isInteger(result.data_completeness)?Math.max(0,Math.min(100,result.data_completeness)):0,
        explanation:clean(result.explanation,4000),input_snapshot:{project_id:projectId,parcel_count:(parcels||[]).length,legal_case_count:(cases||[]).length,generated_for:"current project data"}
      };
      const {data:saved,error:saveError}=await admin.from("ai_delay_predictions").insert(record).select("*").single();
      if(saveError) throw saveError;
      if(["High","Critical"].includes(record.risk_level)){
        await admin.from("intelligence_alerts").insert({project_id:projectId,alert_type:"ai_risk_prediction",severity:record.risk_level.toLowerCase(),title:"Bhoomi Predict: "+record.risk_level+" acquisition risk",message:record.explanation||"AI identified material acquisition delay risks.",is_read:false});
      }
      return json({ok:true,prediction:saved,analysis:result});
    }

    if (action === "verify_document") {
      const documentId=clean(body.document_id,80), decision=body.decision;
      if(!documentId || !["verified","rejected"].includes(decision)) throw new Error("A document and a valid verification decision are required.");
      if(!["national_admin","state_admin"].includes(profile.role)) return json({error:"Only national or state administrators can verify official extracted records."},403);
      const {data:existing,error:lookupError}=await admin.from("intelligence_documents").select("id,project_id").eq("id",documentId).maybeSingle();
      if(lookupError || !existing) throw new Error("Document not found.");
      if(profile.role==="state_admin" && !(await canAccessProject(existing.project_id))) return json({error:"You cannot verify a document outside your assigned state."},403);
      const {data:doc,error}=await admin.from("intelligence_documents").update({verification_status:decision}).eq("id",documentId).select("id,verification_status").single();
      if(error) throw error;
      return json({ok:true,document:doc});
    }

    return json({error:"Unknown action"},400);
  } catch(e) {
    return json({error:clean(e?.message||"Unexpected intelligence service error",1200)},500);
  }
});
