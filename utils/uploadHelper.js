

const path = require('path');


const AWS = require('aws-sdk');
const fs = require('fs');
const s3 = new AWS.S3({
  accessKeyId: process.env.AWSACCESSKEYID,
  secretAccessKey:process.env.AWSSECRETACCESSKEY ,
  region:'ap-south-1',
  signatureVersion: 'v4' 

});



async function uploadToS3(filePath, fileBuffer,mimetype ) {
  const params = {
    Bucket: "easygosms",
    Key: filePath,
    Body: fileBuffer,
    ContentType: mimetype
  };

  try {
    const data = await s3.upload(params).promise();
    return data;
  } catch (error) {
    throw error;
  }
}




// Configure Multer for file uploads


module.exports = { uploadToS3};