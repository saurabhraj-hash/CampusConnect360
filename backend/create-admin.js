const readline = require("readline");
const bcrypt = require("bcryptjs");
const pool = require("./db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function createAdmin() {
  try {
    rl.question("Enter admin username: ", async (username) => {
      rl.question("Enter admin password: ", async (password) => {
        try {
          if (!username.trim() || password.length < 8) {
            console.log("Username required and password must be at least 8 characters.");
            return;
          }

          const passwordHash = await bcrypt.hash(password, 12);

          await pool.query(
            `INSERT INTO admins (username, password_hash)
             VALUES ($1, $2)`,
            [username.trim(), passwordHash]
          );

          console.log("Admin account created successfully!");
        } catch (error) {
          console.error("Error:", error.message);
        } finally {
          rl.close();
          await pool.end();
        }
      });
    });
  } catch (error) {
    console.error(error);
    rl.close();
    await pool.end();
  }
}

createAdmin();