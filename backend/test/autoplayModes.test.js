const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

function fixture(count = 30, playbackMode = 'host_only') {
  const db = createDatabase()
  db.exec(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
    VALUES ('owner', 'owner', 'Owner', 1, 1, 1), ('manager', 'manager', 'Manager', 1, 1, 1),
      ('listener', 'listener', 'Listener', 1, 1, 1);`)
  let time = 100_000
  const options = { now: () => ++time }
  const rooms = createRoomService(db, options)
  const created = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner', participantUserId: 'owner', playbackMode })
  const roomId = db.prepare('SELECT id FROM rooms WHERE code = ?').get(created.code).id
  const insert = db.prepare(`INSERT INTO songs (id, room_id, video_id, title, artist,
    duration_seconds, thumbnail_url, added_by, status, position, started_at, created_at)
    VALUES (?, ?, ?, ?, 'Artist', 180, 'image', ?, 'played', 0, ?, ?)`)
  for (let index = 0; index < count; index += 1) {
    insert.run(`history-${index}`, roomId, `video-${index}`, `Song ${index}`,
      created.participant.id, index + 1, index + 1)
  }
  const owner = { userId: 'owner' }
  const end = (service = rooms) => service.advance(created.code, { hostToken: created.hostToken }, {
    reason: 'ended', songId: service.getPublicRoom(created.code).currentSong.id,
  })
  const enable = () => rooms.updateRoomSettings(created.code, owner, { historyAutoplay: true })
  const track = (videoId) => ({ videoId, title: videoId, artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image' })
  return { db, rooms, created, roomId, options, owner, end, enable, track, elapse: (ms) => { time += ms } }
}

test('all-device server advancement uses the same persisted shuffle cycle', () => {
  const f = fixture(30, 'all_devices')
  try {
    let state = f.enable()
    const played = new Set()
    for (let index = 0; index < 30; index += 1) {
      assert.equal(state.playbackPending, true)
      assert.ok(!played.has(state.currentSong.videoId))
      played.add(state.currentSong.videoId)
      f.rooms.startPlayback(f.created.code, f.owner, state.currentSong.videoId, 0)
      f.elapse(180_001)
      const advanced = f.rooms.advanceCompletedAllDeviceRooms()
      assert.equal(advanced.length, 1)
      state = advanced[0]
    }
    assert.equal(played.size, 30)
  } finally { f.db.close() }
})

test('shuffle plays all 470 candidates once per cycle through refreshes and service restarts', () => {
  const f = fixture(470)
  try {
    let service = f.rooms
    let state = f.enable()
    assert.equal(state.autoplayMode, 'shuffle')
    let previous
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const played = new Set()
      for (let index = 0; index < 470; index += 1) {
        assert.equal(played.has(state.currentSong.videoId), false)
        assert.notEqual(state.currentSong.videoId, previous)
        played.add(state.currentSong.videoId)
        previous = state.currentSong.videoId
        assert.ok(state.autoplaySuggestions.length <= 20)
        assert.equal(new Set(state.autoplaySuggestions.map((s) => s.videoId)).size, state.autoplaySuggestions.length)
        if (index === 200) {
          service = createRoomService(f.db, f.options)
          assert.deepEqual(service.getPublicRoom(f.created.code).autoplaySuggestions, state.autoplaySuggestions)
        }
        if (index % 43 === 0) {
          const before = state
          state = service.refreshAutoplaySuggestions(f.created.code, f.owner)
          assert.equal(state.currentSong.id, before.currentSong.id)
          assert.equal(state.playbackRevision, before.playbackRevision)
          assert.deepEqual(state.queue, before.queue)
          if (before.autoplaySuggestions.length > 1) {
            assert.notEqual(state.autoplaySuggestions[0].videoId, before.autoplaySuggestions[0].videoId)
          }
        }
        state = f.end(service)
      }
      assert.equal(played.size, 470)
    }
  } finally { f.db.close() }
})

test('manual requests take priority and count as consumed without losing removed queued candidates', () => {
  const f = fixture(30)
  try {
    let state = f.enable()
    const first = state.currentSong.videoId
    const requested = state.autoplaySuggestions[0].videoId
    state = f.rooms.addSong(f.created.code, f.created.participantToken, f.track(requested), 'owner')
    assert.ok(!state.autoplaySuggestions.some((s) => s.videoId === requested))
    const removed = state.autoplaySuggestions[0].videoId
    state = f.rooms.addSong(f.created.code, f.created.participantToken, f.track(removed), 'owner')
    const queued = state.queue.find((s) => s.videoId === removed)
    f.rooms.removeSong(f.created.code, f.owner, queued.id)
    state = f.end()
    assert.equal(state.currentSong.videoId, requested)
    assert.equal(state.currentSong.isAutoplay, false)
    const played = new Set([first, requested])
    for (let index = 0; index < 28; index += 1) {
      state = f.end()
      assert.equal(played.has(state.currentSong.videoId), false)
      played.add(state.currentSong.videoId)
    }
    assert.equal(played.size, 30)
    assert.ok(played.has(removed))
    const newTrack = 'new-video'
    f.rooms.addSong(f.created.code, f.created.participantToken, f.track(newTrack), 'owner')
    state = f.end()
    assert.equal(state.currentSong.videoId, newTrack)
    state = f.end()
    assert.equal(state.autoplayPoolCount, 31)
    assert.notEqual(state.currentSong.videoId, newTrack)
    assert.ok(!state.autoplaySuggestions.some((s) => s.videoId === newTrack))
  } finally { f.db.close() }
})

test('filter changes and disabling preserve consumed tracks; changing modes starts a new cycle', () => {
  const f = fixture()
  try {
    let state = f.enable()
    const consumed = [state.currentSong.videoId, f.end().currentSong.videoId]
    const before = f.rooms.getPublicRoom(f.created.code)
    f.rooms.updateRoomSettings(f.created.code, f.owner, { historyAutoplay: false })
    state = f.enable()
    assert.deepEqual(state.autoplaySuggestions, before.autoplaySuggestions)
    const excluded = state.autoplaySuggestions[0].title
    state = f.rooms.updateRoomSettings(f.created.code, f.owner, { autoplayFilters: {
      ...state.autoplayFilters, excludedWords: [excluded],
    } })
    assert.ok(!state.autoplaySuggestions.some((s) => s.title.includes(excluded)))
    state = f.rooms.updateRoomSettings(f.created.code, f.owner, { autoplayFilters: {
      ...state.autoplayFilters, excludedWords: [],
    } })
    assert.ok(state.autoplaySuggestions.every((s) => !consumed.includes(s.videoId)))
    assert.throws(() => f.rooms.updateRoomSettings(f.created.code, f.owner, {
      autoplayMode: 'invalid', title: 'must roll back',
    }), { code: 'INVALID_AUTOPLAY_MODE' })
    assert.equal(f.rooms.getPublicRoom(f.created.code).title, before.title)
    state = f.rooms.updateRoomSettings(f.created.code, f.owner, { autoplayMode: 'random' })
    assert.equal(state.autoplayMode, 'random')
    assert.equal(state.currentSong.id, before.currentSong.id)
    state = f.rooms.updateRoomSettings(f.created.code, f.owner, { autoplayMode: 'shuffle' })
    assert.equal(state.autoplayMode, 'shuffle')
    assert.notEqual(state.autoplaySuggestions[0].videoId, state.currentSong.videoId)
  } finally { f.db.close() }
})

test('small pools complete cycles and a single eligible video keeps autoplay running', () => {
  for (const count of [10, 20, 21]) {
    const f = fixture(count)
    try {
      let state = f.enable()
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const played = new Set()
        for (let index = 0; index < count; index += 1) {
          assert.ok(!played.has(state.currentSong.videoId))
          played.add(state.currentSong.videoId)
          state = f.end()
        }
        assert.equal(played.size, count)
      }
      state = f.rooms.updateRoomSettings(f.created.code, f.owner, { autoplayFilters: {
        ...state.autoplayFilters, excludedWords: Array.from({ length: count - 1 }, (_, i) => `Song ${i + 1}`),
      } })
      assert.equal(state.autoplayPoolCount, 1)
      assert.equal(f.end().currentSong.videoId, 'video-0')
      assert.equal(f.end().currentSong.videoId, 'video-0')
    } finally { f.db.close() }
  }
})

test('room managers can configure and search autoplay but general settings stay owner-only', () => {
  const f = fixture()
  try {
    const manager = f.rooms.joinRoom(f.created.code, { nickname: 'Manager', userId: 'manager' })
    const listener = f.rooms.joinRoom(f.created.code, { nickname: 'Listener', userId: 'listener' })
    const credentials = { userId: 'manager', participantToken: manager.participantToken }
    assert.throws(() => f.rooms.updateRoomSettings(f.created.code, { hostToken: f.created.hostToken },
      { autoplayMode: 'random' }), { code: 'PARTICIPANT_REQUIRED' })
    f.rooms.setManager(f.created.code, f.owner, manager.participant.id, true)
    let state = f.rooms.updateRoomSettings(f.created.code, credentials, { historyAutoplay: true, autoplayMode: 'random' })
    state = f.rooms.updateRoomSettings(f.created.code, credentials, { autoplayFilters: {
      ...state.autoplayFilters, excludedWords: ['Song 1'],
    } })
    assert.equal(state.autoplayMode, 'random')
    assert.deepEqual(state.autoplayFilters.excludedWords, ['Song 1'])
    assert.ok(f.rooms.listAutoplayHistoryVideos(f.created.code, credentials).items.length > 0)
    for (const settings of [{ title: 'hijack' }, { allowGuests: false }, { title: 'hijack', autoplayMode: 'shuffle' }]) {
      assert.throws(() => f.rooms.updateRoomSettings(f.created.code, credentials, settings), { code: 'OWNER_FORBIDDEN' })
    }
    assert.equal(f.rooms.getPublicRoom(f.created.code).autoplayMode, 'random')
    const listenerCredentials = { userId: 'listener', participantToken: listener.participantToken }
    assert.throws(() => f.rooms.updateRoomSettings(f.created.code, listenerCredentials, { historyAutoplay: false }),
      { code: 'MANAGER_FORBIDDEN' })
    assert.throws(() => f.rooms.listAutoplayHistoryVideos(f.created.code, listenerCredentials), { code: 'MANAGER_FORBIDDEN' })
    f.rooms.setManager(f.created.code, f.owner, manager.participant.id, false)
    assert.throws(() => f.rooms.updateRoomSettings(f.created.code, credentials, { autoplayMode: 'shuffle' }),
      { code: 'MANAGER_FORBIDDEN' })
    assert.throws(() => f.rooms.listAutoplayHistoryVideos(f.created.code, credentials), { code: 'MANAGER_FORBIDDEN' })
  } finally { f.db.close() }
})
