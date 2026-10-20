# AAC fixture

`tone.m4a` is a generated four-second 440 Hz sine wave, not downloaded media.

Generate with FFmpeg (test fixture preparation only, not an extension dependency):

```powershell
ffmpeg -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=4" -c:a aac -b:a 64k -movflags +faststart tone.m4a
```

MP4Box extracts 189 AAC samples. Unit tests exercise real demuxing with a simulated
WebCodecs decoder; the browser gate exercises actual Edge WebCodecs separately.
