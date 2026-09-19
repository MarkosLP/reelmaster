import pathlib,json,subprocess,hashlib,sys,numpy as np
root=pathlib.Path(__file__).resolve().parents[2];base=root/'.local/phase-1k';out=root/'out/phase-1k'
resume='--resume' in sys.argv
out.mkdir(exist_ok=resume);(out/'stills').mkdir(exist_ok=resume)
ff='C:/Users/Marcos/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
probe=root/'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe'
plan=json.loads((base/'edit-plan.json').read_text(encoding='utf8'));duration=plan['durationFrames']/30
def run(args):
 if resume and str(args[-1]).endswith(('.mp4','.png','.jpg')) and pathlib.Path(args[-1]).exists():
  return subprocess.CompletedProcess(args,0,b'',b'')
 p=subprocess.run([ff,'-hide_banner','-nostdin','-n','-protocol_whitelist','file,pipe',*map(str,args)],capture_output=True)
 assert p.returncode==0,p.stderr.decode(errors='replace')
 return p
def metadata(path,extra=None):
 return json.loads(subprocess.run([str(probe),'-v','error',*(extra or ['-show_streams','-show_format']),'-of','json',str(path)],capture_output=True,check=True).stdout)
def sha(path):
 with open(path,'rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
final=out/'reel-1k-marcos.mp4'
args=['-i',base/'work/rendered-silent.mp4','-i',base/'work/final-audio.wav','-map','0:v:0','-map','1:a:0','-map_metadata','-1','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',final]
run(args)
m=metadata(final);v,a=m['streams'];assert (v['width'],v['height'],v['r_frame_rate'],v['codec_name'],a['codec_name'])==(1080,1920,'30/1','h264','aac')
assert abs(float(v['duration'])-duration)<1e-5 and abs(float(a['duration'])-duration)<0.001
frames=metadata(final,['-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time'])['frames']
assert len(frames)==plan['durationFrames']
assert all(abs(float(f['best_effort_timestamp_time'])-i/30)<1e-5 for i,f in enumerate(frames))
audio_packets=metadata(final,['-select_streams','a:0','-show_packets','-show_entries','packet=pts,duration'])['packets']
cursor=0
for p in audio_packets:
 if p['pts']<0:continue
 assert p['pts']==cursor
 cursor+=p['duration']
assert abs(cursor-plan['durationFrames']*1600)<=48,(cursor,plan['durationFrames']*1600)
r=run(['-v','error','-i',final,'-f','null','-']);assert not r.stderr
def pcm(path):
 return np.frombuffer(run(['-v','error','-i',path,'-map','0:a:0','-c:a','pcm_f32le','-f','f32le','-']).stdout,dtype='<f4').reshape(-1,2)
x=pcm(base/'work/final-audio.wav');y=pcm(final);assert len(y)>=len(x) and len(y)-len(x)<1024
lags=[]
for s in plan['segments']:
 start=s['outputStartFrame']/30+0.4;n=int(start*48000);size=48000
 ref=x[n:n+size].mean(axis=1)[::12].astype(float);ref-=ref.mean()
 scores=[]
 for lag in range(-40,41):
  z=y[n+lag*12:n+lag*12+size].mean(axis=1)[::12].astype(float);z-=z.mean()
  scores.append((float(np.dot(ref,z)/np.sqrt(np.dot(ref,ref)*np.dot(z,z))),lag))
 corr,lag=max(scores);assert lag==0,(start,lag)
 lags.append(dict(start=start,lagMs=lag/4,correlation=corr))
levels=run(['-i',final,'-map','0:a:0','-af','loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json','-f','null','-']).stderr.decode()
loudness=json.loads(levels[levels.rfind('{'):levels.rfind('}')+1]);assert float(loudness['input_tp'])<0
(base/'final-loudness.log').write_text(levels)
black=run(['-i',final,'-an','-vf','blackdetect=d=0.02:pix_th=0.10:pic_th=0.98','-f','null','-']).stderr.decode()
assert 'black_start:' not in black
(base/'blackdetect.log').write_text(black)
for f in [0,30,60,142,143,245,290,291,370,419,420,510,572,573,635,703,717]:
 run(['-i',final,'-vf',f'select=eq(n\\,{f})','-frames:v','1',out/'stills'/f'frame-{f:03d}.png'])
run(['-i',final,'-vf','fps=4,scale=180:320,tile=8x4','-frames:v','3',base/'timeline-%02d.jpg'])
run(['-i',final,'-t','3','-vf','fps=10,scale=180:320,tile=10x3','-frames:v','1',base/'hook-timeline.jpg'])
for s in plan['segments'][1:]:
 t=s['outputStartFrame']/30
 run(['-ss',t-0.3,'-i',final,'-t','0.6','-vf','fps=10,scale=180:320,tile=6x1','-frames:v','1',base/f"cut-{s['outputStartFrame']}.jpg"])
baseline=json.loads((base/'baseline.json').read_text())
for p,h in baseline.items():assert sha(root/p)==h,p
assert sha(base/'rawTranscript.json')==sha(root/'.local/phase-1k-stt/result/transcript.json')
review=json.loads((base/'reviewedTranscript.json').read_text(encoding='utf8'))
assert ' '.join(c['text'] for c in plan['captions'])==' '.join(review['paragraphs'])
result=dict(outputHash=sha(final),metadata=m,videoFrames=len(frames),audioPacketEnd=cursor,decodedAacPaddingSamples=len(y)-len(x),
 audioCorrelation=lags,loudness=loudness,fullScaleSamples=int((abs(y)>=1).sum()),blackFramesDetected=False,priorFilesPreserved=len(baseline),rawTranscriptUnchanged=True,captionTextMatchesReview=True,
 inspection='Technical decode complete; visual still/timeline review performed separately; human audiovisual listening pending',muxArgs=list(map(str,args)))
(base/'verification.json').write_text(json.dumps(result,indent=2)+'\n');(out/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['metadata','muxArgs']},indent=2))
