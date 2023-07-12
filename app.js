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
// const isOneIpOneSocket = false
const allowedSocketsPerIP = 5

// frame interval in ms (15ms for 66.667fps)
const frameInterval = 60 // 150 for lagging server simulation
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
const speed = 3
const tileSize = 64
const mapWidth = 100
const mapHeight = 100

const basehealth = 30
const maxlevel = 99
const maxmaxhealth = 99

const castleDeal = 2
const castleMaxHealth = 60

// attackDuration 500ms. might have to change for different characters and attack types.
const attackDuration = 400 // larger than attack motion time
// const qcool = 3000
// const ecool = 1000

const characterType = {
    0: {type: 'sword', qcool:800, ecool:1500, offX: 0.15 * tileSize, offY: 0.1 * tileSize, range: tileSize / 4, damage: 6},
    1: {type: 'axe', qcool:800, ecool:3000, offX: 0.15 * tileSize, offY: 0.1 * tileSize, range: tileSize / 4, damage: 4},
    2: {type: 'bow', qcool:800, ecool:1300, offX: 0.15 * tileSize, offY: 0.09 * tileSize, range: tileSize / 3, damage: 3},
    3: {type: 'mounted', qcool:1100, ecool:5000, offX: 0.15 * tileSize, offY: 0.09 * tileSize, range: tileSize / 3, damage: 8}
}
const arrowSpeed = 8
const axeSpeed = 5

const waitingPlayersQue = []

// djfejkefkjf: {x: 100, y:100, color: 'yellow'}
const backendPlayersName = {}
const backendPlayers = {}
const backendPlayersStatus = {}
const backendPlayersFixed = {}
const backendPlayersCool = {}
const ipAlready = {}

const backendPlayersBox = {}

const boxTopLeftOfPlayers = Array.from({length: mapWidth * mapHeight}, () => new Set())

// {x, y, w, h, lifetime: ms, owner: socket id}
let attackBoxes = []

// 1454 is length of available name list from SamGukJi wikipedia
const totalNumberOfNames = 1454
const nameNumbers = Array.from({length: totalNumberOfNames}, (_, i) => i)

const maxPeople = 50

const numberOfTeams = 4 // {1: 'cyan', 2:'lime', 3:'purple', 4:'red'}

//const map = require('./public/battlemap.js');

// new Set of coords of tiles that players collide and blocked.
// walls.has(x_tile + y_tile * tilesInRow) true => blocked
const walls = require('./public/obstacles.js');

const villages = require('./public/villages.js');

class Castle {
    constructor({number, position, owner, health = castleMaxHealth}) {
        this.number = number
        this.position = new Set(position)
        this.owner = owner
        this.health = health
    }

    captured(nameNumber) {
        this.owner = backendPlayersFixed[nameNumber].c // Team Number
        this.health = castleMaxHealth
        levelup(nameNumber)
        levelup(nameNumber)
        levelup(nameNumber)
        levelup(nameNumber)
        levelup(nameNumber)
        io.emit('castle',{where:this.number, who:nameNumber})
    }
}
const castles = {
    1: new Castle({number:1, position:[1712,1713,1812,1813], owner: 2}),
    2: new Castle({number:2, position:[1188,1189,1288,1289], owner: 0}),
    3: new Castle({number:3, position:[4524,4525,4624,4625], owner: -1}),
    4: new Castle({number:4, position:[4059,4060,4159,4160], owner: -1}),
    5: new Castle({number:5, position:[8013,8014,8113,8114], owner: 3}),
    6: new Castle({number:6, position:[7586,7587,7686,7687], owner: 1})
}


const checkTheseTiles = []
// i for y, j for x
for (let i = 0; i < mapWidth; i++) {
    for (let j = 0; j < mapHeight; j++) {
        if (walls.has(i * mapWidth + j)) {
            checkTheseTiles.push({x: j * tileSize, y: i * tileSize - 2, width: tileSize, height: tileSize - 18}) // -2 for 2 pixel above wall, -18 for head can overlap
        }
    }
}
// for (let i = 0; i < map.length; i++) {
//     for (let j = 0; j < map[i].length; j++) {
//         if (walls.has(map[i][j])) {
//             checkTheseTiles.push({x: j * tileSize, y: i * tileSize, width: tileSize, height: tileSize - 15}) // -15 for head can overlap
//         }
//     }
// }


io.on('connection', (socket) => {


    // const newConnectionTime = new Date();
    // console.log(`a new connection on! ${newConnectionTime}`)

    // Do not allow multiple browsers in one IP
    const ipAddressTotal =
        socket.handshake.headers["x-forwarded-for"] ??
        socket.handshake.headers["x-real-ip"] ??
        socket.handshake.address;
    // console.log(socket.id)
    // console.log(ipAddress)

    const ipAddress = ipAddressTotal.split(',')[0]

    if (ipAlready[ipAddress]) {
        // if (isOneIpOneSocket) {
        //     socket.emit('ipExists')
        //     socket.disconnect()
        //     return
        // }

        if (ipAlready[ipAddress].size + 1 > allowedSocketsPerIP) {
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

    // console.log(ipAlready)

    //let nameNumber
    // Reconnecting
    const sessionid = socket.handshake.query.sessionid

    // console.log(`selectedClass: ${socket.handshake.query.selectedClass} type ${typeof socket.handshake.query.selectedClass}`)

    if (sessionid && backendPlayersName[sessionid]) {
        const nameNumber = backendPlayersName[sessionid].n

        // console.log(`replacing ${nameNumber}: ${sessionid} -> ${socket.id}`)

        backendPlayersName[socket.id] = { n: nameNumber }
        delete backendPlayersName[sessionid]

        socket.emit('getOldPlayers', {bP: backendPlayers, bPS: backendPlayersStatus, bPF: backendPlayersFixed})
        socket.emit('getCastleStatus', [castles[1].owner, castles[2].owner, castles[3].owner, castles[4].owner, castles[5].owner, castles[6].owner])


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
            socket.emit('noMoreName')
            socket.disconnect()
            return
        }


        if (Object.keys(backendPlayersName).length + 1 > maxPeople) {
            // Waiting list
            waitingPlayersQue.push(socket)
            socket.join('waitingPlayers')
            socket.emit('Q=?', waitingPlayersQue.length)
            // socket.emit('Full')
            // socket.disconnect()
            // return
        }
        else {
            // No waiting.
            makeNewPlayer(socket)

            socket.emit('getOldPlayers', {bP: backendPlayers, bPS: backendPlayersStatus, bPF: backendPlayersFixed})
            socket.emit('getCastleStatus', [castles[1].owner, castles[2].owner, castles[3].owner, castles[4].owner, castles[5].owner, castles[6].owner])

        }


    }

    // for new player and reconnected player; they should know current enemy positions
    // socket.emit('getOldPlayers', {bP: backendPlayers, bPS: backendPlayersStatus, bPF: backendPlayersFixed})
    // socket.emit('getCastleStatus', [castles[1].owner, castles[2].owner, castles[3].owner, castles[4].owner, castles[5].owner, castles[6].owner])

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

        const idx = waitingPlayersQue.indexOf(socket)
        if (idx > -1) {
                waitingPlayersQue.splice(idx, 1)
                return
        }


        const previousid = socket.id
        setTimeout(() => {
            if (backendPlayersName[previousid]) {
                const nameNumber = backendPlayersName[previousid].n

                const previousTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
                const previousTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)
                boxTopLeftOfPlayers[previousTopLeftY * mapWidth + previousTopLeftX].delete(nameNumber)

                delete backendPlayers[nameNumber]
                delete backendPlayersStatus[nameNumber]
                delete backendPlayersFixed[nameNumber]
                delete backendPlayersName[socket.id]

                delete backendPlayersCool[nameNumber]
                delete backendPlayersBox[nameNumber]

                nameNumbers.push(nameNumber)

                // socket.to('joinedPlayers').emit('P', backendPlayers)

                if (waitingPlayersQue.length > 0) {
                    const nextPlayerSocket = waitingPlayersQue.shift()

                    makeNewPlayer(nextPlayerSocket)
                    // nextPlayerSocket.join('joinedPlayers')
                    nextPlayerSocket.to('waitingPlayers').emit('Q=?', waitingPlayersQue.length)
                    nextPlayerSocket.leave('waitingPlayers')

                    // nextPlayerSocket.to('joinedPlayers').emit('updateNewPlayer', {
                    //     x: backendPlayers[nameNumber].x,
                    //     y: backendPlayers[nameNumber].y,
                    //     l: backendPlayersStatus[nameNumber].l,
                    //     c: backendPlayersFixed[nameNumber].c,
                    //     t: backendPlayersFixed[nameNumber].t,
                    //     n: backendPlayersFixed[nameNumber].n
                    // })
                    nextPlayerSocket.emit('getOldPlayers', {bP: backendPlayers, bPS: backendPlayersStatus, bPF: backendPlayersFixed})
                    nextPlayerSocket.emit('getCastleStatus', [castles[1].owner, castles[2].owner, castles[3].owner, castles[4].owner, castles[5].owner, castles[6].owner])


                }
            }
        }, 7 * 1000)

    })


    socket.on("ping", () => {
        // console.log("ping requested")
        socket.emit("pong")
    })


    let lastFrameTime = Date.now()
    let keydownSocketIndex = 0

    let lastFrameTimeLong = Date.now()
    let keydownSocketIndexLong = 0

    socket.on('i', () => {
        if (!backendPlayersName[socket.id]) return
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

        if (backendPlayersStatus[nameNumber].isDead) return

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


        // keydownSocketIndex++
        // if (keydownSocketIndex >= checkEmitRateFor) {
        //     const currentFrameTime = Date.now()
        //     // console.log(criterion)
        //     // console.log(currentFrameTime - lastFrameTime)
        //     if (currentFrameTime - lastFrameTime < criterion) {
        //         // socket.emit('tooFastEmits')
        //         // socket.disconnect()
        //         return
        //     }
        //     lastFrameTime = currentFrameTime
        //     keydownSocketIndex = 0
        // }

        // keydownSocketIndexLong++
        // if (keydownSocketIndexLong >= checkEmitRateForLong) {
        //     const currentFrameTimeLong = Date.now()
        //     // console.log(criterionLong)
        //     // console.log(currentFrameTimeLong - lastFrameTimeLong - criterionLong)
        //     if (currentFrameTimeLong - lastFrameTimeLong < criterionLong) {
        //         // socket.emit('tooFastEmits')
        //         // socket.disconnect()
        //         return
        //     }
        //     lastFrameTimeLong = currentFrameTimeLong
        //     keydownSocketIndexLong = 0
        // }


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
            // console.log(currentFrameTimeLong - lastFrameTimeLong - criterionLong)
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

        // const playerXstart = Math.floor((backendPlayers[nameNumber].x + 10.67) / 96)
        // const playerXend = Math.floor((backendPlayers[nameNumber].x + 96 - 10.67) / 96)
        // const playerYstart = Math.floor((backendPlayers[nameNumber].y + 10.67) / 96)
        // const playerYend = Math.floor((backendPlayers[nameNumber].y + 96 - 10.67) / 96)

        // const checkTheseTiles = []
        // for (let i =  playerXstart - 1; i <= playerXend + 1; i++) {
        //     for (let j =  playerYstart - 1; j <= playerYend + 1; j++) {
        //         if (i >= 0 && i < map.length && j >= 0 && j < map[i].length) {
        //             if (walls.has(map[i][j])) {
        //                 checkTheseTiles.push({x: j * 96, y: i * 96, width: 96, height: 96 - 20}) // -20 for head can overlap
        //             }
        //         }
        //     }
        // }





        if (key.w) {
            const previousTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
            const previousTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)

            backendPlayers[nameNumber].y -= backendPlayersCool[nameNumber].speed


            let isblocked = false

            const playerBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].h}

            if (playerBox.y < 0) {
                backendPlayers[nameNumber].y += backendPlayersCool[nameNumber].speed
                isblocked = true
            }

            // if (!isblocked) {
            //     for (const tileRect of checkTheseTiles) {
            //         // console.log(`checking ${tileRect}`)
            //         if (rectangularCollision({ rectangle1: playerBox, rectangle2:tileRect })) {
            //             // console.log("!!!")
            //             backendPlayers[nameNumber].y += backendPlayersCool[nameNumber].speed
            //             isblocked = true
            //             break
            //         }
            //     }
            // }

            const playerBoxTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
            const playerBoxTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)

            if (!isblocked) {
                outerLoop: for (let i = Math.max(0, playerBoxTopLeftX - 1); i < Math.min(mapWidth, playerBoxTopLeftX + 1 + 1); i++) {
                    for (let j = Math.max(0, playerBoxTopLeftY - 1); j < playerBoxTopLeftY + 1; j ++) {
                        // because of head room space, character left-top point can go inside block. so, playerBoxTopLeftY "+ 1" necessary
                        // character left-top is not the same as player x y. take into account white space of character sprite.

                        if (walls.has(i + j * mapWidth)) {
                            if (rectangularCollision({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})) {
                                backendPlayers[nameNumber].y += backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }

                        for (const otherName of boxTopLeftOfPlayers[i + j * mapWidth]) {
                            if (parseInt(otherName) !== parseInt(nameNumber) && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
                                backendPlayers[nameNumber].y += backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }
                    }
                }
            }
            // if (!isblocked) {
            //     outerLoop: for (let i = playerXtile; i < Math.min(mapWidth - 1, playerXtile + 1); i++) {
            //         for (let j = Math.max(0, playerYtile - 1); j < playerYtile; j ++) {


            //             if (walls.has(i + j * mapWidth)) {
            //                 console.log({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})
            //                 if (rectangularCollision({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})) {
            //                     backendPlayers[nameNumber].y += backendPlayersCool[nameNumber].speed
            //                     isblocked = true
            //                     break outerLoop
            //                 }
            //             }
            //         }
            //     }
            // }

            // if (!isblocked) {
            //     for (const otherName in backendPlayers) {
            //         if (parseInt(otherName) !== nameNumber && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
            //             backendPlayers[nameNumber].y += backendPlayersCool[nameNumber].speed
            //             isblocked = true
            //             break
            //         }
            //     }
            // }

            if (!isblocked) {

                if (previousTopLeftY !== playerBoxTopLeftY || previousTopLeftX !== playerBoxTopLeftX) {
                    boxTopLeftOfPlayers[previousTopLeftY * mapWidth + previousTopLeftX].delete(nameNumber)
                    boxTopLeftOfPlayers[playerBoxTopLeftY * mapWidth + playerBoxTopLeftX].add(nameNumber)
                }
            }
        }

        if (key.a) {
            const previousTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
            const previousTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)

            backendPlayers[nameNumber].x -= backendPlayersCool[nameNumber].speed

            let isblocked = false

            const playerBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].h} //{x: backendPlayers[nameNumber].x + 12.67, y: backendPlayers[nameNumber].y + 10.67, width: 96.77 - 12.67 * 2, height: 96.77 - 10.67 * 2}

            if (playerBox.x < 0) {
                backendPlayers[nameNumber].x += backendPlayersCool[nameNumber].speed
                isblocked = true
            }

            // if (!isblocked) {
            //     for (const tileRect of checkTheseTiles) {
            //         // console.log(`checking ${tileRect}`)
            //         if (rectangularCollision({ rectangle1: playerBox, rectangle2:tileRect })) {
            //             // console.log("!!!")
            //             backendPlayers[nameNumber].x += backendPlayersCool[nameNumber].speed
            //             isblocked = true
            //             break
            //         }
            //     }
            // }

            const playerBoxTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
            const playerBoxTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)

            if (!isblocked) {
                outerLoop: for (let i = Math.max(0, playerBoxTopLeftX - 1); i < playerBoxTopLeftX + 1; i++) {
                    for (let j = Math.max(0, playerBoxTopLeftY - 1); j < Math.min(mapHeight, playerBoxTopLeftY + 1 + 1); j ++) {
                        // because of head room space, character left-top point can go inside block. so, playerBoxTopLeftY "+ 1" necessary
                        // character left-top is not the same as player x y. take into account white space of character sprite.

                        if (walls.has(i + j * mapWidth)) {
                            if (rectangularCollision({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})) {
                                // console.log({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})
                                backendPlayers[nameNumber].x += backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }

                        for (const otherName of boxTopLeftOfPlayers[i + j * mapWidth]) {
                            if (parseInt(otherName) !== parseInt(nameNumber) && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
                                backendPlayers[nameNumber].x += backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }
                    }
                }
            }


            // if (!isblocked) {
            //     for (const otherName in backendPlayers) {
            //         if (parseInt(otherName) !== nameNumber && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
            //             backendPlayers[nameNumber].x += backendPlayersCool[nameNumber].speed
            //             break
            //         }
            //     }
            // }

            if (!isblocked) {

                if (previousTopLeftY !== playerBoxTopLeftY || previousTopLeftX !== playerBoxTopLeftX) {
                    boxTopLeftOfPlayers[previousTopLeftY * mapWidth + previousTopLeftX].delete(nameNumber)
                    boxTopLeftOfPlayers[playerBoxTopLeftY * mapWidth + playerBoxTopLeftX].add(nameNumber)
                }
            }
        }

        if (key.s) {
            const previousTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
            const previousTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)

            backendPlayers[nameNumber].y += backendPlayersCool[nameNumber].speed

            let isblocked = false

            const playerBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].h} //{x: backendPlayers[nameNumber].x + 12.67, y: backendPlayers[nameNumber].y + 10.67, width: 96.77 - 12.67 * 2, height: 96.77 - 10.67 * 2}

            if (playerBox.y + backendPlayersBox[nameNumber].h > mapHeight * tileSize) {
                backendPlayers[nameNumber].y -= backendPlayersCool[nameNumber].speed
                isblocked = true
            }

            // if (!isblocked) {
            //     for (const tileRect of checkTheseTiles) {
            //         // console.log(`checking ${tileRect}`)
            //         if (rectangularCollision({ rectangle1: playerBox, rectangle2:tileRect })) {
            //             // console.log("!!!")
            //             backendPlayers[nameNumber].y -= backendPlayersCool[nameNumber].speed
            //             isblocked = true
            //             break
            //         }
            //     }
            // }

            const playerBoxBottomLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
            const playerBoxBottomLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY + backendPlayersBox[nameNumber].h) / tileSize)

            if (!isblocked) {
                outerLoop: for (let i = Math.max(0, playerBoxBottomLeftX - 1); i < Math.min(mapWidth, playerBoxBottomLeftX + 1 + 1); i++) {
                    for (let j = playerBoxBottomLeftY; j < Math.min(mapHeight, playerBoxBottomLeftY + 1 + 1); j ++) {
                        // because of head room space, character left-top point can go inside block. so, playerBoxTopLeftY "+ 1" necessary
                        // character left-top is not the same as player x y. take into account white space of character sprite.

                        if (walls.has(i + j * mapWidth)) {
                            if (rectangularCollision({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})) {
                                backendPlayers[nameNumber].y -= backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }

                        for (const otherName of boxTopLeftOfPlayers[i + j * mapWidth]) {
                            if (parseInt(otherName) !== parseInt(nameNumber) && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
                                backendPlayers[nameNumber].y -= backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }
                    }
                }
            }

            // if (!isblocked) {
            //     for (const otherName in backendPlayers) {
            //         if (parseInt(otherName) !== nameNumber && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
            //             backendPlayers[nameNumber].y -= backendPlayersCool[nameNumber].speed
            //             break
            //         }
            //     }
            // }

            if (!isblocked) {
                const playerBoxTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
                const playerBoxTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)
                if (previousTopLeftY !== playerBoxTopLeftY || previousTopLeftX !== playerBoxTopLeftX) {
                    boxTopLeftOfPlayers[previousTopLeftY * mapWidth + previousTopLeftX].delete(nameNumber)
                    boxTopLeftOfPlayers[playerBoxTopLeftY * mapWidth + playerBoxTopLeftX].add(nameNumber)
                }
            }
        }

        if (key.d) {
            const previousTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
            const previousTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)

            backendPlayers[nameNumber].x += backendPlayersCool[nameNumber].speed

            let isblocked = false

            const playerBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].h} //{x: backendPlayers[nameNumber].x + 12.67, y: backendPlayers[nameNumber].y + 10.67, width: 96.77 - 12.67 * 2, height: 96.77 - 10.67 * 2}

            if (playerBox.x + backendPlayersBox[nameNumber].w > mapWidth * tileSize) {
                backendPlayers[nameNumber].x -= backendPlayersCool[nameNumber].speed
                isblocked = true
            }

            // if (!isblocked) {
            //     for (const tileRect of checkTheseTiles) {
            //         // console.log(`checking ${tileRect}`)
            //         if (rectangularCollision({ rectangle1: playerBox, rectangle2:tileRect })) {
            //             // console.log("!!!")
            //             backendPlayers[nameNumber].x -= backendPlayersCool[nameNumber].speed
            //             isblocked = true
            //             break
            //         }
            //     }
            // }

            const playerBoxTopRightX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX + backendPlayersBox[nameNumber].w) / tileSize)
            const playerBoxTopRightY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)

            if (!isblocked) {
                outerLoop: for (let i = playerBoxTopRightX; i < Math.min(mapWidth, playerBoxTopRightX + 1 + 1); i++) {
                    for (let j = Math.max(0, playerBoxTopRightY - 1); j < Math.min(mapHeight, playerBoxTopRightY + 1 + 1); j ++) {
                        // because of head room space, character left-top point can go inside block. so, playerBoxTopLeftY "+ 1" necessary
                        // character left-top is not the same as player x y. take into account white space of character sprite.

                        if (walls.has(i + j * mapWidth)) {
                            if (rectangularCollision({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})) {
                                backendPlayers[nameNumber].x -= backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }

                        for (const otherName of boxTopLeftOfPlayers[i + j * mapWidth]) {
                            if (parseInt(otherName) !== parseInt(nameNumber) && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
                                backendPlayers[nameNumber].x -= backendPlayersCool[nameNumber].speed
                                isblocked = true
                                break outerLoop
                            }
                        }
                    }
                }
            }

            // if (!isblocked) {
            //     for (const otherName in backendPlayers) {
            //         if (parseInt(otherName) !== nameNumber && rectangularCollision({rectangle1: playerBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
            //             backendPlayers[nameNumber].x -= backendPlayersCool[nameNumber].speed
            //             break
            //         }
            //     }
            // }

            if (!isblocked) {
                const playerBoxTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
                const playerBoxTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)
                if (previousTopLeftY !== playerBoxTopLeftY || previousTopLeftX !== playerBoxTopLeftX) {
                    boxTopLeftOfPlayers[previousTopLeftY * mapWidth + previousTopLeftX].delete(nameNumber)
                    boxTopLeftOfPlayers[playerBoxTopLeftY * mapWidth + playerBoxTopLeftX].add(nameNumber)
                }
            }
        }


        if (!backendPlayersCool[nameNumber].isAttacking) {
            if (key.q && backendPlayersCool[nameNumber].qready) {

                let attackBox
                switch (backendPlayers[nameNumber].d % 10) {
                    case 1:
                        attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY - backendPlayersBox[nameNumber].range, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].range}
                        break
                    case 2:
                        attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX - backendPlayersBox[nameNumber].range, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].range, height: backendPlayersBox[nameNumber].h}
                        break
                    case 3:
                        attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY + backendPlayersBox[nameNumber].h, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].range}
                        break
                    case 4:
                        attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX + backendPlayersBox[nameNumber].w, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].range, height: backendPlayersBox[nameNumber].h}
                        break
                }

                if (backendPlayersFixed[nameNumber].t === 1) {
                    attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX - backendPlayersBox[nameNumber].range, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY - backendPlayersBox[nameNumber].range, width: 2 * backendPlayersBox[nameNumber].range + backendPlayersBox[nameNumber].w, height: 2 * backendPlayersBox[nameNumber].range + backendPlayersBox[nameNumber].h}
                }

                const attackBoxLeftX = ~~(attackBox.x / tileSize)
                const attackBoxRightX = ~~((attackBox.x + attackBox.width) / tileSize)
                const attackBoxTopY= ~~(attackBox.y / tileSize)
                const attackBoxBottomY = ~~((attackBox.y + attackBox.height) / tileSize)


                outerLoop: for (let i = Math.min(0, attackBoxLeftX - 1); i < Math.min(mapWidth, attackBoxRightX + 1 + 1); i++) {
                    for (let j = Math.max(0, attackBoxTopY - 1); j < Math.min(mapHeight, attackBoxBottomY + 1 + 1); j ++) {
                        // because of head room space, character left-top point can go inside block. so, playerBoxTopLeftY "+ 1" necessary
                        // character left-top is not the same as player x y. take into account white space of character sprite.

                        // hitting wall? damaging my waepon?
                        // if (walls.has(i + j * mapWidth)) {
                        //     if (rectangularCollision({ rectangle1: playerBox, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})) {
                        //         backendPlayers[nameNumber].x -= backendPlayersCool[nameNumber].speed
                        //         isblocked = true
                        //         break outerLoop
                        //     }
                        // }

                        for (const otherName of boxTopLeftOfPlayers[i + j * mapWidth]) {
                            if (backendPlayersStatus[otherName].isDead) {
                                continue
                            }
                            if (backendPlayersFixed[nameNumber].c === backendPlayersFixed[otherName].c) {
                                continue
                            }
                            if (parseInt(otherName) !== parseInt(nameNumber) && rectangularCollision({rectangle1: attackBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {

                                applyDamage({targetNumber:otherName, damage:backendPlayersBox[nameNumber].damage})

                                if (backendPlayers[otherName].h <= 0) {
                                    backendPlayers[otherName].h = 0
                                    dead(otherName)
                                    levelup(nameNumber)
                                    // backendPlayersStatus[nameNumber].l += 1 // one level up, if one kill
                                }

                                if (backendPlayersFixed[nameNumber].t != 1) {
                                    // If axe, then multiple targets can be damaged
                                    break outerLoop
                                }
                            }
                        }
                    }
                }



                // for (const otherName in backendPlayers) {
                //     if (backendPlayersStatus[otherName].isDead) {
                //         continue
                //     }
                //     if (parseInt(otherName) !== nameNumber && rectangularCollision({rectangle1: attackBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
                //         // if different team
                //         if (backendPlayersFixed[nameNumber].c !== backendPlayersFixed[otherName].c) {
                //             // console.log(`${nameNumber} hits ${otherName}`)
                //             applyDamage({targetNumber:otherName, damage:backendPlayersBox[nameNumber].damage})
                //             // backendPlayers[otherName].h -= backendPlayersBox[nameNumber].damage
                //             if (backendPlayers[otherName].h < 0) {
                //                 dead(otherName)
                //                 levelup(nameNumber)
                //                 // backendPlayersStatus[nameNumber].l += 1 // one level up, if one kill
                //             }
                //             if (backendPlayersFixed[nameNumber].t != 1) {
                //                 // If axe, then multiple targets can be damaged
                //                 break
                //             }
                //         }
                //     }
                // }

                backendPlayers[nameNumber].d = d % 10 + 30

                backendPlayersCool[nameNumber].isAttacking = true
                backendPlayersCool[nameNumber].qready = false
                backendPlayersCool[nameNumber].keyhold = true // until the next io.emit('p',backendPlayers)

                setTimeout(() => {
                    backendPlayersCool[nameNumber].isAttacking = false
                }, attackDuration)

                setTimeout(() => {
                    backendPlayersCool[nameNumber].qready = true
                    socket.emit('Q')
                }, characterType[backendPlayersFixed[nameNumber].t].qcool)
            }
        }

        if (!backendPlayersCool[nameNumber].isAttacking) {
            if (key.e && backendPlayersCool[nameNumber].eready) {
                const playerX = Math.floor(backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX + backendPlayersBox[nameNumber].w / 2)
                const playerY = Math.floor(backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY + backendPlayersBox[nameNumber].h / 2)

                // r:range (size), t: time left till disappear, s: speed, d: direction, o: owner
                // r:1 arrow, r:2 whirlwind, r:3 ....
                let attackBox

                if (backendPlayersFixed[nameNumber].t === 1) {
                    // Axe thrawing
                    attackBox = {x: playerX, y: playerY, r: 2, t: 2000, s: axeSpeed, d: backendPlayers[nameNumber].d % 10, o: nameNumber}
                }
                else if (backendPlayersFixed[nameNumber].t === 2) {
                    // Bow
                    attackBox = {x: playerX, y: playerY, r: 1, t: 2500, s: arrowSpeed, d: backendPlayers[nameNumber].d % 10, o: nameNumber}
                }
                else if (backendPlayersFixed[nameNumber].t === 3) {
                    // Bow
                    backendPlayersCool[nameNumber].speed = 5
                    setTimeout(() => {
                        backendPlayersCool[nameNumber].speed = speed
                    }, 3000)
                }
                else if (backendPlayersFixed[nameNumber].t === 0) {
                    // Bow
                    backendPlayersCool[nameNumber].isShielded = true
                    setTimeout(() => {
                        backendPlayersCool[nameNumber].isShielded = false
                    }, 1100)
                }

                if (attackBox) {
                    attackBoxes.push(attackBox)
                }

                backendPlayers[nameNumber].d = d % 10 + 40

                backendPlayersCool[nameNumber].isAttacking = true
                backendPlayersCool[nameNumber].eready = false
                backendPlayersCool[nameNumber].keyhold = true // until the next io.emit('p',backendPlayers)

                setTimeout(() => {
                    backendPlayersCool[nameNumber].isAttacking = false
                }, attackDuration)

                setTimeout(() => {
                    backendPlayersCool[nameNumber].eready = true
                    socket.emit('E')
                }, characterType[backendPlayersFixed[nameNumber].t].ecool)
            }
        }


        if (backendPlayersCool[nameNumber].keyhold) {
            // update only direction. but anyway, on clientside, attack direction does not change till one cycle ends.
            backendPlayers[nameNumber].d = Math.floor(backendPlayers[nameNumber].d / 10) * 10 + d % 10
            // console.log('at most 1or2')
        }
        else {

            if (backendPlayersCool[nameNumber].isAttacking && d > 30) {
                // if keyhold released, yet isAttacking, maybe after one motion cycle, (client unlawfully send q or e)
                // although damage is not dealt, animation can trick others. so, just make it walking motion.
                backendPlayers[nameNumber].d = 20 + d % 10
            }
            else if (!backendPlayersCool[nameNumber].qready && (30 < d && d < 40)) {
                backendPlayers[nameNumber].d = 20 + d % 10
            }
            else if (!backendPlayersCool[nameNumber].eready && (40 < d && d < 50)) {
                backendPlayers[nameNumber].d = 20 + d % 10
            }
            else {
                 // update both direction and motion
                backendPlayers[nameNumber].d = d
            }

        }

        backendPlayers[nameNumber].s = s

        // if (!backendPlayersCool[nameNumber].isAttacking) {
        //     if (backendPlayers[nameNumber].d < 30) {
        //         // currently idle or walking. not attacking
        //         if (key.q && backendPlayersCool[nameNumber].qready) {

        //             let attackBox
        //             switch (backendPlayers[nameNumber].d % 10) {
        //                 case 1:
        //                     attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY - backendPlayersBox[nameNumber].range, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].range}
        //                     break
        //                 case 2:
        //                     attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX - backendPlayersBox[nameNumber].range, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].range, height: backendPlayersBox[nameNumber].h}
        //                     break
        //                 case 3:
        //                     attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY + backendPlayersBox[nameNumber].h, width: backendPlayersBox[nameNumber].w, height: backendPlayersBox[nameNumber].range}
        //                     break
        //                 case 4:
        //                     attackBox = {x: backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX + backendPlayersBox[nameNumber].w, y: backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY, width: backendPlayersBox[nameNumber].range, height: backendPlayersBox[nameNumber].h}
        //                     break
        //             }


        //             for (const otherName in backendPlayers) {
        //                 if (parseInt(otherName) !== nameNumber && rectangularCollision({rectangle1: attackBox, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
        //                     console.log(`${nameNumber} hits ${otherName}`)
        //                     backendPlayers[otherName].h -= backendPlayersBox[nameNumber].damage
        //                     if (backendPlayers[otherName].h < 0) {
        //                         backendPlayersStatus[nameNumber].l += 1 // one level up, if one kill
        //                     }
        //                     break
        //                 }
        //             }

        //             // invalidate further q until one attack ends
        //             backendPlayers[nameNumber].d = backendPlayers[nameNumber].d % 10 + 30
        //             backendPlayersCool[nameNumber].qready = false

        //             setTimeout(() => {
        //                 backendPlayersCool[nameNumber].isAttacking = false
        //                 socket.emit('a')
        //             }, attackDuration)

        //             setTimeout(() => {
        //                 backendPlayersCool[nameNumber].qready = true
        //                 socket.emit('q')
        //             }, qcool)
        //             //console.log('q pressed')
        //         }
        //         if (key.e && backendPlayersCool[nameNumber].eready) {
        //             // make attack box

        //             const playerX = Math.floor(backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX +backendPlayersBox[nameNumber].w / 2)
        //             const playerY = Math.floor(backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY +backendPlayersBox[nameNumber].h / 2)

        //             // r:range (size), t: time left till disappear, s: speed, d: direction, o: owner
        //             let attackBox = {x: playerX, y: playerY, r: 20, t: 3000, s: 4, d: backendPlayers[nameNumber].d % 10, o: nameNumber}

        //             attackBoxes.push(attackBox)

        //             backendPlayers[nameNumber].d = backendPlayers[nameNumber].d % 10 + 40
        //             backendPlayersCool[nameNumber].eready = false

        //             setTimeout(() => {
        //                 backendPlayersCool[nameNumber].isAttacking = false
        //                 socket.emit('a')
        //             }, attackDuration)

        //             setTimeout(() => {
        //                 backendPlayersCool[nameNumber].eready = true
        //                 socket.emit('e')
        //             }, ecool)
        //         }
        //     }
        // }

        // if (backendPlayers[nameNumber].d > 30 && backendPlayersCool[nameNumber].isAttacking) {

        // }


        // const decimalPoints = 2;
        backendPlayers[nameNumber].y = Math.round(backendPlayers[nameNumber].y) // * Math.pow(10, decimalPoints)) / Math.pow(10, decimalPoints);
        backendPlayers[nameNumber].x = Math.round(backendPlayers[nameNumber].x) // * Math.pow(10, decimalPoints)) / Math.pow(10, decimalPoints);


        // if (backendPlayers[nameNumber].d < 30) {
        //     // while attacking, no direction change nor motion change possible
        //     backendPlayers[nameNumber].d = d
        // }

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

function rectangularCollision({ rectangle1, rectangle2 }) {
    return (
      rectangle1.x + rectangle1.width >= rectangle2.x &&
      rectangle1.x <= rectangle2.x + rectangle2.width &&
      rectangle1.y + rectangle1.height >= rectangle2.y &&
      rectangle1.y <= rectangle2.y + rectangle2.height
    )
}

function applyDamage({targetNumber, damage}) {
    if (backendPlayersCool[targetNumber].isShielded) {
        backendPlayers[targetNumber].h -= Math.round(damage / 3)
    }
    else {
        backendPlayers[targetNumber].h -= damage
    }
}


function maxhealth(level, type) {
    // if (type === 0) {
        return Math.floor(basehealth + (maxmaxhealth + 1 - basehealth) * level / (maxlevel + 1))
    // }
}


function levelup(nameNumber) {
    if (backendPlayersStatus[nameNumber].l < maxlevel) {
        backendPlayersStatus[nameNumber].l += 1
        backendPlayersStatus[nameNumber].mh = maxhealth(backendPlayersStatus[nameNumber].l, backendPlayersFixed[nameNumber].t)
        io.emit('L', nameNumber)
    }
}


function dead(nameNumber) {
    io.emit('D', nameNumber)
    backendPlayersStatus[nameNumber].isDead = true
    let socketidToKill
    for (const sessionid in backendPlayersName) {
        if (nameNumber == backendPlayersName[sessionid].n) {
            socketidToKill = sessionid
            // console.log(nameNumber)
        }
    }
    const socketToKill = io.sockets.sockets.get(socketidToKill)
    if (socketToKill) {
        setTimeout(() => {
            socketToKill.disconnect(true)
            // console.log('killed')
        }, 12 * 1000)
    }
}

function makeNewPlayer(socket) {
    const randomIndex = Math.floor(Math.random() * nameNumbers.length)
    const nameNumber = nameNumbers.splice(randomIndex, 1)[0]
    // here, don't worry about race condition, because socket.io is single threaded and only one io.on at a time

    socket.emit("gameSetUp", {'yourid':nameNumber,'frameInterval':frontendFrameInterval, 'speed':speed, 'numberOfTeams': numberOfTeams, 'tileSize': tileSize})

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
        x: Math.floor(9 * tileSize * Math.random()),
        y: Math.floor(9 * tileSize * Math.random()),
        s: 0,
        d: 13, // d = 10*motion + direction
        h: basehealth
    }

    backendPlayersFixed[nameNumber] = {
        n: nameNumber,
        c: Math.floor(Math.random() * numberOfTeams),
        t: parseInt(socket.handshake.query.selectedClass)  //Math.floor(Math.random() * 3)
    }

    backendPlayersStatus[nameNumber] = {
        l: 1,
        // h: 30,
        mh: maxhealth(1, backendPlayersFixed[nameNumber].t),
        isDead: false
        //,exp: no need if simply kill->levelup
    }

    // should be updated when level up
    backendPlayersBox[nameNumber] = {
        w: tileSize * (1 + backendPlayersStatus[nameNumber].l/99) - 2 * characterType[backendPlayersFixed[nameNumber].t].offX,
        h: tileSize * (1 + backendPlayersStatus[nameNumber].l/99) - 2 * characterType[backendPlayersFixed[nameNumber].t].offY,
        offX: characterType[backendPlayersFixed[nameNumber].t].offX,
        offY: characterType[backendPlayersFixed[nameNumber].t].offY,
        range: characterType[backendPlayersFixed[nameNumber].t].range,
        damage: characterType[backendPlayersFixed[nameNumber].t].damage
    }

    // console.log(backendPlayersFixed)

    backendPlayersCool[nameNumber] = {
        isAttacking: false,
        qready: true,
        eready: true,
        keyhold: false,
        isShielded: false,
        speed: speed
    }



    socket.join('joinedPlayers')

    // const nameNumber = backendPlayersName[socket.id]

    socket.to('joinedPlayers').emit('updateNewPlayer', {
        x: backendPlayers[nameNumber].x,
        y: backendPlayers[nameNumber].y,
        l: backendPlayersStatus[nameNumber].l,
        c: backendPlayersFixed[nameNumber].c,
        t: backendPlayersFixed[nameNumber].t,
        n: backendPlayersFixed[nameNumber].n
    })

    const previousTopLeftX = ~~((backendPlayers[nameNumber].x + backendPlayersBox[nameNumber].offX) / tileSize)
    const previousTopLeftY = ~~((backendPlayers[nameNumber].y + backendPlayersBox[nameNumber].offY) / tileSize)
    boxTopLeftOfPlayers[previousTopLeftY * mapWidth + previousTopLeftX].add(nameNumber)

}


let lastTickTime = Date.now()
let accumulatedTimeForHeal = 0
setInterval(() => {
    const currentTickTime = Date.now()
    const deltaTime = currentTickTime - lastTickTime
    lastTickTime = currentTickTime

    accumulatedTimeForHeal += deltaTime

    // +1 hp per second
    if (accumulatedTimeForHeal > 1000) {
        accumulatedTimeForHeal = 0
        for (const nameNumber in backendPlayers) {
            const playerAt = ~~(backendPlayers[nameNumber].x / tileSize) + mapWidth * ~~(backendPlayers[nameNumber].y / tileSize)

            for (const castleNumber in castles) {

                if (castles[castleNumber].owner != backendPlayersFixed[nameNumber].c) {
                    if (castles[castleNumber].position.has(playerAt)) {
                        castles[castleNumber].health -= castleDeal
                        io.emit('C', {c:castleNumber, h:castles[castleNumber].health})
                        if (castles[castleNumber].health < 0) {
                            castles[castleNumber].captured(nameNumber)
                        }
                    }
                    continue
                }

                if (villages[castleNumber][playerAt]) {
                    if (backendPlayers[nameNumber].h < backendPlayersStatus[nameNumber].mh)
                    backendPlayers[nameNumber].h += 1
                }
            }
        }

    }

    // Attack2 boxes simulation: arrow and axe thrawing
    const a = []
    for (const attackBox of attackBoxes) {
        if (attackBox.r === 1 || attackBox.r === 2) {
            // arrow or axe thrawing
            switch (attackBox.d) {
                case 1:
                    attackBox.y -= attackBox.s * deltaTime / frontendFrameInterval
                    break
                case 2:
                    attackBox.x -= attackBox.s * deltaTime / frontendFrameInterval
                    break
                case 3:
                    attackBox.y += attackBox.s * deltaTime / frontendFrameInterval
                    break
                case 4:
                    attackBox.x += attackBox.s * deltaTime / frontendFrameInterval
                    break
            }

            attackBox.t -= deltaTime

            // let box = {x: attackBox.x - 7, y: attackBox.y - 7, width: 14, height: 14}
            let box = {x: attackBox.x, y: attackBox.y, width: 14, height: 14}

            const attackBoxLeftX = ~~(box.x / tileSize)
            const attackBoxRightX = ~~((box.x + box.width) / tileSize)
            const attackBoxTopY= ~~(box.y / tileSize)
            const attackBoxBottomY = ~~((box.y + box.height) / tileSize)


            outerLoop: for (let i = Math.min(0, attackBoxLeftX - 1); i < Math.min(mapWidth, attackBoxRightX + 1 + 1); i++) {
                for (let j = Math.max(0, attackBoxTopY - 1); j < Math.min(mapHeight, attackBoxBottomY + 1 + 1); j ++) {

                    if (walls.has(i + j * mapWidth)) {
                        if (rectangularCollision({ rectangle1: box, rectangle2: {x: i * tileSize, y: j * tileSize - 2, width: tileSize, height: tileSize - 18}})) {
                            attackBox.t = -1
                            break outerLoop
                        }
                    }

                    for (const otherName of boxTopLeftOfPlayers[i + j * mapWidth]) {
                        if (backendPlayersStatus[otherName].isDead) {
                            continue
                        }
                        if (backendPlayersFixed[attackBox.o].c === backendPlayersFixed[otherName].c) {
                            continue
                        }
                        if (parseInt(otherName) !== parseInt(attackBox.o) && rectangularCollision({rectangle1: box, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
                            // if different team
                            // console.log(`${attackBox.o} hits ${otherName} with a bow shot`)
                            applyDamage({targetNumber:otherName, damage:backendPlayersBox[attackBox.o].damage})
                            // backendPlayers[otherName].h -= backendPlayersBox[attackBox.o].damage
                            if (backendPlayers[otherName].h <= 0) {
                                backendPlayers[otherName].h = 0
                                dead(otherName)
                                levelup(attackBox.o)
                                // backendPlayersStatus[attackBox.o].l += 1 // one level up, if one kill
                            }
                            attackBox.t = -1
                            break outerLoop
                        }
                    }
                }
            }

            // for (const otherName in backendPlayers) {
            //     if (backendPlayersFixed[attackBox.o].c === backendPlayersFixed[otherName].c) {
            //         continue
            //     }
            //     if (backendPlayersStatus[otherName].isDead) {
            //         continue
            //     }
            //     if (parseInt(otherName) !== attackBox.o && rectangularCollision({rectangle1: box, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
            //         // if different team
            //         // console.log(`${attackBox.o} hits ${otherName} with a bow shot`)
            //         applyDamage({targetNumber:otherName, damage:backendPlayersBox[attackBox.o].damage})
            //         // backendPlayers[otherName].h -= backendPlayersBox[attackBox.o].damage
            //         if (backendPlayers[otherName].h < 0) {
            //             dead(otherName)
            //             levelup(attackBox.o)
            //             // backendPlayersStatus[attackBox.o].l += 1 // one level up, if one kill
            //         }
            //         attackBox.t = -1
            //         break
            //     }
            // }

            if (attackBox.t > 0) {
                a.push({x: ~~(attackBox.x), y: ~~(attackBox.y), r: attackBox.r})
            }
        }

        // if (attackBox.r === 2) {
        //     // whirlwind
        //     const playerX = Math.floor(backendPlayers[attackBox.o].x + backendPlayersBox[attackBox.o].offX + backendPlayersBox[attackBox.o].w / 2)
        //     const playerY = Math.floor(backendPlayers[attackBox.o].y + backendPlayersBox[attackBox.o].offY + backendPlayersBox[attackBox.o].h / 2)

        //     attackBox.x = playerX
        //     attackBox.y = playerY

        //     for (const otherName in backendPlayers) {
        //         if (backendPlayersFixed[attackBox.o].c === backendPlayersFixed[otherName].c) {
        //             continue
        //         }
        //         if (parseInt(otherName) !== attackBox.o && rectangularCollision({rectangle1: box, rectangle2: {x: backendPlayers[otherName].x + backendPlayersBox[otherName].offX, y: backendPlayers[otherName].y + backendPlayersBox[otherName].offY, width: backendPlayersBox[otherName].w, height: backendPlayersBox[otherName].h} })) {
        //             // if different team
        //             console.log(`${attackBox.o} hits ${otherName} with a bow shot`)
        //             // steady 1 damage per server frame
        //             applyDamage({targetNumber:otherName, damage: 1})
        //             // backendPlayers[otherName].h -= backendPlayersBox[attackBox.o].damage
        //             if (backendPlayers[otherName].h < 0) {
        //                 backendPlayersStatus[attackBox.o].l += 1 // one level up, if one kill
        //             }
        //             // attackBox.t = -1
        //             // break
        //         }
        //     }

        //     attackBox.t -= deltaTime

        //     if (attackBox.t > 0) {
        //         a.push({x: Math.floor(attackBox.x), y: Math.floor(attackBox.y), r: attackBox.r})
        //     }
        // }
    }
    attackBoxes = attackBoxes.filter(attackBox => attackBox.t > 0)

    io.emit('A', a)


    let backendPlayersToEmit = {}
    // To make sure attack command emitted at least one time
    const toBeReleasedNames = []
    for (const nameNumber in backendPlayersCool) {
        if (backendPlayersCool[nameNumber].keyhold) {
            toBeReleasedNames.push(nameNumber)
        }

        backendPlayersToEmit[nameNumber] = [
            (~~(backendPlayers[nameNumber].x)).toString().padStart(4,'0'),
            (~~(backendPlayers[nameNumber].y)).toString().padStart(4,'0'),
            backendPlayers[nameNumber].s.toString().padStart(3,'0'),
            backendPlayers[nameNumber].d.toString().padStart(2,'0'),
            backendPlayers[nameNumber].h.toString().padStart(2,'0')
        ].join('')
    }


    io.emit('P', backendPlayersToEmit) // length of socket name 'P' matters. but, name of dict doesn't matter.
    // console.log(Buffer.byteLength(JSON.stringify(backendPlayers)))

    for (const nameNumber of toBeReleasedNames) {
        backendPlayersCool[nameNumber].keyhold = false
    }


}, frameInterval)

setInterval(() => {
    console.log(backendPlayersFixed)
}, 20 * 1000)

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

// setInterval(() => {
//     for (const gridnumber in boxTopLeftOfPlayers) {
//         if (boxTopLeftOfPlayers[gridnumber].size !== 0) {
//             console.log(`${boxTopLeftOfPlayers[gridnumber]} are in ${gridnumber}`)
//         }
//     }
// }, 3 * 1000)
