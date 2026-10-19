const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createYouTubeUsage, pacificDay, pacificMidnight } = require('../src/youtubeUsage')
const { createYouTubeService } = require('../src/youtube')
const { createYouTubeSync } = require('../src/youtubeSync')
const response = (body = {}, status = 200) => new Response(JSON.stringify(body), { status })

test('Pacific quota dates and resets respect 23-hour and 25-hour daylight saving days', () => {
  assert.equal(pacificDay(Date.parse('2026-03-08T07:59:59Z')), '2026-03-07')
  assert.equal(pacificDay(Date.parse('2026-03-08T08:00:00Z')), '2026-03-08')
  assert.equal(pacificMidnight('2026-03-09') - pacificMidnight('2026-03-08'), 23 * 3600000)
  assert.equal(pacificMidnight('2026-11-02') - pacificMidnight('2026-11-01'), 25 * 3600000)
})

test('tracks attempts, HTTP and network errors, quota errors and day of dispatch without storing credentials', async () => {
  const db = createDatabase()
  let clock = Date.parse('2026-10-19T06:59:59Z')
  const usage = createYouTubeUsage(db, { now: () => clock, searchDailyLimit: 2, dataDailyLimit: 5 })
  try {
    await usage.trackFetch(async () => response(), 'search', 'search', 'https://example.com?key=secret', {})
    const quota = await usage.trackFetch(async () => response({error:{errors:[{reason:'quotaExceeded'}]}}, 403), 'search', 'search', 'url', {})
    assert.equal((await quota.json()).error.errors[0].reason, 'quotaExceeded')
    await assert.rejects(usage.trackFetch(async () => { throw new Error('offline') }, 'video_lookup', 'videos', 'url', {}))
    let resolve
    const pending = usage.trackFetch(() => new Promise(done => { resolve = done }), 'playlist_sync', 'playlistItems', 'url', {})
    assert.equal(usage.snapshot().totals.uncertain, 2)
    clock += 2000
    resolve(response())
    await pending
    const snapshot = usage.snapshot()
    assert.equal(snapshot.day, '2026-10-19')
    assert.equal(snapshot.totals.requests, 0)
    assert.equal(snapshot.resetsAt, Date.parse('2026-10-20T07:00:00Z'))
    const yesterday = snapshot.daily.at(-2)
    assert.equal(yesterday.requests, 4)
    assert.equal(yesterday.searchUnits, 2)
    assert.equal(yesterday.dataUnits, 2)
    assert.equal(yesterday.errors, 2)
    assert.equal(yesterday.quotaErrors, 1)
    assert.equal(yesterday.uncertain, 1)
    assert.equal(snapshot.buckets.search.limit, 2)
    assert.equal(snapshot.buckets.data.limit, 5)
    assert.equal(snapshot.daily[0].collecting, false)
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM youtube_api_usage').all()).includes('secret'), false)
    const restarted = createYouTubeUsage(db, { now: () => clock })
    assert.equal(restarted.snapshot().startedAt, Date.parse('2026-10-19T06:59:59Z'))
    assert.equal(restarted.snapshot().daily.at(-2).requests, 4)
  } finally { db.close() }
})

test('uses configured limits, clamps remaining, keeps only ninety days and tolerates non-JSON API errors', async () => {
  const db = createDatabase()
  let clock = Date.parse('2026-01-01T12:00:00Z')
  const usage = createYouTubeUsage(db, { now: () => clock, searchDailyLimit: 1, dataDailyLimit: 'invalid' })
  try {
    await usage.trackFetch(async () => new Response('failed', {status:500}), 'search', 'search', 'url', {})
    await usage.trackFetch(async () => response(), 'search', 'search', 'url', {})
    assert.deepEqual(usage.snapshot().buckets.search, { used: 2, limit: 1, remaining: 0, percent: 200 })
    assert.equal(usage.snapshot().buckets.data.limit, 10000)
    assert.equal(usage.snapshot().totals.errors, 1)
    clock = Date.parse('2026-04-01T12:00:00Z')
    usage.cleanup()
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM youtube_api_usage').get().n, 0)
  } finally { db.close() }
})

test('API key search counts search and metadata calls separately and skips validation failures', async () => {
  const db = createDatabase()
  const usage = createYouTubeUsage(db)
  const video = {id:'aaaaaaaaaaa',snippet:{title:'Example',channelTitle:'Artist',liveBroadcastContent:'none'},contentDetails:{duration:'PT3M'},status:{embeddable:true,privacyStatus:'public'}}
  const youtube = createYouTubeService('test-key', {usage,fetchImpl:async url => response({items:new URL(url).pathname.endsWith('/search') ? [{id:{videoId:video.id}}] : [video]})})
  try {
    await youtube.search('Example')
    await youtube.search('https://youtu.be/aaaaaaaaaaa')
    await youtube.getVideo('aaaaaaaaaaa')
    await assert.rejects(youtube.search('x'))
    const snapshot = usage.snapshot()
    assert.equal(snapshot.buckets.search.used, 1)
    assert.equal(snapshot.buckets.data.used, 3)
    assert.equal(snapshot.features.find(f => f.source === 'search').requests, 3)
    assert.equal(snapshot.features.find(f => f.source === 'video_lookup').requests, 1)
    assert.equal(snapshot.totals.errors, 0)
    await assert.rejects(createYouTubeService('', {usage}).search('Example'))
    assert.equal(usage.snapshot().totals.requests, 4)
  } finally { db.close() }
})

test('OAuth Data API calls include listing, pagination and sync batches but exclude refresh requests', async () => {
  const crypto = require('node:crypto')
  const db = createDatabase()
  const usage = createYouTubeUsage(db)
  const key = Buffer.alloc(32, 7)
  const iv = Buffer.alloc(12, 8)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const payload = Buffer.concat([cipher.update(JSON.stringify({access:'old',refresh:'refresh-secret',expires:0})),cipher.final()])
  const credentials = Buffer.concat([iv,cipher.getAuthTag(),payload]).toString('base64url')
  db.exec("INSERT INTO users (id,discord_id,username,created_at,updated_at,last_login_at) VALUES ('u','d','Tester',1,1,1)")
  db.prepare('INSERT INTO youtube_connections VALUES (?, ?, ?, ?)').run('u','channel','Channel',credentials)
  const sync = createYouTubeSync(db, {usage,clientId:'client',clientSecret:'secret',redirectUri:'https://example.com/callback',encryptionKey:key.toString('base64'),fetchImpl:async url => {
    const parsed = new URL(url)
    if (parsed.hostname === 'oauth2.googleapis.com') return response({access_token:'new',expires_in:3600})
    if (parsed.pathname.endsWith('/playlists')) return response({items:[{id:'playlist12345',snippet:{channelId:'channel',title:'Playlist'},contentDetails:{itemCount:1}}]})
    if (parsed.pathname.endsWith('/playlistItems')) return response({items:[{contentDetails:{videoId:'aaaaaaaaaaa'}}],...(!parsed.searchParams.has('pageToken') ? {nextPageToken:'page2'} : {})})
    return response({items:[{id:'aaaaaaaaaaa',snippet:{title:'Song',channelTitle:'Artist'},status:{embeddable:true,privacyStatus:'public'},contentDetails:{duration:'PT3M'}}]})
  }})
  try {
    await sync.list('u')
    await sync.sync('u',['playlist12345'])
    const snapshot = usage.snapshot()
    assert.equal(snapshot.features.find(f => f.source === 'playlist_list').requests, 1)
    assert.equal(snapshot.features.find(f => f.source === 'playlist_sync').requests, 4)
    assert.equal(snapshot.buckets.search.used, 0)
    assert.equal(snapshot.buckets.data.used, 5)
    assert.equal(snapshot.totals.requests, 5)
  } finally { db.close() }
})

test('account linking collects channel lookup but not the OAuth authorization-code exchange', async () => {
  const db = createDatabase()
  const usage = createYouTubeUsage(db)
  db.exec("INSERT INTO users (id,discord_id,username,created_at,updated_at,last_login_at) VALUES ('u','d','Tester',1,1,1)")
  db.prepare('INSERT INTO auth_sessions VALUES (?, ?, ?, ?, ?)').run('session','u','session-hash',Date.now(),Date.now()+60000)
  const sync = createYouTubeSync(db, {usage,clientId:'client',clientSecret:'secret',redirectUri:'https://example.com/callback',encryptionKey:Buffer.alloc(32,1).toString('base64'),fetchImpl:async url => {
    if (new URL(url).hostname === 'oauth2.googleapis.com') return response({access_token:'access-secret',refresh_token:'refresh-secret',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.readonly'})
    return response({items:[{id:'channel',snippet:{title:'Channel'}}]})
  }})
  try {
    const flow = sync.authorization('u','session-hash')
    await sync.complete('u','session-hash',new URL(flow.url).searchParams.get('state'),flow.cookie,'code')
    assert.equal(usage.snapshot().features.find(f => f.source === 'account_link').requests, 1)
    assert.equal(usage.snapshot().buckets.data.used, 1)
  } finally { db.close() }
})

test('a statistics write failure does not break the original API response', async t => {
  const db = createDatabase()
  const usage = createYouTubeUsage(db)
  db.close()
  const warn = t.mock.method(console,'error',()=>{})
  const result = await usage.trackFetch(async () => response({ok:true}), 'search','search','url',{})
  assert.deepEqual(await result.json(),{ok:true})
  assert.equal(warn.mock.callCount(),1)
})
