import pathlib,subprocess,json,numpy as np
root=pathlib.Path(__file__).resolve().parents[2];base=root/'.local/phase-1k'
ff='C:/Users/Marcos/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
probe=root/'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe'
source=root/'.local/presenters/presenter-marcos/denoise/phase-1j2-rnnoise/DENOISED-RNNOISE.mp4'
def gray(path):
 p=subprocess.run([ff,'-v','error','-nostdin','-i',str(path),'-an','-vf','scale=120:214,format=gray','-fps_mode','passthrough','-f','rawvideo','-'],capture_output=True,check=True)
 return np.frombuffer(p.stdout,dtype=np.uint8).reshape(-1,214,120)
a=gray(source);b=gray(base/'work/edited-video.mp4')
frames=json.loads(subprocess.run([str(probe),'-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(source)],capture_output=True,check=True).stdout)['frames']
times=np.array([float(f['best_effort_timestamp_time']) for f in frames]);assert len(times)==len(a)
plan=json.loads((base/'edit-plan.json').read_text(encoding='utf8'));checks=[]
for s in plan['segments']:
 length=s['sourceEndFrame']-s['sourceStartFrame']
 for k in [0,1,length//2,length-2,length-1]:
  n=s['outputStartFrame']+k;expected=(s['sourceStartFrame']+k)/30
  candidates=np.where(abs(times-expected)<0.15)[0]
  errors=np.mean(abs(a[candidates].astype(float)-b[n]),axis=(1,2))
  selected=int(candidates[np.argmin(errors)])
  checks.append(dict(outputFrame=n,expectedSourceSeconds=expected,matchedSourceSeconds=float(times[selected]),differenceMs=float((times[selected]-expected)*1000),meanAbsolutePixelError=float(min(errors))))
result=dict(method='Closest downscaled grayscale source frame near planned time; compression may affect match; not face recognition',checks=checks,maxAbsoluteDifferenceMs=max(abs(c['differenceMs']) for c in checks))
assert result['maxAbsoluteDifferenceMs']<67,result
(base/'video-map-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
