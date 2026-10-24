const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { createAccountService } = require('../src/account')

function setup(t) {
  const db = createDatabase()
  t.after(() => db.close())
  db.exec(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
    VALUES ('owner', 'owner', 'Owner', 1, 1, 1), ('manager', 'manager', 'Manager', 1, 1, 1),
      ('listener', 'listener', 'Listener', 1, 1, 1);`)
  const timestamp = 1_700_000_000_000
  const rooms = createRoomService(db, { now: () => timestamp })
  const created = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Room owner', participantUserId: 'owner' })
  const manager = rooms.joinRoom(created.code, { userId: 'manager', nickname: 'Room manager' })
  const listener = rooms.joinRoom(created.code, { userId: 'listener', nickname: 'Listener' })
  const owner = { userId: 'owner' }
  const admin = { userId: 'manager', participantToken: manager.participantToken }
  const roomId = db.prepare('SELECT id FROM rooms WHERE code = ?').get(created.code).id
  const list = (before) => rooms.listManagementHistory(created.code, owner, before)
  const update = (settings, credentials = owner) => rooms.updateRoomSettings(created.code, credentials, settings)
  return { db, rooms, created, roomId, manager, listener, owner, admin, list, update, timestamp }
}

test('successful settings changes record actor, timestamp, before/after values and video metadata', (t) => {
  const f = setup(t)
  const videoId = 'abcdefghijk'
  f.rooms.addSong(f.created.code, f.created.participantToken, {
    videoId, title: 'Original song title', artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image',
  }, 'owner')
  assert.deepEqual(f.list(), { items: [], nextCursor: null })
  f.update({ title: 'Changed room', allowGuests: false, autoplayMode: 'random', autoplayFilters: {
    excludedWords: ['live'], excludedVideoIds: [videoId], minDurationSeconds: 60, maxDurationSeconds: 300,
  } })
  const entry = f.list().items[0]
  assert.equal(entry.actorName, 'Room owner')
  assert.equal(entry.actorRole, 'owner')
  assert.equal(entry.createdAt, f.timestamp)
  assert.equal(entry.action, 'settings_changed')
  assert.deepEqual(entry.changes.find((change) => change.field === 'title'), {
    field: 'title', before: f.created.code, after: 'Changed room',
  })
  assert.deepEqual(entry.changes.find((change) => change.field === 'allowGuests'), {
    field: 'allowGuests', before: true, after: false,
  })
  assert.deepEqual(entry.changes.find((change) => change.field === 'minDurationSeconds'), {
    field: 'minDurationSeconds', before: 0, after: 60,
  })
  const snapshot = { videoId, title: 'Original song title', artist: 'Artist' }
  assert.deepEqual(entry.changes.find((change) => change.field === 'excludedVideos'), {
    field: 'excludedVideos', added: [snapshot], removed: [],
  })
  f.update({ autoplayFilters: { excludedWords: [], excludedVideoIds: [] } })
  assert.deepEqual(f.list().items[0].changes.find((change) => change.field === 'excludedVideos'), {
    field: 'excludedVideos', added: [], removed: [snapshot],
  })
  f.db.prepare('DELETE FROM songs WHERE room_id = ?').run(f.roomId)
  f.db.prepare("UPDATE participants SET nickname = 'Renamed' WHERE user_id = 'owner'").run()
  assert.deepEqual(f.list().items[1], entry)
  assert.ok(!JSON.stringify(entry).includes(f.created.participantToken))
  assert.ok(!JSON.stringify(entry).includes(f.created.hostToken))
})

test('no-op, reordered exclusions and rejected writes do not create log entries or partial changes', (t) => {
  const f = setup(t)
  f.update({ title: f.created.code, allowGuests: true, autoplayMode: 'shuffle' })
  assert.equal(f.list().items.length, 0)
  f.update({ autoplayFilters: { excludedWords: ['live', 'remix'], excludedVideoIds: [] } })
  f.update({ autoplayFilters: { excludedWords: ['REMIX', 'ＬＩＶＥ'], excludedVideoIds: [] } })
  assert.equal(f.list().items.length, 1)
  assert.throws(() => f.update({ title: 'rollback', autoplayFilters: {
    excludedWords: [], excludedVideoIds: [], minDurationSeconds: 900, maxDurationSeconds: 1,
  } }), { code: 'INVALID_AUTOPLAY_DURATION' })
  assert.throws(() => f.update({ title: 'unauthorized' }, f.admin), { code: 'OWNER_FORBIDDEN' })
  assert.equal(f.rooms.getPublicRoom(f.created.code).title, f.created.code)
  assert.equal(f.list().items.length, 1)
  f.db.exec(`CREATE TRIGGER reject_management_log BEFORE INSERT ON room_management_entries
    BEGIN SELECT RAISE(ABORT, 'logging unavailable'); END;`)
  assert.throws(() => f.update({ title: 'must roll back with failed audit' }))
  assert.equal(f.rooms.getPublicRoom(f.created.code).title, f.created.code)
})

test('managers can read history and their actions are attributed even when revoking their own role', (t) => {
  const f = setup(t)
  f.rooms.setManager(f.created.code, f.owner, f.manager.participant.id, true)
  f.update({ autoplayMode: 'random' }, f.admin)
  assert.equal(f.rooms.listManagementHistory(f.created.code, f.admin).items[0].actorName, 'Room manager')
  f.rooms.setManager(f.created.code, f.admin, f.manager.participant.id, false)
  const revoked = f.list().items[0]
  assert.equal(revoked.actorRole, 'manager')
  assert.equal(revoked.targetName, 'Room manager')
  assert.equal(revoked.action, 'manager_changed')
  assert.deepEqual(revoked.changes, [{ field: 'isManager', before: true, after: false }])
  for (const credentials of [f.admin, { userId: 'listener', participantToken: f.listener.participantToken }, {},
    { hostToken: f.created.hostToken }]) {
    assert.throws(() => f.rooms.listManagementHistory(f.created.code, credentials))
  }
  const other = f.rooms.createRoom({ ownerUserId: 'listener' })
  assert.deepEqual(f.rooms.listManagementHistory(other.code, { userId: 'listener' }).items, [])
  assert.throws(() => f.rooms.listManagementHistory(other.code, f.owner))
})

test('stable cursors paginate same-timestamp entries through concurrent inserts and reject invalid cursors', (t) => {
  const f = setup(t)
  for (let index = 0; index < 35; index += 1) f.update({ title: `Name ${index}` })
  const first = f.list()
  assert.equal(first.items.length, 30)
  assert.ok(first.nextCursor)
  f.update({ title: 'newest' })
  const second = f.list(first.nextCursor)
  assert.equal(second.items.length, 5)
  assert.equal(second.nextCursor, null)
  assert.equal(new Set([...first.items, ...second.items].map((entry) => entry.id)).size, 35)
  for (const cursor of ['', '0', '-1', '1.5', 'Infinity', '9'.repeat(50), 'bad']) {
    assert.throws(() => f.list(cursor), { code: 'INVALID_MANAGEMENT_CURSOR' })
  }
  assert.deepEqual(f.rooms.listManagementHistory(f.created.code, f.owner), createRoomService(f.db)
    .listManagementHistory(f.created.code, f.owner))
})

test('account withdrawal anonymizes actors and targets and deleting a room cascades its history', (t) => {
  const f = setup(t)
  f.rooms.setManager(f.created.code, f.owner, f.manager.participant.id, true)
  f.update({ autoplayMode: 'random' }, f.admin)
  createAccountService(f.db).remove('manager', 'Manager')
  const entries = f.list().items
  assert.equal(entries[0].actorName, null)
  assert.equal(entries[1].targetName, null)
  assert.equal(f.db.prepare('SELECT actor_user_id FROM room_management_entries ORDER BY sequence DESC LIMIT 1').get().actor_user_id, null)
  f.rooms.deleteOwnedRoom(f.created.code, 'owner', f.created.code)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM room_management_entries').get().count, 0)
})

test('autoplay preview refreshes are recorded with the controller identity', (t) => {
  const f = setup(t)
  f.db.prepare('UPDATE rooms SET history_autoplay = 1 WHERE id = ?').run(f.roomId)
  f.rooms.refreshAutoplaySuggestions(f.created.code, { hostToken: f.created.hostToken })
  const entry = f.list().items[0]
  assert.equal(entry.action, 'autoplay_refreshed')
  assert.equal(entry.actorRole, 'host')
  assert.deepEqual(entry.changes, [])
})
