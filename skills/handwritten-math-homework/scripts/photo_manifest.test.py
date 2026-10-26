import importlib.util
import hashlib
import json
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('photo_manifest', SKILL/'scripts/photo_manifest.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def png(width, height):
    def chunk(kind, raw):
        return struct.pack('>I', len(raw)) + kind + raw + struct.pack('>I', zlib.crc32(kind+raw) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('>IIBBBBB',width,height,8,2,0,0,0)) +
            chunk(b'IDAT', zlib.compress((b'\0'+b'\0'*(width*3))*height)) + chunk(b'IEND', b''))

class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.image = self.root/'page.png'
        self.raw = png(2,3)
        self.image.write_bytes(self.raw)
        self.plan = {
            'course':'fixture course','assignment':'fixture assignment',
            'mode':'generate_only','style_reference_count':3,'expected_question_count':2,
            'questions':[
                {'platform_ref':'question-card-1','title':'part 1','photo_paths':['page.png'],'source_kind':'ai_generated'},
                {'platform_ref':'question-card-2','title':'part 2','photo_paths':['page.png'],'source_kind':'ai_generated'}
            ]
        }

    def test_shared_photo_keeps_distinct_questions_and_true_provenance(self):
        result = module.build_manifest(self.plan,self.root)
        self.assertEqual((result['question_count'],result['unique_photo_count']),(2,1))
        photo = result['photos'][0]
        self.assertEqual((photo['width'],photo['height']),(2,3))
        self.assertEqual(photo['sha256'],hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(photo['source_kind'],'ai_generated')
        self.assertFalse(result['upload_performed'])
        self.assertEqual(result['final_submission'],'user_only')

    def test_missing_reference_count_and_duplicate_question_are_rejected(self):
        for count in (0,1,2,5,None):
            self.plan['style_reference_count']=count
            with self.assertRaises(ValueError):
                module.build_manifest(self.plan,self.root)
        self.plan['style_reference_count']=4
        self.plan['questions'][1]['platform_ref']='question-card-1'
        with self.assertRaises(ValueError):
            module.build_manifest(self.plan,self.root)

    def test_count_missing_file_and_provenance_conflict(self):
        self.plan['expected_question_count']=3
        with self.assertRaises(ValueError):
            module.build_manifest(self.plan,self.root)
        self.plan['expected_question_count']=2
        self.plan['questions'][1]['source_kind']='user_photo'
        with self.assertRaises(ValueError):
            module.build_manifest(self.plan,self.root)
        self.plan['questions'][1]['source_kind']='ai_generated'
        self.image.unlink()
        with self.assertRaises(FileNotFoundError):
            module.build_manifest(self.plan,self.root)

    def test_supported_headers_and_invalid_bytes(self):
        self.assertEqual(module.image_header(self.raw),('image/png',2,3))
        jpeg = b'\xff\xd8\xff\xc0'+struct.pack('>H',11)+bytes([8])+struct.pack('>HH',7,9)+bytes([1,1,0x11,0])+b'\xff\xd9'
        self.assertEqual(module.image_header(jpeg),('image/jpeg',9,7))
        for raw in (b'<html>not an image</html>',b'\x89PNG\r\n\x1a\n',b'\xff\xd8\xff\xe0\0\xff'):
            with self.assertRaises(ValueError):
                module.image_header(raw)

    def test_cli_creates_manifest_but_will_not_overwrite_it(self):
        plan_file=self.root/'plan.json';out=self.root/'out.json'
        plan_file.write_text(json.dumps(self.plan))
        command=[sys.executable,str(SKILL/'scripts/photo_manifest.py'),'--plan',str(plan_file),'--output',str(out)]
        first=subprocess.run(command,capture_output=True,text=True)
        self.assertEqual(first.returncode,0,first.stderr)
        content=out.read_bytes()
        second=subprocess.run(command,capture_output=True,text=True)
        self.assertNotEqual(second.returncode,0)
        self.assertEqual(content,out.read_bytes())

if __name__=='__main__':
    unittest.main(verbosity=2)

