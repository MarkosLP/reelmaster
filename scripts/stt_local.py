"""Offline CPU STT experiment; no renderer dependency or implicit model download."""
import argparse
import ctypes
import hashlib
import json
import math
import os
import socket
import time
from pathlib import Path


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n'


def digest(path):
    with open(path, 'rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def private_path(workspace, path):
    resolved = Path(path).resolve()
    if not resolved.is_relative_to((Path(workspace) / '.local').resolve()):
        raise ValueError('STT_PATH_NOT_PRIVATE')
    return resolved


def validate(result):
    if not math.isfinite(result['duration']) or result['duration'] <= 0:
        raise ValueError('STT_INVALID_DURATION')
    if result['provenance'] != 'LOCAL_STT' or not result['text'].strip():
        raise ValueError('STT_EMPTY_OR_INVALID_PROVENANCE')
    end = 0
    for segment in result['segments']:
        a, b = segment['start'], segment['end']
        if not all(math.isfinite(v) for v in [a,b]) or not 0 <= end <= a <= b <= result['duration']:
            raise ValueError('STT_INVALID_SEGMENT_TIMING')
        cursor = a
        for word in segment['words']:
            if not cursor <= word['start'] <= word['end'] <= b or not word['word'].strip():
                raise ValueError('STT_INVALID_WORD_TIMING')
            cursor = word['end']
        end = b
    if not result['segments']:
        raise ValueError('STT_NO_SEGMENTS')


def block_network():
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1')
    def denied(*args, **kwargs):
        raise RuntimeError('STT_NETWORK_DISABLED')
    socket.socket.connect = denied
    socket.socket.connect_ex = denied
    socket.socket.sendto = denied
    socket.create_connection = denied
    socket.getaddrinfo = denied
    try:
        socket.create_connection(('example.invalid', 443))
    except RuntimeError as error:
        assert str(error) == 'STT_NETWORK_DISABLED'
    else:
        raise AssertionError('Network guard failed')


class FasterWhisperLocalProvider:
    def __init__(self, workspace, model):
        self.workspace = Path(workspace).resolve()
        self.model = private_path(self.workspace, model)
        for name in ['model.bin','config.json','tokenizer.json','vocabulary.txt']:
            if not (self.model/name).is_file():
                raise FileNotFoundError('STT_MODEL_NOT_AVAILABLE: ' + name)
        if digest(self.model/'model.bin') != '3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671':
            raise ValueError('STT_MODEL_HASH_MISMATCH')

    def transcribe(self, source):
        source = private_path(self.workspace, source)
        source_hash = digest(source)
        block_network()
        from faster_whisper import WhisperModel
        from faster_whisper.audio import decode_audio
        started = time.perf_counter()
        model = WhisperModel(str(self.model), device='cpu', compute_type='int8', cpu_threads=4, num_workers=1, local_files_only=True)
        loaded = time.perf_counter()
        audio = decode_audio(str(source), sampling_rate=16000)
        language, probability, _ = model.detect_language(audio)
        segments, info = model.transcribe(audio, language='es', task='transcribe', beam_size=5, temperature=0,
            word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
        rows = []
        flags = []
        for segment in segments:
            words = [dict(start=w.start,end=w.end,word=w.word,probability=w.probability) for w in segment.words]
            rows.append(dict(id=segment.id,start=segment.start,end=segment.end,text=segment.text,
                words=words,avgLogprob=segment.avg_logprob,noSpeechProb=segment.no_speech_prob,compressionRatio=segment.compression_ratio))
            for word in words:
                reasons = []
                if word['probability'] < 0.6: reasons.append('low_model_probability')
                if word['end']-word['start'] <= 0.02: reasons.append('very_short_word_timing')
                if word['end']-word['start'] > 1: reasons.append('long_word_may_span_pause')
                if reasons: flags.append(dict(word=word, reasons=reasons))
            if segment.no_speech_prob > 0.6 or segment.compression_ratio > 2.4:
                flags.append(dict(segment=segment.id,reasons=['possible_silence_or_repetition']))
        finished = time.perf_counter()
        result = dict(provenance='LOCAL_STT',humanVerified=False,timingSource='MODEL_ESTIMATED',
            source=str(source.relative_to(self.workspace)),sourceHash=source_hash,model='Systran/faster-whisper-small',
            modelHash=digest(self.model/'model.bin'),languageRequested='es',languageDetected=language,
            languageProbability=probability,duration=len(audio)/16000,
            text=''.join(r['text'] for r in rows).strip(),segments=rows,reviewFlags=flags)
        validate(result)
        assert digest(source)==source_hash
        performance=dict(modelLoadSeconds=loaded-started,inferenceSeconds=finished-loaded,totalSeconds=finished-started,
            realTimeFactor=(finished-loaded)/result['duration'],cpuThreads=4,device='cpu',computeType='int8',
            offline='local_files_only + HF offline + Python socket/DNS guard tested; no OS-wide network isolation claimed')
        if os.name == 'nt':
            from ctypes import wintypes
            class Memory(ctypes.Structure):
                _fields_ = [('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)] + [(name,ctypes.c_size_t) for name in
                    ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage',
                     'QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
            counters=Memory(); counters.cb=ctypes.sizeof(counters)
            get_process=ctypes.windll.kernel32.GetCurrentProcess
            get_process.restype=wintypes.HANDLE
            read_memory=ctypes.windll.psapi.GetProcessMemoryInfo
            read_memory.argtypes=[wintypes.HANDLE,ctypes.POINTER(Memory),wintypes.DWORD]
            if read_memory(get_process(),ctypes.byref(counters),counters.cb):
                performance['peakWorkingSetBytes']=counters.PeakWorkingSetSize
                performance['workingSetBytes']=counters.WorkingSetSize
        return result, performance


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True)
    parser.add_argument('--model',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    output=private_path(root,args.output)
    output.mkdir(parents=True,exist_ok=False)
    provider=FasterWhisperLocalProvider(root,args.model)
    result, performance=provider.transcribe(args.source)
    (output/'transcript.json').write_text(canonical(result),encoding='utf8')
    (output/'transcript.txt').write_text(result['text']+'\n',encoding='utf8')
    (output/'performance.json').write_text(canonical(performance),encoding='utf8')
    print(canonical(performance))
    print(result['text'])
