// Página de revisión servida solo por loopback. Sin dependencias externas ni
// recursos remotos: el proyecto es offline por diseño y la CSP lo refleja.
// El script de la página evita acentos graves para no chocar con esta plantilla.
export function reviewPage() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisión de montaje</title>
<style>
:root{--bg:#101116;--fg:#F4F4F0;--accent:#C6FF6B;--muted:#858792;--line:#2a2c36;--bad:#FF8F6B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
.wrap{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:28px;padding:24px;max-width:1180px;margin:0 auto}
@media (max-width:820px){.wrap{grid-template-columns:1fr}}
video{width:100%;border-radius:12px;background:#000;display:block}
h1{font-size:19px;margin:0 0 4px;letter-spacing:-.3px}
h2{font-size:12px;letter-spacing:2.5px;color:var(--muted);text-transform:uppercase;margin:26px 0 10px;font-weight:600}
.meta{color:var(--muted);font-size:12px;margin-bottom:16px}
.seg,.cap{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:7px;padding:9px 12px;margin-bottom:7px;cursor:pointer;background:#16171e}
.seg:hover,.cap:hover{border-color:var(--accent)}
.seg.on,.cap.on{background:#1e2129;border-color:var(--accent)}
.t{color:var(--accent);font-variant-numeric:tabular-nums;font-size:12px;margin-right:9px}
.why{color:var(--muted);font-size:13px}
.bar{position:relative;height:30px;background:#16171e;border:1px solid var(--line);border-radius:7px;overflow:hidden;margin:12px 0 14px;cursor:pointer}
.bar i{position:absolute;top:0;bottom:0;background:#2b3a1c;border-right:1px solid var(--accent)}
.bar u{position:absolute;top:0;bottom:0;width:2px;background:var(--fg);text-decoration:none}
.ov{position:absolute;bottom:0;height:6px;background:#AD9FFF}
label.chk{display:block;padding:5px 0;cursor:pointer;font-size:14px}
textarea{width:100%;min-height:92px;background:#16171e;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:10px;font:inherit;resize:vertical}
button{font:inherit;font-weight:600;border:0;border-radius:7px;padding:11px 20px;cursor:pointer;margin-right:9px}
#acc{background:var(--accent);color:#101116}
#rej{background:#3a2420;color:var(--bad)}
button:disabled{opacity:.45;cursor:not-allowed}
#out{margin-top:14px;font-size:14px;min-height:22px}
.warn{color:var(--muted);font-size:12px;border-left:2px solid var(--line);padding-left:10px;margin-top:18px}
code{color:var(--fg)}
</style>
</head>
<body>
<div class="wrap">
  <div>
    <video id="v" controls preload="metadata" src="video.mp4"></video>
    <div class="bar" id="bar"></div>
    <div class="meta" id="meta">Cargando…</div>
  </div>
  <div>
    <h1>Revisión de montaje</h1>
    <div class="meta">Míralo entero antes de decidir. Aprobar aquí no convierte los tiempos en alineación humana.</div>

    <h2>Cortes</h2>
    <div id="segs"></div>

    <h2>Subtítulos</h2>
    <div id="caps"></div>

    <h2>Qué falla</h2>
    <div id="issues"></div>

    <h2>Notas</h2>
    <textarea id="notes" placeholder="Qué has visto y oído. Mínimo 5 caracteres."></textarea>
    <label class="chk"><input type="checkbox" id="timing"> Los tiempos me parecen bien (timingApproval)</label>

    <div style="margin-top:16px">
      <button id="acc">Aprobar</button>
      <button id="rej">Rechazar</button>
    </div>
    <div id="out"></div>
    <div class="warn">El veredicto se sella junto al hash del plan y del vídeo que estás viendo, en <code>.local/reviews/</code>. No modifica el plan ni el transcript revisado: sus hashes ya están encadenados.</div>
  </div>
</div>
<script>
var ISSUES=[["cutTiming","Cortes mal colocados"],["audioSync","Audio desincronizado"],["captionTiming","Subtítulos a destiempo"],["captionText","Texto de subtítulo incorrecto"],["overlayTiming","Apoyos a destiempo"],["framing","Encuadre"],["audioQuality","Calidad de audio"],["pacing","Ritmo"]];
var v=document.getElementById("v"),D=null,FPS=30;
function fmt(f){var s=f/FPS,m=Math.floor(s/60),r=s%60;return m+":"+(r<10?"0":"")+r.toFixed(1)}
function seek(f){v.currentTime=f/FPS}
function el(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e}
fetch("plan.json").then(function(r){return r.json()}).then(function(d){
  D=d;var p=d.plan;FPS=p.fps;
  document.getElementById("meta").textContent=p.durationFrames+" frames · "+fmt(p.durationFrames)+" · "+p.segments.length+" cortes · "+p.captions.length+" subtítulos · "+p.overlays.length+" apoyos";
  var bar=document.getElementById("bar"),total=p.durationFrames;
  p.segments.forEach(function(s,i){
    var len=s.sourceEndFrame-s.sourceStartFrame,b=el("i");
    b.style.left=(100*s.outputStartFrame/total)+"%";
    b.style.width=(100*len/total)+"%";
    b.title="Corte "+(i+1)+": "+s.reason;
    bar.appendChild(b);
  });
  p.overlays.forEach(function(o){
    var b=el("div","ov");
    b.style.left=(100*o.startFrame/total)+"%";
    b.style.width=(100*(o.endFrame-o.startFrame)/total)+"%";
    b.title=o.kind;
    bar.appendChild(b);
  });
  var head=el("u");head.id="head";bar.appendChild(head);
  bar.addEventListener("click",function(e){
    var box=bar.getBoundingClientRect();
    seek(Math.round(total*(e.clientX-box.left)/box.width));
  });
  var segs=document.getElementById("segs");
  p.segments.forEach(function(s,i){
    var len=s.sourceEndFrame-s.sourceStartFrame,row=el("div","seg");
    row.dataset.from=s.outputStartFrame;
    row.dataset.to=s.outputStartFrame+len;
    var t=el("span","t");t.textContent=fmt(s.outputStartFrame);
    row.appendChild(t);
    row.appendChild(document.createTextNode("Corte "+(i+1)+(s.scale>1?" · punch-in "+s.scale:"")));
    var why=el("div","why");why.textContent=s.reason;row.appendChild(why);
    row.addEventListener("click",function(){seek(s.outputStartFrame)});
    segs.appendChild(row);
  });
  var caps=document.getElementById("caps");
  p.captions.forEach(function(c){
    var row=el("div","cap");
    row.dataset.from=c.startFrame;row.dataset.to=c.endFrame;
    var t=el("span","t");t.textContent=fmt(c.startFrame);
    row.appendChild(t);
    row.appendChild(document.createTextNode(c.text));
    row.addEventListener("click",function(){seek(c.startFrame)});
    caps.appendChild(row);
  });
  var box=document.getElementById("issues");
  ISSUES.forEach(function(pair){
    var l=el("label","chk"),input=el("input");
    input.type="checkbox";input.value=pair[0];
    l.appendChild(input);
    l.appendChild(document.createTextNode(" "+pair[1]));
    box.appendChild(l);
  });
});
v.addEventListener("timeupdate",function(){
  if(!D)return;
  var f=v.currentTime*FPS,total=D.plan.durationFrames;
  var h=document.getElementById("head");
  if(h)h.style.left=(100*f/total)+"%";
  ["seg","cap"].forEach(function(k){
    Array.prototype.forEach.call(document.getElementsByClassName(k),function(row){
      var on=f>=+row.dataset.from&&f<+row.dataset.to;
      if(on!==row.classList.contains("on"))row.classList.toggle("on",on);
    });
  });
});
function chosen(){
  return Array.prototype.filter.call(document.querySelectorAll("#issues input"),function(i){return i.checked})
    .map(function(i){return i.value});
}
function send(decision){
  var out=document.getElementById("out");
  out.style.color="var(--muted)";out.textContent="Guardando…";
  fetch("review",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      decision:decision,
      issues:chosen(),
      timingApproval:document.getElementById("timing").checked,
      notes:document.getElementById("notes").value
    })
  })
  .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
  .then(function(x){
    if(x.ok){
      out.style.color="var(--accent)";
      out.textContent="Guardado: "+x.j.decision+" → "+x.j.path;
      document.getElementById("acc").disabled=true;
      document.getElementById("rej").disabled=true;
    }else{
      out.style.color="var(--bad)";
      out.textContent="Rechazado: "+x.j.error;
    }
  })
  .catch(function(e){out.style.color="var(--bad)";out.textContent="Error: "+e.message});
}
document.getElementById("acc").addEventListener("click",function(){send("ACCEPT")});
document.getElementById("rej").addEventListener("click",function(){send("REJECT")});
</script>
</body>
</html>`;
}
