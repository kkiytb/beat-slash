'use strict';

const ChartLoader = (() => {

  function findEntry(entries, name) {
    const lower = name.toLowerCase();
    for (const k of Object.keys(entries)) {
      if (k.toLowerCase() === lower) return entries[k];
    }
    for (const k of Object.keys(entries)) {
      if (k.toLowerCase().endsWith('/' + lower)) return entries[k];
    }
    return null;
  }

  function decodeText(u8) {
    return new TextDecoder('utf-8').decode(u8).replace(/^\uFEFF/, '');
  }

  function pick(obj, ...keys) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  }

  function parseInfo(u8) {
    const raw = JSON.parse(decodeText(u8));
    const setsRaw = pick(raw, '_difficultyBeatmapSets', 'difficultyBeatmapSets') || [];
    const diffs = [];
    for (const set of setsRaw) {
      const characteristic = pick(set, '_beatmapCharacteristicName', 'beatmapCharacteristic', 'characteristic') || 'Standard';
      const list = pick(set, '_difficultyBeatmaps', 'difficultyBeatmaps') || [];
      for (const d of list) {
        diffs.push({
          characteristic,
          difficulty: String(pick(d, '_difficulty', 'difficulty') || 'Unknown'),
          rank: Number(pick(d, '_difficultyRank', 'difficultyRank') || 0),
          filename: pick(d, '_beatmapFilename', 'beatmapFilename', 'beatmapDataFilename'),
          njs: Number(pick(d, '_noteJumpMovementSpeed', 'noteJumpMovementSpeed') || 0) || null,
          offset: Number(pick(d, '_noteJumpStartBeatOffset', 'noteJumpStartBeatOffset') || 0)
        });
      }
    }
    return {
      songName: pick(raw, '_songName', 'songName') || '未知曲名',
      subName: pick(raw, '_songSubName', 'songSubName') || '',
      artist: pick(raw, '_songAuthorName', 'songAuthorName') || '',
      mapper: pick(raw, '_levelAuthorName', 'levelAuthorName') || '',
      bpm: Number(pick(raw, '_beatsPerMinute', 'beatsPerMinute')) || 120,
      songFilename: pick(raw, '_songFilename', 'songFilename') ||
        pick(raw, 'song', 'filename') || '',
      coverFilename: pick(raw, '_coverImageFilename', 'coverImageFilename') ||
        pick(raw, 'coverImage', 'filename') || '',
      previewStart: Number(pick(raw, '_previewStartTime', 'previewStartTime') || 0),
      diffs
    };
  }

  function parseDifficulty(filename, entries) {
    const u8 = findEntry(entries, filename);
    if (!u8) throw new Error(`缺少难度文件 ${filename}`);
    const d = JSON.parse(decodeText(u8));

    if (Array.isArray(d.colorNotes)) {
      const notes = d.colorNotes.map(n => ({
        beats: Number(n.b) || 0,
        col: clampInt(n.x, 0, 3),
        layer: clampInt(n.y, 0, 2),
        hand: n.c === 1 ? 1 : 0,
        dir: clampInt(n.d, 0, 8)
      }));
      const bombs = (d.bombNotes || []).map(b => ({
        beats: Number(b.b) || 0,
        col: clampInt(b.x, 0, 3),
        layer: clampInt(b.y, 0, 2)
      }));
      notes.sort((a, b) => a.beats - b.beats);
      return { format: 'v3', notes, bombs };
    }

    if (Array.isArray(d._notes)) {
      const notes = [];
      const bombs = [];
      for (const n of d._notes) {
        const t = Number(n._type);
        if (t === 0 || t === 1) {
          notes.push({
            beats: Number(n._time) || 0,
            col: clampInt(n._lineIndex, 0, 3),
            layer: clampInt(n._lineLayer, 0, 2),
            hand: t,
            dir: clampInt(n._cutDirection, 0, 8)
          });
        } else if (t === 3) {
          bombs.push({
            beats: Number(n._time) || 0,
            col: clampInt(n._lineIndex, 0, 3),
            layer: clampInt(n._lineLayer, 0, 2)
          });
        }
      }
      notes.sort((a, b) => a.beats - b.beats);
      return { format: 'v2', notes, bombs };
    }

    throw new Error('无法识别的谱面格式（仅支持 v2 / v3）');
  }

  function clampInt(v, lo, hi) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return lo;
    return v < lo ? lo : v > hi ? hi : v;
  }

  async function load(arrayBuffer) {
    if (typeof fflate === 'undefined') throw new Error('解压库未加载');
    let entries;
    try {
      entries = fflate.unzipSync(new Uint8Array(arrayBuffer));
    } catch (e) {
      throw new Error('不是有效的 zip 文件');
    }

    const infoU8 = findEntry(entries, 'Info.dat');
    if (!infoU8) throw new Error('zip 中找不到 Info.dat');
    const info = parseInfo(infoU8);

    if (!info.songFilename) throw new Error('Info.dat 未指定音频文件');
    const audioU8 = findEntry(entries, info.songFilename);
    if (!audioU8) throw new Error(`zip 中找不到音频文件 ${info.songFilename}`);

    if (!info.diffs.length) throw new Error('Info.dat 中没有任何难度');

    let coverUrl = null;
    if (info.coverFilename) {
      const coverU8 = findEntry(entries, info.coverFilename);
      if (coverU8 && typeof Blob !== 'undefined' && URL.createObjectURL) {
        coverUrl = URL.createObjectURL(new Blob([coverU8]));
      }
    }

    return { info, audioData: audioU8, coverUrl, _entries: entries };
  }

  function buildGameChart(diffParsed, bpm, oneSaber) {
    const spb = 60 / bpm;
    let notes = diffParsed.notes.map(n => ({
      time: n.beats * spb,
      hand: n.hand,
      col: n.col,
      layer: n.layer,
      dir: n.dir,
      isBomb: false
    }));
    if (oneSaber) {
      notes = notes.filter(n => n.hand !== 0);
    }
    for (const b of diffParsed.bombs) {
      notes.push({ time: b.beats * spb, hand: -1, col: b.col, layer: b.layer, dir: -1, isBomb: true });
    }
    notes.sort((a, b) => a.time - b.time);
    return { notes };
  }

  return { load, parseDifficulty, parseInfo, buildGameChart, __test: { findEntry, parseDifficulty } };
})();
window.ChartLoader = ChartLoader;
