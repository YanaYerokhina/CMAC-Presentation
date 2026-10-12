/* ===================== CMAC LIBRARY — keep as-is, write slide code below ===================== */
var CMAC=(function(){"use strict";
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return [].slice.call((r||document).querySelectorAll(s))};
var g=function(id){return typeof id==="string"?document.getElementById(id):id};
var C={deep:"#22383A",slate:"#445B5D",sage:"#7C9194",mist:"#A5B9BE",paper:"#F9F7F3",sand:"#F1EDE5",stone:"#D0CBC2",ink:"#171615",
 olive1:"#D4D39A",olive2:"#AAAA6B",olive3:"#6F6E34",olive4:"#494812",amber1:"#FFCD83",amber2:"#F3A44A",amber3:"#9B5314",amber4:"#5A2E07"};
/* Studio: the palette follows the theme's CSS tokens, so a theme change recolors charts too */
var VARS={deep:"deep",slate:"slate",sage:"sage",mist:"mist",paper:"paper",sand:"sand",stone:"stone",ink:"ink",olive1:"olive-1",olive2:"olive-2",olive3:"olive-3",olive4:"olive-4",amber1:"amber-1",amber2:"amber-2",amber3:"amber-3",amber4:"amber-4"};
function syncColors(){try{var cs=getComputedStyle(document.documentElement);Object.keys(VARS).forEach(function(k){var v=cs.getPropertyValue("--"+VARS[k]).trim();if(v)C[k]=v})}catch(e){}
C.pos=C.olive3;C.neg=C.amber3;
C.cat=[C.deep,C.sage,C.olive2,C.amber3,C.mist,C.amber2,C.olive3,C.slate];         /* categorical order */
C.div=[C.amber4,C.amber3,C.amber2,C.stone,C.olive2,C.olive3,C.olive4];            /* negative → neutral → positive */
C.seqBlue=[C.mist,C.sage,C.slate,C.deep];C.seqOlive=[C.olive1,C.olive2,C.olive3,C.olive4];C.seqAmber=[C.amber1,C.amber2,C.amber3,C.amber4]}
syncColors();
var M="−";
var fmt={
 usd:function(n,d){d=d||0;if(Math.abs(n)<.5&&!d)n=0;return (n<0?M+"$":"$")+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})},
 usdM:function(n,d){var a=Math.abs(n),s;if(a>=1e9)s=(a/1e9).toFixed(d==null?2:d)+"B";else if(a>=1e6)s=(a/1e6).toFixed(d==null?2:d)+"MM";else if(a>=1e3)s=Math.round(a/1e3)+"K";else s=Math.round(a)+"";return (n<0?M+"$":"$")+s},
 pct:function(n,d){return (n<0?M:"")+(Math.abs(n)*100).toFixed(d==null?1:d)+"%"},
 num:function(n,d){d=d||0;return (n<0?M:"")+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})},
 bps:function(n){return (n>0?"+":n<0?M:"")+Math.abs(Math.round(n))+" bps"},
 paren:function(n){return n<0?"("+fmt.usd(-n)+")":fmt.usd(n)}};
var scale=1,idx=0,slides=[],deck,hooks={};
function fit(){var W=document.documentElement.clientWidth,H=document.documentElement.clientHeight,s=Math.min((W-24)/1920,(H-70)/1080);
 scale=Math.max(.15,Math.min(s,1));deck.style.transform="scale("+scale+")";deck.style.marginBottom=(1080*(scale-1))+"px";deck.style.marginLeft=deck.style.marginRight=(1920*(scale-1)/2)+"px"}
function render(){slides.forEach(function(s,i){s.classList.toggle("active",i===idx)});$$("#dots .nd").forEach(function(d,i){d.classList.toggle("on",i===idx)});
 g("counter").textContent=String(idx+1).padStart(2,"0")+" / "+String(slides.length).padStart(2,"0");try{history.replaceState(null,"","#s"+(idx+1))}catch(e){}
 tip.hide();var h=hooks[slides[idx].id];if(h)h()}
function go(i){idx=Math.max(0,Math.min(slides.length-1,i));render()}
var inited=false;
function init(){if(inited)return;inited=true;deck=g("deck");slides=$$(".slide",deck);var meta=document.body.getAttribute("data-meta")||"CMAC Partners";
 slides.forEach(function(s){if(s.classList.contains("bare"))return;
  var t=document.createElement("div");t.className="chrome";t.innerHTML='<span class="eb">'+(s.getAttribute("data-eyebrow")||"")+'</span><span class="no">'+(s.getAttribute("data-no")||"")+"</span>";
  var b=document.createElement("div");b.className="chrome-b";b.innerHTML='<svg class="sym" viewBox="0 0 99 129"><use href="#cmac-symbol"/></svg><span class="meta">'+meta+"</span>";
  s.insertBefore(t,s.firstChild);s.appendChild(b)});
 var dw=g("dots");slides.forEach(function(s,i){var d=document.createElement("button");d.className="nd";d.title=s.getAttribute("data-title")||("Slide "+(i+1));d.setAttribute("aria-label",d.title);d.onclick=function(){go(i)};dw.appendChild(d)});
 g("next").onclick=function(){go(idx+1)};g("prev").onclick=function(){go(idx-1)};
 document.addEventListener("keydown",function(e){var tg=e.target&&e.target.tagName;if(tg==="INPUT"||tg==="TEXTAREA"||tg==="SELECT"||(e.target&&e.target.isContentEditable)||document.documentElement.classList.contains("cm-editing"))return;
  if(e.key==="ArrowRight"||e.key==="PageDown"||e.key===" "){e.preventDefault();go(idx+1)}else if(e.key==="ArrowLeft"||e.key==="PageUp")go(idx-1);else if(e.key==="Home")go(0);else if(e.key==="End")go(slides.length-1)});
 addEventListener("resize",fit);fit();var hm=/^#s(\d+)$/.exec(location.hash||"");if(hm)idx=Math.min(slides.length-1,Math.max(0,parseInt(hm[1],10)-1));
 if(window.CM_START!=null)idx=Math.min(slides.length-1,Math.max(0,window.CM_START));if(!slides.length)return;render()}
/* tooltip: tip.show(el, {key, color, value, sub}) */
var tip={el:null,show:function(el,o){if(!this.el){this.el=document.createElement("div");this.el.className="tip";deck.appendChild(this.el)}
 this.el.innerHTML=(o.key?'<div class="tk2">'+(o.color?'<s style="background:'+o.color+'"></s>':"")+o.key+"</div>":"")+'<div class="tv">'+o.value+"</div>"+(o.sub?'<div class="ts">'+o.sub+"</div>":"");
 var r=el.getBoundingClientRect(),d=deck.getBoundingClientRect();this.el.style.left=((r.left+r.width/2-d.left)/scale)+"px";this.el.style.top=((r.top-d.top)/scale)+"px";this.el.classList.add("on")},
 hide:function(){if(this.el)this.el.classList.remove("on")}};
/* tabs(container, cb(i), init) — container holds .tb buttons */
function tabs(id,cb,init){var bs=$$(".tb",g(id));function set(k){if(bs[k].classList.contains("dis"))return;bs.forEach(function(b,j){b.classList.toggle("on",j===k)});cb(k)}
 bs.forEach(function(b,k){b.onclick=function(){set(k)}});set(init||0);return {set:set,buttons:bs}}
/* views(tabsId, [viewId,...]) — tabs that switch .view panels */
function views(id,ids){return tabs(id,function(k){ids.forEach(function(v,j){g(v).classList.toggle("on",j===k)})})}
/* hbars(el, rows, {max}) — horizontal stacked bars. row:{label, sub, value, valueClass, segs:[{v,color,key,sub}]} */
function hbars(id,rows,o){o=o||{};var el=g(id),max=o.max||Math.max.apply(null,rows.map(function(r){return r.segs.reduce(function(a,s){return a+s.v},0)}))||1;
 if(el.children.length!==rows.length){el.innerHTML=rows.map(function(r){return '<div class="hb-r"><div class="nm"></div><div class="hb-t">'+r.segs.map(function(){return "<i></i>"}).join("")+'</div><div class="v"></div></div>'}).join("")}
 rows.forEach(function(r,i){var row=el.children[i],run=0;row.querySelector(".nm").innerHTML=r.label+(r.sub?"<small>"+r.sub+"</small>":"");
  var v=row.querySelector(".v");v.innerHTML=r.value||"";v.className="v "+(r.valueClass||"");
  $$("i",row).forEach(function(b,j){var s=r.segs[j]||{v:0};b.style.left=(run/max*100)+"%";b.style.width=(s.v/max*100)+"%";b.style.background=s.color||C.cat[j];run+=s.v;
   b.onmouseenter=function(){if(s.v&&s.key)tip.show(b,{key:s.key,color:s.color,value:o.fmt?o.fmt(s.v):fmt.usd(s.v),sub:s.sub})};b.onmouseleave=function(){tip.hide()}})})}
/* columns(el, data, {height, selected, onSelect, fmt, color}) — data:[{label, v, display}] */
function columns(id,data,o){o=o||{};var el=g(id),H=el.clientHeight||parseFloat(el.style.height)||o.height||500,PB=54,PT=44,max=o.max||Math.max.apply(null,data.map(function(d){return d.v}))||1,n=data.length,w=100/n;
 var h='<div class="base" style="bottom:'+PB+'px"></div>';data.forEach(function(d,i){var bh=Math.max(4,d.v/max*(H-PB-PT));
  h+='<div class="col'+(i===o.selected?" sel":"")+'" data-i="'+i+'" style="left:calc('+(i*w)+'% + 10px);width:calc('+w+'% - 20px);bottom:'+PB+'px"><div class="pv">'+(d.display!=null?d.display:(o.fmt?o.fmt(d.v):d.v))+'</div><div class="bar" style="height:'+bh+'px'+(o.color?";background:"+o.color:"")+'"></div></div><div class="xl" style="left:'+(i*w)+'%;width:'+w+'%;bottom:18px">'+d.label+"</div>"});
 el.innerHTML=h;$$(".col",el).forEach(function(c){c.onclick=function(){if(o.onSelect)o.onSelect(+c.getAttribute("data-i"))}})}
/* waterfall(el, segs) — seg:{label, sub, v, type:'abs'|'delta'|'total', color} */
function waterfall(id,segs){var box=g(id),H=box.clientHeight||parseFloat(box.style.height)||460,LB=88,PT=44,run=0,geo=[],amts=[];box.innerHTML='<div class="z"></div>';
 segs.forEach(function(s){var lo,hi;if(s.type==="abs"){lo=0;hi=s.v;run=s.v;amts.push(s.v)}else if(s.type==="total"){lo=Math.min(0,run);hi=Math.max(0,run);amts.push(run)}else{var a=run,b=run+s.v;run=b;lo=Math.min(a,b);hi=Math.max(a,b);amts.push(s.v)}geo.push([lo,hi])});
 var lo=0,hi=0;geo.forEach(function(s){lo=Math.min(lo,s[0]);hi=Math.max(hi,s[1])});var k=(H-LB-PT-30)/Math.max(hi-lo,1),Y=function(v){return LB+(v-lo)*k};
 box.querySelector(".z").style.bottom=Y(0)+"px";var n=segs.length,cw=100/n,prev=null;run=0;
 segs.forEach(function(s,i){var col=s.color||(s.type==="total"?C.deep:(s.type==="abs"?C.slate:(s.v<0?C.sage:C.olive3)));
  var b=document.createElement("div");b.className="b";b.style.cssText="left:"+(i*cw+cw*.2)+"%;width:"+(cw*.6)+"%;bottom:"+Y(geo[i][0])+"px;height:"+Math.max(3,Y(geo[i][1])-Y(geo[i][0]))+"px;background:"+col;box.appendChild(b);
  var v=document.createElement("div");v.className="v";var neg=amts[i]<0;v.style.cssText="left:"+(i*cw)+"%;width:"+cw+"%;bottom:"+(neg?Y(geo[i][0])-30:Y(geo[i][1])+8)+"px;color:"+(neg?C.slate:(s.type==="total"?C.deep:C.ink));v.textContent=fmt.usd(amts[i]);box.appendChild(v);
  var l=document.createElement("div");l.className="xl";l.style.cssText="left:"+(i*cw)+"%;width:"+cw+"%;bottom:0;height:"+(LB-14)+"px";l.innerHTML="<b>"+s.label+"</b>"+(s.sub||"");box.appendChild(l);
  if(s.type==="abs")run=s.v;else if(s.type!=="total")run+=s.v;
  if(prev!==null&&s.type!=="abs"){var c=document.createElement("div");c.className="c";c.style.cssText="left:"+((i-1)*cw+cw*.2)+"%;width:"+cw+"%;bottom:"+Y(prev)+"px";box.appendChild(c)}prev=run})}
/* matrix(el, {rows, cols, values, fmt, sel:[r,c], onSelect, corner}) — diverging tint by sign */
function matrix(id,o){var el=g(id),f=o.fmt||fmt.paren,mx=0;o.values.forEach(function(r){r.forEach(function(v){mx=Math.max(mx,Math.abs(v))})});
 el.style.gridTemplateColumns="240px repeat("+o.cols.length+",minmax(0,1fr))";
 var h='<div class="l h">'+(o.corner||"")+"</div>"+o.cols.map(function(c){return '<div class="h">'+c+"</div>"}).join("");
 o.rows.forEach(function(rl,i){h+='<div class="l">'+rl+"</div>"+o.values[i].map(function(v,j){var a=mx?Math.abs(v)/mx*.28:0,bg=v<0?"rgba(155,83,20,"+a+")":(v>0?"rgba(111,110,52,"+a+")":"transparent");
  var on=o.sel&&o.sel[0]===i&&o.sel[1]===j;return '<div class="c'+(on?" sel":"")+'" data-r="'+i+'" data-c="'+j+'" style="background:'+bg+";color:"+(v<0?C.neg:(v>0?C.pos:C.slate))+'">'+f(v)+"</div>"}).join("")});
 el.innerHTML=h;$$(".c",el).forEach(function(c){c.onclick=function(){o.sel=[+c.getAttribute("data-r"),+c.getAttribute("data-c")];matrix(id,o);if(o.onSelect)o.onSelect(o.sel[0],o.sel[1])}})}
/* donut(el, {data:[{label,v,color}], size, center, fmt}) */
function donut(id,o){var el=g(id),S=o.size||440,R=S/2,r=R*.62,tot=o.data.reduce(function(a,d){return a+d.v},0),a0=-Math.PI/2,f=o.fmt||function(v){return fmt.pct(v/tot,1)};
 var P=function(a,rad){return [R+rad*Math.cos(a),R+rad*Math.sin(a)]};
 var s='<svg width="'+S+'" height="'+S+'" viewBox="0 0 '+S+" "+S+'">';o.data.forEach(function(d,i){var a1=a0+d.v/tot*Math.PI*2,lg=(a1-a0)>Math.PI?1:0,p1=P(a0,R),p2=P(a1,R),p3=P(a1,r),p4=P(a0,r);
  s+='<path data-i="'+i+'" fill="'+(d.color||C.cat[i])+'" stroke="'+C.paper+'" stroke-width="3" d="M'+p1+"A"+R+","+R+" 0 "+lg+" 1 "+p2+"L"+p3+"A"+r+","+r+" 0 "+lg+" 0 "+p4+'Z"/>';a0=a1});
 if(o.center)s+='<text class="ctr" x="'+R+'" y="'+(R+18)+'" text-anchor="middle" font-size="56">'+o.center+"</text>";s+="</svg>";
 el.innerHTML=s+'<div class="lg">'+o.data.map(function(d,i){return '<div><i style="background:'+(d.color||C.cat[i])+'"></i><span>'+d.label+"</span><b>"+f(d.v)+"</b></div>"}).join("")+"</div>";
 $$("path",el).forEach(function(p){var d=o.data[+p.getAttribute("data-i")];p.onmouseenter=function(){tip.show(p,{key:d.label,color:d.color||C.cat[+p.getAttribute("data-i")],value:f(d.v),sub:d.sub})};p.onmouseleave=function(){tip.hide()}})}
/* onShow(slideId, fn) — run fn whenever that slide becomes active (for re-measuring charts) */
function onShow(id,fn){hooks[id]=fn}
/* Chart.js brand defaults, if you load Chart.js from cdnjs */
function chartjs(Chart){Chart.defaults.font.family="'Season Sans','Manrope',system-ui,sans-serif";Chart.defaults.font.size=18;Chart.defaults.color=C.slate;Chart.defaults.borderColor=C.stone;
 Chart.defaults.plugins.legend.labels.boxWidth=14;Chart.defaults.plugins.tooltip.backgroundColor=C.deep;Chart.defaults.plugins.tooltip.titleColor=C.mist;Chart.defaults.elements.bar.borderRadius=0;Chart.defaults.elements.line.borderWidth=2.5;Chart.defaults.elements.point.radius=0}
return {C:C,syncColors:syncColors,current:function(){return idx},count:function(){return slides.length},fit:function(){if(deck)fit()},fmt:fmt,init:init,go:go,tabs:tabs,views:views,hbars:hbars,columns:columns,waterfall:waterfall,matrix:matrix,donut:donut,tip:tip,onShow:onShow,chartjs:chartjs,$:$,$$:$$,g:g}})();
