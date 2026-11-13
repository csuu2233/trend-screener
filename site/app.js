const state={market:"ashare",pool:"daily",category:"trend",strategy:"multi_structure_trend",data:{},status:{},config:null};
const definitions={multi_structure_trend:["股道多周期结构趋势","trend","本级趋势、次级趋势与形态确认"],long_ma_filter:["长周期均线过滤","trend","日线SMA200与月线SMA10同时通过"],dual_ma_cross:["双均线交叉","trend","近期SMA50上穿SMA200"],absolute_momentum_12m:["12个月绝对动量","trend","完整月度回报率大于零"],bollinger_rebound:["布林带超卖反弹","reversion","跌破下轨后重新站上"],rsi2_mean_reversion:["RSI-2 短期均值回归","reversion","长期趋势中出现短期超卖"]};
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
function generatedTimes(value){const ms=Date.parse(value);if(!Number.isFinite(ms))return "生成时间未知";const show=offset=>new Date(ms+offset*3600000).toISOString().slice(0,16).replace("T"," ");return `生成于 美国 UTC−5 ${show(-5)} · UTC ${show(0)} · 中国 UTC+8 ${show(8)}`;}
function tradePlan(x,key,pool){const m=x.metrics||{},px=fmt(x.close,4),period=pool?({hourly:"60分钟",daily:"日线",weekly:"周线",monthly:"月线"}[pool]||"本级"):"日线";
  switch(key){
    case "multi_structure_trend":return {why:`本级 c>a、d>b，次级结构通过并出现${x.pattern}。`,entry:`等待下一根完整${period}K线收盘高于本级 d=${fmt(x.main?.d,4)}，且次级确认仍有效。`,invalid:`本级收盘跌破近5根低点 ${fmt(x.main?.support,4)}，或次级确认失效。`,exit:"持仓后观察本级结构破坏；具体止盈规则需另行设定。"};
    case "long_ma_filter":return {why:`收盘 ${px} 高于日线SMA200 ${fmt(m.sma200,4)}，完整月收盘高于月线SMA10。`,entry:"均线过滤只是候选条件；等待新的价格触发信号或回踩企稳，当前策略未定义可计算入场价。",invalid:"日线收盘跌回SMA200下方，或完整月收盘跌回SMA10下方。",exit:"持仓后按均线过滤条件复核；具体止盈规则需另行设定。"};
    case "dual_ma_cross":return {why:`SMA50 ${fmt(m.sma50,4)} 上穿SMA200 ${fmt(m.sma200,4)}，交叉日 ${x.signal_date}。`,entry:`等待下一完整日线继续收于SMA50 ${fmt(m.sma50,4)} 及SMA200之上。`,invalid:"SMA50重新跌回SMA200下方。",exit:"持仓后观察死叉或既定风控条件；具体止盈规则需另行设定。"};
    case "absolute_momentum_12m":return {why:`最近12个完整月回报率 ${fmt((m.return_12m||0)*100,2)}%，高于0%阈值。`,entry:"月末动量为候选过滤；等待下一交易期的独立价格确认，当前策略未定义可计算入场价。",invalid:"下一完整月的12个月回报率降至0%或以下。",exit:"按完整月度动量复核；具体止盈规则需另行设定。"};
    case "bollinger_rebound":return {why:`前根收盘跌破下轨，本根重新站上${period}下轨 ${fmt(m.lower,4)}；日线趋势过滤通过。`,entry:`观察下一完整${period}K线能否继续收于下轨 ${fmt(m.lower,4)} 之上；届时以下轨最新值复核。`,invalid:"下一完整K线再次收于下轨以下，或日线趋势过滤失效。",exit:`观察回到中轨 ${fmt(m.middle,4)} 或满10根本级K线；以下期指标更新值为准。`};
    case "rsi2_mean_reversion":return {why:`${period} RSI(2)=${fmt(m.rsi2,2)}，低于5；日线SMA200趋势过滤通过。`,entry:`等待下一完整${period}K线 RSI(2) 回升至5或以上，同时日线趋势过滤仍通过。`,invalid:"日线收盘跌破SMA200，或反弹确认未出现。",exit:`观察本级收盘高于SMA5 ${fmt(m.sma5,4)}、RSI(2)>70，或满10根本级K线。`};
    default:return {why:"已符合筛选条件。",entry:"等待下一根完整K线确认。",invalid:"筛选条件不再成立。",exit:"按策略条件复核。"};
  }
}
function planHtml(x,key,pool){const p=tradePlan(x,key,pool);return '<section class="trade-plan" aria-label="交易计划卡"><div class="plan-heading"><strong>交易计划卡</strong><span>等待入场确认 · 尚无持仓记录</span></div><div class="plan-grid">'+[['入选原因',p.why],['入场观察',p.entry],['放弃／失效',p.invalid],['退出观察',p.exit]].map(([label,body])=>'<div><strong>'+esc(label)+'</strong><p>'+esc(body)+'</p></div>').join('')+'</div><small>依据已完成K线生成；指标与价格会变化。此卡是规则观察计划，未记录真实成交或持仓。</small></section>';}
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
  document.querySelectorAll(".category-tab").forEach(x=>x.classList.toggle("active",x.dataset.category===state.category));
  $("strategyCards").innerHTML=Object.entries(definitions).filter(([,v])=>v[1]===state.category).map(([key,v])=>'<button type="button" class="strategy-card '+(key===state.strategy?'active':'')+'" data-strategy="'+key+'"><strong>'+v[0]+'</strong><small>'+v[2]+'</small><span>'+(key==="multi_structure_trend"?Object.values(d?.pools||{}).reduce((n,x)=>n+x.count,0):d?.strategies?.[key]?.count??"—")+' 入选</span></button>').join("");
  document.querySelectorAll(".strategy-card").forEach(x=>x.addEventListener("click",()=>{state.strategy=x.dataset.strategy;$("search").value="";render();}));
  const isStructure=state.strategy==="multi_structure_trend";
  $("periodRow").hidden=!(isStructure||state.category==="reversion");
  if(!isStructure){renderStrategy();return;}
  document.querySelector("thead tr").innerHTML="<th>标的</th><th>最新收盘</th><th>本级 b/c 收敛度</th><th>次级 b/c 收敛度</th><th>次级确认形态</th><th>行情日期</th><th></th>";
  document.querySelectorAll(".market-tab").forEach(x=>{let on=x.dataset.market===m;x.classList.toggle("active",on);x.setAttribute("aria-selected",on);});
  document.querySelectorAll(".period-tab").forEach(x=>{x.classList.toggle("active",x.dataset.pool===p);x.querySelector("b").textContent=d?.pools?.[x.dataset.pool]?.count??"—";});
  $("sourceText").textContent=d?.source||"等待市场快照";
  $("totalCount").textContent=d?Object.keys(poolMarks).reduce((sum,key)=>sum+(d.pools?.[key]?.count||0),0):"—";
  $("snapshotTime").textContent=d?generatedTimes(d.generated_at):"尚未生成快照";
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
    '<div><strong>次级 b/c 收敛度</strong>'+fmt(x.sub.score*100,2)+' · 仅展示</div></div>'+planHtml(x,"multi_structure_trend",state.pool)+chartsHtml(x.chart)+'</td>';
  tr.after(row);
}
function chartsHtml(charts){if(!charts)return '<p>当前快照没有K线数据，更新后可查看。</p>';return '<div class="chart-grid">'+Object.entries(charts).filter(([,v])=>v?.length).map(([key,bars])=>'<div class="chart-card"><strong>'+({upper:"上级背景",main:"本级结构",sub:"次级确认",daily:"日线与指标",monthly:"完整月线"}[key]||key)+'</strong>'+candleSvg(bars)+'</div>').join('')+'</div>';}
function candleSvg(bars){const w=440,h=170,pad=14,prices=bars.flatMap(x=>[x.high,x.low,...Object.entries(x).filter(([k,v])=>!['date','open','high','low','close','RSI2'].includes(k)&&typeof v==='number').map(([,v])=>v)]),lo=Math.min(...prices),hi=Math.max(...prices),span=hi-lo||1,step=(w-2*pad)/bars.length,y=v=>h-pad-(v-lo)/span*(h-2*pad);let body=bars.map((b,i)=>{const x=pad+(i+.5)*step,c=b.close>=b.open?'#268d75':'#c94d4d';return '<g><title>'+esc(b.date)+' O '+fmt(b.open,3)+' H '+fmt(b.high,3)+' L '+fmt(b.low,3)+' C '+fmt(b.close,3)+'</title><line x1="'+x+'" y1="'+y(b.high)+'" x2="'+x+'" y2="'+y(b.low)+'" stroke="'+c+'"/><rect x="'+(x-Math.max(2,step*.3))+'" y="'+Math.min(y(b.open),y(b.close))+'" width="'+Math.max(4,step*.6)+'" height="'+Math.max(1,Math.abs(y(b.open)-y(b.close)))+'" fill="'+c+'"/></g>'}).join('');let names=Object.keys(bars.at(-1)).filter(k=>!['date','open','high','low','close','RSI2'].includes(k));names.forEach((name,j)=>{let points=bars.map((b,i)=>typeof b[name]==='number'?(pad+(i+.5)*step)+','+y(b[name]):null).filter(Boolean);body+='<polyline points="'+points.join(' ')+'" fill="none" stroke="'+['#d4a017','#6c74ba','#3f8bba','#af6a91'][j%4]+'" stroke-width="1.5"/>'});return '<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="最近'+bars.length+'根K线">'+body+'</svg><small>'+esc(bars[0].date.slice(0,10))+' — '+esc(bars.at(-1).date.slice(0,10))+' · '+names.map(esc).join(' / ')+'</small>';}
function renderStrategy(){const m=state.market,d=state.data[m],s=state.status[m]||{},key=state.strategy,info=definitions[key],reversion=state.category==="reversion",entry=d?.strategies?.[key],all=reversion?(entry?.pools?.[state.pool]?.items||[]):(entry?.items||[]),q=$("search").value.trim().toLowerCase(),items=all.filter(x=>!q||String(x.symbol).toLowerCase().includes(q)||String(x.name).toLowerCase().includes(q));
 document.querySelectorAll(".period-tab").forEach(x=>{x.classList.toggle("active",x.dataset.pool===state.pool);x.querySelector("b").textContent=reversion?(entry?.pools?.[x.dataset.pool]?.count??"—"):"—"});
 document.querySelectorAll(".market-tab").forEach(x=>{let on=x.dataset.market===m;x.classList.toggle("active",on);x.setAttribute("aria-selected",on)});
 $("sourceText").textContent=d?.source||"等待市场快照";$("totalCount").textContent=reversion?(entry?.pools?.[state.pool]?.count??"—"):(entry?.count??"—");$("snapshotTime").textContent=d?generatedTimes(d.generated_at):"尚未生成快照";$("resultTitle").textContent=(reversion?pools[state.pool][0]+" · ":"")+info[0]+" · 入选标的";$("periodDesc").textContent=info[2]+(reversion?" · 本级为"+pools[state.pool][0]+"，日线SMA200作趋势过滤":"");$("coverage").textContent=d?"行情至 "+d.latest_daily_date+" · 有日线 "+d.daily_data_count+"/"+d.universe_count+" · 失败 "+d.failed_count:"暂无数据";
 const note=$("notice");note.hidden=!(s.ok===false||d?.failed_count);if(!note.hidden)note.textContent=s.ok===false?"最近一次更新失败："+s.error+"。显示此前快照。":"本次有 "+d.failed_count+" 个标的缺少行情或扫描失败。";
 document.querySelector("thead tr").innerHTML="<th>标的</th><th>最新收盘</th><th>信号日期</th><th>关键指标</th><th>判定条件</th><th>行情日期</th><th></th>";
 $("rows").innerHTML=items.length?"":'<tr><td colspan="7" class="empty">'+(d?(q?"没有匹配的入选标的":entry&&!reversion||entry?.pools?"当前周期没有符合入选条件的标的":"当前快照尚未生成此周期结果，请更新数据"):"此市场暂无快照")+'</td></tr>';
 for(const x of items){const metrics=Object.entries(x.metrics||{}),tr=document.createElement("tr");tr.tabIndex=0;tr.innerHTML='<td><span class="asset-name">'+esc(x.name)+'</span><span class="asset-code">'+esc(x.symbol)+'</span></td><td>'+fmt(x.close,4)+'</td><td>'+esc(x.signal_date)+'</td><td>'+metrics.slice(0,2).map(([k,v])=>esc(k)+': '+fmt(v,4)).join('<br>')+'</td><td>'+esc((x.rule_checks||[]).join(' · '))+'</td><td>'+esc(x.as_of)+'</td><td>⌄</td>';tr.addEventListener("click",()=>toggleStrategyDetails(tr,x));tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleStrategyDetails(tr,x)}});$("rows").appendChild(tr)}
}
function toggleStrategyDetails(tr,x){const next=tr.nextElementSibling;if(next?.classList.contains("details")){next.remove();return}document.querySelectorAll(".details").forEach(el=>el.remove());const row=document.createElement("tr");row.className="details";row.innerHTML='<td colspan="7">'+planHtml(x,state.strategy,state.category==="reversion"?state.pool:null)+'<div class="detail-grid"><div><strong>原始判定</strong>'+(x.rule_checks||[]).map(esc).join('<br>')+'</div><div><strong>实际指标</strong>'+Object.entries(x.metrics||{}).map(([k,v])=>esc(k)+': '+fmt(v,5)).join('<br>')+'</div><div><strong>信号与版本</strong>'+esc(x.signal_date)+' · v'+esc(x.strategy_version)+'</div></div>'+chartsHtml(x.chart)+'</td>';tr.after(row)}
document.querySelectorAll(".category-tab").forEach(x=>x.addEventListener("click",()=>{state.category=x.dataset.category;state.strategy=x.dataset.category==="trend"?"multi_structure_trend":"bollinger_rebound";render()}));
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
