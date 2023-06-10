const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
// const cors = require("cors");
const fs = require("fs");
app.use(express.static(path.join(__dirname + "/public")));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    method: ["GET", "POST"],
  },
});

const getRoomList = () => {
  return new Promise((resolve, reject) => {
    fs.readFile("room.json", "utf8", (err, jsonData) => {
      if (err) {
        reject(err);
      }
      const data = JSON.parse(jsonData);
      resolve(data);
    });
  });
};

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("join_room", async (data) => {
    console.log("one user join");
    socket.join(data);
    const roomList = await getRoomList();
    io.emit("receive_message", roomList);
    const room = roomList.find((room) => room.roomId == data);
    io.to(data).emit("player_join", room);
  });

  socket.on("rejoin-room", (data) => {
    socket.join(data);
  });

  socket.on("new-game", async (room) => {
    let roomId = room.roomId;
    let roomList = await getRoomList();
    for (let i = 0; i < roomList.length; i++) {
      if (roomList[i].roomId == roomId) {
        roomList[i] = { ...room };
        fs.writeFile("room.json", JSON.stringify(roomList), (err) => {
          if (err) {
            console.log(err);
          } else {
            io.to(room.roomId).emit("new-game", room);
          }
        });
        break;
      }
    }
  });

  socket.on("update-table", async ({ room, gameState }) => {
    const roomId = room.roomId;
    let roomList = await getRoomList();
    for (let i = 0; i < roomList.length; i++) {
      if (roomList[i].roomId == roomId) {
        if (gameState == "X win") {
          room.player2Score += 1;
        } else if (gameState == "O win") {
          room.player1Score += 1;
        } else if (gameState == "Draw") {
          room.draw += 1;
        }
        roomList[i] = { ...room };
        fs.writeFile("room.json", JSON.stringify(roomList), (err) => {
          if (err) {
            console.log(err);
          } else {
            io.to(roomId).emit("receive-update-table", { room, gameState });
          }
        });
        break;
      }
    }
  });

  socket.on("leave-room", async ({ roomId, userName }) => {
    socket.leave(roomId);
    let roomList = await getRoomList();
    let room = roomList.find(
      (room) => room.player1 == userName || room.player2 == userName
    );
    if (room) {
      if (room.player1 == userName) {
        room.player1 = null;
      } else if (room.player2 == userName) {
        room.player2 = null;
      }
      if (!room.player1 && !room.player2) {
        roomList = roomList.filter((room) => room.roomId !== roomId);
      }
      fs.writeFile("room.json", JSON.stringify(roomList), (err) => {
        if (err) {
          console.log(err);
        } else {
          if (room.player1 || room.player2) {
            socket.to(roomId).emit("player_join", room);
          }
        }
      });
      io.emit("receive_message", roomList);
    }
  });

  socket.on("leave-room-by-username", async (userName) => {
    let roomList = await getRoomList();
    let room = roomList.find((room) => {
      if (room.player1 == userName || room.player2 == userName) {
        return room;
      }
    });
    if (room) {
      let roomId = room.roomId;
      if (room.player1 == userName) {
        room.player1 = null;
      } else if (room.player2 == userName) {
        room.player2 = null;
      }
      console.log("got roomList", room);
      if (!room.player1 && !room.player2) {
        roomList = roomList.filter((room) => room.roomId !== roomId);
      }

      console.log(roomList);
      fs.writeFile("room.json", JSON.stringify(roomList), (err) => {
        if (err) {
          console.log(err);
        } else {
          if (room.player1 || room.player2) {
            socket.to(room.roomId).emit("player_join", room);
          }
          io.emit("receive_message", roomList);
        }
      });
    }
  });

  socket.on("send-play-again-request", ({ roomId, message }) => {
    io.to(roomId).emit("receive-play-again-request", message);
  });

  socket.on("send_message", (data) => {
    socket.to(data.room).emit("receive_message", data);
  });
});

app.get("/username/check/:username", (req, res) => {
  const { username } = req.params;
  res.setHeader("Content-Type", "text/plain");
  // Read the contents of the users.txt file
  fs.readFile("users.txt", "utf8", (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send("Server Error");
      return;
    }

    // Check if the username exists in the file
    const usernames = data.split("\n");
    if (usernames.includes(username)) {
      res.status(400).send("Username already taken");
    } else {
      // Save the username to the file
      fs.appendFile("users.txt", username + "\n", (err) => {
        if (err) {
          console.error(err);
          res.status(500).send("Server Error");
          return;
        }
        res.status(200).send("Username saved successfully");
      });
    }
  });
});

const generateRoomId = (data) => {
  let idList = data.map((table) => table.roomId).sort((id1, id2) => id1 - id2);
  if (idList.length === 5) {
    resolve(null);
  }
  idList.forEach((id, index) => {
    if (id != index + 1) {
      return index + 1;
    }
  });
  return idList.length + 1;
};

app.get("/room/create/:username", async (req, res) => {
  const { username } = req.params;
  const roomList = await getRoomList();
  const roomId = generateRoomId(roomList);
  if (roomId == null) {
    res.status(400).send("Server has reached maximum number of table");
  }
  const data = {
    roomId: roomId,
    player1: username,
    player2: null,
    player1Score: 0,
    player2Score: 0,
    playerTurn: 1,
    draw: 0,
    table: [
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
    ],
  };
  // Add new data to the list
  roomList.push(data);

  // Write the updated data back to the file
  fs.writeFile("room.json", JSON.stringify(roomList), (err) => {
    if (err) {
      res.status(400).send("Can not create room");
    } else {
      res.status(200).send(roomId.toString());
    }
  });
});

app.get("/room/get", async (req, res) => {
  const data = await getRoomList();
  res.json(data);
});

app.get("/room/load/:roomId", async (req, res) => {
  const { roomId } = req.params;
  let roomData = await getRoomList();
  for (let room of roomData) {
    if (room.roomId == roomId) {
      res.json(room);
      break;
    }
  }
});

app.get("/room/join/:roomId/:userName", async (req, res) => {
  const { roomId, userName } = req.params;
  let roomList = await getRoomList();
  let roomFound = false;

  for (let room of roomList) {
    if (room.roomId == roomId) {
      roomFound = true;
      if (!room.player1) {
        room.player1 = userName;
        break;
      } else if (!room.player2) {
        room.player2 = userName;
        break;
      }
    }
  }

  if (roomFound) {
    fs.writeFile("room.json", JSON.stringify(roomList), (err) => {
      if (err) {
        console.log(err);
        res.status(400).send("Can not join room");
      } else {
        res.status(200).send(roomId.toString());
      }
    });
  } else {
    res.status(400).send("Room does not exist, please enter another room");
  }
});

app.get("/room/leave/:userName", async (req, res) => {
  const { userName } = req.params;
  let roomList = await getRoomList();
  let room = roomList.find(
    (room) => room.player1 == userName || room.player2 == userName
  );
  if (room.player1 == userName) {
    room.player1 = null;
  } else {
    room.player2 = null;
  }
  fs.writeFile("room.json", JSON.stringify(roomList), (err) => {
    if (err) {
      console.log(err);
      res.status(400).send("Can not leave room");
    } else {
      res.status(200).send(room.roomId.toString());
    }
  });
});

server.listen(3001, () => {
  console.log("SERVER IS RUNNING");
});
