"""Gera as vozes das frases do NO MERCY com vozes neurais do Piper (pt-BR).

Roda no GitHub Actions (workflow "Gerar vozes"). Saída: client/public/voices/<voz>/<id>.mp3 + manifest.json
O id de cada frase é o hash FNV-1a (32 bits) do texto — o jogo calcula o mesmo hash para achar o arquivo.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import urllib.request
import wave

ROOT = pathlib.Path(__file__).resolve().parent.parent
PHRASES = json.loads((ROOT / "shared/src/phrases.json").read_text(encoding="utf-8"))
OUT = ROOT / "client/public/voices"
MODELS = ROOT / ".voice-models"
HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR"

# narrador + uma voz para cada personagem; length_scale > 1 deixa a fala mais lenta/pesada
VOICES = {
    "narrador": {"model": "faber/medium/pt_BR-faber-medium", "length": 1.05, "pitch": 1.0},
    "v1": {"model": "cadu/medium/pt_BR-cadu-medium", "length": 1.0, "pitch": 0.92},
    "v2": {"model": "jeff/medium/pt_BR-jeff-medium", "length": 1.0, "pitch": 1.0},
    "v3": {"model": "edresson/low/pt_BR-edresson-low", "length": 1.08, "pitch": 0.88},
}


def fnv1a(text: str) -> str:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def download(rel: str) -> pathlib.Path | None:
    MODELS.mkdir(exist_ok=True)
    onnx = MODELS / (pathlib.Path(rel).name + ".onnx")
    for ext in (".onnx", ".onnx.json"):
        dst = MODELS / (pathlib.Path(rel).name + ext)
        if dst.exists():
            continue
        try:
            print("baixando", rel + ext, flush=True)
            urllib.request.urlretrieve(f"{HF}/{rel}{ext}", dst)
        except Exception as e:  # voz indisponível: segue sem ela
            print("  falhou:", e, flush=True)
            return None
    return onnx


def synth(voice, text: str, wav_path: pathlib.Path, length: float) -> None:
    with wave.open(str(wav_path), "wb") as wf:
        try:  # piper-tts >= 1.3
            from piper import SynthesisConfig

            voice.synthesize_wav(text, wf, syn_config=SynthesisConfig(length_scale=length))
        except ImportError:  # versões antigas
            voice.synthesize(text, wf, length_scale=length)


def main() -> int:
    from piper import PiperVoice

    texts = sorted({t for items in PHRASES.values() for t in items})
    manifest = {"voices": [], "ids": {}}
    for name, cfg in VOICES.items():
        model = download(cfg["model"])
        if not model:
            continue
        voice = PiperVoice.load(str(model))
        (OUT / name).mkdir(parents=True, exist_ok=True)
        for text in texts:
            pid = fnv1a(text)
            mp3 = OUT / name / f"{pid}.mp3"
            with tempfile.TemporaryDirectory() as tmp:
                wav = pathlib.Path(tmp) / "a.wav"
                synth(voice, text, wav, cfg["length"])
                rate = voice.config.sample_rate
                pitch = cfg["pitch"]
                # tom do personagem + leve calor (graves) + volume normalizado; o eco de bar é aplicado no jogo
                af = f"asetrate={int(rate * pitch)},aresample=44100,atempo={1 / pitch:.4f},bass=g=3,loudnorm=I=-16:TP=-1.5"
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", af, "-ac", "1", "-b:a", "48k", str(mp3)],
                    check=True,
                )
            manifest["ids"][pid] = text
        manifest["voices"].append(name)
        print(f"voz {name}: {len(texts)} frases", flush=True)
    if not manifest["voices"]:
        print("nenhuma voz gerada", file=sys.stderr)
        return 1
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
