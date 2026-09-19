import pathlib,json,subprocess,hashlib
root=pathlib.Path(__file__).resolve().parents[2];base=root/'.local/phase-1k'
p=json.loads((base/'edit-plan.json').read_text(encoding='utf8'))
ff='C:/Users/Marcos/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
source=root/'.local/presenters/presenter-marcos/denoise/phase-1j2-rnnoise/DENOISED-RNNOISE.mp4'
filters=[]
for i,s in enumerate(p['segments']):
 start=s['sourceStartFrame'];end=s['sourceEndFrame'];n=end-start
 filters += [f'[0:v]trim=start={start/30}:end={end/30},setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame={n},setpts=N/(30*TB)[v{i}]',
 f'[0:a]atrim=start_sample={start*1600}:end_sample={end*1600},asetpts=N/SR/TB[a{i}]']
filters += [''.join(f'[v{i}]' for i in range(len(p['segments'])))+f"concat=n={len(p['segments'])}:v=1:a=0[v]",''.join(f'[a{i}]' for i in range(len(p['segments'])))+f"concat=n={len(p['segments'])}:v=0:a=1[a]"]
args=[ff,'-hide_banner','-nostdin','-n','-protocol_whitelist','file,pipe','-i',str(source),'-filter_complex',';'.join(filters),'-map','[v]','-an','-c:v','libx264','-crf','16','-preset','fast','-pix_fmt','yuv420p','-video_track_timescale','90000',str(base/'work/edited-video.mp4'),'-map','[a]','-c:a','pcm_s24le',str(base/'work/edited-audio.wav')]
r=subprocess.run(args,capture_output=True)
(base/'work/prepare-media.log').write_bytes(r.stderr)
assert r.returncode==0,r.stderr.decode(errors='replace')
(base/'media-recipe.json').write_text(json.dumps({'argv':args,'audioProcessing':'sample-exact trims and concatenation only; no denoise, EQ, compression or speed change','fpsPolicy':'per-segment CFR30 resampling; padded guard to preserve exact segment duration'},indent=2))
print('Prepared joint video/audio edit',p['durationFrames'])
