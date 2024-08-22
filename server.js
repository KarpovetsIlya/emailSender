require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const emailRoutes = require("./routers/emailRoutes");

const app = express();

app.use(bodyParser.json());
app.use("/api/emails", emailRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сервер работает на порту ${PORT}`);
});
