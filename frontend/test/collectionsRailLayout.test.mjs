import assert from 'node:assert/strict'
import test from 'node:test'
import { getMaxCollectionsWidth, readCollectionsRailPreferences, resizeCollectionsRail } from '../src/features/room/collectionsRailLayout.ts'

test('restores sidebar preferences and rejects malformed or invalid stored widths', () => {
  assert.deepEqual(readCollectionsRailPreferences('{bad', false), { expanded: false, width: 200 })
  assert.deepEqual(readCollectionsRailPreferences('{"expanded":true,"width":"400"}', false), { expanded: true, width: 200 })
  assert.deepEqual(readCollectionsRailPreferences('{"expanded":false,"width":9999}', true), { expanded: false, width: 420 })
  assert.deepEqual(readCollectionsRailPreferences('{"expanded":true,"width":280}', false), { expanded: true, width: 280 })
})

test('leaves room for the video and accounts for a docked queue but not an overlay drawer', () => {
  assert.equal(getMaxCollectionsWidth(1024, true), 304)
  assert.equal(getMaxCollectionsWidth(1024, false), 420)
  assert.equal(getMaxCollectionsWidth(768, true), 408)
  assert.equal(getMaxCollectionsWidth(640, true), 280)
  assert.equal(getMaxCollectionsWidth(1920, true), 420)
})

test('dragging closed preserves the previous expanded width and can open the collapsed rail', () => {
  const preferences = { expanded: true, width: 280 }
  assert.deepEqual(resizeCollectionsRail(preferences, 280, -210, 420), { expanded: false, width: 280 })
  assert.deepEqual(resizeCollectionsRail({ expanded: false, width: 280 }, 72, 100, 420), { expanded: true, width: 184 })
})

test('dragging clamps the sidebar at the available maximum', () => {
  assert.deepEqual(resizeCollectionsRail({ expanded: true, width: 200 }, 200, 500, 304), { expanded: true, width: 304 })
  assert.deepEqual(resizeCollectionsRail({ expanded: true, width: 200 }, 200, -50, 420), { expanded: true, width: 184 })
})
