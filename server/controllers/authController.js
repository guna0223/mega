const jwt = require("jsonwebtoken");

async function login(req, res) {
  try {
    const { email, password } = req.body;
    
    // Check against .env credentials
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error("ADMIN_EMAIL or ADMIN_PASSWORD not set in .env");
      return res.status(500).json({ message: "Server configuration error" });
    }

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { role: "admin", email: adminEmail },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, email: adminEmail });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { login };
