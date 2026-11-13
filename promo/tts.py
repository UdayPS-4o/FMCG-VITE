"""Hindi voice-over: one mp3 per scene (Microsoft neural voice via edge-tts) + durations.json."""
import asyncio, json, re, subprocess, sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg

HERE = Path(__file__).parent
VOICE = sys.argv[1] if len(sys.argv) > 1 else "hi-IN-SwaraNeural"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def duration(path: Path) -> float:
    out = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="ignore").stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


async def main():
    scenes = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    (HERE / "audio").mkdir(exist_ok=True)
    durs = {}
    for s in scenes:
        out = HERE / "audio" / f"{s['id']}.mp3"
        await edge_tts.Communicate(s["vo"], VOICE, rate="+6%").save(str(out))
        durs[s["id"]] = round(duration(out), 2)
        print(s["id"], durs[s["id"]])
    (HERE / "audio" / "durations.json").write_text(json.dumps(durs, indent=2))
    print("total", round(sum(durs.values()), 1))


asyncio.run(main())
