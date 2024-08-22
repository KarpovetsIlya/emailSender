const express = require("express");
const router = express.Router();
const emailController = require("../controllers/emailController");

router.post("/send", emailController.sendEmails);
router.get("/sent/:userId", emailController.getSentEmails);
router.get("/hierarchy", emailController.getEmailHierarchy);

module.exports = router;
