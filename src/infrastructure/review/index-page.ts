// Panel de la app local. Sin dependencias ni recursos remotos, igual que la
// página de revisión: se sirve entero desde el proceso.
export function indexPage() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReelMaster</title>
<style>
:root{--bg:#101116;--fg:#F4F4F0;--accent:#C6FF6B;--violet:#AD9FFF;--muted:#858792;--line:#2a2c36;--card:#16171e;--bad:#FF8F6B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif}
header{padding:34px 24px 10px;max-width:1120px;margin:0 auto}
h1{margin:0;font-size:26px;letter-spacing:-.6px}
h1 span{color:var(--accent)}
.sub{color:var(--muted);font-size:13px;margin-top:5px}
main{max-width:1120px;margin:0 auto;padding:18px 24px 60px}
h2{font-size:12px;letter-spacing:2.5px;color:var(--muted);text-transform:uppercase;margin:34px 0 14px;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.card video{width:100%;aspect-ratio:9/16;object-fit:cover;background:#000;display:block;cursor:pointer}
.body{padding:13px 14px 15px}
.phase{font-size:11px;letter-spacing:2px;color:var(--accent);text-transform:uppercase;font-weight:600}
.name{font-size:14px;margin:3px 0 8px;word-break:break-all}
.facts{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.chip{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;margin-top:11px;letter-spacing:.3px}
.ok{background:#25340f;color:var(--accent)}
.no{background:#3a2420;color:var(--bad)}
.wait{background:#2a2c36;color:var(--muted)}
.none{background:#1d1f27;color:#5f6170}
a.btn{display:inline-block;margin-top:12px;background:var(--accent);color:#101116;text-decoration:none;font-weight:600;font-size:13px;padding:8px 15px;border-radius:7px}
a.btn:hover{filter:brightness(1.08)}
table{width:100%;border-collapse:collapse;font-size:14px}
td{padding:9px 10px;border-bottom:1px solid var(--line)}
td.s{color:var(--violet);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;width:130px;font-weight:600}
.fp{font:400 11px/1.45 monospace;color:var(--muted);background:#111219;border:1px solid var(--line);border-radius:7px;padding:8px 10px;margin-top:8px;font-variant-numeric:tabular-nums}
.fp b{color:var(--accent);font-weight:500}
details{margin-top:9px}
summary{cursor:pointer;font-size:12px;color:var(--muted);list-style:none}
summary::-webkit-details-marker{display:none}
summary:hover{color:var(--fg)}
.form{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}
.form label{font:400 10.5px/1.3 monospace;color:var(--muted);display:flex;flex-direction:column;gap:3px}
.form input{background:#111219;border:1px solid var(--line);border-radius:5px;color:var(--fg);padding:6px 7px;font:400 12px monospace;width:100%}
.form input:focus-visible{outline:1px solid var(--accent);border-color:var(--accent)}
.form .wide{grid-column:1/-1}
.save{margin-top:8px;font:600 12px system-ui,sans-serif;background:var(--accent);color:#0E0F14;border:0;border-radius:6px;padding:7px 13px;cursor:pointer}
.said{font:400 11px monospace;margin-top:6px;min-height:14px}
.empty{color:var(--muted);font-size:14px;padding:14px;border:1px dashed var(--line);border-radius:10px}
footer{color:var(--muted);font-size:12px;border-top:1px solid var(--line);margin-top:42px;padding-top:16px}
code{color:var(--fg)}
</style>
</head>
<body>
<header>
  <h1>Reel<span>Master</span></h1>
  <div class="sub" id="sub">Cargando…</div>
</header>
<main>
  <h2>Reels entregados</h2>
  <div class="grid" id="reels"></div>
  <h2>Producciones</h2>
  <div id="prods"></div>
  <footer>Todo local. El vídeo se sirve por loopback con token; nada sale de esta máquina.</footer>
</main>
<script>
function mb(b){return (b/1048576).toFixed(1)+" MB"}
function dur(s){if(!s)return "—";var m=Math.floor(s/60),r=s%60;return m+":"+(r<10?"0":"")+r.toFixed(0)}
function el(t,c){var e=document.createElement(t);if(c)e.className=c;return e}
fetch("api/library.json").then(function(r){return r.json()}).then(function(d){
  document.getElementById("sub").textContent=d.reels.length+" reels · "+d.productions.length+" producciones · "+d.reels.filter(function(r){return r.plan}).length+" montajes revisables";
  var grid=document.getElementById("reels");
  if(!d.reels.length){grid.innerHTML='<div class="empty">No hay entregas en out/.</div>';return}
  d.reels.forEach(function(r){
    var card=el("div","card");
    var v=el("video");v.src="r/"+encodeURIComponent(r.id)+"/video.mp4";v.controls=true;v.preload="metadata";
    card.appendChild(v);
    var body=el("div","body");
    var p=el("div","phase");p.textContent=r.phase;body.appendChild(p);
    var n=el("div","name");n.textContent=r.name;body.appendChild(n);
    var f=el("div","facts");
    f.textContent=dur(r.durationSeconds)+" · "+(r.width&&r.height?r.width+"×"+r.height:"—")+" · "+mb(r.bytes);
    body.appendChild(f);
    var chip=el("span","chip");
    if(!r.plan){chip.className+=" none";chip.textContent="Sin plan de montaje"}
    else if(!r.review){chip.className+=" wait";chip.textContent="Pendiente de revisar"}
    else if(r.review.decision==="ACCEPT"){chip.className+=" ok";chip.textContent="Aprobado"+(r.review.timingApproval?" · tiempos OK":"")}
    else{chip.className+=" no";chip.textContent="Rechazado · "+r.review.issues.length+" pegas"}
    body.appendChild(chip);
    if(r.plan){
      var a=el("a","btn");a.href="r/"+encodeURIComponent(r.id)+"/review";
      a.textContent=r.review?"Revisar de nuevo":"Revisar";
      body.appendChild(el("div")).appendChild(a);
    }
    if(r.fingerprint){
      var hu=r.fingerprint,fp=el("div","fp");
      fp.innerHTML="gancho <b>"+hu.firstCutSeconds+"s</b> · cortes <b>"+hu.cuts+
        "</b> · texto <b>"+Math.round(hu.textOnScreenRatio*100)+"%</b> · pal/sub <b>"+
        hu.wordsPerCaption+"</b> · cierre <b>"+Math.round(hu.closingStartRatio*100)+"%</b>";
      body.appendChild(fp);
      body.appendChild(experimentForm(r));
    }
    card.appendChild(body);grid.appendChild(card);
  });
  buildProductions(d);
}).catch(function(e){
  document.getElementById("sub").textContent="Error: "+e.message;
});

function experimentForm(r){
  var ex=r.experiment,det=el("details"),sum=el("summary");
  var m=(ex&&ex.metrics)||{};
  sum.textContent=ex&&ex.publishedAt?"▸ Publicado "+ex.publishedAt.slice(0,10)+(ex.metrics?" · medido":" · sin medir"):"▸ Registrar publicación";
  det.appendChild(sum);
  var form=el("div","form");
  var fields=[["publishedAt","publicado","date",ex&&ex.publishedAt?ex.publishedAt.slice(0,10):""],
              ["views","reproducciones","number",m.views!=null?m.views:""],
              ["likes","likes","number",m.likes!=null?m.likes:""],
              ["saves","guardados","number",m.saves!=null?m.saves:""],
              ["shares","compartidos","number",m.shares!=null?m.shares:""],
              ["comments","comentarios","number",m.comments!=null?m.comments:""]];
  var inputs={};
  fields.forEach(function(f){
    var l=el("label");l.appendChild(document.createTextNode(f[1]));
    var i=el("input");i.type=f[2];i.value=f[3];i.min="0";
    l.appendChild(i);inputs[f[0]]=i;form.appendChild(l);
  });
  var nl=el("label");nl.className="wide";nl.appendChild(document.createTextNode("notas"));
  var ni=el("input");ni.type="text";ni.value=(ex&&ex.notes)||"";nl.appendChild(ni);
  form.appendChild(nl);
  det.appendChild(form);
  var save=el("button","save");save.type="button";save.textContent="Guardar";
  var said=el("div","said");
  save.addEventListener("click",function(){
    var metrics={},any=false;
    ["views","likes","saves","shares","comments"].forEach(function(k){
      var v=inputs[k].value.trim();
      if(v!==""){metrics[k]=Number(v);any=true}
    });
    var pub=inputs.publishedAt.value;
    said.style.color="var(--muted)";said.textContent="Guardando…";
    fetch("r/"+encodeURIComponent(r.id)+"/experiment",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({publishedAt:pub?new Date(pub+"T12:00:00Z").toISOString():null,
                           metrics:any?metrics:null,notes:ni.value})
    }).then(function(res){return res.json().then(function(j){return{ok:res.ok,j:j}})})
      .then(function(x){
        said.style.color=x.ok?"var(--accent)":"var(--bad)";
        said.textContent=x.ok?"✓ registrado":x.j.error;
      }).catch(function(e){said.style.color="var(--bad)";said.textContent=e.message});
  });
  det.appendChild(save);det.appendChild(said);
  return det;
}

function buildProductions(d){
  var prods=document.getElementById("prods");
  if(!d.productions.length){prods.innerHTML='<div class="empty">Ninguna producción en estado avanzado.</div>';return}
  var table=el("table");
  d.productions.forEach(function(p){
    var tr=el("tr"),s=el("td","s"),t=el("td");
    s.textContent=p.state;t.textContent=p.title;
    tr.appendChild(s);tr.appendChild(t);table.appendChild(tr);
  });
  prods.appendChild(table);
}
</script>
</body>
</html>`;
}
