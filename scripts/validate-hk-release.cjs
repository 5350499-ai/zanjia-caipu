const fs = require('fs')
const path = require('path')

const configPath = path.join(__dirname, '..', 'deployment', 'hk-release.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const errors = []

if (config.projectId !== 'zanjia-caipu') errors.push('project_id_mismatch')
if (config.targetEnvironment !== 'hk-candidate') errors.push('target_environment_mismatch')
if (config.migrationClass !== 'NONE') errors.push('unexpected_stateful_migration')
if (config.productionDir === config.releaseRoot || config.productionDir === config.candidateDirPattern) errors.push('production_equals_candidate')
if (config.ports.production === config.ports.candidate) errors.push('candidate_port_equals_production')
if (config.slots.production === config.slots.candidate) errors.push('candidate_slot_equals_production')
if (config.services.production === config.services.candidate) errors.push('candidate_service_equals_production')
if (!config.cutover.atomicSwitch) errors.push('atomic_switch_required')
if (!config.cutover.postCutoverSmokeRequired) errors.push('post_cutover_smoke_required')
if (!config.cutover.automaticRollbackOnSmokeFailure) errors.push('automatic_rollback_required')
if (config.environmentContract.secretValuesStoredOutsideRepository !== true) errors.push('secret_boundary_missing')

const result = {
  valid: errors.length === 0,
  projectId: config.projectId,
  candidateIsProduction: config.productionDir === config.candidateDirPattern,
  distinctSlots: config.slots.production !== config.slots.candidate,
  distinctPorts: config.ports.production !== config.ports.candidate,
  atomicSwitch: config.cutover.atomicSwitch,
  rollbackReady: config.cutover.automaticRollbackOnSmokeFailure,
  errors
}
console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exitCode = 1
