const state={market:"ashare",pool:"daily",data:{},status:{},config:null};
const $=id=>document.getElementById(id);
const pools={hourly:["小时池","60分钟趋势 / 15分钟确认"],daily:["日池","日线趋势 / 60分钟确认"],weekly:["周池","周线趋势 / 日线确认"],monthly:["月池","月线趋势 / 周线确认"]};
const poolMarks={hourly:"时",daily:"日",weekly:"周",monthly:"月"};
function resonanceMap(data){
  const matches=new Map();
  for(const key of Object.keys(poolMarks))for(const item of data?.pools?.[key]?.items||[]){
    const symbol=String(item.symbol);if(!matches.has(symbol))matches.set(symbol,[]);matches.get(symbol).push(key);
  }
  return matches;
}
function resonanceTag(keys){
  if((keys?.length||0)<2)return "";
  return '<span class="resonance" aria-label="共振，入选'+keys.map(k=>poolMarks[k]+'池').join('、')+'">共振</span><span class="pool-marks">'+keys.map(k=>'<span class="pool-mark '+k+'" title="'+poolMarks[k]+'池">'+poolMarks[k]+'</span>').join('')+'</span>';
}
const fmt=(v,n=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString("zh-CN",{maximumFractionDigits:n}):"—";
const date=s=>s?String(s).replace("T"," ").slice(0,19):"—";
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function get(path){const r=await fetch(path+"?v="+Date.now(),{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json();}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function github(path,token){
  const r=await fetch("https://api.github.com"+path,{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"},cache:"no-store"});
  if(!r.ok)throw Error("GitHub 状态查询返回 "+r.status);
  return r.json();
}
function showUpdateProgress(title,detail,percent,mode="running",url=""){
  const box=$("updateProgress");box.hidden=false;box.className="update-progress "+mode;
  $("updateProgressTitle").textContent=title;$("updateProgressDetail").textContent=detail;
  $("updateProgressPercent").textContent=percent+"%";$("updateProgressBar").style.width=percent+"%";
  const link=$("updateProgressLink");link.hidden=!url;if(url)link.href=url;
  $("liveStatus").innerHTML=mode==="success"?"<i></i> 更新完成":mode==="error"?"更新失败":"<i></i> 数据更新中 "+percent+"%";
}
async function load(){
  $("liveStatus").textContent="正在读取";
  try{
    state.config=await get("./config.json");
    state.status=await get("./data/status.json").catch(()=>({}));
    await Promise.all(["ashare","us","crypto"].map(async m=>{try{state.data[m]=await get("./data/"+m+".json");}catch{state.data[m]=null;}}));
    render();$("liveStatus").innerHTML="<i></i> 快照已读取";
  }catch(e){$("liveStatus").textContent="读取失败";$("notice").hidden=false;$("notice").textContent="读取快照失败："+e.message;}
}
function render(){
  const m=state.market,p=state.pool,d=state.data[m],s=state.status[m]||{};
  document.querySelectorAll(".market-tab").forEach(x=>{let on=x.dataset.market===m;x.classList.toggle("active",on);x.setAttribute("aria-selected",on);});
  document.querySelectorAll(".period-tab").forEach(x=>{x.classList.toggle("active",x.dataset.pool===p);x.querySelector("b").textContent=d?.pools?.[x.dataset.pool]?.count??"—";});
  $("sourceText").textContent=d?.source||"等待市场快照";
  $("totalCount").textContent=d?Object.keys(poolMarks).reduce((sum,key)=>sum+(d.pools?.[key]?.count||0),0):"—";
  $("snapshotTime").textContent=d?"生成于 "+date(d.generated_at)+" UTC":"尚未生成快照";
  $("resultTitle").textContent=pools[p][0]+" · 入选标的";
  $("periodDesc").textContent=pools[p][1];
  $("coverage").textContent=d?"行情至 "+(d.latest_daily_date||"逐只见表")+" · 有日线 "+d.daily_data_count+"/"+d.universe_count+" · 失败 "+d.failed_count:"暂无数据";
  const note=$("notice");note.hidden=true;
  if(s.ok===false){note.hidden=false;note.textContent="最近一次更新失败："+s.error+"。下方若有结果，为此前快照。";}
  else if(d?.failed_count){note.hidden=false;note.textContent="本次有 "+d.failed_count+" 个标的缺少行情或扫描失败；结果仅代表成功覆盖的标的。";}
  const all=d?.pools?.[p]?.items||[],q=$("search").value.trim().toLowerCase(),resonance=resonanceMap(d);
  const items=all.filter(x=>!q||String(x.symbol).toLowerCase().includes(q)||String(x.name).toLowerCase().includes(q));
  const body=$("rows");body.innerHTML="";
  if(!d){body.innerHTML='<tr><td colspan="7" class="empty">这个市场尚无可用快照。请运行一次更新，并查看更新状态。</td></tr>';return;}
  if(!items.length){body.innerHTML='<tr><td colspan="7" class="empty">'+(q?"没有匹配的入选标的":"当前周期没有入选标的")+"</td></tr>";return;}
  for(const x of items){
    const tr=document.createElement("tr");tr.dataset.symbol=x.symbol;tr.tabIndex=0;tr.setAttribute("aria-label","查看 "+x.name+" "+x.symbol+" 的入选依据");
    const shared=resonance.get(String(x.symbol))||[];
    tr.classList.toggle("is-resonant",shared.length>=2);
    tr.innerHTML='<td><span class="asset-name">'+esc(x.name)+'</span>'+resonanceTag(shared)+'<span class="asset-code">'+esc(x.symbol)+(x.rank?" · 市值 #"+x.rank:"")+'</span></td><td>'+fmt(x.close,4)+'</td><td class="score">'+fmt(x.main.score*100,2)+'<small>a点 '+esc(x.main.a_date)+'</small></td><td class="score">'+fmt(x.sub.score*100,2)+'<small>'+esc(date(x.sub_date))+'</small></td><td><span class="chip">'+esc(x.pattern)+'</span></td><td>'+esc(x.daily_date)+'</td><td>⌄</td>';
    tr.addEventListener("click",()=>toggleDetails(tr,x));
    tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleDetails(tr,x);}});
    body.appendChild(tr);
  }
}
function toggleDetails(tr,x){
  const next=tr.nextElementSibling;if(next?.classList.contains("details")){next.remove();return;}
  document.querySelectorAll(".details").forEach(el=>el.remove());
  const row=document.createElement("tr");row.className="details";
  row.innerHTML='<td colspan="7"><div class="detail-grid">'+
    '<div><strong>本级 a / b / c / d</strong>'+[x.main.a,x.main.b,x.main.c,x.main.d].map(v=>fmt(v,4)).join(" / ")+'</div>'+
    '<div><strong>本级判断</strong>c &gt; a：'+(x.main.higher_low?"是":"否")+' · d &gt; b：'+(x.main.higher_high?"是":"否")+'<br>近5根最低价：'+fmt(x.main.support,4)+'</div>'+
    '<div><strong>次级 a / b / c / d</strong>'+[x.sub.a,x.sub.b,x.sub.c,x.sub.d].map(v=>fmt(v,4)).join(" / ")+'<br>a点 '+esc(x.sub.a_date)+'</div>'+
    '<div><strong>次级确认形态与隔离</strong>'+esc(x.pattern)+'<br>'+esc(x.filter)+'</div>'+
    '<div><strong>周期与行情</strong>'+esc(pools[state.pool][1])+'<br>'+esc(x.group||"")+' · 日线 '+esc(x.daily_date)+' · 次级 '+esc(date(x.sub_date))+'</div>'+
    '<div><strong>次级判断</strong>c &gt; a：'+(x.sub.higher_low?"是":"否")+' · d &gt; b：'+(x.sub.higher_high?"是":"否")+'<br>近5根最低价：'+fmt(x.sub.support,4)+'</div>'+
    '<div><strong>本级 b/c 收敛度</strong>'+fmt(x.main.score*100,2)+' · 仅排序</div>'+
    '<div><strong>次级 b/c 收敛度</strong>'+fmt(x.sub.score*100,2)+' · 仅展示</div></div></td>';
  tr.after(row);
}
document.querySelectorAll(".market-tab").forEach(x=>x.addEventListener("click",()=>{state.market=x.dataset.market;$("search").value="";render();}));
document.querySelectorAll(".period-tab").forEach(x=>x.addEventListener("click",()=>{state.pool=x.dataset.pool;render();}));
$("search").addEventListener("input",render);
$("refresh").addEventListener("click",load);
$("update").addEventListener("click",()=>$("updateDialog").showModal());
$("openActions").addEventListener("click",()=>{if(state.config)window.open("https://github.com/"+state.config.repository+"/actions/workflows/"+state.config.workflow,"_blank","noopener");});
async function monitorUpdate(token,market,startedAt){
  const repo=state.config.repository,workflow=state.config.workflow,branch=state.config.branch;
  const expected={all:12,ashare:10,us:1,crypto:1}[market];let run=null;
  for(let attempt=0;attempt<720;attempt++){
    if(!run){
      const list=await github("/repos/"+repo+"/actions/workflows/"+workflow+"/runs?event=workflow_dispatch&branch="+encodeURIComponent(branch)+"&per_page=10",token);
      run=list.workflow_runs.find(x=>new Date(x.created_at).getTime()>=startedAt-10000)||null;
      if(!run){showUpdateProgress("等待 GitHub 运行器","任务已提交，正在创建扫描任务。",5);await sleep(5000);continue;}
    }
    const [current,jobsData]=await Promise.all([github("/repos/"+repo+"/actions/runs/"+run.id,token),github("/repos/"+repo+"/actions/runs/"+run.id+"/jobs?per_page=100",token)]);
    const url=current.html_url;run=current;
    const jobs=jobsData.jobs||[],scans=jobs.filter(j=>/^(ashare|us|crypto)/.test(j.name)&&j.conclusion!=="skipped");
    const done=scans.filter(j=>j.status==="completed").length;
    const publish=jobs.find(j=>j.name==="publish"),deploy=jobs.find(j=>j.name==="deploy");
    if(current.status==="completed"){
      if(current.conclusion==="success"){
        showUpdateProgress("数据更新完成","新行情已扫描并发布，正在读取最新结果。",100,"success",url);await load();return;
      }
      showUpdateProgress("数据更新未完成","GitHub 任务状态："+(current.conclusion||"失败")+"。旧快照保持可用。",100,"error",url);return;
    }
    if(deploy?.status==="in_progress")showUpdateProgress("正在发布网页","选股结果已生成，正在部署最新页面。",95,"running",url);
    else if(publish?.status==="in_progress"||publish?.status==="completed")showUpdateProgress("正在合并结果","各市场扫描已完成，正在合并快照。",85,"running",url);
    else {
      const percent=Math.min(80,10+Math.round(done/expected*70));
      const ashare=scans.filter(j=>j.name.startsWith("ashare"));
      const detail=ashare.length?"A股分片 "+ashare.filter(j=>j.status==="completed").length+"/10；其他市场按所选范围执行。":"已完成 "+done+"/"+expected+" 个市场任务。";
      showUpdateProgress("正在扫描行情",detail,percent,"running",url);
    }
    await sleep(10000);
  }
  showUpdateProgress("更新仍在后台运行","等待时间较长，可通过 GitHub 任务页面继续查看。",80,"running",run?.html_url||"");
}
$("runUpdate").addEventListener("click",async()=>{
  const token=$("token").value.trim(),config=state.config,market=$("updateMarket").value;
  if(!token){$("updateMessage").textContent="请输入仅授权该仓库、具备 Actions 写入权限的令牌。";return;}
  if(!config){$("updateMessage").textContent="仓库配置尚未读取。";return;}
  $("runUpdate").disabled=true;$("updateMessage").textContent="正在启动 GitHub Actions…";showUpdateProgress("正在提交更新","正在向 GitHub 提交扫描任务。",2);
  try{
    const startedAt=Date.now();
    const url="https://api.github.com/repos/"+config.repository+"/actions/workflows/"+config.workflow+"/dispatches";
    const r=await fetch(url,{method:"POST",headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({ref:config.branch,inputs:{market}})});
    if(r.status!==204)throw Error("GitHub 返回 "+r.status+"；请检查令牌的仓库和 Actions 权限。");
    $("token").value="";$("updateMessage").textContent="更新已启动，页面下方会持续显示进度。";
    await monitorUpdate(token,market,startedAt);
  }catch(e){$("updateMessage").textContent=e.message;showUpdateProgress("更新失败",e.message,100,"error");}finally{$("runUpdate").disabled=false;}
});
load();
