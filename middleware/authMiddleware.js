const jwt = require('jsonwebtoken');
const  mysecret  = "mywhatsappchattingapp"
const { executeQuery } = require('../dbConfig/connnection'); // Update path if needed
const ErrorHandler = require('../utils/errorHandler'); // Update path if needed

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return next(new ErrorHandler('Please provide a token', 401));
    }

    const tokenData = jwt.verify(token, mysecret);

    const query = 'SELECT id, name, email, avatar, is_online, created_at FROM users WHERE id = ?';
    const [user] = await executeQuery(query, [tokenData?.id]);

    if (user) {
      req.user = user;
      return next();
    } else {
      return next(new ErrorHandler('Unauthorized', 401));
    }

  } catch (error) {
    console.log('Auth Middleware Error:', error);
    return next(new ErrorHandler('Invalid or expired token', 401));
  }
};





module.exports = authMiddleware;


