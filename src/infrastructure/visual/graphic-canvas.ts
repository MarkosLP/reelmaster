// Fixed browser program, never model-generated code. Content enters through JSON.
export const graphicCanvasProgram = String.raw`
(async()=>{
const result=document.getElementById('result');
try {
 const {spec,brand,font}=JSON.parse(document.getElementById('payload').textContent);
 const face=new FontFace('FixedInter','url(data:font/woff2;base64,'+font+')',{weight:'100 900'});
 await face.load(); document.fonts.add(face); await document.fonts.ready;
 const c=document.createElement('canvas'); c.width=900;c.height=1000;
 const x=c.getContext('2d'); const p=brand.spacing; const w=900-2*p;
 const colors=brand.colors;
 x.fillStyle=colors.background;x.fillRect(0,0,900,1000);
 x.textBaseline='top';
 function lines(text,size,width,max){
  if(!/^[\u0020-\u007e\u00a0-\u00ff\u2010-\u2026]*$/u.test(text)) throw Error('INVALID_SPEC');
  x.font='600 '+size+'px FixedInter';
  const words=text.split(/\s+/u), rows=[];let line='';
  for(const word of words){
   if(x.measureText(word).width>width)throw Error('OVERFLOW');
   const next=line?line+' '+word:word;
   if(x.measureText(next).width>width){rows.push(line);line=word;}else line=next;
  }
  if(line)rows.push(line);if(rows.length>max)throw Error('OVERFLOW');return rows;
 }
 function text(value,left,top,size,width,max,color){
  const rows=lines(value,size,width,max);x.fillStyle=color;
  if(top+rows.length*size*1.3>944)throw Error('OVERFLOW');
  rows.forEach((row,i)=>x.fillText(row,left,top+i*size*1.3));
  return rows.length*size*1.3;
 }
 x.fillStyle=colors.accent;x.fillRect(p,64,72,6);
 text('GRÁFICO ILUSTRATIVO',p,100,24,w,1,colors.muted);
 let y=180;
 y+=text(spec.headline,p,y,52,w,3,colors.text)+32;
 if(spec.supportingText)y+=text(spec.supportingText,p,y,32,w,4,colors.muted)+32;
 const rowHeight=spec.layout==='flow'?116:110;
 if(y+spec.items.length*rowHeight>900)throw Error('OVERFLOW');
 spec.items.forEach((item,i)=>{
  x.fillStyle=colors.surface;x.beginPath();x.roundRect(p,y,w,96,brand.radius);x.fill();
  text(String(i+1).padStart(2,'0'),p+20,y+29,28,60,1,colors.accent);
  text(item,p+92,y+18,28,w-116,2,colors.text);
  y+=rowHeight;
 });
 x.fillStyle=colors.accent;x.fillRect(p,930,w,2);
 result.textContent=JSON.stringify({ok:true,png:c.toDataURL('image/png').split(',')[1]});
}catch(error){result.textContent=JSON.stringify({ok:false,code:error.message});}
})();
`;
