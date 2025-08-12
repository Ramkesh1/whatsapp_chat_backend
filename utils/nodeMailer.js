const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.NodeMailerEMail,
    pass: process.env.NodeMailerPassword,
  },
});

const sendMail = async ({ to, subject, text }) => {
  await transporter.sendMail({
    from: `"Your App" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
};

module.exports = sendMail;
