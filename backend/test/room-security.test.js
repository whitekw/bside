const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { hashToken } = require('../src/auth')

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port
      probe.close(() => resolve(port))
    })
  })
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Test server did not start')
}

async function withServer(setup, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-security-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const db = createDatabase(databasePath)
  let child
  try {
    const fixture = setup(db)
    db.close()
    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: databasePath,
        PARTICIPANT_LEAVE_GRACE_MS: '20',
        YOUTUBE_API_KEY: '',
      },
      stdio: 'ignore',
    })
    await waitForServer(baseUrl)
    await run({ baseUrl, fixture })
  } finally {
    if (db.isOpen) db.close()
    if (child) {
      const stopped = child.exitCode === null
        ? new Promise((resolve) => child.once('exit', resolve))
        : Promise.resolve()
      child.kill('SIGTERM')
      await stopped
    }
    if (path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
}

async function connectPollingSocket(baseUrl, cookie) {
  const headers = cookie ? { Cookie: cookie } : {}
  const handshake = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, { headers })
  assert.equal(handshake.status, 200)
  const handshakeBody = await handshake.text()
  const { sid } = JSON.parse(handshakeBody.slice(1))
  const pollingUrl = `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`
  const connected = await fetch(pollingUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'text/plain' },
    body: '40',
  })
  assert.equal(connected.status, 200)
  const namespace = await fetch(pollingUrl, { headers })
  assert.match(await namespace.text(), /^40\{/)
  return {
    pollingUrl,
    headers,
    async subscribe(code, participantToken) {
      const posted = await fetch(pollingUrl, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: `42${JSON.stringify(['room:subscribe', { code, participantToken }])}`,
      })
      assert.equal(posted.status, 200)
      const polled = await fetch(pollingUrl, { headers, signal: AbortSignal.timeout(2_000) })
      assert.equal(polled.status, 200)
      const packets = await polled.text()
      assert.match(packets, /room:state/)
    },
  }
}

test('manager HTTP settings and candidate search work while general fields and deletion are forbidden',
  { timeout: 10_000 }, async () => {
    await withServer((db) => {
      db.exec(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
        VALUES ('owner', 'owner', 'Owner', 1, 1, 1), ('manager', 'manager', 'Manager', 1, 1, 1);`)
      const token = crypto.randomBytes(32).toString('base64url')
      db.prepare(`INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
        VALUES ('session', 'manager', ?, ?, ?)`).run(hashToken(token), Date.now(), Date.now() + 60_000)
      const rooms = createRoomService(db)
      const room = rooms.createRoom({ ownerUserId: 'owner' })
      const manager = rooms.joinRoom(room.code, { userId: 'manager', nickname: 'Manager' })
      rooms.setManager(room.code, { userId: 'owner' }, manager.participant.id, true)
      return { room, token }
    }, async ({ baseUrl, fixture }) => {
      const url = `${baseUrl}/api/rooms/${fixture.room.code}`
      const headers = { Cookie: `jukebox_session=${fixture.token}`, 'Content-Type': 'application/json', Origin: baseUrl }
      const patch = (settings) => fetch(`${url}/settings`, { method: 'PATCH', headers, body: JSON.stringify(settings) })
      const allowed = await patch({ autoplayMode: 'random', historyAutoplay: false,
        autoplayFilters: { excludedWords: ['live'], excludedVideoIds: [] } })
      assert.equal(allowed.status, 200)
      assert.equal((await allowed.json()).autoplayMode, 'random')
      const history = await fetch(`${url}/management-history`, { headers })
      assert.equal(history.status, 200)
      const historyPage = await history.json()
      assert.equal(historyPage.items[0].actorName, 'Manager')
      assert.equal(historyPage.items[0].actorRole, 'manager')
      assert.ok(historyPage.items[0].changes.some((change) => change.field === 'excludedWords'))
      assert.equal((await fetch(`${url}/management-history`)).status, 401)
      assert.equal((await fetch(`${url}/management-history?before=bad`, { headers })).status, 400)
      const search = await fetch(`${url}/autoplay/history-videos`, { headers })
      assert.equal(search.status, 200)
      assert.deepEqual((await search.json()).items, [])
      for (const settings of [{ title: 'changed' }, { allowGuests: false }, { title: 'changed', autoplayMode: 'shuffle' }]) {
        const denied = await patch(settings)
        assert.equal(denied.status, 403)
        assert.equal((await denied.json()).error.code, 'OWNER_FORBIDDEN')
      }
      const deniedDelete = await fetch(url, { method: 'DELETE', headers,
        body: JSON.stringify({ confirmationName: fixture.room.code }) })
      assert.equal(deniedDelete.status, 403)
      const state = await (await fetch(url)).json()
      assert.equal(state.autoplayMode, 'random')
      assert.equal(state.allowGuests, true)
    })
  })

test('switching rooms clears the former presence and chat posts are limited per participant',
  { timeout: 10_000 }, async () => {
    await withServer((db) => {
      const userId = crypto.randomUUID()
      db.prepare(
        `INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
         VALUES (?, ?, 'owner', 1, 1, 1)`,
      ).run(userId, userId)
      const rooms = createRoomService(db)
      const first = rooms.createRoom({ ownerUserId: userId })
      const second = rooms.createRoom({ ownerUserId: userId })
      return {
        first,
        second,
        firstGuest: rooms.joinRoom(first.code, { nickname: 'First' }),
        anotherGuest: rooms.joinRoom(first.code, { nickname: 'Another' }),
        secondGuest: rooms.joinRoom(second.code, { nickname: 'Second' }),
      }
    }, async ({ baseUrl, fixture }) => {
      const socket = await connectPollingSocket(baseUrl)
      await socket.subscribe(fixture.first.code, fixture.firstGuest.participantToken)
      await socket.subscribe(fixture.second.code, fixture.secondGuest.participantToken)
      await new Promise((resolve) => setTimeout(resolve, 100))
      const firstRoom = await (await fetch(`${baseUrl}/api/rooms/${fixture.first.code}`)).json()
      assert.equal(firstRoom.participants.some(
        (participant) => participant.id === fixture.firstGuest.participant.id,
      ), false)

      const sendChat = (code, token, content) => fetch(`${baseUrl}/api/rooms/${code}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-participant-token': token },
        body: JSON.stringify({ content }),
      })
      assert.equal((await sendChat(
        fixture.first.code, fixture.firstGuest.participantToken, 'former room only',
      )).status, 201)
      assert.equal((await sendChat(
        fixture.second.code, fixture.secondGuest.participantToken, 'current room only',
      )).status, 201)
      const socketMessages = await fetch(socket.pollingUrl, {
        headers: socket.headers,
        signal: AbortSignal.timeout(2_000),
      })
      assert.equal(socketMessages.status, 200)
      const packet = await socketMessages.text()
      assert.match(packet, /current room only/)
      assert.doesNotMatch(packet, /former room only/)

      const songResponse = await fetch(`${baseUrl}/api/rooms/${fixture.first.code}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: 'aaaaaaaaaaa' }),
      })
      assert.equal(songResponse.status, 401)
      assert.equal((await songResponse.json()).error.code, 'PARTICIPANT_REQUIRED')
      const playableSongResponse = await fetch(`${baseUrl}/api/rooms/${fixture.first.code}/songs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-participant-token': fixture.firstGuest.participantToken,
        },
        body: JSON.stringify({ videoId: 'aaaaaaaaaaa' }),
      })
      assert.equal(playableSongResponse.status, 503)
      assert.equal((await playableSongResponse.json()).error.code, 'YOUTUBE_NOT_CONFIGURED')

      const messageUrl = `${baseUrl}/api/rooms/${fixture.first.code}/messages`
      const postMessage = (token) => fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-participant-token': token },
        body: JSON.stringify({ content: 'Hello' }),
      })
      for (let index = 0; index < 29; index += 1) {
        assert.equal((await postMessage(fixture.firstGuest.participantToken)).status, 201)
      }
      const limited = await postMessage(fixture.firstGuest.participantToken)
      assert.equal(limited.status, 429)
      assert.equal((await limited.json()).error.code, 'RATE_LIMITED')
      const otherParticipant = await postMessage(fixture.anotherGuest.participantToken)
      assert.equal(otherParticipant.status, 201)
    })
  })

test('an account socket is disconnected when its login session expires',
  { timeout: 10_000 }, async () => {
    await withServer((db) => {
      const userId = crypto.randomUUID()
      const sessionToken = crypto.randomBytes(32).toString('base64url')
      const expiresAt = Date.now() + 2_000
      db.prepare(
        `INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
         VALUES (?, ?, 'owner', 1, 1, 1)`,
      ).run(userId, userId)
      db.prepare(
        `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), userId, hashToken(sessionToken), Date.now(), expiresAt)
      const room = createRoomService(db).createRoom({
        ownerUserId: userId,
        nickname: 'Owner',
        participantUserId: userId,
      })
      return { room, sessionToken, expiresAt }
    }, async ({ baseUrl, fixture }) => {
      const cookie = `jukebox_session=${fixture.sessionToken}`
      const socket = await connectPollingSocket(baseUrl, cookie)
      await socket.subscribe(fixture.room.code)
      await new Promise((resolve) => setTimeout(
        resolve,
        Math.max(0, fixture.expiresAt - Date.now() + 150),
      ))
      const session = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: cookie },
      })
      assert.equal((await session.json()).user, null)
      const afterExpiry = await fetch(socket.pollingUrl, { headers: socket.headers })
      assert.ok(afterExpiry.status === 400 || (await afterExpiry.text()).includes('1'))
    })
  })
