const assert = require('node:assert/strict')
const { buildAnnualCookingTrend, buildFamilyStats } = require('../lib/cook-events')

const members = [
  { id: 'dad', display_name: '爸爸' },
  { id: 'mom', display_name: '妈妈' },
]
const recipes = [
  { id: 'r1', author_user_id: 'dad' },
  { id: 'r2', author_user_id: 'mom' },
]
const events = [
  { recipe_id: 'r1', user_id: 'dad', cooked_on: new Date('2026-01-03T12:00:00.000Z'), source: 'manual' },
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

const septemberBoundary = [{ recipe_id: 'r1', user_id: 'dad', cooked_on: '2026-08-31T16:00:00.000Z', source: 'recipe_created_with_image' }]
const september = buildFamilyStats(members, [{ id: 'r1', author_user_id: 'dad', created_at: '2026-09-01T10:00:00.000Z' }], septemberBoundary, { period: 'month', year: 2026, month: 9 })
assert.equal(september[0].cookCount, 1)
assert.equal(september[1].cookCount, 0)
console.log('cook-events trend tests: PASS')
