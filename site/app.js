const state={market:"ashare",pool:"daily",data:{},status:{},config:null};
const $=id=>document.getElementById(id);
const pools={daily:["日池","日线趋势 / 60分钟确认"],weekly:["周池","周线趋势 / 日线确认"],monthly:["月池","月线趋势 / 周线确认"],quarterly:["季池","季线趋势 / 月线确认"]};
const fmt=(v,n=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString("zh-CN",{maximumFractionDigits:n}):"—";
const date=s=>s?String(s).replace("T"," ").slice(0,19):"—";
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function get(path){const r=await fetch(path+"?v="+Date.now(),{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json();}
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
  $("totalCount").textContent=d?Object.values(d.pools).reduce((a,b)=>a+b.count,0):"—";
  $("snapshotTime").textContent=d?"生成于 "+date(d.generated_at)+" UTC":"尚未生成快照";
  $("resultTitle").textContent=pools[p][0]+" · 入选标的";
  $("periodDesc").textContent=pools[p][1];
  $("coverage").textContent=d?"行情至 "+(d.latest_daily_date||"逐只见表")+" · 有日线 "+d.daily_data_count+"/"+d.universe_count+" · 失败 "+d.failed_count:"暂无数据";
  const note=$("notice");note.hidden=true;
  if(s.ok===false){note.hidden=false;note.textContent="最近一次更新失败："+s.error+"。下方若有结果，为此前快照。";}
  else if(d?.failed_count){note.hidden=false;note.textContent="本次有 "+d.failed_count+" 个标的缺少行情或扫描失败；结果仅代表成功覆盖的标的。";}
  const all=d?.pools?.[p]?.items||[],q=$("search").value.trim().toLowerCase();
  const items=all.filter(x=>!q||String(x.symbol).toLowerCase().includes(q)||String(x.name).toLowerCase().includes(q));
  const body=$("rows");body.innerHTML="";
  if(!d){body.innerHTML='<tr><td colspan="7" class="empty">这个市场尚无可用快照。请运行一次更新，并查看更新状态。</td></tr>';return;}
  if(!items.length){body.innerHTML='<tr><td colspan="7" class="empty">'+(q?"没有匹配的入选标的":"当前周期没有入选标的")+"</td></tr>";return;}
  for(const x of items){
    const tr=document.createElement("tr");tr.dataset.symbol=x.symbol;tr.tabIndex=0;tr.setAttribute("aria-label","查看 "+x.name+" "+x.symbol+" 的入选依据");
    tr.innerHTML='<td><span class="asset-name">'+esc(x.name)+'</span><span class="asset-code">'+esc(x.symbol)+(x.rank?" · 市值 #"+x.rank:"")+'</span></td><td>'+fmt(x.close,4)+'</td><td class="score">'+fmt(x.main.score*100,2)+'<small>a点 '+esc(x.main.a_date)+'</small></td><td class="score">'+fmt(x.sub.score*100,2)+'<small>'+esc(date(x.sub_date))+'</small></td><td><span class="chip">'+esc(x.pattern)+'</span></td><td>'+esc(x.daily_date)+'</td><td>⌄</td>';
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
    '<div><strong>确认与隔离</strong>'+esc(x.pattern)+'<br>'+esc(x.filter)+'</div>'+
    '<div><strong>周期与行情</strong>'+esc(pools[state.pool][1])+'<br>'+esc(x.group||"")+' · 日线 '+esc(x.daily_date)+' · 次级 '+esc(date(x.sub_date))+'</div>'+
    '<div><strong>次级判断</strong>c &gt; a：'+(x.sub.higher_low?"是":"否")+' · d &gt; b：'+(x.sub.higher_high?"是":"否")+'<br>近5根最低价：'+fmt(x.sub.support,4)+'</div>'+
    '<div><strong>本级分数</strong>'+fmt(x.main.score*100,2)+' · 仅排序</div>'+
    '<div><strong>次级分数</strong>'+fmt(x.sub.score*100,2)+' · 仅展示</div></div></td>';
  tr.after(row);
}
document.querySelectorAll(".market-tab").forEach(x=>x.addEventListener("click",()=>{state.market=x.dataset.market;$("search").value="";render();}));
document.querySelectorAll(".period-tab").forEach(x=>x.addEventListener("click",()=>{state.pool=x.dataset.pool;render();}));
$("search").addEventListener("input",render);
$("refresh").addEventListener("click",load);
$("update").addEventListener("click",()=>$("updateDialog").showModal());
$("openActions").addEventListener("click",()=>{if(state.config)window.open("https://github.com/"+state.config.repository+"/actions/workflows/"+state.config.workflow,"_blank","noopener");});
$("runUpdate").addEventListener("click",async()=>{
  const token=$("token").value.trim(),config=state.config,market=$("updateMarket").value;
  if(!token){$("updateMessage").textContent="请输入仅授权该仓库、具备 Actions 写入权限的令牌。";return;}
  if(!config){$("updateMessage").textContent="仓库配置尚未读取。";return;}
  $("runUpdate").disabled=true;$("updateMessage").textContent="正在启动 GitHub Actions…";
  try{
    const url="https://api.github.com/repos/"+config.repository+"/actions/workflows/"+config.workflow+"/dispatches";
    const r=await fetch(url,{method:"POST",headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({ref:config.branch,inputs:{market}})});
    if(r.status!==204)throw Error("GitHub 返回 "+r.status+"；请检查令牌的仓库和 Actions 权限。");
    $("token").value="";$("updateMessage").textContent="更新已启动。后台完成并发布后，页面会自动读取新快照。";
    const targets=market==="all"?["ashare","us","crypto"]:[market];
    const before=Object.fromEntries(targets.map(k=>[k,state.data[k]?.generated_at]));
    let count=0;
    const poll=setInterval(async()=>{
      await load();count++;
      if(targets.every(k=>state.data[k]?.generated_at&&state.data[k].generated_at!==before[k])||count>=960)clearInterval(poll);
    },15000);
  }catch(e){$("updateMessage").textContent=e.message;}finally{$("runUpdate").disabled=false;}
});
load();
