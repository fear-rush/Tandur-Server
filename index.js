const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const app = express();
const server = require("http").createServer(app);
const axios = require("axios");
const cors = require("cors");

// const circularJSON = require('circular-json');
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
require('dotenv').config()

const io = require("socket.io")(server, {
  cors: {
    origin: "https://example.com",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Server Running");
});

app.get("/livedata", (req, res) => {
  axios.get(
      "https://platform.antares.id:8443/~/antares-cse/antares-id/Capstonetest/Loratest1?fu=1&ty=4&drt=1",
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
        liveData.slice(0, 3).map((urlData) => {
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
      res.send(historicdata);
    });
});


app.post("/subscribe", (req, res) => {
  try {
    const { ct: timestamp, con: sensorData } =
      req.body["m2m:sgn"]["m2m:nev"]["m2m:rep"]["m2m:cin"];
    const sensorDataObj = JSON.parse(sensorData);
    io.sockets.emit("antaresdata", { timestamp, sensorDataObj });
    io.sockets.emit("testdata", {timestamp, sensorDataObj});
    console.log(JSON.stringify(sensorDataObj));
    res.send("ack");
  } catch (err) {
    console.log("First connect");
    res.send("ack");
  }
});

io.on("connection", (socket) => {
  console.log("User Connected");
  axios
    .get(
      `https://platform.antares.id:8443/~/antares-cse/antares-id/Capstonetest/Loratest1/la`,
      {
        headers: {
          "Content-Type": "application/json;ty=4",
          Accept: "application/json",
          "X-M2M-ORIGIN": process.env.ANTARES_KEY,
        },
      }
    )
    .then((resp) => {
      const response = resp.data;
      const { ct: timestamp, con: sensorData } = response["m2m:cin"];
      const sensorDataObj = JSON.parse(sensorData);
      socket.emit("antaresdata", { timestamp, sensorDataObj });
    });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`listen on port ${PORT}`);
});

app.use("/", router);
