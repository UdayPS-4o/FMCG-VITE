const fs = require("fs").promises;
const path = require("path");
const {redirect} = require("./utilities");

const middleware = (req, res, next) => {
  next();
  return;

    const token = req?.cookies?.token || "xs";
    if (!token) {
      res.redirect("/login");
      return;
    }
    if (token) {
      const filePath = path.join(__dirname, "..", "db", "users.json");
      fs.readFile(filePath, "utf8")
        .then((data) => {
          const dbData = JSON.parse(data);
          const user = dbData.find((entry) => entry.token === token);
          if (user) {
            req.user = user;
            next();
          } else {
            res
            .status(401)
            .clearCookie("token")
            .redirect("/login")
            .send("Unauthorized access" + redirect("/login", 1500));
          }
        })
        .catch((err) => {
          console.error(err);
          res.status(500).send("Failed to read user data");
        });
    } else {
      res.status(401).send("Unauthorized access");
    }

    // next();
    
}

module.exports = middleware;