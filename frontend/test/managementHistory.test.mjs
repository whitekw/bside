import assert from 'node:assert/strict'
import test from 'node:test'
import { managementHistoryDetails } from '../src/features/room/managementHistory.ts'
const translate = (key, values = {}) => `${key}${Object.values(values).length ? ` · ${Object.values(values).join(', ')}` : ''}`

test('management details show actual before/after values and identify excluded and restored videos', () => {
    const rows = managementHistoryDetails({ targetName: 'Min', changes: [
      { field: 'autoplayMode', before: 'random', after: 'shuffle' },
      { field: 'maxDurationSeconds', before: 600, after: 90 },
      { field: 'hostVolume', before: 100, after: 50 },
      { field: 'historyAutoplay', before: false, after: true },
      { field: 'excludedWords', added: ['live'], removed: ['remix'] },
      { field: 'excludedVideos', added: [{ videoId: 'a', title: 'Song A', artist: 'Artist' }],
        removed: [{ videoId: 'b', title: 'Song B', artist: 'Artist' }] },
      { field: 'isManager', before: false, after: true },
    ] }, translate)
    assert.ok(rows[0].text.includes('roomSettings.mode.shuffle'))
    assert.ok(rows[1].text.includes('10:00 → 1:30'))
    assert.ok(rows[2].text.includes('100% → 50%'))
    assert.equal(rows[6].title, 'Song A')
    assert.equal(rows[6].videoId, 'a')
    assert.equal(rows[7].title, 'Song B')
    assert.notEqual(rows[6].text, rows[7].text)
    assert.ok(rows[8].text.includes('Min'))
})

test('deleted manager targets use the translated anonymous name', () => {
  const rows = managementHistoryDetails({ targetName: null, changes: [{ field: 'isManager', before: true, after: false }] }, translate)
  assert.equal(rows[0].text, 'roomManagement.managerRemoved · roomManagement.deletedUser')
})
