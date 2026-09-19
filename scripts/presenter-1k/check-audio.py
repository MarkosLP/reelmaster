import pathlib,json,subprocess,numpy as np
root=pathlib.Path(__file__).resolve().parents[2];base=root/'.local/phase-1k'
ff='C:/Users/Marcos/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
def pcm(p):
 r=subprocess.run([ff,'-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',str(p),'-map','0:a:0','-c:a','pcm_f32le','-f','f32le','-'],capture_output=True,check=True)
 return np.frombuffer(r.stdout,dtype='<f4').reshape(-1,2)
plan=json.loads((base/'edit-plan.json').read_text(encoding='utf8'))
source=pcm(root/'.local/presenters/presenter-marcos/denoise/phase-1j2-rnnoise/DENOISED-RNNOISE.mp4')
edited=pcm(base/'work/edited-audio.wav')
expected=np.concatenate([source[s['sourceStartFrame']*1600:s['sourceEndFrame']*1600] for s in plan['segments']])
assert expected.shape==edited.shape==(plan['durationFrames']*1600,2)
error=float(np.max(abs(edited-expected)));assert error<2e-7,error
boundaries=[]
for segment in plan['segments'][1:]:
 n=segment['outputStartFrame']*1600
 boundaries.append(dict(outputTime=n/48000,jumpAmplitude=float(np.max(abs(edited[n]-edited[n-1]))),rmsBefore=float(np.sqrt(np.mean(edited[n-480:n]**2))),rmsAfter=float(np.sqrt(np.mean(edited[n:n+480]**2)))))
result=dict(sampleFrames=len(edited),audioDuration=len(edited)/48000,maxDifferenceFromOriginalRetainedSamples=error,boundaries=boundaries,processing='Only cuts; PCM24 rounding. No fades or speed/volume processing')
(base/'audio-edit-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
