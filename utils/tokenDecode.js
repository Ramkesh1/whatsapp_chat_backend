const jwt = require("jsonwebtoken");
require("dotenv").config();

const decodeToken = (req) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
       
        if (!token) return null;
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
    
        return null;
    }
};

module.exports = decodeToken;
