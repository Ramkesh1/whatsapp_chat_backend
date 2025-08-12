
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY  ,
    region:process.env.REGIONS3
});

const s3 = new AWS.S3();

// S3 bucket name
const BUCKET_NAME = 'whatsappchatapp'; // Change this to your bucket name

// Helper function to get file type
const getFileType = (mimetype) => {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    return 'file';
};

// Multer S3 configuration
const uploadMulter = multer({
    storage: multerS3({
        s3: s3,
        bucket: BUCKET_NAME,
        metadata: function (req, file, cb) {
            cb(null, {
                fieldName: file.fieldname,
                userId: req.user?.id?.toString() || 'unknown',
                uploadTime: new Date().toISOString()
            });
        },
        key: function (req, file, cb) {
            const fileType = getFileType(file.mimetype);
            const userId = req.user?.id || 'unknown';
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 15);
            const fileExtension = path.extname(file.originalname);
            
            const fileName = `chat-files/${fileType}/${userId}/${timestamp}-${randomString}${fileExtension}`;
            cb(null, fileName);
        },
        contentType: multerS3.AUTO_CONTENT_TYPE,
        serverSideEncryption: 'AES256'
    }),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow all file types
        cb(null, true);
    }
});

// Helper functions
const uploadToS3 = (buffer, key, mimetype) => {
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        ServerSideEncryption: 'AES256'
    };
    
    return s3.upload(params).promise();
};

const deleteFromS3 = (key) => {
    const params = {
        Bucket: BUCKET_NAME,
        Key: key
    };
    
    return s3.deleteObject(params).promise();
};

const getSignedUrl = (key, expires = 3600) => {
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Expires: expires
    };
    
    return s3.getSignedUrl('getObject', params);
};

// Create bucket if it doesn't exist
const createBucketIfNotExists = async () => {
    try {
        await s3.headBucket({ Bucket: BUCKET_NAME }).promise();
        console.log(`Bucket ${BUCKET_NAME} exists`);
    } catch (error) {
        if (error.statusCode === 404) {
            try {
                await s3.createBucket({ Bucket: BUCKET_NAME }).promise();
                console.log(`Bucket ${BUCKET_NAME} created successfully`);
                
                // Set public read policy for the bucket
                const bucketPolicy = {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Sid: "PublicReadGetObject",
                            Effect: "Allow",
                            Principal: "*",
                            Action: "s3:GetObject",
                            Resource: `arn:aws:s3:::${BUCKET_NAME}/*`
                        }
                    ]
                };
                
                await s3.putBucketPolicy({
                    Bucket: BUCKET_NAME,
                    Policy: JSON.stringify(bucketPolicy)
                }).promise();
                
                console.log(`Public read policy applied to ${BUCKET_NAME}`);
            } catch (createError) {
                console.error('Error creating bucket:', createError);
            }
        } else {
            console.error('Error checking bucket:', error);
        }
    }
};

// Initialize bucket
createBucketIfNotExists();

module.exports = {
    s3,
    uploadMulter,
    uploadToS3,
    deleteFromS3,
    getSignedUrl,
    BUCKET_NAME,
    getFileType
};