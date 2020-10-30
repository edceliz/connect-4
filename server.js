const express = require('express');
const app = express();
const bodyParser = require('body-parser')
const server = require('http').createServer(app);
const io = require('socket.io').listen(server);
const fs = require('fs');

server.listen(process.env.PORT || 3000);

app.use(bodyParser.urlencoded({ extended: true }))
app.use("/css", express.static('css'));

// Home page for creating or joining a game
app.get('/', function(req, res){
    res.writeHead(200, { 'content-type': 'text/html' });
    fs.createReadStream('index.html').pipe(res);
});

// Create random room and join it
app.get('/start', function(req, res) {
	res.writeHead(302, {
		'Location': '/room/' + makeRoomCode(6)
    });
    res.end();
});

function makeRoomCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charsLength = chars.length;
    let result = '';
    for (let i = 0; i < length; i++) {
       result += chars.charAt(Math.floor(Math.random() * charsLength));
    }
    return result;
}

app.post('/join', function(req, res) {
	res.writeHead(302, {
		'Location': '/room/' + req.body.roomCode
    });
    res.end();
});

// Game instance
app.get('/room/([A-Za-z0-9]{6})', function(req, res) {
	res.writeHead(200, { 'content-type': 'text/html' });
    fs.createReadStream('game.html').pipe(res);
});

const rooms = {};
io.sockets.on('connection', function(socket) {
    socket.on('join', function(data) {
        if (Object.keys(rooms).includes(data.room)) {
            if (!rooms[data.room].p2) {
                // Enter player 2
                socket.join(data.room);
                console.log('Game Started for Room: ' + data.room)
                socket.room = data.room;
                socket.pid = 2;
                socket.emit('config', { pid: socket.pid });

                const room = rooms[data.room];
                room.p2 = socket;

                // Start game
                socket.broadcast.to(data.room).emit('start');
            } else {
                socket.emit('invalid');
            }
        } else {
            // Create new room and setup the game instance
            socket.join(data.room);
            console.log('Room Created: ' + data.room);
            socket.room = data.room;
            socket.pid = 1;
            rooms[data.room] = {
                p1: socket,
                p2: false,
                moves: 0,
                playerTurn: 1,
                board: [
                    [0, 0, 0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0, 0, 0],
                ],
            };
            socket.emit('config', { pid: socket.pid });
        }
    });

    socket.on('move', function(data) {
        const room = rooms[socket.room];
        const { board } = room;

        if (room.playerTurn === data.pid) {
            room.moves++;
            room.playerTurn = data.pid === 1 ? 2 : 1;

            io.to(socket.room).emit('playerMoved', {
                pid: data.pid,
                col: data.col,
                moves: room.moves,
            });

            for (let row = board.length - 1; row >= 0; row--) {
                if (board[row][data.col] <= 0) {
                    board[row][data.col] = data.pid;
                    break;
                }
            }

            let winner = false;

            // Check Horizontal Win
            for (let row = 0; row < board.length; row++) {
                let streak = 0,
                pidScanning = false,
                cell;

                for (let col = 0; col < board[row].length; col++) {
                    cell = board[row][col];
                    if (cell === 0) {
                        streak = 0;
                        continue;
                    }

                    if (pidScanning) {
                        if (cell !== pidScanning) {
                            streak = 1;
                            pidScanning = cell;
                        } else {
                            streak++;
                        }
                    }

                    if (streak >= 4) {
                        winner = pidScanning;
                        break;
                    }

                    if (!pidScanning && cell > 0) {
                        streak = 1;
                        pidScanning = cell;
                    }
                }

                if (winner) {
                    break;
                }
            }

            if (!winner) {
                // Check Vertical Win
                for (let col = 0; col < board[0].length; col++) {
                    let streak = 0,
                    pidScanning = false,
                    cell;
    
                    for (let row = 0; row < board.length; row++) {
                        cell = board[row][col];
                        if (cell === 0) {
                            streak = 0;
                            continue;
                        }
    
                        if (pidScanning) {
                            if (cell !== pidScanning) {
                                streak = 1;
                                pidScanning = cell;
                            } else {
                                streak++;
                            }
                        }
    
                        if (streak >= 4) {
                            winner = pidScanning;
                            break;
                        }
    
                        if (!pidScanning && cell > 0) {
                            streak = 1;
                            pidScanning = cell;
                        }
                    }
                }
            }

            if (!winner) {
                // Check for Lower Diagonal Win \ (Left to Right)
                for (let col = 0; col < board[0].length - 3; col++) {
                    let cell;
    
                    for (let row = 0; row < board.length - 3; row++) {
                        cell = board[row][col];
    
                        if (cell === 0) {
                            continue;
                        }
    
                        if (
                            cell === board[row + 1][col + 1]
                            && cell === board[row + 2][col + 2]
                            && cell === board[row + 3][col + 3]
                        ) {
                            winner = cell;
                            break;
                        }
                    }
    
                    if (winner) {
                        break;
                    }
                }
            }
            
            if (!winner) {
                // Check for Lower Diagonal Win / (Right to Left)
                for (let col = board[0].length - 1; col > 2; col--) {
                    let cell;
    
                    for (let row = 0; row < board.length - 3; row++) {
                        cell = board[row][col];
    
                        if (cell === 0) {
                            continue;
                        }
    
                        if (
                            cell === board[row + 1][col - 1]
                            && cell === board[row + 2][col - 2]
                            && cell === board[row + 3][col - 3]
                        ) {
                            winner = cell;
                            break;
                        }
                    }
    
                    if (winner) {
                        break;
                    }
                }
            }

            if (winner) {
                io.to(socket.room).emit('result', {
                    result: 'win', pid: winner
                });
            }

            if (room.moves >= 42) {
                io.to(socket.room).emit('result', { result: 'draw' });
            }
        }
    });

    socket.on('disconnect', function () {
        if (Object.keys(rooms).includes(socket.room)) {
            delete rooms[socket.room];
            io.to(socket.room).emit('stop');
            console.log('Room Closed: ' + socket.room);
        }
    });
});

console.log('Server listening at port ' + (process.env.PORT || 3000));
