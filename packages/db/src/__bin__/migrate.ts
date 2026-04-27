import { closeDb, initDb, resolveDbPath } from '../client'

console.log(`[galaxy/db] migrating database at ${resolveDbPath()}`)
initDb()
console.log('[galaxy/db] migrations applied successfully')
closeDb()
process.exit(0)
