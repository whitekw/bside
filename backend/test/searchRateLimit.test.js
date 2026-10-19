const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

test('room and public searches share a per-IP budget across room codes', { timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-search-limit-'))
  const databasePath = path.join(directory, 'test.sqlite')
  const db = createDatabase(databasePath)
  let child
  try {
    db.exec("INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at) VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)")
    const rooms = createRoomService(db)
    const first = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
    const second = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
    db.close()
    const probe = net.createServer()
    probe.listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const port = probe.address().port
    await new Promise(resolve => probe.close(resolve))
    const base = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath, YOUTUBE_API_KEY: '', TRUST_PROXY: 'true' },
      stdio: 'ignore',
    })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break } } catch { /* The child is starting. */ }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'test server starts')
    // Invalid queries exercise both real routes without making a YouTube call.
    const search = async (room, ip = '192.0.2.1') => {
      const url = room ? `/api/rooms/${room.code}/search?q=x` : '/api/youtube/search?q=x'
      const response = await fetch(base + url, { headers: {
        'x-forwarded-for': ip,
        ...(room ? { 'x-participant-token': room.participantToken } : {}),
      } })
      return { status: response.status, remaining: response.headers.get('ratelimit-remaining'), body: await response.json() }
    }
    for (let i = 0; i < 30; i++) {
      const result = await search([first, second, null][i % 3])
      assert.equal(result.status, 400)
      assert.equal(result.body.error.code, 'INVALID_QUERY')
      assert.equal(result.remaining, String(29 - i))
    }
    for (const room of [first, second, null]) {
      const result = await search(room)
      assert.equal(result.status, 429)
      assert.equal(result.body.error.code, 'RATE_LIMITED')
      assert.equal(result.remaining, '0')
    }
    const separateIp = await search(second, '192.0.2.2')
    assert.equal(separateIp.status, 400)
    assert.equal(separateIp.remaining, '29')
    assert.equal((await fetch(`${base}/api/rooms/${first.code}`)).status, 200)
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    if (db.isOpen) db.close()
    fs.rmSync(directory, {recursive: true, force: true})
  }
})
