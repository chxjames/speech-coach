import test from 'node:test';
import assert from 'node:assert/strict';
import { asrOptions } from '../src/asr.js';

test('multilingual models auto-detect the language unless one is given', () => {
  assert.equal('language' in asrOptions('Xenova/whisper-small', undefined), false);
  assert.equal('language' in asrOptions('Xenova/whisper-small', null), false);
  assert.equal(asrOptions('Xenova/whisper-small', 'chinese').language, 'chinese');
});

test('English-only models never get a language option', () => {
  assert.equal('language' in asrOptions('Xenova/whisper-base.en', 'english'), false);
  assert.equal('language' in asrOptions('Xenova/whisper-small.EN', 'chinese'), false);
});
