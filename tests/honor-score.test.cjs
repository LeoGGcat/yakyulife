const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`\nfunction ${nextName}(`, start);
  assert.notEqual(start, -1, `${name}() must exist in index.html`);
  assert.notEqual(end, -1, `${nextName}() must follow ${name}()`);
  return html.slice(start, end);
}

const awardsSource = extractFunction('awards', 'maybeIntl');
const honorScoreSource = extractFunction('honorScore', 'tierOf');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function runAwards(bucket) {
  const context = vm.createContext({
    LV: { MLB: { top: 'MLB', g: 162 } },
    S: {
      lv: 'MLB', seasonFactor: 1, year: 2026, honors: [],
      stats: { [bucket]: { yr: 2, AS: 0 } }, orgTeam: '測試隊',
      pos: 'P', role: 'SP', dpos: null,
      traits: { yips: false, glass: false, phoenix: false }, pool: 0
    },
    clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    chance: () => true,
    isSP: () => true,
    card: () => {},
    tlNote: () => {},
    removeTrait: () => {}
  });
  const awards = vm.runInContext(`(${awardsSource})`, context);
  awards(bucket, {
    d: 0, era: 2.00, IP: 162, G: 27, SV: 0, HLD: 0, SO: 0,
    PA: 0, avg: 0, HR: 0, SB: 0, RBI: 0, H: 0, BB: 0, DEF: 0
  });
  return plain(context.S.honors);
}

function score(bucket, honors, { franchise = false, pos = 'P' } = {}) {
  const context = vm.createContext({
    S: { honors, pos, traits: { franchise } }
  });
  const honorScore = vm.runInContext(`(${honorScoreSource})`, context);
  return plain(honorScore(bucket));
}

test('awards() records the league on 年度最佳投手', () => {
  const honors = runAwards('MLB');
  assert.ok(honors.includes('2026 大聯盟年度最佳投手'));
});

test('年度最佳投手 scores only in its own league', () => {
  const honors = ['2026 中職年度最佳投手'];
  assert.deepEqual(score('CPBL', honors), { sc: 460, mvp: 0, aceN: 1, king: 0 });
  assert.deepEqual(score('NPB', honors), { sc: 0, mvp: 0, aceN: 0, king: 0 });
  assert.deepEqual(score('MLB', honors), { sc: 0, mvp: 0, aceN: 0, king: 0 });
});

test('each league receives only its own 年度最佳投手 score', () => {
  const honors = [
    '2026 中職年度最佳投手',
    '2027 日職年度最佳投手',
    '2028 大聯盟年度最佳投手'
  ];
  for (const bucket of ['CPBL', 'NPB', 'MLB']) {
    assert.deepEqual(score(bucket, honors), { sc: 460, mvp: 0, aceN: 1, king: 0 });
  }
});

test('existing championship, MVP, rookie, title and franchise scores remain unchanged', () => {
  const honors = [
    '2026 中職總冠軍',
    '2026 中職年度MVP',
    '2026 中職新人王',
    '2026 中職救援王',
    '2026 中職明星賽',
    '2026 日職年度MVP'
  ];
  assert.deepEqual(
    score('CPBL', honors, { franchise: true }),
    { sc: 1080, mvp: 1, aceN: 0, king: 1 }
  );
});
