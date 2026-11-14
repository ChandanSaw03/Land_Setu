import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const app = document.querySelector(".app");
const style = document.createElement("style");
style.textContent = `
#auth-screen{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#eef4ff,#f8fbff 55%,#eaf8f1);font-family:Inter,system-ui,sans-serif;color:#101a35}
.auth-card{width:min(440px,100%);background:white;border:1px solid #e3eaf5;border-radius:22px;padding:32px;box-shadow:0 18px 60px #152b5018}
.auth-brand{text-align:center;margin-bottom:25px}.auth-brand .mark{font-size:38px}.auth-brand h1{margin:5px;color:#174fae;font-size:30px}.auth-brand p{color:#657087;margin:0}
.auth-card h2{margin:0 0 8px;font-size:24px}.auth-sub{color:#657087;margin:0 0 22px}.auth-field{display:grid;gap:7px;margin:14px 0;color:#34415a;font-size:14px}.auth-field input{height:46px;border:1px solid #dce3ee;border-radius:10px;padding:0 13px;font:inherit;outline-color:#2475e8}.auth-submit{width:100%;border:0;border-radius:10px;background:#1557c0;color:white;font-weight:650;padding:14px;margin-top:12px;cursor:pointer}.auth-link{border:0;background:none;color:#1557c0;cursor:pointer;font:inherit;padding:10px 4px}.auth-row{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:14px}.auth-error{color:#c73542;background:#fff0f1;padding:10px;border-radius:9px;font-size:13px;margin:12px 0}.auth-success{color:#168658;background:#eaf8f0;padding:10px;border-radius:9px;font-size:13px;margin:12px 0}#auth-user-actions{display:flex;align-items:center;gap:10px}#auth-logout{border:1px solid #dce3ee;background:white;border-radius:9px;padding:9px 12px;color:#34415a;cursor:pointer}
`;
document.head.append(style);
const screen = document.createElement("section"); screen.id = "auth-screen";
screen.innerHTML = `<div class="auth-card"><div class="auth-brand"><div class="mark">♛</div><h1>LandSetu</h1><p>Predict · Plan · Prevent</p></div><div id="auth-content"></div></div>`;
app.before(screen); app.style.display = "none";
const content = screen.querySelector("#auth-content");
let mode = "login"; let busy = false;
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PASTE_") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("PASTE_");
if (!configured) {
  content.innerHTML = `<h2>Authentication setup required</h2><p class="auth-sub">Add your Supabase Project URL and anon/public key in <code>supabase-config.js</code> to activate secure login.</p><div class="auth-error">The app is locked until Supabase credentials are configured. Do not use a service_role key here.</div>`;
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  function showMessage(message, success=false){let el=content.querySelector(".auth-message");if(!el){el=document.createElement("div");el.className="auth-message";content.append(el)}el.className=success?"auth-success auth-message":"auth-error auth-message";el.textContent=message;}
  function render(){
    const signup=mode==="signup", reset=mode==="reset", recovery=mode==="recovery";
    content.innerHTML=`<h2>${recovery?"Choose a new password":reset?"Reset your password":signup?"Create your account":"Welcome back"}</h2><p class="auth-sub">${recovery?"Enter and confirm your new password.":reset?"We’ll email you a secure reset link.":signup?"Register to access the LandSetu dashboard.":"Sign in to continue to your LandSetu dashboard."}</p>${signup?`<label class="auth-field">Full name<input id="auth-name" autocomplete="name" required maxlength="100" placeholder="Your full name"></label><label class="auth-field">Phone number<input id="auth-phone" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="Optional"></label>`:""}<label class="auth-field">Email address<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>${reset?"":`<label class="auth-field">${recovery?"New password":"Password"}<input id="auth-password" type="password" autocomplete="${signup||recovery?"new-password":"current-password"}" minlength="8" required placeholder="At least 8 characters"></label>`${recovery?'<label class="auth-field">Confirm new password<input id="auth-confirm" type="password" autocomplete="new-password" minlength="8" required placeholder="Repeat new password"></label>':""} }<button class="auth-submit" id="auth-submit">${recovery?"Update password":reset?"Send reset link":signup?"Create account":"Sign in"}</button><div class="auth-row"><button class="auth-link" id="auth-switch">${reset?"Back to sign in":signup?"Already have an account? Sign in":"Create an account"}</button>${!signup&&!reset?'<button class="auth-link" id="auth-forgot">Forgot password?</button>':""}</div>`;
    content.querySelector("#auth-switch").onclick=()=>{mode=mode==="login"?"signup":"login";render()};
    content.querySelector("#auth-forgot")?.addEventListener("click",()=>{mode="reset";render()});
    content.querySelector("#auth-submit").onclick=submit;
  }
  async function submit(){if(busy)return;const email=content.querySelector("#auth-email")?.value.trim();const password=content.querySelector("#auth-password")?.value;const name=content.querySelector("#auth-name")?.value.trim();const phone=content.querySelector("#auth-phone")?.value.trim();if(mode==="recovery"){const confirm=content.querySelector("#auth-confirm")?.value;if(!password||password.length<8||password!==confirm)return showMessage("Passwords must match and contain at least 8 characters.");}else if(!email||(!password&&mode!=="reset"))return showMessage("Please enter the required fields.");if(mode==="signup"&&(!name||password.length<8))return showMessage("Enter your name and a password with at least 8 characters.");busy=true;const button=content.querySelector("#auth-submit");button.disabled=true;button.textContent="Please wait…";
    try{let result;if(mode==="recovery"){result=await supabase.auth.updateUser({password});if(result.error)throw result.error;showMessage("Password updated. You are now signed in.",true);await enterApp(result.data.user);}
    else if(mode==="signup"){result=await supabase.auth.signUp({email,password,options:{data:{full_name:name,phone},emailRedirectTo:location.origin+location.pathname}});if(result.error)throw result.error;showMessage(result.data.session?"Account created. Signing you in…":"Account created. Check your email to verify your address, then sign in.",true);if(result.data.session)await enterApp(result.data.session.user);}
    else if(mode==="reset"){result=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(result.error)throw result.error;showMessage("If an account exists for this email, a password reset link has been sent.",true);}
    else{result=await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;await enterApp(result.data.user);}}
    catch(e){showMessage(e.message||"Authentication failed. Please try again.");}finally{busy=false;const b=content.querySelector("#auth-submit");if(b){b.disabled=false;b.textContent=mode==="recovery"?"Update password":mode==="reset"?"Send reset link":mode==="signup"?"Create account":"Sign in";}}
  }
  async function enterApp(user){
    const {data:profile}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
    const fullName=profile?.full_name||user.user_metadata?.full_name||user.email?.split("@")[0]||"User";
    const role=profile?.role||"User";
    const profileBox=document.querySelector(".profile");
    if(profileBox){profileBox.innerHTML=`<div class="avatar">${fullName.slice(0,1).toUpperCase()}</div><div><b>${escapeHtml(fullName)}</b><small>${escapeHtml(role)}</small></div><div id="auth-user-actions"><button id="auth-logout">Log out</button></div>`;}
    screen.style.display="none";app.style.display="grid";
    document.querySelector("#auth-logout")?.addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error)showMessage(error.message);});
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  supabase.auth.onAuthStateChange((event,session)=>{if(event==="PASSWORD_RECOVERY"){mode="recovery";render();}else if(session){setTimeout(()=>enterApp(session.user),0);}else{app.style.display="none";screen.style.display="grid";mode="login";render();}});
  render();
}
