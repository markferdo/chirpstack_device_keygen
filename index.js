const express = require("express")
const path = require("path")
const crypto = require("crypto")

const grpc = require("@grpc/grpc-js")
const device_grpc = require("@chirpstack/chirpstack-api/api/device_grpc_pb")
const device_pb = require("@chirpstack/chirpstack-api/api/device_pb")

require("dotenv").config()

const app = express()

class LoRaDevice {
    #deveui = ""
    #deviceService
    #grpc_metadata
    constructor() {
        this.#deviceService = new device_grpc.DeviceServiceClient(
            process.env.GATEWAY_ADDRESS,
            grpc.credentials.createInsecure()
        )
        this.#grpc_metadata = new grpc.Metadata()
        this.#grpc_metadata.set("authorization", "Bearer " + process.env.LORA_API_TOKEN)
    }

    GenerateDevice(deveui, name) {
        return new Promise((res, rej) => {
            const device = new device_pb.Device()
            device.setDevEui(deveui)
            device.setName(name)
            device.setApplicationId(process.env.APP_ID)
            device.setDeviceProfileId(process.env.DEVICE_PROFILE_ID)
            device.setJoinEui("8000000000000006")

            const deviceReq = new device_pb.CreateDeviceRequest()
            deviceReq.setDevice(device)

            this.#deviceService.create(deviceReq, this.#grpc_metadata, (err, _) => {
                if (err) {
                    rej(`<h1>Error generating device:</h1><p>${err.details}</p>`)
                } else {
                    this.#deveui = deveui
                    res(null)
                }
            })
        })
    }
    GenerateKeys() {
        if (this.#deveui == "") return;

        return new Promise((res, rej) => {
            const deviceKey = crypto.randomBytes(16).toString("hex")
            const deviceKeys = new device_pb.DeviceKeys()
            deviceKeys.setDevEui(this.#deveui)
            deviceKeys.setAppKey(deviceKey)
            deviceKeys.setNwkKey(deviceKey)

            const deviceKeysReq = new device_pb.CreateDeviceKeysRequest()
            deviceKeysReq.setDeviceKeys(deviceKeys)

            this.#deviceService.createKeys(deviceKeysReq, this.#grpc_metadata, (err, _) => {
                if (err) {
                    rej(`<h1>Error generating key:</h1><p>${err.details}</p>`)
                } else {
                    res(deviceKey)
                }
            })
        })
    }
}
const device = new LoRaDevice()

app.get("/", (_, res) => {
    res.sendFile(path.resolve(__dirname, "./static/index.html"))
})
app.get("/keygen", async (req, res) => {
    try {
        const { device_deveui, device_name } = req.query
    
        await device.GenerateDevice(device_deveui, device_name)    
        const key = await device.GenerateKeys();
    
        const js = `
            <script>
                if (confirm("KEY: ${key}")) {
                    navigator.clipboard.writeText("${key}")
                }
                location.href = "/"
            </script>
        `
        res.send(js)
    } catch (e) {
        res.send(e)
    }
})

app.listen(3000, () => {
    console.log("Listening on port: 3000")
})
