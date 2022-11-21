const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const app = express();
const server = require("http").createServer(app);
const axios = require("axios");
const cors = require("cors");

const admin = require("firebase-admin");
const serviceAccount = require("./config/tandur-key.json");

const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
db = firebaseApp.firestore();

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
require("dotenv").config();

const users = {};

const io = require("socket.io")(server, {
  cors: {
    origin: "https://example.com",
    methods: ["GET", "POST"],
  },
});

app.get("/", async (req, res) => {
  // const ref = db.collection("user").doc("4OzxZgyOAEgdPdNKzeyPjoO8LGI2");
  // const user = await ref.get();
  // const userData = user.data();
  // console.log(userData);
  res.send("Server Running");
});

// app.post("/subscribe", async (req, res) => {
//   try {
//     const { ct: timestamp, con: sensorData } =
//       req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"];
//     const sensorDataObj = JSON.parse(sensorData);
//     // const ref = db.collection("user").doc(`${users[socket.id]}`);
//     // const user = await ref.get();
//     // const userData = user.data();
//     io.sockets.on("userId", (id) => {
//       console.log(`ini user id ${id}`);
//     });
//     io.sockets.emit("antaresdata", { timestamp, sensorDataObj });
//     console.log(JSON.stringify(sensorDataObj));
//     res.send("ack");
//   } catch (err) {
//     console.log("First connect");
//     res.send("ack");
//   }
// });

io.on("connection", async (socket) => {
  console.log(`User Connected`);

  socket.on("login", async (userId) => {
    console.log("a user " + userId + " connected");
    users[socket.id] = userId;
    console.log(`Connected user ${JSON.stringify(users)}`);
    const ref = db.collection("user").doc(`${users[socket.id]}`);
    const user = await ref.get();
    const userData = user.data();

    const historicaldata = await axios
      .get(
        `https://platform.antares.id:8443/~/antares-cse/antares-id/Capstonetest/${userData.deviceName}?fu=1&ty=4&drt=1`,
        {
          headers: {
            "Content-Type": "application/json;ty=4",
            Accept: "application/json",
            "X-M2M-ORIGIN": process.env.ANTARES_KEY,
          },
        }
      )
      .then((resp) => {
        const response = resp.data["m2m:uril"];
        const liveData = response.map((url) => {
          const urlData = url
            .replace(/['"]+/g, "")
            .split("/")[5]
            .replace(/_/, "-");
          return urlData;
        });

        return Promise.all(
          liveData.slice(0, 5).map((urlData) => {
            return axios.get(
              `https://platform.antares.id:8443/~/antares-cse/${urlData}`,
              {
                headers: {
                  "Content-Type": "application/json;ty=4",
                  Accept: "application/json",
                  "X-M2M-ORIGIN": process.env.ANTARES_KEY,
                },
              }
            );
          })
        );
      })
      .then((antaresdata) => {
        const historicdata = antaresdata.map((el) => {
          return el.data;
        });
        return historicdata;
      });

    const sortedData = historicaldata.sort((a, b) => {
      if (a["m2m:cin"].ct < b["m2m:cin"].ct) {
        return -1;
      }
      if (a["m2m:cin"].ct > b["m2m:cin"].ct) {
        return 1;
      }
      return 0;
    });

    io.to(socket.id).emit("historicaldata", sortedData);

    io.emit("testdalam", "halo ini dalam");
  });

  app.post("/subscribe", async (req, res) => {
    try {
      const { ct: timestamp, con: sensorData } =
        req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"];
      const sensorDataObj = JSON.parse(sensorData);
      console.log(req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"]["pi"]);
      const reqData =
        req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"]["pi"];
      const splitReqData = reqData.split("/")[2];
      console.log(`ini split ${splitReqData}`);
      // const ref = db.collection("user").doc(`${users[socket.id]}`);
      // const user = await ref.get();
      // const userData = user.data();
      // io.sockets.emit("antaresdata", { timestamp, sensorDataObj });
      const userRef = db.collection("user");
      const snapshot = await userRef.where("deviceId", "==", splitReqData).get();
      console.log(`ini users atas ${JSON.stringify(users)}`);
      let socketId;
      if (snapshot.empty) {
        console.log("empty");
        return;
      } else {
        snapshot.docs.map(doc => {
          console.log(`ini users bawah ${JSON.stringify(users)}`);
          const userId = doc.data().userId;
          socketId = Object.keys(users).find(key => users[key] === userId);
        })
      }
      console.log(socketId);
      // console.log(`ini socket id ${socket.id}`);
      io.to(socketId).emit("antaresdata", { timestamp, sensorDataObj });
      // io.to.emit("privateid", socket.id);
      // io.to(socket.id).emit("privateid", socket.id);

      // io.to(socket.id).emit("antaresdata", { timestamp, sensorDataObj });
      console.log(JSON.stringify(sensorDataObj));
      res.send("ack");
    } catch (err) {
      console.log("First connect");
      console.log(err);
      res.send("ack");
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${users[socket.id]} disconnected`);
    delete users[socket.id];
  });
});

// console.log(`ini user ${JSON.stringify(users)}`);

server.listen(4000, () => {
  console.log("listen on port 4000");
});

app.use("/", router);
