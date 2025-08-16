const AWS = require("aws-sdk");
const path = require("path");
const axios = require("axios");

// AWS config
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.REGIONS3,
});

const s3 = new AWS.S3();
const BUCKET_NAME = "whatsappchatapp"; // change if needed

// Upload binary buffer to S3
const uploadBinaryToS3 = async (buffer, originalName, folder = "uploads", mimetype = "application/octet-stream") => {
    console.log('originalName: ', originalName);
  const ext = path.extname(originalName) || "";
  console.log('ext: ', ext);
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
  console.log('filename: ', filename);

  await s3
    .putObject({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: buffer,
      ContentType: mimetype,
      ServerSideEncryption: "AES256",
    })
    .promise();

  return `https://${BUCKET_NAME}.s3.${process.env.REGIONS3}.amazonaws.com/${filename}`;
};

// Upload binary file from external URL
const uploadBinaryFromURLToS3 = async (fileURL, folder = "uploads") => {
  const response = await axios.get(fileURL, { responseType: "arraybuffer" });
  const buffer = Buffer.from(response.data);
  const contentType = response.headers["content-type"] || "application/octet-stream";
  const ext = path.extname(fileURL).split("?")[0] || "";

  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;

  await s3
    .putObject({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    })
    .promise();

  return `https://${BUCKET_NAME}.s3.${process.env.REGIONS3}.amazonaws.com/${filename}`;
};

module.exports = {
  s3,
  BUCKET_NAME,
  uploadBinaryToS3,
  uploadBinaryFromURLToS3,
};
