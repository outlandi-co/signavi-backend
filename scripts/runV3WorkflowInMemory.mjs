import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { MongoMemoryReplSet } from "mongodb-memory-server"

const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1 }
})

try {
  const uri = replica.getUri()

  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/testSmartShippingV3ExecutionWorkflowMongo.mjs"],
      {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: "test",
          SQUARE_ENVIRONMENT: "sandbox",
          MONGO_URI: uri,
          DOTENV_CONFIG_PATH: "__signavi_v3_isolated_no_env__.txt",
          DOTENV_CONFIG_QUIET: "true"
        },
        stdio: "inherit"
      }
    )

    child.once("error", reject)

    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Child terminated: ${signal}`))
      } else {
        resolve(code)
      }
    })
  })

  assert.equal(
    exitCode,
    0,
    "Isolated V3 workflow test failed."
  )
  console.log("ISOLATED FULL WORKFLOW: PASS")
  console.log("PROCESS RESTART TEST: START")

  const restartExitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/testSmartShippingV3ProcessRestart.mjs"],
      {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: "test",
          SQUARE_ENVIRONMENT: "sandbox",
          MONGO_URI: uri,
          DOTENV_CONFIG_PATH: "__signavi_v3_isolated_no_env__.txt",
          DOTENV_CONFIG_QUIET: "true"
        },
        stdio: "inherit"
      }
    )

    child.once("error", reject)

    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Restart test terminated: ${signal}`))
      else resolve(code)
    })
  })

  assert.equal(restartExitCode, 0, "Process restart test failed.")
  console.log("ISOLATED PROCESS RESTART: PASS")
  console.log("CONTROLLED RECOVERY TEST: START")

  const recoveryExitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/testSmartShippingV3ControlledRecovery.mjs"],
      {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: "test",
          SQUARE_ENVIRONMENT: "sandbox",
          MONGO_URI: uri,
          DOTENV_CONFIG_PATH: "__signavi_v3_isolated_no_env__.txt",
          DOTENV_CONFIG_QUIET: "true"
        },
        stdio: "inherit"
      }
    )

    child.once("error", reject)

    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Recovery test terminated: ${signal}`))
      } else {
        resolve(code)
      }
    })
  })

  assert.equal(recoveryExitCode, 0, "Controlled recovery test failed.")
  console.log("ISOLATED CONTROLLED RECOVERY: PASS")
  console.log("CONTROLLED RECOVERY RACE TEST: START")

  const raceExitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/testSmartShippingV3ControlledRecoveryRace.mjs"],
      {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: "test",
          SQUARE_ENVIRONMENT: "sandbox",
          MONGO_URI: uri,
          DOTENV_CONFIG_PATH: "__signavi_v3_isolated_no_env__.txt",
          DOTENV_CONFIG_QUIET: "true"
        },
        stdio: "inherit"
      }
    )

    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Recovery race terminated: ${signal}`))
      } else {
        resolve(code)
      }
    })
  })

  assert.equal(raceExitCode, 0, "Controlled recovery race test failed.")
  console.log("ISOLATED CONTROLLED RECOVERY RACE: PASS")
  console.log("REMOTE DATABASE: NOT USED")
} finally {
  await replica.stop()
}