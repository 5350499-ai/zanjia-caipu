const assert = require('node:assert/strict')
const { buildAnnualCookingTrend } = require('../lib/cook-events')

const members = [
  { id: 'dad', display_name: '爸爸' },
  { id: 'mom', display_name: '妈妈' },
]
const recipes = [
  { id: 'r1', author_user_id: 'dad' },
  { id: 'r2', author_user_id: 'mom' },
]
const events = [
  { recipe_id: 'r1', user_id: 'dad', cooked_on: '2026-01-03T12:00:00.000Z', source: 'manual' },
  { recipe_id: 'r1', user_id: 'dad', cooked_on: '2026-08-14', source: 'manual' },
  { recipe_id: 'r2', user_id: 'mom', cooked_on: '2026-08-14T08:00:00+00:00', source: 'manual' },
  { recipe_id: 'r2', user_id: 'mom', cooked_on: '2025-12-31', source: 'manual' },
]

const current = buildAnnualCookingTrend(members, recipes, events, { year: 2026, currentYear: 2026, currentMonth: 8 })
assert.deepEqual(current[0].months.slice(0, 8), [1, 0, 0, 0, 0, 0, 0, 1])
assert.deepEqual(current[1].months.slice(0, 8), [0, 0, 0, 0, 0, 0, 0, 1])
assert.deepEqual(current[0].months.slice(8), [null, null, null, null])

const historical = buildAnnualCookingTrend(members, recipes, events, { year: 2025, currentYear: 2026, currentMonth: 8 })
assert.equal(historical[1].months[11], 1)
assert.equal(historical[1].months.every(value => value === 0 || value === 1), true)
console.log('cook-events trend tests: PASS')
