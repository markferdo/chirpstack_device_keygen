const express = require("express")
const path = require("path")
const crypto = require("crypto")

const grpc = require("@grpc/grpc-js")
const device_grpc = require("@chirpstack/chirpstack-api/api/device_grpc_pb")
const device_pb = require("@chirpstack/chirpstack-api/api/device_pb")

require("dotenv").config()

const app = express()
const fs = require("fs");
const NVS_FILE = "/app/nvs_data.json"; // Path to the NVS data file for container
//const NVS_FILE = path.resolve(__dirname, "nvs_data.json"); // path to the NVS data file without container

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

        const nvsData = {
            devEui: device_deveui,
            joinEui: "8000000000000006",
            appKey: key
        };

        fs.writeFileSync(NVS_FILE, JSON.stringify(nvsData, null, 4));
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

// defined a route to get the latest device information
app.get("/api/latest-device", (req, res) => {
    try {
        if (fs.existsSync(NVS_FILE)) {
            const data = fs.readFileSync(NVS_FILE, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({ error: "No device has been generated yet." });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to read key file." });
    }
});

// example python code to get the keys from the given route. 
/*
import requests
import serial
import json

data = requests.get("http://localhost:3000/api/latest-device").json() // json format data (deveui, joineui and appkey)

app = serial.Serial('/dev/ttyUSB0', 9600) 
app.write(json.dumps(data).encode())
app.close()

*/

// NVS c++
// esp side needs to use uart to get the data

/*



*/

app.listen(3000, () => {
    console.log("Listening on port: 3000")
})
