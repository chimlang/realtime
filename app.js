const express = require('express')
const app = express()

// npm install
// express, nodemon, socket.io
// $npx nodemon app.js

// Socket.io setup express server -> http server -> socket server
const http = require('http')
const server = http.createServer(app)
const { Server } = require("socket.io")
// Above line is equivalent to
// const io = require("socket.io");
// const Server = io.Server;
const io = new Server(server, {pingInterval: 2000, pingTimeout: 4000})

const PORT = process.env.PORT || 3000


app.use(express.static('public'))

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

// IP <-> many sockets?
const isOneIpOneSocket = false

// frame interval in ms (15ms for 66.667fps)
const frameInterval = 150 // 150 for lagging server simulation
const frontendFrameInterval = 30 // 33fps

// Will check how long it takes to get this much socket emits from a user
// time should be around or larger than frontendFrameInterval * checkEmitRateFor
// To prevent from
// for (let i = 0; i < 200; i++)
//   {socket.emit('keydown', {k: {w:true, a:false, s:false, d:false}, sequenceNumber});}
const checkEmitRateFor = 30
const checkEmitRateForLong = 300
// Ping fluctutation might cause accumulated emits
const tolerance = 0.8
const toleranceLong = 0.97
const criterion = frontendFrameInterval * checkEmitRateFor * tolerance
const criterionLong = frontendFrameInterval * checkEmitRateForLong * toleranceLong

// walking speed 1.5 m/s running 5 m/s
// speed px / frameInterval ms ???
const speed = 1.0
// attackDuration 500ms. might have to change for different characters and attack types.
const attackDuration = 350
const qcool = 1700

// djfejkefkjf: {x: 100, y:100, color: 'yellow'}
const backendPlayersName = {}
const backendPlayers = {}
const backendPlayersStatus = {}
const backendPlayersFixed = {}
const backendPlayersCool = {}
const ipAlready = {}

// {x, y, w, h, lifetime: ms, owner: socket id}
const attackBoxes = []

// 1454 is length of available name list from SamGukJi wikipedia
const maxPeople = 1454
const nameNumbers = Array.from({length: maxPeople}, (_, i) => i)

const numberOfTeams = 9


io.on('connection', (socket) => {

    console.log('a new connection on!')

    // Do not allow multiple browsers in one IP
    const ipAddress =
        socket.handshake.headers["x-forwarded-for"] ??
        socket.handshake.headers["x-real-ip"] ??
        socket.handshake.address;
    console.log(ipAddress)

    if (ipAlready[ipAddress]) {
        if (isOneIpOneSocket) {
            socket.emit('ipExists')
            socket.disconnect()
            return
        }
        else {
            ipAlready[ipAddress].add(socket.id)
        }
    }
    else {
        ipAlready[ipAddress] = new Set()
        ipAlready[ipAddress].add(socket.id)
    }

    //let nameNumber
    // Reconnecting
    const sessionid = socket.handshake.query.sessionid

    if (sessionid && backendPlayersName[sessionid]) {
        const nameNumber = backendPlayersName[sessionid].n

        console.log(`replacing ${nameNumber}: ${sessionid} -> ${socket.id}`)

        backendPlayersName[socket.id] = { n: nameNumber }
        delete backendPlayersName[sessionid]

        setTimeout(() => {
            const oldSocket = io.sockets.sockets.get(sessionid)
            if (oldSocket) {
                oldSocket.disconnect(true)
            }
        }, 1000)

    }
    else {
        // Make new
        if (nameNumbers.length === 0) {
            socket.emit('maxPeople')
            socket.disconnect()
            return
        }

        const randomIndex = Math.floor(Math.random() * nameNumbers.length)
        const nameNumber = nameNumbers.splice(randomIndex, 1)[0]
        // here, don't worry about race condition, because socket.io is single threaded and only one io.on at a time

        socket.emit("gameSetUp", {'yourid':nameNumber,'frameInterval':frontendFrameInterval, 'speed':speed, 'numberOfTeams': numberOfTeams})

        // `hsl(${parseInt(360 * Math.random())}, 100%, 50%)`
        // x
        // y
        // s sqeuqnceNumber
        // d direction: up left down right
        // m motion: idle or walking or attack1 or attack2
        // l level: size = tileSize (1+ l/maxlevel)
        // h health: maxhealth(l, t)

        // name number
        // c team number -> color
        // t type of character

        //backendPlayersName
        backendPlayersName[socket.id] = {
            n: nameNumber
        }


        backendPlayers[nameNumber] = {
            x: Math.floor(500 * Math.random()),
            y: Math.floor(500 * Math.random()),
            s: 0,
            d: 13, // d = 10*motion + direction
        }


        backendPlayersStatus[nameNumber] = {
            l: 1,
            h: 30
            //,exp: no need if simply kill->levelup
        }

        backendPlayersFixed[nameNumber] = {
            n: nameNumber,
            c: Math.floor(Math.random() * numberOfTeams),
            t: 0
        }

        console.log(backendPlayersFixed)

        backendPlayersCool[nameNumber] = {
            qready: true,
            eready: true
        }

        io.emit('updateNewPlayer', {
            x: backendPlayers[nameNumber].x,
            y: backendPlayers[nameNumber].y,
            l: backendPlayersStatus[nameNumber].l,
            c: backendPlayersFixed[nameNumber].c,
            t: backendPlayersFixed[nameNumber].t,
            n: backendPlayersFixed[nameNumber].n
        })
    }

    // for new player and reconnected player; they should know current enemy positions
    socket.emit('getOldPlayers', {bP: backendPlayers, bPS: backendPlayersStatus, bPF: backendPlayersFixed})

    // io.emit('updatePlayers', backendPlayers) // io.emit for everyone, socket.emit for this user


    // Disconnect
    socket.on('disconnect', (reason) => {
        if (!reason) return
        const currentTime = new Date();
        console.log('a user disconnected because of ' + reason + ' at ' + currentTime)

        ipAlready[ipAddress].delete(socket.id)
        if (ipAlready[ipAddress].size === 0) {
            delete ipAlready[ipAddress]
        }

        const previousid = socket.id
        setTimeout(() => {
            if (backendPlayersName[previousid]) {
                const nameNumber = backendPlayersName[previousid].n

                delete backendPlayers[nameNumber]
                delete backendPlayersStatus[nameNumber]
                delete backendPlayersFixed[nameNumber]
                delete backendPlayersName[socket.id]

                nameNumbers.push(nameNumber)

                io.emit('updatePlayers', backendPlayers)
            }
        }, 7 * 1000)

    })


    socket.on("ping", () => {
        console.log("ping requested")
        socket.emit("pong")
    })


    let lastFrameTime = Date.now()
    let keydownSocketIndex = 0

    let lastFrameTimeLong = Date.now()
    let keydownSocketIndexLong = 0

    socket.on('i', () => {
        const nameNumber = backendPlayersName[socket.id].n
        const d = backendPlayers[nameNumber].d
        backendPlayers[nameNumber].d = d % 10 + 10
        //console.log('idle!!')
    })
    socket.on('k', ({k, s, d}) => {
        // Check correct keys are delivered. otherwise the server crashes!
        if (k == null) return
        if (s == null) return
        if (d == null) return
        // if (!k) return
        // if (!s) return
        // if (!d) return

        // If the control of nameNumber character is lost for this socket.id, then stop
        if (!backendPlayersName[socket.id]) return
        const nameNumber = backendPlayersName[socket.id].n
        // const sequenceNumber = s

        // If you want to check the size of socket
        // console.log(Buffer.byteLength(JSON.stringify({k, s})))

        const decimalValue = parseInt(k, 32)
        const binaryString = decimalValue.toString(2).padStart(6,'0')
        // console.log(binaryString)
        const key = {
            w: parseInt(binaryString[0]),
            a: parseInt(binaryString[1]),
            s: parseInt(binaryString[2]),
            d: parseInt(binaryString[3]),
            q: parseInt(binaryString[4]),
            e: parseInt(binaryString[5])
        }


        keydownSocketIndex++
        if (keydownSocketIndex >= checkEmitRateFor) {
            const currentFrameTime = Date.now()
            // console.log(criterion)
            // console.log(currentFrameTime - lastFrameTime)
            if (currentFrameTime - lastFrameTime < criterion) {
                socket.emit('tooFastEmits')
                socket.disconnect()
                return
            }
            lastFrameTime = currentFrameTime
            keydownSocketIndex = 0
        }

        keydownSocketIndexLong++
        if (keydownSocketIndexLong >= checkEmitRateForLong) {
            const currentFrameTimeLong = Date.now()
            // console.log(criterionLong)
            console.log(currentFrameTimeLong - lastFrameTimeLong - criterionLong)
            if (currentFrameTimeLong - lastFrameTimeLong < criterionLong) {
                socket.emit('tooFastEmits')
                socket.disconnect()
                return
            }
            lastFrameTimeLong = currentFrameTimeLong
            keydownSocketIndexLong = 0
        }

        // const currentFrameTime = Date.now()
        // console.log(currentFrameTime - lastFrameTime)
        // lastFrameTime = currentFrameTime

        // how to prevent users from putting this into console?
        // for (let i = 0; i < 100; i++) {
        // socket.emit('keydown', {keycode: 'KeyS', sequenceNumber});}

        backendPlayers[nameNumber].s = s
        if (key.w) {backendPlayers[nameNumber].y -= speed}
        if (key.a) {backendPlayers[nameNumber].x -= speed}
        if (key.s) {backendPlayers[nameNumber].y += speed}
        if (key.d) {backendPlayers[nameNumber].x += speed}



        if (backendPlayers[nameNumber].d < 30) {
            // currently idle or walking. not attacking
            if (key.q && backendPlayersCool[nameNumber].qready) {
                // make attack box
                attackBoxes.push
                // invalidate further q until one attack ends
                backendPlayers[nameNumber].d = backendPlayers[nameNumber].d % 10 + 30
                backendPlayersCool[nameNumber].qready = false

                setTimeout(() => {
                    backendPlayers[nameNumber].d = backendPlayers[nameNumber].d % 10 + 10
                }, attackDuration)

                setTimeout(() => {
                    backendPlayersCool[nameNumber].qready = true
                }, qcool)
                //console.log('q pressed')
            }
            if (key.e) {
                backendPlayers[nameNumber].d = backendPlayers[nameNumber].d % 10 + 40

                setTimeout(() => {
                    backendPlayers[nameNumber].d = backendPlayers[nameNumber].d % 10 + 10
                }, attackDuration)
            }
        }


        const decimalPoints = 4;
        backendPlayers[nameNumber].y = Math.round(backendPlayers[nameNumber].y * Math.pow(10, decimalPoints)) / Math.pow(10, decimalPoints);
        backendPlayers[nameNumber].x = Math.round(backendPlayers[nameNumber].x * Math.pow(10, decimalPoints)) / Math.pow(10, decimalPoints);

        if (backendPlayers[nameNumber].d < 30) {
            // while attacking, no direction change nor motion change possible
            backendPlayers[nameNumber].d = d
        }
        // switch(keycode) {
        //     case 'KeyW':
        //         backendPlayers[socket.id].y -= speed
        //         break
        //     case 'KeyA':
        //         backendPlayers[socket.id].x -= speed
        //         break
        //     case 'KeyS':
        //         backendPlayers[socket.id].y += speed
        //         break
        //     case 'KeyD':
        //         backendPlayers[socket.id].x += speed
        //         break
        // }
    })
})


setInterval(() => {
    io.emit('updatePlayers', backendPlayers)
    // console.log(Buffer.byteLength(JSON.stringify(backendPlayers)))
}, frameInterval)

server.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`)
})

// From codingApple
// const WebSocket = require('ws')
// const socket = new WebSocket.Server({
//     port: 8081
// })
//
// js script
// <button onclick="socket.send('ㅎㅇ')>버튼</button>">
// let socket = new WebSocket("ws://localhost:8081")
//
// socket.on('connection', (ws, req) => {
//  ws.on('message', (msg) => { console.log('got this msg ' + msg)})
//  ws.send('답장')
// })

// npx nodemon app.js
console.log('haallo123')
// const pi = 3.14
// console.log(Buffer.byteLength(JSON.stringify({k: pi, s: 1})))
// console.log(Buffer.byteLength(JSON.stringify({k: 3.14, s: 1})))