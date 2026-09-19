import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('stt_local',Path(__file__).resolve().parents[1]/'scripts/stt_local.py')
stt=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stt)


class SttContractTests(unittest.TestCase):
    def fixture(self):
        return dict(provenance='LOCAL_STT',text='Hola',duration=2,segments=[dict(start=0.5,end=1,words=[dict(start=0.5,end=1,word='Hola')])])

    def test_serialization_and_valid_timing(self):
        data=self.fixture()
        stt.validate(data)
        self.assertEqual(stt.canonical(data),stt.canonical(json.loads(stt.canonical(data))))

    def test_bad_timing_and_empty_text_rejected(self):
        for value in [-1,3,float('nan')]:
            data=self.fixture(); data['segments'][0]['end']=value
            with self.assertRaises(ValueError): stt.validate(data)
        data=self.fixture(); data['text']=' '
        with self.assertRaises(ValueError): stt.validate(data)
        data=self.fixture(); data['segments'][0]['words'][0]['end']=1.5
        with self.assertRaises(ValueError): stt.validate(data)

    def test_private_paths_and_missing_model(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError): stt.private_path(temp,Path(temp)/'public/file.wav')
            with self.assertRaisesRegex(FileNotFoundError,'STT_MODEL_NOT_AVAILABLE'):
                stt.FasterWhisperLocalProvider(temp,Path(temp)/'.local/missing')
            model=Path(temp)/'.local/model'; model.mkdir(parents=True)
            for name in ['model.bin','config.json','tokenizer.json','vocabulary.txt']:
                (model/name).write_text('invalid')
            with self.assertRaisesRegex(ValueError,'STT_MODEL_HASH_MISMATCH'):
                stt.FasterWhisperLocalProvider(temp,model)


if __name__=='__main__': unittest.main()
