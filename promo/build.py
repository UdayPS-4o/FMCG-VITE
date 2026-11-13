"""Assembles the promo: app clip inside the phone frame + Hindi captions + voice-over → promo/out/*.mp4"""
import json, re, subprocess
from pathlib import Path
import imageio_ffmpeg

HERE = Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
OUT = HERE / "out"; SEG = HERE / "clips" / "_seg"
OUT.mkdir(exist_ok=True); SEG.mkdir(parents=True, exist_ok=True)
SCREEN = dict(x=180, y=392, w=720, h=1440)   # must match record.mjs
LEAD, TAIL, FADE = 0.35, 0.45, 0.3           # voice starts LEAD s into a scene


def dur(p):
    out = subprocess.run([FF, "-i", str(p)], capture_output=True, text=True, encoding="utf-8", errors="ignore").stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def run(args):
    subprocess.run([FF, "-y", "-loglevel", "error", *args], check=True)


scenes = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
segs, total = [], 0.0
for s in scenes:
    sid = s["id"]
    clip, png, mp3 = HERE / "clips" / f"{sid}.mp4", HERE / "clips" / f"{sid}.png", HERE / "audio" / f"{sid}.mp3"
    T = round(max(dur(clip), dur(mp3) + LEAD + TAIL), 2)
    hold = max(0.0, T - dur(clip))
    fades = f"fade=t=in:st=0:d={FADE},fade=t=out:st={T - FADE:.2f}:d={FADE}"
    audio = f"[a]loudnorm=I=-16:TP=-1.5:LRA=11,adelay={int(LEAD * 1000)}:all=1,apad,atrim=0:{T},aresample=48000[ao]"
    if png.exists():
        inputs = ["-f", "lavfi", "-i", f"color=c=0x1e1b4b:s=1080x1920:r=30:d={T}", "-i", str(clip), "-loop", "1", "-t", str(T), "-i", str(png), "-i", str(mp3)]
        fc = (f"[1:v]scale={SCREEN['w']}:{SCREEN['h']}:flags=lanczos,tpad=stop_mode=clone:stop_duration={hold + 0.5:.2f}[app];"
              f"[0:v][app]overlay={SCREEN['x']}:{SCREEN['y']}:shortest=0[b];[b][2:v]overlay=0:0,trim=0:{T},{fades},scale=out_range=tv:out_color_matrix=bt709,format=yuv420p[vo];"
              + audio.replace("[a]", "[3:a]"))
    else:
        inputs = ["-i", str(clip), "-i", str(mp3)]
        fc = f"[0:v]tpad=stop_mode=clone:stop_duration={hold + 0.5:.2f},trim=0:{T},fps=30,{fades},scale=out_range=tv:out_color_matrix=bt709,format=yuv420p[vo];" + audio.replace("[a]", "[1:a]")
    seg = SEG / f"{sid}.mp4"
    run([*inputs, "-filter_complex", fc, "-map", "[vo]", "-map", "[ao]", "-t", str(T), "-r", "30",
         "-c:v", "libx264", "-color_range", "tv", "-colorspace", "bt709", "-crf", "19", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-ac", "2", str(seg)])
    segs.append(seg); total += T
    print(f"{sid}: {T:.1f}s")

lst = SEG / "list.txt"
lst.write_text("".join(f"file '{p.as_posix()}'\n" for p in segs), encoding="utf-8")
voice_only = OUT / "ekta-retailer-app-promo-hindi-voice-only.mp4"
run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(voice_only)])

# Background music: generated to the exact length, ducked under the voice (side-chain), louder in the gaps
import sys
T = dur(voice_only)
subprocess.run([sys.executable, str(HERE / "music.py"), f"{T:.2f}"], check=True)
final = OUT / "ekta-retailer-app-promo-hindi.mp4"
fc = ("[0:a]asplit=2[v1][v2];"
      "[1:a]aresample=48000,lowpass=f=11000,loudnorm=I=-21:TP=-2:LRA=7[m];"
      "[m][v1]sidechaincompress=threshold=0.02:ratio=5:attack=15:release=450:makeup=1[duck];"
      "[v2][duck]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.94[ao]")
run(["-i", str(voice_only), "-i", str(HERE / "audio" / "music.wav"), "-filter_complex", fc, "-map", "0:v", "-map", "[ao]",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
print(f"→ {final}  {dur(final):.1f}s  {final.stat().st_size / 1e6:.1f} MB")
