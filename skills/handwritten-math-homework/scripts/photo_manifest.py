#!/usr/bin/env python3
"""Read local PNG/JPEG headers and hash verified question-to-photo mappings. No network."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

def image_header(raw):
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        if len(raw) < 33 or raw[12:16] != b'IHDR' or struct.unpack('>I', raw[8:12])[0] != 13:
            raise ValueError('Incomplete PNG IHDR')
        width, height = struct.unpack('>II', raw[16:24])
        mime = 'image/png'
    elif raw.startswith(b'\xff\xd8\xff'):
        pos, width, height = 2, None, None
        sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
        while pos < len(raw):
            if raw[pos] != 0xFF:
                raise ValueError('Invalid JPEG marker')
            while pos < len(raw) and raw[pos] == 0xFF:
                pos += 1
            if pos >= len(raw):
                break
            marker = raw[pos]
            pos += 1
            if marker in {0xD8, 0x01} or 0xD0 <= marker <= 0xD7:
                continue
            if marker in {0xD9, 0xDA}:
                break
            if pos + 2 > len(raw):
                break
            length = struct.unpack('>H', raw[pos:pos+2])[0]
            if length < 2 or pos + length > len(raw):
                raise ValueError('Truncated JPEG segment')
            if marker in sof:
                if length < 8:
                    raise ValueError('Invalid JPEG frame')
                height, width = struct.unpack('>HH', raw[pos+3:pos+7])
                break
            pos += length
        if width is None:
            raise ValueError('JPEG frame dimensions not found')
        mime = 'image/jpeg'
    else:
        raise ValueError('Only PNG and JPEG photo files are supported')
    if width <= 0 or height <= 0:
        raise ValueError('Invalid image dimensions')
    return mime, width, height

def build_manifest(plan, plan_dir):
    for key in ('course', 'assignment'):
        if not isinstance(plan.get(key), str) or not plan[key].strip():
            raise ValueError('Missing ' + key)
    if plan.get('mode') not in ('generate_only', 'stage_for_user_submit'):
        raise ValueError('Unsupported mode')
    if plan.get('style_reference_count') not in (3, 4):
        raise ValueError('Record exactly 3 or 4 handwriting references')
    rows = plan.get('questions')
    if not isinstance(rows, list) or not rows:
        raise ValueError('No questions')
    count = plan.get('expected_question_count')
    if type(count) is not int or count != len(rows):
        raise ValueError('Question count mismatch')
    refs, photos, result = set(), {}, []
    for row in rows:
        ref = row.get('platform_ref', '')
        if not re.fullmatch(r'question-card-\d+', ref) or ref in refs:
            raise ValueError('Invalid or duplicate platform reference')
        refs.add(ref)
        if not isinstance(row.get('title'), str) or not row['title'].strip():
            raise ValueError('Missing original question title')
        if row.get('source_kind') not in ('ai_generated', 'user_photo'):
            raise ValueError('Record true source_kind')
        paths = row.get('photo_paths')
        if not isinstance(paths, list) or not 1 <= len(paths) <= 8:
            raise ValueError('Expected 1-8 photos per connector question')
        linked = []
        for raw_path in paths:
            if not isinstance(raw_path, str) or not raw_path:
                raise ValueError('Invalid photo path')
            p = Path(raw_path).expanduser()
            p = (p if p.is_absolute() else plan_dir / p).resolve(strict=True)
            key = str(p)
            raw = p.read_bytes()
            mime, width, height = image_header(raw)
            item = {'path': key, 'sha256': hashlib.sha256(raw).hexdigest(),
                    'bytes': len(raw), 'mime': mime, 'width': width, 'height': height,
                    'source_kind': row['source_kind']}
            if key in photos and photos[key]['source_kind'] != row['source_kind']:
                raise ValueError('Conflicting provenance for shared photo')
            photos[key] = item
            linked.append(key)
        if len(set(linked)) != len(linked):
            raise ValueError('Duplicate photo within question')
        result.append({'platform_ref': ref, 'title': row['title'], 'photo_paths': linked})
    return {'course': plan['course'], 'assignment': plan['assignment'], 'mode': plan['mode'],
            'style_reference_count': plan['style_reference_count'],
            'question_count': len(result), 'unique_photo_count': len(photos),
            'final_submission': 'user_only', 'upload_performed': False,
            'verification': 'Headers, dimensions, bytes and hashes only; no visual or mathematical assessment.',
            'questions': result, 'photos': list(photos.values())}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        plan = json.loads(args.plan.read_text())
        manifest = build_manifest(plan, args.plan.resolve().parent)
        with args.output.open('x', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
            f.write('\n')
    except (ValueError, KeyError, OSError, TypeError, struct.error) as error:
        parser.exit(1, 'photo_manifest: ' + str(error) + '\n')
    print(json.dumps({'saved': str(args.output.resolve()), 'questions': manifest['question_count'],
                      'unique_photos': manifest['unique_photo_count'], 'uploaded': False}, ensure_ascii=False))

if __name__ == '__main__':
    main()

