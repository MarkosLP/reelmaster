import json,pathlib,hashlib,difflib,math,subprocess
root=pathlib.Path(__file__).resolve().parents[2]
base=root/'.local/phase-1k'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rawpath=root/'.local/phase-1k-stt/result/transcript.json'
raw=json.loads(rawpath.read_text(encoding='utf8'))
source=root/'.local/presenters/presenter-marcos/denoise/phase-1j2-rnnoise/DENOISED-RNNOISE.mp4'
assert sha(source)==raw['sourceHash']
baseline={str(p.relative_to(root)):sha(p) for folder in ['.local/presenters/presenter-marcos','.local/phase-1k-stt/result','out/phase-1i','out/phase-1i-v2'] for p in (root/folder).rglob('*') if p.is_file()}
(base/'baseline.json').write_text(json.dumps(baseline,indent=2))
with (base/'rawTranscript.json').open('xb') as f:f.write(rawpath.read_bytes())
paragraphs=[
'¿Sabías que la IA puede ahorrarte tiempo en tareas cotidianas?',
'Primero, la IA puede responder preguntas rápidamente, como el tiempo o recetas.',
'Segundo, puedes usarla para programar recordatorios y listas de tareas.',
'Y tercero, la IA puede analizar datos y generar informes automáticamente.',
'Prueba estas tres formas sencillas de ahorrar tiempo con la IA.']
review=dict(provenance='HUMAN_REVIEWED_TEXT',reviewer='Marcos',rawTranscriptHash=sha(rawpath),paragraphs=paragraphs,timingApproval=False)
(base/'reviewedTranscript.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf8')
raw_words=[]
for s in raw['segments']:
 for w in s['words']:raw_words.append(dict(**w,rawWordId=len(raw_words),rawSegmentId=s['id']))
review_words=[];offset=0
for i,(s,p) in enumerate(zip(raw['segments'],paragraphs)):
 old=s['words'];new=p.split()
 normalize=lambda t:t.strip('¿?.,!¡').lower()
 matcher=difflib.SequenceMatcher(a=[normalize(w['word'].strip()) for w in old],b=[normalize(w) for w in new],autojunk=False)
 for tag,a,b,c,d in matcher.get_opcodes():
  if tag=='delete':continue
  refs=list(range(offset+a,offset+b))
  if tag=='equal':
   times=[(old[a+j]['start'],old[a+j]['end']) for j in range(d-c)]
  else:
   if a==b:
    # Added human word shares and subdivides the next raw word interval; never implies measured alignment.
    start=old[a]['start'];end=(old[a]['start']+old[a]['end'])/2
    refs=[offset+a]
   else:start=old[a]['start'];end=old[b-1]['end']
   times=[(start+(end-start)*j/(d-c),start+(end-start)*(j+1)/(d-c)) for j in range(d-c)]
  for j,(start,end) in enumerate(times):
   if review_words and review_words[-1]['paragraph']==i:start=max(start,review_words[-1]['end'])
   review_words.append(dict(id=len(review_words),paragraph=i,text=new[c+j],start=start,end=end,rawWordIds=[offset+a+j] if tag=='equal' else refs,operation=tag,timingSource='MODEL_ESTIMATED_HUMAN_TEXT'))
 offset+=len(old)
segments=[];cursor=0
for start,end,scale,reason in [(21,164,1,'Hook: quitar espera inicial, preservar frase completa'),(193,341,1.035,'Primer ejemplo; retirar espera previa y terminar antes de la autocorrección'),(393,522,1,'Segundo ejemplo tras retirar autocorrección'),(528,681,1.04,'Tercer ejemplo; punch-in asociado a sección'),(688,833,1,'CTA humano completo y gesto final')]:
 segments.append(dict(sourceStartFrame=start,sourceEndFrame=end,outputStartFrame=cursor,scale=scale,reason=reason));cursor+=end-start
def output_frame(t,seg):return seg['outputStartFrame']+round(t*30)-seg['sourceStartFrame']
captions=[]
for i,segment in enumerate(segments):
 words=[w for w in review_words if w['paragraph']==i];groups=[];group=[]
 for word in words:
  text=' '.join(w['text'] for w in group+[word])
  if group and (len(group)>=3 or len(text)>26):groups.append(group);group=[]
  group.append(word)
 if group:groups.append(group)
 for j,group in enumerate(groups):
  begin=max(segment['outputStartFrame'],output_frame(group[0]['start'],segment))
  end=min(segment['outputStartFrame']+segment['sourceEndFrame']-segment['sourceStartFrame'],output_frame(group[-1]['end'],segment))
  if j+1<len(groups):end=min(end,output_frame(groups[j+1][0]['start'],segment))
  captions.append(dict(startFrame=begin,endFrame=max(begin+1,end),text=' '.join(w['text'] for w in group),reviewedWordIds=[w['id'] for w in group],timingSource='MODEL_ESTIMATED_HUMAN_TEXT'))
plan=dict(version=1,sourceHash=sha(source),rawTranscriptHash=sha(rawpath),reviewedTranscriptHash=sha(base/'reviewedTranscript.json'),fps=30,durationFrames=cursor,segments=segments,captions=captions,overlays=[
 dict(startFrame=segments[1]['outputStartFrame']+55,endFrame=segments[1]['outputStartFrame']+140,kind='weather-recipe'),
 dict(startFrame=segments[2]['outputStartFrame']+35,endFrame=segments[2]['outputStartFrame']+123,kind='checklist'),
 dict(startFrame=segments[3]['outputStartFrame']+35,endFrame=segments[3]['outputStartFrame']+140,kind='data-report')])
(base/'edit-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
(base/'word-trace.json').write_text(json.dumps(dict(rawWords=raw_words,reviewedWords=review_words,deletedRawWordIds=[w['rawWordId'] for w in raw_words if not any(w['rawWordId'] in rw['rawWordIds'] for rw in review_words)]),ensure_ascii=False,indent=2),encoding='utf8')
(base/'captions.txt').write_text('\n'.join(c['text'] for c in captions)+'\n',encoding='utf8')
print({'frames':cursor,'seconds':cursor/30,'captions':len(captions),'words':len(review_words)})
