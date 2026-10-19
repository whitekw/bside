const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { searchRoomVideos } = require('../src/roomVideoSearch')

const track = (videoId, title = 'Midnight Song', artist = 'Example Artist') => ({
  videoId, title, artist, durationSeconds: 180, thumbnailUrl: 'https://example.com/cover.jpg', embeddable: true,
})

function fixture() {
  const db = createDatabase()
  db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
    VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
  const rooms = createRoomService(db)
  const room = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
  const credentials = { participantToken: room.participantToken }
  const play = (video) => {
    const song = rooms.addSong(room.code, room.participantToken, video).currentSong
    rooms.advance(room.code, { hostToken: room.hostToken })
    return song.id
  }
  return { db, rooms, room, credentials, play }
}

test('pins matching room history and remote history hits, deduplicates and retains fresh YouTube metadata', async () => {
  const { db, rooms, room, credentials, play } = fixture()
  try {
    play(track('history-only'))
    play(track('overlap'))
    play(track('overlap', 'Latest Midnight Song'))
    play(track('remote-hit', 'A translated title'))
    const videos = [track('new-first'), track('overlap', 'Fresh title'), { ...track('remote-hit'), embeddable: false }, track('new-last')]
    const items = await searchRoomVideos(rooms, { search: async () => videos }, room.code, credentials, 'midnight')
    assert.deepEqual(items.map(v => v.videoId), ['remote-hit', 'overlap', 'history-only', 'new-first', 'new-last'])
    assert.deepEqual(items.map(v => Boolean(v.previouslyPlayed)), [true, true, true, false, false])
    assert.equal(items[1].title, 'Fresh title')
    assert.equal(items[0].embeddable, false)
    assert.equal(rooms.getSearchHistory(room.code, credentials, 'midnight').find(v => v.videoId === 'overlap').title, 'Latest Midnight Song')
  } finally { db.close() }
})

test('searches all history, matches words across title and artist, and supports video URLs', () => {
  const { db, rooms, room, credentials, play } = fixture()
  try {
    play(track('aaaaaaaaaaa', '한글 노래', 'Example Artist'))
    for (let i = 0; i < 35; i++) play(track(`later-${i}`, 'Unrelated'))
    assert.deepEqual(rooms.getSearchHistory(room.code, credentials, '  한글  ARTIST ').map(v => v.videoId), ['aaaaaaaaaaa'])
    assert.deepEqual(rooms.getSearchHistory(room.code, credentials, 'https://youtu.be/aaaaaaaaaaa').map(v => v.videoId), ['aaaaaaaaaaa'])
    assert.equal(rooms.getSearchHistory(room.code, credentials, 'unrelated').length, 30)
    const remoteHistory = rooms.getSearchHistory(room.code, credentials, 'unrelated', ['aaaaaaaaaaa'])
    assert.equal(remoteHistory.length, 31)
    assert.equal(remoteHistory.at(-1).videoId, 'aaaaaaaaaaa')
    assert.equal(rooms.getSearchHistory(room.code, credentials, 'nothing').length, 0)
  } finally { db.close() }
})

test('isolates rooms and excludes current, queued, removed and failed requests', () => {
  const { db, rooms, room, credentials, play } = fixture()
  try {
    const removed = play(track('removed'))
    db.prepare("UPDATE songs SET status = 'removed' WHERE id = ?").run(removed)
    const failed = rooms.addSong(room.code, room.participantToken, track('failed')).currentSong
    rooms.reportPlaybackFailure(room.code, { hostToken: room.hostToken }, { songId: failed.id, videoId: 'failed', errorCode: 150 })
    const other = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Other' })
    rooms.addSong(other.code, other.participantToken, track('other'))
    rooms.advance(other.code, { hostToken: other.hostToken })
    rooms.addSong(room.code, room.participantToken, track('current'))
    rooms.addSong(room.code, room.participantToken, track('queued'))
    assert.deepEqual(rooms.getSearchHistory(room.code, credentials, 'midnight'), [])
  } finally { db.close() }
})

test('validates room access and search input before calling YouTube', async () => {
  const { db, rooms, room, credentials } = fixture()
  let calls = 0
  const youtube = { search: async () => { calls++; return [] } }
  try {
    await assert.rejects(searchRoomVideos(rooms, youtube, room.code, {}, 'midnight'), { code: 'PARTICIPANT_REQUIRED' })
    for (const query of [undefined, ['test'], '', 'x', 'x'.repeat(101)]) {
      await assert.rejects(searchRoomVideos(rooms, youtube, room.code, credentials, query), { code: 'INVALID_QUERY' })
    }
    assert.equal(calls, 0)
    assert.deepEqual(await searchRoomVideos(rooms, youtube, room.code, credentials, 'midnight'), [])
    assert.equal(calls, 1)
  } finally { db.close() }
})
