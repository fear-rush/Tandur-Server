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

app.post("/subscribe", async (req, res) => {
  // let socketId;
  try {
    const { ct: timestamp, con: sensorData } =
      req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"];
    const sensorDataObj = JSON.parse(sensorData);
    const reqData = req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"]["pi"];
    const splitReqData = reqData.split("/")[2];
    const userRef = db.collection("user");
    const snapshot = await userRef.where("deviceId", "==", splitReqData).get();
    const result = snapshot.docs.map((doc) => {
      return doc.data().userId;
    });
    const socketId = Object.keys(users).find((key) =>
      users[key].includes(result)
    );

    io.to(socketId).emit("antaresdata", { timestamp, sensorDataObj });
    console.log(JSON.stringify(sensorDataObj));
    res.send("ack");
  } catch (err) {
    console.log("First connect");
    console.log(err);
    res.send("ack");
  }
});

app.get("/", async (req, res) => {
  res.send("Server Running");
});

app.post("/subscribe", async (req, res) => {
  try {
    const { ct: timestamp, con: sensorData } =
      req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"];
    const sensorDataObj = JSON.parse(sensorData);
    const reqData = req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"]["pi"];
    const splitReqData = reqData.split("/")[2];

    const snapshot = await userRef.where("deviceId", "==", splitReqData).get();
    let socketId;
    if (snapshot.empty) {
      console.log("empty");
      return;
    } else {
      snapshot.docs.map((doc) => {
        const userId = doc.data().userId;
        socketId = Object.keys(users).find((key) => users[key] === userId);
      });
    }

    io.to(socketId).emit("antaresdata", { timestamp, sensorDataObj });

    console.log(JSON.stringify(sensorDataObj));
    res.send("ack");
  } catch (err) {
    console.log("First connect");
    console.log(err);
    res.send("ack");
  }
});


io.on("connection", async (socket) => {
  console.log(`User Connected`);
  
  socket.on("login", async (userId) => {
    console.log("a user " + userId + " connected");
    users[socket.id] = userId;
    console.log(`Connected user ${JSON.stringify(users)}`);
    const ref = db.collection("user").doc(`${users[socket.id]}`);
    const user = await ref.get();
    const userData = user.data();
    let historicalArrayData = [];

    await axios
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
        antaresdata.map((el) => {
          historicalArrayData.push(el.data["m2m:cin"]);
        });
      });

    const sortedData = historicalArrayData.sort((a, b) => {
      if (a.ct < b.ct) {
        return -1;
      }
      if (a.ct > b.ct) {
        return 1;
      }
      return 0;
    });

    const groupByDate = sortedData.reduce((groups, sensorData) => {
      const date = sensorData.ct.split("T")[0];
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(sensorData);
      return groups;
    }, {});

    const historicalDataArrays = Object.keys(groupByDate).map((date) => {
      return {
        date: date,
        sensorData: groupByDate[date],
      };
    });


    io.to(socket.id).emit("historicaldata", historicalDataArrays);
  });

  socket.on("disconnect", () => {
    console.log(`User ${users[socket.id]} disconnected`);
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`listen on port ${PORT} `);
});

app.use("/", router);
