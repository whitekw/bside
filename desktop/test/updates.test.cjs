const test = require('node:test')
const assert = require('node:assert/strict')
const { compareVersions, findUpdate, createUpdateChecker } = require('../updates.cjs')

function release(version, extra = {}) {
  return { tag_name: `desktop-v${version}`, draft: false, prerelease: false,
    assets: [{ name: `B-SIDE-${version}-Setup-x64.exe`, state: 'uploaded',
      browser_download_url: `https://github.com/whitekw/jukebox/releases/download/desktop-v${version}/B-SIDE-${version}-Setup-x64.exe` }], ...extra }
}

test('compares numeric versions rather than string order and rejects ambiguous versions', () => {
  assert.equal(compareVersions('0.2.10', '0.2.9'), 1)
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1)
  assert.equal(compareVersions('0.2.1', '0.2.1'), 0)
  assert.equal(compareVersions('0.2.0', '0.2.1'), -1)
  for (const value of ['v0.2.1', '0.2.1-beta', '0.2', '00.2.1', '99999999999999999999.0.0', null]) {
    assert.equal(compareVersions(value, '0.2.1'), null)
  }
})

test('selects the newest stable Windows installer even when other product releases come first', () => {
  const releases = [{ assets: [] }, release('0.3.0', { prerelease: true }), release('0.4.0', { draft: true }),
    release('0.2.9'), release('0.2.10'), release('0.2.0')]
  assert.equal(findUpdate(releases, '0.2.1').version, '0.2.10')
  assert.equal(findUpdate(releases, '0.2.10'), null)
  assert.equal(findUpdate({}, '0.2.1'), null)
})

test('rejects incomplete assets and downloads outside the exact repository release', () => {
  for (const url of [
    'https://evil.example/setup.exe',
    'https://github.com.evil.example/whitekw/jukebox/releases/download/desktop-v0.2.2/B-SIDE-0.2.2-Setup-x64.exe',
    'https://github.com/other/repo/releases/download/desktop-v0.2.2/B-SIDE-0.2.2-Setup-x64.exe',
    'https://github.com/whitekw/jukebox/releases/download/other/B-SIDE-0.2.2-Setup-x64.exe',
    'http://github.com/whitekw/jukebox/releases/download/desktop-v0.2.2/B-SIDE-0.2.2-Setup-x64.exe',
    `${release('0.2.2').assets[0].browser_download_url}?redirect=evil`,
  ]) {
    const item = release('0.2.2')
    item.assets[0].browser_download_url = url
    assert.equal(findUpdate([item], '0.2.1'), null)
  }
  const item = release('0.2.2')
  item.assets[0].state = 'new'
  assert.equal(findUpdate([item], '0.2.1'), null)
})

test('coalesces checks, throttles retries and preserves known updates through offline failures', async () => {
  let time = 0
  let calls = 0
  let fail = false
  const changes = []
  const checker = createUpdateChecker({ currentVersion: '0.2.1', now: () => time, onChange: (state) => changes.push(state),
    fetchImpl: async (url) => {
      calls++
      assert.equal(url, 'https://api.github.com/repos/whitekw/jukebox/releases?per_page=30')
      if (fail) throw new Error('offline')
      return { ok: true, json: async () => [release('0.2.2')] }
    } })
  assert.deepEqual(checker.getState(), { currentVersion: '0.2.1', availableVersion: null })
  await Promise.all([checker.check(), checker.check()])
  assert.equal(calls, 1)
  assert.deepEqual(changes, [{ currentVersion: '0.2.1', availableVersion: '0.2.2' }])
  assert.equal(checker.getDownloadUrl(), release('0.2.2').assets[0].browser_download_url)
  await checker.check()
  assert.equal(calls, 1)
  time += 30 * 60_000
  fail = true
  await checker.check()
  assert.equal(calls, 2)
  assert.equal(checker.getState().availableVersion, '0.2.2')
  assert.equal(changes.length, 1)
})
