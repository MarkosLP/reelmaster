import json,pathlib,subprocess,numpy as np
root=pathlib.Path(__file__).resolve().parents[2];base=root/'.local/phase-1k'
ff='C:/Users/Marcos/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
p=json.loads((base/'edit-plan.json').read_text(encoding='utf8'))
args=[ff,'-v','error','-nostdin','-n','-protocol_whitelist','file,pipe']
r=subprocess.run(args+['-i',str(base/'work/edited-audio.wav'),'-c:a','pcm_f32le','-f','f32le','-'],capture_output=True,check=True)
x=np.frombuffer(r.stdout,dtype='<f4').reshape(-1,2).copy();ramp=144
for s in p['segments'][1:]:
 n=s['outputStartFrame']*1600
 x[n-ramp:n]*=np.linspace(1,0,ramp,dtype=np.float32)[:,None]
 x[n:n+ramp]*=np.linspace(0,1,ramp,dtype=np.float32)[:,None]
output=base/'work/final-audio.wav'
subprocess.run(args+['-f','f32le','-ar','48000','-ac','2','-i','pipe:0','-c:a','pcm_s24le',str(output)],input=x.tobytes(),capture_output=True,check=True)
(base/'declick-recipe.json').write_text(json.dumps(dict(rampSamples=144,eachSideMilliseconds=3,boundaries=[s['outputStartFrame']*1600 for s in p['segments'][1:]],samplesUnchanged=len(x),justification='Measured sample discontinuity up to 0.03134 at a cut; ramps affect only cut boundaries, no shift or mixing of words'),indent=2))
