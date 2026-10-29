import assert from 'node:assert/strict'
import test from 'node:test'
import { updateNavigationHistory } from '../src/shared/navigationHistory.ts'

test('back and forward preserve the forward stack; a new route discards it', () => {
  let history = { index: 0, maximum: 0 }
  history = updateNavigationHistory(history, 1, 'PUSH')
  history = updateNavigationHistory(history, 2, 'PUSH')
  history = updateNavigationHistory(history, 1, 'POP')
  assert.deepEqual(history, { index: 1, maximum: 2 })
  assert.deepEqual(updateNavigationHistory(history, 2, 'POP'), { index: 2, maximum: 2 })
  history = updateNavigationHistory(history, 0, 'POP')
  history = updateNavigationHistory(history, 1, 'PUSH')
  assert.deepEqual(history, { index: 1, maximum: 1 })
})

test('replacing a route preserves forward entries and missing indices do not enable back navigation', () => {
  assert.deepEqual(updateNavigationHistory({ index: 1, maximum: 3 }, 1, 'REPLACE'), { index: 1, maximum: 3 })
  for (const index of [undefined, null, -1, 1.5, '2']) {
    assert.equal(updateNavigationHistory({ index: 0, maximum: 0 }, index, 'POP').index, 0)
  }
})
