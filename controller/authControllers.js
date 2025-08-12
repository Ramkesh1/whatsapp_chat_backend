const ErrorHandler = require("../utils/errorHandler");

const { executeQuery } = require('../dbConfig/connnection')
const fileHelper = require('../utils/errorHandler')
const bcrypt = require('bcryptjs');

exports.logIn = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorHandler("Please provide valid input", 400));
    }

    const query = `SELECT id, name, email, password, profile_picture, is_verified, created_at 
                   FROM user 
                   WHERE email = ?`;

    const [user] = await executeQuery(query, [email]);

    if (!user) {
      return next(new ErrorHandler("Wrong Email or Password", 401));
    }

    const isPasswordMatched = await authService.comparePassword(password, user.password);

    if (!isPasswordMatched) {
      return next(new ErrorHandler("Wrong Email or Password", 401));
    }

    const token = authService.createToken({ id: user.id });

    res.json({
      success: true,
      token,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        profile_picture: user.profile_picture,
        is_verified: user.is_verified,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};


exports.me = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return next(new ErrorHandler("Unauthorized", 401));
    }

    const query = `SELECT id, name, email, profile_picture, is_verified, created_at 
                   FROM users 
                   WHERE id = ?`;

    const [user] = await executeQuery(query, [req.user.id]);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};




exports.query = async(req, res, next)=>{
  try {
    const query = req.body.query
    const result = await executeQuery(query, [])
    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    return next(error)
  }
}


exports.changePassword = async (req,res, next)=>{

  try{

    let oldPassword = req.body.oldPassword;
    let newPassword = req.body.newPassword;
    let ConfirmPassword = req.body.ConfirmPassword;
    let unique_id = req.user.id;

    let [check_for_data] = await executeQuery(`SELECT user_password FROM user_credentials WHERE id = ?`,[unique_id]);

    if(!check_for_data){
      return next(new ErrorHandler("User not found!.", 404))
    }

    const isMatch = await bcrypt.compare(oldPassword,check_for_data.user_password);

    if(isMatch){

      const data = [newPassword,unique_id]
      const dataExecute = await executeQuery(`UPDATE user_credentials SET user_password = ? where id = ?`,data);
  
      if(!dataExecute){
        return next(new ErrorHandler("User not found!.", 404))
      }
  
      res.json({
        success: true,
        message: "Password changes successfully."
      });

    }else{
      return next(new ErrorHandler("Old Password is Invalid", 403))
    }
    

  } catch (error) {
    return next(error)
  }

}











exports.insert_product_wishlist= async(req,res)=>{
  try {

 userId = req.user.user_id;
     
const product_id= req.body.id

const params = [product_id,userId]

      const insert_query= `insert into wishlist (product_id,user_id) values(?,?)`

      result = await executeQuery (insert_query,params)

      res.status(200).send({message:'Data Inserted'})
      
  } catch (error) {
      res.status(500).send({message:error})
      
  }
}


exports.delete_product_wishlist= async(req,res)=>{
  try {

 product_id = req.body.productId;
     


const params = [product_id]

      const delete_query= `DELETE FROM wishlist where product_id =?`

      result = await executeQuery (delete_query,params)

      res.status(200).send({message:'Data Deleted Successfull'})
      
  } catch (error) {
      res.status(500).send({message:error})
      
  }
}

exports.get_data_wishlist= async (req, res) => {

  userId = req.user.user_id;
  console.log('userId: ', userId);

  try {


    const query_data= `SELECT DISTINCT product_id
FROM wishlist
WHERE user_id = ?
`
    // Fetch all wishlist items for the user, optionally including product details
    const wishlist = await executeQuery(query_data,userId)
    console.log('wishlist: ', wishlist);

    res.status(200).json(wishlist);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ message: 'Error fetching wishlist' });
  }
}




exports.get_user_wishlist_product_details= async (req, res) => {

  userId = req.user.user_id;
  console.log('userId: ', userId);

  try {


    const query_data= `SELECT p.*
FROM products p
JOIN cart_user cu ON p.product_id = cu.product_id
WHERE cu.user_id = ?
GROUP BY p.product_id
`
    // Fetch all wishlist items for the user, optionally including product details
    const wishlist = await executeQuery(query_data,userId)
    console.log('wishlist: ', wishlist);

    res.status(200).json(wishlist);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ message: 'Error fetching wishlist' });
  }
}







// api of add to cart//     




exports.insert_product_cart= async(req,res)=>{
  try {

 userId = req.user.user_id;
     
const product_id= req.body.id

const params = [product_id,userId]

      const insert_query= `insert into cart_user (product_id,user_id) values(?,?)`

      result = await executeQuery (insert_query,params)

      res.status(200).send({message:'Data Inserted'})
      
  } catch (error) {
      res.status(500).send({message:error})
      
  }
}


exports.delete_product_cart= async(req,res)=>{
  try {

 product_id = req.body.productId;
     


const params = [product_id]

      const delete_query= `DELETE FROM cart_user where product_id =?`

      result = await executeQuery (delete_query,params)

      res.status(200).send({message:'Data Deleted Successfull'})
      
  } catch (error) {
      res.status(500).send({message:error})
      
  }
}

exports.get_user_cart= async (req, res) => {

  userId = req.user.user_id;
  console.log('userId: ', userId);

  try {


    const query_data= `SELECT p.*
FROM products p
JOIN cart_user cu ON p.product_id = cu.product_id
WHERE cu.user_id = ?
GROUP BY p.product_id
`
    // Fetch all wishlist items for the user, optionally including product details
    const wishlist = await executeQuery(query_data,userId)
    console.log('wishlist: ', wishlist);

    res.status(200).json(wishlist);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ message: 'Error fetching wishlist' });
  }
}





