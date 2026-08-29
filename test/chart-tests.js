'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
}

(async () => {
  const fflate = require(path.join(root, 'js', 'vendor', 'fflate.min.js'));
  const ctx = {
    console, setTimeout,
    TextDecoder: util_TextDecoder(),
    fflate
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(root, 'js', 'chartloader.js'), 'utf8');
  vm.runInContext(code + '\n;globalThis.ChartLoader = ChartLoader;', ctx, { filename: 'chartloader.js' });

  function util_TextDecoder() {
    const { TextDecoder } = require('util');
    return TextDecoder;
  }

  console.log('[1] 合成谱面 zip（v2 Info + v2 难度 + v3 难度 + egg 音频 + 封面）');
  const BPM = 100;
  const info = {
    _version: '2.0.1',
    _songName: 'Test Song', _songSubName: 'feat. X', _songAuthorName: 'Artist',
    _levelAuthorName: 'Mapper', _beatsPerMinute: BPM,
    _songFilename: 'song.egg', _coverImageFilename: 'cover.jpg',
    _difficultyBeatmapSets: [
      {
        _beatmapCharacteristicName: 'Standard',
        _difficultyBeatmaps: [
          { _difficulty: 'ExpertPlus', _difficultyRank: 9, _beatmapFilename: 'ExpertPlus.dat', _noteJumpMovementSpeed: 20, _noteJumpStartBeatOffset: 0 },
          { _difficulty: 'Hard', _difficultyRank: 5, _beatmapFilename: 'Hard.dat', _noteJumpMovementSpeed: 14 }
        ]
      },
      {
        _beatmapCharacteristicName: 'OneSaber',
        _difficultyBeatmaps: [
          { _difficulty: 'Easy', _difficultyRank: 1, _beatmapFilename: 'OneSaberEasy.dat' }
        ]
      }
    ]
  };
  const hardV2 = {
    _version: '2.0.1',
    _notes: [
      { _time: 4, _lineIndex: 0, _lineLayer: 0, _type: 0, _cutDirection: 1 },
      { _time: 4, _lineIndex: 3, _lineLayer: 2, _type: 1, _cutDirection: 6 },
      { _time: 8, _lineIndex: 2, _lineLayer: 1, _type: 3, _cutDirection: 0 },
      { _time: 12.5, _lineIndex: 1, _lineLayer: 1, _type: 1, _cutDirection: 8 },
      { _time: 16, _lineIndex: 9, _lineLayer: -3, _type: 0, _cutDirection: 99 }
    ],
    _obstacles: [{ _time: 10, _lineIndex: 0, _duration: 2, _width: 1, _type: 0 }]
  };
  const expertV3 = {
    version: '3.0.0',
    colorNotes: [
      { b: 2, x: 1, y: 0, c: 0, d: 7, a: 0 },
      { b: 6, x: 2, y: 2, c: 1, d: 4, a: 0 }
    ],
    bombNotes: [{ b: 4, x: 0, y: 1 }],
    obstacles: [], events: []
  };
  const oneSaberV2 = {
    _version: '2.2.0',
    _notes: [{ _time: 1, _lineIndex: 2, _lineLayer: 0, _type: 1, _cutDirection: 0 }]
  };

  const zip = fflate.zipSync({
    'Info.dat': fflate.strToU8(JSON.stringify(info)),
    'Hard.dat': fflate.strToU8(JSON.stringify(hardV2)),
    'ExpertPlus.dat': fflate.strToU8(JSON.stringify(expertV3)),
    'OneSaberEasy.dat': fflate.strToU8(JSON.stringify(oneSaberV2)),
    'song.egg': new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3, 4]),
    'cover.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  });

  const loaded = await ctx.ChartLoader.load(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  check('曲名解析', loaded.info.songName === 'Test Song');
  check('BPM 解析', loaded.info.bpm === BPM);
  check('音频定位 song.egg', loaded.audioData.length === 8 && loaded.audioData[0] === 0x4f);
  check('难度数量 = 3', loaded.info.diffs.length === 3, String(loaded.info.diffs.length));
  check('NJS 解析', loaded.info.diffs[0].njs === 20);
  const coverNullInNode = loaded.coverUrl;
  check('封面在 Node 下优雅降级为 null', coverNullInNode === null);

  console.log('[2] v2 难度解析（Hard.dat）');
  const hard = ctx.ChartLoader.parseDifficulty('Hard.dat', loaded._entries);
  check('格式识别 v2', hard.format === 'v2');
  check('音符数=4（bomb 分离，obstacles 忽略）', hard.notes.length === 4, String(hard.notes.length));
  check('炸弹数=1', hard.bombs.length === 1);
  const n0 = hard.notes[0];
  check('红块字段', n0.hand === 0 && n0.col === 0 && n0.layer === 0 && n0.dir === 1);
  check('蓝块字段', hard.notes[1].hand === 1 && hard.notes[1].col === 3 && hard.notes[1].layer === 2);
  check('越界值被钳制', hard.notes[2].col <= 3 && hard.notes[2].layer >= 0 && hard.notes[2].dir <= 8);
  check('排序正确', hard.notes[0].beats === 4 && hard.notes[1].beats === 4 && hard.notes[2].beats === 12.5);

  console.log('[3] v3 难度解析（ExpertPlus.dat）');
  const ep = ctx.ChartLoader.parseDifficulty('ExpertPlus.dat', loaded._entries);
  check('格式识别 v3', ep.format === 'v3');
  check('音符数=2 炸弹=1', ep.notes.length === 2 && ep.bombs.length === 1);
  check('v3 字段 c/d 映射', ep.notes[0].hand === 0 && ep.notes[0].dir === 7);
  check('v3 斜向方向保留', ep.notes[1].dir === 4);

  console.log('[4] beats→秒转换');
  const chart = ctx.ChartLoader.buildGameChart(hard, BPM);
  check('时间换算 beats*60/BPM', Math.abs(chart.notes[0].time - 2.4) < 1e-9, String(chart.notes[0].time));
  check('炸弹进入 notes 且 isBomb=true', chart.notes.some(n => n.isBomb));
  check('全部按时间排序', chart.notes.every((n, i) => i === 0 || n.time >= chart.notes[i - 1].time));

  const oneSaber = ctx.ChartLoader.parseDifficulty('OneSaberEasy.dat', loaded._entries);
  check('OneSaber 蓝块可解析', oneSaber.notes.length === 1 && oneSaber.notes[0].hand === 1);

  console.log('[5] 异常路径');
  let threw = false;
  try { await ctx.ChartLoader.load(new Uint8Array([1, 2, 3]).buffer); } catch (e) { threw = /zip/i.test(e.message); }
  check('非 zip 报错', threw);
  const badZip = fflate.zipSync({ 'readme.txt': fflate.strToU8('no info here') });
  threw = false;
  try { await ctx.ChartLoader.load(badZip.buffer); } catch (e) { threw = /Info\.dat/.test(e.message); }
  check('缺 Info.dat 报错', threw);

  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TESTS FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
